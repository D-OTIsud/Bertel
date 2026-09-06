'use client';

// Chrome de l'Espace partenaire (18a, D10) — délibérément MINIMAL : barre haute collante
// (logo + nom de l'organisation + « Espace partenaire », prénom, « Se déconnecter »), colonne
// unique, pied légal. AUCUNE nav back-office, aucune cloche (v1 = e-mail + états écrits),
// aucun ⌘K : chaque commande de plus est une occasion de se perdre pour quelqu'un qui vient
// mettre à jour un horaire depuis son téléphone.
//
// La déconnexion passe par services/auth.signOut() : l'événement SIGNED_OUT remet la session
// en invité et la garde redirige — jamais de router.replace ici.
//
// ═══════════════════════════════════════════════════════════════════════════════════
// LA DÉCONNEXION DÉTRUIT, ET ELLE LE DIT.
// ═══════════════════════════════════════════════════════════════════════════════════
//
// Elle purge les TROIS familles de clés (`portal-draft:`, `portal-form:`, `portal-sent:`)
// et pour TOUTES les fiches du compte, pas seulement celle ouverte. La purge est gardée —
// un téléphone ou un poste d'office est souvent partagé, et laisser la saisie d'un
// partenaire sur l'appareil du suivant est le risque qui l'a fait naître. Mais elle passe
// désormais par une question, comme « Annuler mes modifications » (PortalSendBar), et avec
// le même vocabulaire.
//
// La question n'est posée QUE s'il y a quelque chose à perdre (`hasUnsentPortalWork`, qui
// balaye le compte entier) : sans saisie en attente la déconnexion reste un seul geste.
import { useState } from 'react';
import { SandboxBanner } from '../layout/SandboxBanner';
import { LogOut } from 'lucide-react';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { signOut } from '../../services/auth';
import { useSessionStore } from '../../store/session-store';
import { useThemeStore } from '../../store/theme-store';
import { useToast } from '../../hooks/useToast';
import { clearAllPortalDrafts, hasUnsentPortalWork } from '../../features/portal/usePortalDraft';

export function PortalShell({ children }: { children: React.ReactNode }) {
  const brandName = useThemeStore((state) => state.theme.brandName);
  const logoUrl = useThemeStore((state) => state.theme.logoUrl);
  const userName = useSessionStore((state) => state.userName);
  const userId = useSessionStore((state) => state.userId);
  const toast = useToast();
  const [askSignOut, setAskSignOut] = useState(false);

  /** Le clic sur « Se déconnecter » : il DEMANDE avant de détruire, ou file droit. */
  function requestSignOut() {
    if (hasUnsentPortalWork(userId)) {
      setAskSignOut(true);
      return;
    }
    void handleSignOut();
  }

  async function handleSignOut() {
    // L'id est capturé AVANT : la session bascule en invité dès que signOut() aboutit, et
    // `userId` retomberait à null avant qu'on sache quoi purger.
    const account = userId;
    try {
      await signOut();
    } catch (error) {
      // Échec réseau : le partenaire reste connecté. On ne touche à RIEN — la purge suit
      // une déconnexion réussie, jamais l'inverse, sinon une coupure détruit tout le
      // travail non encore envoyé à l'office.
      toast.error(error instanceof Error ? error.message : 'La déconnexion a échoué. Réessayez.');
      return;
    }
    clearAllPortalDrafts(account);
  }

  return (
    <div className="portal-shell">
      <a className="skip-link" href="#portal-main">
        Aller au contenu
      </a>
      <header className="portal-shell__bar">
        <div className="portal-shell__brand">
          {/* alt vide : le nom de l'organisation est juste à côté, en texte. */}
          {logoUrl ? <img src={logoUrl} alt="" width={32} height={32} /> : null}
          <span className="portal-shell__brand-text">
            <span className="portal-shell__brand-name">{brandName}</span>
            <span className="eyebrow">Espace partenaire</span>
          </span>
        </div>
        <div className="portal-shell__user">
          <span className="portal-shell__user-name muted">{userName}</span>
          <button type="button" className="ghost-button" onClick={requestSignOut}>
            <LogOut size={16} aria-hidden /> Se déconnecter
          </button>
        </div>
      </header>
      <SandboxBanner />
      <main id="portal-main" className="portal-shell__main">
        {children}
      </main>
      <footer className="auth-legal portal-shell__legal">
        <a href="/legal/rgpd.html" target="_blank" rel="noopener noreferrer">
          Confidentialité
        </a>
        <span className="auth-legal__sep" aria-hidden="true">
          ·
        </span>
        <a href="/legal/cgu.html" target="_blank" rel="noopener noreferrer">
          Conditions d’utilisation
        </a>
      </footer>

      <ConfirmDialog
        open={askSignOut}
        className="portal-modal"
        title="Vous avez des modifications non envoyées"
        message="Tout ce que vous avez saisi sur cet appareil sera perdu, y compris votre message à l’office. Votre fiche publiée ne change pas. Cet appareil peut être partagé : c’est pourquoi vos modifications sont effacées quand vous vous déconnectez."
        cancelLabel="Rester connecté"
        confirmLabel="Effacer et me déconnecter"
        tone="danger"
        onCancel={() => setAskSignOut(false)}
        onConfirm={() => {
          setAskSignOut(false);
          void handleSignOut();
        }}
      />
    </div>
  );
}
