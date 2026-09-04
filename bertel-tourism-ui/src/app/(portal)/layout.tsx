// Racine de l'Espace partenaire (18a). Composant SERVEUR : un layout client ne peut exporter
// ni `metadata` ni `viewport`. Ce fichier ne porte donc QUE le titre d'onglet et le viewport ;
// toute la logique de session vit dans PortalGate.
//
// `viewportFit: 'cover'` n'est pas décoratif : sans lui, `env(safe-area-inset-bottom)` vaut 0
// sur iPhone et la barre d'envoi de la fiche (Task 14) se colle sous la barre système.
import type { Metadata, Viewport } from 'next';
import { PortalGate } from '@/components/portal/PortalGate';

export const metadata: Metadata = { title: 'Espace partenaire' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <PortalGate>{children}</PortalGate>;
}
