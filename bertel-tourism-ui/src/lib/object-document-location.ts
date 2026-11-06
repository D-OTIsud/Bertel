/** Legacy private URLs and the opaque identifiers used after Storage cutover. */
export function isPrivateObjectDocumentHref(value: string): boolean {
  if (value.startsWith('private:') || value.startsWith('storage://legal-documents/')) return true;
  try { return new URL(value).pathname.startsWith('/storage/v1/object/public/old_legal_media/'); }
  catch { return false; }
}
