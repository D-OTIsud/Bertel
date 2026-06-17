import { useState } from 'react';
import { Chip, ChipSet, Fs, StatCard } from '../primitives';
import type { SectionProps } from './section-types';
import type { ObjectWorkspaceActorLinkItem } from '../../../services/object-workspace-parser';
import { listObjectCrm } from '../../../services/crm';
import { EditorCrmDrawer } from '../widgets/EditorCrmDrawer';
import { ProviderCards } from './ProviderCards';

const YEAR_MS = 365 * 86_400_000;

function formatShortDate(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value || '—';
  }
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(timestamp));
}

/**
 * §19 Suivi prestataire (CRM) — carte de SYNTHÈSE en mode édité : 4 KPIs (depuis
 * editor.draft.providerFollowUp), distribution des sujets normalisés (demand_topic) et rappel
 * des notes internes (lecture seule, §43). L'authoring (interactions / tâches / fiche acteur)
 * vit dans un TIROIR latéral (EditorCrmDrawer) qui monte la VRAIE section CRM
 * (CrmObjectView ⇄ CrmActorFiche), gaté par la permission PAR OBJET `permissions.crm`
 * (api.user_can_write_crm — JAMAIS le helper page-wide userCanWriteCrmNotes : write-trap).
 * À la fermeture du tiroir, refreshCrm() resynchronise les KPIs ; providerFollowUp est un module
 * READONLY pour la save bar ⇒ replaceModule ne crée pas de dirty fantôme.
 */
export function SectionCrm({ editor, permissions, objectId, folded }: SectionProps) {
  const followUp = editor.draft.providerFollowUp;
  const interactions = followUp.interactions;
  const topics = followUp.topics;
  const access = permissions.crm;
  const canWrite = Boolean(access?.canDirectWrite);
  const relationships = editor.draft.relationships;
  const canWriteActors = Boolean(permissions.relationships?.canDirectWrite);
  // Drawer can open object-wide (actorId null) or directly on a prestataire's fiche (deep-link).
  const [drawer, setDrawer] = useState<{ open: boolean; actorId: string | null }>({ open: false, actorId: null });

  function replaceActors(actors: ObjectWorkspaceActorLinkItem[]) {
    editor.replaceModule('relationships', { ...relationships, actors });
  }

  function openActorFiche(actorId: string) {
    if (!objectId) return;
    setDrawer({ open: true, actorId });
  }

  const now = Date.now();
  const occurredTimestamps = interactions
    .map((item) => (item.occurredAt ? Date.parse(item.occurredAt) : Number.NaN))
    .filter((timestamp) => Number.isFinite(timestamp));
  const last12Months = occurredTimestamps.filter((timestamp) => now - timestamp <= YEAR_MS).length;
  const lastContact = occurredTimestamps.length > 0 ? new Date(Math.max(...occurredTimestamps)).toISOString() : null;

  // Resync des KPIs après une session d'écriture dans le tiroir. providerFollowUp est READONLY
  // pour la save bar ⇒ replaceModule ne crée pas de dirty fantôme.
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

  const prestataireCount = relationships.actors.length;
  const pillLabel = `${prestataireCount} prestataire(s)`;

  return (
    <Fs
      num="19"
      title="Suivi prestataire (CRM)"
      sub="Prestataires rattachés à la fiche et suivi relationnel (interactions, sujets normalisés) · pilotage OTI"
      folded={folded}
      pill={{ tone: prestataireCount > 0 ? 'ok' : 'warn', label: pillLabel }}
    >
      {!canWrite && (
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
          <strong style={{ color: 'var(--ink-3)' }}>Lecture seule.</strong>{' '}
          {access?.disabledReason ?? followUp.interactionsUnavailableReason}
        </p>
      )}

      <ProviderCards
        relationships={relationships}
        canWrite={canWriteActors}
        onChange={replaceActors}
        onOpenActor={objectId ? openActorFiche : undefined}
      />

      <div className="chip-group__label" style={{ marginTop: 16 }}>Suivi relationnel (CRM)</div>
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

      <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="rep-add"
          style={{ marginTop: 0 }}
          disabled={!objectId}
          title={!objectId ? 'Enregistrez la fiche pour accéder au suivi CRM.' : undefined}
          onClick={() => setDrawer({ open: true, actorId: null })}
        >
          Ouvrir le suivi CRM{interactions.length > 0 ? ` · ${interactions.length}` : ''}
        </button>
      </div>

      {followUp.interactionsUnavailableReason && (
        <p style={{ fontSize: 12, color: 'var(--ink-4)', marginTop: 8 }}>
          {followUp.interactionsUnavailableReason}
        </p>
      )}

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

      {objectId && (
        <EditorCrmDrawer
          objectId={objectId}
          canWrite={canWrite}
          open={drawer.open}
          initialActorId={drawer.actorId}
          onClose={() => {
            setDrawer({ open: false, actorId: null });
            void refreshCrm();
          }}
        />
      )}
    </Fs>
  );
}
