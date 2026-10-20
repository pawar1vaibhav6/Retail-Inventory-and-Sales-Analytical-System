import React, { useState, useRef, useEffect, useMemo } from 'react';

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* Highlights every search term inside a piece of text */
function Highlight({ text, query }) {
  const terms = query.trim().split(/\s+/).filter(Boolean).map(escapeRegExp);
  if (!terms.length) return <>{text}</>;
  const parts = String(text).split(new RegExp(`(${terms.join('|')})`, 'ig'));
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark
            key={i}
            style={{
              background: 'rgba(250, 204, 21, 0.4)',
              color: 'inherit',
              padding: '0 2px',
              borderRadius: 3,
            }}
          >
            {part}
          </mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </>
  );
}

/**
 * Searchable dropdown (combobox)
 *
 * options: [{ value, label, sublabel?, searchText?, right?: ReactNode, disabled?: boolean }]
 * value:   currently selected value (string)
 * onChange(value)  -> called with '' when cleared
 * footerAction: { label, icon, onClick }  -> pinned action at the bottom of the list
 */
export default function SearchSelect({
  id,
  options,
  value,
  onChange,
  placeholder = 'Search...',
  icon = 'fa-magnifying-glass',
  emptyText = 'No results found',
  footerAction,
  maxHeight = 260,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const selected = options.find((o) => String(o.value) === String(value));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    const terms = q.split(/\s+/);
    return options.filter((o) => {
      const hay = (o.searchText || `${o.label} ${o.sublabel || ''}`).toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [options, query]);

  const closeList = () => {
    setOpen(false);
    setQuery('');
  };

  // Close when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) closeList();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Reset highlighted row when search changes
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Keep the highlighted row visible while using the keyboard
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-index="${activeIndex}"]`);
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const selectOption = (opt) => {
    if (!opt || opt.disabled) return;
    onChange(String(opt.value));
    closeList();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) return setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (open) {
        e.preventDefault();
        selectOption(filtered[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      closeList();
    } else if (e.key === 'Tab') {
      closeList();
    }
  };

  const showClear = !!selected && !disabled;

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {/* Left icon */}
      <i
        className={`fa-solid ${icon}`}
        style={{
          position: 'absolute',
          left: 13,
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: 13,
          color: open ? '#7c3aed' : 'var(--text-muted, #6b7280)',
          pointerEvents: 'none',
          transition: 'color 0.2s ease',
        }}
      />

      {/* Search input */}
      <input
        ref={inputRef}
        id={id}
        type="text"
        className="form-control"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        aria-autocomplete="list"
        aria-activedescendant={open && filtered[activeIndex] ? `${id}-opt-${activeIndex}` : undefined}
        autoComplete="off"
        disabled={disabled}
        value={open ? query : selected ? selected.label : ''}
        placeholder={open && selected ? selected.label : placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        style={{
          paddingLeft: 36,
          paddingRight: showClear ? 68 : 40,
          fontWeight: !open && selected ? 600 : 400,
          textOverflow: 'ellipsis',
          cursor: open ? 'text' : 'pointer',
        }}
      />

      {/* Right controls: clear + chevron */}
      <div
        style={{
          position: 'absolute',
          right: 8,
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
        }}
      >
        {showClear && (
          <button
            type="button"
            aria-label="Clear selection"
            title="Clear"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange('');
              setQuery('');
              inputRef.current && inputRef.current.focus();
            }}
            style={{
              border: 'none',
              background: 'transparent',
              width: 24,
              height: 24,
              borderRadius: '50%',
              cursor: 'pointer',
              fontSize: 12,
              color: 'var(--text-muted, #6b7280)',
            }}
          >
            <i className="fa-solid fa-xmark" />
          </button>
        )}
        <button
          type="button"
          tabIndex={-1}
          aria-label="Toggle list"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (open) closeList();
            else {
              setOpen(true);
              inputRef.current && inputRef.current.focus();
            }
          }}
          style={{
            border: 'none',
            background: 'transparent',
            width: 24,
            height: 24,
            cursor: 'pointer',
            fontSize: 12,
            color: 'var(--text-muted, #6b7280)',
          }}
        >
          <i
            className="fa-solid fa-chevron-down"
            style={{
              transition: 'transform 0.25s ease',
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
              display: 'inline-block',
            }}
          />
        </button>
      </div>

      {/* Dropdown panel */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 1050,
            background: 'var(--bs-body-bg, #ffffff)',
            color: 'var(--bs-body-color, #111827)',
            border: '1px solid var(--bs-border-color, rgba(128,128,128,0.28))',
            borderRadius: 12,
            boxShadow: '0 14px 36px rgba(0,0,0,0.22)',
            overflow: 'hidden',
          }}
        >
          {/* Result count */}
          <div
            style={{
              padding: '8px 14px',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-muted, #6b7280)',
              borderBottom: '1px solid var(--bs-border-color, rgba(128,128,128,0.18))',
              background: 'var(--surface-header, rgba(128,128,128,0.06))',
            }}
          >
            {query.trim()
              ? `${filtered.length} result${filtered.length === 1 ? '' : 's'}`
              : `${options.length} available`}
          </div>

          {/* Options */}
          <div
            ref={listRef}
            id={`${id}-listbox`}
            role="listbox"
            style={{ maxHeight, overflowY: 'auto' }}
          >
            {filtered.length === 0 ? (
              <div
                style={{
                  padding: '22px 14px',
                  textAlign: 'center',
                  color: 'var(--text-muted, #6b7280)',
                  fontSize: 13,
                }}
              >
                <i
                  className="fa-regular fa-face-frown"
                  style={{ display: 'block', fontSize: 22, marginBottom: 6, opacity: 0.6 }}
                />
                {emptyText}
                {query.trim() && (
                  <div style={{ marginTop: 2 }}>
                    for &ldquo;<strong>{query.trim()}</strong>&rdquo;
                  </div>
                )}
              </div>
            ) : (
              filtered.map((opt, i) => {
                const isActive = i === activeIndex;
                const isSelected = String(opt.value) === String(value);
                return (
                  <div
                    key={opt.value}
                    id={`${id}-opt-${i}`}
                    data-index={i}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={opt.disabled || undefined}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectOption(opt);
                    }}
                    onMouseEnter={() => setActiveIndex(i)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '10px 14px',
                      cursor: opt.disabled ? 'not-allowed' : 'pointer',
                      opacity: opt.disabled ? 0.5 : 1,
                      background: isActive ? 'rgba(124,58,237,0.12)' : 'transparent',
                      borderLeft: `3px solid ${isSelected ? '#7c3aed' : 'transparent'}`,
                      transition: 'background 0.12s ease',
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: isSelected ? 700 : 600,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        <Highlight text={opt.label} query={query} />
                      </div>
                      {opt.sublabel && (
                        <div
                          style={{
                            fontSize: 12,
                            color: 'var(--text-muted, #6b7280)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            marginTop: 1,
                          }}
                        >
                          <Highlight text={opt.sublabel} query={query} />
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      {opt.right}
                      {isSelected && (
                        <i className="fa-solid fa-circle-check" style={{ color: '#7c3aed', fontSize: 14 }} />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Pinned footer action (e.g. + Register New Customer) */}
          {footerAction && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                closeList();
                footerAction.onClick();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                width: '100%',
                padding: '11px 14px',
                border: 'none',
                borderTop: '1px solid var(--bs-border-color, rgba(128,128,128,0.18))',
                background: 'var(--surface-header, rgba(128,128,128,0.06))',
                color: '#7c3aed',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <i className={`fa-solid ${footerAction.icon || 'fa-plus'}`} />
              {footerAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}