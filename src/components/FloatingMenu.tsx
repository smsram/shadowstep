// src/components/FloatingMenu.tsx
import { useState, useEffect } from 'preact/hooks';

interface FloatingMenuProps {
  isOpen?: boolean;
  onOpenChat: () => void;
  onOpenSettings: () => void;
  onHideTemporary: () => void;
  onHidePermanent: () => void;
  onSelectBox: () => void;
  onSelectLasso: () => void;
  setPanelSide: (side: 'left' | 'right') => void; // Keeps the update channel open
  snapPos: string;
  setSnapPos: (snap: string) => void;
}

export function FloatingMenu({ 
  onOpenChat, 
  onOpenSettings, 
  onHideTemporary, 
  onHidePermanent,
  onSelectBox,
  onSelectLasso,
  setPanelSide,
  snapPos,
  setSnapPos
}: FloatingMenuProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [showRemoveMenu, setShowRemoveMenu] = useState(false);
  
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<{x: number, y: number} | null>(null);
  const [isIdleDimmed, setIsIdleDimmed] = useState(false);

  useEffect(() => {
    if (isHovered || showRemoveMenu || isDragging) {
      setIsIdleDimmed(false);
      return;
    }
    const idleTimer = setTimeout(() => {
      setIsIdleDimmed(true);
    }, 7000);
    return () => clearTimeout(idleTimer);
  }, [isHovered, showRemoveMenu, isDragging]);

  useEffect(() => {
    if (showRemoveMenu) {
      const closeMenu = () => {
        setShowRemoveMenu(false);
        setIsHovered(false);
      };
      setTimeout(() => document.addEventListener('click', closeMenu), 0);
      return () => document.removeEventListener('click', closeMenu);
    }
  }, [showRemoveMenu]);

  const onMouseDown = (e: any) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);

    const onMouseMove = (ev: any) => {
      setDragOffset({ x: ev.clientX, y: ev.clientY });
    };

    const onMouseUp = (ev: any) => {
      setIsDragging(false);
      setDragOffset(null);
      
      const w = window.innerWidth;
      const h = window.innerHeight;
      const x = ev.clientX;
      const y = ev.clientY;
      
      let newSnap = 'mid-right';
      let side: 'left' | 'right' = 'right';

      if (y < h * 0.2) {
        if (x < w * 0.33) { newSnap = 'top-left'; side = 'left'; }
        else if (x > w * 0.66) { newSnap = 'top-right'; side = 'right'; }
        else { newSnap = 'top-center'; side = x < w/2 ? 'left' : 'right'; }
      } else if (y > h * 0.8) {
        if (x < w * 0.33) { newSnap = 'bottom-left'; side = 'left'; }
        else if (x > w * 0.66) { newSnap = 'bottom-right'; side = 'right'; }
        else { newSnap = 'bottom-center'; side = x < w/2 ? 'left' : 'right'; }
      } else {
        if (x < w / 2) { newSnap = 'mid-left'; side = 'left'; }
        else { newSnap = 'mid-right'; side = 'right'; }
      }

      setSnapPos(newSnap);
      setPanelSide(side);
      
      if (typeof chrome !== 'undefined' && chrome.storage) {
         chrome.storage.local.set({ snapPos: newSnap, panelSide: side });
      }

      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const isHorizontal = snapPos.includes('top') || snapPos.includes('bottom');

  const getContainerStyles = (): any => {
    if (isDragging && dragOffset) {
      return {
        position: 'fixed',
        left: dragOffset.x - 20,
        top: dragOffset.y - 20,
        zIndex: 2147483647,
        display: 'flex',
        flexDirection: isHorizontal ? 'row' : 'column',
        alignItems: 'center',
        pointerEvents: 'none',
        gap: '8px'
      };
    }

    let styles: any = { 
      position: 'fixed', 
      zIndex: 2147483647, 
      display: 'flex', 
      gap: '8px',
      transition: 'all 0.3s ease, opacity 0.4s ease',
      padding: '0px', 
      flexDirection: isHorizontal ? 'row' : 'column',
      alignItems: 'center',
      opacity: isIdleDimmed ? 0.25 : 1.0 
    };

    if (snapPos.includes('left')) styles.left = '0px';
    else if (snapPos.includes('right')) styles.right = '0px';
    else { styles.left = '50%'; styles.transform = 'translateX(-50%)'; }

    if (snapPos.includes('top')) styles.top = '0px';
    else if (snapPos.includes('bottom')) styles.bottom = '0px';
    else { styles.top = '50%'; styles.transform = styles.transform ? styles.transform + ' translateY(-50%)' : 'translateY(-50%)'; }

    return styles;
  };

  let borderRadius = '10px';
  let borderTop = '1px solid rgba(255, 255, 255, 0.08)';
  let borderBottom = '1px solid rgba(255, 255, 255, 0.08)';
  let borderLeft = '1px solid rgba(255, 255, 255, 0.08)';
  let borderRight = '1px solid rgba(255, 255, 255, 0.08)';

  if (snapPos.includes('top')) { borderRadius = '0 0 10px 10px'; borderTop = 'none'; } 
  else if (snapPos.includes('bottom')) { borderRadius = '10px 10px 0 0'; borderBottom = 'none'; } 
  else if (snapPos.includes('left')) { borderRadius = '0 10px 10px 0'; borderLeft = 'none'; } 
  else if (snapPos.includes('right')) { borderRadius = '10px 0 0 10px'; borderRight = 'none'; }

  const removeMenuStyles: any = {
    position: 'absolute',
    backgroundColor: '#121314',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    padding: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    width: '180px',
    minWidth: '180px', // Strict width
    maxWidth: '180px', // Strict width
    boxSizing: 'border-box',
    boxShadow: '0px 4px 15px rgba(0,0,0,0.5)',
    zIndex: 10
  };

  if (snapPos.includes('left') && !isHorizontal) removeMenuStyles.left = '50px';
  else if (snapPos.includes('right') && !isHorizontal) removeMenuStyles.right = '50px';
  else if (snapPos.includes('top')) removeMenuStyles.top = '50px';
  else if (snapPos.includes('bottom')) removeMenuStyles.bottom = '50px';
  else removeMenuStyles.right = '50px'; 

  const getRemoveButtonStyles = (): any => {
    const baseStyles: any = {
      position: 'absolute',
      backgroundColor: '#EF4444',
      border: '1px solid rgba(255,255,255,0.2)',
      color: '#FFF',
      cursor: 'pointer',
      boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
      zIndex: 15
    };

    if (snapPos.includes('top')) {
      baseStyles.bottom = '-8px';
      baseStyles.right = '-8px';
    } else if (snapPos.includes('bottom')) {
      baseStyles.top = '-8px';
      baseStyles.right = '-8px';
    } else if (snapPos.includes('left')) {
      baseStyles.top = '-8px';
      baseStyles.right = '-8px';
    } else {
      baseStyles.top = '-8px';
      baseStyles.left = '-8px';
    }
    return baseStyles;
  };

  return (
    <div 
      className="shadowstep-shield-override"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { if (!showRemoveMenu) setIsHovered(false); }}
      style={getContainerStyles()}
    >
      {/* 🛑 RIGID CSS ISOLATION BLOCK: Forces dimensions regardless of external CSS bleed */}
      <style>{`
        .shadowstep-shield-override * {
          box-sizing: border-box !important;
          letter-spacing: normal !important;
        }
        .shadowstep-shield-override button {
          appearance: none !important;
          font-family: system-ui, sans-serif !important;
          outline: none !important;
        }
        .shadowstep-round-btn {
          width: 32px !important;
          height: 32px !important;
          min-width: 32px !important;
          min-height: 32px !important;
          max-width: 32px !important;
          max-height: 32px !important;
          padding: 0 !important;
          margin: 0 !important;
          flex-shrink: 0 !important;
          border-radius: 50% !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        .shadowstep-main-btn {
          padding: 0 !important;
          margin: 0 !important;
          flex-shrink: 0 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        .shadowstep-main-btn-horizontal {
          width: 48px !important;
          min-width: 48px !important;
          max-width: 48px !important;
          height: 42px !important;
          min-height: 42px !important;
          max-height: 42px !important;
        }
        .shadowstep-main-btn-vertical {
          width: 42px !important;
          min-width: 42px !important;
          max-width: 42px !important;
          height: 48px !important;
          min-height: 48px !important;
          max-height: 48px !important;
        }
        .shadowstep-remove-btn {
          width: 18px !important;
          height: 18px !important;
          min-width: 18px !important;
          min-height: 18px !important;
          max-width: 18px !important;
          max-height: 18px !important;
          padding: 0 !important;
          margin: 0 !important;
          flex-shrink: 0 !important;
          border-radius: 50% !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        .shadowstep-menu-btn {
          width: 100% !important;
          min-width: 100% !important;
          max-width: 100% !important;
          padding: 8px !important;
          margin: 0 !important;
        }
        .shadowstep-shield-override svg {
          flex-shrink: 0 !important;
          min-width: 14px !important;
          min-height: 14px !important;
        }
      `}</style>

      <div style={{ display: 'flex', flexDirection: isHorizontal ? 'row' : 'column', gap: '8px', opacity: isHovered && !showRemoveMenu && !isDragging ? 1 : 0, pointerEvents: isHovered && !showRemoveMenu && !isDragging ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
        <button className="shadowstep-round-btn" onClick={onOpenSettings} title="Control Hub" style={{ backgroundColor: 'rgba(26, 28, 30, 0.9)', border: '1px solid rgba(255, 255, 255, 0.08)', color: '#6A7280', cursor: 'pointer' }}>
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
        </button>
        <button className="shadowstep-round-btn" onMouseDown={onMouseDown} title="Drag to Move" style={{ backgroundColor: 'rgba(26, 28, 30, 0.9)', border: '1px solid rgba(255, 255, 255, 0.08)', color: '#6A7280', cursor: 'grab' }}>
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="5 9 2 12 5 15"></polyline><polyline points="9 5 12 2 15 5"></polyline><polyline points="19 9 22 12 19 15"></polyline><polyline points="9 19 12 22 15 19"></polyline><line x1="2" y1="12" x2="22" y2="12"></line><line x1="12" y1="2" x2="12" y2="22"></line></svg>
        </button>
      </div>

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {showRemoveMenu && (
          <div style={removeMenuStyles}>
            <button className="shadowstep-menu-btn" onClick={onHideTemporary} style={{ background: 'none', border: 'none', color: '#FFF', fontSize: '12px', textAlign: 'left', borderRadius: '4px', cursor: 'pointer' }}>Remove for now</button>
            <button className="shadowstep-menu-btn" onClick={onHidePermanent} style={{ background: 'none', border: 'none', color: '#EF4444', fontSize: '12px', textAlign: 'left', borderRadius: '4px', cursor: 'pointer' }}>Remove until enabled</button>
          </div>
        )}

        <div onClick={onOpenChat} className={`shadowstep-main-btn ${isHorizontal ? 'shadowstep-main-btn-horizontal' : 'shadowstep-main-btn-vertical'}`} style={{ 
          backgroundColor: 'rgba(26, 28, 30, 0.9)', 
          backdropFilter: 'blur(12px)', 
          borderRadius: borderRadius,
          borderTop, borderBottom, borderLeft, borderRight,
          cursor: 'pointer' 
        }}>
          <div style={{ width: '16px', height: '16px', minWidth: '16px', minHeight: '16px', border: '2px solid #00FFC2', borderRadius: '50%', flexShrink: 0 }} />
        </div>

        {isHovered && !showRemoveMenu && !isDragging && (
          <button 
            className="shadowstep-remove-btn"
            onClick={(e) => { e.stopPropagation(); setShowRemoveMenu(true); }}
            title="Remove from page"
            style={getRemoveButtonStyles()}
          >
            <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: isHorizontal ? 'row' : 'column', gap: '8px', opacity: isHovered && !showRemoveMenu && !isDragging ? 1 : 0, pointerEvents: isHovered && !showRemoveMenu && !isDragging ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
        <button className="shadowstep-round-btn" onClick={onSelectBox} title="Bounding Box Selector" style={{ backgroundColor: 'rgba(26, 28, 30, 0.9)', border: '1px solid rgba(255, 255, 255, 0.08)', color: '#00FFC2', cursor: 'pointer' }}>
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke-dasharray="3 3"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
        </button>
        <button className="shadowstep-round-btn" onClick={onSelectLasso} title="Free Form Canvas Selector" style={{ backgroundColor: 'rgba(26, 28, 30, 0.9)', border: '1px solid rgba(255, 255, 255, 0.08)', color: '#00FFC2', cursor: 'pointer' }}>
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle></svg>
        </button>
      </div>
    </div>
  );
}