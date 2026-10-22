import React from 'react';

/**
 * Enterprise Status Badge for RetailSphere DMart-Style Inventory & Governance
 */
const STATUS_CONFIGS = {
  // Green / Success
  ACTIVE: { label: 'Active', bg: '#ecfdf5', color: '#065f46', border: '#a7f3d0', icon: 'fa-circle-check' },
  SUBMITTED: { label: 'Submitted', bg: '#eff6ff', color: '#1e40af', border: '#bfdbfe', icon: 'fa-paper-plane' },
  APPROVED: { label: 'Approved', bg: '#ecfdf5', color: '#047857', border: '#6ee7b7', icon: 'fa-circle-check' },
  POSTED: { label: 'Posted', bg: '#ecfdf5', color: '#065f46', border: '#a7f3d0', icon: 'fa-box-archive' },
  COMPLETED: { label: 'Completed', bg: '#f0fdf4', color: '#166534', border: '#bbf7d0', icon: 'fa-check-double' },
  RECONCILED: { label: 'Reconciled', bg: '#ecfdf5', color: '#047857', border: '#a7f3d0', icon: 'fa-badge-check' },

  // Amber / Warning
  NEAR_EXPIRY: { label: 'Near Expiry', bg: '#fffbeb', color: '#92400e', border: '#fde68a', icon: 'fa-triangle-exclamation' },
  PENDING: { label: 'Pending', bg: '#fffbeb', color: '#b45309', border: '#fcd34d', icon: 'fa-clock' },
  PENDING_COUNT: { label: 'Pending Count', bg: '#fffbeb', color: '#b45309', border: '#fcd34d', icon: 'fa-clipboard-list' },
  SUGGESTED: { label: 'Suggested', bg: '#fef3c7', color: '#92400e', border: '#fde68a', icon: 'fa-lightbulb' },
  CLAIMED: { label: 'Claimed', bg: '#fffbeb', color: '#b45309', border: '#fde68a', icon: 'fa-file-invoice' },
  QUARANTINED: { label: 'Quarantined', bg: '#fff7ed', color: '#c2410c', border: '#fed7aa', icon: 'fa-shield-halved' },

  // Red / Danger
  EXPIRED: { label: 'Expired', bg: '#fef2f2', color: '#991b1b', border: '#fecaca', icon: 'fa-ban' },
  SCRAP: { label: 'Scrapped', bg: '#fef2f2', color: '#b91c1c', border: '#fca5a5', icon: 'fa-trash' },
  REJECTED: { label: 'Rejected', bg: '#fef2f2', color: '#991b1b', border: '#fecaca', icon: 'fa-circle-xmark' },
  BLOCKED: { label: 'Blocked', bg: '#fef2f2', color: '#991b1b', border: '#fecaca', icon: 'fa-lock' },

  // Blue / Info
  DRAFT: { label: 'Draft', bg: '#f8fafc', color: '#475569', border: '#cbd5e1', icon: 'fa-pencil' },
  IN_TRANSIT: { label: 'In Transit', bg: '#eff6ff', color: '#1d4ed8', border: '#93c5fd', icon: 'fa-truck' },
  ALLOCATED: { label: 'Allocated', bg: '#f0fdfa', color: '#0f766e', border: '#99f6e4', icon: 'fa-dolly' }
};

export default function StatusBadge({ status, customLabel, showIcon = true, size = 'md' }) {
  if (!status) return null;
  const key = String(status).toUpperCase();
  const cfg = STATUS_CONFIGS[key] || {
    label: status,
    bg: 'var(--surface-header, #f1f5f9)',
    color: 'var(--text-muted, #475569)',
    border: 'var(--border, #cbd5e1)',
    icon: 'fa-circle-info'
  };

  const isSmall = size === 'sm';

  return (
    <span
      className="status-badge"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.35rem',
        padding: isSmall ? '0.15rem 0.5rem' : '0.3rem 0.75rem',
        fontSize: isSmall ? '0.72rem' : '0.8rem',
        fontWeight: 600,
        borderRadius: '9999px',
        backgroundColor: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.border}`,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)'
      }}
    >
      {showIcon && <i className={`fa-solid ${cfg.icon}`} style={{ fontSize: isSmall ? '0.7rem' : '0.75rem' }} />}
      <span>{customLabel || cfg.label}</span>
    </span>
  );
}

