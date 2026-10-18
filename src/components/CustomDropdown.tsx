/**
 * @file CustomDropdown.tsx
 * @description A modern, highly-polished Preact custom dropdown component.
 * Features:
 * - Animated open/close transitions and rotating chevron.
 * - Full keyboard navigation (Escape, ArrowUp, ArrowDown, Enter, Space).
 * - Click-outside dismissal with Shadow DOM composedPath support.
 * - Directional awareness (up / down) to prevent clipping in compact trays.
 * - Scoped styling adhering to ShadowStep design tokens and isolation rules.
 */
import { useState, useRef, useEffect } from 'preact/hooks';

export interface DropdownOption<T extends string = string> {
  value: T;
  label: string;
  badge?: string;
}

export interface CustomDropdownProps<T extends string = string> {
  options: DropdownOption<T>[];
  value: T;
  onChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
  title?: string;
  size?: 'sm' | 'md';
  direction?: 'up' | 'down' | 'auto';
  fullWidth?: boolean;
}

export function CustomDropdown<T extends string = string>({
  options,
  value,
  onChange,
  placeholder = 'Select option...',
  disabled = false,
  title,
  size = 'md',
  direction = 'down',
  fullWidth = false
}: CustomDropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(o => o.value === value);

  // Synchronize highlighted index with selected value when opened
  useEffect(() => {
    if (isOpen) {
      const idx = options.findIndex(o => o.value === value);
      setHighlightedIndex(idx >= 0 ? idx : 0);
    }
  }, [isOpen, value, options]);

  // Click outside listener with Shadow DOM composedPath support
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const path = (e.composedPath && e.composedPath()) || [];
      if (dropdownRef.current && !path.includes(dropdownRef.current)) {
        setIsOpen(false);
      }
    };

    window.addEventListener('mousedown', handleClickOutside, true);
    return () => window.removeEventListener('mousedown', handleClickOutside, true);
  }, [isOpen]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && listboxRef.current && highlightedIndex >= 0) {
      const items = listboxRef.current.children;
      if (items[highlightedIndex]) {
        (items[highlightedIndex] as HTMLElement).scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  const handleToggle = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    setIsOpen(prev => !prev);
  };

  const handleSelect = (optValue: T, e?: MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    onChange(optValue);
    setIsOpen(false);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      setIsOpen(false);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      setHighlightedIndex(prev => (prev + 1) % options.length);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      setHighlightedIndex(prev => (prev - 1 + options.length) % options.length);
      return;
    }

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      if (highlightedIndex >= 0 && highlightedIndex < options.length) {
        handleSelect(options[highlightedIndex].value);
      }
    }
  };

  const isSmall = size === 'sm';

  return (
    <div
      ref={dropdownRef}
      title={title}
      style={{
        position: 'relative',
        display: fullWidth ? 'flex' : 'inline-flex',
        width: fullWidth ? '100%' : 'auto',
        boxSizing: 'border-box',
        userSelect: 'none'
      }}
      onKeyDown={handleKeyDown as any}
    >
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={handleToggle as any}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        style={{
          all: 'unset',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: isSmall ? '6px' : '10px',
          width: fullWidth ? '100%' : 'auto',
          backgroundColor: 'var(--ss-bg-secondary, rgba(255, 255, 255, 0.05))',
          border: '1px solid var(--ss-border, rgba(255, 255, 255, 0.08))',
          borderRadius: isSmall ? '12px' : '8px',
          padding: isSmall ? '4px 9px' : '9px 12px',
          color: 'var(--ss-text-primary, #F5F6F7)',
          fontSize: isSmall ? '11px' : '13px',
          fontWeight: 500,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          boxSizing: 'border-box',
          transition: 'all 0.15s ease',
          outline: 'none'
        }}
      >
        <span
          style={{
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: isSmall ? '135px' : '300px',
            color: selectedOption ? 'var(--ss-text-primary, #F5F6F7)' : 'var(--ss-text-muted, #7E8492)'
          }}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>

        <svg
          width={isSmall ? "9" : "11"}
          height={isSmall ? "9" : "11"}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s cubic-bezier(0.2, 1, 0.2, 1)',
            color: 'var(--ss-text-muted, #7E8492)',
            flexShrink: 0
          }}
          viewBox="0 0 24 24"
        >
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      {/* Popover Options Menu */}
      {isOpen && (
        <div
          ref={listboxRef}
          role="listbox"
          tabIndex={-1}
          style={{
            position: 'absolute',
            ...(direction === 'up'
              ? { bottom: '100%', marginBottom: '6px' }
              : { top: '100%', marginTop: '6px' }),
            left: 0,
            width: fullWidth ? '100%' : 'max-content',
            minWidth: isSmall ? '150px' : '180px',
            maxWidth: '320px',
            backgroundColor: 'var(--ss-dropdown-bg, #1A1C1E)',
            border: '1px solid var(--ss-border, rgba(255, 255, 255, 0.1))',
            borderRadius: isSmall ? '10px' : '10px',
            boxShadow: 'var(--ss-shadow, 0 12px 30px rgba(0, 0, 0, 0.5))',
            padding: '4px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            zIndex: 200,
            maxHeight: '220px',
            overflowY: 'auto',
            boxSizing: 'border-box',
            animation: 'shadowstep-dropdown-fade 0.16s cubic-bezier(0.2, 1, 0.2, 1)'
          }}
        >
          <style>{`
            @keyframes shadowstep-dropdown-fade {
              from { opacity: 0; transform: ${direction === 'up' ? 'translateY(4px)' : 'translateY(-4px)'}; }
              to { opacity: 1; transform: translateY(0); }
            }
          `}</style>
          {options.map((opt, idx) => {
            const isSelected = opt.value === value;
            const isHighlighted = idx === highlightedIndex;

            return (
              <div
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                onClick={(e) => handleSelect(opt.value, e as any)}
                onMouseEnter={() => setHighlightedIndex(idx)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  padding: isSmall ? '5px 8px' : '8px 10px',
                  borderRadius: '6px',
                  backgroundColor: isSelected
                    ? 'var(--ss-accent-bg, rgba(0, 255, 194, 0.15))'
                    : isHighlighted
                    ? 'var(--ss-bg-secondary, rgba(255, 255, 255, 0.06))'
                    : 'transparent',
                  color: isSelected
                    ? 'var(--primary-color, var(--ss-accent, #00FFC2))'
                    : 'var(--ss-text-primary, #F5F6F7)',
                  fontSize: isSmall ? '11px' : '12.5px',
                  fontWeight: isSelected ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'background 0.12s ease',
                  boxSizing: 'border-box'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {opt.label}
                  </span>
                  {opt.badge && (
                    <span style={{
                      fontSize: '9px',
                      padding: '1px 4px',
                      borderRadius: '4px',
                      backgroundColor: 'var(--ss-bg-secondary, rgba(255, 255, 255, 0.08))',
                      color: 'var(--ss-text-muted, #7E8492)'
                    }}>
                      {opt.badge}
                    </span>
                  )}
                </div>

                {isSelected && (
                  <svg
                    width={isSmall ? "10" : "12"}
                    height={isSmall ? "10" : "12"}
                    fill="none"
                    stroke="var(--primary-color, var(--ss-accent, #00FFC2))"
                    strokeWidth="2.5"
                    viewBox="0 0 24 24"
                    style={{ flexShrink: 0 }}
                  >
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
