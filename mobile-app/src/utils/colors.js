export const Colors = {
  // Mirrors `src/index.css` tokens from ParkGo web
  bg: '#0f172a', // --bg-dark
  card: '#1e293b', // --bg-card
  elevated: '#334155', // --bg-elevated
  text: '#f1f5f9', // --text-primary
  muted: '#94a3b8', // --text-muted
  border: 'rgba(148, 163, 184, 0.15)', // --border-subtle

  // Brand / accents
  logoBlue: '#2563eb',
  logoBlueLight: '#60a5fa',
  accentPurple: '#6366f1',

  // Status
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#60a5fa',
};

export function statusColor(level) {
  const v = String(level || '').toLowerCase();
  if (v === 'low') return Colors.success;
  if (v === 'medium') return Colors.warning;
  if (v === 'high') return Colors.danger;
  return Colors.info;
}

