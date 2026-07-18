import { useState, useEffect } from 'preact/hooks';

interface StorageResult {
  groqKeys?: string[];
  cerebrasKeys?: string[];
  engineStatus?: string;
  userName?: string;
}

export function App() {
  const [nameInput, setNameInput] = useState('');
  const [groqInput, setGroqInput] = useState('');
  const [cerebrasInput, setCerebrasInput] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [isConfigured, setIsConfigured] = useState(false);

  // 🛑 NEW: Visibility toggles for API keys
  const [showGroq, setShowGroq] = useState(false);
  const [showCerebras, setShowCerebras] = useState(false);

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(['groqKeys', 'cerebrasKeys', 'engineStatus', 'userName'], (result: StorageResult) => {
        if (result.engineStatus === 'active') {
          if (result.groqKeys) setGroqInput(result.groqKeys.join(', '));
          if (result.cerebrasKeys) setCerebrasInput(result.cerebrasKeys.join(', '));
          if (result.userName) setNameInput(result.userName);
          setIsConfigured(true);
        }
      });
    }
  }, []);

  const handleSaveMetrics = () => {
    const parsedGroq = groqInput.split(',').map(k => k.trim()).filter(k => k.length > 0);
    const parsedCerebras = cerebrasInput.split(',').map(k => k.trim()).filter(k => k.length > 0);
    const cleanName = nameInput.trim() || 'Operator';

    if (parsedGroq.length === 0 && parsedCerebras.length === 0) {
      setSaveStatus('error');
      setStatusMessage('Error: Minimum of one API key required to establish routing.');
      return;
    }

    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({
        groqKeys: parsedGroq,
        cerebrasKeys: parsedCerebras,
        userName: cleanName,
        engineStatus: 'active'
      }, () => {
        setSaveStatus('success');
        setStatusMessage('Configuration Saved. You may now close this tab.');
        setIsConfigured(true);
      });
    } else {
      setSaveStatus('success');
      setStatusMessage('Local Sandbox Saved. You may now close this tab.');
      setIsConfigured(true);
    }
  };

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      minHeight: '100vh',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      backgroundColor: '#0E1012',
      color: '#F5F6F7',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 20px',
      boxSizing: 'border-box',
      overflowY: 'auto'
    }}>
      <style>{`
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          background-color: #0E1012 !important;
          width: 100%;
          height: 100%;
        }
      `}</style>

      <div style={{
        width: '100%',
        maxWidth: '560px',
        backgroundColor: 'rgba(20, 22, 26, 0.65)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        borderRadius: '16px',
        padding: '40px',
        boxShadow: '0 30px 60px rgba(0, 0, 0, 0.6)',
        boxSizing: 'border-box'
      }}>
        
        {/* BRAND IDENTITY */}
        <div style={{ marginBottom: '32px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <img src="./icon.png" alt="ShadowStep" style={{ width: '48px', height: '48px', marginBottom: '16px', filter: 'drop-shadow(0 0 12px rgba(0,255,194,0.4))' }} />
          <h1 style={{ fontSize: '24px', fontWeight: 600, margin: '0 0 6px 0', letterSpacing: '-0.5px' }}>
            ShadowStep <span style={{ color: '#00FFC2', fontWeight: 300 }}>Control Hub</span>
          </h1>
          <p style={{ color: '#6A7280', fontSize: '13px', margin: 0 }}>
            Configure your identity and parallel routing pipelines.
          </p>
        </div>

        {/* INPUT CONTAINER CLUSTERS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginBottom: '32px' }}>
          
          {/* OPERATOR NAME */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#9CA3AF', letterSpacing: '0.8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                OPERATOR DESIGNATION
              </label>
            </div>
            <input 
              type="text"
              placeholder="e.g., Meher"
              value={nameInput}
              onInput={(e) => setNameInput((e.target as HTMLInputElement).value)}
              style={{
                width: '100%',
                backgroundColor: 'rgba(0, 0, 0, 0.2)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '12px',
                color: '#FFF',
                fontSize: '13px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />

          {/* GROQ KEYS */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#9CA3AF', letterSpacing: '0.8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line></svg>
                GROQ PIPELINE KEYS (PRIMARY)
              </label>
              <span style={{ fontSize: '11px', color: '#888' }}>Optional</span>
            </div>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input 
                type={showGroq ? "text" : "password"}
                placeholder="gsk_A1..., gsk_B2..."
                value={groqInput}
                onInput={(e) => setGroqInput((e.target as HTMLInputElement).value)}
                style={{
                  width: '100%',
                  backgroundColor: 'rgba(0, 0, 0, 0.2)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '8px',
                  padding: '12px 42px 12px 12px',
                  color: '#FFF',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              <button 
                type="button"
                onClick={() => setShowGroq(!showGroq)}
                style={{ position: 'absolute', right: '12px', background: 'none', border: 'none', color: '#6A7280', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
              >
                {showGroq ? (
                  <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                ) : (
                  <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                )}
              </button>
            </div>
          </div>

          {/* CEREBRAS KEYS */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#9CA3AF', letterSpacing: '0.8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line></svg>
                CEREBRAS PIPELINE KEYS (SECONDARY)
              </label>
              <span style={{ fontSize: '11px', color: '#888' }}>Optional</span>
            </div>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input 
                type={showCerebras ? "text" : "password"}
                placeholder="csk_1..., csk_2..."
                value={cerebrasInput}
                onInput={(e) => setCerebrasInput((e.target as HTMLInputElement).value)}
                style={{
                  width: '100%',
                  backgroundColor: 'rgba(0, 0, 0, 0.2)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '8px',
                  padding: '12px 42px 12px 12px',
                  color: '#FFF',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              <button 
                type="button"
                onClick={() => setShowCerebras(!showCerebras)}
                style={{ position: 'absolute', right: '12px', background: 'none', border: 'none', color: '#6A7280', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
              >
                {showCerebras ? (
                  <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                ) : (
                  <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                )}
              </button>
            </div>
          </div>

        </div>

        <button
          onClick={handleSaveMetrics}
          style={{
            width: '100%',
            backgroundColor: '#00FFC2',
            color: '#0E1012',
            border: 'none',
            borderRadius: '10px',
            padding: '14px 0',
            fontWeight: 600,
            fontSize: '14px',
            cursor: 'pointer',
            boxShadow: '0 4px 25px rgba(0, 255, 194, 0.2)',
            transition: 'all 0.15s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
          {isConfigured ? 'Update Settings' : 'Save & Initialize'}
        </button>

        {saveStatus !== 'idle' && (
          <div style={{ 
            textAlign: 'center', 
            fontSize: '13px', 
            color: saveStatus === 'error' ? '#FF6B6B' : '#00FFC2', 
            marginTop: '20px',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px'
          }}>
            {saveStatus === 'success' && <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>}
            {statusMessage}
          </div>
        )}

      </div>
    </div>
  );
}