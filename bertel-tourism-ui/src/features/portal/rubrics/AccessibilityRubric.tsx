'use client';
import { useEffect, useState, type ComponentType } from 'react';
import { Award, Ear, Eye, Lightbulb } from 'lucide-react';
import { PortalRubricActions, useRubricForm } from './rubric-kit';
import { hasTourismeHandicapLabel, portalAccessibilityOptions, PORTAL_DISABILITIES } from '../portal-accessibility';
import { setAmenities } from '../portal-bindings';
import type { PortalRubricFormProps } from './types';

/** Pictogramme fauteuil de la maquette 14 (lucide n'en fournit pas dans cette version). Décoratif. */
function WheelchairIcon({ size = 22 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
    <circle cx="11" cy="4.5" r="1.8" />
    <path d="M10 8v5h5l2 5" />
    <path d="M7.5 11.5a5.5 5.5 0 1 0 7.5 6.5" />
  </svg>;
}

/** Pictogramme « personne encerclée » de l'intro de la maquette 14 (le lucide `Accessibility` de cette version dessine un fauteuil). Décoratif. */
function PersonCircleIcon({ size = 22 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="7.5" r="1.3" />
    <path d="M8 10.5l4 1 4-1M12 11.5V15l-2 3.5M12 15l2 3.5" />
  </svg>;
}

/** Présentation seule : nom affiché et pictogramme de chaque famille (les codes restent ceux du catalogue). */
const FAMILY_DISPLAY: Record<string, { name: string; Icon: ComponentType<{ size?: number }> }> = {
  motor: { name: 'Mobilité', Icon: WheelchairIcon },
  visual: { name: 'Vue', Icon: Eye },
  hearing: { name: 'Audition', Icon: Ear },
  cognitive: { name: 'Compréhension et bien-être', Icon: Lightbulb },
};

function coverageSentence(covered: number, total: number): string {
  if (covered === 0) return 'Votre fiche n’indique encore aucune famille de besoins.';
  return `Votre fiche répond à ${covered} famille${covered > 1 ? 's' : ''} de besoins sur ${total}.`;
}

export function AccessibilityRubric({ archetype, editor, formKey, formCache, onDone, onCancel, onDirtyChange }: PortalRubricFormProps) {
  const module = editor.draft.characteristics;
  const options = portalAccessibilityOptions(module, archetype);
  const visible = new Set(options.map((option) => option.code));
  const { form, setForm, dirty } = useRubricForm<{ codes: string[] }>(formKey, () => ({ codes: (module.selectedAmenityCodes ?? []).filter((code) => visible.has(code)) }), formCache);
  const [family, setFamily] = useState<string>('motor');
  const current = PORTAL_DISABILITIES.find((entry) => entry.code === family)!;
  const currentName = FAMILY_DISPLAY[current.code]?.name ?? current.label;
  const familyOptions = options.filter((option) => option.disabilityTypes?.includes(family));
  const counts = PORTAL_DISABILITIES.map((entry) => options.filter((option) => option.disabilityTypes?.includes(entry.code) && form.codes.includes(option.code)).length);
  const covered = counts.filter((count) => count > 0).length;
  const labelled = hasTourismeHandicapLabel(editor.draft);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  function toggle(code: string, checked: boolean) {
    setForm((previous) => ({ codes: checked ? [...new Set([...previous.codes, code])] : previous.codes.filter((entry) => entry !== code) }));
  }

  return <form className="portal-form portal-a11y" noValidate onSubmit={(event) => {
    event.preventDefault();
    editor.replaceModule('characteristics', setAmenities(module, form.codes, visible));
    onDone();
  }}>
    <div className="portal-a11y__intro">
      <span className="portal-a11y__intro-icon" aria-hidden><PersonCircleIcon size={22} /></span>
      <div>
        <p className="portal-a11y__intro-title">Être accessible, ce n’est pas seulement le fauteuil roulant.</p>
        <p className="portal-a11y__intro-text">Il y a quatre familles de besoins : bouger, voir, entendre, comprendre. Chaque aménagement sert aussi à bien d’autres visiteurs : parents avec poussette, seniors, voyageurs blessés…</p>
      </div>
    </div>

    <div>
      <p className="portal-a11y__coverage">{coverageSentence(covered, PORTAL_DISABILITIES.length)}</p>
      <div className="portal-a11y__families" role="group" aria-label="Familles de besoins">
        {PORTAL_DISABILITIES.map((entry, index) => {
          const display = FAMILY_DISPLAY[entry.code];
          const Icon = display?.Icon ?? PersonCircleIcon;
          const count = counts[index];
          return <button key={entry.code} type="button" className="portal-a11y__family" aria-pressed={family === entry.code}
            onClick={() => setFamily(entry.code)}>
            <span className="portal-a11y__family-icon" aria-hidden><Icon size={22} /></span>
            <span className="portal-a11y__family-name">{display?.name ?? entry.label}</span>
            <span className={`portal-a11y__badge ${count > 0 ? 'portal-a11y__badge--ok' : 'portal-a11y__badge--empty'}`}>
              {count > 0 ? `${count} indiqué${count > 1 ? 's' : ''}` : 'Rien d’indiqué'}
            </span>
          </button>;
        })}
      </div>
    </div>

    <section className="portal-a11y__panel" aria-labelledby="portal-disability-title">
      <div>
        <h3 id="portal-disability-title" className="portal-a11y__panel-title">{currentName}</h3>
        <p className="portal-a11y__who"><strong>Pour qui ?</strong> {current.who}</p>
      </div>
      <fieldset className="portal-a11y__fieldset"><legend>Ce que vous proposez déjà</legend>
        {familyOptions.length > 0
          ? <div className="portal-a11y__chips">
            {familyOptions.map((option) => <label key={option.code} className="portal-a11y__chip">
              <input type="checkbox" checked={form.codes.includes(option.code)}
                disabled={option.disabled && !form.codes.includes(option.code)}
                onChange={(event) => toggle(option.code, event.target.checked)} />
              <span>{option.label}</span>
            </label>)}
          </div>
          : <p className="muted">Aucun aménagement proposé pour ce type de fiche.</p>}
      </fieldset>
      <div className="portal-a11y__tip">
        <Lightbulb size={20} aria-hidden />
        <p><strong>Un geste simple :</strong> {current.tip}</p>
      </div>
    </section>

    <p className="portal-a11y__hint">Cochez seulement ce qui existe aujourd’hui : des visiteurs organisent leur venue en s’y fiant.</p>

    <aside className="portal-a11y__label" aria-labelledby="portal-th-title">
      <span className="portal-a11y__label-icon" aria-hidden><Award size={22} /></span>
      <div>
        {labelled
          ? <h3 id="portal-th-title">Labellisé Tourisme &amp; Handicap</h3>
          : <>
            <h3 id="portal-th-title">Avez-vous pensé au label Tourisme &amp; Handicap ?</h3>
            <p>Il montre aux visiteurs que votre accueil est pensé pour eux. L’office peut vous accompagner.</p>
          </>}
      </div>
    </aside>
    <PortalRubricActions onCancel={onCancel} />
  </form>;
}
