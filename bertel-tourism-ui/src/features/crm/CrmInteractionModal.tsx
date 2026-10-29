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

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Mail, MapPin, Phone, Plus, StickyNote } from 'lucide-react';
import { listCrmAssignees, saveCrmInteraction, saveCrmTask } from '../../services/crm';
import { useSessionStore } from '../../store/session-store';
import { CRM_SENTIMENT_OPTIONS } from './crm-view-utils';
import { dateInputOffset } from './crm-date-input';
import { SearchMultiSelect, SearchSelect } from '../../components/ui/pickers';
import { EditorModal } from '../object-editor/primitives/EditorModal';
import './crm-editor-modal.css';

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

  // Chantier 2026-08-28 — SUITE À DONNER, choix EXPLICITE (arbitrage PO).
  //
  // Cette modale crée deux choses de nature différente : des DEMANDES (à traiter) et des NOTES
  // internes (compte rendu d'un échange déjà clos). Elle n'envoyait aucun statut, et le serveur
  // retombait sur « traitée » : toute demande naissait donc close, invisible du filtre
  // « Actives », et les agents la rouvraient à la main dans les secondes suivantes (mesuré sur
  // les 3 interactions réellement créées par l'UI en production).
  //
  // La position INITIALE du bouton est dérivée du sujet — un sujet de demande renseigné ⇒
  // « À traiter » — pour que le cas courant soit juste sans rien cliquer ; c'est exactement la
  // règle que `api.save_crm_interaction` applique en l'absence de statut. Dès que l'agent
  // touche le bouton, SON choix gagne et ne bouge plus, même s'il change de sujet ensuite.
  const [statusTouched, setStatusTouched] = useState(false);
  const [statusChoice, setStatusChoice] = useState<'new' | 'resolved'>('resolved');
  const effectiveStatus: 'new' | 'resolved' = statusTouched ? statusChoice : topicCode ? 'new' : 'resolved';

  // Phase 5.2 — flux 2-temps : `savedInteractionId` non-null ⇒ l'interaction est consignée,
  // on passe à l'état « relance ». `addingRelance` ⇒ les champs de la relance sont révélés.
  const [savedInteractionId, setSavedInteractionId] = useState<string | null>(null);
  const [addingRelance, setAddingRelance] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskTitleTouched, setTaskTitleTouched] = useState(false);
  const [taskDue, setTaskDue] = useState('');
  // 16w — `null` = pas encore choisi (le défaut dérivé s'applique, même si la liste des
  // assignables arrive après l'ouverture) ; `[]` = tout décoché, donc soumission bloquée.
  const [pickedAssignees, setPickedAssignees] = useState<string[] | null>(null);

  // Assignables (PO point 4) — défaut = utilisateur courant. Chargé seulement quand on ouvre
  // la relance (le select n'apparaît qu'alors).
  const assigneesQuery = useQuery({ queryKey: ['crm-assignees'], queryFn: listCrmAssignees, enabled: addingRelance });
  const assignees = assigneesQuery.data ?? [];

  const objectId = fixedContext ? fixedContext.objectId : ctx || undefined;
  const anchorActorId = actorId ?? (pickedActor || undefined);

  // Assignés effectifs : choix explicite > utilisateur courant (s'il est assignable) > 1er
  // assignable. Dérivé, donc le défaut s'applique quand la liste finit de charger.
  const defaultAssignees = useMemo(() => {
    if (assignees.length === 0) return [];
    if (currentUserId && assignees.some((a) => a.userId === currentUserId)) return [currentUserId];
    return [assignees[0].userId];
  }, [assignees, currentUserId]);
  const selectedAssignees = pickedAssignees ?? defaultAssignees;

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
        // Toujours explicite : le défaut serveur reste le filet pour les AUTRES appelants,
        // il n'a pas à décider à la place d'un agent qui a le bouton sous les yeux.
        status: effectiveStatus,
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
        // 16w — la relance part avec TOUS les assignés choisis, en même temps que son lien
        // vers l'interaction consignée (les deux voyagent dans le même save).
        assigneeIds: selectedAssignees,
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
  const assigneesMissing = selectedAssignees.length === 0;
  const canSaveRelance = !taskTitleMissing && !assigneesMissing && !taskMutation.isPending;

  const isComposing = savedInteractionId === null;

  const selectedTopicLabel = topics.find((topic) => topic.code === topicCode)?.name;
  const selectedSentiment = CRM_SENTIMENT_OPTIONS.find((item) => item.code === sentimentCode)?.name;
  const selectedContextName = fixedContext?.objectName ?? contexts?.find((item) => item.objectId === ctx)?.objectName ?? 'Établissement à choisir';
  const kindLabel = COMPOSER_KINDS.find((item) => item.code === kind)?.label ?? 'Interaction';
  const footerNote = isComposing
    ? canConsign ? 'Prêt à enregistrer.' : !objectId ? 'Choisissez un établissement et résumez l’échange.' : 'Ajoutez un compte rendu pour continuer.'
    : addingRelance ? 'La relance sera liée à cette interaction déjà enregistrée.' : 'Interaction enregistrée.';
  const preview = (
    <>
      <h3>{isComposing ? 'Aperçu de l’interaction' : addingRelance ? 'Aperçu de la relance' : 'Interaction enregistrée'}</h3>
      {isComposing ? (
        <div className="crm-edit-preview">
          <div className="crm-edit-preview__meta">{kindLabel} · {selectedContextName}</div>
          <strong>{selectedTopicLabel ?? 'Nouvelle interaction'}</strong>
          <p>{body.trim() || 'Le compte rendu apparaîtra ici au fil de la saisie.'}</p>
          {selectedSentiment && <span className="crm-edit-preview__tag">Ressenti : {selectedSentiment}</span>}
          <span className="crm-edit-preview__tag">{effectiveStatus === 'new' ? 'À traiter' : 'Déjà traitée'}</span>
        </div>
      ) : (
        <div className="crm-edit-preview">
          <div className="crm-edit-preview__meta">{kindLabel} · {selectedContextName}</div>
          <strong>{selectedTopicLabel || body.trim().slice(0, 48) || 'Interaction enregistrée'}</strong>
          <p>{body.trim() || 'Aucun compte rendu.'}</p>
          <span className="crm-edit-preview__tag">Enregistrée</span>
        </div>
      )}
      {addingRelance && (
        <div className="crm-edit-preview crm-edit-preview--spaced">
          <div className="crm-edit-preview__meta">Relance à créer</div>
          <strong>{effectiveTaskTitle.trim() || DEFAULT_TASK_TITLE}</strong>
          <p>{taskDue ? `Échéance : ${taskDue}` : 'Sans échéance'}</p>
          <p>{selectedAssignees.length} personne{selectedAssignees.length > 1 ? 's' : ''} assignée{selectedAssignees.length > 1 ? 's' : ''}</p>
        </div>
      )}
      <h3>Avant d’enregistrer</h3>
      <ul className="ed-record-modal__checks">
        <li data-complete={Boolean(objectId)}><span aria-hidden>{objectId ? '✓' : '○'}</span> Établissement</li>
        <li data-complete={Boolean(body.trim())}><span aria-hidden>{body.trim() ? '✓' : '○'}</span> Compte rendu</li>
        {addingRelance && <li data-complete={!assigneesMissing}><span aria-hidden>{assigneesMissing ? '○' : '✓'}</span> Personne(s) assignée(s)</li>}
      </ul>
    </>
  );

  return (
    <EditorModal
      open
      className="crm-app ed-record-modal--crm-interaction"
      title={savedInteractionId ? 'Interaction enregistrée' : 'Nouvelle interaction'}
      eyebrow="Relation professionnels"
      onClose={onClose}
      onSave={() => {
        if (isComposing) interactionMutation.mutate();
        else if (addingRelance) taskMutation.mutate();
        else onClose();
      }}
      saveLabel={isComposing ? 'Enregistrer l’interaction' : addingRelance ? 'Enregistrer la relance' : 'Terminer'}
      saveDisabled={isComposing ? !canConsign : addingRelance ? !canSaveRelance : false}
      size="xl"
      aside={preview}
      footerNote={footerNote}
    >
      {isComposing ? (
        <>
          <div className="crm-edit-kinds" role="group" aria-label="Type d’échange">
            {COMPOSER_KINDS.map(({ code, label, Icon }) => (
              <button key={code} type="button" className={kind === code ? 'is-active' : ''} aria-pressed={kind === code} onClick={() => setKind(code)}>
                <Icon size={14} aria-hidden /> {label}
              </button>
            ))}
          </div>
          <label className="crm-field">
            Avec quel établissement ?
            {fixedContext ? <span className="crm-field__static">{fixedContext.objectName}</span> : (
              <SearchSelect aria-label="Contexte" value={ctx} options={(contexts ?? []).map((object) => ({ code: object.objectId, label: object.objectName }))} onChange={setCtx} placeholder="— Rechercher un établissement —" searchPlaceholder="Rechercher un établissement…" />
            )}
          </label>
          {fixedContext && (actorOptions?.length ?? 0) > 0 && (
            <details className="crm-edit-details">
              <summary>Préciser l’interlocuteur</summary>
              <label className="crm-field">
                Interlocuteur (facultatif)
                <SearchSelect aria-label="Acteur" value={pickedActor} options={(actorOptions ?? []).map((actor) => ({ code: actor.actorId, label: actor.displayName }))} onChange={setPickedActor} allowClear clearLabel="— Aucun interlocuteur —" placeholder="— Aucun interlocuteur —" searchPlaceholder="Rechercher un interlocuteur…" />
              </label>
            </details>
          )}
          <section className="ed-modal__section crm-edit-section">
            <h3>Que s’est-il dit ?</h3>
            <textarea
              className="crm-edit-textarea"
              aria-label="Compte rendu"
              rows={5}
              placeholder={kind === 'note' ? 'Ce qu’il faut retenir…' : 'Ce qui a été demandé, ce qui a été répondu…'}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && canConsign) interactionMutation.mutate(); }}
            />
          </section>
          <details className="crm-edit-details">
            <summary>Détails facultatifs <span>{[topicCode, sentimentCode].filter(Boolean).length || ''}</span></summary>
            <div className="crm-edit-details__content">
              <label className="crm-field">
                Sujet
                <SearchSelect aria-label="Sujet normalisé" value={topicCode} options={topics.map((topic) => ({ code: topic.code, label: topic.name }))} onChange={setTopicCode} allowClear clearLabel="— Aucun sujet —" placeholder="— Sujet —" searchPlaceholder="Rechercher un sujet…" />
              </label>
              <div className="crm-edit-sentiments" role="group" aria-label="Ressenti de l’interlocuteur">
                <span>Ressenti de l’interlocuteur <small>· facultatif</small></span>
                <div>
                  {CRM_SENTIMENT_OPTIONS.map((sentiment) => (
                    <button key={sentiment.code} type="button" aria-pressed={sentimentCode === sentiment.code} className={sentimentCode === sentiment.code ? 'is-active' : ''} onClick={() => setSentimentCode(sentimentCode === sentiment.code ? '' : sentiment.code)}>
                      {sentiment.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </details>
          <section className="ed-modal__section crm-edit-section">
            <h3>Suite à donner</h3>
            <div className="ed-modal__segmented" role="group" aria-label="Suite à donner">
              <button type="button" aria-pressed={effectiveStatus === 'resolved'} onClick={() => { setStatusTouched(true); setStatusChoice('resolved'); }}>Déjà traitée</button>
              <button type="button" aria-pressed={effectiveStatus === 'new'} onClick={() => { setStatusTouched(true); setStatusChoice('new'); }}>À traiter</button>
            </div>
            <p className="crm-edit-note">{effectiveStatus === 'new' ? 'Restera dans les demandes actives jusqu’à ce qu’elle soit marquée traitée.' : 'Simple compte rendu : rien ne reste à faire.'}</p>
          </section>
          {interactionMutation.isError && <div className="inline-alert" role="alert">Échec de la consignation : {(interactionMutation.error as Error).message}</div>}
        </>
      ) : (
        <>
          <div className="crm-edit-success" role="status"><Check size={16} aria-hidden /> Interaction enregistrée.</div>
          {!addingRelance ? (
            <div className="crm-edit-next-step">
              <p>La demande est enregistrée. Vous pouvez ajouter une relance maintenant ou terminer.</p>
              <button type="button" className="btn primary" onClick={() => setAddingRelance(true)}><Plus size={14} aria-hidden /> Ajouter une relance</button>
            </div>
          ) : (
            <div className="crm-edit-followup">
              <label className="crm-field">
                Que faut-il faire ?
                <input aria-label="Titre de la tâche" placeholder="Titre de la tâche" value={effectiveTaskTitle} onChange={(event) => { setTaskTitleTouched(true); setTaskTitle(event.target.value); }} />
              </label>
              <div className="crm-edit-quick-dates" role="group" aria-label="Échéance rapide">
                {[
                  { label: 'Aujourd’hui', value: dateInputOffset(0) },
                  { label: 'Demain', value: dateInputOffset(1) },
                  { label: 'Dans 1 semaine', value: dateInputOffset(7) },
                  { label: 'Sans échéance', value: '' },
                ].map((option) => <button key={option.label} type="button" aria-pressed={taskDue === option.value} className={taskDue === option.value ? 'is-active' : ''} onClick={() => setTaskDue(option.value)}>{option.label}</button>)}
                <label className="crm-edit-date">Choisir une date…<input aria-label="Échéance" type="date" value={taskDue} onChange={(event) => setTaskDue(event.target.value)} /></label>
              </div>
              <label className="crm-field">
                Attribuer à
                <SearchMultiSelect aria-label="Attribuer à" values={selectedAssignees} options={assignees.map((assignee) => ({ code: assignee.userId, label: assignee.displayName }))} onChange={setPickedAssignees} placeholder="— Choisir une ou plusieurs personnes —" searchPlaceholder="Rechercher une personne…" emptyLabel={assigneesQuery.isLoading ? 'Chargement des personnes…' : assigneesQuery.isError ? 'Impossible de charger les personnes.' : 'Aucune personne assignable'} />
              </label>
              {taskTitleMissing && <p className="crm-field__hint">Renseignez un titre de tâche.</p>}
              {assigneesMissing && !assigneesQuery.isLoading && <p className="crm-field__hint">Choisissez au moins une personne.</p>}
              {taskMutation.isError && <div className="inline-alert" role="alert">Échec de la relance : {(taskMutation.error as Error).message}</div>}
            </div>
          )}
        </>
      )}
    </EditorModal>
  );
}
