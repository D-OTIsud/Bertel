'use client';
import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { PortalChoice, PortalRubricActions, useRubricForm } from './rubric-kit';
import { hasTourismeHandicapLabel, portalAccessibilityOptions, PORTAL_DISABILITIES } from '../portal-accessibility';
import { setAmenities } from '../portal-bindings';
import type { PortalRubricFormProps } from './types';

export function AccessibilityRubric({ archetype, editor, formKey, formCache, onDone, onCancel, onDirtyChange }: PortalRubricFormProps) {
  const module = editor.draft.characteristics;
  const options = portalAccessibilityOptions(module, archetype);
  const visible = new Set(options.map((option) => option.code));
  const { form, setForm, dirty } = useRubricForm<{ codes: string[] }>(formKey, () => ({ codes: (module.selectedAmenityCodes ?? []).filter((code) => visible.has(code)) }), formCache);
  const [family, setFamily] = useState<string>('motor');
  const current = PORTAL_DISABILITIES.find((entry) => entry.code === family)!;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  return <form className="portal-form" noValidate onSubmit={(event) => {
    event.preventDefault();
    editor.replaceModule('characteristics', setAmenities(module, form.codes, visible));
    onDone();
  }}>
    <p>Être accessible, ce n’est pas seulement le fauteuil roulant. Il y a quatre familles de besoins : bouger, voir, entendre, comprendre.</p>
    <div className="portal-accessibility__families" role="group" aria-label="Familles de besoins">
      {PORTAL_DISABILITIES.map((entry) => {
        const count = options.filter((option) => option.disabilityTypes?.includes(entry.code) && form.codes.includes(option.code)).length;
        return <button key={entry.code} type="button" className="ghost-button" aria-pressed={family === entry.code}
          onClick={() => setFamily(entry.code)}>{entry.label}<span className="muted">{count} aménagement{count > 1 ? 's' : ''}</span></button>;
      })}
    </div>
    <section className="portal-card portal-accessibility__panel" aria-labelledby="portal-disability-title">
      <h3 id="portal-disability-title">{current.label}</h3><p><strong>Pour qui ?</strong> {current.who}</p>
      <fieldset className="portal-fieldset"><legend>Ce que vous proposez déjà</legend>
        {options.filter((option) => option.disabilityTypes?.includes(family)).map((option) => <PortalChoice key={option.code} type="checkbox" checked={form.codes.includes(option.code)} onChange={(checked) => setForm((previous) => ({ codes: checked ? [...new Set([...previous.codes, option.code])] : previous.codes.filter((code) => code !== option.code) }))}>{option.label}</PortalChoice>)}
        {!options.some((option) => option.disabilityTypes?.includes(family)) ? <p className="muted">Aucun aménagement proposé pour ce type de fiche.</p> : null}
      </fieldset>
      <p className="notice"><strong>Un geste simple :</strong> {current.tip}</p>
    </section>
    <p className="muted">Cochez seulement ce qui existe aujourd’hui : des visiteurs organisent leur venue en s’y fiant.</p>
    <aside className="portal-card portal-tourism-handicap">
      {hasTourismeHandicapLabel(editor.draft) ? <h3><Check size={18} aria-hidden /> Labellisé Tourisme &amp; Handicap</h3> : <><h3>Avez-vous pensé au label Tourisme &amp; Handicap ?</h3><p>Il montre aux visiteurs que votre accueil est pensé pour eux. L’office peut vous accompagner.</p></>}
    </aside>
    <PortalRubricActions onCancel={onCancel} />
  </form>;
}
