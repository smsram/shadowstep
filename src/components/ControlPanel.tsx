/**
 * @file ControlPanel.tsx
 * @description The main companion sidebar for ShadowStep.
 * 
 * Implements:
 * - Redesigned chat input area with '+' attachment menu (including page images toggle) and compact model dropdown.
 * - Dynamic system theming (Auto, Light, Dark) using Shadow DOM CSS variables.
 * - Modern collapsible "Thinking..." accordion UI matching ChatGPT/Claude aesthetics.
 * - Absolute font isolation preventing host styles from bleeding in or out.
 * - Routing logic: 'auto' cross-platform fallback, and specific platform key cycling.
 */
import { useState, useEffect, useRef } from 'preact/hooks';
import { ShadowEngine, type NodeCluster, type RouteSelection, type ExecutionTerminationState, type GroundingSource } from '../core/engine';
import { FloatingMenu } from './FloatingMenu';
import { SelectionOverlay, type ExtractedSelection } from './SelectionOverlay';
import { HistoryManager, type ChatThread } from '../core/history';
import { CustomDropdown, type DropdownOption } from './CustomDropdown';
import { 
  parseFileAttachment, 
  extractFilteredPageImages, 
  type AttachmentItem 
} from '../core/fileParser';

interface StorageResult {
  geminiKeys?: string[];
  groqKeys?: string[];
  cloudflareKeys?: string[];
  cloudflareAccountId?: string;
  cloudflareAccountIds?: string[];
  theme?: 'dark' | 'light' | 'system' | 'auto';
  routeSelection?: RouteSelection;
  userName?: string;
  shadowstepDisabled?: boolean;
  panelSide?: 'left' | 'right';
  snapPos?: string;
  includePageImages?: boolean;
  isWebSearchEnabled?: boolean;
  webSearchEnabled?: boolean;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
  logs: string[];
  status: 'idle' | 'working' | 'done' | 'step_limit' | 'aborted';
  manualAbort?: boolean;
  images?: string[];
  timestamp?: number;
  sources?: GroundingSource[];
}

const cleanMarkdownSource = (text: string): string => {
  if (!text) return '';
  return text.replace(/\[DONE\]\s*/gi, '').trim();
};

const renderMarkdown = (text: string) => {
  if (!text) return null;
  const rawText = cleanMarkdownSource(text);

  // 1. Isolate fenced code blocks first so nothing inside is ever parsed as links or markdown
  const codeBlocks: { lang: string; code: string }[] = [];
  let html = rawText.replace(/```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g, (_, lang, code) => { 
    codeBlocks.push({ lang: (lang || '').trim(), code });
    return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
  });

  // 2. Isolate inline code so nothing inside is ever parsed as links
  const inlineCodes: string[] = [];
  html = html.replace(/`([^`\n]+)`/g, (_, code) => { 
    inlineCodes.push(code);
    return `__INLINE_CODE_${inlineCodes.length - 1}__`;
  });

  // 3. Process markdown tables
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
        ? 'padding: 8px 12px; border: 1px solid var(--ss-border); background: var(--ss-bg-secondary); font-weight: 600; white-space: nowrap;' 
        : 'padding: 8px 12px; border: 1px solid var(--ss-border); word-break: break-word; vertical-align: top; min-width: 110px;';
      return `<tr>${cells.map(c => `<${tag} style="${style}">${c.trim()}</${tag}>`).join('')}</tr>`;
    };

    return `<div style="overflow-x: auto; margin: 16px 0; border-radius: 8px; border: 1px solid var(--ss-border); background: var(--ss-card-bg);">
      <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 12.5px; line-height: 1.5;">
        <thead>${renderRow(header, true)}</thead>
        <tbody>${rows.map(r => renderRow(r, false)).join('')}</tbody>
      </table>
    </div>`;
  });

  html = html.replace(/^[\s]*[-*_]{3,}[\s]*$/gm, '<hr style="border: none; border-top: 1px solid var(--ss-border); margin: 20px 0;" />');

  html = html
    .replace(/^### (.*?)(?=\n|$)/gm, '<h3 style="color:var(--ss-text-primary); font-size:15px; font-weight:600; margin:18px 0 6px 0; letter-spacing:-0.2px;">$1</h3>')
    .replace(/^## (.*?)(?=\n|$)/gm, '<h2 style="color:var(--ss-text-primary); font-size:17px; font-weight:600; margin:22px 0 8px 0; border-bottom:1px solid var(--ss-border-subtle); padding-bottom:5px; letter-spacing:-0.3px;">$1</h2>')
    .replace(/^# (.*?)(?=\n|$)/gm, '<h1 style="color:var(--ss-text-primary); font-size:20px; font-weight:600; margin:26px 0 10px 0; letter-spacing:-0.4px;">$1</h1>');

  html = html
    .replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--ss-text-primary); font-weight:600;">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>');

  html = html.replace(/^[\s]*[-*+] (.*?)(?=\n|$)/gm, '<li style="margin-left: 18px; list-style-type: disc; margin-bottom: 5px;">$1</li>');

  // Task 2: Selective Markdown Link Rendering & Bare URLs outside code
  // 1. Explicit markdown links [text](url)
  html = html.replace(
    /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, 
    '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:var(--ss-accent); text-decoration:underline; text-underline-offset:2px; word-break:break-word;">$1</a>'
  );

  // 2. Bare URLs: parse strictly in text nodes (not inside existing tags or attributes)
  const segments = html.split(/(<[^>]+>)/g);
  let insideAnchor = false;
  html = segments.map((seg) => {
    if (seg.startsWith('<')) {
      if (/^<a\b/i.test(seg)) insideAnchor = true;
      if (/^<\/a>/i.test(seg)) insideAnchor = false;
      return seg;
    }
    if (insideAnchor) return seg;
    return seg.replace(
      /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:var(--ss-accent); text-decoration:underline; text-underline-offset:2px; word-break:break-word;">$1</a>'
    );
  }).join('');

  html = html.replace(/\n\n/g, '<div style="height: 14px;"></div>');
  html = html.replace(/\n/g, '<br/>');

  html = html.replace(/(<\/?(?:h1|h2|h3|hr|div|table|thead|tbody|tr|th|td|li|a)[^>]*>)<br\/>/g, '$1');
  html = html.replace(/<br\/>(<\/?(?:h1|h2|h3|hr|div|table|thead|tbody|tr|th|td|li|a)[^>]*>)/g, '$1');

  // Task 2: Code Block Protection - restore inline code with HTML escaping and ZERO link parsing
  inlineCodes.forEach((code, i) => {
    const safe = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    html = html.replace(`__INLINE_CODE_${i}__`, `<code style="background:var(--ss-bg-secondary); padding:2px 5px; border-radius:4px; font-family:monospace; font-size:11.5px; color:var(--ss-accent); border:1px solid var(--ss-border-subtle);">${safe}</code>`);
  });

  // Task 2: Code Block Protection - restore fenced code with HTML escaping and ZERO link parsing
  codeBlocks.forEach((block, i) => {
    const safe = block.code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const title = block.lang ? `Snippet (${block.lang})` : 'Snippet';
    html = html.replace(`__CODE_BLOCK_${i}__`, `
      <div style="margin: 16px 0; border-radius: 8px; border: 1px solid var(--ss-border); background: var(--ss-card-bg); overflow: hidden;">
        <div style="padding: 5px 12px; background: var(--ss-bg-secondary); border-bottom: 1px solid var(--ss-border); font-size: 11px; color: var(--ss-text-muted); font-family: monospace;">${title}</div>
        <pre style="padding: 12px; overflow-x: auto; margin: 0; font-family: monospace; font-size: 12px; line-height: 1.5; color: var(--ss-text-primary);">${safe}</pre>
      </div>
    `);
  });

  return <div dangerouslySetInnerHTML={{ __html: html }} style={{ lineHeight: '1.7', fontSize: '13px', textAlign: 'left', color: 'var(--ss-text-primary)' }} />;
};

const cleanLogMessage = (raw: string): string => {
  if (raw.startsWith('[OBSERVE]')) {
    return `Noted: ${raw.replace(/^\[OBSERVE\]\s*/i, '').trim()}`;
  }
  return raw.replace(/^\[(SYS|DOM|ACT|INFO|EXEC|STEP|ACTION|SYSTEM|NAV)\]\s*/i, '').trim();
};

/**
 * Task 3: Chain-Style Execution Logs & Modern "Thinking" Accordion UI
 */
export function ModernThinkingAccordion({ logs, status }: { logs: string[], status: 'idle' | 'working' | 'done' | 'step_limit' | 'aborted' }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, isOpen]);

  if (logs.length === 0) return null;

  const latestRaw = logs[logs.length - 1] || 'Thinking...';
  const latestCleaned = cleanLogMessage(latestRaw);

  return (
    <div style={{ marginBottom: '8px', width: '100%' }}>
      {/* Accordion Trigger Header */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '5px 11px',
          backgroundColor: 'var(--ss-bg-secondary)',
          border: '1px solid var(--ss-border-subtle)',
          borderRadius: '16px',
          cursor: 'pointer',
          transition: 'all 0.15s ease'
        }}
      >
        {status === 'working' ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--ss-text-secondary)', fontSize: '11.5px', fontWeight: 500 }}>
            <span style={{
              display: 'inline-block',
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: 'var(--primary-color)',
              animation: 'shadowstep-pulse 1.4s infinite ease-in-out'
            }} />
            <span style={{ maxWidth: '230px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {latestCleaned || 'Analyzing...'}
            </span>
          </span>
        ) : status === 'aborted' ? (
          <span style={{ color: '#EF4444', fontSize: '11.5px', fontWeight: 500 }}>Process Interrupted</span>
        ) : status === 'step_limit' ? (
          <span style={{ color: 'var(--primary-color)', fontSize: '11.5px', fontWeight: 500 }}>Step Limit Paused</span>
        ) : (
          <span style={{ color: 'var(--ss-text-muted)', fontSize: '11.5px', fontWeight: 500 }}>
            Thought for {logs.length} {logs.length === 1 ? 'step' : 'steps'}
          </span>
        )}

        <svg 
          width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" 
          style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', color: 'var(--ss-text-muted)' }} 
          viewBox="0 0 24 24"
        >
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>

      {/* Accordion Expandable Step List - Continuous Timeline / Step Chain */}
      <div style={{ 
        overflow: 'hidden', 
        maxHeight: isOpen ? '320px' : '0px', 
        opacity: isOpen ? 1 : 0, 
        transition: 'all 0.22s cubic-bezier(0.2, 1, 0.2, 1)', 
        marginTop: isOpen ? '8px' : '0px' 
      }}>
        <div 
          ref={containerRef}
          className="shadowstep-log-scroll"
          style={{ 
            padding: '6px 8px 6px 12px', 
            display: 'flex', 
            flexDirection: 'column', 
            maxHeight: '260px', 
            overflowY: 'auto' 
          }}
        >
          <style>{`.shadowstep-log-scroll::-webkit-scrollbar { width: 3px; } .shadowstep-log-scroll::-webkit-scrollbar-thumb { background: var(--ss-border); border-radius: 4px; }`}</style>
          {logs.map((log, i) => {
            const isLast = i === logs.length - 1;
            const isActive = isLast && status === 'working';
            const cleanedText = cleanLogMessage(log);

            return (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', position: 'relative', paddingBottom: isLast ? '2px' : '10px' }}>
                {/* Vertical connector line */}
                {!isLast && (
                  <div style={{
                    position: 'absolute',
                    left: '4px',
                    top: '12px',
                    bottom: '0',
                    width: '1px',
                    backgroundColor: 'var(--ss-border)',
                    opacity: 0.6
                  }} />
                )}

                {/* Node indicator */}
                <div style={{
                  width: '9px',
                  height: '9px',
                  marginTop: '4px',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 1
                }}>
                  {isActive ? (
                    <span style={{
                      display: 'inline-block',
                      width: '7px',
                      height: '7px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--ss-accent)',
                      boxShadow: '0 0 6px var(--ss-accent)',
                      animation: 'shadowstep-pulse 1.4s infinite ease-in-out'
                    }} />
                  ) : (
                    <span style={{
                      display: 'inline-block',
                      width: '5px',
                      height: '5px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--ss-text-muted)',
                      opacity: 0.5
                    }} />
                  )}
                </div>

                {/* Step Text */}
                <div style={{
                  flex: 1,
                  fontSize: '12px',
                  lineHeight: 1.45,
                  color: isActive ? 'var(--ss-text-primary)' : 'var(--ss-text-muted)',
                  fontWeight: isActive ? 500 : 400,
                  wordBreak: 'break-word',
                  letterSpacing: '-0.1px'
                }}>
                  {cleanedText}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ControlPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [useLongHorizonAgent, setUseLongHorizonAgent] = useState(false);
  const [userName, setUserName] = useState('Operator');
  const [mode, setMode] = useState<'chat' | 'action'>('chat');
  
  const [panelSide, setPanelSide] = useState<'left' | 'right'>('right');
  const [snapPos, setSnapPos] = useState<string>('mid-right');
  const [visibility, setVisibility] = useState<'visible' | 'hidden_temp' | 'hidden_perm'>('visible');
  
  const [selectionMode, setSelectionMode] = useState<'none' | 'box' | 'lasso'>('none');
  const [attachedContexts, setAttachedContexts] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [includePageImages, setIncludePageImages] = useState(false);
  const [webSearchEnabled, setEnableWebSearch] = useState(false);
  
  // Model / Provider Selection in Input Area
  const [routeSelection, setRouteSelection] = useState<RouteSelection>('auto');

  const modelOptions: DropdownOption<RouteSelection>[] = [
    { value: 'auto', label: 'Auto' },
    { value: 'gemini', label: 'Gemini 2.5 Flash' },
    { value: 'groq', label: 'Groq Qwen 3.8 27B' },
    { value: 'cloudflare', label: 'Cloudflare Qwen 3.8 27B' }
  ];

  // Theming: Default to 'dark'
  const [themeSetting, setThemeSetting] = useState<'dark' | 'light' | 'system' | 'auto'>('dark');
  const [systemIsDark, setSystemIsDark] = useState(true);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string>(() => Date.now().toString());
  const [showHistory, setShowHistory] = useState(false);
  
  const [activeOptionsMenu, setActiveOptionsMenu] = useState<string | null>(null);
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const [inputValue, setInputValue] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const isRunnable = Boolean(inputValue.trim() || attachments.length > 0 || attachedContexts.length > 0);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [retryDropdownMsgId, setRetryDropdownMsgId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(prev => prev === msg ? null : prev);
    }, 4500);
  };
  
  const logEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const engineRef = useRef<ShadowEngine | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isManualAbortRef = useRef<boolean>(false);
  const plusBtnRef = useRef<HTMLButtonElement>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);

  // Monitor OS prefers-color-scheme
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemIsDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setSystemIsDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Click outside listener for '+' popover menu (Shadow DOM composedPath compatible)
  useEffect(() => {
    if (!showPlusMenu) return;

    const handleOutsideClick = (e: MouseEvent) => {
      const path = (e.composedPath && e.composedPath()) || [];
      if (
        plusMenuRef.current && 
        !path.includes(plusMenuRef.current) && 
        plusBtnRef.current && 
        !path.includes(plusBtnRef.current)
      ) {
        setShowPlusMenu(false);
      }
    };

    window.addEventListener('mousedown', handleOutsideClick, true);
    return () => window.removeEventListener('mousedown', handleOutsideClick, true);
  }, [showPlusMenu]);

  // Click outside listener for retry model selector popover
  useEffect(() => {
    if (!retryDropdownMsgId) return;
    const handleClose = () => setRetryDropdownMsgId(null);
    window.addEventListener('mousedown', handleClose);
    return () => window.removeEventListener('mousedown', handleClose);
  }, [retryDropdownMsgId]);

  const isDark = (themeSetting === 'auto' || themeSetting === 'system') ? systemIsDark : themeSetting === 'dark';

  useEffect(() => {
    if (logEndRef.current) logEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  useEffect(() => {
    HistoryManager.loadThreads().then(setThreads);
  }, []);

  useEffect(() => {
    if (messages.length > 0 && activeThreadId) {
      const historyMessages = messages.map(m => ({
        id: m.id, role: m.role, text: m.text, logs: m.logs, status: m.status, timestamp: m.timestamp
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
      chrome.storage.local.get([
        'geminiKeys',
        'groqKeys', 
        'cloudflareKeys',
        'cloudflareAccountId',
        'cloudflareAccountIds',
        'theme',
        'routeSelection',
        'userName', 
        'shadowstepDisabled', 
        'panelSide', 
        'snapPos',
        'includePageImages',
        'isWebSearchEnabled',
        'webSearchEnabled'
      ], (result: StorageResult) => {
        
        if (result.shadowstepDisabled) setVisibility('hidden_perm');
        if (result.panelSide) setPanelSide(result.panelSide);
        if (result.snapPos) setSnapPos(result.snapPos);
        if (typeof result.includePageImages === 'boolean') setIncludePageImages(result.includePageImages);
        const isWebSearch = typeof result.isWebSearchEnabled === 'boolean' 
          ? result.isWebSearchEnabled 
          : (typeof result.webSearchEnabled === 'boolean' ? result.webSearchEnabled : false);
        setEnableWebSearch(isWebSearch);
        if (result.theme) setThemeSetting(result.theme);
        else setThemeSetting('dark');
        if (result.routeSelection) setRouteSelection(result.routeSelection);

        const activeName = result.userName || 'Operator';
        setUserName(activeName);
        
        const geminiKeys = result.geminiKeys || [];
        const groqKeys = result.groqKeys || [];
        const cfKeys = result.cloudflareKeys || [];
        const cfAccountIds = (result.cloudflareAccountIds && result.cloudflareAccountIds.length > 0)
          ? result.cloudflareAccountIds
          : (result.cloudflareAccountId ? [result.cloudflareAccountId] : []);

        // Task 4: Strict 1-to-1 Cloudflare Account ID & API Key Pairing Matrix
        const cfPairCount = Math.min(cfAccountIds.length, cfKeys.length);
        const cfNodes: NodeCluster[] = [];
        for (let i = 0; i < cfPairCount; i++) {
          cfNodes.push({
            provider: 'Cloudflare',
            key: cfKeys[i],
            accountId: cfAccountIds[i]
          });
        }

        const nodes: NodeCluster[] = [
          ...geminiKeys.map(k => ({ provider: 'Gemini' as const, key: k })),
          ...groqKeys.map(k => ({ provider: 'Groq' as const, key: k })),
          ...cfNodes
        ];

        const hasConfig = nodes.length > 0;
        setIsConfigured(hasConfig);

        if (hasConfig) {
          let oldHistory: any[] = [];
          if (engineRef.current) oldHistory = engineRef.current.getHistory();

          engineRef.current = new ShadowEngine(
            nodes, 
            mode, 
            result.routeSelection || 'auto',
            undefined,
            activeName, 
            oldHistory
          );
          engineRef.current.setWebSearchEnabled(isWebSearch);
          engineRef.current.setLongHorizon(useLongHorizonAgent);
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

  const handleRouteSelect = (newRoute: RouteSelection) => {
    setRouteSelection(newRoute);
    if (engineRef.current) {
      engineRef.current.setRouteSelection(newRoute);
    }
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ routeSelection: newRoute });
    }
  };

  const handlePageImagesToggle = (enabled: boolean) => {
    setIncludePageImages(enabled);
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ includePageImages: enabled });
    }
  };

  const handleWebSearchToggle = (enabled: boolean) => {
    if (enabled) {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.get(['geminiKeys'], (result) => {
          const rawKeys = result.geminiKeys;
          const keys: string[] = Array.isArray(rawKeys) ? rawKeys : [];
          if (!keys || keys.length === 0) {
            // Task 2.2: Missing Key Validation & Warning
            setEnableWebSearch(false);
            chrome.storage.local.set({ isWebSearchEnabled: false, webSearchEnabled: false });
            if (engineRef.current) engineRef.current.setWebSearchEnabled(false);
            showToast("Gemini API key required for Web Search. Add your key in Settings.");
            openOptionsPage();
            return;
          }

          setEnableWebSearch(true);
          chrome.storage.local.set({ isWebSearchEnabled: true, webSearchEnabled: true });
          if (engineRef.current) engineRef.current.setWebSearchEnabled(true);
        });
      }
    } else {
      setEnableWebSearch(false);
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set({ isWebSearchEnabled: false, webSearchEnabled: false });
      }
      if (engineRef.current) engineRef.current.setWebSearchEnabled(false);
    }
  };

  const handleInput = (e: any) => {
    setInputValue(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  const handleFileSelect = async (e: any) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    for (const file of files) {
      try {
        const att = await parseFileAttachment(file);
        setAttachments(prev => [...prev, att]);
      } catch (err) {
        console.warn("[ShadowStep] Attachment error:", err);
      }
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSend = async (payload?: any) => {
    const textPrompt = typeof payload === 'string' ? payload : inputValue;

    const hasAttachments = attachments.length > 0 || attachedContexts.length > 0;
    if ((!textPrompt.trim() && !hasAttachments) || !engineRef.current || isWorking) return;
    
    let finalPrompt = textPrompt.trim() || "Analyze attached multimodal context and screen elements.";

    if (useLongHorizonAgent && mode === 'action') {
      finalPrompt = `[LONG-HORIZON TRANSACTION TASK MATRIX ACTIVE]\n[OBJECTIVE STATE: Execute this long task efficiently across multiple frames. Do not stop until deep terminal completion conditions are checked.]\n\n${finalPrompt}`;
    }
    
    // 1. Gather all attached images (screen crops and uploaded images)
    const imagesToSend: string[] = [];
    attachments.forEach(att => {
      if (att.base64) imagesToSend.push(att.base64);
    });

    // 2. Full-Page Image Filtering (Task 3: ON = scan semantic images, max 3)
    if (includePageImages) {
      try {
        const pageImages = await extractFilteredPageImages(3);
        pageImages.forEach(img => {
          if (img.base64) imagesToSend.push(img.base64);
        });
      } catch (err) {
        console.warn("Failed to extract page images:", err);
      }
    }

    // 3. Inject text and document attachments as structured markdown blocks
    const docAttachments = attachments.filter(a => a.extractedText);
    if (docAttachments.length > 0) {
      finalPrompt = `${finalPrompt}\n\n[FILE ATTACHMENTS]`;
      docAttachments.forEach((att, idx) => {
        const ext = att.name.split('.').pop()?.toLowerCase() || 'txt';
        finalPrompt = `${finalPrompt}\n\n### Document #${idx + 1}: ${att.name}\n\`\`\`${ext}\n${att.extractedText}\n\`\`\``;
      });
    }

    // 4. Inject right-click context menu selections
    if (attachedContexts.length > 0) {
      finalPrompt = `${finalPrompt}\n\n[CONTEXT ATTACHMENTS: Focus on these ${attachedContexts.length} highlighted text regions]`;
      attachedContexts.forEach((ctx, idx) => {
        finalPrompt = `${finalPrompt}\n--- CLIP #${idx + 1} ---\n${ctx}\n--- END CLIP #${idx + 1} ---`;
      });
    } 
    else if (mode === 'chat') {
      const rawPageText = document.body.innerText.substring(0, 5000);
      finalPrompt = `${finalPrompt}\n\n[BACKGROUND CONTEXT: Active webpage text context]\n--- START WEB PAGE TEXT ---\n${rawPageText}\n--- END WEB PAGE TEXT ---`;
    }

    const displayPrompt = typeof payload === 'string' 
      ? '[Resuming Previous Sequence...]' 
      : (textPrompt.trim() || `[${attachments.length + attachedContexts.length} Attached Elements Dispatched]`);
      
    const msgId = Date.now().toString();
    const now = Date.now();
    
    setMessages(prev => {
      const clearedPrev = prev.map(m => (m.status === 'aborted' || m.status === 'step_limit') ? { ...m, status: 'done' as const } : m);
      return [
        ...clearedPrev,
        { 
          id: `u-${msgId}`, 
          role: 'user', 
          text: displayPrompt, 
          logs: [], 
          status: 'done',
          images: imagesToSend.slice(0, 3),
          timestamp: now
        },
        { id: `a-${msgId}`, role: 'agent', text: '', logs: [], status: 'working', timestamp: now }
      ];
    });
    
    setInputValue('');
    setAttachedContexts([]); 
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setIsWorking(true);
    isManualAbortRef.current = false;

    abortControllerRef.current = new AbortController();
    
    // Task 1.5: Read dynamic toggle state from storage on submit to prevent stale defaults
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      try {
        const stored = await chrome.storage.local.get(['isWebSearchEnabled', 'webSearchEnabled']);
        const dynamicSearch = typeof stored.isWebSearchEnabled === 'boolean'
          ? stored.isWebSearchEnabled
          : !!stored.webSearchEnabled;
        setEnableWebSearch(dynamicSearch);
        if (engineRef.current) {
          engineRef.current.setWebSearchEnabled(dynamicSearch);
        }
      } catch {}
    }
    if (engineRef.current) {
      engineRef.current.setLongHorizon(useLongHorizonAgent);
    }

    await engineRef.current.execute(finalPrompt, {
      onLog: (msg) => setMessages(prev => prev.map(m => m.id === `a-${msgId}` ? { ...m, logs: [...m.logs, msg] } : m)),
      onMessage: (msg) => setMessages(prev => prev.map(m => m.id === `a-${msgId}` ? { ...m, text: msg } : m)),
      onSources: (sources) => setMessages(prev => prev.map(m => m.id === `a-${msgId}` ? { ...m, sources } : m)),
      onFinish: (reason: ExecutionTerminationState) => {
        setIsWorking(false);
        setMessages(prev => prev.map(m => {
          if (m.id === `a-${msgId}`) {
            if (reason === 'COMPLETED') {
              return { ...m, status: 'done' };
            } else if (reason === 'STEP_LIMIT_REACHED') {
              return { ...m, status: 'step_limit' };
            } else {
              const fallbackText = m.text ? m.text : "Execution terminated due to safety cycle limits or network fault.";
              return { ...m, text: fallbackText, status: 'aborted', manualAbort: isManualAbortRef.current };
            }
          }
          return m;
        }));
      }
    }, abortControllerRef.current.signal, imagesToSend);
  };

  const handleCopy = (msgId: string, text: string) => {
    const clean = cleanMarkdownSource(text);
    navigator.clipboard.writeText(clean);
    setCopiedMsgId(msgId);
    setTimeout(() => {
      setCopiedMsgId(prev => prev === msgId ? null : prev);
    }, 2000);
  };

  const formatTime = (ts?: number) => {
    const d = ts ? new Date(ts) : new Date();
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  const handleRedoOrRetry = async (agentMsgId: string, targetRoute?: RouteSelection) => {
    if (isWorking || !engineRef.current) return;

    const agentIndex = messages.findIndex(m => m.id === agentMsgId);
    if (agentIndex === -1) return;

    // Find previous user message
    let userIndex = agentIndex - 1;
    while (userIndex >= 0 && messages[userIndex].role !== 'user') {
      userIndex--;
    }
    if (userIndex < 0) return;

    const userMsg = messages[userIndex];
    const userPromptText = userMsg.text;
    const userImages = userMsg.images || [];

    // Task 3.3: Branch Truncation - discard this assistant message and all messages below it
    const truncatedMessages = messages.slice(0, userIndex + 1);

    if (targetRoute && targetRoute !== routeSelection) {
      handleRouteSelect(targetRoute);
    }

    setRetryDropdownMsgId(null);

    const newAgentMsgId = Date.now().toString();
    const updatedMessages: ChatMessage[] = [
      ...truncatedMessages,
      {
        id: `a-${newAgentMsgId}`,
        role: 'agent',
        text: '',
        logs: [],
        status: 'working',
        timestamp: Date.now()
      }
    ];

    setMessages(updatedMessages);
    setIsWorking(true);

    // Synchronize engine messageHistory linearly with truncated history
    if (engineRef.current) {
      const fullHistory = engineRef.current.getHistory();
      const sysPrompt = fullHistory[0] || { role: 'system', content: '' };
      const historyUpToUser: any[] = [sysPrompt];
      for (let i = 0; i < userIndex; i++) {
        const m = truncatedMessages[i];
        if (m.role === 'user') {
          historyUpToUser.push({ role: 'user', content: m.text });
        } else if (m.role === 'agent') {
          historyUpToUser.push({ role: 'assistant', content: m.text });
        }
      }
      engineRef.current.setHistory(historyUpToUser);
    }

    let finalPrompt = userPromptText;
    if (useLongHorizonAgent && mode === 'action') {
      finalPrompt = `[LONG-HORIZON TRANSACTION TASK MATRIX ACTIVE]\n[OBJECTIVE STATE: Execute this long task efficiently across multiple frames. Do not stop until deep terminal completion conditions are checked.]\n\n${finalPrompt}`;
    }

    abortControllerRef.current = new AbortController();
    isManualAbortRef.current = false;

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      try {
        const stored = await chrome.storage.local.get(['isWebSearchEnabled', 'webSearchEnabled']);
        const dynamicSearch = typeof stored.isWebSearchEnabled === 'boolean'
          ? stored.isWebSearchEnabled
          : !!stored.webSearchEnabled;
        setEnableWebSearch(dynamicSearch);
        if (engineRef.current) {
          engineRef.current.setWebSearchEnabled(dynamicSearch);
        }
      } catch {}
    }
    if (engineRef.current) {
      engineRef.current.setLongHorizon(useLongHorizonAgent);
    }

    await engineRef.current.execute(
      finalPrompt,
      {
        onLog: (msg) => setMessages(prev => prev.map(m => m.id === `a-${newAgentMsgId}` ? { ...m, logs: [...m.logs, msg] } : m)),
        onMessage: (msg) => setMessages(prev => prev.map(m => m.id === `a-${newAgentMsgId}` ? { ...m, text: msg } : m)),
        onSources: (sources) => setMessages(prev => prev.map(m => m.id === `a-${newAgentMsgId}` ? { ...m, sources } : m)),
        onFinish: (reason: ExecutionTerminationState) => {
          setIsWorking(false);
          setMessages(prev => prev.map(m => {
            if (m.id === `a-${newAgentMsgId}`) {
              if (reason === 'COMPLETED') {
                return { ...m, status: 'done' };
              } else if (reason === 'STEP_LIMIT_REACHED') {
                return { ...m, status: 'step_limit' };
              } else {
                const fallbackText = m.text ? m.text : "Execution terminated due to safety cycle limits or network fault.";
                return { ...m, text: fallbackText, status: 'aborted', manualAbort: isManualAbortRef.current };
              }
            }
            return m;
          }));
        }
      },
      abortControllerRef.current.signal,
      userImages,
      false
    );
  };

  const handleResume = async (msgId: string) => {
    if (!engineRef.current || isWorking) return;
    isManualAbortRef.current = false;

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      try {
        const stored = await chrome.storage.local.get(['isWebSearchEnabled', 'webSearchEnabled']);
        const dynamicSearch = typeof stored.isWebSearchEnabled === 'boolean'
          ? stored.isWebSearchEnabled
          : !!stored.webSearchEnabled;
        setEnableWebSearch(dynamicSearch);
        if (engineRef.current) {
          engineRef.current.setWebSearchEnabled(dynamicSearch);
        }
      } catch {}
    }
    if (engineRef.current) {
      engineRef.current.setLongHorizon(useLongHorizonAgent);
    }

    const targetMsg = messages.find(m => m.id === msgId);
    const stepN = (engineRef.current.getTotalSteps() || targetMsg?.logs.length) || 1;
    const longPrefix = (useLongHorizonAgent && mode === 'action') ? '[LONG-HORIZON TRANSACTION TASK MATRIX ACTIVE]\n' : '';
    const continuationInstruction = `${longPrefix}System: Resuming task from step ${stepN}. Continue toward the final goal using current page state and preserved observations.`;

    setIsWorking(true);
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, status: 'working' as const, manualAbort: false } : m));

    abortControllerRef.current = new AbortController();

    await engineRef.current.execute(
      continuationInstruction,
      {
        onLog: (msg) => setMessages(prev => prev.map(m => m.id === msgId ? { ...m, logs: [...m.logs, msg] } : m)),
        onMessage: (msg) => setMessages(prev => prev.map(m => m.id === msgId ? { ...m, text: msg } : m)),
        onSources: (sources) => setMessages(prev => prev.map(m => m.id === msgId ? { ...m, sources } : m)),
        onFinish: (reason: ExecutionTerminationState) => {
          setIsWorking(false);
          setMessages(prev => prev.map(m => {
            if (m.id === msgId) {
              if (reason === 'COMPLETED') {
                return { ...m, status: 'done' };
              } else if (reason === 'STEP_LIMIT_REACHED') {
                return { ...m, status: 'step_limit' };
              } else {
                const fallbackText = m.text ? m.text : "Execution terminated due to safety cycle limits or network fault.";
                return { ...m, text: fallbackText, status: 'aborted', manualAbort: isManualAbortRef.current };
              }
            }
            return m;
          }));
        }
      },
      abortControllerRef.current.signal,
      [],
      true // isContinuation
    );
  };

  const handleStop = () => {
    isManualAbortRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsWorking(false);
    }
    setMessages(prev => prev.map(m => m.status === 'working' ? { ...m, status: 'aborted' as const, manualAbort: true } : m));
    // Clear scratchpad on manual stop
    if (engineRef.current) {
      engineRef.current.clearScratchpad();
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
    if (engineRef.current) {
      engineRef.current.clearScratchpad();
      engineRef.current = null;
    }
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
    <div 
      className={`shadowstep-panel-root ${isDark ? 'ss-dark' : 'ss-light'}`}
      style={{
        '--ss-bg-primary': isDark ? '#0E0F10' : '#FFFFFF',
        '--ss-bg-secondary': isDark ? '#17191C' : '#F3F4F6',
        '--ss-bg-input': isDark ? '#121416' : '#F9FAFB',
        '--ss-card-bg': isDark ? '#141618' : '#FFFFFF',
        '--ss-dropdown-bg': isDark ? '#1A1C1E' : '#FFFFFF',
        '--ss-text-primary': isDark ? '#F5F6F7' : '#111827',
        '--ss-text-secondary': isDark ? '#C4C8D0' : '#4B5563',
        '--ss-text-muted': isDark ? '#94a3b8' : '#64748b',
        '--ss-icon-default': isDark ? '#94a3b8' : '#64748b',
        '--ss-icon-hover': '#FFFFFF',
        '--ss-border': isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
        '--ss-border-subtle': isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)',
        '--primary-color': '#00FFC2',
        '--accent-cyan': '#00FFC2',
        '--ss-accent': 'var(--primary-color, #00FFC2)',
        '--ss-accent-gradient': 'linear-gradient(135deg, #00FFC2 0%, #00B894 100%)',
        '--ss-accent-bg': 'rgba(0, 255, 194, 0.15)',
        '--ss-accent-border': 'rgba(0, 255, 194, 0.35)',
        '--ss-accent-glow': '0 0 14px rgba(0, 255, 194, 0.4)',
        '--ss-shadow': isDark ? '0 12px 40px rgba(0, 0, 0, 0.65)' : '0 12px 30px rgba(0, 0, 0, 0.12)',
        '--ss-chat-user-bg': isDark ? 'rgba(255, 255, 255, 0.06)' : '#F3F4F6',
        color: 'var(--ss-text-primary)',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important'
      } as any}
    >
      
      {/* ABSOLUTE FONT ISOLATION & GLOBAL SCOPED RESETS */}
      <style>{`
        :host, #shadowstep-isolated-container, .shadowstep-panel-root {
          all: initial !important;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
          font-size: 14px !important;
          line-height: 1.5 !important;
          box-sizing: border-box !important;
          color-scheme: dark;
          letter-spacing: normal !important;
        }

        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        .shadowstep-panel-root * {
          box-sizing: border-box !important;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
          letter-spacing: normal !important;
        }

        @keyframes shadowstep-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
        
        .shadowstep-icon-btn {
          all: unset !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          padding: 6px !important;
          border-radius: 6px !important;
          cursor: pointer !important;
          transition: background 0.15s ease, color 0.15s ease, outline 0.15s ease !important;
          box-sizing: border-box !important;
          color: var(--ss-icon-default) !important;
          outline: none !important;
        }
        .shadowstep-icon-btn:hover { 
          background-color: var(--ss-bg-secondary) !important; 
          color: var(--ss-icon-hover) !important; 
        }
        .shadowstep-icon-btn:focus-visible {
          outline: 2px solid var(--primary-color) !important;
          outline-offset: 1px !important;
          color: var(--primary-color) !important;
        }
        .shadowstep-icon-btn.danger:hover,
        .shadowstep-icon-btn.danger:focus-visible { 
          background-color: rgba(239, 68, 68, 0.1) !important; 
          color: #EF4444 !important; 
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
          transition: all 0.15s ease !important;
          flex-shrink: 0 !important;
          box-sizing: border-box !important;
          color: var(--ss-icon-default) !important;
          border: 1px solid transparent !important;
          outline: none !important;
        }
        .shadowstep-action-btn:hover {
          color: var(--primary-color) !important;
          border: 1px solid var(--primary-color) !important;
          background-color: var(--ss-bg-secondary) !important;
        }
        .shadowstep-action-btn:focus-visible {
          outline: 2px solid var(--primary-color) !important;
          outline-offset: 1px !important;
          color: var(--primary-color) !important;
          border: 1px solid var(--primary-color) !important;
        }
        .shadowstep-action-btn.is-active {
          background-color: var(--ss-accent-bg) !important;
          color: var(--primary-color) !important;
          border: 1px solid var(--primary-color) !important;
          box-shadow: var(--ss-accent-glow) !important;
        }
        .shadowstep-action-btn.is-active:hover {
          background-color: rgba(0, 255, 194, 0.28) !important;
          color: var(--primary-color) !important;
          border: 1px solid var(--primary-color) !important;
          box-shadow: 0 0 14px rgba(0, 255, 194, 0.5) !important;
        }
        .shadowstep-action-btn.is-runnable {
          background-color: var(--primary-color) !important;
          color: #0E0F10 !important;
          border: 1px solid var(--primary-color) !important;
          box-shadow: 0 0 10px var(--ss-accent-glow) !important;
        }
        .shadowstep-action-btn.is-runnable:hover,
        .shadowstep-action-btn.is-runnable:focus-visible {
          background-color: var(--primary-color) !important;
          color: #0E0F10 !important;
          filter: brightness(1.1) !important;
          border: 1px solid var(--primary-color) !important;
          box-shadow: 0 0 14px var(--ss-accent-glow) !important;
        }
        .shadowstep-action-btn.is-working {
          background-color: rgba(239, 68, 68, 0.15) !important;
          color: #EF4444 !important;
        }
        .shadowstep-action-btn.is-working:hover,
        .shadowstep-action-btn.is-working:focus-visible {
          background-color: rgba(239, 68, 68, 0.25) !important;
          color: #EF4444 !important;
        }

        .shadowstep-proceed-btn {
          all: unset !important;
          display: inline-flex !important;
          align-items: center !important;
          gap: 6px !important;
          margin-top: 8px !important;
          background-color: var(--ss-accent-bg) !important;
          color: var(--primary-color) !important;
          border: 1px solid var(--ss-accent-border) !important;
          padding: 6px 12px !important;
          border-radius: 6px !important;
          font-size: 12px !important;
          font-weight: 500 !important;
          cursor: pointer !important;
          transition: all 0.15s ease !important;
          box-sizing: border-box !important;
        }
        .shadowstep-proceed-btn:hover {
          background-color: var(--primary-color) !important;
          color: #0E0F10 !important;
          border: 1px solid var(--primary-color) !important;
          box-shadow: var(--ss-accent-glow) !important;
        }

        .shadowstep-source-chip {
          all: unset !important;
          display: inline-flex !important;
          align-items: center !important;
          gap: 5px !important;
          padding: 3px 8px !important;
          border-radius: 12px !important;
          background-color: var(--ss-bg-secondary) !important;
          border: 1px solid var(--ss-border) !important;
          color: var(--ss-text-secondary) !important;
          font-size: 11px !important;
          text-decoration: none !important;
          cursor: pointer !important;
          transition: all 0.15s ease !important;
          box-sizing: border-box !important;
          line-height: 1.3 !important;
        }
        .shadowstep-source-chip:hover {
          border-color: var(--primary-color) !important;
          color: var(--primary-color) !important;
          background-color: var(--ss-accent-bg) !important;
          box-shadow: 0 0 8px var(--ss-accent-glow) !important;
        }

        .shadowstep-msg-wrapper {
          position: relative;
        }
        .shadowstep-toolbar-btn {
          all: unset !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          width: 22px !important;
          height: 22px !important;
          border-radius: 4px !important;
          cursor: pointer !important;
          color: #64748b !important;
          background-color: var(--ss-bg-secondary) !important;
          border: 1px solid var(--ss-border-subtle) !important;
          transition: all 0.15s ease !important;
          box-sizing: border-box !important;
        }
        .shadowstep-toolbar-btn:hover {
          color: var(--primary-color) !important;
          background-color: var(--ss-bg-input) !important;
          border-color: var(--primary-color) !important;
        }
        .shadowstep-toolbar-btn.is-active {
          color: var(--primary-color) !important;
          border-color: var(--primary-color) !important;
          background-color: var(--ss-accent-bg) !important;
        }

        .shadowstep-msg-action-btn {
          all: unset !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          cursor: pointer !important;
          color: #64748b !important;
          opacity: 0.7 !important;
          transition: opacity 0.15s ease, color 0.15s ease !important;
          padding: 2px !important;
          line-height: 1 !important;
        }
        .shadowstep-msg-action-btn:hover {
          opacity: 1 !important;
          color: var(--primary-color) !important;
        }

        .shadowstep-input-tray {
          border: 1px solid var(--ss-border) !important;
          transition: border-color 0.15s ease, box-shadow 0.15s ease !important;
        }
        .shadowstep-input-tray:focus-within {
          border-color: var(--primary-color) !important;
          box-shadow: 0 0 0 1px var(--primary-color), var(--ss-accent-glow) !important;
        }

        .shadowstep-textarea {
          all: unset !important;
          flex: 1 !important;
          background-color: transparent !important;
          border: none !important;
          color: var(--ss-text-primary) !important;
          font-size: 13px !important;
          line-height: 1.5 !important;
          padding: 4px 2px !important;
          max-height: 120px !important;
          overflow-y: auto !important;
          resize: none !important;
          box-sizing: border-box !important;
        }
        .shadowstep-textarea::-webkit-scrollbar { display: none !important; }

        .shadowstep-popup-btn {
          all: unset !important;
          display: flex !important;
          align-items: center !important;
          gap: 10px !important;
          width: 100% !important;
          padding: 8px 10px !important;
          border-radius: 6px !important;
          cursor: pointer !important;
          font-size: 12px !important;
          color: var(--ss-text-primary) !important;
          transition: background 0.15s !important;
          box-sizing: border-box !important;
        }
        .shadowstep-popup-btn:hover { background-color: var(--ss-bg-secondary) !important; }
        .shadowstep-popup-btn.danger { color: #EF4444 !important; }
        .shadowstep-popup-btn.danger:hover { background-color: rgba(239, 68, 68, 0.1) !important; }

        .shadowstep-inline-input {
          all: unset !important;
          flex: 1 !important;
          background-color: var(--ss-bg-secondary) !important;
          border: 1px solid var(--ss-accent) !important;
          color: var(--ss-text-primary) !important;
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
          background-color: var(--ss-accent) !important;
          color: #FFFFFF !important;
          border-radius: 8px !important;
          padding: 10px 20px !important;
          font-size: 13px !important;
          font-weight: 600 !important;
          cursor: pointer !important;
          transition: opacity 0.15s !important;
          box-sizing: border-box !important;
        }
        .shadowstep-btn-primary:hover { opacity: 0.9 !important; }

        .shadowstep-text-btn {
          all: unset !important;
          cursor: pointer !important;
          font-weight: 600 !important;
          font-size: 10px !important;
        }

        .shadowstep-panel-root svg {
          flex-shrink: 0 !important;
          color: inherit;
        }
        .shadowstep-icon-btn svg,
        .shadowstep-action-btn svg {
          stroke: currentColor;
          fill: none;
        }
        .shadowstep-icon-btn svg[fill="currentColor"],
        .shadowstep-action-btn svg[fill="currentColor"] {
          fill: currentColor;
          stroke: none;
        }
        .shadowstep-panel-root svg path,
        .shadowstep-panel-root svg circle,
        .shadowstep-panel-root svg line,
        .shadowstep-panel-root svg rect,
        .shadowstep-panel-root svg polyline,
        .shadowstep-panel-root svg polygon {
          stroke: inherit;
          fill: inherit;
        }
      `}</style>

      {/* Hidden file attachment input */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileSelect}
        multiple 
        accept=".png,.jpg,.jpeg,.webp,.pdf,.docx,.doc,.txt,.md,.json,.csv"
        style={{ display: 'none' }}
      />

      {selectionMode !== 'none' && (
        <SelectionOverlay 
          mode={selectionMode}
          onCancel={() => setSelectionMode('none')}
          onComplete={(sel: ExtractedSelection) => {
            const newAtt: AttachmentItem = {
              id: `crop-${Date.now()}`,
              type: 'crop_selection',
              name: `Screen Crop (${sel.mode.toUpperCase()})`,
              previewUrl: sel.imageBase64,
              base64: sel.imageBase64,
              extractedText: sel.text
            };
            setAttachments(prev => [...prev, newAtt]);
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
          width: '380px', 
          height: '100vh', 
          backgroundColor: 'var(--ss-bg-primary)', 
          boxShadow: 'var(--ss-shadow)', 
          transition: `${panelSide} 0.22s cubic-bezier(0.2, 1, 0.2, 1), background-color 0.2s`,
          ...(panelSide === 'left' ? { left: isOpen ? '0px' : '-400px', borderRight: '1px solid var(--ss-border)' } : { right: isOpen ? '0px' : '-400px', borderLeft: '1px solid var(--ss-border)' }),
          display: 'flex', flexDirection: 'column', boxSizing: 'border-box', padding: '16px', zIndex: 2147483647 
        }}
      >
        {toastMessage && (
          <div style={{
            position: 'absolute',
            top: '56px',
            left: '14px',
            right: '14px',
            zIndex: 500,
            backgroundColor: '#1E293B',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#F8FAFC',
            borderRadius: '8px',
            padding: '10px 12px',
            fontSize: '12px',
            lineHeight: 1.4,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
              <svg width="15" height="15" fill="none" stroke="#EF4444" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{toastMessage}</span>
            </div>
            <button
              onClick={() => setToastMessage(null)}
              style={{
                background: 'none',
                border: 'none',
                color: '#94A3B8',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}
        
        {/* Task 3: Top Bar Cleanup (Removed redundant platform badge) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '12px', height: '12px', border: '2px solid var(--ss-accent)', borderRadius: '50%', boxSizing: 'border-box' }} />
            <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 600, letterSpacing: '-0.3px', color: 'var(--ss-text-primary)' }}>ShadowStep</h2>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            <button className="shadowstep-icon-btn" onClick={() => { handleRestart(); setShowHistory(false); }} title="New Chat">
              <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.92-10.27l-3.26-1.09" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <button className="shadowstep-icon-btn" onClick={() => setShowHistory(!showHistory)} title="History" style={{ color: showHistory ? 'var(--ss-accent)' : undefined }}>
              <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </button>
            <button className="shadowstep-icon-btn" onClick={openOptionsPage} title="Settings">
              <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
            <button className="shadowstep-icon-btn danger" onClick={() => setIsOpen(false)} title="Minimize Panel">
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </div>

        {isConfigured ? (
          <>
            {/* Mode Selector (Chat vs Action) */}
            <div style={{ display: 'flex', backgroundColor: 'var(--ss-bg-secondary)', borderRadius: '20px', padding: '3px', marginBottom: '12px', border: '1px solid var(--ss-border-subtle)', flexShrink: 0 }}>
              <button 
                onClick={() => setMode('chat')} 
                title="Ask questions about this page" 
                style={{ 
                  flex: 1, 
                  background: mode === 'chat' ? 'var(--ss-card-bg)' : 'transparent', 
                  border: mode === 'chat' ? '1px solid var(--ss-border)' : '1px solid transparent', 
                  color: mode === 'chat' ? 'var(--ss-text-primary)' : 'var(--ss-text-muted)', 
                  padding: '6px 0', 
                  fontSize: '11px', 
                  borderRadius: '16px', 
                  cursor: 'pointer', 
                  fontWeight: 600,
                  boxShadow: mode === 'chat' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                Chat Mode
              </button>
              <button 
                onClick={() => setMode('action')} 
                title="Let the assistant interact with the page" 
                style={{ 
                  flex: 1, 
                  background: mode === 'action' ? 'var(--ss-accent-bg)' : 'transparent', 
                  border: mode === 'action' ? '1px solid var(--primary-color)' : '1px solid transparent', 
                  color: mode === 'action' ? 'var(--primary-color)' : 'var(--ss-text-muted)', 
                  boxShadow: mode === 'action' ? 'var(--ss-accent-glow)' : 'none', 
                  padding: '6px 0', 
                  fontSize: '11px', 
                  borderRadius: '16px', 
                  cursor: 'pointer', 
                  fontWeight: 600,
                  transition: 'all 0.15s ease'
                }}
              >
                Action Mode
              </button>
            </div>

            {/* History Overlay */}
            {showHistory && (
              <div style={{ position: 'absolute', top: '70px', left: '16px', right: '16px', bottom: '80px', backgroundColor: 'var(--ss-bg-primary)', zIndex: 100, display: 'flex', flexDirection: 'column', overflowY: 'auto', paddingRight: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--ss-text-muted)', fontWeight: 600, letterSpacing: '0.8px' }}>RECENT SESSIONS ({threads.length}/100)</div>
                  {threads.length > 0 && (
                    <button className="shadowstep-text-btn" onClick={handleClearAll} style={{ color: '#EF4444' }}>Remove All</button>
                  )}
                </div>
                
                {threads.length === 0 && <div style={{ color: 'var(--ss-text-muted)', textAlign: 'center', marginTop: '20px', fontSize: '12px' }}>No session logs recorded.</div>}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingBottom: '20px' }}>
                  {threads.map(thread => (
                    <div 
                      key={thread.id}
                      onClick={() => {
                        if (editingThreadId === thread.id) return;
                        if (engineRef.current) engineRef.current.clearScratchpad();
                        setActiveThreadId(thread.id);
                        const castedMessages = thread.messages.map(m => ({
                          id: m.id, role: m.role as 'user' | 'agent', text: m.text, logs: m.logs, status: m.status as 'idle' | 'working' | 'done' | 'step_limit' | 'aborted', timestamp: m.timestamp
                        }));
                        setMessages(castedMessages);
                        setShowHistory(false);
                      }}
                      style={{ padding: '10px 12px', backgroundColor: activeThreadId === thread.id ? 'var(--ss-bg-secondary)' : 'var(--ss-card-bg)', borderRadius: '8px', cursor: 'pointer', border: '1px solid var(--ss-border)', display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative' }}
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
                          <div style={{ color: 'var(--ss-text-primary)', fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: '20px' }}>{thread.title}</div>
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
                        <span style={{ fontSize: '9px', color: 'var(--ss-text-muted)' }}>{new Date(thread.updatedAt).toLocaleDateString()} • {thread.messages.length} lines</span>
                        {thread.messages.length > 0 && thread.messages[thread.messages.length - 1].status === 'aborted' && (
                          <span style={{ width: '5px', height: '5px', backgroundColor: '#EF4444', borderRadius: '50%' }} />
                        )}
                      </div>

                      {activeOptionsMenu === thread.id && (
                        <div style={{ position: 'absolute', top: '28px', right: '10px', backgroundColor: 'var(--ss-dropdown-bg)', border: '1px solid var(--ss-border)', borderRadius: '6px', boxShadow: 'var(--ss-shadow)', zIndex: 110, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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

            {/* Chat Stream Area */}
            <div className="shadowstep-chat-stream" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '18px', marginBottom: '12px', paddingRight: '4px', textAlign: 'left' }}>
              <style>{`.shadowstep-chat-stream::-webkit-scrollbar { width: 3px; } .shadowstep-chat-stream::-webkit-scrollbar-track { background: transparent; } .shadowstep-chat-stream::-webkit-scrollbar-thumb { background: var(--ss-border); border-radius: 6px; }`}</style>
              
              {messages.length === 0 && (
                <div style={{ color: 'var(--ss-text-muted)', textAlign: 'center', margin: 'auto', fontSize: '13px', letterSpacing: '-0.1px', lineHeight: 1.6 }}>
                  How can I assist you on this page?
                  <div style={{ fontSize: '11px', color: 'var(--ss-text-muted)', marginTop: '4px', opacity: 0.8 }}>
                    Use the '+' menu below for file attachments, vision crops, and options
                  </div>
                </div>
              )}
              
              {messages.map((msg) => (
                <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', width: '100%' }}>
                  
                  {msg.role === 'user' && (
                    <div className="shadowstep-msg-wrapper" style={{ position: 'relative', maxWidth: '88%', alignSelf: 'flex-end', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginBottom: '2px' }}>
                      <div style={{ backgroundColor: 'var(--ss-chat-user-bg)', padding: '10px 14px', borderRadius: '16px 16px 4px 16px', fontSize: '13px', color: 'var(--ss-text-primary)', whiteSpace: 'pre-wrap', textAlign: 'left', wordBreak: 'break-word', border: '1px solid var(--ss-border-subtle)', width: '100%', boxSizing: 'border-box' }}>
                        {msg.text}
                        {msg.images && msg.images.length > 0 && (
                          <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                            {msg.images.map((img, i) => (
                              <img key={i} src={img} alt="Attached Visual" style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--ss-border)' }} />
                            ))}
                          </div>
                        )}
                        {/* Compact inline footer: [Copy Icon] [Timestamp] */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', marginTop: '4px', lineHeight: 1 }}>
                          <button 
                            className="shadowstep-msg-action-btn" 
                            onClick={() => handleCopy(msg.id, msg.text)}
                            title={copiedMsgId === msg.id ? "Copied!" : "Copy message"}
                          >
                            {copiedMsgId === msg.id ? (
                              <svg width="11" height="11" fill="none" stroke="var(--primary-color)" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                            ) : (
                              <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            )}
                          </button>
                          <span style={{ fontSize: '11px', color: '#64748b', opacity: 0.85 }}>{formatTime(msg.timestamp)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {msg.role === 'agent' && (
                    <div className="shadowstep-msg-wrapper" style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left', marginBottom: '2px' }}>
                      {/* Modern "Thinking" accordion */}
                      <ModernThinkingAccordion logs={msg.logs} status={msg.status} />
                      
                      {msg.text && (
                        <div style={{ fontSize: '13px', color: 'var(--ss-text-primary)', width: '100%', paddingLeft: '2px', wordBreak: 'break-word' }}>
                          {renderMarkdown(msg.text)}

                          {/* Task 3.3: Citations & Sources UI */}
                          {msg.sources && msg.sources.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px', marginBottom: '6px' }}>
                              {msg.sources.map((src, sIdx) => (
                                <a
                                  key={sIdx}
                                  href={src.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="shadowstep-source-chip"
                                  title={`${src.title}\n${src.url}`}
                                >
                                  <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <circle cx="11" cy="11" r="8"></circle>
                                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                  </svg>
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                                    {src.title || `Source ${sIdx + 1}`}
                                  </span>
                                  <span style={{ opacity: 0.6, fontSize: '10px' }}>↗</span>
                                </a>
                              ))}
                            </div>
                          )}

                          {/* Agent single-row horizontal footer: [Copy] [Redo] [Retry] ... [Timestamp] */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px', width: '100%' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              {msg.status !== 'working' && msg.text && (
                                <>
                                  <button 
                                    className="shadowstep-toolbar-btn" 
                                    onClick={() => handleCopy(msg.id, msg.text)}
                                    title={copiedMsgId === msg.id ? "Copied!" : "Copy response"}
                                  >
                                    {copiedMsgId === msg.id ? (
                                      <svg width="12" height="12" fill="none" stroke="var(--primary-color)" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                                    ) : (
                                      <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                    )}
                                  </button>

                                  {!isWorking && (
                                    <>
                                      <button 
                                        className="shadowstep-toolbar-btn" 
                                        onClick={() => handleRedoOrRetry(msg.id)}
                                        title="Redo response"
                                      >
                                        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 4v6h6M23 20v-6h-6M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
                                      </button>

                                      <div style={{ position: 'relative' }}>
                                        <button 
                                          className={`shadowstep-toolbar-btn ${retryDropdownMsgId === msg.id ? 'is-active' : ''}`}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setRetryDropdownMsgId(prev => prev === msg.id ? null : msg.id);
                                          }}
                                          title="Retry with alternate model"
                                        >
                                          <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                                        </button>

                                        {retryDropdownMsgId === msg.id && (
                                          <div 
                                            onClick={(e) => e.stopPropagation()}
                                            style={{
                                              position: 'absolute',
                                              bottom: '100%',
                                              left: '0',
                                              marginBottom: '6px',
                                              backgroundColor: 'var(--ss-dropdown-bg)',
                                              border: '1px solid var(--ss-border)',
                                              borderRadius: '8px',
                                              padding: '4px',
                                              boxShadow: 'var(--ss-shadow)',
                                              zIndex: 150,
                                              minWidth: '175px',
                                              display: 'flex',
                                              flexDirection: 'column',
                                              gap: '2px'
                                            }}
                                          >
                                            <div style={{ padding: '4px 8px', fontSize: '10px', color: 'var(--ss-text-muted)', fontWeight: 600, letterSpacing: '0.5px' }}>
                                              RETRY WITH MODEL
                                            </div>
                                            {modelOptions.filter(opt => opt.value !== 'auto').map(opt => (
                                              <button
                                                key={opt.value}
                                                className="shadowstep-popup-btn"
                                                onClick={() => handleRedoOrRetry(msg.id, opt.value)}
                                                style={{ padding: '6px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}
                                              >
                                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: routeSelection === opt.value ? 'var(--primary-color)' : 'transparent', border: '1px solid var(--primary-color)' }} />
                                                {opt.label}
                                              </button>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </>
                                  )}
                                </>
                              )}
                            </div>

                            <div style={{ fontSize: '11px', color: '#64748b', textAlign: 'right', lineHeight: 1, opacity: 0.85, flexShrink: 0 }}>
                              {formatTime(msg.timestamp)}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Continuation button - shown when interrupted or paused, suppressed on completion or user abort */}
                      {!isWorking && (msg.status === 'step_limit' || (msg.status === 'aborted' && !msg.manualAbort)) && !msg.text?.includes('[DONE]') && (
                        <button 
                          onClick={() => handleResume(msg.id)}
                          className="shadowstep-proceed-btn"
                          title="Continue toward the final goal using current page state and preserved observations"
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

            {/* Removable Attachment Chips */}
            {(attachments.length > 0 || attachedContexts.length > 0) && (
              <div className="shadowstep-scroll-dock" style={{ marginBottom: '8px', display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px', scrollbarWidth: 'none', msOverflowStyle: 'none', width: '100%' }}>
                <style>{`.shadowstep-scroll-dock::-webkit-scrollbar { display: none; }`}</style>
                
                {attachments.map((att) => (
                  <div key={att.id} style={{ display: 'flex', alignItems: 'center', backgroundColor: 'var(--ss-accent-bg)', border: '1px solid var(--ss-accent-border)', borderRadius: '10px', padding: '4px 8px', flexShrink: 0, maxWidth: '170px' }}>
                    {att.previewUrl ? (
                      <img src={att.previewUrl} alt={att.name} style={{ width: '24px', height: '24px', borderRadius: '4px', objectFit: 'cover', marginRight: '6px', flexShrink: 0, border: '1px solid var(--ss-accent-border)' }} />
                    ) : (
                      <div style={{ width: '24px', height: '24px', borderRadius: '4px', backgroundColor: 'var(--ss-bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '6px', flexShrink: 0 }}>
                        <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--ss-accent)' }}>
                          {att.name.split('.').pop()?.toUpperCase() || 'DOC'}
                        </span>
                      </div>
                    )}
                    <div style={{ flex: 1, overflow: 'hidden', marginRight: '4px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--ss-accent)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{att.name}</div>
                      <div style={{ fontSize: '9px', color: 'var(--ss-text-muted)' }}>{att.type === 'crop_selection' ? 'Screen Crop' : (att.size ? `${Math.round(att.size / 1024)} KB` : 'Attached')}</div>
                    </div>
                    <button className="shadowstep-icon-btn" onClick={() => setAttachments(prev => prev.filter(a => a.id !== att.id))} style={{ padding: '2px' }}>
                      <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                  </div>
                ))}

                {attachedContexts.map((ctxText, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', backgroundColor: 'var(--ss-bg-secondary)', border: '1px solid var(--ss-border)', borderRadius: '10px', padding: '4px 8px', flexShrink: 0, maxWidth: '170px' }}>
                    <div style={{ width: '22px', height: '22px', borderRadius: '4px', backgroundColor: 'var(--ss-card-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '6px', flexShrink: 0 }}>
                      <svg width="11" height="11" fill="none" stroke="var(--ss-accent)" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                    </div>
                    <div style={{ flex: 1, overflow: 'hidden', marginRight: '4px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--ss-text-primary)', lineHeight: '1.2' }}>Text Clip #{idx + 1}</div>
                      <div style={{ fontSize: '9px', color: 'var(--ss-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ctxText}</div>
                    </div>
                    <button className="shadowstep-icon-btn" onClick={() => setAttachedContexts(prev => prev.filter((_, i) => i !== idx))} style={{ padding: '2px' }}>
                      <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Task 2: Redesigned Input Area */}
            <div 
              className="shadowstep-input-tray"
              style={{ 
                position: 'relative', 
                zIndex: 50, 
                flexShrink: 0, 
                backgroundColor: 'var(--ss-bg-input)', 
                borderRadius: '16px', 
                display: 'flex', 
                flexDirection: 'column', 
                padding: '8px 10px', 
                gap: '6px' 
              }}
            >
              
              {/* Task 1: Fixed '+' Pop-up Menu */}
              {showPlusMenu && (
                <div 
                  ref={plusMenuRef}
                  onClick={(e) => e.stopPropagation()}
                  style={{ 
                    position: 'absolute', 
                    bottom: '100%', 
                    left: '0', 
                    marginBottom: '8px', 
                    backgroundColor: 'var(--ss-dropdown-bg)', 
                    border: '1px solid var(--ss-border)', 
                    borderRadius: '12px', 
                    padding: '8px', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '4px', 
                    boxShadow: 'var(--ss-shadow)', 
                    zIndex: 120, 
                    minWidth: '235px',
                    animation: 'shadowstep-dropdown-fade 0.16s cubic-bezier(0.2, 1, 0.2, 1)' 
                  }}
                >
                  <style>{`
                    @keyframes shadowstep-dropdown-fade {
                      from { opacity: 0; transform: translateY(4px); }
                      to { opacity: 1; transform: translateY(0); }
                    }
                  `}</style>

                  {/* Toggle: Include Page Images */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '7px 9px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--ss-bg-secondary)'
                  }}>
                    <span style={{ fontSize: '11px', color: 'var(--ss-text-primary)', display: 'flex', alignItems: 'center', gap: '7px', fontWeight: 500 }}>
                      <svg width="13" height="13" fill="none" stroke={includePageImages ? "var(--ss-accent)" : "currentColor"} strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                      Include Page Images
                    </span>
                    <label style={{ position: 'relative', display: 'inline-block', width: '28px', height: '16px', cursor: 'pointer', margin: 0 }}>
                      <input 
                        type="checkbox" 
                        checked={includePageImages} 
                        onChange={(e: any) => handlePageImagesToggle(e.target.checked)}
                        style={{ opacity: 0, width: 0, height: 0 }} 
                      />
                      <span style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: includePageImages ? 'var(--ss-accent)' : 'var(--ss-border)',
                        borderRadius: '20px', transition: '0.2s'
                      }}>
                        <span style={{
                          position: 'absolute', height: '12px', width: '12px', left: includePageImages ? '14px' : '2px', bottom: '2px',
                          backgroundColor: '#FFF',
                          borderRadius: '50%', transition: '0.2s'
                        }} />
                      </span>
                    </label>
                  </div>

                  {/* Task 2.1: Toggle: Web Search */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '7px 9px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--ss-bg-secondary)',
                    marginBottom: '2px'
                  }}>
                    <span style={{ fontSize: '11px', color: 'var(--ss-text-primary)', display: 'flex', alignItems: 'center', gap: '7px', fontWeight: 500 }}>
                      <svg width="13" height="13" fill="none" stroke={webSearchEnabled ? "var(--primary-color)" : "currentColor"} strokeWidth="2" viewBox="0 0 24 24">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                      </svg>
                      Web Search
                    </span>
                    <label style={{ position: 'relative', display: 'inline-block', width: '28px', height: '16px', cursor: 'pointer', margin: 0 }}>
                      <input 
                        type="checkbox" 
                        checked={webSearchEnabled} 
                        onChange={(e: any) => handleWebSearchToggle(e.target.checked)}
                        style={{ opacity: 0, width: 0, height: 0 }} 
                      />
                      <span style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: webSearchEnabled ? 'var(--primary-color)' : 'var(--ss-border)',
                        borderRadius: '20px', transition: '0.2s',
                        boxShadow: webSearchEnabled ? 'var(--ss-accent-glow)' : 'none'
                      }}>
                        <span style={{
                          position: 'absolute', height: '12px', width: '12px', left: webSearchEnabled ? '14px' : '2px', bottom: '2px',
                          backgroundColor: webSearchEnabled ? '#0E0F10' : '#FFF',
                          borderRadius: '50%', transition: '0.2s'
                        }} />
                      </span>
                    </label>
                  </div>

                  <div style={{ height: '1px', backgroundColor: 'var(--ss-border)', margin: '2px 0' }} />

                  {/* File attachment: Images */}
                  <button className="shadowstep-popup-btn" onClick={() => { 
                    if (fileInputRef.current) {
                      fileInputRef.current.accept = ".png,.jpg,.jpeg,.webp";
                      fileInputRef.current.click();
                    }
                    setShowPlusMenu(false); 
                  }}>
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                    Attach Images (PNG, JPG, WEBP)
                  </button>

                  {/* File attachment: Documents */}
                  <button className="shadowstep-popup-btn" onClick={() => { 
                    if (fileInputRef.current) {
                      fileInputRef.current.accept = ".pdf,.docx,.doc,.txt,.md,.json,.csv";
                      fileInputRef.current.click();
                    }
                    setShowPlusMenu(false); 
                  }}>
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                    Attach Documents (PDF, TXT, DOCX)
                  </button>

                  {/* Bounding box crop */}
                  <button className="shadowstep-popup-btn" onClick={() => { setSelectionMode('box'); setShowPlusMenu(false); setIsOpen(false); }}>
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" strokeDasharray="3 3"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
                    Bounding Box Screen Crop
                  </button>

                  {/* Lasso crop */}
                  <button className="shadowstep-popup-btn" onClick={() => { setSelectionMode('lasso'); setShowPlusMenu(false); setIsOpen(false); }}>
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle></svg>
                    Free Form Lasso Crop
                  </button>
                </div>
              )}

              {/* Textarea */}
              <textarea 
                className="shadowstep-textarea"
                ref={textareaRef}
                rows={1}
                placeholder={useLongHorizonAgent && mode === 'action' ? "Describe multi-frame task..." : `Ask anything as ${userName}...`}
                value={inputValue}
                onInput={handleInput}
                onKeyDown={handleKeyDown}
              />
              
              {/* Bottom Toolbar inside Input Container */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', paddingTop: '2px' }}>
                
                {/* Left Controls: '+' Button and Model Selection Dropdown */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  
                  {/* Task 1: '+' Button */}
                  <button 
                    ref={plusBtnRef}
                    className={`shadowstep-action-btn ${showPlusMenu ? 'is-active' : ''}`} 
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowPlusMenu(prev => !prev);
                    }} 
                    title="Add attachments, screen crop, or context options"
                  >
                    <svg 
                      width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"
                      style={{ transform: showPlusMenu ? 'rotate(45deg)' : 'none', transition: 'transform 0.15s ease' }}
                    >
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                  </button>

                  {/* Task 3 & 4: Custom Reusable Dropdown for Model Selection */}
                  <CustomDropdown<RouteSelection>
                    options={modelOptions}
                    value={routeSelection}
                    onChange={handleRouteSelect}
                    size="sm"
                    direction="up"
                    title="AI Model & Pipeline Routing"
                  />

                  {mode === 'action' && (
                    <button 
                      className={`shadowstep-action-btn ${useLongHorizonAgent ? 'is-active' : ''}`} 
                      onClick={() => {
                        const next = !useLongHorizonAgent;
                        setUseLongHorizonAgent(next);
                        if (engineRef.current) engineRef.current.setLongHorizon(next);
                      }} 
                      title={useLongHorizonAgent ? "Long Execution Mode Active" : "Enable Long Execution Mode"} 
                    >
                      <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg>
                    </button>
                  )}
                </div>

                {/* Right Controls: Send / Stop Button */}
                <button 
                  className={`shadowstep-action-btn ${isWorking ? 'is-working' : (isRunnable ? 'is-runnable' : '')}`}
                  onClick={isWorking ? handleStop : () => handleSend()} 
                  title={isWorking ? "Stop Execution" : (isRunnable ? "Send Message (Enter)" : "Enter a message or attachment")}
                  disabled={!isWorking && !isRunnable}
                  style={{ 
                    cursor: (isRunnable || isWorking) ? 'pointer' : 'default' 
                  }}
                >
                  {isWorking ? ( 
                    <svg width="10" height="10" fill="currentColor" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="1" ry="1"></rect></svg> 
                  ) : ( 
                    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg> 
                  )}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '20px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
              <svg width="24" height="24" fill="none" stroke="#EF4444" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 600, color: 'var(--ss-text-primary)' }}>API Setup Required</h3>
            <p style={{ margin: '0 0 24px 0', fontSize: '13px', color: 'var(--ss-text-muted)', lineHeight: '1.5' }}>
              ShadowStep requires at least one configured provider (Gemini, Groq, or Cloudflare Workers AI) to establish inference routing.
            </p>
            <button className="shadowstep-btn-primary" onClick={openOptionsPage}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><circle cx="12" cy="12" r="3" /></svg>
              Open Settings
            </button>
          </div>
        )}
      </div>
    </div>
  );
}