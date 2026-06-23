import type { Metadata } from 'next';
import Script from 'next/script';
import { Manrope, Sora, IBM_Plex_Mono } from 'next/font/google';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@/styles.css';
import { Providers } from '@/components/Providers';

// audit S5 : polices auto-hébergées via next/font (fin du `@import` Google Fonts bloquant).
const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
});
const sora = Sora({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

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
    <html lang="fr" className={`${manrope.variable} ${sora.variable} ${ibmPlexMono.variable}`}>
      <body>
        <Script src="/runtime-config.js" strategy="beforeInteractive" />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
