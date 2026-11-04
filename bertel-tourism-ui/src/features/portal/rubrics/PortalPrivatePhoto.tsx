"use client";
import { useEffect, useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import { getPortalPhotoPreview } from "../../../services/portal-photos";

export function PortalPrivatePhoto({
  documentId,
  title,
  description,
  retry = true,
}: {
  documentId: string;
  title: string;
  description?: string;
  /** Album tiles are already native buttons; their preview cannot contain another. */
  retry?: boolean;
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
      <span className="portal-photo-placeholder">
        <ImageIcon aria-hidden />
        <span>Aperçu indisponible.</span>
        {retry ? <button
          className="ghost-button"
          type="button"
          onClick={() => setAttempt((a) => a + 1)}
        >
          Réessayer
        </button> : null}
      </span>
    );
  return url ? (
    <img
      src={url}
      alt={description || title}
      onError={() => {
        setUrl("");
        setFailed(true);
      }}
    />
  ) : (
    <span className="portal-photo-placeholder" role="status">
      Chargement de la photo…
    </span>
  );
}

export function PortalLocalPhoto({
  file,
  name,
  description,
}: {
  file: File | null;
  name: string;
  description?: string;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!(file instanceof File)) return;
    const value = URL.createObjectURL(file);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [file]);
  return url ? (
    <img src={url} alt={description || name} />
  ) : (
    <span className="portal-photo-placeholder">
      <ImageIcon aria-hidden />
      <span>Choisissez à nouveau {name}.</span>
    </span>
  );
}
