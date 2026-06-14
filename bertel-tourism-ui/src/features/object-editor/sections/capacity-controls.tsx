import { useState } from 'react';
import { ChipMultiSelect, EditorModal, Field, Input, Select, Textarea, Toggle } from '../primitives';
import type {
  ObjectWorkspaceCapacityPoliciesModule,
  ObjectWorkspaceCharacteristicsModule,
} from '../../../services/object-workspace-parser';
import { ModuleUnavailableNotice } from './blocks/block-notes';

function hasText(value: string): boolean {
  return value.trim().length > 0;
}

/**
 * « Cadre / environnement » — rendu partagé §06 (HEB) / §07 (autres types).
 * Catalogue large (~60 codes ref_environment_tag) ⇒ sélection par MODAL (recherche +
 * Sélectionnés/Disponibles). Source d'état unique : editor.draft.characteristics.
 */
export function EnvironmentChips({
  characteristics,
  onChange,
}: {
  characteristics: ObjectWorkspaceCharacteristicsModule;
  onChange: (next: ObjectWorkspaceCharacteristicsModule) => void;
}) {
  return (
    <>
      <div className="chip-group__label" style={{ marginTop: 16 }}>
        Cadre / environnement
      </div>
      {characteristics.unavailableReason ? (
        <ModuleUnavailableNotice reason={characteristics.unavailableReason} />
      ) : (
        <ChipMultiSelect
          options={characteristics.environmentOptions}
          selected={characteristics.selectedEnvironmentCodes}
          modalTitle="Choisir un cadre / environnement"
          searchPlaceholder="Rechercher un environnement…"
          onChange={(codes) => onChange({ ...characteristics, selectedEnvironmentCodes: codes })}
        />
      )}
    </>
  );
}

/** Résumé compact + « Modifier », ou bouton « + {addLabel} » si rien n'est défini. */
function PolicyTrigger({
  isSet,
  summary,
  addLabel,
  onOpen,
}: {
  isSet: boolean;
  summary: string;
  addLabel: string;
  onOpen: () => void;
}) {
  if (isSet) {
    return (
      <div className="policy-summary">
        <span>{summary}</span>
        <button type="button" className="btn-link" onClick={onOpen}>
          Modifier
        </button>
      </div>
    );
  }
  return (
    <button type="button" className="rep-add" onClick={onOpen}>
      + {addLabel}
    </button>
  );
}

/**
 * Politique de groupe — bouton « + Définir une politique de groupe » → modale staged
 * (Annuler/Valider). Quand elle est définie, n'affiche qu'un résumé + « Modifier ».
 */
export function GroupPolicyButton({
  capacity,
  onChange,
}: {
  capacity: ObjectWorkspaceCapacityPoliciesModule;
  onChange: (next: ObjectWorkspaceCapacityPoliciesModule) => void;
}) {
  const gp = capacity.groupPolicy;
  const isSet = hasText(gp.minSize) || hasText(gp.maxSize) || hasText(gp.notes) || gp.groupOnly;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(gp);

  const sizePart = hasText(gp.minSize) || hasText(gp.maxSize) ? `${gp.minSize || '—'}–${gp.maxSize || '—'} pers.` : '';
  const summary =
    [sizePart, gp.groupOnly ? 'groupes uniquement' : '', hasText(gp.notes) ? 'avec notes' : '']
      .filter(Boolean)
      .join(' · ') || 'Politique définie';

  return (
    <>
      <div className="chip-group__label" style={{ marginTop: 16 }}>
        Politique de groupe
      </div>
      <PolicyTrigger
        isSet={isSet}
        summary={summary}
        addLabel="Définir une politique de groupe"
        onOpen={() => {
          setDraft(gp);
          setOpen(true);
        }}
      />
      <EditorModal
        open={open}
        title="Politique de groupe"
        saveLabel="Valider"
        onClose={() => setOpen(false)}
        onSave={() => {
          onChange({ ...capacity, groupPolicy: draft });
          setOpen(false);
        }}
      >
        <div className="grid-2">
          <Field label="Taille min.">
            <Input value={draft.minSize} placeholder="Min" mono onChange={(minSize) => setDraft({ ...draft, minSize })} />
          </Field>
          <Field label="Taille max.">
            <Input value={draft.maxSize} placeholder="Max" mono onChange={(maxSize) => setDraft({ ...draft, maxSize })} />
          </Field>
        </div>
        <Toggle
          label="Groupes uniquement"
          on={draft.groupOnly}
          onChange={(groupOnly) => setDraft({ ...draft, groupOnly })}
        />
        <Field label="Notes ou informations complémentaires">
          <Textarea
            value={draft.notes}
            rows={3}
            onChange={(notes) => setDraft({ ...draft, notes })}
          />
        </Field>
      </EditorModal>
    </>
  );
}

/**
 * Politique d'accueil des animaux — bouton « + Définir la politique animaux » → modale staged.
 * Tri-état : « non renseigné » = pas de ligne DB (jamais publié « non acceptés » par défaut).
 */
export function PetPolicyButton({
  capacity,
  onChange,
}: {
  capacity: ObjectWorkspaceCapacityPoliciesModule;
  onChange: (next: ObjectWorkspaceCapacityPoliciesModule) => void;
}) {
  const pp = capacity.petPolicy;
  const isSet = pp.accepted !== null;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(pp);

  const summary = `${pp.accepted ? 'Animaux acceptés' : 'Animaux non acceptés'}${hasText(pp.conditions) ? ' · conditions' : ''}`;

  return (
    <>
      <div className="chip-group__label" style={{ marginTop: 16 }}>
        Politique animaux
      </div>
      <PolicyTrigger
        isSet={isSet}
        summary={summary}
        addLabel="Définir la politique animaux"
        onOpen={() => {
          setDraft(pp);
          setOpen(true);
        }}
      />
      <EditorModal
        open={open}
        title="Politique d'accueil des animaux"
        saveLabel="Valider"
        onClose={() => setOpen(false)}
        onSave={() => {
          onChange({ ...capacity, petPolicy: draft });
          setOpen(false);
        }}
      >
        <Field label="Animaux">
          <Select
            value={draft.accepted === null ? '' : draft.accepted ? 'accepted' : 'refused'}
            options={[
              { v: '', l: '— Non renseigné —' },
              { v: 'accepted', l: 'Acceptés' },
              { v: 'refused', l: 'Non acceptés' },
            ]}
            aria-label="Animaux"
            onChange={(next) => setDraft({ ...draft, accepted: next === '' ? null : next === 'accepted' })}
          />
        </Field>
        {draft.accepted !== null && (
          <Field label="Conditions d'accueil des animaux">
            <Textarea
              aria-label="Conditions d'accueil des animaux"
              value={draft.conditions}
              rows={3}
              onChange={(conditions) => setDraft({ ...draft, conditions })}
            />
          </Field>
        )}
      </EditorModal>
    </>
  );
}
