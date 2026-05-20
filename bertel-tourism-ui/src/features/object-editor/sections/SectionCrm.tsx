import { Chip, ChipSet, Fs, Input, Select, StatCard } from '../primitives';
import type { SectionProps } from './section-types';
import type { ObjectWorkspaceFollowUpNote } from '../../../services/object-workspace-parser';

const CRM_TOPICS = [
  'Mise à jour fiche',
  'Renouvellement adhésion',
  'Demande visuelle',
  'Demande de visite',
  'Réclamation client',
  'Litige',
  'Formation',
  'Information générale',
  'Refus de diffusion',
];

const CATEGORY_LABEL: Record<ObjectWorkspaceFollowUpNote['category'], string> = {
  general: 'Note générale',
  important: 'Important',
  urgent: 'Urgent',
  internal: 'Interne',
  followup: 'Suivi',
};

function formatShortDate(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value || '—';
  }
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(timestamp));
}

function formatRelativeOrShort(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value || '—';
  }
  const diffDays = Math.floor((Date.now() - timestamp) / 86_400_000);
  if (diffDays < 1) return "Aujourd'hui";
  if (diffDays < 30) return `il y a ${diffDays} j`;
  return formatShortDate(value);
}

export function SectionCrm({ editor, folded }: SectionProps) {
  const followUp = editor.draft.providerFollowUp;
  const notes = followUp.notes;
  const readOnly = Boolean(followUp.interactionsUnavailableReason);
  const lastNote = notes[0];
  const activeTopics = new Set(
    notes.map((n) => n.category).filter((c) => c === 'followup' || c === 'urgent' || c === 'important'),
  );

  const pillLabel = notes.length > 0 ? `${notes.length} interaction(s)` : 'Lecture seule';

  return (
    <Fs
      num="19"
      title="Suivi prestataire (CRM)"
      sub="Interactions, demandes, sujets normalisés (crm_demand_topic_oti) · pilotage OTI"
      folded={folded}
      pill={{ tone: notes.length > 0 ? 'ok' : 'warn', label: pillLabel }}
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
          <strong style={{ color: 'var(--ink-3)' }}>Lecture seule.</strong> {followUp.interactionsUnavailableReason}
        </p>
      )}

      <div className="grid-4" style={{ marginBottom: 14 }}>
        <StatCard label="Interactions / 12 mois" value={String(notes.length)} />
        <StatCard label="Dernier contact" value={lastNote ? formatShortDate(lastNote.updatedAt || lastNote.createdAt) : '—'} />
        <StatCard label="Notes actives" value={String(notes.filter((n) => !n.isArchived).length)} />
        <StatCard
          label="Sujets ouverts"
          value={String(notes.filter((n) => n.category === 'urgent' || n.category === 'followup').length)}
          suffix="à traiter"
        />
      </div>

      <div className="chip-group__label" style={{ marginTop: 0 }}>Demandes / sujets normalisés (crm_demand_topic_oti)</div>
      <ChipSet>
        {CRM_TOPICS.map((topic, index) => (
          <Chip
            key={topic}
            label={topic}
            on={index < 3 || activeTopics.has('followup')}
          />
        ))}
      </ChipSet>

      <div className="chip-group__label" style={{ marginTop: 14 }}>Journal d'interactions</div>
      {notes.length > 0 ? (
        <div className="repeater">
          {notes.map((note) => (
            <div
              key={note.id}
              className="rep-row"
              style={{ gridTemplateColumns: '14px 80px 110px 1.5fr 80px 60px 1.6fr auto', alignItems: 'center' }}
            >
              <span className="rep-row__handle" aria-hidden />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)' }}>
                {formatShortDate(note.updatedAt || note.createdAt)}
              </span>
              <span className="pill-mini">{CATEGORY_LABEL[note.category]}</span>
              <Input value={note.body.slice(0, 48) || CATEGORY_LABEL[note.category]} readOnly onChange={() => undefined} />
              <Select
                value={note.category === 'urgent' ? 'tendu' : note.category === 'important' ? 'positif' : 'neutre'}
                options={[
                  { v: 'positif', l: 'positif' },
                  { v: 'neutre', l: 'neutre' },
                  { v: 'tendu', l: 'tendu' },
                ]}
                onChange={() => undefined}
              />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)' }}>—</span>
              <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                {note.createdByName ? `${note.createdByName} · ` : ''}
                {note.body}
                <span style={{ color: 'var(--ink-4)' }}> · {formatRelativeOrShort(note.updatedAt || note.createdAt)}</span>
              </span>
              <div className="rep-row__act">
                <button type="button" className="icbtn" disabled title="Lecture seule" aria-label="Modifier">
                  ✎
                </button>
                <button type="button" className="del" disabled title="Lecture seule" aria-label="Supprimer">
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: 12, color: 'var(--ink-4)' }}>
          {followUp.interactionsUnavailableReason ?? 'Aucun suivi CRM exposé.'}
        </p>
      )}

      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        <button type="button" className="rep-add" style={{ marginTop: 0 }} disabled={readOnly}>
          + Nouvelle interaction
        </button>
        <button type="button" className="rep-add" style={{ marginTop: 0 }} disabled={readOnly}>
          ✉ Programmer un appel
        </button>
        <button type="button" className="rep-add" style={{ marginTop: 0 }} disabled={readOnly}>
          + Créer un ticket
        </button>
      </div>
    </Fs>
  );
}
