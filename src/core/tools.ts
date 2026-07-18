/**
 * @file tools.ts
 * @description Declares and implements the tool execution functions for the ShadowEngine.
 * Contains logic for viewport scanning, precise DOM interaction, complex editor state injection (Monaco, CodeMirror, ACE), and execution delays.
 * 
 * @dependencies
 * - Native DOM APIs (TreeWalker, MutationObserver, events).
 * - AgentTools: JSON Schema definitions passed to the LLM.
 * - ToolExecutors: The actual execution logic mapped to the schemas.
 */

export const AgentTools = [
  {
    type: "function",
    function: {
      name: "scan_viewport",
      description: "Scans the screen, assigning unique numeric IDs to all interactable elements. REQUIRED before clicking or typing.",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "read_page_content",
      description: "Reads the raw text of the current webpage to answer user questions. Do not use for navigation.",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "evoke_click",
      description: "Clicks a button or link on the page using its exact numeric target_id.",
      parameters: {
        type: "object",
        properties: { 
          target_id: { type: "number", description: "The exact numeric ID of the element." } 
        },
        required: ["target_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "inject_state",
      description: "Fills inputs, text areas, or checkboxes. Use the exact numeric target_id.",
      parameters: {
        type: "object",
        properties: {
          target_id: { type: "number", description: "The numeric ID of the input field." },
          value: { type: "string", description: "The text to inject, or 'true'/'false' for checkboxes." },
          press_enter: { type: "boolean", description: "Set to true to press Enter after typing to submit the form or send a chat message." }
        },
        required: ["target_id", "value"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "delay_execution",
      description: "Pauses execution for a specified number of milliseconds.",
      parameters: {
        type: "object",
        properties: { ms: { type: "number", description: "Milliseconds to wait (e.g., 2000 for 2 seconds)." } },
        required: ["ms"]
      }
    }
  }
];

export const ToolExecutors = {
  read_page_content: async (_args: any, log: (msg: string) => void) => {
    log(`[DOM] Extracting page document context for analysis...`);
    return document.body.innerText.substring(0, 8000);
  },

  scan_viewport: async (_args: any, log: (msg: string) => void) => {
    if (document.readyState !== 'complete') {
      log(`[SYS] Network payload active. Delaying grid matrix compilation...`);
      await new Promise(r => window.addEventListener('load', r, { once: true }));
    }

    log(`[DOM] Mapped viewport grid matrix status.`);
    
    let interactiveCount = 0;
    const elements = document.querySelectorAll('a, button, input, textarea, select, [role="button"], [role="textbox"], [contenteditable="true"]');
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    
    const visibleInteractives: string[] = [];

    elements.forEach((el, index) => {
      if (el.closest('#shadowstep-root')) return;

      const rect = el.getBoundingClientRect();
      if (rect.top >= -50 && rect.top <= viewportHeight + 50 && rect.height > 0 && rect.width > 0) {
        const numericId = index + 1; 
        el.setAttribute('data-ai-id', numericId.toString());
        
        const htmlEl = el as HTMLElement;
        const inputEl = el as HTMLInputElement;
        
        let text = htmlEl.innerText || inputEl.placeholder || inputEl.value || htmlEl.getAttribute('aria-label') || htmlEl.getAttribute('data-placeholder') || htmlEl.getAttribute('name') || htmlEl.getAttribute('type') || 'Element';
        
        if ((!text || text === 'radio' || text === 'checkbox' || text === 'on') && el.parentElement) {
            text = el.parentElement.innerText;
        }
        
        text = text.trim().replace(/\s+/g, ' ').substring(0, 65);
        
        visibleInteractives.push(`[ID: ${numericId}] Type: <${htmlEl.tagName.toLowerCase()}> | Label: "${text}"`);
        interactiveCount++;
      }
    });

    const compressedPageContext = document.body.innerText.replace(/\s+/g, ' ').substring(0, 1200);

    return JSON.stringify({
      status: `Viewport scanned securely. ${interactiveCount} interactive nodes mapped.`,
      visible_interactive_elements: visibleInteractives,
      page_context: compressedPageContext
    });
  },
  
  evoke_click: async (args: { target_id: number | string }, log: (msg: string) => void) => {
    const id = String(args.target_id);
    log(`[ACT] Calculating trajectory for target ID: ${id}...`);
    
    try {
      const el = document.querySelector(`[data-ai-id="${id}"]`) as HTMLElement;
      
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(r => setTimeout(r, 200)); 

        const clickEvent = new MouseEvent('click', { view: window, bubbles: true, cancelable: true, buttons: 1 });
        log(`[ACT] Dispatched MouseEvent. Locking engine thread for layout stabilization...`);
        el.dispatchEvent(clickEvent);
        
        await new Promise<void>((resolve) => {
          let lastMutationTime = Date.now();
          let checkCount = 0;
          
          const observer = new MutationObserver(() => { lastMutationTime = Date.now(); });
          observer.observe(document.body, { childList: true, subtree: true, attributes: true });

          const interval = setInterval(() => {
            const timeSinceLastMutation = Date.now() - lastMutationTime;
            checkCount++;
            if ((document.readyState === 'complete' && timeSinceLastMutation > 600) || checkCount > 25) {
              clearInterval(interval);
              observer.disconnect();
              resolve();
            }
          }, 200);
        });

        log(`[SYS] Environment verified stable. Frame layout painted completely.`);
        return `Action successful. Clicked element ID ${id}. IMPORTANT: The page state has safely transitioned. You MUST call scan_viewport again before taking further action.`;
      }
      
      log(`[ERR] Target ID ${id} outside current viewport mapping.`);
      return `CRITICAL ERROR: Failed to locate ID ${id}. DO NOT GUESS ID NUMBERS. Call scan_viewport immediately to map targets.`;
    } catch (e: any) {
      log(`[ERR] Trajectory processing exception: ${e.message}`);
      return `Error: ${e.message}`;
    }
  },

  inject_state: async (args: { target_id: number | string, value: string, press_enter?: boolean }, log: (msg: string) => void) => {
    const id = String(args.target_id);
    log(`[ACT] Calibrating injection vector for target ID: ${id}...`);
    
    const el = document.querySelector(`[data-ai-id="${id}"]`) as HTMLElement;
    
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await new Promise(r => setTimeout(r, 200));

      const tagName = el.tagName.toLowerCase();
      const type = (el as HTMLInputElement).type?.toLowerCase();
      
      try {
        if (tagName === 'input' && (type === 'checkbox' || type === 'radio')) {
          const inputEl = el as HTMLInputElement;
          const shouldCheck = String(args.value).toLowerCase() !== 'false';
          
          if (inputEl.checked !== shouldCheck) {
            inputEl.checked = shouldCheck;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new MouseEvent('click', { view: window, bubbles: true, cancelable: true, buttons: 1 }));
          }
          log(`[ACT] Form state bypassed: Toggle set to ${shouldCheck}.`);
          return `Successfully set toggle ID ${id} to ${shouldCheck}.`;
        }
        
        if (tagName === 'select') {
          const selectEl = el as HTMLSelectElement;
          selectEl.value = args.value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          log(`[ACT] Form state bypassed: Select option locked to "${args.value}".`);
          return `Successfully selected option "${args.value}" on dropdown ID ${id}.`;
        }
        
        if (tagName === 'textarea' || tagName === 'input' || el.isContentEditable) {
          const inputEl = el as HTMLInputElement | HTMLTextAreaElement;
          inputEl.focus();

          const payloadNode = document.createElement('textarea');
          payloadNode.id = 'shadowstep-payload-bridge';
          payloadNode.value = args.value;
          payloadNode.style.display = 'none';
          document.documentElement.appendChild(payloadNode);

          const editorBypassId = 'shadowstep_editor_' + Date.now();
          const script = document.createElement('script');
          script.textContent = `
            (function() {
              try {
                const payload = document.getElementById('shadowstep-payload-bridge').value;
                const targetEl = document.querySelector('[data-ai-id="${id}"]');
                let success = false;
                
                if (window.monaco && window.monaco.editor) {
                  const editors = window.monaco.editor.getEditors();
                  if (editors && editors.length > 0) {
                    editors.forEach(ed => ed.setValue(payload));
                    success = true;
                  } else {
                    const models = window.monaco.editor.getModels();
                    if (models && models.length > 0) {
                      models.forEach(model => model.setValue(payload));
                      success = true;
                    }
                  }
                } 
                
                if (!success && targetEl) {
                  let node = targetEl;
                  while (node && !success) {
                    const reactKey = Object.keys(node).find(k => k.startsWith('__reactFiber$'));
                    if (reactKey) {
                      let fiber = node[reactKey];
                      while (fiber) {
                        const stateNode = fiber.stateNode;
                        const props = fiber.memoizedProps;
                        
                        const monacoEditor = (stateNode && stateNode.editor) || (props && props.editor);
                        if (monacoEditor && typeof monacoEditor.setValue === 'function') {
                          monacoEditor.setValue(payload);
                          success = true; break;
                        }
                        
                        const cmView = (stateNode && stateNode.view) || (props && props.view);
                        if (cmView && typeof cmView.dispatch === 'function' && cmView.state) {
                          cmView.dispatch({changes: {from: 0, to: cmView.state.doc.length, insert: payload}});
                          success = true; break;
                        }
                        
                        const cm5 = (stateNode && stateNode.CodeMirror) || (props && props.CodeMirror);
                        if (cm5 && typeof cm5.setValue === 'function') {
                          cm5.setValue(payload);
                          success = true; break;
                        }
                        
                        fiber = fiber.return;
                      }
                    }
                    node = node.parentElement;
                  }
                }
                
                if (!success && window.CodeMirror) {
                  const cms = document.querySelectorAll('.CodeMirror');
                  if (cms.length > 0 && cms[0].CodeMirror) {
                    cms[0].CodeMirror.setValue(payload);
                    success = true;
                  }
                }
                if (!success && window.ace) {
                  const envs = document.querySelectorAll('.ace_editor');
                  if (envs.length > 0 && envs[0].env && envs[0].env.editor) {
                    envs[0].env.editor.setValue(payload, -1);
                    success = true;
                  }
                }
                
                if (success) document.documentElement.setAttribute('data-${editorBypassId}', 'true');
              } catch(e) {}
            })();
          `;
          
          document.documentElement.appendChild(script);
          script.remove();

          const bypassed = document.documentElement.hasAttribute(`data-${editorBypassId}`);
          document.documentElement.removeAttribute(`data-${editorBypassId}`);
          payloadNode.remove();

          if (bypassed) {
             log(`[ACT] Advanced Code Editor API locked. Code synced perfectly.`);
             return `Successfully typed code into the advanced editor ID ${id}. Existing code was COMPLETELY replaced.`;
          }

          log(`[WARN] Editor API bypass failed. Using native OS-level overwrite simulation.`);
          
          // Safeguard: Wiping safely. We highlight text without brutally setting innerText=''
          if (tagName === 'input' || tagName === 'textarea') {
              inputEl.select();
          } else if (el.isContentEditable) {
              const range = document.createRange();
              range.selectNodeContents(el);
              const sel = window.getSelection();
              if (sel) {
                  sel.removeAllRanges();
                  sel.addRange(range);
              }
          }
          
          el.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', keyCode: 65, which: 65, ctrlKey: true, bubbles: true, composed: true }));
          el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', code: 'Backspace', keyCode: 8, which: 8, bubbles: true, composed: true }));
          
          try { document.execCommand('delete', false); } catch (e) {}
          
          // Safeguard: ONLY clear value for standard inputs. NEVER do this on contenteditable (Gemini)
          if (tagName === 'input' || tagName === 'textarea') inputEl.value = '';
          
          const dt = new DataTransfer();
          dt.setData('text/plain', args.value);
          const pasteEvent = new ClipboardEvent('paste', { bubbles: true, cancelable: true, composed: true, clipboardData: dt });
          const intercepted = !el.dispatchEvent(pasteEvent);
          
          if (!intercepted) {
             let execSuccess = false;
             try { execSuccess = document.execCommand('insertText', false, args.value); } catch(e){}
             if (!execSuccess) {
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
                const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
                
                if (tagName === 'textarea' && nativeTextAreaValueSetter) {
                  nativeTextAreaValueSetter.call(el, args.value);
                } else if (tagName === 'input' && nativeInputValueSetter) {
                  nativeInputValueSetter.call(el, args.value);
                } else if (el.isContentEditable) {
                  el.textContent = args.value; // Last resort safe fallback
                }
             }
          }

          el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
          el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
          el.dispatchEvent(new Event('blur', { bubbles: true, composed: true }));
          
          if (args.press_enter) {
             log(`[ACT] Triggering Enter key to submit payload...`);
             el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, composed: true }));
             el.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, composed: true }));
             el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, composed: true }));
          }

          log(`[ACT] Form state bypassed and payload injected.`);
          return `Successfully typed into field ID ${id}.`;
        }
        
      } catch (err: any) {
        log(`[ERR] Payload injection rejected: ${err.message}`);
        return `Failed to inject state: ${err.message}`;
      }
    }
    
    log(`[ERR] Injection target invalid.`);
    return `Failed to find field with ID ${id}. DO NOT GUESS ID NUMBERS. Call scan_viewport first.`;
  },

  delay_execution: async (args: { ms: number }, log: (msg: string) => void) => {
    let targetMs = Number(args.ms) || 1000;
    if (targetMs > 10000) targetMs = 10000;

    const operationalSeconds = (targetMs / 1000).toFixed(1);
    log(`[SYS] Suspending engine for ${operationalSeconds}s to allow environment stabilization...`);
    
    await new Promise(resolve => setTimeout(resolve, targetMs));
    return `Successfully suspended thread execution for ${targetMs}ms.`;
  }
};