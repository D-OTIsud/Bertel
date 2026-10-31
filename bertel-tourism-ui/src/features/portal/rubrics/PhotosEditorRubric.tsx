"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ImagePlus, Trash2, X } from "lucide-react";
import { SortableGrid } from "../../object-editor/primitives";
import {
  useRubricForm,
  PortalChoice,
  PortalField,
  PortalRubricActions,
} from "./rubric-kit";
import { PortalLocalPhoto, PortalPrivatePhoto } from "./PortalPrivatePhoto";
import {
  listMyPortalPhotos,
  withdrawPortalPhoto,
  reorderPortalPhotos,
  uploadPortalPhoto,
  portalPhotoDraft,
  mergePortalPublishedPhotos,
  type PortalPublishedPhoto,
} from "../../../services/portal-photos";
import type { ObjectWorkspaceMediaItem } from "../../../services/object-workspace-parser";
import type { PortalRubricFormProps } from "./types";
import { useSessionStore } from "../../../store/session-store";
import { strictErrorMessage } from "../../../lib/strict-error-message";

interface QueuedPhoto {
  key: string;
  name: string;
  file: File | null;
  replaceId: string | null;
}
interface PhotoForm {
  additions: ObjectWorkspaceMediaItem[];
  files: QueuedPhoto[];
  rights: boolean;
  credit: string;
}

export function PhotosEditorRubric({
  editor,
  rubric,
  formKey,
  formCache,
  onDone,
  onCancel,
  onDirtyChange,
  onBusyChange,
}: PortalRubricFormProps) {
  const userId = useSessionStore((s) => s.userId),
    queryClient = useQueryClient();
  const key = ["portal-published-photos", userId, editor.objectId];
  const published = useQuery({
    queryKey: key,
    queryFn: () => listMyPortalPhotos(editor.objectId),
    refetchOnWindowFocus: true,
  });
  const lastGallery = useRef<PortalPublishedPhoto[] | null>(null);
  const mergeSaved = editor.mergeSavedModule;
  useEffect(() => {
    if (!published.data || lastGallery.current === published.data) return;
    lastGallery.current = published.data;
    mergeSaved("media", (current) =>
      mergePortalPublishedPhotos(current, published.data!),
    );
  }, [published.data, mergeSaved]);
  const { form, setForm, dirty } = useRubricForm<PhotoForm>(
    formKey,
    () => ({
      additions: editor.draft.media.objectItems.filter(
        (item) => item.portalUploadId,
      ),
      files: [],
      rights: false,
      credit:
        editor.draft.media.objectItems.find((item) => item.portalUploadId)
          ?.credit ?? "",
    }),
    formCache,
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  const addInput = useRef<HTMLInputElement>(null),
    replaceInput = useRef<HTMLInputElement>(null),
    replaceTarget = useRef<string | null>(null);
  const publishedDocs = new Set(
    (published.data ?? [])
      .map((photo) => photo.portalDocumentId)
      .filter(Boolean),
  );
  const additions = form.additions.filter(
    (item) => !publishedDocs.has(item.portalUploadId ?? ""),
  );
  const sentIds = new Set(
    editor.baseline.media.objectItems.flatMap((item) =>
      item.portalUploadId ? [item.portalUploadId] : [],
    ),
  );
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange]);
  function choose(files: FileList | null, replaceId: string | null) {
    if (!files?.length) return;
    if (files.length + form.files.length + additions.length > 20) {
      setError("Vous pouvez préparer vingt ajouts au maximum.");
      return;
    }
    setForm((previous) => ({
      ...previous,
      files: [
        ...previous.files,
        ...Array.from(files).map((file) => ({
          key: crypto.randomUUID(),
          file,
          name: file.name,
          replaceId,
        })),
      ],
    }));
    setError("");
  }
  async function reorder(photos: PortalPublishedPhoto[]) {
    if (busy || !published.data) return;
    setBusy(true);
    setError("");
    try {
      const saved = await reorderPortalPhotos(
        editor.objectId,
        photos.map((photo) => photo.id),
      );
      mergeSaved("media", (current) =>
        mergePortalPublishedPhotos(current, saved),
      );
      queryClient.setQueryData(key, saved);
      setStatus("L’ordre des photos est enregistré.");
    } catch (e) {
      setError(
        strictErrorMessage(e, "L’ordre n’a pas pu être enregistré. Réessayez."),
      );
      void published.refetch();
    } finally {
      setBusy(false);
    }
  }
  async function withdraw(id: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const saved = await withdrawPortalPhoto(editor.objectId, id);
      mergeSaved("media", (current) =>
        mergePortalPublishedPhotos(current, saved),
      );
      queryClient.setQueryData(key, saved);
      setStatus("La photo est retirée de votre fiche.");
    } catch (e) {
      setError(
        strictErrorMessage(e, "La photo n’a pas pu être retirée. Réessayez."),
      );
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (form.files.length && !form.rights) {
      setError(
        "Confirmez que vous avez l’autorisation de diffuser ces photos.",
      );
      return;
    }
    if (form.files.some((entry) => !(entry.file instanceof File))) {
      setError(
        "Choisissez à nouveau les photos qui n’ont pas encore été déposées.",
      );
      return;
    }
    setBusy(true);
    let prepared = [...additions];
    try {
      for (const entry of form.files) {
        const uploaded = await uploadPortalPhoto(
          editor.objectId,
          entry.file!,
          form.rights,
        );
        prepared = [
          ...prepared,
          portalPhotoDraft(
            uploaded,
            form.credit,
            entry.replaceId,
            editor.draft.media,
          ),
        ];
        const saved = prepared;
        setForm((previous) => ({
          ...previous,
          additions: saved,
          files: previous.files.filter((file) => file.key !== entry.key),
        }));
      }
      prepared = prepared.map((item) =>
        sentIds.has(item.portalUploadId ?? "") && rubric.state === "pending"
          ? item
          : { ...item, credit: form.credit },
      );
      const current = editor.draft.media;
      editor.replaceModule("media", {
        ...current,
        objectItems: [
          ...current.objectItems.filter((item) => !item.portalUploadId),
          ...prepared,
        ],
      });
      onDone();
    } catch (e) {
      setError(
        strictErrorMessage(
          e,
          "L’ajout n’a pas pu être terminé. Les photos déjà déposées sont conservées.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  const photos = published.data ?? [];
  return (
    <form
      className="portal-form portal-photo-editor"
      onSubmit={(event) => void submit(event)}
      noValidate
    >
      <p className="portal-lead">
        Ajoutez, remplacez ou retirez des photos. Seuls les ajouts et les
        nouvelles photos de remplacement sont relus par l’office.
      </p>
      <p className="muted">
        {photos.length} photo{photos.length > 1 ? "s" : ""} sur 4 conseillées ·
        À l’horizontale, en plein jour.
      </p>
      {published.isError ? (
        <p className="notice" role="alert">
          Vos photos n’ont pas pu être chargées.{" "}
          <button
            className="ghost-button"
            type="button"
            onClick={() => void published.refetch()}
          >
            Réessayer
          </button>
        </p>
      ) : published.isLoading ? (
        <p role="status">Chargement de vos photos…</p>
      ) : null}
      <fieldset className="portal-fieldset" disabled={busy}>
        <SortableGrid
          items={photos}
          getId={(photo) => photo.id}
          className="portal-photo-editor__grid"
          onReorder={(next) => void reorder(next)}
          renderItem={(photo, index, handle) => (
            <article className="portal-photo-editor__tile">
              <img src={photo.url} alt={photo.title || `Photo ${index + 1}`} />
              <div className="portal-photo-editor__labels">
                {photo.isMain ? (
                  <span className="badge badge--ok">Principale</span>
                ) : null}
                <span className="muted">En ligne</span>
              </div>
              <div className="portal-photo-editor__actions">
                {handle}
                <button
                  className="ghost-button"
                  type="button"
                  disabled={index === 0 || busy}
                  aria-label={`Monter la photo ${index + 1}`}
                  onClick={() => {
                    const next = [...photos];
                    [next[index - 1], next[index]] = [
                      next[index],
                      next[index - 1],
                    ];
                    void reorder(next);
                  }}
                >
                  <ArrowUp size={18} aria-hidden />
                </button>
                <button
                  className="ghost-button"
                  type="button"
                  disabled={index === photos.length - 1 || busy}
                  aria-label={`Descendre la photo ${index + 1}`}
                  onClick={() => {
                    const next = [...photos];
                    [next[index + 1], next[index]] = [
                      next[index],
                      next[index + 1],
                    ];
                    void reorder(next);
                  }}
                >
                  <ArrowDown size={18} aria-hidden />
                </button>
              </div>
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  replaceTarget.current = photo.id;
                  replaceInput.current?.click();
                }}
              >
                Remplacer<span className="sr-only"> la photo {index + 1}</span>
              </button>
              <button
                className="ghost-button"
                type="button"
                onClick={() => void withdraw(photo.id)}
              >
                <Trash2 size={18} aria-hidden />
                Retirer<span className="sr-only"> la photo {index + 1}</span>
              </button>
            </article>
          )}
        />
        <div className="portal-photo-editor__grid">
          {additions.map((item) => (
            <article className="portal-photo-editor__tile" key={item.id}>
              <PortalPrivatePhoto
                documentId={item.portalUploadId!}
                title={item.title}
              />
              <span className="badge">
                {rubric.state === "pending" && sentIds.has(item.portalUploadId!)
                  ? "En vérification"
                  : "Nouvelle · à envoyer"}
              </span>
              {item.portalReplaceMediaId ? (
                <p className="muted">Remplacement proposé</p>
              ) : null}
              {rubric.state === "pending" &&
              sentIds.has(item.portalUploadId!) ? null : (
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() =>
                    setForm((previous) => ({
                      ...previous,
                      additions: previous.additions.filter(
                        (photo) => photo.id !== item.id,
                      ),
                    }))
                  }
                >
                  <X size={18} aria-hidden />
                  Annuler
                </button>
              )}
            </article>
          ))}
          {form.files.map((entry) => (
            <article className="portal-photo-editor__tile" key={entry.key}>
              <PortalLocalPhoto file={entry.file} name={entry.name} />
              <span className="badge">Nouvelle · à déposer</span>
              {entry.replaceId ? (
                <p className="muted">Remplacement proposé</p>
              ) : null}
              <button
                className="ghost-button"
                type="button"
                onClick={() =>
                  setForm((previous) => ({
                    ...previous,
                    files: previous.files.filter(
                      (file) => file.key !== entry.key,
                    ),
                  }))
                }
              >
                <X size={18} aria-hidden />
                Annuler<span className="sr-only"> {entry.name}</span>
              </button>
            </article>
          ))}
        </div>
        <input
          ref={addInput}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          aria-label="Choisir des photos"
          onChange={(event) => {
            choose(event.target.files, null);
            event.target.value = "";
          }}
        />
        <input
          ref={replaceInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          aria-label="Choisir une photo de remplacement"
          onChange={(event) => {
            choose(event.target.files, replaceTarget.current);
            event.target.value = "";
          }}
        />
        <button
          className="portal-photo-dropzone"
          type="button"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            if (!busy) choose(event.dataTransfer.files, null);
          }}
          onClick={() => addInput.current?.click()}
        >
          <ImagePlus size={28} aria-hidden />
          <strong>Ajouter des photos</strong>
          <span>
            Glissez-les ici, ou choisissez-les sur votre ordinateur ou votre
            téléphone.
          </span>
          <span className="muted">JPG, PNG ou WebP · 20 Mo par photo</span>
        </button>
        <PortalChoice
          type="checkbox"
          checked={form.rights}
          onChange={(rights) =>
            setForm((previous) => ({ ...previous, rights }))
          }
        >
          Ces photos sont les miennes, ou leur auteur m’autorise à les diffuser.
        </PortalChoice>
        <PortalField id="portal-photo-credit" label="Crédit photo (facultatif)">
          {(props) => (
            <input
              {...props}
              maxLength={200}
              value={form.credit}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  credit: event.target.value,
                }))
              }
            />
          )}
        </PortalField>
      </fieldset>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      {status ? (
        <p className="notice" role="status">
          {status}
        </p>
      ) : null}
      <PortalRubricActions
        onCancel={onCancel}
        busy={busy}
        note="Les retraits et l’ordre sont enregistrés immédiatement. Les ajouts restent privés jusqu’à la relecture de l’office, après votre envoi depuis la fiche."
      />
    </form>
  );
}
