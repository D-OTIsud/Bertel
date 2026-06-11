import { useState } from 'react';
import { Chip, ChipSet, Fs, Input, Select, StatCard, Textarea } from '../primitives';
import type { SectionProps } from './section-types';
import type { ObjectWorkspaceCrmInteractionItem } from '../../../services/object-workspace-parser';
import { deleteCrmInteraction, listObjectCrm, saveCrmInteraction, saveCrmTask } from '../../../services/crm';

// Types d'interaction (enum DB crm_interaction_type, module CRM §58).
const INTERACTION_TYPE_OPTIONS = [
  { v: 'call', l: 'Appel' },
  { v: 'email', l: 'E-mail' },
  { v: 'meeting', l: 'Réunion' },
  { v: 'visit', l: 'Visite' },
  { v: 'whatsapp', l: 'WhatsApp' },
  { v: 'sms', l: 'SMS' },
  { v: 'note', l: 'Note' },
];

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  INTERACTION_TYPE_OPTIONS.map((option) => [option.v, option.l]),
);

// Vocabulaire sentiment (ref_code, domaine sentiment) — les 6 codes connus, labels FR.
const SENTIMENT_OPTIONS = [
  { v: '', l: '— Sentiment —' },
  { v: 'tres_positif', l: 'Très positif' },
  { v: 'positif', l: 'Positif' },
  { v: 'interrogatif', l: 'Interrogatif' },
  { v: 'inquiet', l: 'Inquiet' },
  { v: 'mecontent', l: 'Mécontent' },
  { v: 'tres_mecontent', l: 'Très mécontent' },
];

const YEAR_MS = 365 * 86_400_000;

function formatShortDate(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value || '—';
  }
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(timestamp));
}

function toErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return 'Échec de l’enregistrement CRM.';
}

interface InteractionFormState {
  /** null = création ; sinon id de l'interaction éditée. */
  editingId: string | null;
  interactionType: string;
  topicCode: string;
  sentimentCode: string;
  body: string;
}

const EMPTY_FORM: InteractionFormState = { editingId: null, interactionType: 'note', topicCode: '', sentimentCode: '', body: '' };

/**
 * §19 Suivi prestataire (CRM) — journal et distribution de sujets RÉELS
 * (module providerFollowUp enrichi par api.list_object_crm), authoring gated par la
 * permission PAR OBJET `permissions.crm` (api.user_can_write_crm). Les écritures passent
 * par les services CRM (RPC DEFINER) puis rechargent le module via listObjectCrm —
 * jamais d'appel supabase direct dans la section. Les notes internes restent gérées
 * dans le panneau latéral (décision §43) : simple rappel en lecture seule ici.
 */
export function SectionCrm({ editor, permissions, objectId, folded }: SectionProps) {
  const followUp = editor.draft.providerFollowUp;
  const interactions = followUp.interactions;
  const topics = followUp.topics;
  const access = permissions.crm;
  const readOnly = Boolean(followUp.interactionsUnavailableReason) || !access?.canDirectWrite;
  const readOnlyReason = access?.canDirectWrite
    ? followUp.interactionsUnavailableReason
    : access?.disabledReason ?? followUp.interactionsUnavailableReason;

  const [form, setForm] = useState<InteractionFormState | null>(null);
  const [taskForm, setTaskForm] = useState<{ title: string; dueAt: string } | null>(null);
  const [taskConfirmation, setTaskConfirmation] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const now = Date.now();
  const occurredTimestamps = interactions
    .map((item) => (item.occurredAt ? Date.parse(item.occurredAt) : Number.NaN))
    .filter((timestamp) => Number.isFinite(timestamp));
  const last12Months = occurredTimestamps.filter((timestamp) => now - timestamp <= YEAR_MS).length;
  const lastContact = occurredTimestamps.length > 0 ? new Date(Math.max(...occurredTimestamps)).toISOString() : null;

  // Recharge interactions + topics après chaque écriture — même source de parsing que
  // l'enrichissement workspace (services/crm.listObjectCrm). provider-follow-up est un
  // module READONLY pour la save bar : replaceModule ne crée pas de dirty fantôme.
  async function refreshCrm() {
    if (!objectId) return;
    const fresh = await listObjectCrm(objectId);
    editor.replaceModule('providerFollowUp', {
      ...followUp,
      interactions: fresh.interactions,
      topics: fresh.topics,
      interactionsUnavailableReason: null,
      tasksUnavailableReason: null,
    });
  }

  async function submitInteraction() {
    if (!objectId || !form) return;
    setBusy(true);
    setActionError(null);
    try {
      await saveCrmInteraction({
        ...(form.editingId ? { id: form.editingId } : {}),
        objectId,
        interactionType: form.interactionType,
        body: form.body.trim() ? form.body.trim() : null,
        ...(form.topicCode ? { topicCode: form.topicCode } : {}),
        ...(form.sentimentCode ? { sentimentCode: form.sentimentCode } : {}),
      });
      await refreshCrm();
      setForm(null);
    } catch (error) {
      setActionError(toErrorMessage(error)); // erreur visible, formulaire conservé
    } finally {
      setBusy(false);
    }
  }

  async function removeInteraction(id: string) {
    setBusy(true);
    setActionError(null);
    try {
      await deleteCrmInteraction(id);
      await refreshCrm();
    } catch (error) {
      setActionError(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function submitTask() {
    if (!objectId || !taskForm || !taskForm.title.trim()) return;
    setBusy(true);
    setActionError(null);
    setTaskConfirmation(null);
    try {
      await saveCrmTask({ objectId, title: taskForm.title.trim(), dueAt: taskForm.dueAt || null });
      setTaskForm(null);
      // Les tâches de l'objet vivent sur la page /crm (kanban) — pas de liste ici.
      setTaskConfirmation('Tâche créée — visible sur la page CRM.');
    } catch (error) {
      setActionError(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function startEdit(item: ObjectWorkspaceCrmInteractionItem) {
    setActionError(null);
    setForm({
      editingId: item.id,
      interactionType: item.interactionType,
      topicCode: item.topicCode ?? '',
      sentimentCode: item.sentimentCode ?? '',
      body: item.body ?? '',
    });
  }

  const pillLabel = followUp.interactionsUnavailableReason
    ? 'Non chargé'
    : `${interactions.length} interaction(s)`;

  return (
    <Fs
      num="19"
      title="Suivi prestataire (CRM)"
      sub="Interactions, demandes, sujets normalisés (demand_topic) · pilotage OTI"
      folded={folded}
      pill={{ tone: interactions.length > 0 ? 'ok' : 'warn', label: pillLabel }}
    >
      {readOnly && (
        <p
          style={{
            fontSize: 12,
            color: 'var(--ink-4)',
            margin: '0 0 12px',
            padding: '8px 12px',
            borderRadius: 'var(--r-md)',
            background: 'var(--bg-tint)',
            border: '1px solid var(--line-soft)',
          }}
        >
          <strong style={{ color: 'var(--ink-3)' }}>Lecture seule.</strong> {readOnlyReason}
        </p>
      )}

      <div className="grid-4" style={{ marginBottom: 14 }}>
        <StatCard label="Interactions / 12 mois" value={String(last12Months)} />
        <StatCard label="Dernier contact" value={lastContact ? formatShortDate(lastContact) : '—'} />
        <StatCard label="Interactions totales" value={String(interactions.length)} />
        <StatCard label="Sujets distincts" value={String(topics.length)} />
      </div>

      <div className="chip-group__label" style={{ marginTop: 0 }}>Sujets normalisés (demand_topic) — distribution réelle</div>
      {topics.length > 0 ? (
        <ChipSet>
          {topics.map((topic) => (
            <Chip key={topic.code} label={`${topic.name} — ${topic.count}`} on />
          ))}
        </ChipSet>
      ) : (
        <p style={{ fontSize: 12, color: 'var(--ink-4)' }}>Aucun sujet relevé pour cette fiche.</p>
      )}

      <div className="chip-group__label" style={{ marginTop: 14 }}>Journal d&apos;interactions</div>
      {interactions.length > 0 ? (
        <div className="repeater">
          {interactions.map((item) => (
            <div
              key={item.id}
              className="rep-row"
              style={{ gridTemplateColumns: '14px 80px 86px 1.2fr 100px 110px 1.6fr auto', alignItems: 'center' }}
            >
              <span className="rep-row__handle" aria-hidden />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)' }}>
                {item.occurredAt ? formatShortDate(item.occurredAt) : '—'}
              </span>
              <span className="pill-mini">{TYPE_LABEL[item.interactionType] ?? item.interactionType}</span>
              <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{item.subject || item.topicName || '—'}</span>
              <span className="pill-mini">{item.sentimentName ?? '—'}</span>
              <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                {[item.actorName, item.ownerName].filter(Boolean).join(' · ') || '—'}
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{(item.body ?? '').slice(0, 96)}</span>
              <div className="rep-row__act">
                <button
                  type="button"
                  className="icbtn"
                  disabled={readOnly || busy}
                  title={readOnly ? readOnlyReason ?? 'Lecture seule' : 'Modifier'}
                  aria-label={`Modifier l'interaction ${item.subject || item.id}`}
                  onClick={() => startEdit(item)}
                >
                  ✎
                </button>
                <button
                  type="button"
                  className="del"
                  disabled={readOnly || busy}
                  title={readOnly ? readOnlyReason ?? 'Lecture seule' : 'Supprimer'}
                  aria-label={`Supprimer l'interaction ${item.subject || item.id}`}
                  onClick={() => void removeInteraction(item.id)}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: 12, color: 'var(--ink-4)' }}>Aucune interaction enregistrée.</p>
      )}

      {actionError && (
        <p role="alert" style={{ fontSize: 12, color: 'var(--danger, #b3261e)', margin: '8px 0 0' }}>
          {actionError}
        </p>
      )}

      {form && !readOnly && (
        <div
          style={{
            border: '1px solid var(--line-soft)',
            borderRadius: 'var(--r-md)',
            padding: 12,
            marginTop: 8,
            display: 'grid',
            gap: 8,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <Select
              aria-label="Type d'interaction"
              value={form.interactionType}
              options={INTERACTION_TYPE_OPTIONS}
              onChange={(interactionType) => setForm({ ...form, interactionType })}
            />
            <Select
              aria-label="Sujet normalisé"
              value={form.topicCode}
              options={[{ v: '', l: '— Sujet —' }, ...topics.map((topic) => ({ v: topic.code, l: topic.name }))]}
              onChange={(topicCode) => setForm({ ...form, topicCode })}
            />
            <Select
              aria-label="Sentiment"
              value={form.sentimentCode}
              options={SENTIMENT_OPTIONS}
              onChange={(sentimentCode) => setForm({ ...form, sentimentCode })}
            />
          </div>
          <Textarea
            aria-label="Compte rendu"
            value={form.body}
            onChange={(body) => setForm({ ...form, body })}
            placeholder="Compte rendu de l'interaction…"
            rows={3}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="rep-add" style={{ marginTop: 0 }} disabled={busy} onClick={() => void submitInteraction()}>
              {form.editingId ? 'Enregistrer la modification' : 'Enregistrer l’interaction'}
            </button>
            <button type="button" className="icbtn" disabled={busy} onClick={() => setForm(null)}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {taskForm && !readOnly && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 160px auto auto', gap: 8, marginTop: 8, alignItems: 'center' }}>
          <Input
            aria-label="Titre de la tâche"
            value={taskForm.title}
            placeholder="Titre de la tâche"
            onChange={(title) => setTaskForm({ ...taskForm, title })}
          />
          <Input aria-label="Échéance" type="date" value={taskForm.dueAt} onChange={(dueAt) => setTaskForm({ ...taskForm, dueAt })} />
          <button
            type="button"
            className="rep-add"
            style={{ marginTop: 0 }}
            disabled={busy || !taskForm.title.trim()}
            onClick={() => void submitTask()}
          >
            Créer
          </button>
          <button type="button" className="icbtn" disabled={busy} onClick={() => setTaskForm(null)}>
            Annuler
          </button>
        </div>
      )}
      {taskConfirmation && <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: '8px 0 0' }}>{taskConfirmation}</p>}

      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="rep-add"
          style={{ marginTop: 0 }}
          disabled={readOnly || busy}
          title={readOnly ? readOnlyReason ?? 'Lecture seule' : undefined}
          onClick={() => {
            setTaskConfirmation(null);
            setForm({ ...EMPTY_FORM });
          }}
        >
          + Nouvelle interaction
        </button>
        <button
          type="button"
          className="rep-add"
          style={{ marginTop: 0 }}
          disabled={readOnly || busy}
          title={readOnly ? readOnlyReason ?? 'Lecture seule' : undefined}
          onClick={() => {
            setTaskConfirmation(null);
            setTaskForm({ title: '', dueAt: '' });
          }}
        >
          + Créer une tâche
        </button>
      </div>

      {followUp.notes.length > 0 && (
        <>
          <div className="chip-group__label" style={{ marginTop: 14 }}>
            Notes internes — gérées dans le panneau latéral (§43)
          </div>
          {followUp.notes.slice(0, 3).map((note) => (
            <p key={note.id} style={{ fontSize: 12, color: 'var(--ink-3)', margin: '2px 0' }}>
              {formatShortDate(note.updatedAt || note.createdAt)} · {note.createdByName} — {note.body}
            </p>
          ))}
        </>
      )}
    </Fs>
  );
}
