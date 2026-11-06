"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Clock3, Pencil, RefreshCw, Star, Trash2 } from "lucide-react";
import { Modal } from "../../../components/common/Modal";
import { ConfirmDialog } from "../../../components/common/ConfirmDialog";
import { strictErrorMessage } from "../../../lib/strict-error-message";
import { PortalField } from "./rubric-kit";
import { PortalLocalPhoto, PortalPrivatePhoto } from "./PortalPrivatePhoto";
import { albumPhotoStatus, displayPhotoDate, photoAppealId, photoAppealStatus, photoName, photoTextErrors, type AlbumPhoto } from "./portal-photo-album";

export function AlbumPhotoImage({ photo, interactive = true }: { photo: AlbumPhoto; interactive?: boolean }) {
  const title = photoName(photo);
  if (photo.url) return <img src={photo.url} alt={photo.description || title} loading="lazy" draggable={false} />;
  if (photo.documentId) return <PortalPrivatePhoto documentId={photo.documentId} title={title} description={photo.description} retry={interactive} />;
  return <PortalLocalPhoto file={photo.file ?? null} name={title} description={photo.description} />;
}

interface PhotoDetailsProps {
  photo: AlbumPhoto;
  replacement?: AlbumPhoto;
  principal: boolean;
  publicCount: number;
  busy: boolean;
  initiallyAppealing?: boolean;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onMetadata: (photo: AlbumPhoto, text: { title: string; description: string }) => Promise<void>;
  onWithdraw: (photo: AlbumPhoto) => Promise<void>;
  onReplace: (photo: AlbumPhoto) => void;
  onCancelAddition: (photo: AlbumPhoto) => Promise<void>;
  onAnalyze: (photo: AlbumPhoto) => Promise<void>;
  onAppeal: (photo: AlbumPhoto, body: string, clientId: string) => Promise<void>;
  analysisEnabled: boolean;
  writesEnabled: boolean;
}

export function PortalPhotoDetails({ photo, replacement, principal, publicCount, busy,
  initiallyAppealing = false, onClose, onDirtyChange, onMetadata, onWithdraw, onReplace,
  onCancelAddition, onAnalyze, onAppeal, analysisEnabled, writesEnabled,
}: PhotoDetailsProps) {
  const [editing, setEditing] = useState<AlbumPhoto | null>(null);
  const [text, setText] = useState({ title: "", description: "" });
  const [error, setError] = useState("");
  const [textConflict, setTextConflict] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [withdrawError, setWithdrawError] = useState("");
  const [appealing, setAppealing] = useState(initiallyAppealing);
  const [appealBody, setAppealBody] = useState("");
  const [appealId] = useState(() => crypto.randomUUID());
  const [localBusy, setLocalBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const working = busy || localBusy;
  const hasChanges = Boolean(editing) || (appealing && Boolean(appealBody));
  const textErrors: ReturnType<typeof photoTextErrors> = editing ? photoTextErrors(text, editing.key.startsWith("queued:") ? undefined : editing) : {};
  useEffect(() => { onDirtyChange(hasChanges); return () => onDirtyChange(false); }, [hasChanges, onDirtyChange]);
  useEffect(() => { if (editing) root.current?.querySelector<HTMLInputElement>("#portal-photo-title")?.focus(); }, [editing]);
  useEffect(() => { if (!writesEnabled) setConfirmWithdraw(false); }, [writesEnabled]);
  function focusEdit(key: string) {
    requestAnimationFrame(() => Array.from(root.current?.querySelectorAll<HTMLButtonElement>("[data-edit-photo]") ?? [])
      .find((button) => button.dataset.editPhoto === key)?.focus());
  }
  function cancelEdit() {
    const key = editing?.key;
    setEditing(null); setError(""); setTextConflict(false);
    if (key) focusEdit(key);
  }
  function close() {
    if (working) return;
    if (editing) { cancelEdit(); return; }
    if (appealing && appealBody) { setAppealing(false); setAppealBody(""); return; }
    onClose();
  }
  async function act(action: () => Promise<void>, kind: "metadata" | "withdraw" | "other" = "other") {
    if (working) return false;
    setLocalBusy(true);
    if (kind === "withdraw") setWithdrawError(""); else setError("");
    try { await action(); return true; }
    catch (e) {
      const message = strictErrorMessage(e, "L’opération n’a pas pu être confirmée. Votre saisie est conservée.");
      if (kind === "withdraw") setWithdrawError(message); else setError(message);
      if (kind === "metadata" && e && typeof e === "object" && "code" in e && e.code === "PT409" && "details" in e && e.details === "photo_text_conflict") setTextConflict(true);
      return false;
    }
    finally { setLocalBusy(false); }
  }
  function metadata(version: AlbumPhoto, proposed = false) {
    const versionName = photoName(version);
    if (editing?.key === version.key) return <form className="portal-photo-metadata__form" onSubmit={(event) => {
      event.preventDefault();
      if (Object.keys(textErrors).length) {
        root.current?.querySelector<HTMLElement>(textErrors.title ? "#portal-photo-title" : "#portal-photo-description")?.focus();
        return;
      }
      void act(() => onMetadata(editing, text), "metadata").then((saved) => { if (saved) { setEditing(null); focusEdit(version.key); } });
    }}>
      <h4>{proposed ? "Textes du remplacement proposé" : "Titre et description"}</h4>
      <PortalField id="portal-photo-title" label="Titre" hint="180 caractères maximum si vous le modifiez." error={textErrors.title}>{(props) => <input {...props} value={text.title}
        onChange={(event) => setText((current) => ({ ...current, title: event.target.value }))} disabled={working || !writesEnabled} />}</PortalField>
      <PortalField id="portal-photo-description" label="Description" hint="Cette description sert aussi de texte alternatif à la photo. 5 000 caractères maximum si vous la modifiez." error={textErrors.description}>
        {(props) => <textarea {...props} rows={3} value={text.description}
          onChange={(event) => setText((current) => ({ ...current, description: event.target.value }))} disabled={working || !writesEnabled} />}
      </PortalField>
      <div className="portal-photo-metadata__actions">
        <button type="button" className="ghost-button" onClick={cancelEdit} disabled={working}>Annuler</button>
        <button type="submit" className="primary-button" disabled={working || textConflict || !writesEnabled}>{working ? "Enregistrement…" : "Enregistrer"}</button>
      </div>
      {textConflict ? <div className="notice notice--warn"><p>Les textes ont changé ailleurs. Votre saisie est conservée.</p>
        <p>Version actuelle : {version.title || "Sans titre"} — {version.description || "Sans description"}</p>
        <button type="button" className="ghost-button" disabled={working} onClick={() => { setEditing(version); setTextConflict(false); setError(""); }}>Reprendre avec cette version</button>
      </div> : null}
    </form>;
    return <section className="portal-photo-metadata" aria-label={proposed ? "Textes du remplacement proposé" : "Titre et description"}>
      <div className="portal-photo-metadata__heading">
        <h4>{proposed ? versionName : "Titre et description"}</h4>
        {version.canEdit ? <button type="button" className="portal-photo-text-button" data-edit-photo={version.key}
          aria-label={`Modifier le titre et la description de ${versionName}${proposed ? ", remplacement proposé" : ""}`}
          disabled={working || Boolean(editing) || !writesEnabled} onClick={() => { setEditing(version); setText({ title: version.title, description: version.description }); setTextConflict(false); setError(""); }}>
          <Pencil size={16} aria-hidden /> Modifier
        </button> : null}
      </div>
      <p className="portal-photo-description">{version.description || "Description non renseignée."}</p>
      {version.credit ? <p className="portal-photo-caption">Crédit : {version.credit}</p> : null}
    </section>;
  }
  function analysis(version: AlbumPhoto) {
    const result = version.analysis;
    return <section className="portal-photo-analysis" aria-label={`Analyse de ${photoName(version)}`}>
      <details>
        <summary>Analyse de la photo{result?.assessment ? <span>{result.assessment.score} / 10</span> : null}</summary>
        {result?.assessment ? <>
          {result.sourceCurrent === false ? <p className="portal-photo-caption">Cette analyse porte sur une version précédente de la photo.</p> : null}
          <p>{result.assessment.summary}</p>
          {result.assessment.strengths.length ? <ul>{result.assessment.strengths.map((item, index) => <li key={index}><Check size={15} aria-hidden />{item}</li>)}</ul> : null}
          {result.assessment.issues.length ? <ul>{result.assessment.issues.map((issue, index) => <li key={index}><span>{issue.explanation} {issue.suggestion}</span></li>)}</ul> : null}
          <p className="portal-photo-caption">La note aide à améliorer la photo. L’office décide de sa publication.</p>
        </> : result?.state === "uncertain" || result?.state === "started" || result?.state === "reserved" ?
          <p>Le résultat n’est pas encore confirmé. Retrouvez cette analyse sans lancer un nouvel appel.</p> :
          <p>{analysisEnabled ? "Cette photo n’a pas encore de résultat d’analyse." : "L’analyse n’est pas disponible pour le moment. La relecture de l’office reste possible."}</p>}
        {version.documentId && ((writesEnabled && analysisEnabled) || Boolean(result?.requestId)) && !result?.assessment ? <button type="button" className="ghost-button"
          disabled={working || Boolean(editing)} onClick={() => void act(() => onAnalyze(version))}>
          {result?.requestId ? "Retrouver l’analyse" : "Analyser la photo"}
        </button> : null}
      </details>
    </section>;
  }
  const status = photo.status === "online" ? "En ligne" : albumPhotoStatus(photo);
  const date = displayPhotoDate(photo.createdAt);
  return <>
    <Modal open title={photoName(photo)} size="wide" className="portal-modal portal-photo-dialog" onOpenChange={(open) => { if (!open) close(); }}
      footer={<button type="button" className="ghost-button" onClick={close} disabled={working}>Fermer</button>}>
      <div ref={root} className="portal-photo-details" onKeyDownCapture={(event) => {
        if (event.key === "Escape" && (editing || (appealing && appealBody))) { event.preventDefault(); event.stopPropagation(); close(); }
      }}>
        <div className="portal-photo-details__hero"><AlbumPhotoImage photo={photo} />
          <div><span className={`portal-photo-state portal-photo-state--${photo.status}`}>{status}</span>
            {principal && photo.status === "online" ? <span className="portal-photo-details__primary"><Star size={14} aria-hidden /> Photo principale</span> : null}
            {date ? <p className="portal-photo-caption">{date}</p> : null}
          </div>
        </div>
        {metadata(photo)}
        {!writesEnabled ? <p className="portal-photo-caption">La galerie est actuellement en consultation. Votre saisie en cours est conservée.</p> : null}
        {photo.status === "refused" ? <section className="portal-photo-refusal"><h4>Décision de l’office</h4>
          <p>{photo.reviewNote || "L’office n’a pas retenu cette photo."}</p>
          {photoAppealId(photo) ? <div className="portal-photo-appeal-status" role="status"><p className="portal-photo-caption"><Clock3 size={15} aria-hidden /> Révision demandée. L’office vous répondra dans vos échanges.</p>
            <p className="portal-photo-caption">État de la demande : {photoAppealStatus(photo)}</p>
          </div> : null}
        </section> : null}
        {photo.status !== "online" ? analysis(photo) : null}
        {replacement ? <section className="portal-photo-replacement"><h4>Remplacement proposé</h4>
          <p className="portal-photo-caption">La photo actuelle reste en ligne jusqu’à la décision de l’office.</p>
          <div className="portal-photo-details__hero portal-photo-details__hero--replacement"><AlbumPhotoImage photo={replacement} />
            <span className={`portal-photo-state portal-photo-state--${replacement.status}`}>{albumPhotoStatus(replacement)}</span></div>
          {metadata(replacement, true)}
          {replacement.reviewNote ? <p>{replacement.reviewNote}</p> : null}
          {analysis(replacement)}
          {replacement.canCancel ? <button type="button" className="portal-photo-text-button" disabled={working || Boolean(editing)}
            onClick={() => void act(() => onCancelAddition(replacement))}>Annuler ce remplacement</button> : null}
        </section> : null}
        {appealing && photo.status === "refused" && !photoAppealId(photo) ? <form className="portal-photo-appeal" onSubmit={(event) => {
          event.preventDefault();
          if (!writesEnabled || !photo.canAppeal) { setError("Ce recours n’est plus disponible. Votre saisie est conservée."); return; }
          if (!appealBody.trim()) { setError("Expliquez votre demande de révision."); return; }
          void act(() => onAppeal(photo, appealBody.trim(), appealId)).then((saved) => { if (saved) {
            setAppealing(false); setAppealBody("");
            // The legacy modal handles Escape from its subtree. Keep focus inside
            // the live dialog when the successful submission removes the form.
            requestAnimationFrame(() => root.current?.closest<HTMLElement>('[role="dialog"]')
              ?.querySelector<HTMLButtonElement>('.app-modal__close')?.focus());
          } });
        }}><PortalField id="portal-photo-appeal-body" label="Votre demande de révision">{(props) => <textarea {...props} rows={4}
          value={appealBody} maxLength={3000} disabled={working || !writesEnabled} onChange={(event) => setAppealBody(event.target.value)} />}</PortalField>
          <div className="portal-photo-metadata__actions"><button type="button" className="ghost-button" onClick={() => { setAppealing(false); setAppealBody(""); }} disabled={working}>Annuler</button>
            <button type="submit" className="primary-button" disabled={working || !writesEnabled || !photo.canAppeal}>{working ? "Envoi…" : "Envoyer la demande"}</button></div>
        </form> : null}
        {error ? <p className="field-error" role="alert">{error}</p> : null}
        <div className="portal-photo-details__actions">
          {photo.status === "online" ? <>
            <button type="button" className="ghost-button" disabled={working || !writesEnabled || Boolean(editing) || Boolean(replacement && replacement.status !== "refused")}
              onClick={() => onReplace(photo)}><RefreshCw size={17} aria-hidden /> Remplacer la photo</button>
            <button type="button" className="portal-photo-text-button portal-photo-danger" disabled={working || !writesEnabled || Boolean(editing)}
              onClick={() => { setWithdrawError(""); setConfirmWithdraw(true); }}><Trash2 size={17} aria-hidden /> Retirer de la fiche</button>
          </> : null}
          {photo.canCancel ? <button type="button" className="ghost-button" disabled={working || Boolean(editing)}
            onClick={() => void act(() => onCancelAddition(photo))}>Annuler cet ajout</button> : null}
          {photo.status === "refused" && photo.canAppeal === true && !photoAppealId(photo) && !appealing ? <button type="button" className="portal-photo-text-button"
            disabled={working || !writesEnabled || Boolean(editing)} onClick={() => setAppealing(true)}>Demander une révision</button> : null}
        </div>
      </div>
    </Modal>
    <ConfirmDialog open={confirmWithdraw} title="Retirer cette photo ?" className="portal-modal" tone="danger"
      message={<>{`« ${photoName(photo)} » ne sera plus visible sur votre fiche. `}{principal ? publicCount > 1 ? "La première autre photo en ligne deviendra principale. " : "Votre galerie n’aura plus de photo principale. " : ""}{replacement ? "Le remplacement proposé sera conservé avec ses propres textes." : "Le fichier n’est pas supprimé."}
        {withdrawError ? <><br /><span className="field-error" role="alert">{withdrawError}</span></> : null}</>}
      confirmLabel="Retirer de la fiche" busy={working} onCancel={() => { if (!working) { setConfirmWithdraw(false); setWithdrawError(""); } }}
      onConfirm={() => { if (!writesEnabled) { setWithdrawError("La galerie est actuellement en consultation."); return; } void act(() => onWithdraw(photo), "withdraw").then((saved) => { if (saved) setConfirmWithdraw(false); }); }} />
  </>;
}
