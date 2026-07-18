/**
 * @file engine.ts
 * @description Core ShadowEngine that manages state, LLM context windows, and API routing.
 * Provides the main execution loop for handling both Chat and Action modes.
 * 
 * @dependencies
 * - NodeCluster models for Groq/Cerebras endpoints.
 * - AgentTools and ToolExecutors from tools.ts.
 * 
 * @interfaces
 * - NodeCluster: Represents an AI provider endpoint.
 * - ShadowEngine: The class orchestrating prompt engineering, API calls, tool dispatches, and memory compression.
 */
import { AgentTools, ToolExecutors } from './tools';

export interface NodeCluster {
  provider: 'Groq' | 'Cerebras';
  key: string;
}

export class ShadowEngine {
  private nodes: NodeCluster[];
  private messageHistory: any[] = [];
  private mode: 'chat' | 'action';
  
  private activeNodeIndex: number;
  private onNodeChange?: (newIndex: number) => void;
  private userName: string;

  constructor(
    nodes: NodeCluster[], 
    mode: 'chat' | 'action', 
    startIndex: number = 0,
    onNodeChange?: (newIndex: number) => void,
    userName: string = "Operator",
    existingHistory: any[] = []
  ) {
    this.nodes = nodes;
    this.mode = mode;
    this.activeNodeIndex = (startIndex >= 0 && startIndex < nodes.length) ? startIndex : 0;
    this.onNodeChange = onNodeChange;
    this.userName = userName;

    const sysPrompt = this.getSystemPrompt();

    if (existingHistory && existingHistory.length > 0) {
      this.messageHistory = [...existingHistory];
      this.messageHistory[0] = { role: "system", content: sysPrompt };
    } else {
      this.messageHistory = [{ role: "system", content: sysPrompt }];
    }
  }

  private getSystemPrompt() {
    const chatPrompt = `You are ShadowStep, an advanced AI browser assistant. The operator you are assisting is named ${this.userName}. 
CRITICAL INSTRUCTIONS:
1. You are attached to a live webpage. If ${this.userName} asks a vague question (e.g. "explain this problem", "what is this", "summarize"), you MUST ASSUME they are talking about the webpage and call the 'read_page_content' tool to fetch it before answering.
2. The message history represents your ongoing session context. Do not confuse old chat messages with the actual webpage content.
3. Keep answers clear, highly accurate, and formatted with clean Markdown.`;

    const actionPrompt = `You are ShadowStep, an autonomous browser companion assisting ${this.userName}.
CRITICAL BEHAVIOR MATRIX:
1. ZERO HALLUCINATION: You MUST call 'scan_viewport' FIRST to map the screen.
2. NUMERIC IDs ONLY: Never guess labels or pass strings to actions. You MUST use the exact numeric [ID: X].
3. FORMS & INPUTS: Use 'inject_state' with the exact numeric target_id.
4. BUTTONS & LINKS: Use 'evoke_click' with the exact numeric target_id.
5. HOW TO STOP: Once the user's objective is fully complete, you MUST STOP calling tools. Output a final, standard text response summarizing your success. Do not repeat actions.`;

    return this.mode === 'chat' ? chatPrompt : actionPrompt;
  }

  public getHistory() {
    return this.messageHistory;
  }

  private pruneContextMemory() {
    const MAX_MEMORY = 24; 
    if (this.messageHistory.length > MAX_MEMORY) {
      const systemPrompt = this.messageHistory[0];
      const initialUserPrompt = this.messageHistory[1]; 
      const recentHistory = this.messageHistory.slice(-(MAX_MEMORY - 2));
      this.messageHistory = [systemPrompt, initialUserPrompt, ...recentHistory];
    }

    let scanCount = 0;
    for (let i = this.messageHistory.length - 1; i >= 0; i--) {
      const msg = this.messageHistory[i];
      if (msg.role === 'tool' && msg.name === 'scan_viewport') {
        scanCount++;
        if (scanCount > 1 && typeof msg.content === 'string' && msg.content.length > 100) {
          msg.content = `{"status": "Archived old viewport data to save memory."}`;
        }
      }
    }
  }

  private getEndpointConfig(node: NodeCluster) {
    if (node.provider === 'Groq') {
      return { 
        url: 'https://api.groq.com/openai/v1/chat/completions', 
        model: 'llama-3.3-70b-versatile' 
      };
    } else {
      return { 
        url: 'https://api.cerebras.ai/v1/chat/completions', 
        model: 'zai-glm-4.7' 
      };
    }
  }

  private cycleNode() {
    this.activeNodeIndex = (this.activeNodeIndex + 1) % this.nodes.length;
    if (this.onNodeChange) {
      this.onNodeChange(this.activeNodeIndex);
    }
  }

  public async execute(
    userPrompt: string, 
    callbacks: { onLog: (msg: string) => void, onMessage: (msg: string) => void, onFinish: () => void },
    signal?: AbortSignal
  ): Promise<void> {
    
    this.messageHistory.push({ role: "user", content: userPrompt });
    
    let consecutiveFailures = 0;
    let isProcessing = true;
    let executionCycles = 0;
    
    const isLongHorizon = userPrompt.includes('LONG-HORIZON');
    const MAX_CYCLES = isLongHorizon ? 100 : 15; 
    
    let hasSentTokens = false;

    // Fixed ternary operator structure here
    const activeTools = this.mode === 'chat' 
      ? AgentTools 
      : AgentTools.filter(t => t.function.name !== 'read_page_content');

    while (isProcessing && executionCycles < MAX_CYCLES) {
      if (signal?.aborted) {
        callbacks.onLog(`[WARN] Process cancelled by operator.`);
        break;
      }

      if (consecutiveFailures >= this.nodes.length) {
        callbacks.onLog(`[FATAL] Infrastructure loop exhausted.`);
        callbacks.onMessage("Error: All available API clusters returned connectivity faults. Please check your credentials in the Control Hub.");
        break;
      }

      this.pruneContextMemory();
      const activeNode = this.nodes[this.activeNodeIndex];
      const config = this.getEndpointConfig(activeNode);
      
      try {
        if (!hasSentTokens) {
          if (executionCycles === 0 && consecutiveFailures === 0) {
            callbacks.onLog(`[SYS] Processing via ${activeNode.provider}...`);
          } else if (consecutiveFailures > 0) {
            callbacks.onLog(`[SYS] Re-routing to ${activeNode.provider}...`);
          }
        }
        
        const requestBody: any = {
          model: config.model,
          messages: this.messageHistory,
          temperature: this.mode === 'chat' ? 0.7 : 0.1,
          stream: true
        };

        if (activeTools && activeTools.length > 0) {
          requestBody.tools = activeTools;
          requestBody.tool_choice = "auto";
        }
        
        const response = await fetch(config.url, {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${activeNode.key}`, 
            'Content-Type': 'application/json' 
          },
          body: JSON.stringify(requestBody),
          signal
        });

        if (!response.ok) {
          callbacks.onLog(`[WARN] ${activeNode.provider} connection failed (HTTP ${response.status}).`);
          this.cycleNode();
          consecutiveFailures++;
          continue; 
        }

        consecutiveFailures = 0;

        const reader = response.body?.getReader();
        const decoder = new TextDecoder("utf-8");
        let completeText = "";
        let toolCallsBuffer: any[] = [];

        if (!reader) throw new Error("Stream reader activation failed.");

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            const cleanLine = line.trim().replace(/^data:\s*/, "");
            if (!cleanLine || cleanLine === "[DONE]") continue;

            try {
              const parsed = JSON.parse(cleanLine);
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
                      id: tc.id || "", 
                      type: "function", 
                      function: { name: "", arguments: "" } 
                    };
                  }
                  if (tc.id) toolCallsBuffer[tc.index].id = tc.id;
                  if (tc.function?.name) toolCallsBuffer[tc.index].function.name += tc.function.name;
                  if (tc.function?.arguments) toolCallsBuffer[tc.index].function.arguments += tc.function.arguments;
                }
              }
            } catch {
            }
          }
        }

        const cleanToolCalls = toolCallsBuffer.filter(Boolean);
        if (cleanToolCalls.length > 0) {
          this.messageHistory.push({ 
            role: "assistant", 
            content: completeText || null, 
            tool_calls: cleanToolCalls 
          });

          for (const toolCall of cleanToolCalls) {
            if (signal?.aborted) break;
            const funcName = toolCall.function.name as keyof typeof ToolExecutors;
            const funcArgs = JSON.parse(toolCall.function.arguments || "{}");
            
            const toolResult = await ToolExecutors[funcName](funcArgs, callbacks.onLog);
            
            this.messageHistory.push({
              tool_call_id: toolCall.id,
              role: "tool",
              name: funcName,
              content: toolResult
            });

            if (toolResult.includes("Error:") || toolResult.includes("Failed to") || toolResult.includes("CRITICAL ERROR:")) {
              callbacks.onLog(`[ERR] Execution interrupted during step workflow.`);
              isProcessing = false;
              break;
            }
          }
          
          if (!isProcessing) {
            this.cycleNode();
            break; 
          }
          
          this.messageHistory.push({ 
            role: "user", 
            content: "Tool execution complete. If the objective is fully met, DO NOT call any more tools. Output your final summary text now. Otherwise, execute the next required tool." 
          });
          
          executionCycles++;
          continue;
        }

        if (completeText) {
          this.messageHistory.push({ role: "assistant", content: completeText });
          isProcessing = false;
          this.cycleNode(); 
        }
        break;

      } catch (error: any) {
        if (error.name === 'AbortError') {
          callbacks.onLog(`[WARN] Disconnected.`);
          break;
        }
        if (!hasSentTokens) {
          callbacks.onLog(`[FATAL] ${activeNode.provider} Node Exception: ${error.message}`);
        }
        this.cycleNode();
        consecutiveFailures++;
      }
    }
    
    if (isProcessing && executionCycles >= MAX_CYCLES) {
      callbacks.onLog(`[WARN] Maximum cycle limits reached. Pausing execution.`);
      callbacks.onMessage("Execution paused to prevent infinite loops. If the task is incomplete, click 'Proceed with Task' below to continue.");
    }

    callbacks.onFinish();
  }
}