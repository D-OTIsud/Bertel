"use client";

// Modal « Nouvelle interaction » (§61 rectif PO point 3 ; §66 décision 1 ; Phase 5.2) — le
// composer inline de la fiche acteur déménage ici, et la vue établissement gagne le même
// formulaire avec contexte FIXÉ (+ acteur optionnel parmi les acteurs liés). Ancrage :
// actorId (fiche) OU objectId (vue établissement) — le backend exige ≥1 des deux
// (chk_crm_interaction_anchor). Toujours ouvert sous gating write_crm_notes : les boutons
// d'ouverture des vues sont désactivés avec raison sans permission.
//
// §66 — ÉTABLISSEMENT REQUIS : l'option « Contexte : général » est retirée du modal de
// création. Une interaction créée ici a TOUJOURS un objet ⇒ on peut proposer une tâche de
// suivi (« relance ») LIÉE.
//
// Phase 5.2 (maquette p5-02) — DÉ-MODALISATION : plus de formulaire-de-relance IMBRIQUÉ dans
// le formulaire d'interaction. Le flux est désormais EN DEUX TEMPS : (1) on consigne
// l'interaction, puis (2) un état de confirmation propose « + Ajouter une relance ». La
// relance (tâche liée) se crée APRÈS l'enregistrement, via deux mutations distinctes —
// l'interaction n'est jamais re-créée si la relance échoue (idempotence naturelle).

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Mail, MapPin, Phone, Plus, StickyNote } from 'lucide-react';
import { listCrmAssignees, saveCrmInteraction, saveCrmTask } from '../../services/crm';
import { useSessionStore } from '../../store/session-store';
import { CRM_SENTIMENT_OPTIONS } from './crm-view-utils';
import { CrmModal } from './CrmModal';
import { SearchSelect } from '../../components/ui/pickers';

// Kinds du composer v2 : Appel / E-mail / Visite terrain / Note interne.
const COMPOSER_KINDS = [
  { code: 'call', label: 'Appel', Icon: Phone },
  { code: 'email', label: 'E-mail', Icon: Mail },
  { code: 'visit', label: 'Visite terrain', Icon: MapPin },
  { code: 'note', label: 'Note interne', Icon: StickyNote },
] as const;

// Titre par défaut d'une relance quand aucun sujet n'est choisi (éditable).
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

  // Phase 5.2 — flux 2-temps : `savedInteractionId` non-null ⇒ l'interaction est consignée,
  // on passe à l'état « relance ». `addingRelance` ⇒ les champs de la relance sont révélés.
  const [savedInteractionId, setSavedInteractionId] = useState<string | null>(null);
  const [addingRelance, setAddingRelance] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskTitleTouched, setTaskTitleTouched] = useState(false);
  const [taskDue, setTaskDue] = useState('');
  const [taskOwner, setTaskOwner] = useState('');

  // Assignables (PO point 4) — défaut = utilisateur courant. Chargé seulement quand on ouvre
  // la relance (le select n'apparaît qu'alors).
  const assigneesQuery = useQuery({ queryKey: ['crm-assignees'], queryFn: listCrmAssignees, enabled: addingRelance });
  const assignees = assigneesQuery.data ?? [];

  const objectId = fixedContext ? fixedContext.objectId : ctx || undefined;
  const anchorActorId = actorId ?? (pickedActor || undefined);

  // Owner effectif : choix explicite > utilisateur courant (s'il est assignable) > 1er
  // assignable > aucun (omis ⇒ le backend retombe sur self). Jamais bloquant.
  const resolvedOwner =
    taskOwner ||
    (currentUserId && assignees.some((a) => a.userId === currentUserId) ? currentUserId : assignees[0]?.userId) ||
    '';

  // Titre de relance effectif : valeur saisie si l'utilisateur l'a touchée, sinon prérempli
  // depuis le sujet choisi (à défaut un défaut court). Toujours éditable.
  const selectedTopicName = topics.find((topic) => topic.code === topicCode)?.name;
  const effectiveTaskTitle = taskTitleTouched ? taskTitle : selectedTopicName ?? DEFAULT_TASK_TITLE;

  // Phase 1 — consigner l'interaction. onSaved() rafraîchit la vue dès l'écriture confirmée ;
  // le modal RESTE ouvert pour proposer la relance (pas de formulaire imbriqué).
  const interactionMutation = useMutation({
    mutationFn: () =>
      saveCrmInteraction({
        ...(anchorActorId ? { actorId: anchorActorId } : {}),
        ...(objectId ? { objectId } : {}),
        interactionType: kind,
        body: body.trim(),
        ...(topicCode ? { topicCode } : {}),
        ...(sentimentCode ? { sentimentCode } : {}),
      }),
    onSuccess: (interactionId) => {
      setSavedInteractionId(interactionId);
      onSaved();
    },
  });

  // Phase 2 — créer la relance (tâche liée) avec l'id d'interaction déjà consignée. Mutation
  // SÉPARÉE : un échec ne touche pas l'interaction (idempotence naturelle ; le retry ne rejoue
  // que la tâche).
  const taskMutation = useMutation({
    mutationFn: () =>
      saveCrmTask({
        objectId: objectId as string, // garanti : établissement requis
        ...(anchorActorId ? { actorId: anchorActorId } : {}),
        title: effectiveTaskTitle.trim(),
        ...(taskDue ? { dueAt: taskDue } : {}),
        ...(resolvedOwner ? { owner: resolvedOwner } : {}),
        relatedInteractionId: savedInteractionId as string,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['crm-tasks'] });
      onSaved();
      onClose();
    },
  });

  // §66 — établissement requis : `objectId` obligatoire (en plus du corps) pour consigner.
  const canConsign = body.trim().length > 0 && Boolean(objectId) && !interactionMutation.isPending;
  const taskTitleMissing = effectiveTaskTitle.trim().length === 0;
  const canSaveRelance = !taskTitleMissing && !taskMutation.isPending;

  const isComposing = savedInteractionId === null;

  return (
    <CrmModal title="Nouvelle interaction" onClose={onClose}>
      {isComposing ? (
        <>
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
              <SearchSelect
                aria-label="Contexte"
                value={ctx}
                options={(contexts ?? []).map((object) => ({ code: object.objectId, label: object.objectName }))}
                onChange={setCtx}
                placeholder="— Établissement —"
                searchPlaceholder="Rechercher un établissement…"
              />
            </label>
          )}

          {fixedContext && (actorOptions?.length ?? 0) > 0 && (
            <label className="crm-field">
              Acteur (optionnel)
              <SearchSelect
                aria-label="Acteur"
                value={pickedActor}
                options={(actorOptions ?? []).map((actor) => ({ code: actor.actorId, label: actor.displayName }))}
                onChange={setPickedActor}
                allowClear
                clearLabel="— Aucun acteur —"
                placeholder="— Aucun acteur —"
                searchPlaceholder="Rechercher un acteur…"
              />
            </label>
          )}

          <div className="crm-row2">
            <label className="crm-field">
              Sujet
              <SearchSelect
                aria-label="Sujet normalisé"
                value={topicCode}
                options={topics.map((topic) => ({ code: topic.code, label: topic.name }))}
                onChange={setTopicCode}
                allowClear
                clearLabel="— Aucun sujet —"
                placeholder="— Sujet —"
                searchPlaceholder="Rechercher un sujet…"
              />
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
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && canConsign) interactionMutation.mutate();
            }}
          />

          <div className="composer__row composer__row--end">
            <button type="button" className="crm-btn primary" disabled={!canConsign} onClick={() => interactionMutation.mutate()}>
              <Plus size={12} aria-hidden /> Consigner
            </button>
          </div>

          {interactionMutation.isError && (
            <div className="inline-alert" role="alert">
              Échec de la consignation : {(interactionMutation.error as Error).message}
            </div>
          )}
        </>
      ) : (
        <>
          {/* Phase 5.2 — état de confirmation : l'interaction est consignée. On propose la
              relance comme une affordance SÉPARÉE (plus de formulaire imbriqué). */}
          <div className="crm-saved-banner" role="status">
            <Check size={15} aria-hidden /> Interaction enregistrée.
          </div>

          {!addingRelance ? (
            <div className="composer__row composer__row--end">
              <button type="button" className="crm-btn" onClick={onClose}>
                Terminer
              </button>
              <button type="button" className="crm-btn primary" onClick={() => setAddingRelance(true)}>
                <Plus size={12} aria-hidden /> Ajouter une relance
              </button>
            </div>
          ) : (
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
              {taskTitleMissing && <p className="crm-field__hint">Renseignez un titre de tâche.</p>}
              <div className="composer__row composer__row--end">
                <button type="button" className="crm-btn" onClick={onClose}>
                  Plus tard
                </button>
                <button type="button" className="crm-btn primary" disabled={!canSaveRelance} onClick={() => taskMutation.mutate()}>
                  <Check size={12} aria-hidden /> Enregistrer la relance
                </button>
              </div>
              {taskMutation.isError && (
                <div className="inline-alert" role="alert">
                  Échec de la relance : {(taskMutation.error as Error).message}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </CrmModal>
  );
}
