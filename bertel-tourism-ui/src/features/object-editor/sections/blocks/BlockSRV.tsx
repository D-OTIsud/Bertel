import { Chip, ChipSet, Field, Fs, ScheduleEditor } from '../../primitives';
import type { SectionProps } from '../section-types';
import { applyRowsToFirstPeriod, scheduleRowsFromPeriod } from './opening-schedule';

function toggle(values: string[], code: string) {
  return values.includes(code) ? values.filter((value) => value !== code) : [...values, code];
}

const COMMUNE_LABELS = [
  'Saint-Pierre',
  'Le Tampon',
  'Petite-Île',
  'Saint-Joseph',
  "L'Entre-Deux",
  'Cilaos',
  'Saint-Philippe',
  'Sud Sauvage',
];

export function BlockSRV({ editor, folded }: SectionProps) {
  const characteristics = editor.draft.characteristics;
  const openings = editor.draft.openings;
  const services = characteristics.amenityGroups.flatMap((group) => group.options);
  const selectedCount = characteristics.selectedAmenityCodes.length;
  const langCount = characteristics.selectedLanguages.length;

  return (
    <Fs
      num="05"
      title="Prestations & zone d'intervention"
      sub="Prestations délivrées au comptoir, communes desservies, langues et horaires saisonniers"
      folded={folded}
      pill={{
        tone: selectedCount > 0 ? 'ok' : 'warn',
        label:
          langCount > 0
            ? `${selectedCount} prestation(s) · ${langCount} langue(s)`
            : `${selectedCount} prestation(s)`,
      }}
    >
      <div className="chip-group__label" style={{ marginTop: 0 }}>
        Prestations délivrées
      </div>
      <ChipSet>
        {services.slice(0, 18).map((option) => (
          <Chip
            key={option.code}
            label={option.label}
            on={characteristics.selectedAmenityCodes.includes(option.code)}
            onClick={() =>
              editor.replaceModule('characteristics', {
                ...characteristics,
                selectedAmenityCodes: toggle(characteristics.selectedAmenityCodes, option.code),
              })
            }
          />
        ))}
      </ChipSet>

      <div className="chip-group__label" style={{ marginTop: 18 }}>
        Zone d'intervention
      </div>
      <Field label="Communes desservies" hint="Pour les services intercommunaux — filtre les recherches Explorer">
        <ChipSet>
          {COMMUNE_LABELS.map((commune) => (
            <Chip key={commune} label={commune} on={false} />
          ))}
          <Chip label="+ Commune" />
        </ChipSet>
      </Field>

      <div className="chip-group__label" style={{ marginTop: 18 }}>
        Langues parlées au comptoir
      </div>
      <ChipSet>
        {characteristics.languageOptions.map((option) => (
          <Chip
            key={option.code}
            label={option.label}
            on={characteristics.selectedLanguages.some((item) => item.code === option.code)}
            onClick={() => {
              const existing = characteristics.selectedLanguages.find((item) => item.code === option.code);
              const level = characteristics.languageLevelOptions[0];
              editor.replaceModule('characteristics', {
                ...characteristics,
                selectedLanguages: existing
                  ? characteristics.selectedLanguages.filter((item) => item.code !== option.code)
                  : [
                      ...characteristics.selectedLanguages,
                      {
                        languageId: option.id,
                        code: option.code,
                        label: option.label,
                        levelId: level?.id ?? '',
                        levelCode: level?.code ?? '',
                        levelLabel: level?.label ?? '',
                      },
                    ],
              });
            }}
          />
        ))}
      </ChipSet>

      <div className="chip-group__label" style={{ marginTop: 18 }}>
        Horaires d'accueil — haute saison
        <span style={{ color: 'var(--ink-4)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
          {' '}
          · juil-août, déc-janv
        </span>
      </div>
      <ScheduleEditor
        rows={scheduleRowsFromPeriod(openings.periods[0])}
        colA="Saison"
        colB="Hors saison"
        onChange={(rows) => editor.replaceModule('openings', applyRowsToFirstPeriod(openings, rows))}
      />
    </Fs>
  );
}
