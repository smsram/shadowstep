/**
 * @file background.ts
 * @description Background service worker for ShadowStep.
 * Handles lifecycle events, context menu registration, extension wake pings, and message routing.
 * 
 * @dependencies
 * - Chrome Extension API (chrome.runtime, chrome.contextMenus, chrome.action, chrome.tabs).
 */
// NO PREACT OR DOM IMPORTS ALLOWED HERE

chrome.runtime.onInstalled.addListener(() => {
  console.log("ShadowStep Agent Background Worker Initialized securely.");
  
  // Set default theme to 'dark' on fresh installations
  chrome.storage.local.get(['theme'], (result) => {
    if (!result.theme) {
      chrome.storage.local.set({ theme: 'dark' });
    }
  });

  // Defensive Context Menu Registration to avoid duplicate ID conflicts on reload
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "shadowstep-send",
      title: "Send to ShadowStep",
      contexts: ["selection"]
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "shadowstep-send" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { 
      type: 'INJECT_SELECTION', 
      text: info.selectionText 
    }).catch((err) => {
      console.warn("ShadowStep context message dropped: Active tab content script not injected.", err.message);
    });
  }
});

chrome.action.onClicked.addListener((tab) => {
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'WAKE_UP_EXTENSION' }).catch((err) => {
      console.warn("ShadowStep wake ping dropped: Content script sleeping.", err.message);
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'OPEN_OPTIONS') {
    try {
      chrome.runtime.openOptionsPage();
      if (chrome.runtime.lastError) {
        sendResponse({ status: 'Error', message: chrome.runtime.lastError.message });
      } else {
        sendResponse({ status: 'Success' });
      }
    } catch (err: any) {
      sendResponse({ status: 'Exception', message: err.message });
    }
    return true;
  }

  if (request.type === 'CAPTURE_VISIBLE_TAB') {
    const handleCapture = (dataUrl?: string) => {
      if (chrome.runtime.lastError || !dataUrl) {
        sendResponse({ success: false, error: chrome.runtime.lastError?.message || 'Failed to capture visible tab' });
      } else {
        sendResponse({ success: true, dataUrl });
      }
    };

    if (typeof sender.tab?.windowId === 'number') {
      chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' }, handleCapture);
    } else {
      chrome.tabs.captureVisibleTab({ format: 'png' }, handleCapture);
    }
    return true; // Keep message channel open for async response
  }

  if (request.type === 'FETCH_IMAGE_BASE64') {
    fetch(request.url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          sendResponse({ success: true, dataUrl: reader.result });
        };
        reader.onerror = () => {
          sendResponse({ success: false, error: 'Failed to read image blob' });
        };
        reader.readAsDataURL(blob);
      })
      .catch((err) => {
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  // Task 1.3: Fix Cloudflare CORS via background service worker fetch
  if (request.type === 'CLOUDFLARE_API_REQUEST') {
    fetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(request.body)
    })
      .then(async (res) => {
        if (!res.ok) {
          let errDetail = `HTTP ${res.status}`;
          try {
            const errJson = await res.json();
            errDetail += `: ${errJson?.errors?.[0]?.message || errJson?.error?.message || JSON.stringify(errJson)}`;
          } catch {
            const errText = await res.text();
            if (errText) errDetail += `: ${errText}`;
          }
          sendResponse({ success: false, error: errDetail });
          return;
        }
        const text = await res.text();
        sendResponse({ success: true, text });
      })
      .catch((err) => {
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  // Task 3.1: Preliminary Google Search Grounding for non-Gemini providers via Background Worker
  if (request.type === 'GEMINI_SEARCH_GROUNDING') {
    const handleGrounding = async () => {
      let keys: string[] = Array.isArray(request.geminiKeys) && request.geminiKeys.length > 0 
        ? request.geminiKeys 
        : [];

      if (keys.length === 0) {
        const stored = await chrome.storage.local.get(['geminiKeys']);
        keys = Array.isArray(stored.geminiKeys) ? (stored.geminiKeys as string[]) : [];
      }

      if (keys.length === 0) {
        return { success: false, error: 'No Gemini API keys configured' };
      }

      let lastError = 'Grounding request failed';

      // Task 1.1: Cycle through available keys automatically on HTTP 429 rate limits or faults
      for (let i = 0; i < keys.length; i++) {
        const apiKey = keys[i];
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
          
          const userContentParts: { text: string }[] = [];
          if (request.pageContext && typeof request.pageContext === 'string' && request.pageContext.trim()) {
            userContentParts.push({
              text: `[ACTIVE WEBPAGE CONTEXT]:\n${request.pageContext.trim().substring(0, 4000)}\n[END WEBPAGE CONTEXT]\n\n`
            });
          }
          userContentParts.push({ text: `[USER QUERY]: ${request.prompt}` });

          const payload = {
            contents: [
              {
                role: 'user',
                parts: userContentParts
              }
            ],
            systemInstruction: {
              parts: [{
                text: `You are an intelligent on-demand web search grounding evaluator and retrieval engine for ShadowStep.
EVALUATION & GROUNDING RULES:
1. FIRST, inspect the provided [ACTIVE WEBPAGE CONTEXT] and your general training knowledge.
2. If the user query can be answered using the webpage context, active DOM content, or general timeless training knowledge (e.g. general code, basic math, concepts already explained on the page), DO NOT search the web. Respond strictly with: [NO_SEARCH_NEEDED]
3. Execute web search ONLY IF:
   - The user explicitly asks for external, live, or real-time information (e.g. live crypto/stock prices, breaking news, weather, current event statuses).
   - The question is directly related to the user's intent, but the current active page content does NOT contain the necessary facts or answers.
4. PREVENT UNRELATED SEARCHES:
   - When searching, invoke googleSearch strictly for the specific topic requested.
   - Do NOT search for unrelated concepts, speculative topics, or broad queries.
5. If search is executed, provide a concise, factual summary of the latest verified findings.`
              }]
            },
            tools: [
              {
                googleSearch: {}
              }
            ],
            generationConfig: {
              temperature: 0.1
            }
          };

          // Task 1.3: Debug log in the background service worker
          console.log("[ShadowStep Search] Outbound tools payload:", JSON.stringify(payload.tools));

          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (res.status === 429) {
            lastError = `HTTP 429 Rate limit on Gemini key ${i + 1}/${keys.length}`;
            console.warn(`[ShadowStep Background] ${lastError}, cycling to next key...`);
            continue;
          }

          if (!res.ok) {
            const errBody = await res.text();
            lastError = `HTTP ${res.status}: ${errBody}`;
            console.warn(`[ShadowStep Background] Gemini grounding failure on key ${i + 1}: ${lastError}`);
            continue;
          }

          const data = await res.json();
          const candidate = data.candidates?.[0];
          const text = candidate?.content?.parts?.map((p: any) => p.text).join('') || '';
          const metadata = candidate?.groundingMetadata;

          // Task 1.3: If answer was present in context or base knowledge, model emits [NO_SEARCH_NEEDED] or no grounding queries
          const isNoSearchNeeded = text.includes('[NO_SEARCH_NEEDED]') || !metadata?.groundingChunks || metadata.groundingChunks.length === 0;

          if (isNoSearchNeeded) {
            return {
              success: true,
              searchNeeded: false,
              text: '',
              sources: []
            };
          }

          const sources: { title: string; url: string }[] = [];
          const seenUrls = new Set<string>();

          if (metadata?.groundingChunks) {
            for (const chunk of metadata.groundingChunks) {
              if (chunk.web?.uri && !seenUrls.has(chunk.web.uri)) {
                seenUrls.add(chunk.web.uri);
                sources.push({
                  title: chunk.web.title || chunk.web.uri,
                  url: chunk.web.uri
                });
              }
            }
          }

          return {
            success: true,
            searchNeeded: true,
            text,
            sources,
            webSearchQueries: metadata?.webSearchQueries || []
          };
        } catch (err: any) {
          lastError = err.message || 'Network exception during grounding';
          console.warn(`[ShadowStep Background] Grounding exception on key ${i + 1}:`, err);
        }
      }

      return { success: false, error: lastError };
    };

    handleGrounding()
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ success: false, error: err.message }));

    return true; // Keep message channel open for async response
  }

  return false;
});

// Port connection for Cloudflare and Gemini SSE streaming from background worker
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'CLOUDFLARE_STREAM_PORT' || port.name === 'GEMINI_STREAM_PORT') {
    port.onMessage.addListener(async (msg) => {
      try {
        if (msg.body?.tools) {
          console.log("[ShadowStep Search] Outbound tools payload:", JSON.stringify(msg.body.tools));
        }
        const response = await fetch(msg.url, {
          method: 'POST',
          headers: msg.headers,
          body: JSON.stringify(msg.body)
        });

        if (!response.ok) {
          let errDetail = `HTTP ${response.status}`;
          try {
            const errJson = await response.json();
            errDetail += `: ${errJson?.errors?.[0]?.message || errJson?.error?.message || JSON.stringify(errJson)}`;
          } catch {
            const errText = await response.text();
            if (errText) errDetail += `: ${errText}`;
          }
          port.postMessage({ type: 'ERROR', error: errDetail });
          return;
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder('utf-8');
        if (!reader) {
          port.postMessage({ type: 'ERROR', error: 'No stream reader available from background fetch' });
          return;
        }

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          port.postMessage({ type: 'CHUNK', chunk });
        }
        port.postMessage({ type: 'DONE' });
      } catch (err: any) {
        port.postMessage({ type: 'ERROR', error: err.message || 'Background worker fetch exception' });
      }
    });
  }
});