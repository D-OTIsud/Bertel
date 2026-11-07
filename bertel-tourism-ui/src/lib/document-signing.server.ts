import type { ServerClient } from '@/app/api/_document-auth';

export function isExactDocumentPath(path: unknown): path is string {
  return typeof path === 'string' && !!path && !path.startsWith('/') && !path.includes('\\')
    && !path.split('/').some((part) => part === '.' || part === '..');
}

function exactSignedUrl(sdkUrl: string, bucket: string, path: string): string | null {
  // Keep the reviewed DB07 endpoint/token reconstruction and exact segment encoding.
  const marker = sdkUrl.indexOf('/object/sign/');
  const token = /[?&]token=([^?&#]+)$/.exec(sdkUrl)?.[1];
  if (marker < 0 || !token) return null;
  try {
    const url = new URL(`${sdkUrl.slice(0, marker)}/object/sign/${encodeURIComponent(bucket)}/${path.split('/').map(encodeURIComponent).join('/')}`);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) return null;
    url.searchParams.set('token', decodeURIComponent(token));
    return url.toString();
  } catch { return null; }
}

/** The caller must authorize the namespace and exact file before invoking this signer. */
export async function signExactDocumentUrl(server: ServerClient, file: { bucket: string; path: string }): Promise<string | null> {
  const signed = await server.storage.from(file.bucket).createSignedUrls([file.path], 60);
  const item = signed.data?.length === 1 ? signed.data[0] : null;
  return !signed.error && item && !item.error && item.path === file.path && item.signedUrl
    ? exactSignedUrl(item.signedUrl, file.bucket, file.path) : null;
}
