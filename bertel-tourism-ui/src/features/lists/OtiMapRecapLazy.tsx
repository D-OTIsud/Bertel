'use client';

// Seam de code-split : maplibre-gl (~250 kB gz) ne rejoint le bundle (page publique /l/…,
// compose) que si une carte est réellement rendue. Les tests mockent ce module.
import dynamic from 'next/dynamic';

const OtiMapRecapLazy = dynamic(() => import('./OtiMapRecap'), {
  ssr: false,
  // Pendant le chargement du chunk : le même bloc décoratif que le repli (sans pins).
  loading: () => <div className="oti-map" aria-hidden="true" />,
});

export default OtiMapRecapLazy;
