"use client";

// Modal « Nouvelle interaction » (§61 rectif PO point 3) — le composer inline de la
// fiche acteur déménage ici, et la vue établissement gagne le même formulaire avec
// contexte FIXÉ (+ acteur optionnel parmi les acteurs liés). Ancrage : actorId (fiche)
// OU objectId (vue établissement) — le backend exige ≥1 des deux
// (chk_crm_interaction_anchor). Toujours ouvert sous gating write_crm_notes : les
// boutons d'ouverture des vues sont désactivés avec raison sans permission.

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Mail, MapPin, Phone, Plus, StickyNote } from 'lucide-react';
import { saveCrmInteraction } from '../../services/crm';
import { CRM_SENTIMENT_OPTIONS } from './crm-view-utils';
import { CrmModal } from './CrmModal';

// Kinds du composer v2 : Appel / E-mail / Visite terrain / Note interne.
const COMPOSER_KINDS = [
  { code: 'call', label: 'Appel', Icon: Phone },
  { code: 'email', label: 'E-mail', Icon: Mail },
  { code: 'visit', label: 'Visite terrain', Icon: MapPin },
  { code: 'note', label: 'Note interne', Icon: StickyNote },
] as const;

export function CrmInteractionModal({
  actorId,
  contexts,
  fixedContext,
  actorOptions,
  topics,
  onClose,
  onSaved,
}: {
  /** Fiche acteur : ancre acteur de l'interaction. */
  actorId?: string;
  /** Fiche acteur : contextes proposés (Général + établissements de l'acteur). */
  contexts?: Array<{ objectId: string; objectName: string }>;
  /** Vue établissement : contexte imposé (pas de select). */
  fixedContext?: { objectId: string; objectName: string };
  /** Vue établissement : acteur optionnel parmi les acteurs liés. */
  actorOptions?: Array<{ actorId: string; displayName: string }>;
  topics: Array<{ code: string; name: string }>;
  onClose: () => void;
  /** Appelé APRÈS écriture confirmée — la vue invalide ses queries (pattern §19). */
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<string>('call');
  // PO point 3 (nicety) : sur la fiche, si l'acteur n'a QU'UN établissement, le contexte
  // est pré-réglé dessus (au lieu de « Général ») — « Général » reste sélectionnable.
  const [ctx, setCtx] = useState<string>(() => (contexts && contexts.length === 1 ? contexts[0].objectId : ''));
  const [pickedActor, setPickedActor] = useState<string>('');
  const [topicCode, setTopicCode] = useState<string>('');
  const [sentimentCode, setSentimentCode] = useState<string>('');
  const [body, setBody] = useState<string>('');

  const objectId = fixedContext ? fixedContext.objectId : ctx || undefined;
  const anchorActorId = actorId ?? (pickedActor || undefined);

  const consignMutation = useMutation({
    mutationFn: () =>
      saveCrmInteraction({
        ...(anchorActorId ? { actorId: anchorActorId } : {}),
        ...(objectId ? { objectId } : {}),
        interactionType: kind,
        body: body.trim(),
        ...(topicCode ? { topicCode } : {}),
        ...(sentimentCode ? { sentimentCode } : {}),
      }),
    onSuccess: () => {
      // Écriture confirmée : informer la vue PUIS fermer (un échec de rechargement ne
      // doit pas se lire comme un échec de save). En erreur, le modal reste ouvert et
      // la saisie est conservée.
      onSaved();
      onClose();
    },
  });

  const canSubmit = body.trim().length > 0 && !consignMutation.isPending;

  return (
    <CrmModal title="Nouvelle interaction" onClose={onClose}>
      <div className="composer__kinds">
        {COMPOSER_KINDS.map(({ code, label, Icon }) => (
          <button
            key={code}
            type="button"
            className={'kind-chip' + (kind === code ? ' is-on' : '')}
            aria-pressed={kind === code}
            onClick={() => setKind(code)}
          >
            <Icon size={12} aria-hidden /> {label}
          </button>
        ))}
      </div>

      {fixedContext ? (
        <label className="crm-field">
          Contexte
          <span className="crm-field__static">{fixedContext.objectName}</span>
        </label>
      ) : (
        <label className="crm-field">
          Contexte
          <select className="crm-select" aria-label="Contexte" value={ctx} onChange={(event) => setCtx(event.target.value)}>
            <option value="">Contexte : général</option>
            {(contexts ?? []).map((object) => (
              <option key={object.objectId} value={object.objectId}>
                {object.objectName}
              </option>
            ))}
          </select>
        </label>
      )}

      {fixedContext && (actorOptions?.length ?? 0) > 0 && (
        <label className="crm-field">
          Acteur (optionnel)
          <select
            className="crm-select"
            aria-label="Acteur"
            value={pickedActor}
            onChange={(event) => setPickedActor(event.target.value)}
          >
            <option value="">— Aucun acteur —</option>
            {(actorOptions ?? []).map((actor) => (
              <option key={actor.actorId} value={actor.actorId}>
                {actor.displayName}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="crm-row2">
        <label className="crm-field">
          Sujet
          <select
            className="crm-select"
            aria-label="Sujet normalisé"
            value={topicCode}
            onChange={(event) => setTopicCode(event.target.value)}
          >
            <option value="">— Sujet —</option>
            {topics.map((topic) => (
              <option key={topic.code} value={topic.code}>
                {topic.name}
              </option>
            ))}
          </select>
        </label>
        <label className="crm-field">
          Sentiment
          <select
            className="crm-select"
            aria-label="Sentiment"
            value={sentimentCode}
            onChange={(event) => setSentimentCode(event.target.value)}
          >
            <option value="">— Sentiment —</option>
            {CRM_SENTIMENT_OPTIONS.map((sentiment) => (
              <option key={sentiment.code} value={sentiment.code}>
                {sentiment.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* PO point 2 : champ multi-lignes (5 lignes — c'est un modal, autant utiliser la
          place). Ctrl/Cmd+Entrée consigne (Entrée seul = retour à la ligne, normal pour un
          textarea) ; le bouton Consigner reste la voie principale. */}
      <textarea
        className="note note--area"
        rows={5}
        placeholder="Consigner une interaction… (résumé)"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && canSubmit) consignMutation.mutate();
        }}
      />
      <div className="composer__row composer__row--end">
        <button type="button" className="crm-btn primary" disabled={!canSubmit} onClick={() => consignMutation.mutate()}>
          <Plus size={12} aria-hidden /> Consigner
        </button>
      </div>

      {consignMutation.isError && (
        <div className="inline-alert" role="alert">
          Échec de la consignation : {(consignMutation.error as Error).message}
        </div>
      )}
    </CrmModal>
  );
}
