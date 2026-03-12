import type { ReactNode } from 'react';

interface StatusPillProps {
  tone: 'green' | 'orange' | 'red' | 'neutral';
  children: ReactNode;
}

export function StatusPill({ tone, children }: StatusPillProps) {
  return <span className={`status-pill status-pill--${tone}`}>{children}</span>;
}