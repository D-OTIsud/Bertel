import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { processImage, MediaProcessingError } from '../../../media/upload/process-image';

// Logo white-label (branding global). Modèle sécurité = upload média/avatar (§59) :
// le storage tourne en service-role (bypass RLS) — le bucket branding-assets
// interdit toute écriture anon/authenticated (RESTRICTIVE) — donc l'AUTORISATION
// est faite ici, serveur, EN TANT QUE l'appelant : api.is_platform_admin() (la
// MÊME garde que api.upsert_app_branding qui persiste ensuite la ligne branding).
// L'image est redimensionnée puis ses métadonnées EXIF/GPS strippées ; outputFormat
// 'preserve' conserve la transparence PNG/WebP (un logo ne doit pas être aplati en
// JPEG opaque). Cette route N'ÉCRIT PAS la ligne branding : elle renvoie l'URL/chemin
// que saveBrandingSettings passe à upsert_app_branding avec le reste du thème.
export const runtime = 'nodejs'; // sharp requires Node, not Edge

const BUCKET = 'branding-assets';
const MAX_LOGO_DIMENSION_PX = 1024; // login hero l'affiche plus grand qu'un avatar; borne quand même

function extensionFor(mimeType: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const server = getServerSupabaseClient();
  if (!server) {
    return NextResponse.json(
      { error: 'server_misconfigured', detail: 'SUPABASE_SERVICE_ROLE_KEY missing' },
      { status: 500 },
    );
  }

  // Auth : Bearer JWT de l'appelant.
  const authHeader = req.headers.get('authorization') ?? '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
  if (!jwt) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { data: userData, error: userErr } = await server.auth.getUser(jwt);
  if (userErr || !userData?.user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  // Parse le multipart AVANT de choisir la garde : orgObjectId (optionnel) décide de
  // l'autorisation (branding d'une ORG vs branding plateforme).
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'bad_multipart' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'missing_file' }, { status: 400 });
  }
  const orgObjectIdRaw = form.get('orgObjectId');
  const orgObjectId = typeof orgObjectIdRaw === 'string' && orgObjectIdRaw.trim() !== '' ? orgObjectIdRaw.trim() : null;

  // Autorisation EN TANT QUE l'appelant (le storage tourne en service-role — cette garde EST
  // la frontière ; fail-closed : erreur de sonde => 403). Avec orgObjectId : admin de CETTE ORG
  // (ou superuser). Sans : super-admin plateforme (branding global, inchangé).
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  const asCaller = createClient(supabaseUrl, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const probe = orgObjectId
    ? await asCaller.schema('api').rpc('user_can_manage_org_branding', { p_org_object_id: orgObjectId })
    : await asCaller.schema('api').rpc('is_platform_admin');
  if (probe.error || probe.data !== true) {
    return NextResponse.json(
      { error: 'forbidden', detail: orgObjectId ? 'Only a platform superuser or an admin of this organisation can update its branding.' : 'Only platform admins can update branding.' },
      { status: 403 },
    );
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer());

  let processed;
  try {
    processed = await processImage({
      buffer: fileBuffer,
      mimeType: file.type,
      maxDimension: MAX_LOGO_DIMENSION_PX,
      outputFormat: 'preserve', // garde la transparence PNG/WebP
    });
  } catch (err) {
    if (err instanceof MediaProcessingError) {
      const status = err.code === 'mime' || err.code === 'size' ? 415 : 400;
      return NextResponse.json({ error: err.code, detail: err.message }, { status });
    }
    return NextResponse.json(
      { error: 'process_failed', detail: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }

  // Chemin horodaté : chaque logo est une nouvelle URL (cache-bust CDN gratuit).
  // Extension dérivée du format RÉELLEMENT encodé, pas du nom de fichier appelant.
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const ext = extensionFor(processed.mimeType);
  const path = orgObjectId ? `org/${orgObjectId}/${timestamp}.${ext}` : `global/${timestamp}.${ext}`;
  const { error: upErr } = await server.storage.from(BUCKET).upload(path, processed.buffer, {
    contentType: processed.mimeType,
    cacheControl: '3600',
    upsert: true,
  });
  if (upErr) {
    return NextResponse.json({ error: 'upload_failed', detail: upErr.message }, { status: 502 });
  }
  const { data: pub } = server.storage.from(BUCKET).getPublicUrl(path);

  return NextResponse.json(
    { logoStoragePath: path, logoPublicUrl: pub.publicUrl, logoMimeType: processed.mimeType },
    { status: 201 },
  );
}
