import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { MediaProcessingError } from '../media/upload/process-image';
import { processActorDocumentBuffer } from '../actor-document/process-actor-document';
import { PRIVATE_BUCKET, UUID_SHAPE, authenticated, authorizeTask, resolveLinkedDocument } from './authorize';

// Pièces jointes de TÂCHE CRM (17i) — clone du modèle actor-document : Bearer → getUser,
// autorisation par RPC DEFINER « en tant qu'appelant » (jamais la service key), fichier
// dans le bucket privé actor-documents sous tasks/{taskId}/, ref_document crm_private,
// lien crm_task_document, rollback en cascade sur échec partiel. Le gate est le prédicat
// d'ÉCRITURE (user_can_write_crm_task) pour les trois verbes : toutes les surfaces
// documents vivent derrière le modal d'édition, lui-même gated écriture. Le socle
// d'autorisation (gate + résolution du document lié) vit dans ./authorize, partagé avec
// url/route.ts : une seule copie du gate, un seul endroit à corriger.

export const runtime = 'nodejs';

async function processFile(file: File) {
  return processActorDocumentBuffer(Buffer.from(await file.arrayBuffer()), file.type);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticated(req);
  if (!auth.ok) return auth.response;
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: 'bad_multipart' }, { status: 400 }); }
  const taskId = form.get('task_id');
  const file = form.get('file');
  if (typeof taskId !== 'string' || !UUID_SHAPE.test(taskId) || !(file instanceof File)) {
    return NextResponse.json({ error: 'invalid_fields' }, { status: 400 });
  }
  if (!await authorizeTask(auth.jwt, taskId)) {
    return NextResponse.json({ error: 'forbidden', detail: 'caller cannot edit this task' }, { status: 403 });
  }

  try {
    const processed = await processFile(file);
    const path = `tasks/${taskId}/${randomUUID()}.${processed.extension}`;
    const { error: uploadError } = await auth.server.storage.from(PRIVATE_BUCKET).upload(path, processed.buffer, {
      contentType: processed.mimeType,
      cacheControl: '3600',
      upsert: false,
    });
    if (uploadError) return NextResponse.json({ error: 'upload_failed', detail: uploadError.message }, { status: 500 });

    const title = file.name.trim() || 'Document de tâche';
    const storageUrl = `storage://${PRIVATE_BUCKET}/${path}`;
    const { data: document, error: documentError } = await auth.server
      .from('ref_document')
      .insert({
        url: storageUrl,
        title,
        storage_bucket: PRIVATE_BUCKET,
        storage_path: path,
        access_scope: 'crm_private',
        extra: { mime_type: processed.mimeType, size_bytes: processed.buffer.byteLength },
      })
      .select('id')
      .single();
    if (documentError || !document) {
      // Le fichier est déjà dans le bucket : sans ce retrait, il devient orphelin (plus
      // aucune ligne ref_document ne le référence, plus aucune purge automatique).
      await auth.server.storage.from(PRIVATE_BUCKET).remove([path]);
      return NextResponse.json({ error: 'document_create_failed', detail: documentError?.message }, { status: 500 });
    }

    const documentId = String((document as { id: string }).id);
    const { error: linkError } = await auth.server.from('crm_task_document').insert({
      task_id: taskId,
      document_id: documentId,
      title,
      created_by: auth.userId,
    });
    if (linkError) {
      // Le lien est le seul rattachement entre le document et la tâche : sans lui,
      // ref_document + le fichier storage sont deux orphelins muets. On retire les deux.
      await auth.server.from('ref_document').delete().eq('id', documentId);
      await auth.server.storage.from(PRIVATE_BUCKET).remove([path]);
      return NextResponse.json({ error: 'task_document_create_failed', detail: linkError.message }, { status: 500 });
    }
    return NextResponse.json({ documentId, title }, { status: 201 });
  } catch (error) {
    if (error instanceof MediaProcessingError) {
      const status = error.code === 'size' ? 413 : error.code === 'mime' ? 415 : 400;
      return NextResponse.json({ error: error.code, detail: error.message }, { status });
    }
    return NextResponse.json({ error: 'upload_failed', detail: error instanceof Error ? error.message : 'unknown' }, { status: 500 });
  }
}

async function readJson(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const value = await req.json();
    return value && typeof value === 'object' ? value as Record<string, unknown> : null;
  } catch { return null; }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticated(req);
  if (!auth.ok) return auth.response;
  const body = await readJson(req);
  const taskId = typeof body?.taskId === 'string' ? body.taskId : '';
  const documentId = typeof body?.documentId === 'string' ? body.documentId : '';
  if (!UUID_SHAPE.test(taskId) || !UUID_SHAPE.test(documentId)) {
    return NextResponse.json({ error: 'invalid_fields' }, { status: 400 });
  }
  if (!await authorizeTask(auth.jwt, taskId)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  // Le résolveur porte les trois invariants (paire task/document, erreur de lecture ≠
  // absence, bucket épinglé). En particulier : si une lecture échoue il rend un 500 et
  // on sort AVANT toute suppression — supprimer la métadonnée sur une lecture ratée
  // laisserait le fichier dans le bucket sans plus aucune ligne pour le référencer.
  const resolved = await resolveLinkedDocument(auth.server, taskId, documentId);
  if (!resolved.ok) return resolved.response;

  // Deux situations distinctes derrière ce test, à ne pas confondre :
  //  - chemin vide ⇒ la ligne ne désigne AUCUN fichier (purge manuelle, incident) : il
  //    n'y a rien à retirer, la suppression de la ligne suit normalement ;
  //  - chemin présent ⇒ on retire le fichier d'abord. remove() est silencieusement
  //    idempotent si l'objet a déjà disparu du bucket, on ne bloque pas pour autant.
  // L'ordre (fichier puis ligne) est délibéré : l'ordre inverse laisserait un fichier
  // orphelin si le retrait échouait après la suppression de la ligne. Ici le pire cas
  // est une ligne sans fichier — visible, rattrapable, jamais un orphelin muet.
  if (resolved.storagePath) await auth.server.storage.from(PRIVATE_BUCKET).remove([resolved.storagePath]);
  const { error } = await auth.server.from('ref_document').delete().eq('id', documentId);
  if (error) return NextResponse.json({ error: 'delete_failed', detail: error.message }, { status: 500 });
  // crm_task_document.document_id référence ref_document en CASCADE FK : la ligne de lien
  // tombe automatiquement, jamais supprimée à la main (source unique de vérité = la FK).
  return NextResponse.json({ deleted: true });
}
