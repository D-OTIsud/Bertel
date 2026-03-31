import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, style, ...props }, ref) => {
    return (
      <div className="group relative grid min-w-0">
        <select
          className={cn(
            'flex h-11 w-full cursor-pointer appearance-none rounded-xl border border-input bg-background/80 bg-none px-4 py-2 pr-11 text-sm shadow-sm ring-offset-background transition-colors hover:border-[rgba(23,107,106,0.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
          ref={ref}
          style={{ backgroundImage: 'none', ...(style ?? {}) }}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          size={16}
          className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[color:var(--text-muted,#655245)] transition-colors group-hover:text-[color:var(--theme-primary)] group-focus-within:text-[color:var(--theme-primary)]"
          aria-hidden="true"
        />
      </div>
    );
  },
);
Select.displayName = 'Select';

export { Select };
