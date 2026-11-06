import { getApiClient } from "../lib/supabase";
import { apiError } from "./api-error";

export interface PortalMessageAttachment {
  id: string;
  title: string;
}
/** A server-verified relation to this CRM exchange, never free-form message metadata. */
export interface PortalMessagePhotoReview {
  documentId: string;
  title: string;
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
export async function listPortalMessageDocuments(
  interactionId: string,
): Promise<{documents:PortalMessageAttachment[];replyTo:string;photoReview?:PortalMessagePhotoReview|null}> {
  const data = await rpc("list_portal_message_documents", {
    p_interaction_id: interactionId,
  });
  const record=rec(data);
  const documents=(Array.isArray(record.documents) ? record.documents : [])
    .map(rec)
    .filter((x) => str(x.id))
    .map((x) => ({ id: str(x.id), title: str(x.title) || "Pièce jointe" }));
  const photo=rec(record.photoReview);
  const documentId=str(photo.documentId);
  const photoReview=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(documentId)
    ? {documentId,title:str(photo.title)} : null;
  return {documents,replyTo:str(record.replyTo),photoReview};
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
export async function getPortalMessageDocumentUrl(id: string): Promise<string> {
  const result = await request(JSON.stringify({ documentId: id }), "PUT");
  if (!str(result.url))
    throw new Error("La pièce jointe ne peut pas être ouverte. Réessayez.");
  return str(result.url);
}
