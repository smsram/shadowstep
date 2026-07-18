/**
 * @file content.ts
 * @description Injected content script that mounts the ShadowStep UI inside an isolated Shadow DOM
 * to prevent host website styles from bleeding into the companion interface.
 * 
 * @dependencies
 * - Preact (h, render) for UI mounting.
 * - ControlPanel component for the main interface.
 * - Chrome Runtime Messaging for receiving viewport analysis and programmatic interaction dispatches.
 * 
 * @state
 * - interactableMap: Maps numeric IDs to HTMLElement nodes for precise DOM interaction loops.
 */
import { h, render } from 'preact';
import { ControlPanel } from '../components/ControlPanel';

const injectUI = () => {
  if (document.getElementById('shadowstep-root')) return;
  
  // 1. Create the host container element on the host document
  const hostContainer = document.createElement('div');
  hostContainer.id = 'shadowstep-root';
  
  hostContainer.style.position = 'fixed';
  hostContainer.style.zIndex = '2147483647';
  hostContainer.style.top = '0';
  hostContainer.style.right = '0';
  
  document.documentElement.appendChild(hostContainer);
  
  // 2. Attach a closed/open Shadow Root to fully isolate the styles
  const shadowRoot = hostContainer.attachShadow({ mode: 'open' });
  
  // 3. Create an internal wrapper inside the shadow boundary for mounting Preact
  const innerUiWrapper = document.createElement('div');
  innerUiWrapper.id = 'shadowstep-isolated-container';
  
  // Apply foundational isolation baselines directly inside the shadow container
  innerUiWrapper.style.all = 'initial'; // Reset any inheritances completely
  innerUiWrapper.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  innerUiWrapper.style.display = 'block';
  
  shadowRoot.appendChild(innerUiWrapper);
  
  // 4. Render the companion layout inside the isolated shadow root container
  render(h(ControlPanel, null), innerUiWrapper);
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