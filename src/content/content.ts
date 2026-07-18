/**
 * @file content.ts
 * @description Injected content script that mounts the ShadowStep UI and acts as the DOM Scanner & Action Engine.
 * 
 * @dependencies
 * - Preact (h, render) for UI mounting.
 * - ControlPanel component for the main interface.
 * - Chrome Runtime Messaging for receiving 'SCAN_VIEWPORT', 'EVOKE_CLICK', and 'INJECT_STATE' commands.
 * 
 * @state
 * - interactableMap: Maps numeric IDs to HTMLElement nodes for precise interaction.
 */
import { h, render } from 'preact';
import { ControlPanel } from '../components/ControlPanel';

const injectUI = () => {
  if (document.getElementById('shadowstep-root')) return;
  
  const rootContainer = document.createElement('div');
  rootContainer.id = 'shadowstep-root';
  
  rootContainer.style.position = 'fixed';
  rootContainer.style.zIndex = '2147483647';
  
  document.documentElement.appendChild(rootContainer);
  
  render(h(ControlPanel, null), rootContainer);
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectUI);
} else {
  injectUI();
}

let interactableMap = new Map<number, HTMLElement>();

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  
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
    return true; 
  }

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

  if (request.type === 'INJECT_STATE') {
    const target = interactableMap.get(request.id) as HTMLInputElement | HTMLTextAreaElement;
    if (target) {
      target.focus();
      target.value = request.value;
      
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
      
      sendResponse({ success: true, message: `Injected text into field ID ${request.id}` });
    } else {
      sendResponse({ success: false, message: `Input ID ${request.id} not found on screen.` });
    }
    return true;
  }
});