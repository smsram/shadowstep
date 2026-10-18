/**
 * @file engine.ts
 * @description Core ShadowEngine that manages state, LLM context windows, and API routing.
 * Provides the main execution loop for handling both Chat and Action modes.
 * 
 * Supported Providers & Models:
 * - Google Gemini: gemini-2.5-flash
 * - Groq: qwen/qwen3.8-27b
 * - Cloudflare Workers AI: @cf/qwen/qwen3.8-27b
 */
import { AgentTools, ToolExecutors } from './tools';

export type RouteSelection = 'auto' | 'gemini' | 'groq' | 'cloudflare';

export interface NodeCluster {
  name?: string;
  provider: 'Gemini' | 'Groq' | 'Cloudflare';
  key: string;
  accountId?: string;
}

export interface ScratchpadObservation {
  step: number;
  data: string;
}

export interface GroundingSource {
  title: string;
  url: string;
}

export type ExecutionTerminationState = 'COMPLETED' | 'STEP_LIMIT_REACHED' | 'ABORTED_OR_ERROR';

export class ShadowEngine {
  private allNodes: NodeCluster[];
  private messageHistory: any[] = [];
  private mode: 'chat' | 'action';
  private routeSelection: RouteSelection;
  private onNodeChange?: (provider: string, index: number) => void;
  private userName: string;
  private hasVisionContext: boolean = false;
  private taskScratchpad: ScratchpadObservation[] = [];
  private totalExecutionSteps: number = 0;
  private isWebSearchEnabled: boolean = false;
  private isLongHorizon: boolean = false;

  constructor(
    nodes: NodeCluster[],
    mode: 'chat' | 'action',
    routeSelection: RouteSelection = 'auto',
    onNodeChange?: (provider: string, index: number) => void,
    userName: string = 'Operator',
    existingHistory: any[] = []
  ) {
    this.allNodes = nodes;
    this.mode = mode;
    this.routeSelection = routeSelection;
    this.onNodeChange = onNodeChange;
    this.userName = userName;

    const sysPrompt = this.getSystemPrompt();

    if (existingHistory && existingHistory.length > 0) {
      this.messageHistory = [...existingHistory];
      this.messageHistory[0] = { role: 'system', content: sysPrompt };
    } else {
      this.messageHistory = [{ role: 'system', content: sysPrompt }];
    }
  }

  public getScratchpad(): ScratchpadObservation[] {
    return [...this.taskScratchpad];
  }

  public clearScratchpad(): void {
    this.taskScratchpad = [];
    this.totalExecutionSteps = 0;
  }

  public getTotalSteps(): number {
    return this.totalExecutionSteps;
  }

  public recordObservation(text: string): void {
    const clean = text.trim();
    if (!clean) return;
    if (this.taskScratchpad.some(item => item.data === clean)) return;
    this.taskScratchpad.push({
      step: this.totalExecutionSteps || 1,
      data: clean
    });
  }

  public formatScratchpadContext(): string {
    if (this.taskScratchpad.length === 0) return '';
    return `[INTERMEDIATE OBSERVATIONS MEMORY]:\n${this.taskScratchpad.map(item => `- ${item.data}`).join('\n')}\n(Use these preserved facts to synthesize your final response when completing the task).\n\n`;
  }

  public setRouteSelection(route: RouteSelection): void {
    this.routeSelection = route;
  }

  public hasGeminiKey(): boolean {
    return this.allNodes.some(n => n.provider === 'Gemini' && !!n.key && n.key.trim().length > 0);
  }

  public setWebSearchEnabled(enabled: boolean): void {
    this.isWebSearchEnabled = enabled;
    if (this.messageHistory.length > 0 && this.messageHistory[0]?.role === 'system') {
      this.messageHistory[0].content = this.getSystemPrompt();
    }
  }

  public setLongHorizon(enabled: boolean): void {
    this.isLongHorizon = enabled;
  }

  public setHasVisionContext(hasVision: boolean): void {
    this.hasVisionContext = hasVision;
    if (this.messageHistory.length > 0) {
      this.messageHistory[0] = { role: 'system', content: this.getSystemPrompt() };
    }
  }

  private getSystemPrompt(): string {
    // Task 1.1, Task 1.2, & Task 2: Strict gating directive for Web Search Grounding
    const searchDirective = (this.isWebSearchEnabled && this.hasGeminiKey())
      ? `\n\nSEARCH GROUNDING DIRECTIVE:\nYou have access to Google Search grounding. Use web search selectively and strictly when needed. First, inspect the current page context and your base knowledge. If the answer is present on the page or in your established knowledge, answer directly WITHOUT searching. If the user prompt requires current external facts, live data, or details absent from the current webpage, invoke web search for that specific topic. Do NOT search for unrelated concepts or perform broad speculative queries.`
      : '';

    const chatPrompt = `You are ShadowStep, an advanced multimodal AI browser assistant. The operator you are assisting is named ${this.userName}.
CRITICAL INSTRUCTIONS:
1. You are attached to a live webpage. If ${this.userName} asks a question (e.g. "explain this problem", "what is this", "summarize"), you must analyze the attached page context, document text, and visual images.
2. If multimodal images or viewport crops are provided, analyze both the visual layout and text elements thoroughly.
3. Keep answers clear, highly accurate, and formatted with clean Markdown.${searchDirective}`;

    const visionContextAction = this.hasVisionContext
      ? `\n7. VISUAL COORDINATES & DOM MAPPING: When visual screenshots or viewport sub-region crops are provided, carefully examine the visual layout and coordinates alongside the mapped DOM nodes from 'scan_viewport'. Correlate what you see visually with the numeric [ID: X] from the DOM scan to resolve the exact target ID before dispatching any click or input actions.`
      : '';

    const actionPrompt = `You are ShadowStep, an autonomous browser companion assisting ${this.userName}.

CRITICAL BEHAVIOR MATRIX:
1. ZERO HALLUCINATION: You MUST call 'scan_viewport' FIRST to map the screen.
2. NUMERIC IDs ONLY: Never guess labels or pass strings to actions. You MUST use the exact numeric [ID: X].
3. FORMS & INPUTS: Use 'inject_state' with the exact numeric target_id.
4. BUTTONS & LINKS: Use 'evoke_click' with the exact numeric target_id.
5. SELECTIVE SCRATCHPAD MEMORY ([OBSERVE]):
   Use '[OBSERVE] <data_to_remember>' (or the record_observation tool) to permanently commit intermediate findings, milestones, or requested target items to your memory buffer across multi-step browser tasks:
   - DO NOT use [OBSERVE] for routine navigation (e.g., clicking inputs, opening dropdowns, scrolling, focusing buttons).
   - DO use [OBSERVE] right before navigating away, clearing search fields, switching filter chips, or leaving a view that contains requested target data.
   - DO use [OBSERVE] to mark intermediate milestones (e.g., "[OBSERVE] Found GPT models: gpt-4o, gpt-4-turbo").
   - If no permanent data needs to be remembered at the current step, proceed directly with the DOM action.
   - The loop will NOT terminate on an observation. The engine permanently records it into your scratchpad buffer and injects it into every subsequent step.
6. HOW TO STOP & AGGREGATE: Once the user's objective is fully complete, you MUST STOP calling tools. Output a final, standard text response summarizing your success. You must aggregate findings recorded across all previous steps rather than only describing the currently visible DOM state.${visionContextAction}${searchDirective}
`;

    return this.mode === 'chat' ? chatPrompt : actionPrompt;
  }

  public getHistory(): any[] {
    return this.messageHistory;
  }

  public setHistory(history: any[]): void {
    this.messageHistory = history;
  }

  private pruneContextMemory(): void {
    // Task 3.4: Context Window Management
    // In Long Execution Mode, prevent token crashes by pruning older raw DOM trees
    // while preserving the user objective, the current DOM snapshot, and all accumulated taskScratchpad entries.
    const maxMemory = this.isLongHorizon ? 50 : 26;

    // 1. Archive older viewport DOM scans and full page reads (keep only the newest snapshot)
    let seenRecentDom = false;
    for (let i = this.messageHistory.length - 1; i >= 0; i--) {
      const msg = this.messageHistory[i];
      if (msg.role === 'tool' && (msg.name === 'scan_viewport' || msg.name === 'read_page_content')) {
        if (!seenRecentDom) {
          seenRecentDom = true; // Keep the most recent DOM snapshot intact
        } else if (typeof msg.content === 'string' && msg.content.length > 80) {
          msg.content = `{"status": "Archived old DOM snapshot to save context tokens. Current snapshot active."}`;
        }
      }
    }

    // 2. Prune older message turns if exceeding maxMemory, keeping system prompt and initial user goal
    if (this.messageHistory.length > maxMemory) {
      const systemPrompt = this.messageHistory[0];
      const initialUserGoal = this.messageHistory[1];
      
      const targetTailCount = maxMemory - 2;
      let startIndex = Math.max(2, this.messageHistory.length - targetTailCount);
      
      // Ensure we don't start slicing in the middle of tool_calls/tool responses to avoid API schema errors
      while (startIndex < this.messageHistory.length && this.messageHistory[startIndex]?.role === 'tool') {
        startIndex++;
      }

      const recentHistory = this.messageHistory.slice(startIndex);
      this.messageHistory = [systemPrompt, initialUserGoal, ...recentHistory];
    }
  }

  private getEndpointConfig(node: NodeCluster): { url: string; model: string; headers: Record<string, string> } {
    if (node.provider === 'Gemini') {
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions?key=${encodeURIComponent(node.key)}`,
        model: 'gemini-2.5-flash',
        headers: {
          'Authorization': `Bearer ${node.key}`,
          'Content-Type': 'application/json'
        }
      };
    } else if (node.provider === 'Groq') {
      return {
        url: 'https://api.groq.com/openai/v1/chat/completions',
        model: 'qwen/qwen3.8-27b',
        headers: {
          'Authorization': `Bearer ${node.key}`,
          'Content-Type': 'application/json'
        }
      };
    } else {
      // Cloudflare Workers AI
      return {
        url: `https://api.cloudflare.com/client/v4/accounts/${node.accountId?.trim() || ''}/ai/run/@cf/qwen/qwen3.8-27b`,
        model: '@cf/qwen/qwen3.8-27b',
        headers: {
          'Authorization': `Bearer ${node.key}`,
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        }
      };
    }
  }

  private convertHistoryToGeminiContents(history: any[]): { role: string; parts: any[] }[] {
    const geminiContents: { role: string; parts: any[] }[] = [];

    for (const msg of history) {
      if (msg.role === 'system') continue;

      const role = msg.role === 'assistant' ? 'model' : 'user';
      const parts: any[] = [];

      if (typeof msg.content === 'string') {
        if (msg.content.trim()) {
          parts.push({ text: msg.content });
        }
      } else if (Array.isArray(msg.content)) {
        for (const item of msg.content) {
          if (item.type === 'text' && item.text) {
            parts.push({ text: item.text });
          } else if (item.type === 'image_url' && item.image_url?.url) {
            const url: string = item.image_url.url;
            const match = url.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              parts.push({
                inlineData: {
                  mimeType: match[1],
                  data: match[2]
                }
              });
            }
          }
        }
      }

      if (parts.length > 0) {
        geminiContents.push({ role, parts });
      }
    }

    if (geminiContents.length === 0) {
      geminiContents.push({ role: 'user', parts: [{ text: 'Continue execution.' }] });
    }

    return geminiContents;
  }

  private performBackgroundGrounding(
    prompt: string,
    pageContext: string,
    geminiKeys: string[]
  ): Promise<{ success: boolean; searchNeeded?: boolean; text?: string; sources?: GroundingSource[]; error?: string }> {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
        resolve({ success: false, error: 'Extension runtime unavailable' });
        return;
      }
      chrome.runtime.sendMessage(
        { type: 'GEMINI_SEARCH_GROUNDING', prompt, pageContext, geminiKeys },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(response || { success: false, error: 'Empty response from background' });
          }
        }
      );
    });
  }

  private async streamCloudflareViaBackground(
    req: { url: string; headers: Record<string, string>; body: any },
    onChunk: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        return reject(new Error('Aborted by operator'));
      }

      let port: chrome.runtime.Port | null = null;
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime?.connect) {
          port = chrome.runtime.connect({ name: 'CLOUDFLARE_STREAM_PORT' });
        }
      } catch {
        port = null;
      }

      if (!port) {
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage(
            { type: 'CLOUDFLARE_API_REQUEST', url: req.url, headers: req.headers, body: req.body },
            (response) => {
              if (response?.success) {
                onChunk(response.text || '');
                resolve();
              } else {
                reject(new Error(response?.error || 'Cloudflare background fetch failed'));
              }
            }
          );
          return;
        }

        fetch(req.url, {
          method: 'POST',
          headers: req.headers,
          body: JSON.stringify(req.body),
          signal
        })
          .then(async (res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const text = await res.text();
            onChunk(text);
            resolve();
          })
          .catch(reject);
        return;
      }

      const onAbort = () => {
        try {
          port?.disconnect();
        } catch {}
        reject(new Error('Aborted by operator'));
      };

      signal?.addEventListener('abort', onAbort, { once: true });

      port.onMessage.addListener((msg: any) => {
        if (msg.type === 'CHUNK') {
          onChunk(msg.chunk);
        } else if (msg.type === 'DONE') {
          signal?.removeEventListener('abort', onAbort);
          try {
            port?.disconnect();
          } catch {}
          resolve();
        } else if (msg.type === 'ERROR') {
          signal?.removeEventListener('abort', onAbort);
          try {
            port?.disconnect();
          } catch {}
          reject(new Error(msg.error || 'Cloudflare stream failed'));
        }
      });

      port.onDisconnect.addListener(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      });

      port.postMessage({
        url: req.url,
        headers: req.headers,
        body: req.body
      });
    });
  }

  public async execute(
    userPrompt: string,
    callbacks: {
      onLog: (msg: string) => void;
      onMessage: (msg: string) => void;
      onFinish: (state: ExecutionTerminationState) => void;
      onSources?: (sources: GroundingSource[]) => void;
    },
    signal?: AbortSignal,
    images: string[] = [],
    isContinuation: boolean = false
  ): Promise<void> {
    if (!isContinuation) {
      this.clearScratchpad();
    }

    // Task 1.5 & Task 3.1: Read dynamic toggle state from storage on submit to avoid stale values
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      try {
        const stored = await chrome.storage.local.get(['isWebSearchEnabled', 'webSearchEnabled', 'useLongHorizonAgent']);
        if (typeof stored.isWebSearchEnabled === 'boolean') {
          this.isWebSearchEnabled = stored.isWebSearchEnabled;
        } else if (typeof stored.webSearchEnabled === 'boolean') {
          this.isWebSearchEnabled = stored.webSearchEnabled;
        }
        if (typeof stored.useLongHorizonAgent === 'boolean') {
          this.isLongHorizon = stored.useLongHorizonAgent;
        }
      } catch {}
    }

    if (images.length > 0) {
      this.setHasVisionContext(true);
    }

    let augmentedPrompt = userPrompt;
    if (this.mode === 'action' && this.taskScratchpad.length > 0 && isContinuation) {
      augmentedPrompt = `${this.formatScratchpadContext()}${userPrompt}`;
    }

    const geminiNodes = this.allNodes.filter(n => n.provider === 'Gemini' && !!n.key && n.key.trim().length > 0);
    const groqNodes = this.allNodes.filter(n => n.provider === 'Groq');
    const cfNodes = this.allNodes.filter(n => n.provider === 'Cloudflare' && n.accountId);

    // Task 1 & Task 3 Route B: Intelligent On-Demand Grounding for non-Gemini providers (Groq / Cloudflare)
    const isTargetNonGemini = this.routeSelection === 'groq' || this.routeSelection === 'cloudflare' || (this.routeSelection === 'auto' && geminiNodes.length === 0);
    const isSearchGated = this.isWebSearchEnabled && this.hasGeminiKey();

    if (isSearchGated && isTargetNonGemini && !isContinuation) {
      if (geminiNodes.length === 0) {
        callbacks.onLog("[SYS] Web search unavailable, proceeding with standard knowledge.");
      } else {
        const pageText = typeof document !== 'undefined' ? (document.body ? document.body.innerText.substring(0, 4000) : '') : '';
        try {
          const grounding = await this.performBackgroundGrounding(userPrompt, pageText, geminiNodes.map(n => n.key));
          if (grounding && grounding.success && grounding.searchNeeded && grounding.text && grounding.sources && grounding.sources.length > 0) {
            callbacks.onLog(`[SYS] Grounded via Google Search (${grounding.sources.length} verified sources).`);
            callbacks.onSources?.(grounding.sources);
            augmentedPrompt = `[REAL-TIME WEB DATA]:\n${grounding.text}\n\nAnswer the user request using this context.\n\n${augmentedPrompt}`;
          }
        } catch {
          callbacks.onLog("[SYS] Web search unavailable, proceeding with standard knowledge.");
        }
      }
    }

    let promptContent: any;
    if (images.length > 0) {
      promptContent = [
        { type: 'text', text: augmentedPrompt },
        ...images.map(img => ({
          type: 'image_url',
          image_url: { url: img }
        }))
      ];
    } else {
      promptContent = augmentedPrompt;
    }

    this.messageHistory.push({ role: 'user', content: promptContent });

    let isProcessing = true;
    let executionCycles = 0;
    const isLongHorizon = this.isLongHorizon || userPrompt.includes('LONG-HORIZON') || this.messageHistory.some(m => {
      if (typeof m.content === 'string') return m.content.includes('LONG-HORIZON');
      if (Array.isArray(m.content)) return m.content.some((p: any) => p?.type === 'text' && p.text?.includes('LONG-HORIZON'));
      return false;
    });
    // Task 3.1: Dynamic Step Ceiling - allow up to 100 continuous steps in Long Execution Mode
    const MAX_CYCLES = isLongHorizon ? 100 : 25;
    let hasSentTokens = false;
    let terminationState: ExecutionTerminationState = 'COMPLETED';

    const activeTools = this.mode === 'chat'
      ? AgentTools
      : AgentTools.filter(t => t.function.name !== 'read_page_content');

    const providerGroups: { provider: 'Gemini' | 'Groq' | 'Cloudflare'; nodes: NodeCluster[] }[] = [];

    if (this.routeSelection === 'gemini') {
      if (geminiNodes.length > 0) providerGroups.push({ provider: 'Gemini', nodes: geminiNodes });
    } else if (this.routeSelection === 'groq') {
      if (groqNodes.length > 0) providerGroups.push({ provider: 'Groq', nodes: groqNodes });
    } else if (this.routeSelection === 'cloudflare') {
      if (cfNodes.length > 0) providerGroups.push({ provider: 'Cloudflare', nodes: cfNodes });
    } else {
      if (geminiNodes.length > 0) providerGroups.push({ provider: 'Gemini', nodes: geminiNodes });
      if (groqNodes.length > 0) providerGroups.push({ provider: 'Groq', nodes: groqNodes });
      if (cfNodes.length > 0) providerGroups.push({ provider: 'Cloudflare', nodes: cfNodes });
    }

    if (providerGroups.length === 0) {
      callbacks.onLog(`[FATAL] No API credentials found for selected route (${this.routeSelection}).`);
      callbacks.onMessage(`Error: No valid API keys configured for ${this.routeSelection.toUpperCase()}. Please configure your keys in Settings.`);
      callbacks.onFinish('ABORTED_OR_ERROR');
      return;
    }

    let activeGroupIndex = 0;
    let activeKeyIndex = 0;

    while (isProcessing && executionCycles < MAX_CYCLES) {
      if (signal?.aborted) {
        callbacks.onLog(`[WARN] Process cancelled by operator.`);
        terminationState = 'ABORTED_OR_ERROR';
        isProcessing = false;
        break;
      }

      this.totalExecutionSteps++;
      this.pruneContextMemory();

      const group = providerGroups[activeGroupIndex];
      const activeNode = group.nodes[activeKeyIndex];
      const config = this.getEndpointConfig(activeNode);

      try {
        if (!hasSentTokens && executionCycles === 0) {
          const routePrefix = this.routeSelection === 'auto' ? `Auto-Route: ${activeNode.provider}` : activeNode.provider;
          callbacks.onLog(`[SYS] Processing via ${routePrefix} (${config.model})...`);
        }

        let completeText = '';
        let toolCallsBuffer: any[] = [];
        let discoveredSources: GroundingSource[] = [];
        let requestBody: any;

        if (activeNode.provider === 'Cloudflare') {
          requestBody = {
            messages: this.messageHistory,
            stream: true,
            temperature: this.mode === 'chat' ? 0.7 : 0.1
          };
          if (images.length > 0) {
            requestBody.image = images[0];
            requestBody.images = images;
          }
          if (activeTools && activeTools.length > 0) {
            requestBody.tools = activeTools;
          }
        } else {
          requestBody = {
            model: config.model,
            messages: this.messageHistory,
            temperature: this.mode === 'chat' ? 0.7 : 0.1,
            stream: true
          };
          if (activeTools && activeTools.length > 0) {
            requestBody.tools = activeTools;
            requestBody.tool_choice = 'auto';
          }
        }

        const handleChunk = (chunkStr: string) => {
          const lines = chunkStr.split('\n');
          for (const line of lines) {
            const cleanLine = line.trim().replace(/^data:\s*/, '');
            if (!cleanLine || cleanLine === '[DONE]') continue;

            try {
              const parsed = JSON.parse(cleanLine);
              if (parsed.choices && parsed.choices.length > 0) {
                const choice = parsed.choices[0];
                if (choice.delta?.content) {
                  hasSentTokens = true;
                  completeText += choice.delta.content;
                  callbacks.onMessage(completeText);
                }
                if (choice.delta?.tool_calls) {
                  for (const tc of choice.delta.tool_calls) {
                    if (!toolCallsBuffer[tc.index]) {
                      toolCallsBuffer[tc.index] = {
                        id: tc.id || '',
                        type: 'function',
                        function: { name: '', arguments: '' }
                      };
                    }
                    if (tc.id) toolCallsBuffer[tc.index].id = tc.id;
                    if (tc.function?.name) toolCallsBuffer[tc.index].function.name += tc.function.name;
                    if (tc.function?.arguments) toolCallsBuffer[tc.index].function.arguments += tc.function.arguments;
                  }
                }
              } else if (parsed.candidates && parsed.candidates.length > 0) {
                // Native Gemini SSE chunk parsing with groundingMetadata
                const candidate = parsed.candidates[0];
                if (candidate.content?.parts) {
                  for (const part of candidate.content.parts) {
                    if (part.text) {
                      hasSentTokens = true;
                      completeText += part.text;
                      callbacks.onMessage(completeText);
                    }
                  }
                }
                if (candidate.groundingMetadata?.groundingChunks) {
                  for (const chunk of candidate.groundingMetadata.groundingChunks) {
                    if (chunk.web?.uri) {
                      discoveredSources.push({
                        title: chunk.web.title || chunk.web.uri,
                        url: chunk.web.uri
                      });
                    }
                  }
                  if (discoveredSources.length > 0) {
                    const seen = new Set<string>();
                    const unique = discoveredSources.filter(s => seen.has(s.url) ? false : seen.add(s.url));
                    callbacks.onSources?.(unique);
                  }
                }
              } else if (typeof parsed.response === 'string') {
                hasSentTokens = true;
                completeText += parsed.response;
                callbacks.onMessage(completeText);
              } else if (parsed.result?.response) {
                hasSentTokens = true;
                completeText += parsed.result.response;
                callbacks.onMessage(completeText);
              }
            } catch {}
          }
        };

        if (activeNode.provider === 'Cloudflare') {
          await this.streamCloudflareViaBackground(
            { url: config.url, headers: config.headers, body: requestBody },
            handleChunk,
            signal
          );
        } else if (activeNode.provider === 'Gemini' && this.isWebSearchEnabled && this.hasGeminiKey()) {
          // Task 3 Route A: Native Google Search Grounding for Gemini
          let response: Response;
          try {
            const nativeGroundedUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${encodeURIComponent(activeNode.key)}`;
            const nativePayload = {
              contents: this.convertHistoryToGeminiContents(this.messageHistory),
              systemInstruction: {
                parts: [{ text: this.getSystemPrompt() }]
              },
              tools: [{ googleSearch: {} }],
              generationConfig: {
                temperature: this.mode === 'chat' ? 0.7 : 0.1
              }
            };

            response = await fetch(nativeGroundedUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(nativePayload),
              signal
            });

            if (response.status === 429) {
              throw new Error(`HTTP 429 Rate limit on Gemini key (${activeNode.key.substring(0, 8)}...)`);
            }

            if (!response.ok) {
              // Task 3.2: Silent degradation on grounding failure
              callbacks.onLog("[SYS] Web search unavailable, proceeding with standard knowledge.");
              response = await fetch(config.url, {
                method: 'POST',
                headers: config.headers,
                body: JSON.stringify(requestBody),
                signal
              });
            }
          } catch (err: any) {
            if (err.message?.includes('429')) {
              throw err;
            }
            // Silent degradation: fallback prompt without search tool payload
            callbacks.onLog("[SYS] Web search unavailable, proceeding with standard knowledge.");
            response = await fetch(config.url, {
              method: 'POST',
              headers: config.headers,
              body: JSON.stringify(requestBody),
              signal
            });
          }

          if (!response.ok) {
            let errText = `HTTP ${response.status}`;
            try {
              const errJson = await response.json();
              errText += `: ${errJson?.error?.message || errJson?.errors?.[0]?.message || JSON.stringify(errJson)}`;
            } catch {
              const errBody = await response.text();
              if (errBody) errText += `: ${errBody}`;
            }
            throw new Error(errText);
          }

          const reader = response.body?.getReader();
          const decoder = new TextDecoder('utf-8');
          if (!reader) throw new Error('Stream reader activation failed.');

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            handleChunk(decoder.decode(value, { stream: true }));
          }

          if (discoveredSources.length > 0) {
            const seen = new Set<string>();
            const unique = discoveredSources.filter(s => seen.has(s.url) ? false : seen.add(s.url));
            callbacks.onSources?.(unique);
          }
        } else {
          const response = await fetch(config.url, {
            method: 'POST',
            headers: config.headers,
            body: JSON.stringify(requestBody),
            signal
          });

          if (!response.ok) {
            let errText = `HTTP ${response.status}`;
            try {
              const errJson = await response.json();
              errText += `: ${errJson?.error?.message || errJson?.errors?.[0]?.message || JSON.stringify(errJson)}`;
            } catch {
              const errBody = await response.text();
              if (errBody) errText += `: ${errBody}`;
            }
            throw new Error(errText);
          }

          const reader = response.body?.getReader();
          const decoder = new TextDecoder('utf-8');
          if (!reader) throw new Error('Stream reader activation failed.');

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            handleChunk(decoder.decode(value, { stream: true }));
          }
        }

        let cleanToolCalls = toolCallsBuffer.filter(Boolean);

        // Fallback markdown tool parsing
        if (cleanToolCalls.length === 0 && this.mode === 'action' && completeText) {
          const jsonToolMatch = completeText.match(/```(?:json)?\s*(\{\s*"name":\s*"[\w_]+",[\s\S]*?\})\s*```/);
          if (jsonToolMatch) {
            try {
              const parsed = JSON.parse(jsonToolMatch[1]);
              if (parsed.name && parsed.arguments) {
                cleanToolCalls = [{
                  id: `tc_${Date.now()}`,
                  type: 'function',
                  function: { name: parsed.name, arguments: JSON.stringify(parsed.arguments) }
                }];
              }
            } catch {}
          }
        }

        // Selective Scratchpad Parsing
        if (this.mode === 'action' && completeText) {
          const observeRegex = /\[OBSERVE\]\s*([^\n\r]+)/gi;
          let obsMatch: RegExpExecArray | null;
          while ((obsMatch = observeRegex.exec(completeText)) !== null) {
            const obsText = obsMatch[1]?.trim();
            if (obsText) {
              this.recordObservation(obsText);
              callbacks.onLog(`[OBSERVE] ${obsText}`);
            }
          }
        }

        if (cleanToolCalls.length > 0) {
          this.messageHistory.push({
            role: 'assistant',
            content: completeText || null,
            tool_calls: cleanToolCalls
          });

          for (const toolCall of cleanToolCalls) {
            if (signal?.aborted) break;
            const funcName = toolCall.function.name as keyof typeof ToolExecutors;
            let funcArgs: any = {};
            try {
              funcArgs = JSON.parse(toolCall.function.arguments || '{}');
            } catch {
              funcArgs = {};
            }

            if (funcName === 'record_observation' && funcArgs?.data) {
              this.recordObservation(funcArgs.data);
            }

            if (ToolExecutors[funcName]) {
              const toolResult = await ToolExecutors[funcName](funcArgs, callbacks.onLog);
              this.messageHistory.push({
                tool_call_id: toolCall.id,
                role: 'tool',
                name: funcName,
                content: toolResult
              });

              if (toolResult.includes('Error:') || toolResult.includes('Failed to') || toolResult.includes('CRITICAL ERROR:')) {
                callbacks.onLog(`[WARN] Action notice: ${toolResult.substring(0, 80)}`);
              }
            } else {
              callbacks.onLog(`[WARN] Unrecognized action: ${funcName}`);
              this.messageHistory.push({
                tool_call_id: toolCall.id,
                role: 'tool',
                name: funcName,
                content: `Error: Tool '${funcName}' is not defined.`
              });
            }
          }

          if (signal?.aborted) {
            isProcessing = false;
            terminationState = 'ABORTED_OR_ERROR';
            break;
          }

          this.messageHistory.push({
            role: 'user',
            content: `${this.formatScratchpadContext()}Tool execution complete. If the objective is fully met, DO NOT call any more tools. Output [DONE] <summary> aggregating all intermediate observations. Otherwise, execute the next required tool or record observations.`
          });

          executionCycles++;
          continue;
        }

        // Task 3.2: Prevent False Halts on State Transitions
        // Continue the execution loop automatically unless the model emits an explicit completion signal ([DONE])
        // or the user manually clicks the stop button
        if (this.mode === 'action' && !completeText.includes('[DONE]')) {
          this.messageHistory.push({ role: 'assistant', content: completeText });
          this.messageHistory.push({
            role: 'user',
            content: `${this.formatScratchpadContext()}Next action step required. If the overall objective is fully accomplished, emit [DONE] <summary> aggregating all intermediate observations. Otherwise, call the next required tool or record observations to continue progressing the task.`
          });
          executionCycles++;
          continue;
        }

        if (completeText) {
          this.messageHistory.push({ role: 'assistant', content: completeText });
          isProcessing = false;
          terminationState = 'COMPLETED';
        }
        break;

      } catch (err: any) {
        if (err.name === 'AbortError' || signal?.aborted) {
          callbacks.onLog(`[WARN] Disconnected by operator.`);
          terminationState = 'ABORTED_OR_ERROR';
          isProcessing = false;
          break;
        }

        callbacks.onLog(`[WARN] ${activeNode.provider} credential failure (${err.message}).`);

        if (this.routeSelection !== 'auto') {
          activeKeyIndex++;
          if (activeKeyIndex < group.nodes.length) {
            const nextNode = group.nodes[activeKeyIndex];
            const accHint = nextNode.accountId ? ` [Account: ${nextNode.accountId.substring(0, 8)}...]` : '';
            callbacks.onLog(`[SYS] Advancing to next ${activeNode.provider} credential pair (${activeKeyIndex + 1}/${group.nodes.length})${accHint}...`);
            if (this.onNodeChange) this.onNodeChange(activeNode.provider, activeKeyIndex);
            continue;
          } else {
            callbacks.onLog(`[FATAL] All credentials for ${activeNode.provider} exhausted.`);
            callbacks.onMessage(`Error on ${activeNode.provider}: ${err.message}. All configured credential pairs for ${activeNode.provider} were attempted.`);
            isProcessing = false;
            terminationState = 'ABORTED_OR_ERROR';
            break;
          }
        } else {
          activeKeyIndex++;
          if (activeKeyIndex < group.nodes.length) {
            const nextNode = group.nodes[activeKeyIndex];
            const accHint = nextNode.accountId ? ` [Account: ${nextNode.accountId.substring(0, 8)}...]` : '';
            callbacks.onLog(`[SYS] Advancing to next ${activeNode.provider} credential pair (${activeKeyIndex + 1}/${group.nodes.length})${accHint}...`);
            continue;
          } else {
            activeKeyIndex = 0;
            activeGroupIndex++;
            if (activeGroupIndex < providerGroups.length) {
              const nextProvider = providerGroups[activeGroupIndex].provider;
              callbacks.onLog(`[SYS] Credentials exhausted on ${activeNode.provider}. Auto-falling back to ${nextProvider}...`);
              continue;
            } else {
              callbacks.onLog(`[FATAL] All available AI platform routing loops exhausted.`);
              callbacks.onMessage(`All configured AI providers (Gemini, Groq, Cloudflare) returned connectivity faults. Last error: ${err.message}`);
              isProcessing = false;
              terminationState = 'ABORTED_OR_ERROR';
              break;
            }
          }
        }
      }
    }

    if (isProcessing && executionCycles >= MAX_CYCLES) {
      terminationState = 'STEP_LIMIT_REACHED';
      callbacks.onLog(`[WARN] Maximum cycle limits reached (step ${this.totalExecutionSteps}). Pausing execution.`);
      const obsCount = this.taskScratchpad.length;
      const obsNotice = obsCount > 0 ? ` (${obsCount} intermediate observations preserved in memory)` : '';
      callbacks.onMessage(`Execution paused to prevent infinite loops${obsNotice}. If the task is incomplete, click 'Proceed with Task' below to continue.`);
    }

    callbacks.onFinish(terminationState);
  }
}