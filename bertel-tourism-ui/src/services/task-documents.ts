// Service pièces jointes de tâche CRM (17i) — CLONE direct d'actor-documents.ts : mêmes trois
// actions (upload / url signée / suppression), mêmes conventions (FormData pour l'upload, JSON
// pour le reste, Bearer de session), endpoints /api/task-document au lieu de /api/actor-document.
// Les routes elles-mêmes sont posées par la Task 8 ; ce module ne fait qu'appeler leur contrat.
import { apiError } from './api-error';

export interface TaskDocumentActionInput {
  taskId: string;
  documentId: string;
  accessToken: string;
}

export async function uploadTaskDocument(input: {
  taskId: string;
  file: File;
  accessToken: string;
}): Promise<{ documentId: string; title: string }> {
  const body = new FormData();
  body.append('task_id', input.taskId);
  body.append('file', input.file);
  const response = await fetch('/api/task-document', {
    method: 'POST',
    headers: { Authorization: `Bearer ${input.accessToken}` },
    body,
  });
  return readResponse(response);
}

export async function getTaskDocumentUrl(input: TaskDocumentActionInput): Promise<string> {
  const response = await fetch('/api/task-document/url', {
    method: 'POST',
    headers: { Authorization: `Bearer ${input.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId: input.taskId, documentId: input.documentId }),
  });
  const payload = await readResponse<{ url: string }>(response);
  return payload.url;
}

export async function deleteTaskDocument(input: TaskDocumentActionInput): Promise<void> {
  const response = await fetch('/api/task-document', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${input.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId: input.taskId, documentId: input.documentId }),
  });
  await readResponse(response);
}

/** Helper mutualisé (même recette qu'actor-documents) : le corriger corrige les trois. */
async function readResponse<T = Record<string, unknown>>(response: Response): Promise<T> {
  if (!response.ok) {
    throw await apiError(response);
  }
  return await response.json() as T;
}
