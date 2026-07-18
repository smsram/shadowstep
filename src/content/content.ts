// src/content/content.ts
import { h, render } from 'preact';
import { ControlPanel } from '../components/ControlPanel';

// ==========================================
// 1. MOUNT THE SHADOWSTEP UI
// ==========================================
const injectUI = () => {
  // Prevent duplicate injections
  if (document.getElementById('shadowstep-root')) return;
  
  const rootContainer = document.createElement('div');
  rootContainer.id = 'shadowstep-root';
  
  // Ensure the UI sits on top of all website elements
  rootContainer.style.position = 'fixed';
  rootContainer.style.zIndex = '2147483647';
  
  // Attach to HTML documentElement to avoid body manipulation conflicts
  document.documentElement.appendChild(rootContainer);
  
  render(h(ControlPanel, null), rootContainer);
};

// Run injection safely when the document is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectUI);
} else {
  injectUI();
}

// ==========================================
// 2. DOM SCANNER & ACTION ENGINE
// ==========================================
let interactableMap = new Map<number, HTMLElement>();

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  
  // SCAN THE SCREEN FOR BUTTONS AND FORMS
  if (request.type === 'SCAN_VIEWPORT') {
    interactableMap.clear();
    let idCounter = 1;
    
    const elements = document.querySelectorAll('a, button, input, textarea, select, [role="button"]');
    const viewData: string[] = [];
    
    elements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= window.innerHeight) {
        const htmlEl = el as HTMLElement;
        interactableMap.set(idCounter, htmlEl);
        
        const tag = htmlEl.tagName.toLowerCase();
        let label = htmlEl.innerText || htmlEl.getAttribute('aria-label') || htmlEl.getAttribute('placeholder') || htmlEl.getAttribute('name') || htmlEl.getAttribute('type') || 'Element';
        label = label.trim().replace(/\n/g, ' ').substring(0, 40);
        
        viewData.push(`[ID: ${idCounter}] Type: <${tag}> | Label: "${label}"`);
        idCounter++;
      }
    });
    
    sendResponse({ data: viewData.length > 0 ? viewData.join('\n') : 'No interactive elements visible on screen.' });
    return true; // Keep message channel open for async response
  }

  // CLICK AN ELEMENT BY NUMERIC ID
  if (request.type === 'EVOKE_CLICK') {
    const target = interactableMap.get(request.id);
    if (target) {
      target.click();
      sendResponse({ success: true, message: `Clicked element ID ${request.id}` });
    } else {
      sendResponse({ success: false, message: `Element ID ${request.id} not found on screen.` });
    }
    return true;
  }

  // FILL A FORM FIELD BY NUMERIC ID
  if (request.type === 'INJECT_STATE') {
    const target = interactableMap.get(request.id) as HTMLInputElement | HTMLTextAreaElement;
    if (target) {
      target.focus();
      target.value = request.value;
      
      // Dispatch events so React/Next.js frameworks register the keystrokes
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
      
      sendResponse({ success: true, message: `Injected text into field ID ${request.id}` });
    } else {
      sendResponse({ success: false, message: `Input ID ${request.id} not found on screen.` });
    }
    return true;
  }
});