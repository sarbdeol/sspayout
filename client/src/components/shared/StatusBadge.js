import React from 'react';

const statusMap = {
  confirmed: { cls: 'badge-success', label: 'Confirmed' },
  pending: { cls: 'badge-warning', label: 'Pending' },
  awaiting_transfer: { cls: 'badge-warning', label: 'Awaiting Transfer' },
  utr_submitted: { cls: 'badge-info', label: 'UTR Submitted' },
  failed: { cls: 'badge-danger', label: 'Failed' },
  expired: { cls: 'badge-muted', label: 'Expired' },
  active: { cls: 'badge-success', label: 'Active' },
  inactive: { cls: 'badge-muted', label: 'Inactive' },
  processing: { cls: 'badge-info', label: 'Processing' },
  completed: { cls: 'badge-success', label: 'Completed' },
  credit: { cls: 'badge-success', label: 'Credit' },
  debit: { cls: 'badge-danger', label: 'Debit' },
  fee: { cls: 'badge-warning', label: 'Fee' },
  settlement: { cls: 'badge-accent', label: 'Settlement' },
  reversal: { cls: 'badge-muted', label: 'Reversal' },
};

export default function StatusBadge({ status }) {
  const s = statusMap[status] || { cls: 'badge-muted', label: status };
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

export function formatAmount(amount, currency = '₹') {
  return `${currency}${parseFloat(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
}

export function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
