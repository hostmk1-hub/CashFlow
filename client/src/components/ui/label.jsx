import { cn } from '../../lib/utils.js';

export function Label({ className, ...props }) {
  return (
    <label
      className={cn('mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground', className)}
      {...props}
    />
  );
}
