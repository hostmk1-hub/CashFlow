import { cn } from '../../lib/utils.js';

// shadcn/ui-styled dialog. Dependency-free (no Radix) but same visual language:
// centered card, overlay, header/footer slots. Closes on overlay click / ×.
export function Dialog({ open = true, onOpenChange, className, children }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/60 p-5 backdrop-blur-sm"
      onClick={() => onOpenChange?.(false)}
    >
      <div
        className={cn('w-full max-w-lg max-h-[90vh] overflow-auto rounded-2xl border border-border bg-card text-card-foreground shadow-2xl', className)}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
export function DialogHeader({ title, onClose }) {
  return (
    <div className="flex items-center justify-between border-b border-border px-5 py-4">
      <h3 className="text-[17px] font-semibold">{title}</h3>
      <button className="text-xl leading-none text-muted-foreground hover:text-foreground" onClick={onClose}>×</button>
    </div>
  );
}
export function DialogBody({ className, ...props }) {
  return <div className={cn('p-5', className)} {...props} />;
}
export function DialogFooter({ className, ...props }) {
  return <div className={cn('flex justify-end gap-2 border-t border-border px-5 py-4', className)} {...props} />;
}
