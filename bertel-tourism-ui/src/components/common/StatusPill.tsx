import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface StatusPillProps {
  tone: 'green' | 'orange' | 'red' | 'neutral';
  children: ReactNode;
}

export function StatusPill({ tone, children }: StatusPillProps) {
  return (
    <span className={cn('status-pill', `status-pill--${tone}`)}>
      <span className="status-pill__dot" aria-hidden="true" />
      {children}
    </span>
  );
}
