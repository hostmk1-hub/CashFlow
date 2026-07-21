import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// shadcn/ui class-name helper: merges conditional classes and dedupes Tailwind.
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
