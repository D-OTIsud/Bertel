"use client";

// Modal « Nouvelle interaction » (§61 rectif PO point 3 ; §66 décision 1) — le composer
// inline de la fiche acteur déménage ici, et la vue établissement gagne le même formulaire
// avec contexte FIXÉ (+ acteur optionnel parmi les acteurs liés). Ancrage : actorId (fiche)
// OU objectId (vue établissement) — le backend exige ≥1 des deux (chk_crm_interaction_anchor).
// Toujours ouvert sous gating write_crm_notes : les boutons d'ouverture des vues sont
// désactivés avec raison sans permission.
//
// §66 — ÉTABLISSEMENT REQUIS : l'option « Contexte : général » est retirée du modal de
// création (la donnée « générale » importée + l'ancrage acteur des réponses restent en base ;
// seul le filtre « Général » de la timeline subsiste pour la consultation). Conséquence :
// une interaction créée ici a TOUJOURS un objet ⇒ on peut proposer une tâche de suivi LIÉE
// (option facultative, titre/échéance/assigné), soumise séquentiellement après l'interaction.

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, MapPin, Phone, Plus, StickyNote } from 'lucide-react';
import { listCrmAssignees, saveCrmInteraction, saveCrmTask } from '../../services/crm';
import { useSessionStore } from '../../store/session-store';
import { CRM_SENTIMENT_OPTIONS } from './crm-view-utils';
import { CrmModal } from './CrmModal';

// Kinds du composer v2 : Appel / E-mail / Visite terrain / Note interne.
const COMPOSER_KINDS = [
  { code: 'call', label: 'Appel', Icon: Phone },
  { code: 'email', label: 'E-mail', Icon: Mail },
  { code: 'visit', label: 'Visite terrain', Icon: MapPin },
  { code: 'note', label: 'Note interne', Icon: StickyNote },
] as const;

// Titre par défaut d'une tâche de suivi quand aucun sujet n'est choisi (éditable).
const DEFAULT_TASK_TITLE = 'Suivi de l’interaction';

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
  /** Fiche acteur : établissements de l'acteur (un établissement est REQUIS — §66). */
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
  const queryClient = useQueryClient();
  const currentUserId = useSessionStore((state) => state.userId);
  const [kind, setKind] = useState<string>('call');
  // §66 — établissement REQUIS : si l'acteur n'a QU'UN établissement, il est pré-sélectionné ;
  // sinon le placeholder « — Établissement — » force un choix explicite (plus de « Général »).
  const [ctx, setCtx] = useState<string>(() => (contexts && contexts.length === 1 ? contexts[0].objectId : ''));
  const [pickedActor, setPickedActor] = useState<string>('');
  const [topicCode, setTopicCode] = useState<string>('');
  const [sentimentCode, setSentimentCode] = useState<string>('');
  const [body, setBody] = useState<string>('');

  // Tâche de suivi liée (§66 décision 1) — section facultative, n'a de sens que parce qu'un
  // objet est désormais toujours présent. Titre prérempli depuis le sujet (éditable une fois
  // que l'utilisateur l'a touché : `taskTitleTouched`).
  const [withTask, setWithTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskTitleTouched, setTaskTitleTouched] = useState(false);
  const [taskDue, setTaskDue] = useState('');
  const [taskOwner, setTaskOwner] = useState('');

  // Assignables (PO point 4) — défaut = utilisateur courant. Chargé seulement quand on coche
  // « Créer une tâche » (le select n'apparaît qu'alors).
  const assigneesQuery = useQuery({ queryKey: ['crm-assignees'], queryFn: listCrmAssignees, enabled: withTask });
  const assignees = assigneesQuery.data ?? [];

  const objectId = fixedContext ? fixedContext.objectId : ctx || undefined;
  const anchorActorId = actorId ?? (pickedActor || undefined);

  // Owner effectif : choix explicite > utilisateur courant (s'il est assignable) > 1er
  // assignable > aucun (omis ⇒ le backend retombe sur self). Jamais bloquant.
  const resolvedOwner =
    taskOwner ||
    (currentUserId && assignees.some((a) => a.userId === currentUserId) ? currentUserId : assignees[0]?.userId) ||
    '';

  // Titre de tâche effectif : valeur saisie si l'utilisateur l'a touchée, sinon prérempli
  // depuis le sujet choisi (à défaut un défaut court). Toujours éditable.
  const selectedTopicName = topics.find((topic) => topic.code === topicCode)?.name;
  const effectiveTaskTitle = taskTitleTouched ? taskTitle : selectedTopicName ?? DEFAULT_TASK_TITLE;

  // Idempotence du retry (§66) : on mémorise l'id de l'interaction déjà créée pour qu'un
  // échec de la tâche suivi d'un retry NE re-crée PAS l'interaction (seule la tâche est rejouée).
  const createdInteractionRef = useRef<string | null>(null);

  const consignMutation = useMutation({
    mutationFn: async () => {
      const interactionId =
        createdInteractionRef.current ??
        (await saveCrmInteraction({
          ...(anchorActorId ? { actorId: anchorActorId } : {}),
          ...(objectId ? { objectId } : {}),
          interactionType: kind,
          body: body.trim(),
          ...(topicCode ? { topicCode } : {}),
          ...(sentimentCode ? { sentimentCode } : {}),
        }));
      createdInteractionRef.current = interactionId;
      if (withTask) {
        await saveCrmTask({
          objectId: objectId as string, // garanti : établissement requis
          ...(anchorActorId ? { actorId: anchorActorId } : {}),
          title: effectiveTaskTitle.trim(),
          ...(taskDue ? { dueAt: taskDue } : {}),
          ...(resolvedOwner ? { owner: resolvedOwner } : {}),
          relatedInteractionId: interactionId,
        });
      }
      return interactionId;
    },
    onSuccess: () => {
      // Tâche créée : invalider le kanban (la fiche/vue invalide sa propre query interaction
      // via onSaved). Écriture confirmée : informer la vue PUIS fermer (un échec de
      // rechargement ne doit pas se lire comme un échec de save).
      if (withTask) void queryClient.invalidateQueries({ queryKey: ['crm-tasks'] });
      onSaved();
      onClose();
    },
  });

  // §66 — établissement requis : `objectId` obligatoire (en plus du corps). Si la tâche est
  // demandée, son titre ne peut être vide.
  const taskTitleMissing = withTask && effectiveTaskTitle.trim().length === 0;
  const canSubmit =
    body.trim().length > 0 && Boolean(objectId) && !taskTitleMissing && !consignMutation.isPending;

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
          Établissement
          {/* §66 — plus de « Contexte : général » : un établissement est requis. */}
          <select className="crm-select" aria-label="Contexte" value={ctx} onChange={(event) => setCtx(event.target.value)}>
            <option value="">— Établissement —</option>
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

      {/* §66 — tâche de suivi liée (facultative). Le modal n'ouvre que sous permission write
          (gating des vues consommatrices) ⇒ pas de write-trap. */}
      <div className="crm-followup">
        <label className="crm-check">
          <input
            type="checkbox"
            checked={withTask}
            onChange={(event) => setWithTask(event.target.checked)}
          />
          Créer une tâche de suivi liée
        </label>
        {withTask && (
          <div className="crm-followup__fields">
            <label className="crm-field">
              Titre de la tâche
              <input
                aria-label="Titre de la tâche"
                placeholder="Titre de la tâche"
                value={effectiveTaskTitle}
                onChange={(event) => {
                  setTaskTitleTouched(true);
                  setTaskTitle(event.target.value);
                }}
              />
            </label>
            <div className="crm-row2">
              <label className="crm-field">
                Échéance
                <input aria-label="Échéance" type="date" value={taskDue} onChange={(event) => setTaskDue(event.target.value)} />
              </label>
              {assignees.length > 0 && (
                <label className="crm-field">
                  Attribuer à
                  <select
                    className="crm-select"
                    aria-label="Attribuer à"
                    value={resolvedOwner}
                    onChange={(event) => setTaskOwner(event.target.value)}
                  >
                    {assignees.map((assignee) => (
                      <option key={assignee.userId} value={assignee.userId}>
                        {assignee.displayName}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {taskTitleMissing && (
              <p className="crm-field__hint">Renseignez un titre de tâche (ou décochez « Créer une tâche de suivi liée »).</p>
            )}
          </div>
        )}
      </div>

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
