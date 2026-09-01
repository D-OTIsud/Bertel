import { NextResponse, type NextRequest } from 'next/server';
import { PRIVATE_BUCKET, UUID_SHAPE, authenticated } from '../../_document-auth';
import { authorizeTask, resolveLinkedDocument } from '../authorize';

// URL signée (60 s) d'une pièce jointe de tâche CRM (17i) — clone d'actor-document/url :
// gate « en tant qu'appelant » via le RPC d'écriture (voir route.ts : les trois verbes
// documents partagent le même prédicat, il n'y a pas de surface lecture seule ici), lecture
// du chemin storage en service_role (RLS interdit toute lecture directe des tables CRM par
// l'appelant), URL signée émise par le service_role.
//
// C'est la route qui DÉLIVRE l'accès au fichier privé : tout ce qui la garde vit dans
// ../authorize, partagé avec route.ts, et est asservi par url/route.test.ts.

/** Durée de validité de l'URL signée, en secondes. Volontairement courte : le lien sort
 *  du périmètre gaté dès qu'il est émis (il s'ouvre sans JWT), une fenêtre large en
 *  ferait un droit d'accès durable et transférable au fichier privé. */
const SIGNED_URL_TTL_SECONDS = 60;

export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticated(req);
  if (!auth.ok) return auth.response;
  let body: { taskId?: string; documentId?: string };
  try { body = await req.json() as typeof body; } catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }); }
  const taskId = body.taskId ?? '';
  const documentId = body.documentId ?? '';
  if (!UUID_SHAPE.test(taskId) || !UUID_SHAPE.test(documentId)) return NextResponse.json({ error: 'invalid_fields' }, { status: 400 });

  // Le gate PRÉCÈDE toute lecture et toute signature : un appelant sans droit d'écriture
  // sur la tâche ne doit pas même provoquer de résolution du document, encore moins
  // d'émission d'URL.
  if (!await authorizeTask(auth.jwt, taskId)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const resolved = await resolveLinkedDocument(auth.server, taskId, documentId);
  if (!resolved.ok) return resolved.response;
  // Contrairement à la suppression, une ligne sans fichier n'a rien à offrir ici :
  // 404 plutôt qu'une signature sur un chemin vide.
  if (!resolved.file) return NextResponse.json({ error: 'file_missing' }, { status: 404 });

  // Bucket ÉPINGLÉ (constante), jamais celui porté par la ligne : le service_role signe,
  // il ne doit pouvoir signer que dans le bucket privé des pièces jointes.
  const { data, error } = await auth.server.storage
    .from(PRIVATE_BUCKET)
    .createSignedUrl(resolved.file.path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return NextResponse.json({ error: 'signed_url_failed', detail: error?.message }, { status: 500 });
  return NextResponse.json({ url: data.signedUrl });
}
