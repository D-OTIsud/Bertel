import type { Metadata } from 'next';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
