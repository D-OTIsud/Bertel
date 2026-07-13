import { cn } from '@/lib/utils';

interface SkeletonBlockProps {
  className?: string;
  'data-testid'?: string;
}

/** Decorative shimmer placeholder — reuses the existing `.drawer-skeleton` primitive
 * (styles.css) so every new skeleton shares the one shimmer animation already in use
 * by ResultsListSkeleton and ObjectDrawerShell's skeletons. */
export function SkeletonBlock({ className, 'data-testid': testId }: SkeletonBlockProps) {
  return <span className={cn('drawer-skeleton', className)} aria-hidden="true" data-testid={testId} />;
}
