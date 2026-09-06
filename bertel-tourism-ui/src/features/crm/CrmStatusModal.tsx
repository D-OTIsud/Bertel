"use client";

// Sélecteur de statut de la demande (spec §6.6, cycle de vie §6.1, manifeste 17g).
//
// POURQUOI UNE MODALE PLUTÔT QU'UN BOUTON BASCULE. Le cycle a six états ; une bascule n'en
// exprime que deux. Et la chip de statut vit dans `.tl-card__nav`, qui porte role="button" :
// aucun contrôle interactif ne peut y vivre (a11y §66). Le contrôle vit donc dans
// `.tl-actions`, en frère, et ouvre cette modale — vue compacte, détail derrière un bouton.
//
// PRIMITIVE : `CrmModal`, PAS `components/common/Modal` — cette dernière fait un
// createPortal vers document.body et sortirait du scope `.crm-app` où vivent TOUT le CSS du
// module et ses tokens (--crm-amber-*, tl-status--*). Même piège que EditorCrmDrawer.
//
// PRÉSENTATIONNELLE : la date d'entrée en attente arrive par PROP. L'hôte porte le useQuery
// sur le journal de transitions et l'invalidation du cache après écriture. La modale ne sait
// pas d'où vient la date — c'est ce qui la rend testable seule.

import { useState } from 'react';
import { Check } from 'lucide-react';

import { CrmModal } from './CrmModal';
import {
  INTERACTION_STATUSES,
  interactionStatusLabel,
  interactionStatusTone,
  type AnyCrmInteractionStatus,
  type CrmInteractionStatus,
} from './crm-status';

const MS_PER_DAY = 86_400_000;

/** Jours pleins écoulés. `null` si la date est absente ou illisible — jamais 0 par défaut :
 *  « zéro jour » est une affirmation, « je ne sais pas » en est une autre. */
export function daysSince(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const start = new Date(iso).getTime();
  if (Number.isNaN(start)) return null;
  return Math.max(0, Math.floor((now.getTime() - start) / MS_PER_DAY));
}

export function CrmStatusModal({
  rootId,
  status,
  canWrite,
  readOnlyReason,
  awaitingSince,
  onChangeStatus,
  onClose,
  now = new Date(),
}: {
  rootId: string;
  /** Statut courant, tel que la base l'émet. `string` et non l'union : un code hors registre
   *  doit pouvoir arriver ici sans casser le rendu (cf. régression 0f036b6). */
  status: string | null | undefined;
  canWrite?: boolean;
  readOnlyReason?: string;
  /** Date du dernier passage à « Attente prestataire », depuis le journal. Peut manquer :
   *  une demande née avant la bascule 17g n'a pas d'événement de création au journal. */
  awaitingSince?: string | null;
  onChangeStatus: (rootId: string, status: AnyCrmInteractionStatus) => Promise<void> | void;
  onClose: () => void;
  /** Injectable pour les tests — même patron que formatRelative. */
  now?: Date;
}) {
  // Le statut courant ne présélectionne QUE s'il appartient au registre. Un code inconnu ne
  // se fait passer pour aucun des six : l'agent doit choisir explicitement.
  const [choice, setChoice] = useState<CrmInteractionStatus | null>(
    INTERACTION_STATUSES.includes(status as CrmInteractionStatus) ? (status as CrmInteractionStatus) : null,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disabled = canWrite === false;
  const gateTitle = disabled ? readOnlyReason : undefined;
  const waitingDays = daysSince(awaitingSince, now);

  async function save() {
    if (saving) return;
    // Rien à écrire si le choix n'a pas bougé : une écriture sans changement produirait une
    // ligne de journal pour rien et daterait une transition qui n'a pas eu lieu.
    if (choice === null || choice === status) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onChangeStatus(rootId, choice);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Échec de la mise à jour du statut.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <CrmModal
      title="Statut de la demande"
      onClose={onClose}
      footer={
        <button type="button" className="crm-btn primary" disabled={disabled || saving} title={gateTitle} onClick={() => void save()}>
          <Check size={13} aria-hidden /> Enregistrer
        </button>
      }
    >
      <div className="crm-field" role="group" aria-label="Statut de la demande">
        <div className="composer__kinds crm-status-choices">
          {INTERACTION_STATUSES.map((code) => (
            <button
              key={code}
              type="button"
              // Pas de classe `is-on` : elle déclencherait le remplissage accent de
              // `.kind-chip.is-on`, qui écraserait la teinte du statut. La sélection est
              // rendue depuis `aria-pressed` (voir styles.css).
              className={'kind-chip crm-status-choice tl-status--' + interactionStatusTone(code)}
              aria-pressed={choice === code}
              disabled={disabled || saving}
              title={gateTitle}
              onClick={() => setChoice(code)}
            >
              {interactionStatusLabel(code)}
            </button>
          ))}
        </div>
      </div>

      {status === 'awaiting_provider' ? (
        <p className="crm-status-waiting">
          {waitingDays === null
            ? 'En attente du prestataire depuis une date inconnue — cette demande est antérieure au journal des transitions. Ce temps est déduit du temps de traitement de l’équipe.'
            : `En attente du prestataire depuis ${waitingDays} ${waitingDays > 1 ? 'jours' : 'jour'}. Ce temps est déduit du temps de traitement de l’équipe, et il continue de courir tant que le statut n’est pas changé.`}
        </p>
      ) : null}

      {/* Même primitive d'alerte que le reste du module (role="alert" compris) : une seconde
          classe d'erreur propre à cette modale ferait diverger deux surfaces pour un besoin. */}
      {error ? (
        <span className="inline-alert" role="alert">
          {error}
        </span>
      ) : null}
    </CrmModal>
  );
}
