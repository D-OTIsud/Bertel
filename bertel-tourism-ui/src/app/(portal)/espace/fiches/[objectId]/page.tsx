'use client';

// Route d'une fiche du portail partenaire (18a). `params` est une Promise dans l'App
// Router : même lecture que le wrapper back-office `(main)/objects/[objectId]/edit/page.tsx`.
//
// Le `<Suspense>` n'est pas décoratif : `PortalFichePage` descend jusqu'à `useSearchParams`
// (`?rubrique=`), qui exige une frontière de suspense — sans elle, la page entière bascule
// en rendu client au build.
import { Suspense, use } from 'react';
import { PortalFichePage } from '@/features/portal/PortalFichePage';

export default function PortalFicheRoute({ params }: { params: Promise<{ objectId: string }> }) {
  const { objectId } = use(params);
  return (
    <Suspense fallback={null}>
      <PortalFichePage objectId={objectId} />
    </Suspense>
  );
}
