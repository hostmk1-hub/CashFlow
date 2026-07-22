// Lightweight inline SVG icons (Lucide-style, 24×24, currentColor).
// Using SVG instead of emoji per UI/UX best practice (crisp, themeable, a11y).
const s = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
const I = (children) => (props) => <svg {...s} {...props}>{children}</svg>;

export const Grid = I(<><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>);
export const Building = I(<><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M9 8h.01M12 8h.01M15 8h.01M9 12h.01M12 12h.01M15 12h.01M10 21v-4h4v4" /></>);
export const Truck = I(<><path d="M14 17h-9V6h11v6" /><path d="M15 12h4l3 3v2h-7z" /><circle cx="7.5" cy="17.5" r="1.6" /><circle cx="17.5" cy="17.5" r="1.6" /></>);
export const Users = I(<><path d="M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1" /><circle cx="9" cy="8" r="3.5" /><path d="M22 20v-1a4 4 0 0 0-3-3.8M16 4.2a4 4 0 0 1 0 7.6" /></>);
export const FileText = I(<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>);
export const FileCheck = I(<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 15l2 2 4-4" /></>);
export const CreditCard = I(<><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" /></>);
export const Repeat = I(<><path d="M17 2l4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></>);
export const Wallet = I(<><path d="M20 12V8H5a2 2 0 0 1 0-4h14v4" /><path d="M3 6v12a2 2 0 0 0 2 2h15v-4" /><path d="M18 12a2 2 0 0 0 0 4h4v-4z" /></>);
export const Calendar = I(<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></>);
export const Chart = I(<><path d="M3 3v18h18" /><path d="M7 15l3-4 3 2 4-6" /></>);
export const Settings = I(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 6.8 19l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 13.6H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3.4V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></>);
export const Search = I(<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>);
export const Bell = I(<><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>);
export const Plus = I(<><path d="M12 5v14M5 12h14" /></>);
export const Sun = I(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>);
export const Moon = I(<><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></>);
export const ArrowUp = I(<><path d="M12 19V5M5 12l7-7 7 7" /></>);
export const ArrowDown = I(<><path d="M12 5v14M19 12l-7 7-7-7" /></>);
export const TrendUp = I(<><path d="M22 7 13.5 15.5 8.5 10.5 2 17" /><path d="M16 7h6v6" /></>);
export const TrendDown = I(<><path d="M22 17 13.5 8.5 8.5 13.5 2 7" /><path d="M16 17h6v-6" /></>);
export const Scan = I(<><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><path d="M7 12h10" /></>);
export const Logout = I(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></>);
export const ChevronDown = I(<><path d="m6 9 6 6 6-6" /></>);
export const Check = I(<><path d="M20 6 9 17l-5-5" /></>);
export const Dollar = I(<><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>);
export const Receipt = I(<><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1V2l-2 1-2-1-2 1-2-1-2 1-2-1z" /><path d="M8 7h8M8 11h8M8 15h5" /></>);
export const AlertTriangle = I(<><path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>);
export const Bolt = I(<><path d="M13 2 3 14h7l-1 8 10-12h-7z" /></>);
export const Download = I(<><path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 21h14" /></>);
