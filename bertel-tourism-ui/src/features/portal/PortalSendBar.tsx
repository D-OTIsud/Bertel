'use client';

/**
 * La barre d'envoi — le seul appel à l'action de la page, et il ne ment jamais.
 *
 * `position: sticky`, jamais `fixed` : un élément fixe saute au-dessus du clavier sur iOS
 * et se retrouve au milieu de l'écran pendant la saisie.
 *
 * Quand l'envoi est impossible — une vérification déjà ouverte, ou pas de réseau — le
 * bouton reste FOCALISABLE (`aria-disabled`, motif D10) et la raison est écrite juste à
 * côté : un bouton grisé sans explication laisse le partenaire relancer dix fois, puis
 * appeler l'office.
 */
import { useSyncExternalStore } from 'react';
import { WifiOff } from 'lucide-react';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { useState } from 'react';

/**
 * La ligne d'état, ACCORDÉE. Le pluriel se décide sur le nombre, une fois, ici — pas trois
 * fois dans le JSX, où « 1 rubrique modifiée · enregistrées » avait survécu.
 */
function stateLine(dirtyCount: number, heldCount: number, savedAt: string | null): string {
  const total = dirtyCount + heldCount;
  const s = total > 1 ? 's' : '';
  const head = `${total} rubrique${s} modifiée${s}`;
  if (heldCount > 0 && dirtyCount === 0) {
    return `${head} · gardée${s} sur cet appareil, à envoyer quand l’office aura terminé sa vérification.`;
  }
  return savedAt ? `${head} · enregistrée${s} sur cet appareil` : head;
}

function subscribeOnline(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

export function PortalSendBar({
  dirtyCount,
  heldCount,
  savedAt,
  verificationOpen,
  onSend,
  onDiscard,
}: {
  dirtyCount: number;
  /**
   * Rubriques DÉJÀ parties en vérification et remodifiées depuis. Elles ne peuvent pas
   * partir (une seule vérification ouverte par fiche), mais la saisie est au chaud — et
   * sans ce comptage la barre n'apparaît pas : « Valider » n'aurait AUCUN effet visible.
   */
  heldCount: number;
  savedAt: string | null;
  /** Une vérification est déjà ouverte côté office : rien de neuf ne peut partir. */
  verificationOpen: boolean;
  onSend: () => void;
  onDiscard: () => void;
}) {
  const [askDiscard, setAskDiscard] = useState(false);
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    // Au rendu serveur on suppose la connexion : afficher « pas de connexion » à quelqu'un
    // qui en a une serait un mensonge de plus.
    () => true,
  );

  if (dirtyCount === 0 && heldCount === 0) return null;

  const blocked = verificationOpen || !online;
  const reason = verificationOpen
    ? 'Vérification en cours — vous pourrez envoyer vos nouveaux changements quand l’office aura terminé.'
    : !online
      ? 'Pas de connexion. Vos modifications sont conservées ici.'
      : null;

  return (
    <div className="portal-sendbar">
      <p className="portal-sendbar__state">{stateLine(dirtyCount, heldCount, savedAt)}</p>
      {reason ? (
        <p className="portal-sendbar__reason" id="portal-send-reason">
          {!online ? <WifiOff size={16} aria-hidden /> : null} {reason}
        </p>
      ) : null}
      <div className="portal-sendbar__actions">
        <button
          type="button"
          className="primary-button"
          aria-disabled={blocked || undefined}
          aria-describedby={reason ? 'portal-send-reason' : undefined}
          onClick={() => {
            if (blocked) return;
            onSend();
          }}
        >
          Envoyer à l’office
        </button>
        <button type="button" className="ghost-button" onClick={() => setAskDiscard(true)}>
          Annuler mes modifications
        </button>
      </div>

      <ConfirmDialog
        open={askDiscard}
        className="portal-modal"
        title="Effacer vos modifications ?"
        message="Tout ce que vous avez saisi sur cet appareil sera perdu, y compris votre message à l’office. Votre fiche publiée ne change pas."
        cancelLabel="Garder"
        confirmLabel="Effacer"
        tone="danger"
        onCancel={() => setAskDiscard(false)}
        onConfirm={() => {
          setAskDiscard(false);
          onDiscard();
        }}
      />
    </div>
  );
}
