import { Fs } from '../primitives';
import type { SectionProps } from './section-types';

function formatDate(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value || 'Date inconnue';
  }
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp));
}

export function SectionCrm({ editor, folded }: SectionProps) {
  const followUp = editor.draft.providerFollowUp;

  return (
    <Fs num="19" title="Suivi prestataire" sub="Journal CRM et notes internes" folded={folded} pill={{ tone: 'warn', label: 'Lecture seule' }}>
      {followUp.notes.length > 0 ? followUp.notes.map((note) => (
        <article key={note.id} className="kv">
          <span className="k">{note.category} · {formatDate(note.updatedAt || note.createdAt)}</span>
          <span className="v">{note.body}</span>
        </article>
      )) : (
        <p style={{ fontSize: 12, color: 'var(--ink-4)' }}>{followUp.interactionsUnavailableReason ?? 'Aucun suivi CRM exposé.'}</p>
      )}
    </Fs>
  );
}
