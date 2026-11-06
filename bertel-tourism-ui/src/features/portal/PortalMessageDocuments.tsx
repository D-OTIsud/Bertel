"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Image as ImageIcon, Paperclip } from "lucide-react";
import {
  getPortalMessageDocumentUrl,
  listPortalMessageDocuments,
  type PortalMessagePhotoReview,
} from "../../services/portal-message";
import { getPortalPhotoPreview } from "../../services/portal-photos";

/** Reuse attachment preparation: the preview route rechecks access on every request. */
function PhotoReviewDocument({ photo }: { photo: PortalMessagePhotoReview }) {
  const [link, setLink] = useState<{ url: string; expires: number } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function prepare() {
    if (busy) return;
    setBusy(true); setError(""); setLink(null);
    try {
      const url = await getPortalPhotoPreview(photo.documentId);
      setLink({ url, expires: Date.now() + 100_000 });
    } catch { setError("La photo n’a pas pu être ouverte. Votre accès sera revérifié au prochain essai."); }
    finally { setBusy(false); }
  }
  const suffix = photo.title ? ` : ${photo.title}` : "";
  return <section aria-label="Révision photo">
    <span className="muted">Révision photo{photo.title ? ` · ${photo.title}` : ""}</span>{" "}
    {link && link.expires > Date.now() ? <a className="ghost-button" aria-label={`Ouvrir la photo${suffix}`} href={link.url} target="_blank" rel="noopener noreferrer"
      onClick={(event) => { if (link.expires <= Date.now()) { event.preventDefault(); void prepare(); } }}>
      <ImageIcon size={16} aria-hidden /> Ouvrir la photo
    </a> : <button className="ghost-button" type="button" disabled={busy} aria-label={busy ? "Préparation de la photo…" : `Préparer l’aperçu${suffix}`}
      onClick={() => void prepare()}><ImageIcon size={16} aria-hidden />{busy ? "Préparation…" : "Préparer l’aperçu"}</button>}
    {link && link.expires > Date.now() ? <span className="sr-only" role="status">L’aperçu est prêt. Ouvrez la photo dans un nouvel onglet.</span> : null}
    {error ? <p role="alert">{error} <button className="ghost-button" type="button" onClick={() => void prepare()} disabled={busy}>Réessayer</button></p> : null}
  </section>;
}

/** Shared private attachment reader: no storage URL or signing key in the browser. */
export function PortalMessageDocuments({
  interactionId,
}: {
  interactionId: string;
}) {
  const docs = useQuery({
    queryKey: ["portal-message-documents", interactionId],
    queryFn: () => listPortalMessageDocuments(interactionId),
    staleTime: 60_000,
  });
  const [link, setLink] = useState<{
      id: string;
      url: string;
      expires: number;
    } | null>(null),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  async function prepare(id: string) {
    setBusy(id);
    setError("");
    try {
      const url = await getPortalMessageDocumentUrl(id);
      setLink({ id, url, expires: Date.now() + 100_000 });
    } catch {
      setError("La pièce jointe n’a pas pu être ouverte. Réessayez.");
    } finally {
      setBusy("");
    }
  }
  if (docs.isError)
    return (
      <p className="notice" role="alert">
        Les pièces jointes n’ont pas pu être chargées.{" "}
        <button
          className="ghost-button"
          onClick={() => void docs.refetch()}
          type="button"
        >
          Réessayer
        </button>
      </p>
    );
  if (!docs.data) return null;
  return (
    <div className="portal-message-documents">
      {docs.data.photoReview ? <PhotoReviewDocument key={`${interactionId}:${docs.data.photoReview.documentId}`} photo={docs.data.photoReview} /> : null}
      {docs.data.replyTo?<p className="muted">Adresse de réponse : <a href={`mailto:${docs.data.replyTo}`}>{docs.data.replyTo}</a></p>:null}
      {docs.data.documents.map((doc) =>
        link?.id === doc.id && link.expires > Date.now() ? (
          <a
            className="ghost-button"
            key={doc.id}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={event=>{if(link.expires<=Date.now()){event.preventDefault();void prepare(doc.id);}}}
          >
            <Paperclip size={16} aria-hidden />
            Ouvrir {doc.title}
          </a>
        ) : (
          <button
            className="ghost-button"
            type="button"
            disabled={Boolean(busy)}
            key={doc.id}
            onClick={() => void prepare(doc.id)}
          >
            <Paperclip size={16} aria-hidden />
            {busy === doc.id ? "Préparation…" : doc.title}
          </button>
        ),
      )}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
