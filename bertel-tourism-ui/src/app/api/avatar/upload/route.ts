import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { processImage, MediaProcessingError } from '../../media/upload/process-image';

// Avatar (photo de profil) de l'utilisateur courant. Modèle sécurité = upload média (§59) :
// JWT appelant → user.id ; l'utilisateur ne peut écrire QUE son propre avatar (chemin dérivé
// serveur de user.id, jamais du corps de requête). Le storage tourne en service-role (bypass
// RLS), donc cette dérivation serveur EST la frontière. L'image est redimensionnée ≤ 512 px et
// ses métadonnées EXIF/GPS sont strippées (processImage) — une photo perso peut porter du GPS.
export const runtime = 'nodejs'; // sharp requires Node, not Edge

const BUCKET = 'avatars';

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
  const userId = userData.user.id;

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

  const fileBuffer = Buffer.from(await file.arrayBuffer());

  let processed;
  try {
    // 512 px suffit largement pour une photo de profil (affichée en petit partout).
    processed = await processImage({ buffer: fileBuffer, mimeType: file.type, maxDimension: 512 });
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

  // Chemin STABLE dérivé du user.id : un seul fichier par utilisateur (pas d'orphelins).
  // Le cache est invalidé par un ?v= dans l'URL enregistrée (le chemin, lui, reste constant).
  const path = `${userId}/avatar.jpg`;
  const { error: upErr } = await server.storage.from(BUCKET).upload(path, processed.buffer, {
    contentType: processed.mimeType,
    cacheControl: '31536000', // 1 an — l'URL enregistrée porte un ?v= qui casse le cache au changement
    upsert: true,
  });
  if (upErr) {
    return NextResponse.json({ error: 'upload_failed', detail: upErr.message }, { status: 502 });
  }
  const { data: pub } = server.storage.from(BUCKET).getPublicUrl(path);
  const url = `${pub.publicUrl}?v=${Date.now()}`;

  // Persiste sur le profil EN TANT QU'APPELANT (policy self-update id = auth.uid()).
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  const asCaller = createClient(supabaseUrl, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: profErr } = await asCaller.from('app_user_profile').update({ avatar_url: url }).eq('id', userId);
  if (profErr) {
    return NextResponse.json({ error: 'profile_update_failed', detail: profErr.message }, { status: 500 });
  }

  return NextResponse.json({ url }, { status: 201 });
}
