"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Paperclip, Send, X } from "lucide-react";
import {
  confirmNavigation,
  registerNavigationGuard,
} from "../../lib/navigation-guard";
import { strictErrorMessage } from "../../lib/strict-error-message";
import {
  PORTAL_MESSAGE_SUBJECTS,
  listMyPortalMessages,
  sendPortalMessage,
  uploadPortalMessageAttachment,
  type PortalMessageAttachment,
  type PortalMessageSubject,
} from "../../services/portal-message";
import { PortalMessageDocuments } from "./PortalMessageDocuments";

export function PortalWriteOffice({
  objectId,
  ficheName,
  email,
  initialSubject,
}: {
  objectId: string;
  ficheName: string;
  email: string;
  initialSubject?: string | null;
}) {
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState<PortalMessageSubject | "">(() =>
    PORTAL_MESSAGE_SUBJECTS.some((s) => s.code === initialSubject)
      ? (initialSubject as PortalMessageSubject)
      : "",
  );
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState(email);
  const [editingEmail, setEditingEmail] = useState(false);
  const [attachments, setAttachments] = useState<PortalMessageAttachment[]>([]);
  const [clientId, setClientId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false);
  const [error, setError] = useState(""),
    [sent, setSent] = useState(false);
  const selected = PORTAL_MESSAGE_SUBJECTS.find((s) => s.code === subject);
  const dirty = Boolean(body.trim() || attachments.length);
  const sentNotice=useRef<HTMLParagraphElement>(null);
  useEffect(()=>{if(sent)sentNotice.current?.focus();},[sent]);
  const history = useQuery({
    queryKey: ["portal-messages", objectId],
    queryFn: () => listMyPortalMessages(objectId),
  });
  useEffect(
    () =>
      registerNavigationGuard(
        () =>
          !busy &&
          !uploading &&
          (!dirty || window.confirm("Quitter sans envoyer ce message ?")),
      ),
    [dirty, busy, uploading],
  );
  useEffect(() => {
    if (!dirty) return;
    const prevent = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  async function upload(file?: File) {
    if (!file) return;
    if (attachments.length >= 3) {
      setError("Vous pouvez joindre trois fichiers au maximum.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Le fichier dépasse 5 Mo. Choisissez un fichier plus petit.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const added = await uploadPortalMessageAttachment(objectId, file);
      setAttachments((old) => [...old, added]);
    } catch (e) {
      setError(
        strictErrorMessage(e, "Le fichier n’a pas pu être joint. Réessayez."),
      );
    } finally {
      setUploading(false);
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject || busy || uploading) return;
    setBusy(true);
    setError("");
    setSent(false);
    try {
      await sendPortalMessage({
        objectId,
        subject,
        body: body.trim(),
        attachments: attachments.map((a) => a.id),
        replyTo,
        clientId,
      });
      setBody("");
      setAttachments([]);
      setSubject("");
      setClientId(crypto.randomUUID());
      setSent(true);
      await queryClient.invalidateQueries({
        queryKey: ["portal-messages", objectId],
      });
    } catch (e) {
      setError(
        strictErrorMessage(
          e,
          "Le message n’a pas pu être envoyé. Votre saisie est conservée.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  const back = `/espace/fiches/${encodeURIComponent(objectId)}`;
  return (
    <div className="portal-write-office">
      <aside className="portal-fiche-rail">
        <Link
          className="ghost-button"
          href={back}
          onClick={(e) => {
            if (!confirmNavigation()) e.preventDefault();
          }}
        >
          <ArrowLeft size={18} aria-hidden />
          {ficheName}
        </Link>
        <p className="eyebrow">Espace partenaire</p>
        <h2>Écrire à l’office</h2>
      </aside>
      <div className="portal-write-office__main">
        <header className="portal-rubric-head">
          <h1 className="portal-h1">Écrire à l’office</h1>
          <p className="muted">
            Une demande, une bonne nouvelle, une question : l’office vous répond
            par e-mail.
          </p>
        </header>
        {sent ? (
          <p className="notice notice--success" role="status" ref={sentNotice} tabIndex={-1}>
            <Check size={20} aria-hidden /> Votre message a bien été envoyé à
            l’office.
          </p>
        ) : null}
        <form
          className="portal-card portal-write-form"
          onSubmit={(e) => void submit(e)}
        >
          <fieldset
            disabled={busy || uploading}
            className="portal-write-form__fields"
          >
            <legend>C’est à propos de…</legend>
            {["Votre fiche", "Une bonne nouvelle", "Un coup de main"].map(
              (group) => (
                <div className="portal-write-subjects" key={group}>
                  <p className="eyebrow">{group}</p>
                  {PORTAL_MESSAGE_SUBJECTS.filter((s) => s.group === group).map(
                    (s) => (
                      <label className="portal-write-subject" key={s.code}>
                        <input
                          type="radio"
                          name="portal-subject"
                          value={s.code}
                          checked={s.code === subject}
                          onChange={() => {
                            setSubject(s.code);
                            setSent(false);
                          }}
                          required
                        />
                        <span>{s.label}</span>
                      </label>
                    ),
                  )}
                </div>
              ),
            )}
            <div className="auth-field">
              <label htmlFor="portal-office-body">Votre message</label>
              <textarea
                className="portal-input"
                id="portal-office-body"
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);
                  setSent(false);
                }}
                rows={6}
                required
                maxLength={4000}
                placeholder={selected?.example}
                aria-describedby="portal-message-count"
              />
              <span className="muted" id="portal-message-count">
                {body.length} / 4 000 caractères
              </span>
            </div>
            {selected && "attachment" in selected ? (
              <div className="auth-field">
                <label className="portal-file-button">
                  <Paperclip size={18} aria-hidden />
                  {selected.attachment}
                  <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    aria-label={selected.attachment}
                    onChange={(e) => {
                      void upload(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                    disabled={attachments.length >= 3}
                  />
                </label>
                <small className="muted">
                  PDF ou image, 5 Mo par fichier, trois fichiers au maximum.
                </small>
              </div>
            ) : null}
            {attachments.length ? (
              <ul className="portal-message-attachments">
                {attachments.map((a) => (
                  <li key={a.id}>
                    <Paperclip size={16} aria-hidden />
                    <span>{a.title}</span>
                    <button
                      type="button"
                      className="ghost-button"
                      aria-label={`Retirer ${a.title} du message`}
                      onClick={() =>
                        setAttachments((old) =>
                          old.filter((x) => x.id !== a.id),
                        )
                      }
                    >
                      <X size={18} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="portal-message-reply">
              <span className="muted">Réponse envoyée à</span>
              {editingEmail ? (
                <label className="auth-field">
                  Adresse e-mail de réponse
                  <input
                    className="portal-input"
                    type="email"
                    required
                    value={replyTo}
                    maxLength={254}
                    onChange={(e) => setReplyTo(e.target.value)}
                  />
                </label>
              ) : (
                <>
                  <strong>{replyTo || "À préciser"}</strong>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => setEditingEmail(true)}
                  >
                    Modifier
                  </button>
                </>
              )}
            </div>
          </fieldset>
          {error ? (
            <p role="alert" className="notice notice--error">
              {error}
            </p>
          ) : null}
          {uploading ? <p role="status">Ajout du fichier…</p> : null}
          <button
            className="primary-button"
            type="submit"
            disabled={!subject || !body.trim() || !replyTo || busy || uploading}
          >
            <Send size={18} aria-hidden />
            {busy ? "Envoi en cours…" : "Envoyer le message"}
          </button>
          <p className="muted">
            Pour changer vous-même une information, passez plutôt par{" "}
            <Link
              href={back}
              onClick={(e) => {
                if (!confirmNavigation()) e.preventDefault();
              }}
            >
              votre fiche
            </Link>
            .
          </p>
        </form>
        <section className="portal-card">
          <h2>Vos échanges avec l’office</h2>
          {history.isError ? (
            <p className="notice" role="alert">
              Vos échanges n’ont pas pu être chargés.{" "}
              <button
                type="button"
                className="ghost-button"
                onClick={() => void history.refetch()}
              >
                Réessayer
              </button>
            </p>
          ) : history.isLoading ? (
            <p role="status">Chargement de vos échanges…</p>
          ) : !history.data?.length ? (
            <p className="muted">
              Aucun message pour l’instant. Vos messages et les réponses de
              l’office s’afficheront ici.
            </p>
          ) : (
            <ol className="portal-message-history">
              {history.data.map((message) => (
                <li key={message.id}>
                  <div>
                    <strong>{message.subject}</strong>
                    <time dateTime={message.createdAt}>
                      {new Date(message.createdAt).toLocaleDateString("fr-FR")}
                    </time>
                  </div>
                  <p className="portal-message-body">{message.body}</p>
                  <PortalMessageDocuments interactionId={message.id} />
                  {message.replies.map((reply) => (
                    <blockquote key={reply.id}>
                      <strong>L’office vous répond</strong>
                      <p className="portal-message-body">{reply.body}</p>
                    </blockquote>
                  ))}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
