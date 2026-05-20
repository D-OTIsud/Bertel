import { Chip, ChipSet, Field, Fs, Input, Select, Textarea, Toggle } from '../primitives';
import type { SectionProps } from './section-types';

const NOOP = () => undefined;

const STATUS_OPTIONS = [
  { v: 'published', l: '🟢 Publié — en ligne' },
  { v: 'draft', l: '🟡 Brouillon' },
  { v: 'hidden', l: '🔴 Hors ligne' },
  { v: 'archived', l: '⚫ Archivé' },
];

const VISIBILITY_OPTIONS = [
  { v: 'active', l: 'Complète' },
  { v: 'full', l: 'Complète' },
  { v: 'private', l: 'Privée' },
  { v: 'lapsed', l: 'En pause' },
  { v: 'suspended', l: 'Masquée' },
  { v: 'hidden', l: 'Masquée' },
];

const STATUS_PILL: Record<string, { tone: 'ok' | 'warn'; label: string }> = {
  published: { tone: 'ok', label: 'Publié' },
  draft: { tone: 'warn', label: 'Brouillon' },
  hidden: { tone: 'warn', label: 'Hors ligne' },
  archived: { tone: 'warn', label: 'Archivé' },
};

function statusLabel(status: string) {
  return STATUS_OPTIONS.find((o) => o.v === status)?.l ?? status;
}

export function SectionPublication({ editor, folded }: SectionProps) {
  const publication = editor.draft.publication;
  const generalInfo = editor.draft.generalInfo;
  const provider = editor.draft.provider;
  const memberships = editor.draft.memberships;
  const status = generalInfo.status || publication.status || 'draft';
  const adhesionScope = memberships.scopeOptions[0]?.label ?? memberships.items[0]?.orgLabel ?? '—';
  const pill = STATUS_PILL[status] ?? { tone: 'warn' as const, label: status };

  return (
    <Fs
      num="21"
      title="Publication & cycle de vie"
      sub="Statut, motif hors ligne, dates clés, aire d'adhésion"
      folded={folded}
      pill={pill}
    >
      <div className="grid-3" style={{ marginBottom: 12 }}>
        <Field label="Statut courant">
          <Select
            value={status}
            options={STATUS_OPTIONS}
            onChange={(next) => editor.patchModule('generalInfo', { status: next })}
          />
        </Field>
        <Field label="Aire d'adhésion">
          <Select
            value={adhesionScope}
            options={[adhesionScope, 'AD2R', 'OTI Sud', 'Autre', 'Aucune'].filter((v, i, a) => a.indexOf(v) === i)}
            onChange={NOOP}
          />
        </Field>
        <Field label="Visibilité commerciale">
          <Select
            value={generalInfo.commercialVisibility}
            options={VISIBILITY_OPTIONS}
            onChange={(commercialVisibility) => editor.patchModule('generalInfo', { commercialVisibility })}
          />
        </Field>
      </div>

      <div className="grid-3" style={{ marginBottom: 12 }}>
        <Field label="Date de création">
          <Input value={provider.incorporationDate} mono readOnly onChange={() => undefined} />
        </Field>
        <Field label="Date de fermeture (si applicable)">
          <Input value="" mono placeholder="—" readOnly onChange={() => undefined} />
        </Field>
        <Field label="Première publication">
          <Input value={publication.publishedAt || generalInfo.publishedAt || ''} mono readOnly onChange={() => undefined} />
        </Field>
      </div>

      <Field label="Motif hors ligne" hint="Renseigner si statut = Hors ligne · explication visible aux agents">
        <Textarea
          value=""
          placeholder="Ex : fermeture saisonnière, sinistre, travaux…"
          rows={2}
          onChange={NOOP}
        />
      </Field>

      {publication.moderation.items.length > 0 || publication.printPublications.items.length > 0 ? (
        <div className="grid-2" style={{ marginTop: 14 }}>
          {publication.moderation.items.length > 0 && (
            <div>
              <div className="chip-group__label" style={{ marginTop: 0 }}>Modération</div>
              <div className="kv">
                <span className="k">En attente</span>
                <span className="v">{publication.moderation.pendingCount}</span>
              </div>
              {publication.moderation.items.map((item) => (
                <div key={item.id} className="kv">
                  <span className="k">{item.status}</span>
                  <span className="v">{item.summary}</span>
                </div>
              ))}
            </div>
          )}
          {publication.printPublications.items.length > 0 && (
            <div>
              <div className="chip-group__label" style={{ marginTop: 0 }}>Supports imprimés</div>
              <div className="kv">
                <span className="k">Sélections</span>
                <span className="v">{publication.printPublications.selectionCount}</span>
              </div>
              {publication.printPublications.items.map((item) => (
                <div key={`${item.publicationId}-${item.workflowStatus}`} className="kv">
                  <span className="k">{item.workflowStatus}</span>
                  <span className="v">{item.publicationName || item.publicationCode}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div className="chip-group__label" style={{ marginTop: 14 }}>Workflow</div>
      <div className="grid-3">
        <Toggle
          label="Demande de validation"
          sub="Soumettre à modération"
          on={publication.moderation.pendingCount > 0}
          onChange={NOOP}
        />
        <Toggle label="Publication différée" sub="Programmer une mise en ligne" on={false} onChange={NOOP} />
        <Toggle
          label="Notifier les partenaires"
          sub="À l'enregistrement"
          on={generalInfo.isEditing}
          onChange={NOOP}
        />
      </div>

      <div className="chip-group__label" style={{ marginTop: 14 }}>Résumé publication</div>
      <ChipSet>
        <Chip label={statusLabel(status)} on />
        {publication.publishedAt && <Chip label={`Publié le ${publication.publishedAt}`} on />}
        {memberships.items.length > 0 && <Chip label={`${memberships.items.length} adhésion(s)`} on />}
      </ChipSet>
    </Fs>
  );
}
