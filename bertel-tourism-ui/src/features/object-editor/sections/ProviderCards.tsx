import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { Field, Input, Readout, Select } from '../primitives';
import { ActorPicker } from '../widgets/ActorPicker';
import type {
  ObjectWorkspaceActorLinkItem,
  ObjectWorkspaceRelationshipsModule,
} from '../../../services/object-workspace-parser';
import {
  addActorLink,
  removeActorLink,
  setActorRole,
  setPrimaryActorLink,
  updateActorLink,
} from './actor-links';

const VISIBILITY_OPTIONS = [
  { v: 'public', l: 'Public' },
  { v: 'private', l: 'Interne' },
  { v: 'partners', l: 'Partenaires' },
];

function initialsOf(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean).slice(0, 2);
  const initials = parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
  return initials || '?';
}

function visibilityLabel(value: string): string {
  return VISIBILITY_OPTIONS.find((option) => option.v === value)?.l ?? value;
}

interface ProviderCardsProps {
  relationships: ObjectWorkspaceRelationshipsModule;
  canWrite: boolean;
  /** Persist the next actor-link list (drives `editor.replaceModule('relationships', …)`). */
  onChange: (actors: ObjectWorkspaceActorLinkItem[]) => void;
  /** Open a prestataire's CRM fiche (e.g. to edit its addresses). */
  onOpenActor?: (actorId: string) => void;
}

/**
 * §19 — "Prestataires rattachés" : cartes ÉDITABLES des liens actor_object_role, avec un bouton
 * « Rattacher un nouveau prestataire » ouvrant une modale de recherche (ActorPicker → api.search_actors).
 * Source unique de l'authoring acteur (déplacé hors §17). Persisté par api.save_object_relations
 * (arme actors). Gate : permissions.relationships + actorWriteUnavailableReason (no-write-trap).
 */
export function ProviderCards({ relationships, canWrite, onChange, onOpenActor }: ProviderCardsProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const actors = relationships.actors;
  const roleOptions = relationships.actorRoleOptions;
  const reason = relationships.actorWriteUnavailableReason;
  const editable = canWrite && !reason;

  return (
    <div>
      <div className="chip-group__label" style={{ marginTop: 0 }}>Prestataires rattachés</div>

      {reason && (
        <p style={{ fontSize: 12, color: 'var(--ink-4)', margin: '0 0 8px' }}>
          <strong style={{ color: 'var(--ink-3)' }}>Lecture seule.</strong> {reason}
        </p>
      )}

      {actors.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--ink-4)' }}>Aucun prestataire rattaché à cette fiche.</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {actors.map((actor, index) => {
            const roleSelectOptions = [
              ...(roleOptions.some((option) => option.code === actor.roleCode)
                ? []
                : [{ v: actor.roleCode, l: actor.roleLabel || actor.roleCode }]),
              ...roleOptions.map((option) => ({ v: option.code, l: option.label })),
            ];
            return (
              <div
                key={`${actor.id}-${actor.roleCode}-${index}`}
                style={{
                  border: '1px solid var(--line-soft)',
                  borderRadius: 'var(--r-md)',
                  background: 'var(--surface)',
                  padding: '10px 12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    aria-hidden
                    style={{
                      width: 30,
                      height: 30,
                      flex: '0 0 auto',
                      borderRadius: '50%',
                      background: 'var(--bg-tint)',
                      color: 'var(--ink-3)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {initialsOf(actor.displayName)}
                  </span>
                  <strong style={{ flex: 1, minWidth: 0 }}>{actor.displayName}</strong>
                  {onOpenActor && (
                    <button
                      type="button"
                      className="pill-mini"
                      title="Ouvrir la fiche CRM du prestataire (interactions, coordonnées, adresses)"
                      onClick={() => onOpenActor(actor.id)}
                    >
                      Fiche CRM
                    </button>
                  )}
                  {editable && (
                    <button
                      type="button"
                      className="del"
                      aria-label={`Détacher ${actor.displayName}`}
                      onClick={() => onChange(removeActorLink(actors, index))}
                    >
                      Détacher
                    </button>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginTop: 8 }}>
                  <Field label="Rôle">
                    {editable ? (
                      <Select
                        value={actor.roleCode}
                        aria-label={`Rôle de ${actor.displayName}`}
                        options={roleSelectOptions}
                        onChange={(roleCode) => onChange(setActorRole(actors, index, roleCode, roleOptions))}
                      />
                    ) : (
                      <Readout value={actor.roleLabel || actor.roleCode} placeholder="—" />
                    )}
                  </Field>
                  <Field label="Visibilité">
                    {editable ? (
                      <Select
                        value={actor.visibility || 'public'}
                        aria-label={`Visibilité de ${actor.displayName}`}
                        options={VISIBILITY_OPTIONS}
                        onChange={(visibility) => onChange(updateActorLink(actors, index, { visibility }))}
                      />
                    ) : (
                      <Readout value={visibilityLabel(actor.visibility || 'public')} placeholder="—" />
                    )}
                  </Field>
                  <Field label="Principal">
                    <button
                      type="button"
                      className="pill-mini"
                      aria-pressed={actor.isPrimary}
                      disabled={!editable}
                      title={actor.isPrimary ? 'Prestataire principal pour ce rôle' : 'Définir comme principal'}
                      onClick={() => onChange(setPrimaryActorLink(actors, index))}
                    >
                      {actor.isPrimary ? 'Principal' : '—'}
                    </button>
                  </Field>
                </div>

                <div style={{ marginTop: 8 }}>
                  <Field label="Note">
                    {editable ? (
                      <Input
                        value={actor.note}
                        placeholder="Rôle réel, référent, conditions…"
                        aria-label={`Note sur ${actor.displayName}`}
                        onChange={(note) => onChange(updateActorLink(actors, index, { note }))}
                      />
                    ) : (
                      <Readout value={actor.note} placeholder="—" />
                    )}
                  </Field>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editable && (
        <>
          {roleOptions.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--ink-4)', marginTop: 8 }}>
              Catalogue des rôles acteur indisponible — le rattachement est désactivé.
            </p>
          ) : (
            <button type="button" className="rep-add" style={{ marginTop: 10 }} onClick={() => setPickerOpen(true)}>
              + Rattacher un nouveau prestataire
            </button>
          )}

          <Dialog open={pickerOpen} onOpenChange={(next: boolean) => { if (!next) setPickerOpen(false); }}>
            <DialogContent className="object-editor">
              <DialogHeader>
                <DialogTitle>Rattacher un prestataire</DialogTitle>
              </DialogHeader>
              <div className="ed-modal__body">
                <ActorPicker
                  onPick={(picked) => {
                    onChange(addActorLink(actors, picked, roleOptions));
                    setPickerOpen(false);
                  }}
                />
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
