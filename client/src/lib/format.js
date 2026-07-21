// Money is always stored MKD-equivalent. Format with thin separators + "ден".
export function mkd(n) {
  const v = Number(n || 0);
  return new Intl.NumberFormat('mk-MK', { maximumFractionDigits: 0 }).format(v) + ' ден';
}

export function eur(n) {
  return '€' + new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(Number(n || 0));
}

export function date(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
