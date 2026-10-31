"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Paperclip } from "lucide-react";
import {
  getPortalMessageDocumentUrl,
  listPortalMessageDocuments,
} from "../../services/portal-message";

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
