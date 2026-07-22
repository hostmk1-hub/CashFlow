import { cn } from '../../lib/utils.js';

const base =
  'w-full rounded-lg border border-input bg-background text-[15px] text-foreground shadow-sm transition-colors ' +
  'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring ' +
  'focus-visible:ring-4 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50';

export function Input({ className, ...props }) {
  return <input className={cn(base, 'h-11 px-3.5 py-2', className)} {...props} />;
}

export function Textarea({ className, ...props }) {
  return <textarea className={cn(base, 'min-h-[80px] px-3.5 py-2.5', className)} {...props} />;
}
