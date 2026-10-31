import { getApiClient } from "../lib/supabase";
import { apiError } from "./api-error";

export const PORTAL_MESSAGE_SUBJECTS = [
  {
    group: "Votre fiche",
    code: "correction",
    label: "Une erreur ou une modification",
    example:
      "Par exemple : notre adresse a changé, ou notre nom commercial change le mois prochain.",
  },
  {
    group: "Votre fiche",
    code: "fermeture",
    label: "Une fermeture temporaire",
    example: "Par exemple : fermé pour travaux du 3 au 17 février.",
  },
  {
    group: "Une bonne nouvelle",
    code: "label",
    label: "Un label ou un classement",
    example:
      "Par exemple : nous avons obtenu le label Tourisme & Handicap en septembre.",
    attachment: "Joindre le certificat (facultatif)",
  },
  {
    group: "Une bonne nouvelle",
    code: "evenement",
    label: "Un événement ou une nouveauté",
    example:
      "Par exemple : soirée concert tous les vendredis à partir de novembre.",
    attachment: "Joindre une affiche ou une photo (facultatif)",
  },
  {
    group: "Un coup de main",
    code: "conseil",
    label: "Des conseils",
    example: "Par exemple : comment rendre mes photos plus attirantes ?",
  },
  {
    group: "Un coup de main",
    code: "promo",
    label: "Me faire connaître",
    example:
      "Par exemple : nous aimerions participer à la prochaine opération de promotion de l’office.",
  },
  {
    group: "Un coup de main",
    code: "autre",
    label: "Autre chose",
    example:
      "Une question sur votre espace, ou autre chose : écrivez-nous ici.",
  },
] as const;
export type PortalMessageSubject =
  (typeof PORTAL_MESSAGE_SUBJECTS)[number]["code"];
export interface PortalMessageAttachment {
  id: string;
  title: string;
}
export interface PortalMessage {
  id: string;
  subject: string;
  body: string;
  createdAt: string;
  status: string;
  replies: { id: string; body: string; createdAt: string }[];
}
function client() {
  const value = getApiClient();
  if (!value) throw new Error("Le service est indisponible. Réessayez.");
  return value;
}
function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}
const str = (v: unknown) => (typeof v === "string" ? v : "");
async function rpc(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } = await client().schema("api").rpc(name, args);
  if (error)
    throw new Error(
      error.code === "P0001"
        ? "Vous avez atteint la limite quotidienne. Réessayez demain."
        : "L’opération a échoué. Votre message est conservé ; réessayez.",
    );
  return data;
}
export async function sendPortalMessage(input: {
  objectId: string;
  subject: PortalMessageSubject;
  body: string;
  attachments: string[];
  replyTo: string;
  clientId: string;
}): Promise<string> {
  const data = await rpc("send_portal_message", {
    p_object_id: input.objectId,
    p_subject: input.subject,
    p_body: input.body,
    p_attachments: input.attachments,
    p_reply_to: input.replyTo,
    p_client_id: input.clientId,
  });
  if (typeof data !== "string" || !data)
    throw new Error(
      "L’envoi n’a pas pu être confirmé. Réessayez : le message ne sera pas envoyé deux fois.",
    );
  // Le drain ne transporte aucun contenu choisi par l'appelant. Son échec ne remet
  // pas en cause le message déjà enregistré, qui reste dans la file de notifications.
  void token()
    .then((access) =>
      fetch("/api/crm/notify-drain", {
        method: "POST",
        headers: { Authorization: `Bearer ${access}` },
      }),
    )
    .catch(() => undefined);
  return data;
}
export async function listMyPortalMessages(
  objectId: string,
): Promise<PortalMessage[]> {
  const data = await rpc("list_my_portal_messages", { p_object_id: objectId });
  return (Array.isArray(data) ? data : [])
    .map(rec)
    .filter((x) => str(x.id))
    .map((x) => ({
      id: str(x.id),
      subject: str(x.subject),
      body: str(x.body),
      createdAt: str(x.created_at),
      status: str(x.status),
      replies: (Array.isArray(x.replies) ? x.replies : [])
        .map(rec)
        .filter((r) => str(r.id))
        .map((r) => ({
          id: str(r.id),
          body: str(r.body),
          createdAt: str(r.created_at),
        })),
    }));
}
export async function listPortalMessageDocuments(
  interactionId: string,
): Promise<{documents:PortalMessageAttachment[];replyTo:string}> {
  const data = await rpc("list_portal_message_documents", {
    p_interaction_id: interactionId,
  });
  const record=rec(data);
  const documents=(Array.isArray(record.documents) ? record.documents : [])
    .map(rec)
    .filter((x) => str(x.id))
    .map((x) => ({ id: str(x.id), title: str(x.title) || "Pièce jointe" }));
  return {documents,replyTo:str(record.replyTo)};
}
async function token(): Promise<string> {
  const { data, error } = await client().auth.getSession();
  if (error || !data.session?.access_token)
    throw new Error("Votre session a expiré. Reconnectez-vous.");
  return data.session.access_token;
}
async function request(
  body: BodyInit,
  method = "POST",
): Promise<Record<string, unknown>> {
  const response = await fetch("/api/portal-message/attachment", {
    method,
    headers: {
      Authorization: `Bearer ${await token()}`,
      ...(typeof body === "string"
        ? { "Content-Type": "application/json" }
        : {}),
    },
    body,
  });
  if (!response.ok) throw await apiError(response);
  return rec(await response.json());
}
export async function uploadPortalMessageAttachment(
  objectId: string,
  file: File,
): Promise<PortalMessageAttachment> {
  const form = new FormData();
  form.append("object_id", objectId);
  form.append("file", file);
  const result = await request(form);
  if (!str(result.id))
    throw new Error("Le dépôt n’a pas pu être confirmé. Réessayez.");
  return { id: str(result.id), title: str(result.title) };
}
export async function getPortalMessageDocumentUrl(id: string): Promise<string> {
  const result = await request(JSON.stringify({ documentId: id }), "PUT");
  if (!str(result.url))
    throw new Error("La pièce jointe ne peut pas être ouverte. Réessayez.");
  return str(result.url);
}
