import { useState } from 'react';
import { ArrowUpRight, Pencil, Star, Unlink } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { ConfirmDialog } from '../primitives';
import { ActorPicker } from '../widgets/ActorPicker';
import { ProviderEditModal } from '../widgets/ProviderEditModal';
import type {
  ObjectWorkspaceActorLinkItem,
  ObjectWorkspaceRelationshipsModule,
} from '../../../services/object-workspace-parser';
import { actorVisibilityLabel, addActorLink, commitActorEdit, removeActorLink } from './actor-links';

function initialsOf(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean).slice(0, 2);
  const initials = parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
  return initials || '?';
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
 * §19 — "Prestataires rattachés" : cartes des liens actor_object_role. Chaque carte est un
 * RÉSUMÉ lisible (identité + rôle + visibilité + principal) ; l'édition passe par une modale
 * (ProviderEditModal, pattern §03/§08) et le détachement par une confirmation (ConfirmDialog).
 * Le rattachement ouvre une recherche (ActorPicker → api.search_actors). Source unique de
 * l'authoring acteur (hors §17). Persisté par api.save_object_relations (arme actors).
 * Gate : permissions.relationships + actorWriteUnavailableReason (no-write-trap).
 */
export function ProviderCards({ relationships, canWrite, onChange, onOpenActor }: ProviderCardsProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [detachIndex, setDetachIndex] = useState<number | null>(null);

  const actors = relationships.actors;
  const roleOptions = relationships.actorRoleOptions;
  const reason = relationships.actorWriteUnavailableReason;
  const editable = canWrite && !reason;

  const editingActor = editIndex !== null ? actors[editIndex] : undefined;
  const detachingActor = detachIndex !== null ? actors[detachIndex] : undefined;

  return (
    <div>
      <div className="chip-group__label" style={{ marginTop: 0 }}>Prestataires rattachés</div>

      {reason && (
        <p className="provider-readonly">
          <strong>Lecture seule.</strong> {reason}
        </p>
      )}

      {actors.length === 0 ? (
        <p className="provider-empty">Aucun prestataire rattaché à cette fiche.</p>
      ) : (
        <div className="provider-grid">
          {actors.map((actor, index) => (
            <article key={`${actor.id}-${actor.roleCode}-${index}`} className="provider-card">
              <div className="provider-card__head">
                <span className="provider-card__avatar" aria-hidden>{initialsOf(actor.displayName)}</span>
                <div className="provider-card__id">
                  <strong className="provider-card__name">{actor.displayName}</strong>
                  <div className="provider-card__meta">
                    <span className="provider-badge">{actor.roleLabel || actor.roleCode}</span>
                    {actor.isPrimary && (
                      <span className="provider-badge provider-badge--primary">
                        <Star size={11} aria-hidden /> Principal
                      </span>
                    )}
                    <span className="provider-badge provider-badge--vis">
                      {actorVisibilityLabel(actor.visibility || 'public')}
                    </span>
                  </div>
                </div>
              </div>

              {actor.note.trim() && <p className="provider-card__note">{actor.note}</p>}

              <div className="provider-card__actions">
                {onOpenActor && (
                  <button
                    type="button"
                    className="provider-act"
                    title="Ouvrir la fiche CRM du prestataire (interactions, coordonnées, adresses)"
                    onClick={() => onOpenActor(actor.id)}
                  >
                    <ArrowUpRight size={14} aria-hidden /> Fiche CRM
                  </button>
                )}
                {editable && (
                  <button
                    type="button"
                    className="provider-act"
                    aria-label={`Modifier ${actor.displayName}`}
                    onClick={() => setEditIndex(index)}
                  >
                    <Pencil size={14} aria-hidden /> Modifier
                  </button>
                )}
                {editable && (
                  <button
                    type="button"
                    className="provider-act provider-act--danger"
                    aria-label={`Détacher ${actor.displayName}`}
                    onClick={() => setDetachIndex(index)}
                  >
                    <Unlink size={14} aria-hidden /> Détacher
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {editable && (
        roleOptions.length === 0 ? (
          <p className="provider-empty" style={{ marginTop: 8 }}>
            Catalogue des rôles acteur indisponible — le rattachement est désactivé.
          </p>
        ) : (
          <button type="button" className="rep-add" style={{ marginTop: 10 }} onClick={() => setPickerOpen(true)}>
            + Rattacher un nouveau prestataire
          </button>
        )
      )}

      {/* Attach — search modal (ActorPicker). */}
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

      {/* Edit — role / visibility / primary / note. */}
      {editingActor && (
        <ProviderEditModal
          open
          actor={editingActor}
          roleOptions={roleOptions}
          onClose={() => setEditIndex(null)}
          onSave={(patched) => {
            onChange(commitActorEdit(actors, editIndex as number, patched));
            setEditIndex(null);
          }}
        />
      )}

      {/* Detach — confirmation. */}
      <ConfirmDialog
        open={detachingActor !== undefined}
        title="Détacher le prestataire"
        message={
          <>
            Voulez-vous vraiment détacher <strong>{detachingActor?.displayName}</strong> de cette fiche ?
            Le prestataire (et son historique CRM) n'est pas supprimé — seul son rattachement à cet objet est retiré.
          </>
        }
        confirmLabel="Détacher"
        tone="danger"
        onCancel={() => setDetachIndex(null)}
        onConfirm={() => {
          onChange(removeActorLink(actors, detachIndex as number));
          setDetachIndex(null);
        }}
      />
    </div>
  );
}
