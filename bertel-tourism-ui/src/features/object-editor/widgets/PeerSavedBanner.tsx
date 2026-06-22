import type { PeerSavedNotice } from '../presence/editor-presence';

interface PeerSavedBannerProps {
  notice: PeerSavedNotice | null;
  onReload: () => void;
  onDismiss: () => void;
}

/**
 * Non-blocking conflict banner: another editor saved the fiche while you have it open.
 * Reloading pulls in their changes; otherwise your next save may overwrite them.
 */
export function PeerSavedBanner({ notice, onReload, onDismiss }: PeerSavedBannerProps) {
  if (!notice) {
    return null;
  }

  return (
    <div className="peer-saved-banner" role="status">
      <span className="peer-saved-banner__text">
        <strong>{notice.name}</strong> a enregistré cette fiche. Recharge pour intégrer ses
        changements, sinon ton prochain enregistrement pourrait les écraser.
      </span>
      <span className="peer-saved-banner__actions">
        <button type="button" className="btn sm primary" onClick={onReload}>
          Recharger
        </button>
        <button type="button" className="btn sm" onClick={onDismiss}>
          Ignorer
        </button>
      </span>
    </div>
  );
}
