"use client";
import { useEffect, useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import { getPortalPhotoPreview } from "../../../services/portal-photos";

export function PortalPrivatePhoto({
  documentId,
  title,
}: {
  documentId: string;
  title: string;
}) {
  const [url, setUrl] = useState(""),
    [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setUrl("");
    void getPortalPhotoPreview(documentId)
      .then((value) => {
        if (!cancelled) setUrl(value);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [documentId, attempt]);
  if (failed)
    return (
      <div className="portal-photo-placeholder">
        <ImageIcon aria-hidden />
        <p>Aperçu indisponible.</p>
        <button
          className="ghost-button"
          type="button"
          onClick={() => setAttempt((a) => a + 1)}
        >
          Réessayer
        </button>
      </div>
    );
  return url ? (
    <img
      src={url}
      alt={title}
      onError={() => {
        setUrl("");
        setFailed(true);
      }}
    />
  ) : (
    <div className="portal-photo-placeholder" role="status">
      Chargement de la photo…
    </div>
  );
}

export function PortalLocalPhoto({
  file,
  name,
}: {
  file: File | null;
  name: string;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!(file instanceof File)) return;
    const value = URL.createObjectURL(file);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [file]);
  return url ? (
    <img src={url} alt={name} />
  ) : (
    <div className="portal-photo-placeholder">
      <ImageIcon aria-hidden />
      <p>Choisissez à nouveau {name}.</p>
    </div>
  );
}
