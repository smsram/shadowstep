/**
 * @file ControlPanel.tsx
 * @description The main sidebar UI for ShadowStep, acting as the primary orchestrator between the user, the ShadowEngine, and the DOM.
 * 
 * @dependencies
 * - Preact Hooks (useState, useEffect, useRef) for complex state mapping and lifecycle management.
 * - ShadowEngine for prompt execution and tool dispatching.
 * - HistoryManager for session logging and caching.
 * 
 * @interfaces
 * - StorageResult: Defines the shape of chrome.storage configuration data.
 * - ChatMessage: Represents an individual message block in the chat stream.
 */
import { useState, useEffect, useRef } from 'preact/hooks';
import { ShadowEngine } from '../core/engine';
import { FloatingMenu } from './FloatingMenu';
import { SelectionOverlay } from './SelectionOverlay';
import { HistoryManager } from '../core/history';
import type { ChatThread } from '../core/history';

interface StorageResult {
  groqKeys?: string[];
  cerebrasKeys?: string[];
  userName?: string;
  activeNodeIndex?: number;
  shadowstepDisabled?: boolean;
  panelSide?: 'left' | 'right';
  snapPos?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
  logs: string[];
  status: 'idle' | 'working' | 'done' | 'aborted';
}

const renderMarkdown = (text: string) => {
  if (!text) return null;

  const codeBlocks: string[] = [];
  let html = text.replace(/```([\s\S]*?)```/g, (_, code) => { 
    codeBlocks.push(code);
    return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
  });

  const inlineCodes: string[] = [];
  html = html.replace(/`([^`]+)`/g, (_, code) => { 
    inlineCodes.push(code);
    return `__INLINE_CODE_${inlineCodes.length - 1}__`;
  });

  html = html.replace(/((?:^[ \t]*\|.*\|[ \t]*\n?)+)/gm, (match) => {
    const lines = match.trim().split('\n');
    if (lines.length < 2 || !lines[1].includes('---')) return match; 

    const header = lines[0];
    const rows = lines.slice(2);

    const renderRow = (rowText: string, isHeader: boolean) => {
      let clean = rowText.trim();
      if (clean.startsWith('|')) clean = clean.slice(1);
      if (clean.endsWith('|')) clean = clean.slice(0, -1);
      const cells = clean.split('|');
      const tag = isHeader ? 'th' : 'td';
      const style = isHeader 
        ? 'padding: 10px 14px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.04); font-weight: 600; white-space: nowrap;' 
        : 'padding: 10px 14px; border: 1px solid rgba(255,255,255,0.08); word-break: break-word; vertical-align: top; min-width: 120px;';
      return `<tr>${cells.map(c => `<${tag} style="${style}">${c.trim()}</${tag}>`).join('')}</tr>`;
    };

    return `<div style="overflow-x: auto; margin: 18px 0; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08); background: rgba(0,0,0,0.15);">
      <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; line-height: 1.5;">
        <thead>${renderRow(header, true)}</thead>
        <tbody>${rows.map(r => renderRow(r, false)).join('')}</tbody>
      </table>
    </div>`;
  });

  html = html.replace(/^[\s]*[-*_]{3,}[\s]*$/gm, '<hr style="border: none; border-top: 1px solid rgba(255,255,255,0.15); margin: 24px 0;" />');

  html = html
    .replace(/^### (.*?)(?=\n|$)/gm, '<h3 style="color:#FFF; fontSize:16px; fontWeight:600; margin:22px 0 8px 0; letter-spacing:-0.2px;">$1</h3>')
    .replace(/^## (.*?)(?=\n|$)/gm, '<h2 style="color:#FFF; fontSize:18px; fontWeight:600; margin:26px 0 10px 0; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:6px; letter-spacing:-0.3px;">$1</h2>')
    .replace(/^# (.*?)(?=\n|$)/gm, '<h1 style="color:#FFF; fontSize:22px; fontWeight:600; margin:30px 0 12px 0; letter-spacing:-0.4px;">$1</h1>');

  html = html
    .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#FFF; font-weight:600;">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>');

  html = html.replace(/^[\s]*[-*+] (.*?)(?=\n|$)/gm, '<li style="margin-left: 20px; list-style-type: disc; margin-bottom: 6px;">$1</li>');

  html = html.replace(/\n\n/g, '<div style="height: 16px;"></div>');
  html = html.replace(/\n/g, '<br/>');

  html = html.replace(/(<\/?(?:h1|h2|h3|hr|div|table|thead|tbody|tr|th|td|li)[^>]*>)<br\/>/g, '$1');
  html = html.replace(/<br\/>(<\/?(?:h1|h2|h3|hr|div|table|thead|tbody|tr|th|td|li)[^>]*>)/g, '$1');

  inlineCodes.forEach((code, i) => {
    const safe = code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    html = html.replace(`__INLINE_CODE_${i}__`, `<code style="background:rgba(255,255,255,0.08); padding:3px 6px; border-radius:4px; font-family:monospace; font-size:11.5px; color:#00FFC2;">${safe}</code>`);
  });

  codeBlocks.forEach((code, i) => {
    const safe = code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    html = html.replace(`__CODE_BLOCK_${i}__`, `
      <div style="margin: 18px 0; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06); background: rgba(0,0,0,0.3); overflow: hidden;">
        <div style="padding: 6px 12px; background: rgba(255,255,255,0.04); border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 11px; color: #9CA3AF; font-family: monospace;">Snippet</div>
        <pre style="padding: 14px; overflow-x: auto; margin: 0; font-family: monospace; font-size: 12px; line-height: 1.5; color: #E5E7EB;">${safe}</pre>
      </div>
    `);
  });

  return <div dangerouslySetInnerHTML={{ __html: html }} style={{ lineHeight: '1.75', fontSize: '13.5px', textAlign: 'left' }} />;
};

const parseLog = (raw: string) => {
  const match = raw.match(/^\[(.*?)\]\s*(.*)$/);
  if (match) {
    const rawType = match[1];
    const text = match[2];
    let color = '#6B7280';
    if (rawType === 'ACT') color = '#00FFC2';
    if (rawType === 'DOM') color = '#3B82F6';
    if (rawType === 'WARN') color = '#F59E0B';
    if (rawType === 'ERR' || rawType === 'FATAL') color = '#EF4444';
    if (rawType === 'SYS') color = '#8B5CF6';
    return { text, color };
  }
  return { text: raw, color: '#6A7280' };
};

export function WorkingDropdown({ logs, status }: { logs: string[], status: 'idle' | 'working' | 'done' | 'aborted' }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, isOpen]);

  const latestRaw = logs[logs.length - 1] || 'Thinking...';
  const latestParsed = parseLog(latestRaw);

  if (logs.length === 0) return null;

  return (
    <div style={{ marginBottom: '14px', width: '100%' }}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 12px', backgroundColor: isOpen ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)', borderRadius: '20px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.04)', transition: 'all 0.2s' }}
      >
        {status === 'working' ? (
          <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', border: '2px solid rgba(0,255,194,0.2)', borderTopColor: '#00FFC2', animation: 'spin 0.8s linear infinite' }} />
        ) : status === 'aborted' ? (
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#EF4444' }} />
        ) : (
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#00FFC2' }} />
        )}
        <span style={{ fontSize: '11px', color: status === 'working' ? '#C9CDD0' : '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '220px', letterSpacing: '-0.1px' }}>
          {status === 'working' ? latestParsed.text : `Completed`}
        </span>
        <svg width="10" height="10" fill="none" stroke="#6A7280" strokeWidth="2.5" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"></polyline></svg>
      </div>

      <div style={{ overflow: 'hidden', maxHeight: isOpen ? '350px' : '0px', opacity: isOpen ? 1 : 0, transition: 'all 0.25s ease-out', marginTop: isOpen ? '12px' : '0px' }}>
        <div 
          ref={containerRef}
          className="shadowstep-log-container"
          style={{ position: 'relative', paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '300px', overflowY: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <style>{`.shadowstep-log-container::-webkit-scrollbar { display: none; }`}</style>
          <div style={{ position: 'absolute', left: '4px', top: '6px', bottom: '6px', width: '1px', backgroundColor: 'rgba(255,255,255,0.06)' }} />
          {logs.map((log, i) => {
            const p = parseLog(log);
            return (
              <div key={i} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ position: 'absolute', left: '-15px', width: '7px', height: '7px', borderRadius: '50%', backgroundColor: p.color, border: '2px solid #121314', zIndex: 2 }} />
                <span style={{ color: '#9CA3AF', fontSize: '12px', letterSpacing: '-0.1px', textAlign: 'left', wordBreak: 'break-word' }}>{p.text}</span>
              </div>
            );
          })}
        </div>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `@keyframes spin { to { transform: rotate(360deg); } }` }} />
    </div>
  );
}

export function ControlPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [useLongHorizonAgent, setUseLongHorizonAgent] = useState(false);
  const [userName, setUserName] = useState('Operator');
  const [mode, setMode] = useState<'chat' | 'action'>('chat');
  
  const [panelSide, setPanelSide] = useState<'left' | 'right'>('right');
  const [snapPos, setSnapPos] = useState<string>('mid-right');
  const [visibility, setVisibility] = useState<'visible' | 'hidden_temp' | 'hidden_perm'>('visible');
  
  const [selectionMode, setSelectionMode] = useState<'none' | 'box' | 'lasso'>('none');
  const [attachedContexts, setAttachedContexts] = useState<string[]>([]);

  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string>(() => Date.now().toString());
  const [showHistory, setShowHistory] = useState(false);
  
  
  const [activeOptionsMenu, setActiveOptionsMenu] = useState<string | null>(null);
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const [inputValue, setInputValue] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  
  const logEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const engineRef = useRef<ShadowEngine | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (logEndRef.current) logEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  useEffect(() => {
    HistoryManager.loadThreads().then(setThreads);
  }, []);

  useEffect(() => {
    if (messages.length > 0 && activeThreadId) {
      const historyMessages = messages.map(m => ({
        id: m.id, role: m.role, text: m.text, logs: m.logs, status: m.status
      }));
      HistoryManager.saveThread(activeThreadId, historyMessages).then(setThreads);
    }
  }, [messages, activeThreadId]);

  useEffect(() => {
    const handleExtensionMessages = (msg: any) => {
      if (msg.type === 'INJECT_SELECTION') {
        setVisibility('visible');
        setIsOpen(true);
        setAttachedContexts(prev => {
          if (prev.length >= 10) return prev;
          return [...prev, msg.text];
        });
      } else if (msg.type === 'WAKE_UP_EXTENSION') {
        chrome.storage.local.set({ shadowstepDisabled: false });
        setVisibility('visible');
        setIsOpen(true);
      }
    };

    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(handleExtensionMessages);
      return () => chrome.runtime.onMessage.removeListener(handleExtensionMessages);
    }
  }, []);

  const syncInfrastructureStorage = () => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(['groqKeys', 'cerebrasKeys', 'userName', 'activeNodeIndex', 'shadowstepDisabled', 'panelSide', 'snapPos'], (result: StorageResult) => {
        
        if (result.shadowstepDisabled) setVisibility('hidden_perm');
        if (result.panelSide) setPanelSide(result.panelSide);
        if (result.snapPos) setSnapPos(result.snapPos);

        const activeName = result.userName || 'Operator';
        setUserName(activeName);
        
        const gKeys = result.groqKeys || [];
        const cKeys = result.cerebrasKeys || [];
        
        if (gKeys.length > 0 || cKeys.length > 0) {
          const mergedNodes = [
            ...gKeys.map(k => ({ provider: 'Groq' as const, key: k })),
            ...cKeys.map(k => ({ provider: 'Cerebras' as const, key: k }))
          ];
          
          setIsConfigured(true);
          let savedIndex = typeof result.activeNodeIndex === 'number' ? result.activeNodeIndex : 0;
          if (savedIndex >= mergedNodes.length) savedIndex = 0;

          let oldHistory: any[] = [];
          if (engineRef.current) oldHistory = engineRef.current.getHistory();

          engineRef.current = new ShadowEngine(
            mergedNodes, mode, savedIndex, 
            (newIndex) => chrome.storage.local.set({ activeNodeIndex: newIndex }),
            activeName, oldHistory
          );
        } else {
          setIsConfigured(false);
        }
      });
    }
  };

  useEffect(() => {
    syncInfrastructureStorage();
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.onChanged.addListener(syncInfrastructureStorage);
      return () => chrome.storage.onChanged.removeListener(syncInfrastructureStorage);
    }
  }, [mode]);

  const handleInput = (e: any) => {
    setInputValue(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  const handleSend = async (payload?: any) => {
    const textPrompt = typeof payload === 'string' ? payload : inputValue;

    if ((!textPrompt.trim() && attachedContexts.length === 0) || !engineRef.current || isWorking) return;
    
    let finalPrompt = textPrompt.trim() || "Analyze this target capture asset frame context link selection bundle.";
    
    if (useLongHorizonAgent && mode === 'action') {
      finalPrompt = `[LONG-HORIZON TRANSACTION TASK MATRIX ACTIVE]\n[OBJECTIVE STATE: Execute this long task efficiently across multiple frames. Do not stop until deep terminal completion conditions are checked.]\n\n${finalPrompt}`;
    }
    
    if (attachedContexts.length > 0) {
      finalPrompt = `${finalPrompt}\n\n[CONTEXT ATTACHMENTS: Focus context queries primarily on these ${attachedContexts.length} extracted target node areas]`;
      attachedContexts.forEach((ctx, idx) => {
        finalPrompt = `${finalPrompt}\n--- START ATTACHMENT #${idx + 1} ---\n${ctx}\n--- END ATTACHMENT #${idx + 1} ---`;
      });
    } 
    else if (mode === 'chat') {
      const rawPageText = document.body.innerText.substring(0, 5000);
      finalPrompt = `${finalPrompt}\n\n[BACKGROUND CONTEXT: The operator is looking at this live webpage text context]\n--- START WEB PAGE TEXT ---\n${rawPageText}\n--- END WEB PAGE TEXT ---`;
    }

    const displayPrompt = typeof payload === 'string' 
      ? '[Resuming Previous Sequence...]' 
      : (textPrompt.trim() || `[${attachedContexts.length} Target Capture Elements Injected]`);
      
    const msgId = Date.now().toString();
    
    setMessages(prev => {
      const clearedPrev = prev.map(m => m.status === 'aborted' ? { ...m, status: 'done' as const } : m);
      return [
        ...clearedPrev,
        { id: `u-${msgId}`, role: 'user', text: displayPrompt, logs: [], status: 'done' },
        { id: `a-${msgId}`, role: 'agent', text: '', logs: [], status: 'working' }
      ];
    });
    
    setInputValue('');
    setAttachedContexts([]); 
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setIsWorking(true);

    abortControllerRef.current = new AbortController();
    
    await engineRef.current.execute(finalPrompt, {
      onLog: (msg) => setMessages(prev => prev.map(m => m.id === `a-${msgId}` ? { ...m, logs: [...m.logs, msg] } : m)),
      onMessage: (msg) => setMessages(prev => prev.map(m => m.id === `a-${msgId}` ? { ...m, text: msg } : m)),
      onFinish: () => {
        setIsWorking(false);
        setMessages(prev => prev.map(m => {
          if (m.id === `a-${msgId}`) {
            const isAborted = !m.text || m.text.includes("Execution terminated") || m.text.includes("Execution paused") || m.text.includes("Error:") || m.logs.some(l => l.includes('exhausted'));
            const fallbackText = m.text ? m.text : "Execution terminated due to safety cycle limits or network fault.";
            return { ...m, text: fallbackText, status: isAborted ? 'aborted' : 'done' };
          }
          return m;
        }));
      }
    }, abortControllerRef.current.signal);
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsWorking(false);
    }
  };

  const handleKeyDown = (e: any) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleRestart = () => {
    setActiveThreadId(Date.now().toString());
    setMessages([]);
    setShowHistory(false);
    if (engineRef.current) engineRef.current = null;
    syncInfrastructureStorage();
  };

  const openOptionsPage = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
    }
  };

  
  const exportToTxt = (thread: ChatThread) => {
    let content = `ShadowStep Log: ${thread.title}\nDate: ${new Date(thread.updatedAt).toLocaleString()}\n\n`;
    thread.messages.forEach(m => { content += `[${m.role.toUpperCase()}]\n${m.text}\n\n`; });
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ShadowStep_${thread.title.replace(/[^a-z0-9]/gi, '_')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRenameSubmit = async (threadId: string) => {
    if (editingTitle.trim()) {
      const updated = await HistoryManager.renameThread(threadId, editingTitle.trim() + " (Renamed)");
      setThreads(updated);
    }
    setEditingThreadId(null);
  };

  const handleDelete = async (threadId: string) => {
    const updated = await HistoryManager.deleteThread(threadId);
    setThreads(updated);
    if (activeThreadId === threadId) handleRestart();
  };

  const handleClearAll = async () => {
    if (confirm("Are you sure you want to permanently delete all history logs?")) {
      const updated = await HistoryManager.clearAll();
      setThreads(updated);
      handleRestart();
    }
  };

  const handleContainerClick = () => {
    if (activeOptionsMenu) setActiveOptionsMenu(null);
  };

  if (visibility !== 'visible') return null;

  return (
    <div className="shadowstep-panel-root" style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: '#F5F6F7', letterSpacing: '-0.2px' }}>
      
      {/* IMPENETRABLE CSS SHIELD FOR CONTROL PANEL */}
      <style>{`
        .shadowstep-panel-root * {
          box-sizing: border-box !important;
          letter-spacing: normal !important;
        }
        
        .shadowstep-icon-btn {
          all: unset !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          padding: 6px !important;
          border-radius: 6px !important;
          cursor: pointer !important;
          transition: background 0.2s !important;
          box-sizing: border-box !important;
        }
        .shadowstep-icon-btn:hover { background-color: rgba(255,255,255,0.08) !important; }
        .shadowstep-icon-btn.danger:hover { background-color: rgba(239,68,68,0.1) !important; }

        .shadowstep-mode-btn {
          all: unset !important;
          flex: 1 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          padding: 6px 0 !important;
          font-size: 11px !important;
          border-radius: 16px !important;
          cursor: pointer !important;
          font-weight: 500 !important;
          transition: all 0.2s !important;
          box-sizing: border-box !important;
        }

        .shadowstep-action-btn {
          all: unset !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          width: 28px !important;
          height: 28px !important;
          min-width: 28px !important;
          min-height: 28px !important;
          max-width: 28px !important;
          max-height: 28px !important;
          border-radius: 50% !important;
          cursor: pointer !important;
          transition: all 0.2s !important;
          flex-shrink: 0 !important;
          margin-bottom: 3px !important;
          box-sizing: border-box !important;
        }

        .shadowstep-textarea {
          all: unset !important;
          flex: 1 !important;
          background-color: transparent !important;
          border: none !important;
          color: #FFF !important;
          font-size: 13px !important;
          line-height: 1.5 !important;
          padding: 8px 4px !important;
          max-height: 120px !important;
          overflow-y: auto !important;
          resize: none !important;
          font-family: system-ui, -apple-system, sans-serif !important;
          box-sizing: border-box !important;
        }
        .shadowstep-textarea::-webkit-scrollbar { display: none !important; }

        .shadowstep-popup-btn {
          all: unset !important;
          display: flex !important;
          align-items: center !important;
          gap: 10px !important;
          width: 100% !important;
          padding: 10px 12px !important;
          border-radius: 8px !important;
          cursor: pointer !important;
          font-size: 12px !important;
          color: #E5E7EB !important;
          transition: background 0.2s !important;
          box-sizing: border-box !important;
        }
        .shadowstep-popup-btn:hover { background-color: rgba(255,255,255,0.05) !important; }
        .shadowstep-popup-btn.danger { color: #EF4444 !important; }
        .shadowstep-popup-btn.danger:hover { background-color: rgba(239,68,68,0.1) !important; }

        .shadowstep-inline-input {
          all: unset !important;
          flex: 1 !important;
          background-color: rgba(0,0,0,0.4) !important;
          border: 1px solid #00FFC2 !important;
          color: #FFF !important;
          font-size: 12px !important;
          padding: 4px 6px !important;
          border-radius: 4px !important;
          box-sizing: border-box !important;
        }
        
        .shadowstep-btn-primary {
          all: unset !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 8px !important;
          background-color: #00FFC2 !important;
          color: #0E1012 !important;
          border-radius: 8px !important;
          padding: 10px 20px !important;
          font-size: 13px !important;
          font-weight: 600 !important;
          cursor: pointer !important;
          transition: transform 0.1s !important;
          box-sizing: border-box !important;
        }

        .shadowstep-text-btn {
          all: unset !important;
          cursor: pointer !important;
          font-weight: 600 !important;
          font-size: 10px !important;
        }

        .shadowstep-panel-root svg {
          flex-shrink: 0 !important;
        }
      `}</style>

      {selectionMode !== 'none' && (
        <SelectionOverlay 
          mode={selectionMode}
          onCancel={() => setSelectionMode('none')}
          onComplete={(extractedText) => {
            setAttachedContexts(prev => {
              if (prev.length >= 10) return prev;
              return [...prev, extractedText];
            });
            setSelectionMode('none');
            setIsOpen(true);
          }}
        />
      )}

      <FloatingMenu 
        isOpen={isOpen}
        onOpenChat={() => setIsOpen(true)}
        onOpenSettings={openOptionsPage}
        onHideTemporary={() => setVisibility('hidden_temp')}
        onHidePermanent={() => { chrome.storage.local.set({ shadowstepDisabled: true }); setVisibility('hidden_perm'); }}
        onSelectBox={() => { setSelectionMode('box'); setIsOpen(false); }}
        onSelectLasso={() => { setSelectionMode('lasso'); setIsOpen(false); }}
        setPanelSide={setPanelSide}
        snapPos={snapPos}
        setSnapPos={setSnapPos}
      />

      <div 
        onClick={handleContainerClick}
        style={{ 
          position: 'fixed', 
          top: '0px', 
          width: '370px', 
          height: '100vh', 
          backgroundColor: '#0E0F10', 
          boxShadow: panelSide === 'left' ? '12px 0 40px rgba(0, 0, 0, 0.6)' : '-12px 0 40px rgba(0, 0, 0, 0.6)', 
          transition: `${panelSide} 0.22s cubic-bezier(0.2, 1, 0.2, 1)`,
          ...(panelSide === 'left' ? { left: isOpen ? '0px' : '-390px', borderRight: '1px solid rgba(255, 255, 255, 0.05)' } : { right: isOpen ? '0px' : '-390px', borderLeft: '1px solid rgba(255, 255, 255, 0.05)' }),
          display: 'flex', flexDirection: 'column', boxSizing: 'border-box', padding: '18px', zIndex: 2147483647 
        }}
      >
        
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '12px', height: '12px', border: '2px solid #00FFC2', borderRadius: '50%', boxSizing: 'border-box' }} />
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 500, letterSpacing: '-0.3px' }}>ShadowStep</h2>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            <button className="shadowstep-icon-btn" onClick={() => { handleRestart(); setShowHistory(false); }} title="New Chat" style={{ color: '#9CA3AF' }}>
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.92-10.27l-3.26-1.09" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <button className="shadowstep-icon-btn" onClick={() => setShowHistory(!showHistory)} title="History" style={{ color: showHistory ? '#00FFC2' : '#9CA3AF' }}>
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </button>
            <button className="shadowstep-icon-btn" onClick={openOptionsPage} title="Settings" style={{ color: '#9CA3AF' }}>
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
            <button className="shadowstep-icon-btn danger" onClick={() => setIsOpen(false)} title="Minimize Panel" style={{ color: '#9CA3AF' }}>
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </div>

        {isConfigured ? (
          <>
            
            <div style={{ display: 'flex', backgroundColor: 'rgba(255, 255, 255, 0.02)', borderRadius: '20px', padding: '3px', marginBottom: '16px', border: '1px solid rgba(255,255,255,0.03)', flexShrink: 0 }}>
              <button onClick={() => setMode('chat')} title="Ask questions about this tab" style={{ flex: 1, background: mode === 'chat' ? 'rgba(255,255,255,0.05)' : 'none', border: 'none', color: mode === 'chat' ? '#FFF' : '#6A7280', padding: '6px 0', fontSize: '11px', borderRadius: '16px', cursor: 'pointer', fontWeight: 500 }}>Chat Mode</button>
              <button onClick={() => setMode('action')} title="Let the assistant interact with the page" style={{ flex: 1, background: mode === 'action' ? 'rgba(0, 255, 194, 0.08)' : 'none', border: 'none', color: mode === 'action' ? '#00FFC2' : '#6A7280', padding: '6px 0', fontSize: '11px', borderRadius: '16px', cursor: 'pointer', fontWeight: 500 }}>Action Mode</button>
            </div>

            
            {showHistory && (
              <div style={{ position: 'absolute', top: '70px', left: '18px', right: '18px', bottom: '80px', backgroundColor: '#0E0F10', zIndex: 100, display: 'flex', flexDirection: 'column', overflowY: 'auto', paddingRight: '4px' }}>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ fontSize: '10px', color: '#6A7280', fontWeight: 600, letterSpacing: '0.8px' }}>RECENT LOGS ({threads.length}/100)</div>
                  {threads.length > 0 && (
                    <button className="shadowstep-text-btn" onClick={handleClearAll} style={{ color: '#EF4444' }}>Remove All</button>
                  )}
                </div>
                
                {threads.length === 0 && <div style={{ color: '#4B5563', textAlign: 'center', marginTop: '20px', fontSize: '12px' }}>No secure logs recorded.</div>}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingBottom: '20px' }}>
                  {threads.map(thread => (
                    <div 
                      key={thread.id}
                      onClick={() => {
                        if (editingThreadId === thread.id) return;
                        setActiveThreadId(thread.id);
                        const castedMessages = thread.messages.map(m => ({
                          id: m.id, role: m.role as 'user' | 'agent', text: m.text, logs: m.logs, status: m.status as 'idle' | 'working' | 'done' | 'aborted'
                        }));
                        setMessages(castedMessages);
                        setShowHistory(false);
                      }}
                      style={{ padding: '10px 12px', backgroundColor: activeThreadId === thread.id ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)', borderRadius: '8px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        {editingThreadId === thread.id ? (
                          <input 
                            className="shadowstep-inline-input"
                            autoFocus
                            value={editingTitle}
                            onChange={(e: any) => setEditingTitle(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleRenameSubmit(thread.id); if (e.key === 'Escape') setEditingThreadId(null); }}
                            onBlur={() => handleRenameSubmit(thread.id)}
                          />
                        ) : (
                          <div style={{ color: '#E5E7EB', fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: '20px' }}>{thread.title}</div>
                        )}
                        
                        
                        <button 
                          className="shadowstep-icon-btn"
                          onClick={(e) => { e.stopPropagation(); setActiveOptionsMenu(activeOptionsMenu === thread.id ? null : thread.id); }}
                          style={{ padding: '2px' }}
                        >
                          <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
                        </button>
                      </div>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '9px', color: '#6A7280' }}>{new Date(thread.updatedAt).toLocaleDateString()} • {thread.messages.length} lines</span>
                        {thread.messages.length > 0 && thread.messages[thread.messages.length - 1].status === 'aborted' && (
                          <span style={{ width: '5px', height: '5px', backgroundColor: '#EF4444', borderRadius: '50%' }} />
                        )}
                      </div>

                      
                      {activeOptionsMenu === thread.id && (
                        <div style={{ position: 'absolute', top: '28px', right: '10px', backgroundColor: '#1A1C1E', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', zIndex: 110, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                          <button className="shadowstep-popup-btn" onClick={(e) => { e.stopPropagation(); setEditingThreadId(thread.id); setEditingTitle(thread.title); setActiveOptionsMenu(null); }}>Rename</button>
                          <button className="shadowstep-popup-btn" onClick={(e) => { e.stopPropagation(); exportToTxt(thread); setActiveOptionsMenu(null); }}>Export to .txt</button>
                          <button className="shadowstep-popup-btn danger" onClick={(e) => { e.stopPropagation(); handleDelete(thread.id); setActiveOptionsMenu(null); }}>Delete</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            
            <div className="shadowstep-chat-stream" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '16px', paddingRight: '6px', textAlign: 'left' }}>
              <style>{`.shadowstep-chat-stream::-webkit-scrollbar { width: 4px; } .shadowstep-chat-stream::-webkit-scrollbar-track { background: transparent; } .shadowstep-chat-stream::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; } .shadowstep-chat-stream::-webkit-scrollbar-thumb:hover { background: rgba(0, 255, 194, 0.3); }`}</style>
              
              {messages.length === 0 && <div style={{ color: '#4B5563', textAlign: 'center', margin: 'auto', fontSize: '13px', letterSpacing: '-0.1px' }}>How can I help you on this page?</div>}
              
              {messages.map((msg) => (
                <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', width: '100%' }}>
                  
                  {msg.role === 'user' && (
                    <div style={{ backgroundColor: 'rgba(255,255,255,0.06)', padding: '10px 14px', borderRadius: '16px 16px 4px 16px', fontSize: '13px', color: '#E5E7EB', maxWidth: '85%', whiteSpace: 'pre-wrap', textAlign: 'left' }}>
                      {msg.text}
                    </div>
                  )}
                  
                  {msg.role === 'agent' && (
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left' }}>
                      <WorkingDropdown logs={msg.logs} status={msg.status} />
                      
                      {msg.text && (
                        <div style={{ fontSize: '13px', color: '#D1D5DB', width: '100%', paddingLeft: '2px', wordBreak: 'break-word' }}>
                          {renderMarkdown(msg.text)}
                        </div>
                      )}

                      {msg.status === 'aborted' && (
                        <button 
                          onClick={() => {
                            const updatedMessages: ChatMessage[] = messages.map(m => m.id === msg.id ? { ...m, status: 'done' as const } : m);
                            setMessages(updatedMessages);
                            
                            if (activeThreadId) {
                              const historyMessages = updatedMessages.map(m => ({ id: m.id, role: m.role, text: m.text, logs: m.logs, status: m.status }));
                              HistoryManager.saveThread(activeThreadId, historyMessages).then(setThreads);
                            }

                            handleSend("The previous action chain was interrupted. Please proceed from where you left off and finish the objective.");
                          }}
                          style={{ marginTop: '10px', backgroundColor: 'rgba(0, 255, 194, 0.08)', color: '#00FFC2', border: '1px solid rgba(0, 255, 194, 0.2)', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}
                        >
                          <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          Proceed with Task
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>

            
            {attachedContexts.length > 0 && (
              <div className="shadowstep-scroll-dock" style={{ marginBottom: '10px', display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '6px', scrollbarWidth: 'none', msOverflowStyle: 'none', width: '100%' }}>
                <style>{`.shadowstep-scroll-dock::-webkit-scrollbar { display: none; }`}</style>
                {attachedContexts.map((contextText, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', backgroundColor: 'rgba(0, 255, 194, 0.05)', border: '1px solid rgba(0, 255, 194, 0.15)', borderRadius: '12px', padding: '6px 10px', flexShrink: 0, maxWidth: '180px' }}>
                    <div style={{ width: '22px', height: '22px', borderRadius: '4px', backgroundColor: 'rgba(0, 255, 194, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '8px', flexShrink: 0 }}>
                      <svg width="12" height="12" fill="none" stroke="#00FFC2" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                    </div>
                    <div style={{ flex: 1, overflow: 'hidden', marginRight: '4px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 600, color: '#00FFC2', lineHeight: '1.2' }}>Clip #{idx + 1}</div>
                      <div style={{ fontSize: '9px', color: '#9CA3AF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{contextText}</div>
                    </div>
                    <button className="shadowstep-icon-btn" onClick={() => setAttachedContexts(prev => prev.filter((_, i) => i !== idx))} style={{ padding: '2px' }}>
                      <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            
            <div style={{ position: 'relative', zIndex: 50, flexShrink: 0, backgroundColor: 'rgba(255, 255, 255, 0.03)', borderRadius: '20px', border: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', alignItems: 'flex-end', padding: '6px 10px' }}>
              
              {showAttachmentMenu && (
                <div style={{ position: 'absolute', bottom: '100%', left: '0', marginBottom: '12px', backgroundColor: '#121314', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '6px', display: 'flex', flexDirection: 'column', gap: '4px', boxShadow: '0 4px 20px rgba(0,0,0,0.6)', zIndex: 100, minWidth: '180px' }}>
                  <button className="shadowstep-popup-btn" onClick={() => { setSelectionMode('box'); setShowAttachmentMenu(false); setIsOpen(false); }}>
                    <svg width="14" height="14" fill="none" stroke="#00FFC2" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" strokeDasharray="3 3"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
                    Bounding Box
                  </button>
                  <button className="shadowstep-popup-btn" onClick={() => { setSelectionMode('lasso'); setShowAttachmentMenu(false); setIsOpen(false); }}>
                    <svg width="14" height="14" fill="none" stroke="#00FFC2" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle></svg>
                    Free Form Lasso
                  </button>
                </div>
              )}

              <button className="shadowstep-action-btn" onClick={() => setShowAttachmentMenu(!showAttachmentMenu)} title="Attach Page Context" style={{ backgroundColor: showAttachmentMenu ? 'rgba(255, 255, 255, 0.1)' : 'transparent', color: showAttachmentMenu ? '#00FFC2' : '#9CA3AF' }}>
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" style={{ transform: showAttachmentMenu ? 'rotate(45deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              </button>

              {mode === 'action' && (
                <button className="shadowstep-action-btn" onClick={() => setUseLongHorizonAgent(!useLongHorizonAgent)} title={useLongHorizonAgent ? "Long Execution Mode Active" : "Enable Long Execution Mode"} style={{ backgroundColor: useLongHorizonAgent ? 'rgba(0, 255, 192, 0.15)' : 'transparent', color: useLongHorizonAgent ? '#00FFC2' : '#6A7280' }}>
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg>
                </button>
              )}

              <textarea 
                className="shadowstep-textarea"
                ref={textareaRef}
                rows={1}
                placeholder={useLongHorizonAgent && mode === 'action' ? "Describe the complete task workflow..." : `Ask anything as ${userName}...`}
                value={inputValue}
                onInput={handleInput}
                onKeyDown={handleKeyDown}
              />
              
              <button className="shadowstep-action-btn" onClick={isWorking ? handleStop : () => handleSend()} style={{ backgroundColor: isWorking ? 'rgba(239, 68, 68, 0.15)' : ((inputValue.trim() || attachedContexts.length > 0) ? '#00FFC2' : 'transparent'), color: isWorking ? '#EF4444' : ((inputValue.trim() || attachedContexts.length > 0) ? '#121314' : '#4B5563'), cursor: (inputValue.trim() || attachedContexts.length > 0) || isWorking ? 'pointer' : 'default' }}>
                {isWorking ? ( <svg width="10" height="10" fill="currentColor" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="1" ry="1"></rect></svg> ) : ( <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg> )}
              </button>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '20px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}><svg width="24" height="24" fill="none" stroke="#EF4444" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg></div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 600, color: '#FFF' }}>API Key Required</h3>
            <p style={{ margin: '0 0 24px 0', fontSize: '13px', color: '#9CA3AF', lineHeight: '1.5' }}>ShadowStep requires at least one API configuration (Groq or Cerebras) to process logic.</p>
            <button className="shadowstep-btn-primary" onClick={openOptionsPage}><svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><circle cx="12" cy="12" r="3" /></svg>Open Control Hub</button>
          </div>
        )}
      </div>
    </div>
  );
}