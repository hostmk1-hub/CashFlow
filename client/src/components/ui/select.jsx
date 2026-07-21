import { cn } from '../../lib/utils.js';

// A native <select> styled to match shadcn/ui (keeps things dependency-free
// while looking consistent with the Radix-based select).
export function Select({ className, children, ...props }) {
  return (
    <select
      className={cn(
        'flex h-10 w-full items-center rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
