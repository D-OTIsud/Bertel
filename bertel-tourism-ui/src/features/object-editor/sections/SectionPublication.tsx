import { Fs, Field, Input, Select } from '../primitives';
import type { SectionProps } from './section-types';

const STATUS_OPTIONS = [
  { v: 'draft', l: 'Brouillon' },
  { v: 'published', l: 'Publié' },
  { v: 'hidden', l: 'Masqué' },
  { v: 'archived', l: 'Archivé' },
];

const VISIBILITY_OPTIONS = [
  { v: 'active', l: 'Active' },
  { v: 'full', l: 'Complète' },
  { v: 'lapsed', l: 'En pause' },
  { v: 'suspended', l: 'Suspendue' },
];

export function SectionPublication({ editor, folded }: SectionProps) {
  const publication = editor.draft.publication;
  const generalInfo = editor.draft.generalInfo;

  return (
    <Fs num="21" title="Publication & cycle de vie" sub="Statut, visibilité commerciale, modération et supports print" folded={folded} pill={{ tone: publication.status === 'published' ? 'ok' : 'warn', label: publication.status || 'Brouillon' }}>
      <div className="grid-3" style={{ marginBottom: 12 }}>
        <Field label="Statut courant">
          <Select value={generalInfo.status || publication.status || 'draft'} options={STATUS_OPTIONS} onChange={(status) => editor.patchModule('generalInfo', { status })} />
        </Field>
        <Field label="Visibilité commerciale">
          <Select value={generalInfo.commercialVisibility} options={VISIBILITY_OPTIONS} onChange={(commercialVisibility) => editor.patchModule('generalInfo', { commercialVisibility })} />
        </Field>
        <Field label="Première publication">
          <Input value={publication.publishedAt || generalInfo.publishedAt || ''} readOnly onChange={() => undefined} />
        </Field>
      </div>

      <div className="grid-2">
        <div>
          <div className="chip-group__label" style={{ marginTop: 0 }}>Modération</div>
          <div className="kv"><span className="k">En attente</span><span className="v">{publication.moderation.pendingCount}</span></div>
          {publication.moderation.items.map((item) => (
            <div key={item.id} className="kv"><span className="k">{item.status}</span><span className="v">{item.summary}</span></div>
          ))}
        </div>
        <div>
          <div className="chip-group__label" style={{ marginTop: 0 }}>Supports imprimés</div>
          <div className="kv"><span className="k">Sélections</span><span className="v">{publication.printPublications.selectionCount}</span></div>
          {publication.printPublications.items.map((item) => (
            <div key={`${item.publicationId}-${item.workflowStatus}`} className="kv"><span className="k">{item.workflowStatus}</span><span className="v">{item.publicationName || item.publicationCode}</span></div>
          ))}
        </div>
      </div>
    </Fs>
  );
}
