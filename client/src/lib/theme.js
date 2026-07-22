// Theme management — dark is the default (recommended for a data dashboard).
const KEY = 'finance.theme';

export function getTheme() {
  return localStorage.getItem(KEY) || 'dark';
}

export function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem(KEY, t);
}

export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}

// Apply immediately on import so there's no flash of the wrong theme.
applyTheme(getTheme());
