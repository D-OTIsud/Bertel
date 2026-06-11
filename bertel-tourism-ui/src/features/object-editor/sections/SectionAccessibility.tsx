import { useState } from 'react';
import { ChipMultiSelect, Field, Fs, LangTabs, Select, StatCard, Textarea, Toggle } from '../primitives';
import type { SectionProps } from './section-types';
import type { ObjectWorkspaceDistinctionItem } from '../../../services/object-workspace-parser';
import { readTranslatableField, updateTranslatableField } from './descriptions-field';

/**
 * Canonical disability-type set for LBL_TOURISME_HANDICAP / `object_classification` sub-values.
 * Codes are the English metadata.disability_type values stored in the DB; labels are display-only.
 * Also used to drive the 4 collapsible equipment panels below.
 */
const DISABILITY_TYPES = [
  { code: 'motor', label: 'Moteur' },
  { code: 'hearing', label: 'Auditif' },
  { code: 'visual', label: 'Visuel' },
  { code: 'cognitive', label: 'Mental' },
];

const LANG_LABELS: Record<string, string> = { fr: 'FR', en: 'EN', cre: 'CRE' };

export function SectionAccessibility({ editor, permissions, folded }: SectionProps) {
  const distinctions = editor.draft.distinctions;
  const characteristics = editor.draft.characteristics;
  const descriptions = editor.draft.descriptions;
  const active = descriptions.activeLanguage;
  const objectScope = descriptions.object;
  // description_adapted is a CANONICAL object_description column: mirror §04's gate
  // (the saver skips the canonical leg without it). canDirectWrite fallback keeps
  // legacy permission shapes (and the allowAll test proxy) editable.
  const canEditAdapted =
    permissions.descriptions?.canEditCanonical
    ?? permissions.descriptions?.canDirectWrite
    ?? false;

  // Accessibility amenity family — identified by its familyCode (set in seeds / ref_amenity_family).
  // Each option carries a `disabilityTypes` array so we can group by panel.
  const accessibilityFamily = characteristics.amenityGroups.find((g) => g.familyCode === 'accessibility');
  const accessibilityOptions = accessibilityFamily?.options ?? [];

  // Counts for the summary pill
  const selectedAccessibilityCount = accessibilityOptions.filter((o) =>
    characteristics.selectedAmenityCodes.includes(o.code),
  ).length;

  // Track which disability-type panels are expanded (default: expand those with a selection)
  const [expandedPanels, setExpandedPanels] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      DISABILITY_TYPES.map(({ code }) => [
        code,
        accessibilityOptions.some(
          (o) => o.disabilityTypes.includes(code) && characteristics.selectedAmenityCodes.includes(o.code),
        ),
      ]),
    ),
  );

  function togglePanel(code: string) {
    setExpandedPanels((prev) => ({ ...prev, [code]: !prev[code] }));
  }

  function updateLabel(item: ObjectWorkspaceDistinctionItem, patch: Partial<ObjectWorkspaceDistinctionItem>) {
    editor.replaceModule('distinctions', {
      ...distinctions,
      accessibilityLabels: distinctions.accessibilityLabels.map((candidate) =>
        candidate === item ? { ...candidate, ...patch } : candidate,
      ),
    });
  }

  // ── Stat header values (mirroring §11 SectionSustainability KPI row) ─────────
  // "Label T&H": whether at least one accessibility label is held.
  const hasAccessibilityLabel = distinctions.accessibilityLabels.length > 0;
  // "Équipements accessibles": count of accessibility-family amenity codes currently selected.
  const accessibleEquipmentCount = accessibilityOptions.filter((o) =>
    characteristics.selectedAmenityCodes.includes(o.code),
  ).length;
  // "Couverture": union of disability types covered across all held accessibility labels.
  const coveredDisabilityTypes = Array.from(
    new Set(distinctions.accessibilityLabels.flatMap((item) => item.disabilityTypesCovered)),
  );
  const coverageLabel =
    coveredDisabilityTypes.length > 0
      ? coveredDisabilityTypes
          .map((code) => DISABILITY_TYPES.find((dt) => dt.code === code)?.label ?? code)
          .join(', ')
      : '—';

  const langTabs = descriptions.availableLanguages.map((code) => ({
    code,
    label: LANG_LABELS[code] ?? code.toUpperCase(),
    filled: Boolean(readTranslatableField(objectScope.adaptedDescription, code, descriptions.localLanguage).trim()),
  }));

  return (
    <Fs
      num="10"
      title="Accessibilité"
      sub="Équipements PMR (ref_amenity famille accessibility), label Tourisme & Handicap, texte adapté multilingue"
      folded={folded}
      pill={{
        tone: selectedAccessibilityCount > 0 ? 'ok' : 'warn',
        label:
          accessibilityOptions.length > 0
            ? `${selectedAccessibilityCount} / ${accessibilityOptions.length} équip.`
            : 'Équipements PMR',
      }}
    >
      {/* ── KPI stat row — mirrors §11 SectionSustainability pattern ─────────────── */}
      <div className="sust-kpi">
        <StatCard label="Label T&H" value={hasAccessibilityLabel ? '✓' : '✗'} />
        <StatCard label="Équipements accessibles" value={String(accessibleEquipmentCount)} suffix={`/ ${accessibilityOptions.length}`} />
        <StatCard label="Couverture" value={coverageLabel} />
      </div>

      <Field
        label="Description adaptée (description_adapted)"
        hint="Texte alternatif détaillé — utilisé par Acceslibre et lecteurs d'écran. Multilingue."
      >
        {langTabs.length > 0 && (
          <LangTabs
            tabs={langTabs}
            active={active}
            onSelect={(code) => editor.replaceModule('descriptions', { ...descriptions, activeLanguage: code })}
          />
        )}
        {/* Single owner of description_adapted since the §04 hand-off. Gated like §04's
            canonical scope — the descriptions saver skips the canonical leg without
            canEditCanonical, so an ungated textarea would silently drop the edit. */}
        <Textarea
          value={readTranslatableField(objectScope.adaptedDescription, active, descriptions.localLanguage)}
          rows={5}
          disabled={!canEditAdapted}
          data-testid="adapted-description-textarea"
          onChange={(value) => {
            const updated = updateTranslatableField(
              objectScope.adaptedDescription,
              active,
              descriptions.localLanguage,
              value,
            );
            editor.replaceModule('descriptions', {
              ...descriptions,
              object: { ...objectScope, adaptedDescription: updated },
            });
          }}
        />
        {!canEditAdapted && (
          <p className="muted" style={{ marginTop: 6 }}>
            Lecture seule : vos droits ne permettent pas d&apos;éditer la version par défaut (canonique).
          </p>
        )}
      </Field>

      {/* ── Tourisme & Handicap label block ───────────────────────────────────── */}
      {/* The scheme is LBL_TOURISME_HANDICAP (selection='single'); the main value is
          `granted`; sub-values carry metadata.disability_type (motor/hearing/visual/cognitive).
          We never expose a free-text valueLabel input — the label name is fixed by the scheme. */}
      <div className="chip-group__label" style={{ marginTop: 0 }}>
        Label Tourisme &amp; Handicap
      </div>

      {distinctions.accessibilityLabels.length === 0 ? (
        /* No label held yet — offer a toggle to opt in. */
        <Toggle
          label="Établissement labellisé Tourisme & Handicap"
          on={false}
          onChange={() => {
            const scheme = distinctions.schemeOptions.find((s) => s.isAccessibility);
            if (!scheme) return;
            editor.replaceModule('distinctions', {
              ...distinctions,
              accessibilityLabels: [
                ...distinctions.accessibilityLabels,
                {
                  recordId: null,
                  schemeId: scheme.id,
                  schemeCode: scheme.code,
                  schemeLabel: scheme.label,
                  valueId: 'granted',
                  valueCode: 'granted',
                  valueLabel: 'granted',
                  status: 'granted',
                  awardedAt: '',
                  validUntil: '',
                  disabilityTypesCovered: [],
                },
              ],
            });
          }}
        />
      ) : (
        /* Label is held — show structured editor per label item. */
        distinctions.accessibilityLabels.map((item) => (
          <div key={`${item.schemeCode}-${item.valueCode}`} style={{ marginBottom: 12 }}>
            {/* Disability-type multiselect: chips over the 4 canonical types */}
            <div className="chip-group__label" style={{ marginTop: 6, marginBottom: 4, fontSize: '0.78rem', color: 'var(--text-2, #666)' }}>
              Types de handicap couverts
            </div>
            <ChipMultiSelect
              options={DISABILITY_TYPES}
              selected={item.disabilityTypesCovered}
              onToggle={(code) =>
                updateLabel(item, {
                  disabilityTypesCovered: item.disabilityTypesCovered.includes(code)
                    ? item.disabilityTypesCovered.filter((c) => c !== code)
                    : [...item.disabilityTypesCovered, code],
                })
              }
            />

            {/* Status, award date, expiry */}
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <Select
                value={item.status || 'granted'}
                options={[
                  { v: 'granted', l: 'Obtenu' },
                  { v: 'requested', l: 'Demandé' },
                  { v: 'expired', l: 'Expiré' },
                ]}
                onChange={(status) => updateLabel(item, { status })}
              />
            </div>
          </div>
        ))
      )}

      {/* ── Accessible equipment panels — one collapsible panel per disability type ── */}
      {/* Each panel contains a ChipMultiSelect over the accessibility-family amenities
          that declare the matching disabilityTypes code. Selecting writes to
          characteristics.selectedAmenityCodes (→ object_amenity).
          Panel header names ("Équipements moteur" etc.) are distinct from the bare
          disability-type chip names in the T&H label block above, avoiding getByRole collisions. */}
      {DISABILITY_TYPES.map((dt, index) => {
        const panelOptions = accessibilityOptions.filter((o) => o.disabilityTypes.includes(dt.code));
        const panelSelected = panelOptions.filter((o) =>
          characteristics.selectedAmenityCodes.includes(o.code),
        ).length;
        const isOpen = expandedPanels[dt.code] ?? false;
        const panelId = `acc-panel-${dt.code}`;

        return (
          <div key={dt.code} className={`sust-cat${isOpen ? ' is-open' : ''}`}>
            <button
              type="button"
              className="sust-cat__head"
              onClick={() => togglePanel(dt.code)}
              aria-expanded={isOpen}
              aria-controls={panelId}
            >
              <span className="fs__num sust-cat__num">{(index + 1).toString().padStart(2, '0')}</span>
              <span className="sust-cat__title">
                <strong>Équipements {dt.label.toLowerCase()}</strong>
              </span>
              <span className="pill-mini sust-cat__count">
                {panelSelected} / {panelOptions.length}
              </span>
              <span className="sust-cat__chev" aria-hidden>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </span>
            </button>
            {isOpen ? (
              <div id={panelId} className="sust-cat__body">
                <ChipMultiSelect
                  options={panelOptions}
                  selected={characteristics.selectedAmenityCodes}
                  onToggle={(code) =>
                    editor.replaceModule('characteristics', {
                      ...characteristics,
                      selectedAmenityCodes: characteristics.selectedAmenityCodes.includes(code)
                        ? characteristics.selectedAmenityCodes.filter((c) => c !== code)
                        : [...characteristics.selectedAmenityCodes, code],
                    })
                  }
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </Fs>
  );
}
