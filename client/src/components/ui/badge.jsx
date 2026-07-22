// Theme-aware badge — delegates to the design-system .badge classes so it looks
// right in both light and dark mode (variant maps to a tone).
const TONE = {
  default: 'blue', secondary: 'gray', gray: 'gray', green: 'green',
  yellow: 'yellow', red: 'red', blue: 'blue', eur: 'eur',
};

export function Badge({ className = '', variant = 'gray', ...props }) {
  return <span className={`badge ${TONE[variant] || 'gray'} ${className}`} {...props} />;
}
