// Formats acceptés par le pipeline de documents privés CRM — source UNIQUE.
//
// Les deux surfaces de dépôt (pièces jointes de tâche dans CrmTaskModal, bibliothèque
// d'acteur dans CrmActorDocuments) postent vers /api/task-document et /api/actor-document,
// qui passent toutes deux par `processActorDocumentBuffer` : MÊME pipeline, donc mêmes
// formats. Elles annonçaient pourtant deux listes différentes — `image/*` d'un côté,
// l'énumération exacte de l'autre. Un GIF ou un HEIC choisi dans le modal de tâche
// traversait donc le sélecteur, l'upload, puis se faisait refuser par un 415 que le clone
// acteur empêchait en amont. Une seule constante, deux consommateurs.
//
// Le serveur reste la source de vérité (`process-image.ts#ALLOWED_MIME_TYPES` + le PDF) :
// cet attribut ne fait que filtrer le sélecteur de fichier, il ne garde rien.

/** Valeur de l'attribut `accept` d'un input file de document CRM. */
export const CRM_DOCUMENT_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';
