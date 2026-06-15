import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Fs } from '../primitives';
import { ModuleUnavailableNotice } from './blocks/block-notes';
import { ClassificationEditModal } from '../widgets/ClassificationEditModal';
import {
  CLASSIFICATION_STATUS_OPTIONS,
  createClassificationDraft,
  regroupDistinctionItems,
} from './classification-edit';
import type { SectionProps } from './section-types';
import type { ObjectWorkspaceDistinctionItem } from '../../../services/object-workspace-parser';

const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  CLASSIFICATION_STATUS_OPTIONS.map((option) => [option.v, option.l]),
);

// Display columns (no drag handle — order is not meaningful here).
const CLASS_COLS = '1.4fr 1.2fr 130px 95px 95px auto';

type StatusBucket = 'granted' | 'pending' | 'expired';

function statusBucket(item: ObjectWorkspaceDistinctionItem): StatusBucket {
  const status = item.status || 'granted';
  if (status === 'requested' || status === 'pending') return 'pending';
  if (status === 'expired' || status === 'suspended' || status === 'revoked') return 'expired';
  return 'granted';
}

const BUCKET_TONE: Record<StatusBucket, string> = { granted: 'ok', pending: 'warn', expired: 'red' };

function repHeader(columns: string, labels: string[]) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: columns,
        gap: 8,
        padding: '6px 12px',
        fontSize: 10,
        fontWeight: 700,
        color: 'var(--ink-4)',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}
    >
      {labels.map((label, index) => (
        <span key={label || `col-${index}`}>{label}</span>
      ))}
    </div>
  );
}

export function SectionClassification({ editor, folded }: SectionProps) {
  const distinctions = editor.draft.distinctions;
  // §08 surfaces EVERY distinction family — classements, quality, sustainability AND
  // accessibility (Tourisme & Handicap). Accessibility schemes are offered with their value
  // forced to 'granted'; the granted_* sub-values are the per-disability coverage, which stays
  // edited in §10 (the §08 modal never touches disabilityTypesCovered → coverage is preserved).
  const accessibilityCodes = new Set(
    distinctions.schemeOptions.filter((scheme) => scheme.isAccessibility).map((scheme) => scheme.code),
  );
  const isAccessibilityRow = (item: ObjectWorkspaceDistinctionItem) => accessibilityCodes.has(item.schemeCode);

  const schemes = distinctions.schemeOptions.map((scheme) =>
    scheme.isAccessibility
      ? { ...scheme, valueOptions: scheme.valueOptions.filter((value) => value.code === 'granted') }
      : scheme,
  );

  // Combined view across both module arms (distinctionGroups + the accessibilityLabels arm
  // that §10 also edits). commit() splits it back so a T&H row lands in accessibilityLabels
  // (one arm only — no double-write in the saver).
  const rows = [
    ...distinctions.distinctionGroups.flatMap((group) => group.items),
    ...distinctions.accessibilityLabels,
  ];

  const granted = rows.filter((item) => statusBucket(item) === 'granted').length;
  const pending = rows.filter((item) => statusBucket(item) === 'pending').length;
  const expired = rows.filter((item) => statusBucket(item) === 'expired').length;
  const nextExpiry = rows
    .map((item) => item.validUntil)
    .filter(Boolean)
    .sort()[0];

  const gated = Boolean(distinctions.unavailableReason);
  const [adding, setAdding] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // Edit/delete operate on the combined flat list; split it back into the two module arms:
  // accessibility rows → accessibilityLabels (shared with §10, coverage preserved), everything
  // else → distinctionGroups. One arm per row ⇒ the saver never double-processes T&H.
  function commit(nextRows: ObjectWorkspaceDistinctionItem[]) {
    editor.replaceModule('distinctions', {
      ...distinctions,
      distinctionGroups: regroupDistinctionItems(nextRows.filter((item) => !isAccessibilityRow(item))),
      accessibilityLabels: nextRows.filter(isAccessibilityRow),
    });
  }

  return (
    <Fs
      num="08"
      title="Classifications & distinctions"
      sub="Étoiles, labels, marques, statuts et dates de validité."
      folded={folded}
      pill={
        gated
          ? { tone: 'warn', label: 'Indisponible' }
          : {
              tone: granted > 0 ? 'ok' : 'warn',
              label: pending > 0 ? `${granted} accordée(s) · ${pending} en cours` : `${granted} accordée(s)`,
            }
      }
    >
      <div className="grid-4" style={{ marginBottom: 14 }}>
        <div className="class-kpi class-kpi--ok">
          <div className="class-kpi__num">{granted}</div>
          <div className="class-kpi__lbl">Accordées</div>
        </div>
        <div className="class-kpi class-kpi--warn">
          <div className="class-kpi__num">{pending}</div>
          <div className="class-kpi__lbl">En cours / demande</div>
        </div>
        <div className="class-kpi class-kpi--red">
          <div className="class-kpi__num">{expired}</div>
          <div className="class-kpi__lbl">Expirées · à renouveler</div>
        </div>
        <div className="class-kpi">
          <div className="class-kpi__num" style={{ fontSize: 14, fontFamily: 'var(--font-mono)' }}>
            {nextExpiry || '—'}
          </div>
          <div className="class-kpi__lbl">Prochaine échéance</div>
        </div>
      </div>

      {gated ? (
        <ModuleUnavailableNotice reason={distinctions.unavailableReason ?? ''} />
      ) : (
        <>
          {rows.length === 0 ? (
            <p className="muted" style={{ margin: '4px 0 12px' }}>
              Aucune classification ou label renseigné. Ajoutez une étoile, un classement officiel ou un label de
              qualité.
            </p>
          ) : (
            <>
              {repHeader(CLASS_COLS, ['Référentiel', 'Valeur attribuée', 'Statut', 'Acquis le', "Valable jusqu'au", ''])}
              <div className="repeater">
                {rows.map((item, index) => {
                  const bucket = statusBucket(item);
                  return (
                    <div
                      key={`${item.schemeCode}-${item.valueCode}-${index}`}
                      className="rep-row class-row"
                      style={{ gridTemplateColumns: CLASS_COLS, alignItems: 'center' }}
                    >
                      <div className="class-row__sch">
                        <div className="class-row__scheme">{item.schemeLabel}</div>
                      </div>
                      <div>{item.valueLabel || '—'}</div>
                      <div>
                        <span className={`class-status class-status--${BUCKET_TONE[bucket]}`}>
                          {STATUS_LABELS[item.status] ?? item.status ?? 'Accordée'}
                        </span>
                      </div>
                      <div className="mono">{item.awardedAt || '—'}</div>
                      <div className="mono">{item.validUntil || '—'}</div>
                      <div className="rep-row__act">
                        <button
                          type="button"
                          aria-label={`Modifier ${item.schemeLabel}`}
                          onClick={() => setEditingIndex(index)}
                          style={{ fontSize: 12, padding: '2px 6px', cursor: 'pointer' }}
                        >
                          <Pencil size={14} aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="del"
                          aria-label={`Supprimer ${item.schemeLabel}`}
                          onClick={() => commit(rows.filter((_, rowIndex) => rowIndex !== index))}
                        >
                          <Trash2 size={14} aria-hidden />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <button type="button" className="rep-add" onClick={() => setAdding(true)}>
            + Ajouter une classification
          </button>

          {adding && (
            <ClassificationEditModal
              open
              mode="add"
              schemes={schemes}
              existingItems={rows}
              draft={createClassificationDraft()}
              objectId={editor.objectId}
              onClose={() => setAdding(false)}
              onSave={(item) => {
                commit([...rows, item]);
                setAdding(false);
              }}
            />
          )}

          {editingIndex !== null && rows[editingIndex] && (
            <ClassificationEditModal
              open
              mode="edit"
              schemes={schemes}
              existingItems={rows}
              draft={rows[editingIndex]}
              objectId={editor.objectId}
              onClose={() => setEditingIndex(null)}
              onSave={(item) => {
                commit(rows.map((row, rowIndex) => (rowIndex === editingIndex ? item : row)));
                setEditingIndex(null);
              }}
            />
          )}
        </>
      )}
    </Fs>
  );
}
