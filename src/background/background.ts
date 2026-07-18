// src/background/background.ts
// ⚠️ NO PREACT OR DOM IMPORTS ALLOWED HERE

chrome.runtime.onInstalled.addListener(() => {
  console.log("ShadowStep Agent Background Worker Initialized securely.");
  
  // Defensive Context Menu Registration to avoid duplicate ID conflicts on reload
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "shadowstep-send",
      title: "Send to ShadowStep",
      contexts: ["selection"]
    });
  });
});

// Route Context Menu clicks to the active tab
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

// Wake up the extension when the user clicks the browser extension icon
chrome.action.onClicked.addListener((tab) => {
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'WAKE_UP_EXTENSION' }).catch((err) => {
      console.warn("ShadowStep wake ping dropped: Content script sleeping.", err.message);
    });
  }
});

// Message router for panels
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === 'OPEN_OPTIONS') {
    try {
      // NOTE: chrome.runtime.openOptionsPage does not take a callback parameters configuration 
      // in standard MV3 architectures. We evaluate runtime errors synchronously directly after invocation.
      chrome.runtime.openOptionsPage();
      
      if (chrome.runtime.lastError) {
        sendResponse({ status: 'Error', message: chrome.runtime.lastError.message });
      } else {
        sendResponse({ status: 'Success' });
      }
    } catch (err: any) {
      sendResponse({ status: 'Exception', message: err.message });
    }
    return true; // Keep response loop persistent for structural messaging channels
  }
  return false;
});