import type { Metadata } from 'next';
import Script from 'next/script';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@/fonts.css';
import '@/styles.css';
import '@/features/lists/oti-template.css';
import { Providers } from '@/components/Providers';

// The same eight Latin assets previously preloaded by next/font/google.
const LATIN_FONT_PRELOADS = [
  '/fonts/manrope/8760c4774489e4ba-s.p.woff2',
  '/fonts/sora/3dc379dc9b5dec12-s.p.woff2',
  '/fonts/ibm-plex-mono/d3ebbfd689654d3a-s.p.woff2',
  '/fonts/ibm-plex-mono/98e207f02528a563-s.p.woff2',
  '/fonts/kaushan-script/e6df576ec67d906e-s.p.woff2',
  '/fonts/poppins/0484562807a97172-s.p.woff2',
  '/fonts/poppins/b957ea75a84b6ea7-s.p.woff2',
  '/fonts/poppins/7db6c35d839a711c-s.p.woff2',
];

export const metadata: Metadata = {
  title: 'Bertel — Gouvernance touristique',
  description: 'Plateforme de gestion touristique et CRM collaborative.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="app-fonts">
      <head>
        {LATIN_FONT_PRELOADS.map((href) => (
          <link key={href} rel="preload" href={href} as="font" type="font/woff2" crossOrigin="anonymous" />
        ))}
      </head>
      <body>
        <Script src="/runtime-config.js" strategy="beforeInteractive" />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
