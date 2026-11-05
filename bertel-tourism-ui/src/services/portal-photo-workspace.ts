import { z } from "zod";
import { getApiClient } from "../lib/supabase";
import { photoAssessmentSchema } from "../app/api/portal-photo/analyze/assessment";

const texts = z.object({
  revision: z.string().min(1),
  title: z.string().nullable(),
  description: z.string().nullable(),
  title_i18n: z.unknown(),
  description_i18n: z.unknown(),
}).refine((value) => value.title_i18n !== undefined && value.description_i18n !== undefined)
  .transform(({ revision, title, description, title_i18n, description_i18n }) => ({ revision, title, description, title_i18n, description_i18n }));

const orderEntry = z.object({ id: z.string().min(1), revision: z.string().min(1), position: z.number().int().nullable(), isMain: z.boolean().nullable() });
export type PortalPhotoOrderEntry = z.infer<typeof orderEntry>;

const receipt = z.object({
  requestId: z.string().min(1),
  state: z.string().min(1),
  assessment: photoAssessmentSchema.nullable(),
  sourceCurrent: z.boolean(),
  appealInteractionId: z.string().nullable(),
  appealStatus: z.string().nullable(),
});
const count = z.number().int().nonnegative();
const workspaceSchema = z.object({
  published: z.array(z.object({
    id: z.string().min(1), url: z.string().min(1), title: z.string(), description: z.string(), credit: z.string(),
    position: z.number().int().nullable().transform(value => value ?? 0),
    isMain: z.boolean().nullable().transform(value => value === true),
    portalDocumentId: z.string().nullable(), textSnapshot: texts,
  })),
  proposals: z.array(z.object({
    documentId: z.string().min(1), title: z.string(), description: z.string(), status: z.enum(["draft","pending","refused"]),
    replaceMediaId: z.string().nullable(), changeId: z.string().nullable(), submittedAt: z.string().nullable(),
    reviewNote: z.string().nullable(), textSnapshot: texts, analysis: receipt.nullable(), canAppeal: z.boolean(),
    reviewAppeal: z.object({interactionId:z.string().min(1),status:z.string().nullable()}).nullable(),
  })),
  capacity: z.object({ limit: count, used: count, published: count, reserved: count, remaining: count }),
  analysisEnabled: z.boolean(), writesEnabled: z.boolean(), orderSnapshot: z.array(orderEntry), orderNeedsNormalization: z.boolean(),
});
export type PortalPhotoWorkspace = z.infer<typeof workspaceSchema>;

const conflictMessages: Readonly<Record<string, string>> = {
  photo_main_conflict: "L’office doit vérifier la photo principale de cette fiche avant de pouvoir enregistrer ce classement.",
  photo_writes_closed: "La galerie est actuellement en consultation. Votre saisie est conservée.",
  photo_text_conflict: "Les textes de cette photo ont changé. Comparez les versions avant d’enregistrer.",
  photo_order_conflict: "Le classement de la galerie a changé. Relisez les positions avant de réessayer.",
};

async function workspaceRpc(name: string, args: Record<string, unknown>): Promise<PortalPhotoWorkspace> {
  const client = getApiClient();
  if (!client) throw new Error("Le service photo est indisponible. Réessayez.");
  const { data, error } = await client.schema("api").rpc(name, args);
  if (error) {
    const detail = typeof error.details === "string" && Object.hasOwn(conflictMessages, error.details) ? error.details : undefined;
    const message = error.code === "PT409" ? (detail ? conflictMessages[detail] : "La galerie a changé. Relisez la version actuelle avant de réessayer.")
      : error.code === "42501" ? "Votre compte ne peut pas effectuer cette opération sur cette photo."
      : error.code === "22023" && error.details === "photo_title_too_long" ? "Le titre est limité à 180 caractères."
      : error.code === "22023" && error.details === "photo_description_too_long" ? "La description est limitée à 5 000 caractères."
      : error.code === "22023" ? "Ces valeurs ne sont pas acceptées. Vérifiez votre saisie."
      : "L’opération sur vos photos n’a pas pu être confirmée. Actualisez la galerie.";
    throw Object.assign(new Error(message), { code: error.code, details: detail });
  }
  const parsed = workspaceSchema.safeParse(data);
  if (!parsed.success) throw new Error("La galerie reçue est incomplète. Actualisez avant de la modifier.");
  return parsed.data;
}

export const getPortalPhotoWorkspace = (objectId: string) => workspaceRpc("get_my_portal_photo_workspace", { p_object_id: objectId });

export function updatePortalPhotoTexts(input: {
  objectId: string; target: "published" | "proposal"; id: string;
  expected: z.infer<typeof texts>; title: string; description: string;
}) {
  const published = input.target === "published";
  return workspaceRpc(published ? "update_portal_photo_texts" : "update_portal_photo_proposal_texts", {
    p_object_id: input.objectId, [published ? "p_media_id" : "p_document_id"]: input.id,
    p_expected: input.expected, p_title: input.title, p_description: input.description,
  });
}

export function reconcilePortalPhotoOrder(objectId: string, mediaIds: string[], expected: PortalPhotoOrderEntry[]) {
  return workspaceRpc("reconcile_portal_photo_order", { p_object_id: objectId, p_media_ids: mediaIds, p_expected: expected });
}

export async function appealPortalPhotoReview(input: {
  objectId: string; documentId: string; changeId: string; body: string; clientId: string;
}): Promise<string> {
  const client = getApiClient();
  if (!client) throw new Error("Le service photo est indisponible. Réessayez.");
  const { data, error } = await client.schema("api").rpc("appeal_portal_photo_review", {
    p_object_id: input.objectId, p_document_id: input.documentId, p_change_id: input.changeId,
    p_body: input.body, p_client_id: input.clientId,
  });
  if (error || !z.string().uuid().safeParse(data).success) {
    throw Object.assign(new Error("La demande de révision n’a pas pu être confirmée. Actualisez cette photo avant de réessayer."), { code: error?.code });
  }
  return data as string;
}
