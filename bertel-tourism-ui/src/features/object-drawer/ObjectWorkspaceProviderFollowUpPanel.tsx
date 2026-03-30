import { useState } from 'react';
import {
  useAddObjectPrivateNoteMutation,
  useDeleteObjectPrivateNoteMutation,
  useUpdateObjectPrivateNoteMutation,
} from '../../hooks/useExplorerQueries';
import type { ObjectWorkspaceModuleAccess } from '../../services/object-workspace';
import type {
  ObjectWorkspaceFollowUpNote,
  ObjectWorkspaceProviderFollowUpModule,
} from '../../services/object-workspace-parser';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

const NOTE_CATEGORY_OPTIONS: Array<ObjectWorkspaceFollowUpNote['category']> = [
  'general',
  'important',
  'urgent',
  'internal',
  'followup',
];

function formatDateTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return '';
  }

  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function categoryLabel(value: ObjectWorkspaceFollowUpNote['category']): string {
  switch (value) {
    case 'important':
      return 'Important';
    case 'urgent':
      return 'Urgent';
    case 'internal':
      return 'Interne';
    case 'followup':
      return 'Suivi';
    case 'general':
    default:
      return 'General';
  }
}

interface ObjectWorkspaceProviderFollowUpPanelProps {
  objectId: string;
  value: ObjectWorkspaceProviderFollowUpModule;
  access: ObjectWorkspaceModuleAccess;
}

export function ObjectWorkspaceProviderFollowUpPanel({
  objectId,
  value,
  access,
}: ObjectWorkspaceProviderFollowUpPanelProps) {
  const addNoteMutation = useAddObjectPrivateNoteMutation(objectId);
  const updateNoteMutation = useUpdateObjectPrivateNoteMutation(objectId);
  const deleteNoteMutation = useDeleteObjectPrivateNoteMutation(objectId);
  const [composerOpen, setComposerOpen] = useState(false);
  const [draftBody, setDraftBody] = useState('');
  const [draftCategory, setDraftCategory] = useState<ObjectWorkspaceFollowUpNote['category']>('general');
  const [draftPinned, setDraftPinned] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [editCategory, setEditCategory] = useState<ObjectWorkspaceFollowUpNote['category']>('general');
  const [editPinned, setEditPinned] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const noteCount = value.notes.length;
  const pinnedCount = value.notes.filter((note) => note.isPinned).length;
  const archivedCount = value.notes.filter((note) => note.isArchived).length;
  const disabled = !access.canDirectWrite;

  function startEditing(note: ObjectWorkspaceFollowUpNote) {
    setEditingNoteId(note.id);
    setEditBody(note.body);
    setEditCategory(note.category);
    setEditPinned(note.isPinned);
    setFeedbackMessage(null);
  }

  function stopEditing() {
    setEditingNoteId(null);
    setEditBody('');
    setEditCategory('general');
    setEditPinned(false);
  }

  async function handleCreateNote() {
    const body = draftBody.trim();
    if (!body) {
      return;
    }

    setFeedbackMessage(null);
    try {
      await addNoteMutation.mutateAsync({
        body,
        category: draftCategory,
        isPinned: draftPinned,
      });
      setDraftBody('');
      setDraftCategory('general');
      setDraftPinned(false);
      setComposerOpen(false);
      setFeedbackMessage('Note interne enregistree.');
    } catch (error) {
      setFeedbackMessage(error instanceof Error ? error.message : "Impossible d'enregistrer la note.");
    }
  }

  async function handleSaveNote(note: ObjectWorkspaceFollowUpNote) {
    const body = editBody.trim();
    if (!body) {
      return;
    }

    setFeedbackMessage(null);
    try {
      await updateNoteMutation.mutateAsync({
        noteId: note.id,
        body,
        category: editCategory,
        isPinned: editPinned,
        isArchived: note.isArchived,
      });
      stopEditing();
      setFeedbackMessage('Note mise a jour.');
    } catch (error) {
      setFeedbackMessage(error instanceof Error ? error.message : 'Impossible de mettre a jour la note.');
    }
  }

  async function handleArchiveToggle(note: ObjectWorkspaceFollowUpNote) {
    setFeedbackMessage(null);
    try {
      await updateNoteMutation.mutateAsync({
        noteId: note.id,
        body: note.body,
        category: note.category,
        isPinned: note.isPinned,
        isArchived: !note.isArchived,
      });
      setFeedbackMessage(note.isArchived ? 'Note restauree.' : 'Note archivee.');
    } catch (error) {
      setFeedbackMessage(error instanceof Error ? error.message : "Impossible d'archiver la note.");
    }
  }

  async function handleDeleteNote(noteId: string) {
    setFeedbackMessage(null);
    try {
      await deleteNoteMutation.mutateAsync(noteId);
      if (editingNoteId === noteId) {
        stopEditing();
      }
      setFeedbackMessage('Note supprimee.');
    } catch (error) {
      setFeedbackMessage(error instanceof Error ? error.message : 'Impossible de supprimer la note.');
    }
  }

  return (
    <div className="drawer-form-stack">
      <article className="panel-card panel-card--nested">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">D1</span>
            <h2>Suivi relation prestataires</h2>
            <p>Ce module privilegie le suivi interne et la memoire de relation. Les notes sont direct-save; le journal CRM et les taches restent bloques tant que le backend live ne les expose pas proprement.</p>
          </div>
          <div className="stack-list text-right">
            <Button type="button" variant="outline" onClick={() => setComposerOpen((current) => !current)} disabled={disabled}>
              {composerOpen ? 'Fermer la saisie' : 'Ajouter une note'}
            </Button>
            {access.disabledReason && <small className="text-muted-foreground">{access.disabledReason}</small>}
            {feedbackMessage && <small className="text-muted-foreground">{feedbackMessage}</small>}
          </div>
        </div>

        <div className="drawer-grid">
          <article className="panel-card panel-card--nested">
            <span className="facet-title">Notes internes</span>
            <strong>{noteCount}</strong>
            <p>Memoire de relation, relances et contexte de travail interne.</p>
          </article>

          <article className="panel-card panel-card--nested">
            <span className="facet-title">Epingles</span>
            <strong>{pinnedCount}</strong>
            <p>Notes mises en avant pour le suivi courant.</p>
          </article>

          <article className="panel-card panel-card--nested">
            <span className="facet-title">Archives</span>
            <strong>{archivedCount}</strong>
            <p>Historique conserve sans rester dans le flux principal.</p>
          </article>

          <article className="panel-card panel-card--nested">
            <span className="facet-title">Journal CRM</span>
            <p>{value.interactionsUnavailableReason}</p>
          </article>

          <article className="panel-card panel-card--nested">
            <span className="facet-title">Taches CRM</span>
            <p>{value.tasksUnavailableReason}</p>
          </article>
        </div>
      </article>

      {composerOpen && (
        <article className="panel-card panel-card--nested">
          <div className="panel-heading">
            <div>
              <span className="facet-title">Nouvelle note</span>
              <h3>Ajouter un suivi interne</h3>
            </div>
            <div className="inline-actions">
              <Button type="button" variant="ghost" onClick={() => setComposerOpen(false)} disabled={addNoteMutation.isPending}>
                Annuler
              </Button>
              <Button type="button" variant="outline" onClick={() => void handleCreateNote()} disabled={disabled || addNoteMutation.isPending || !draftBody.trim()}>
                {addNoteMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </div>
          </div>

          <div className="drawer-grid">
            <div className="field-block">
              <Label htmlFor="follow-up-note-category">Categorie</Label>
              <select
                id="follow-up-note-category"
                className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                value={draftCategory}
                disabled={disabled}
                onChange={(event) => setDraftCategory(event.target.value as ObjectWorkspaceFollowUpNote['category'])}
              >
                {NOTE_CATEGORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {categoryLabel(option)}
                  </option>
                ))}
              </select>
            </div>

            <label className="field-block">
              <span className="text-sm font-medium">Epingler</span>
              <input type="checkbox" checked={draftPinned} disabled={disabled} onChange={(event) => setDraftPinned(event.target.checked)} />
            </label>

            <div className="field-block field-block--wide">
              <Label htmlFor="follow-up-note-body">Note</Label>
              <textarea
                id="follow-up-note-body"
                className="min-h-28 rounded-2xl border border-input bg-background px-4 py-3 text-sm"
                value={draftBody}
                disabled={disabled}
                onChange={(event) => setDraftBody(event.target.value)}
              />
            </div>
          </div>
        </article>
      )}

      <section className="drawer-form-stack">
        {value.notes.length > 0 ? value.notes.map((note) => {
          const isEditing = editingNoteId === note.id;
          const canManageNote = access.canDirectWrite || note.canEdit || note.canDelete;

          return (
            <article key={note.id} className="panel-card panel-card--nested">
              <div className="panel-heading">
                <div>
                  <span className="facet-title">{categoryLabel(note.category)}</span>
                  <h3>{note.createdByName || 'Equipe'}</h3>
                  <p>{formatDateTime(note.updatedAt || note.createdAt) || 'Horodatage indisponible'}</p>
                </div>
                <div className="stack-list text-right">
                  <strong>{note.isArchived ? 'Archivee' : note.isPinned ? 'Epinglee' : 'Active'}</strong>
                  <div className="inline-actions">
                    {canManageNote && !isEditing && (
                      <Button type="button" variant="ghost" onClick={() => startEditing(note)} disabled={updateNoteMutation.isPending || deleteNoteMutation.isPending}>
                        Modifier
                      </Button>
                    )}
                    {canManageNote && (
                      <Button type="button" variant="ghost" onClick={() => void handleArchiveToggle(note)} disabled={updateNoteMutation.isPending}>
                        {note.isArchived ? 'Restaurer' : 'Archiver'}
                      </Button>
                    )}
                    {(access.canDirectWrite || note.canDelete) && (
                      <Button type="button" variant="ghost" onClick={() => void handleDeleteNote(note.id)} disabled={deleteNoteMutation.isPending}>
                        Supprimer
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {isEditing ? (
                <div className="drawer-grid">
                  <div className="field-block">
                    <Label htmlFor={`follow-up-edit-category-${note.id}`}>Categorie</Label>
                    <select
                      id={`follow-up-edit-category-${note.id}`}
                      className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                      value={editCategory}
                      onChange={(event) => setEditCategory(event.target.value as ObjectWorkspaceFollowUpNote['category'])}
                    >
                      {NOTE_CATEGORY_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {categoryLabel(option)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <label className="field-block">
                    <span className="text-sm font-medium">Epingler</span>
                    <input type="checkbox" checked={editPinned} onChange={(event) => setEditPinned(event.target.checked)} />
                  </label>

                  <div className="field-block field-block--wide">
                    <Label htmlFor={`follow-up-edit-body-${note.id}`}>Note</Label>
                    <textarea
                      id={`follow-up-edit-body-${note.id}`}
                      className="min-h-28 rounded-2xl border border-input bg-background px-4 py-3 text-sm"
                      value={editBody}
                      onChange={(event) => setEditBody(event.target.value)}
                    />
                  </div>

                  <div className="inline-actions field-block field-block--wide">
                    <Button type="button" variant="ghost" onClick={stopEditing} disabled={updateNoteMutation.isPending}>
                      Annuler
                    </Button>
                    <Button type="button" variant="outline" onClick={() => void handleSaveNote(note)} disabled={updateNoteMutation.isPending || !editBody.trim()}>
                      {updateNoteMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="stack-list">
                  <p className="text-sm whitespace-pre-wrap">{note.body}</p>
                  <div className="inline-actions text-sm text-muted-foreground">
                    <span>{note.audience || 'private'}</span>
                    {note.language && <span>{note.language}</span>}
                    {note.isPinned && <span>Epingler</span>}
                    {note.isArchived && <span>Archivee</span>}
                  </div>
                </div>
              )}
            </article>
          );
        }) : (
          <article className="panel-card panel-card--nested">
            <span className="facet-title">Notes internes</span>
            <p>Aucune note de suivi prestataire n est encore rattachee a cette fiche.</p>
          </article>
        )}
      </section>
    </div>
  );
}
