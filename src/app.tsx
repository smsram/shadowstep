/**
 * @file app.tsx
 * @description Renders the ShadowStep Settings interface for configuring appearance and AI provider keys.
 * 
 * Providers:
 * - Google Gemini: gemini-2.5-flash
 * - Groq: qwen/qwen3.8-27b
 * - Cloudflare Workers AI: @cf/qwen/qwen3.8-27b
 * 
 * Theming:
 * - Auto (System Default), Light, Dark
 */
import { useState, useEffect } from 'preact/hooks';
import { parseCredentialInput } from './core/fileParser';
import { CustomDropdown, type DropdownOption } from './components/CustomDropdown';

interface StorageResult {
  geminiKeys?: string[];
  groqKeys?: string[];
  cloudflareKeys?: string[];
  cloudflareAccountId?: string;
  cloudflareAccountIds?: string[];
  theme?: 'dark' | 'light' | 'system' | 'auto';
  engineStatus?: string;
  userName?: string;
}

export function App() {
  const [nameInput, setNameInput] = useState('');
  const [geminiInput, setGeminiInput] = useState('');
  const [groqInput, setGroqInput] = useState('');
  const [cfAccountIdInput, setCfAccountIdInput] = useState('');
  const [cfKeyInput, setCfKeyInput] = useState('');
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>('dark');

  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [isConfigured, setIsConfigured] = useState(false);

  const [showGemini, setShowGemini] = useState(false);
  const [showGroq, setShowGroq] = useState(false);
  const [showCfKey, setShowCfKey] = useState(false);

  // System theme detection
  const [systemIsDark, setSystemIsDark] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemIsDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setSystemIsDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const isDarkMode = theme === 'system' ? systemIsDark : theme === 'dark';

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get([
        'geminiKeys',
        'groqKeys', 
        'cloudflareKeys', 
        'cloudflareAccountId', 
        'cloudflareAccountIds',
        'theme',
        'engineStatus', 
        'userName'
      ], (result: StorageResult) => {
        if (result.geminiKeys && result.geminiKeys.length > 0) setGeminiInput(result.geminiKeys.join(', '));
        if (result.groqKeys && result.groqKeys.length > 0) setGroqInput(result.groqKeys.join(', '));
        if (result.cloudflareKeys && result.cloudflareKeys.length > 0) setCfKeyInput(result.cloudflareKeys.join(', '));
        if (result.cloudflareAccountIds && result.cloudflareAccountIds.length > 0) {
          setCfAccountIdInput(result.cloudflareAccountIds.join(', '));
        } else if (result.cloudflareAccountId) {
          setCfAccountIdInput(result.cloudflareAccountId);
        }
        if (result.userName) setNameInput(result.userName);
        if (result.theme) {
          const norm = result.theme === 'auto' ? 'system' : result.theme;
          setTheme(norm as 'dark' | 'light' | 'system');
        } else {
          setTheme('dark');
        }
        
        if (result.engineStatus === 'active' || 
            (result.geminiKeys && result.geminiKeys.length > 0) ||
            (result.groqKeys && result.groqKeys.length > 0) || 
            (result.cloudflareKeys && result.cloudflareKeys.length > 0)) {
          setIsConfigured(true);
        }
      });
    }
  }, []);

  const handleSaveMetrics = () => {
    const parsedGemini = parseCredentialInput(geminiInput);
    const parsedGroq = parseCredentialInput(groqInput);
    
    // Task 4: 1-to-1 synchronized comma-separated array pairing
    const accountIds = cfAccountIdInput.split(',').map(id => id.trim()).filter(Boolean);
    const apiKeys = cfKeyInput.split(',').map(key => key.trim()).filter(Boolean);
    const cleanName = nameInput.trim() || 'Operator';

    const hasGemini = parsedGemini.length > 0;
    const hasGroq = parsedGroq.length > 0;
    const hasCloudflare = accountIds.length > 0 && apiKeys.length > 0;

    if (!hasGemini && !hasGroq && !hasCloudflare) {
      setSaveStatus('error');
      if (apiKeys.length > 0 && accountIds.length === 0) {
        setStatusMessage('Error: Cloudflare Workers AI requires Account ID(s) paired with API Token(s).');
      } else if (accountIds.length > 0 && apiKeys.length === 0) {
        setStatusMessage('Error: Cloudflare Workers AI requires API Token(s) paired with Account ID(s).');
      } else {
        setStatusMessage('Error: At least one provider configuration is required (Gemini, Groq, or Cloudflare).');
      }
      return;
    }

    const payload = {
      geminiKeys: parsedGemini,
      groqKeys: parsedGroq,
      cloudflareKeys: apiKeys,
      cloudflareAccountIds: accountIds,
      cloudflareAccountId: accountIds[0] || '', // backwards compatibility
      theme,
      userName: cleanName,
      engineStatus: 'active'
    };

    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set(payload, () => {
        setSaveStatus('success');
        setStatusMessage('Settings saved successfully!');
        setIsConfigured(true);
      });
    } else {
      setSaveStatus('success');
      setStatusMessage('Settings saved successfully!');
      setIsConfigured(true);
    }
  };

  const bgPage = isDarkMode ? '#0E1012' : '#F3F4F6';
  const cardBg = isDarkMode ? 'rgba(20, 22, 26, 0.75)' : '#FFFFFF';
  const cardBorder = isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
  const textColor = isDarkMode ? '#F5F6F7' : '#111827';
  const textMuted = isDarkMode ? '#9CA3AF' : '#6B7280';
  const inputBg = isDarkMode ? 'rgba(0, 0, 0, 0.3)' : '#F9FAFB';
  const inputBorder = isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.12)';
  const inputColor = isDarkMode ? '#FFF' : '#111827';

  const themeOptions: DropdownOption<'dark' | 'light' | 'system'>[] = [
    { value: 'dark', label: 'Dark' },
    { value: 'light', label: 'Light' },
    { value: 'system', label: 'System' }
  ];

  return (
    <div 
      className={isDarkMode ? 'ss-dark' : 'ss-light'}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        minHeight: '100vh',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        backgroundColor: bgPage,
        color: textColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        boxSizing: 'border-box',
        transition: 'background-color 0.2s, color 0.2s',
        '--ss-bg-primary': isDarkMode ? '#0E1012' : '#FFFFFF',
        '--ss-bg-secondary': isDarkMode ? 'rgba(255, 255, 255, 0.06)' : '#F3F4F6',
        '--ss-bg-input': isDarkMode ? 'rgba(0, 0, 0, 0.3)' : '#F9FAFB',
        '--ss-card-bg': isDarkMode ? 'rgba(20, 22, 26, 0.95)' : '#FFFFFF',
        '--ss-dropdown-bg': isDarkMode ? '#17191C' : '#FFFFFF',
        '--ss-text-primary': isDarkMode ? '#F5F6F7' : '#111827',
        '--ss-text-secondary': isDarkMode ? '#C4C8D0' : '#4B5563',
        '--ss-text-muted': isDarkMode ? '#9CA3AF' : '#6B7280',
        '--ss-border': isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.12)',
        '--ss-border-subtle': isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
        '--primary-color': '#00FFC2',
        '--accent-cyan': '#00FFC2',
        '--ss-accent': 'var(--primary-color, #00FFC2)',
        '--ss-accent-gradient': 'linear-gradient(135deg, #00FFC2 0%, #00B894 100%)',
        '--ss-accent-bg': 'rgba(0, 255, 194, 0.15)',
        '--ss-accent-border': 'rgba(0, 255, 194, 0.35)',
        '--ss-accent-glow': '0 0 14px rgba(0, 255, 194, 0.4)',
        '--ss-shadow': isDarkMode ? '0 12px 40px rgba(0, 0, 0, 0.7)' : '0 12px 30px rgba(0, 0, 0, 0.12)'
      } as any}
    >
      <style>{`
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          background-color: ${bgPage} !important;
          width: 100%;
          min-height: 100%;
        }
        * {
          box-sizing: border-box;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        }
      `}</style>

      <div style={{
        width: '100%',
        maxWidth: '620px',
        backgroundColor: cardBg,
        backdropFilter: 'blur(24px)',
        border: `1px solid ${cardBorder}`,
        borderRadius: '18px',
        padding: '36px',
        boxShadow: isDarkMode ? '0 30px 60px rgba(0, 0, 0, 0.7)' : '0 20px 40px rgba(0, 0, 0, 0.08)',
        boxSizing: 'border-box',
        transition: 'all 0.2s'
      }}>
        
        {/* Header */}
        <div style={{ marginBottom: '28px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <img src="./icon.png" alt="ShadowStep" style={{ width: '48px', height: '48px', marginBottom: '14px', filter: 'drop-shadow(0 0 14px rgba(0, 255, 194, 0.45))' }} />
          <h1 style={{ fontSize: '24px', fontWeight: 600, margin: '0 0 6px 0', letterSpacing: '-0.5px' }}>
            ShadowStep <span style={{ color: 'var(--primary-color, #00FFC2)', fontWeight: 300 }}>Settings</span>
          </h1>
          <p style={{ color: textMuted, fontSize: '13px', margin: 0, lineHeight: 1.5 }}>
            Configure your appearance and AI provider keys.
          </p>
        </div>

        {/* Theme Preference */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: textMuted, letterSpacing: '0.8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              Theme
            </label>
            <span style={{ fontSize: '10px', color: textMuted }}>Default: Dark</span>
          </div>
          <CustomDropdown<'dark' | 'light' | 'system'>
            options={themeOptions}
            value={theme}
            onChange={setTheme}
            size="md"
            direction="down"
            fullWidth
          />
        </div>

        {/* Inputs Stack */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '32px' }}>
          
          {/* Display Name */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: textMuted, letterSpacing: '0.8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                Display Name
              </label>
            </div>
            <input 
              type="text"
              placeholder="e.g., Operator"
              value={nameInput}
              onInput={(e) => setNameInput((e.target as HTMLInputElement).value)}
              style={{
                width: '100%',
                backgroundColor: inputBg,
                border: `1px solid ${inputBorder}`,
                borderRadius: '8px',
                padding: '11px 12px',
                color: inputColor,
                fontSize: '13px',
                outline: 'none'
              }}
            />
            <p style={{ fontSize: '11px', color: textMuted, marginTop: '5px', marginBottom: 0, lineHeight: 1.4 }}>
              Used to personalize your chat greeting.
            </p>
          </div>

          <div style={{ height: '1px', backgroundColor: cardBorder, margin: '2px 0' }} />

          {/* Gemini API Keys */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: textMuted, letterSpacing: '0.8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="12" height="12" fill="none" stroke="#4285F4" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                Gemini API Keys
              </label>
              <span style={{ fontSize: '10px', color: textMuted }}>Supports Web Search</span>
            </div>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input 
                type={showGemini ? "text" : "password"}
                placeholder="AIzaSy..., AIzaSy..."
                value={geminiInput}
                onInput={(e) => setGeminiInput((e.target as HTMLInputElement).value)}
                style={{
                  width: '100%',
                  backgroundColor: inputBg,
                  border: `1px solid ${inputBorder}`,
                  borderRadius: '8px',
                  padding: '11px 42px 11px 12px',
                  color: inputColor,
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  outline: 'none'
                }}
              />
              <button 
                type="button"
                onClick={() => setShowGemini(!showGemini)}
                style={{ position: 'absolute', right: '12px', background: 'none', border: 'none', color: textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
              >
                {showGemini ? (
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                ) : (
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                )}
              </button>
            </div>
            <p style={{ fontSize: '11px', color: textMuted, marginTop: '5px', marginBottom: 0, lineHeight: 1.4 }}>
              Used for fast reasoning and real-time Google Web Search. Separate multiple keys with commas.
            </p>
          </div>

          {/* Groq API Keys */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: textMuted, letterSpacing: '0.8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line></svg>
                Groq API Keys
              </label>
              <span style={{ fontSize: '10px', color: textMuted }}>Ultra-Fast Inference</span>
            </div>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input 
                type={showGroq ? "text" : "password"}
                placeholder="gsk_A1, gsk_B2 (or space separated)"
                value={groqInput}
                onInput={(e) => setGroqInput((e.target as HTMLInputElement).value)}
                style={{
                  width: '100%',
                  backgroundColor: inputBg,
                  border: `1px solid ${inputBorder}`,
                  borderRadius: '8px',
                  padding: '11px 42px 11px 12px',
                  color: inputColor,
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  outline: 'none'
                }}
              />
              <button 
                type="button"
                onClick={() => setShowGroq(!showGroq)}
                style={{ position: 'absolute', right: '12px', background: 'none', border: 'none', color: textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
              >
                {showGroq ? (
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                ) : (
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                )}
              </button>
            </div>
            <p style={{ fontSize: '11px', color: textMuted, marginTop: '5px', marginBottom: 0, lineHeight: 1.4 }}>
              Powers lightning-fast browser actions with Qwen. Separate multiple keys with commas.
            </p>
          </div>

          <div style={{ height: '1px', backgroundColor: cardBorder, margin: '2px 0' }} />

          {/* Cloudflare Section (Pairing Made Clear) */}
          <div style={{
            backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
            border: `1px solid ${cardBorder}`,
            borderRadius: '12px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="15" height="15" fill="none" stroke="#F59E0B" strokeWidth="2" viewBox="0 0 24 24"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>
                <span style={{ fontSize: '12px', fontWeight: 600, color: textColor, letterSpacing: '0.2px' }}>
                  Cloudflare Workers AI (Backup & Fallback)
                </span>
              </div>
            </div>

            {/* Account IDs */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: textMuted, letterSpacing: '0.8px' }}>
                  Account IDs
                </label>
              </div>
              <input 
                type="text"
                placeholder="ACC_1, ACC_2"
                value={cfAccountIdInput}
                onInput={(e) => setCfAccountIdInput((e.target as HTMLInputElement).value)}
                style={{
                  width: '100%',
                  backgroundColor: inputBg,
                  border: `1px solid ${inputBorder}`,
                  borderRadius: '8px',
                  padding: '11px 12px',
                  color: inputColor,
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  outline: 'none'
                }}
              />
              <p style={{ fontSize: '11px', color: textMuted, marginTop: '5px', marginBottom: 0, lineHeight: 1.4 }}>
                Your Cloudflare Account ID(s). Separate with commas.
              </p>
            </div>

            {/* API Tokens */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: textMuted, letterSpacing: '0.8px' }}>
                  API Tokens
                </label>
              </div>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input 
                  type={showCfKey ? "text" : "password"}
                  placeholder="KEY_1, KEY_2"
                  value={cfKeyInput}
                  onInput={(e) => setCfKeyInput((e.target as HTMLInputElement).value)}
                  style={{
                    width: '100%',
                    backgroundColor: inputBg,
                    border: `1px solid ${inputBorder}`,
                    borderRadius: '8px',
                    padding: '11px 42px 11px 12px',
                    color: inputColor,
                    fontSize: '13px',
                    fontFamily: 'monospace',
                    outline: 'none'
                  }}
                />
                <button 
                  type="button"
                  onClick={() => setShowCfKey(!showCfKey)}
                  style={{ position: 'absolute', right: '12px', background: 'none', border: 'none', color: textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
                >
                  {showCfKey ? (
                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                  ) : (
                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                  )}
                </button>
              </div>
              <p style={{ fontSize: '11px', color: textMuted, marginTop: '5px', marginBottom: 0, lineHeight: 1.4 }}>
                Matched 1-to-1 with your Account IDs above for automatic failover.
              </p>
            </div>
          </div>

        </div>

        {/* Save Button */}
        <button
          onClick={handleSaveMetrics}
          style={{
            width: '100%',
            backgroundColor: 'var(--primary-color, #00FFC2)',
            color: '#0E1012',
            border: 'none',
            borderRadius: '10px',
            padding: '13px 0',
            fontWeight: 600,
            fontSize: '14px',
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(0, 255, 194, 0.35)',
            transition: 'all 0.15s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
          {isConfigured ? 'Save Changes' : 'Save Changes'}
        </button>

        {saveStatus !== 'idle' && (
          <div style={{ 
            textAlign: 'center', 
            fontSize: '13px', 
            color: saveStatus === 'error' ? '#EF4444' : 'var(--primary-color, #00FFC2)', 
            marginTop: '18px',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px'
          }}>
            {saveStatus === 'success' && <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>}
            {statusMessage}
          </div>
        )}

      </div>
    </div>
  );
}