import { cn } from '../../lib/utils.js';

export function Table({ className, ...props }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full caption-bottom text-sm border-collapse', className)} {...props} />
    </div>
  );
}
export function TableHeader({ className, ...props }) {
  return <thead className={cn('', className)} {...props} />;
}
export function TableBody({ className, ...props }) {
  return <tbody className={cn('', className)} {...props} />;
}
export function TableRow({ className, clickable, ...props }) {
  return (
    <tr
      className={cn('border-b border-border last:border-0', clickable && 'cursor-pointer hover:bg-accent/50', className)}
      {...props}
    />
  );
}
export function TableHead({ className, ...props }) {
  return (
    <th
      className={cn('px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap', className)}
      {...props}
    />
  );
}
export function TableCell({ className, ...props }) {
  return <td className={cn('px-3.5 py-2.5 align-middle', className)} {...props} />;
}
