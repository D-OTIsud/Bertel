import type { Metadata } from 'next';
import Script from 'next/script';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@/styles.css';
import { Providers } from '@/components/Providers';

export const metadata: Metadata = {
  title: 'Bertel Tourism UI',
  description: 'Plateforme de gestion touristique et CRM collaborative.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>
        <Script src="/runtime-config.js" strategy="beforeInteractive" />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
