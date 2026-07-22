import { cn } from '../../lib/utils.js';

// A native <select> styled to match the Input — clear border + fill in both themes.
export function Select({ className, children, ...props }) {
  return (
    <select
      className={cn(
        'h-11 w-full items-center rounded-lg border border-input bg-background px-3.5 text-[15px] text-foreground shadow-sm ' +
          'transition-colors focus-visible:outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/25 disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
