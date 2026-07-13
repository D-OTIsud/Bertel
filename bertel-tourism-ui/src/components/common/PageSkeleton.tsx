import { SkeletonBlock } from './SkeletonBlock';

type PageSkeletonVariant = 'dashboard' | 'list' | 'form';

const VARIANT_LABEL: Record<PageSkeletonVariant, string> = {
  dashboard: 'Chargement du tableau de bord',
  list: 'Chargement de la liste',
  form: 'Chargement du formulaire',
};

function DashboardSkeletonBody() {
  return (
    <div className="page-skeleton__dashboard" aria-hidden="true">
      <div className="page-skeleton__row">
        <SkeletonBlock className="h-20 flex-1 rounded-shellMd" />
        <SkeletonBlock className="h-20 flex-1 rounded-shellMd" />
        <SkeletonBlock className="h-20 flex-1 rounded-shellMd" />
        <SkeletonBlock className="h-20 flex-1 rounded-shellMd" />
      </div>
      <SkeletonBlock className="h-64 w-full rounded-shellLg" />
      <div className="page-skeleton__row">
        <SkeletonBlock className="h-48 flex-1 rounded-shellLg" />
        <SkeletonBlock className="h-48 flex-1 rounded-shellLg" />
      </div>
    </div>
  );
}

function ListSkeletonBody() {
  return (
    <div className="page-skeleton__list" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="page-skeleton__row">
          <SkeletonBlock className="h-16 w-16 shrink-0 rounded-shellMd" />
          <div className="page-skeleton__col">
            <SkeletonBlock className="h-4 w-1/3 rounded-shellSm" />
            <SkeletonBlock className="h-3 w-1/2 rounded-shellSm" />
          </div>
        </div>
      ))}
    </div>
  );
}

function FormSkeletonBody() {
  return (
    <div className="page-skeleton__form" aria-hidden="true">
      <SkeletonBlock className="h-8 w-1/2 rounded-shellMd" />
      {Array.from({ length: 4 }, (_, index) => (
        <SkeletonBlock key={index} className="h-10 w-full rounded-shellMd" />
      ))}
    </div>
  );
}

const VARIANT_BODY: Record<PageSkeletonVariant, () => JSX.Element> = {
  dashboard: DashboardSkeletonBody,
  list: ListSkeletonBody,
  form: FormSkeletonBody,
};

/** Route/region-level loading skeleton. One accessible status region wrapping
 * purely decorative shimmer blocks sized to approximate the real content, so
 * nothing shifts layout when the real content replaces it. */
export function PageSkeleton({ variant }: { variant: PageSkeletonVariant }) {
  const Body = VARIANT_BODY[variant];
  return (
    <div role="status" aria-busy="true" aria-label={VARIANT_LABEL[variant]} className="page-skeleton">
      <Body />
    </div>
  );
}
