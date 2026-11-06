"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, ListOrdered, MessageSquare, Star, X } from "lucide-react";
import { Modal } from "../../../components/common/Modal";
import { useRubricForm, PortalChoice, PortalField, PortalRubricActions } from "./rubric-kit";
import {
  getPortalPhotoWorkspace, updatePortalPhotoTexts, withdrawPortalPhoto, reorderPortalPhotos,
  uploadPortalPhoto, cancelPortalPhotoUpload, portalPhotoDraft, mergePortalPublishedPhotos,
  analyzePortalPhoto, getPortalPhotoAnalysis, appealPortalPhotoAnalysis, appealPortalPhotoReview,
  isPublishedPortalPhoto, type PortalPhotoWorkspace,
} from "../../../services/portal-photos";
import type { ObjectWorkspaceMediaItem } from "../../../services/object-workspace-parser";
import type { PortalRubricFormProps } from "./types";
import { useSessionStore } from "../../../store/session-store";
import { strictErrorMessage } from "../../../lib/strict-error-message";
import { PortalPhotoOrder } from "./PortalPhotoOrder";
import { AlbumPhotoImage, PortalPhotoDetails } from "./PortalPhotoDetails";
import { albumPhotoStatus, matchesSavedPhotoOrder, photoAppealId, photoName, photoTextErrors, type AlbumPhoto, type PhotoTextSnapshot } from "./portal-photo-album";

interface QueuedPhoto {
  key: string; name: string; title?: string; description?: string;
  file: File | null; replaceId: string | null;
  uploadedId?: string; textSnapshot?: PhotoTextSnapshot;
}
interface PhotoForm { additions: ObjectWorkspaceMediaItem[]; files: QueuedPhoto[]; rights: boolean; credit: string }

export function PhotosEditorRubric({ editor, rubric, formKey, formCache, onDone, onCancel, onDirtyChange, onBusyChange }: PortalRubricFormProps) {
  const userId = useSessionStore((state) => state.userId), queryClient = useQueryClient();
  const blocked = Boolean(rubric.readOnlyReason || rubric.state === "unavailable" || editor.baseline.media.unavailableReason);
  const queryKey = ["portal-photo-workspace", userId, editor.objectId];
  const workspace = useQuery({ queryKey, queryFn: () => getPortalPhotoWorkspace(editor.objectId), refetchOnWindowFocus: true, enabled: !blocked });
  const errorCode = workspace.error && typeof workspace.error === "object" && "code" in workspace.error ? workspace.error.code : null;
  const readScope = JSON.stringify([userId, editor.objectId]);
  const denial = useRef({ scope: readScope, denied: false });
  if (denial.current.scope !== readScope) denial.current = { scope: readScope, denied: false };
  if (errorCode === "42501") denial.current.denied = true;
  if (workspace.isSuccess && !workspace.isFetching) denial.current.denied = false;
  const legacyReadOnly = !blocked && !denial.current.denied && errorCode === "PGRST202";
  const data = blocked || denial.current.denied || legacyReadOnly ? undefined : workspace.data;
  const mergeSaved = editor.mergeSavedModule;
  useEffect(() => {
    if (data) mergeSaved("media", (current) => mergePortalPublishedPhotos(current, data.published));
  }, [data, mergeSaved]);
  const { form, setForm, dirty } = useRubricForm<PhotoForm>(formKey, () => ({
    additions: editor.draft.media.objectItems.filter((item) => item.portalUploadId), files: [], rights: false,
    credit: editor.draft.media.objectItems.find((item) => item.portalUploadId)?.credit ?? "",
  }), formCache);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [status, setStatus] = useState("");
  const [adding, setAdding] = useState(false), [detail, setDetail] = useState<{ key: string; appeal?: boolean } | null>(null);
  const [metadataDirty, setMetadataDirty] = useState(false);
  const [order, setOrder] = useState<{ baseline: string; ids: string[]; snapshot: PortalPhotoWorkspace["orderSnapshot"]; attempted: boolean } | null>(null);
  const addInput = useRef<HTMLInputElement>(null), replaceInput = useRef<HTMLInputElement>(null), replaceTarget = useRef<string | null>(null);
  const orderButton = useRef<HTMLButtonElement>(null), stock = useRef<HTMLSpanElement>(null);
  const analysisIntent = useRef(new Map<string, string>());
  const writesEnabled = data?.writesEnabled === true && !workspace.isError;
  const writableRef = useRef(writesEnabled);
  writableRef.current = writesEnabled;
  const legacyPhotos: AlbumPhoto[] = legacyReadOnly ? editor.baseline.media.objectItems
    .filter((photo) => isPublishedPortalPhoto(photo) && /^https?:\/\//i.test(photo.url))
    .map((photo) => ({ key: photo.id, mediaId: photo.id, documentId: null, title: photo.title,
      description: photo.description, credit: photo.credit, url: photo.url, status: "online" as const,
      replaceMediaId: null, position: Number(photo.position) || 0, isMain: photo.isMain,
      canEdit: false, canCancel: false })) : [];
  const online: AlbumPhoto[] = (legacyReadOnly ? legacyPhotos : (data?.published ?? []).map<AlbumPhoto>((photo) => ({
    key: photo.id, mediaId: photo.id, documentId: photo.portalDocumentId, title: photo.title,
    description: photo.description, credit: photo.credit, url: photo.url, status: "online",
    replaceMediaId: null, position: photo.position, isMain: photo.isMain, textSnapshot: photo.textSnapshot, canEdit: writesEnabled, canCancel: false,
  }))).sort((a, b) => Number(b.isMain) - Number(a.isMain));
  const queueDocuments = new Set(form.files.flatMap((entry) => entry.uploadedId ? [entry.uploadedId] : []));
  const publishedDocuments = new Set((data?.published ?? []).flatMap((photo) => photo.portalDocumentId ? [photo.portalDocumentId] : []));
  const proposals: AlbumPhoto[] = (data?.proposals ?? []).filter((photo) => !queueDocuments.has(photo.documentId) && !publishedDocuments.has(photo.documentId)).map((photo, index) => ({
    key: `proposal:${photo.documentId}`, mediaId: null, documentId: photo.documentId,
    title: photo.title, description: photo.description, credit: "", status: photo.status,
    replaceMediaId: photo.replaceMediaId, position: index, createdAt: photo.submittedAt,
    reviewNote: photo.reviewNote, textSnapshot: photo.textSnapshot, analysis: photo.analysis, changeId: photo.changeId, reviewAppeal: photo.reviewAppeal,
    canEdit: writesEnabled, canCancel: writesEnabled && photo.status === "draft", canAppeal: writesEnabled && photo.canAppeal,
  }));
  const knownDocuments = new Set([...proposals.map((photo) => photo.documentId), ...queueDocuments, ...publishedDocuments]);
  const localAdditions: AlbumPhoto[] = form.additions.filter((item) => item.portalUploadId && !knownDocuments.has(item.portalUploadId)).map((item, index) => ({
    key: `proposal:${item.portalUploadId}`, mediaId: null, documentId: item.portalUploadId!,
    title: item.title, description: item.description, credit: item.credit,
    status: "draft", replaceMediaId: item.portalReplaceMediaId ?? null, position: index, canEdit: false, canCancel: false,
  }));
  const queued: AlbumPhoto[] = form.files.map((entry, index) => ({
    key: `queued:${entry.key}`, mediaId: null, documentId: entry.uploadedId ?? null,
    title: entry.title ?? entry.name, description: entry.description ?? "", credit: form.credit,
    file: entry.file, status: "draft", replaceMediaId: entry.replaceId, position: index, canEdit: writesEnabled, canCancel: writesEnabled,
  }));
  const following = data ? [...proposals, ...localAdditions, ...queued] : [];
  const selected = detail ? [...online, ...following].find((photo) => photo.key === detail.key) : null;
  const replacement = selected?.mediaId ? following.find((photo) => photo.replaceMediaId === selected.mediaId && photo.status !== "refused") : undefined;
  const limit = data?.capacity.limit ?? 20;
  const queuedSlots = form.files.filter((entry) => !entry.uploadedId && !(entry.replaceId && online.some((photo) => photo.mediaId === entry.replaceId))).length;
  const used = (data?.capacity.used ?? online.length) + queuedSlots;
  const conflict = Boolean(order && order.baseline !== JSON.stringify(data?.orderSnapshot));
  const ordered = order?.ids.flatMap((id) => online.find((photo) => photo.key === id) ?? []) ?? [];
  useEffect(() => onDirtyChange(dirty || Boolean(order) || metadataDirty), [dirty, order, metadataDirty, onDirtyChange]);
  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange]);
  function focusPhoto(key: string) {
    requestAnimationFrame(() => {
      const card = document.getElementById(`details-${key}`);
      (card ?? stock.current ?? document.getElementById("portal-photo-online-title"))?.focus();
    });
  }
  function closeDetails(key: string) { setDetail(null); focusPhoto(key); }
  function saveWorkspace(next: Awaited<ReturnType<typeof getPortalPhotoWorkspace>>) {
    writableRef.current = next.writesEnabled;
    queryClient.setQueryData(queryKey, next);
    mergeSaved("media", (current) => mergePortalPublishedPhotos(current, next.published));
  }
  async function refresh() { const next = await getPortalPhotoWorkspace(editor.objectId); saveWorkspace(next); return next; }
  function assertWritable() {
    if (!writableRef.current) throw new Error("La galerie est actuellement en consultation. Votre saisie est conservée.");
  }
  async function write<T>(action: () => Promise<T>): Promise<T> {
    assertWritable();
    if (busy) throw new Error("Une opération est déjà en cours.");
    setBusy(true); setError("");
    try { return await action(); } finally { setBusy(false); }
  }
  function choose(files: FileList | null, replaceId: string | null) {
    if (!files?.length || busy || order || !data || !writesEnabled) return;
    if ((!replaceId && used + files.length > limit) || (replaceId && files.length !== 1)) {
      setError(`Votre galerie peut contenir ${limit} photos. Retirez une photo ou choisissez un remplacement.`); return;
    }
    if (replaceId && following.some((photo) => photo.replaceMediaId === replaceId && photo.status !== "refused")) {
      setError("Un remplacement est déjà préparé ou en attente pour cette photo."); return;
    }
    setForm((previous) => ({ ...previous, files: [...previous.files, ...Array.from(files).map((file) => ({
      key: crypto.randomUUID(), name: file.name, title: file.name, description: "", file, replaceId,
    }))] }));
    setError(""); setDetail(null); setAdding(true);
  }
  async function cancelAddition(photo: AlbumPhoto) {
    await write(async () => {
      if (photo.documentId) await cancelPortalPhotoUpload(editor.objectId, photo.documentId);
      if (photo.documentId) mergeSaved("media", (current) => ({ ...current, objectItems: current.objectItems.filter((item) => item.portalUploadId !== photo.documentId) }));
      setForm((previous) => ({ ...previous,
        files: previous.files.filter((entry) => `queued:${entry.key}` !== photo.key && (!photo.documentId || entry.uploadedId !== photo.documentId)),
        additions: previous.additions.filter((entry) => entry.portalUploadId !== photo.documentId),
      }));
      if (photo.documentId) await refresh();
      if (photo.key.startsWith("queued:") && form.files.length === 1) setAdding(false);
      setDetail(null); setStatus("L’ajout de la photo est annulé.");
      if (detail || (adding && form.files.length === 1)) focusPhoto(photo.key);
    });
  }
  async function metadata(photo: AlbumPhoto, text: { title: string; description: string }) {
    assertWritable();
    if (photo.key.startsWith("queued:")) {
      setForm((previous) => ({ ...previous, files: previous.files.map((entry) => `queued:${entry.key}` === photo.key ? { ...entry, ...text } : entry) })); return;
    }
    await write(async () => {
      try {
        if (!photo.textSnapshot) throw new Error("Actualisez les textes de cette photo avant de les modifier.");
        saveWorkspace(await updatePortalPhotoTexts({ objectId: editor.objectId, target: photo.status === "online" ? "published" : "proposal",
          id: photo.mediaId ?? photo.documentId!, expected: photo.textSnapshot, ...text }));
        setForm((previous) => ({ ...previous, additions: previous.additions.map((item) => item.portalUploadId === photo.documentId ? { ...item, ...text } : item) }));
        setStatus("Le titre et la description sont enregistrés pour cette version de la photo.");
      } catch (e) { await refresh().catch(() => undefined); throw e; }
    });
  }
  async function withdraw(photo: AlbumPhoto) {
    await write(async () => {
      await withdrawPortalPhoto(editor.objectId, photo.mediaId!); await refresh();
      setDetail(null); setStatus("La photo est retirée de votre fiche."); requestAnimationFrame(() => stock.current?.focus());
    });
  }
  async function saveOrder() {
    if (!order || busy || conflict || !writesEnabled) return;
    const wanted = order.ids;
    const finish = () => {
      setOrder(null); setError(""); setStatus("L’ordre des photos est enregistré.");
      requestAnimationFrame(() => (orderButton.current ?? stock.current)?.focus());
    };
    setOrder((previous) => previous ? { ...previous, attempted: true } : previous);
    setBusy(true); setError("");
    try {
      assertWritable();
      await reorderPortalPhotos(editor.objectId, wanted, order.snapshot); await refresh(); finish();
    } catch (e) {
      const current = await refresh().catch(() => null);
      if (current && matchesSavedPhotoOrder(current, wanted)) { finish(); return; }
      setError(`${strictErrorMessage(e, "L’enregistrement de l’ordre n’a pas pu être confirmé.")} Votre classement est conservé.`);
    } finally { setBusy(false); }
  }
  async function analyze(photo: AlbumPhoto) {
    if (!photo.documentId) return;
    if (photo.analysis?.requestId) {
      setBusy(true);
      try { await getPortalPhotoAnalysis(photo.analysis.requestId); await refresh(); }
      finally { setBusy(false); }
      return;
    }
    await write(async () => {
      try {
        const requestId = analysisIntent.current.get(photo.documentId!) ?? crypto.randomUUID();
        analysisIntent.current.set(photo.documentId!, requestId);
        await analyzePortalPhoto({ objectId: editor.objectId, documentId: photo.documentId!, requestId });
      } finally { await refresh().catch(() => undefined); }
    });
  }
  async function appeal(photo: AlbumPhoto, body: string, clientId: string) {
    if (!photo.canAppeal) throw new Error("La décision de cette photo ne permet plus un recours depuis cet écran. Actualisez la galerie.");
    await write(async () => {
      if (photo.analysis?.requestId && photo.analysis.sourceCurrent === true && ["assessed", "unavailable", "uncertain"].includes(photo.analysis.state)) await appealPortalPhotoAnalysis({ requestId: photo.analysis.requestId, body, clientId });
      else if (photo.documentId && photo.changeId) await appealPortalPhotoReview({ objectId: editor.objectId, documentId: photo.documentId, changeId: photo.changeId, body, clientId });
      else throw new Error("La décision de cette photo ne permet pas encore un recours depuis cet écran.");
      await refresh(); setStatus("Votre demande de révision est envoyée à l’office.");
    });
  }
  function fileNeedsRebase(entry: QueuedPhoto) {
    const proposal = data?.proposals.find((photo) => photo.documentId === entry.uploadedId);
    return Boolean(proposal && entry.textSnapshot && JSON.stringify(entry.textSnapshot) !== JSON.stringify(proposal.textSnapshot)
      && (proposal.title !== (entry.title ?? entry.name) || proposal.description !== (entry.description ?? "")));
  }
  function fileTextErrors(entry: QueuedPhoto) {
    const baseline = data?.proposals.find((photo) => photo.documentId === entry.uploadedId);
    return photoTextErrors({ title: entry.title ?? entry.name, description: entry.description ?? "" }, baseline);
  }
  /** Confirmed upload IDs and text intentions survive partial failure; bytes are not resent. */
  async function prepareAndValidate() {
    if (busy || order) return;
    if (!writesEnabled) { setError("La galerie est actuellement en consultation. Votre saisie est conservée."); return; }
    setError("");
    const invalid = form.files.find((entry) => Object.keys(fileTextErrors(entry)).length);
    if (invalid) {
      setAdding(true);
      const errors = fileTextErrors(invalid);
      requestAnimationFrame(() => document.getElementById(`photo-add-${errors.title ? "title" : "description"}-${invalid.key}`)?.focus());
      return;
    }
    if (form.files.length && !form.rights) { setAdding(true); setError("Confirmez que vous avez l’autorisation de diffuser ces photos."); return; }
    if (form.files.some((entry) => !entry.uploadedId && !(entry.file instanceof File))) { setAdding(true); setError("Choisissez à nouveau les photos qui n’ont pas encore été déposées."); return; }
    if (form.files.some(fileNeedsRebase)) { setAdding(true); setError("Les textes d’un dépôt ont changé ailleurs. Vérifiez la version actuelle avant de reprendre ; votre saisie est conservée."); return; }
    try { await write(async () => {
      let prepared = [...form.additions];
      for (const entry of form.files) {
        assertWritable();
        const uploaded = entry.uploadedId ? { id: entry.uploadedId, title: entry.title ?? entry.name, width: 0, height: 0 }
          : await uploadPortalPhoto(editor.objectId, entry.file!, form.rights, entry.key, entry.replaceId);
        setForm((previous) => ({ ...previous, files: previous.files.map((file) => file.key === entry.key ? { ...file, uploadedId: uploaded.id } : file) }));
        const current = await refresh(), proposal = current.proposals.find((photo) => photo.documentId === uploaded.id);
        if (!current.writesEnabled) throw new Error("La galerie est actuellement en consultation. Votre dépôt et votre saisie sont conservés.");
        if (!proposal) throw new Error("Le dépôt est conservé, mais ses textes ne peuvent pas encore être confirmés. Actualisez avant de réessayer.");
        const expected = entry.textSnapshot ?? proposal.textSnapshot;
        setForm((previous) => ({ ...previous, files: previous.files.map((file) => file.key === entry.key ? { ...file, textSnapshot: expected } : file) }));
        const title = entry.title ?? entry.name, description = entry.description ?? "";
        if (proposal.title !== title || proposal.description !== description) {
          assertWritable();
          saveWorkspace(await updatePortalPhotoTexts({ objectId: editor.objectId, target: "proposal", id: uploaded.id, expected, title, description }));
        }
        prepared = [...prepared.filter((item) => item.portalUploadId !== uploaded.id), { ...portalPhotoDraft(uploaded, form.credit, entry.replaceId, editor.draft.media), title, description }];
        const saved = prepared;
        setForm((previous) => ({ ...previous, additions: saved, files: previous.files.filter((file) => file.key !== entry.key) }));
      }
      const live = await refresh(), publishedDocs = new Set(live.published.flatMap((photo) => photo.portalDocumentId ? [photo.portalDocumentId] : []));
      const sentDocs = new Set(live.proposals.filter((photo) => photo.status !== "draft").map((photo) => photo.documentId));
      prepared = prepared.filter((item) => item.portalUploadId && !publishedDocs.has(item.portalUploadId) && !sentDocs.has(item.portalUploadId));
      for (const proposal of live.proposals.filter((photo) => photo.status === "draft")) {
        if (!prepared.some((item) => item.portalUploadId === proposal.documentId)) prepared.push({ ...portalPhotoDraft({ id: proposal.documentId,
          title: proposal.title, width: 0, height: 0 }, form.credit, proposal.replaceMediaId, editor.draft.media), description: proposal.description });
      }
      if (prepared.length) editor.replaceModule("media", { ...editor.draft.media, objectItems: [
        ...editor.draft.media.objectItems.filter((item) => !item.portalUploadId || sentDocs.has(item.portalUploadId)), ...prepared,
      ] });
      setAdding(false); onDone();
    }); } catch (e) { setError(strictErrorMessage(e, "L’ajout n’a pas pu être terminé. Les dépôts déjà confirmés et votre saisie sont conservés.")); }
  }
  function tile(photo: AlbumPhoto, principal = false) {
    const state = albumPhotoStatus(photo), proposedReplacement = photo.status === "online" && following.some((item) => item.replaceMediaId === photo.mediaId && item.status !== "refused");
    return <li className="portal-photo-album__tile" key={photo.key}>
      <button type="button" className="portal-photo-album__open" id={`details-${photo.key}`} aria-haspopup="dialog" aria-label={`Détails de ${photoName(photo)}`}
        onClick={() => setDetail({ key: photo.key })}><span className="portal-photo-album__thumb"><AlbumPhotoImage photo={photo} interactive={false} />
          {principal ? <span className="portal-photo-album__primary"><Star size={11} aria-hidden /> Principale</span> : null}</span>
        <span className="portal-photo-album__name" title={photoName(photo)}>{photoName(photo)}</span></button>
      {state || proposedReplacement || photo.replaceMediaId ? <span className={`portal-photo-album__status portal-photo-album__status--${photo.status}`}>
        {state}{state && photo.replaceMediaId ? " · " : ""}{photo.replaceMediaId ? "Remplacement proposé" : proposedReplacement ? "Remplacement en préparation" : ""}</span> : null}
      {photo.status === "refused" && photo.canAppeal === true && !photoAppealId(photo) ? <button type="button" className="portal-photo-text-button"
        onClick={() => setDetail({ key: photo.key, appeal: true })}><MessageSquare size={14} aria-hidden /> Demander une révision</button> : null}
      {photoAppealId(photo) ? <button type="button" className="portal-photo-text-button" onClick={() => setDetail({ key: photo.key })}>
        <MessageSquare size={14} aria-hidden /> Voir ma demande</button> : null}
    </li>;
  }
  if (blocked || denial.current.denied) return <div className="portal-photo-album"><p className="notice" role="alert">
    {rubric.readOnlyReason || editor.baseline.media.unavailableReason || (denial.current.denied ? "Votre compte ne peut pas consulter les photos de cette fiche." : "Les photos de cette fiche ne sont pas disponibles.")}
  </p><button type="button" className="ghost-button" onClick={onCancel}>Retour à la fiche</button></div>;
  return <div className="portal-form portal-photo-album">
    {legacyReadOnly ? <p className="notice" role="status">La gestion de la galerie est temporairement indisponible. Vos photos déjà publiées restent consultables.</p> : null}
    {data && !writesEnabled ? <p className="notice">La galerie est actuellement en consultation.</p> : null}
    {order && !legacyReadOnly ? <PortalPhotoOrder photos={ordered.map((photo) => ({ ...photo, id: photo.mediaId!, url: photo.url! }))} busy={busy} conflict={conflict} attempted={order.attempted} writesEnabled={writesEnabled}
      onChange={(ids) => setOrder((previous) => previous ? { ...previous, ids } : previous)} onSave={() => void saveOrder()}
      onCancel={() => { setOrder(null); setError(""); requestAnimationFrame(() => (orderButton.current ?? stock.current)?.focus()); }} /> : <>
      {data ? <><p className="portal-photo-album__lead">Les ajouts sont relus par l’office.</p>
      <div className="portal-photo-album__toolbar"><div className="portal-photo-album__capacity"><span ref={stock} tabIndex={-1}><strong>{used} / {limit}</strong> places</span>
        <span>{online.length} en ligne{following.filter((photo) => photo.status === "pending").length ? ` · ${following.filter((photo) => photo.status === "pending").length} en attente` : ""}</span></div>
        <button type="button" className="primary-button" disabled={busy || !writesEnabled || used >= limit} onClick={() => addInput.current?.click()}><ImagePlus size={18} aria-hidden /> Ajouter</button></div></> : null}
      {workspace.isLoading ? <p role="status">Chargement de vos photos…</p> : null}
      {workspace.isError && !legacyReadOnly ? <p className="notice" role="alert">Vos photos n’ont pas pu être chargées. <button type="button" className="ghost-button" onClick={() => void workspace.refetch()}>Réessayer</button></p> : null}
      {data || legacyReadOnly ? <><section className="portal-photo-album__group" aria-labelledby="portal-photo-online-title"><div className="portal-photo-section-head"><div>
        <h3 id="portal-photo-online-title">En ligne <span>{online.length}</span></h3><p>{online.length && !online.some((photo) => photo.isMain)
          ? legacyReadOnly ? "Aucune photo principale n’est définie." : "Aucune photo principale n’est définie. Réorganisez les photos pour la choisir." : "La première photo est la photo principale."}</p></div>
        {data && (online.length > 1 || data.orderNeedsNormalization) ? <button ref={orderButton} type="button" className="portal-photo-text-button" disabled={busy || !writesEnabled} onClick={() => {
          setOrder({ baseline: JSON.stringify(data.orderSnapshot), ids: online.map((photo) => photo.key), snapshot: data.orderSnapshot, attempted: false }); setError("");
        }}><ListOrdered size={17} aria-hidden /> Réorganiser les photos</button> : null}</div>
        {online.length ? <ul className="portal-photo-album__grid">{online.map((photo) => tile(photo, photo.isMain === true))}</ul> :
          <p className="portal-photo-album__empty">{legacyReadOnly ? "Aucune photo publique n’a déjà été chargée sur cette fiche." : "Votre galerie n’a pas encore de photo en ligne. Ajoutez une photo pour la proposer à l’office."}</p>}</section>
        {following.length ? <section className="portal-photo-album__group portal-photo-album__group--follow" aria-labelledby="portal-photo-follow-title">
          <div className="portal-photo-section-head"><h3 id="portal-photo-follow-title">Suivi des envois <span>{following.length}</span></h3></div>
          <ul className="portal-photo-album__grid">{following.map((photo) => tile(photo))}</ul></section> : null}</> : null}
    </>}
    <input ref={addInput} type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Choisir des photos" tabIndex={-1} disabled={busy || !writesEnabled}
      onChange={(event) => { choose(event.target.files, null); event.target.value = ""; }} />
    <input ref={replaceInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Choisir une photo de remplacement" tabIndex={-1} disabled={busy || !writesEnabled}
      onChange={(event) => { choose(event.target.files, replaceTarget.current); event.target.value = ""; }} />
    {error ? <p className="field-error" role="alert">{error}</p> : null}{status ? <p className="notice" role="status">{status}</p> : null}
    {!order && writesEnabled ? <form className="portal-photo-album__validate" onSubmit={(event) => { event.preventDefault(); void prepareAndValidate(); }}>
      {form.files.length ? <button type="button" className="ghost-button" disabled={busy} onClick={() => setAdding(true)}>Préparer {form.files.length} photo{form.files.length > 1 ? "s" : ""}</button> : null}
      <PortalRubricActions onCancel={onCancel} busy={busy || workspace.isLoading || !data} note="Les textes, retraits et classements sont enregistrés directement. Validez les ajouts, puis envoyez votre fiche à l’office pour leur relecture." />
    </form> : !order || legacyReadOnly ? <button type="button" className="ghost-button" onClick={onCancel}>Retour à la fiche</button> : null}
    <Modal open={adding && !legacyReadOnly} title="Préparer vos photos" size="wide" className="portal-modal portal-photo-dialog" onOpenChange={(open) => { if (!busy) setAdding(open); }}
      footer={<><button type="button" className="ghost-button" disabled={busy} onClick={() => setAdding(false)}>Continuer plus tard</button>
        <button type="button" className="primary-button" disabled={busy || !writesEnabled} onClick={() => void prepareAndValidate()}>{busy ? "Dépôt en cours…" : "Valider les ajouts"}</button></>}>
      <div className="portal-photo-upload"><p>Les photos resteront privées jusqu’à leur validation par l’office, après l’envoi de votre fiche.</p><p className="portal-photo-caption">JPG, PNG ou WebP · 20 Mo par photo</p>
        {form.files.map((entry) => <section key={entry.key} className="portal-photo-upload__entry"><AlbumPhotoImage photo={queued.find((photo) => photo.key === `queued:${entry.key}`)!} />
          <div><h4>{entry.replaceId ? "Remplacement proposé" : "Nouvelle photo"}</h4><PortalField id={`photo-add-title-${entry.key}`} label="Titre" hint="180 caractères maximum si vous le modifiez." error={fileTextErrors(entry).title}>{(props) => <input {...props}
            value={entry.title ?? entry.name} disabled={busy || !writesEnabled} onChange={(event) => setForm((previous) => ({ ...previous, files: previous.files.map((file) => file.key === entry.key ? { ...file, title: event.target.value } : file) }))} />}</PortalField>
            <PortalField id={`photo-add-description-${entry.key}`} label="Description" hint="Elle sert aussi de texte alternatif à la photo. 5 000 caractères maximum si vous la modifiez." error={fileTextErrors(entry).description}>{(props) => <textarea {...props} rows={3}
              value={entry.description ?? ""} disabled={busy || !writesEnabled} onChange={(event) => setForm((previous) => ({ ...previous, files: previous.files.map((file) => file.key === entry.key ? { ...file, description: event.target.value } : file) }))} />}</PortalField>
            {fileNeedsRebase(entry) ? <div className="notice notice--warn"><p>Version actuelle : {data?.proposals.find((photo) => photo.documentId === entry.uploadedId)?.title || "Sans titre"} — {data?.proposals.find((photo) => photo.documentId === entry.uploadedId)?.description || "Sans description"}</p>
              <button type="button" className="ghost-button" disabled={busy} onClick={() => {
                const proposal = data?.proposals.find((photo) => photo.documentId === entry.uploadedId);
                if (proposal) setForm((previous) => ({ ...previous, files: previous.files.map((file) => file.key === entry.key ? { ...file, textSnapshot: proposal.textSnapshot } : file) }));
                setError("");
              }}>Reprendre avec cette version</button></div> : null}
            <button type="button" className="portal-photo-text-button" disabled={busy || !writesEnabled} onClick={() => void cancelAddition(queued.find((photo) => photo.key === `queued:${entry.key}`)!).catch((e) => setError(strictErrorMessage(e, "L’annulation n’a pas pu être confirmée.")))}><X size={16} aria-hidden /> Annuler cet ajout</button></div></section>)}
        <PortalChoice type="checkbox" checked={form.rights} disabled={busy || !writesEnabled} onChange={(rights) => setForm((previous) => ({ ...previous, rights }))}>Ces photos sont les miennes, ou leur auteur m’autorise à les diffuser.</PortalChoice>
        <PortalField id="portal-photo-credit" label="Crédit photo (facultatif)">{(props) => <input {...props} maxLength={200} value={form.credit} disabled={busy || !writesEnabled} onChange={(event) => setForm((previous) => ({ ...previous, credit: event.target.value }))} />}</PortalField>
        {error ? <p className="field-error" role="alert">{error}</p> : null}</div>
    </Modal>
    {selected ? <PortalPhotoDetails key={selected.key} photo={selected} replacement={replacement} principal={selected.isMain === true} publicCount={online.length}
      busy={busy} initiallyAppealing={detail?.appeal} onDirtyChange={setMetadataDirty} onClose={() => closeDetails(selected.key)} onMetadata={metadata} onWithdraw={withdraw}
      onCancelAddition={cancelAddition} onAnalyze={analyze} onAppeal={appeal} analysisEnabled={data?.analysisEnabled === true} writesEnabled={writesEnabled}
      onReplace={(photo) => { replaceTarget.current = photo.mediaId; replaceInput.current?.click(); }} /> : null}
  </div>;
}
