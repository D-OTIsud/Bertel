import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { processImage, MediaProcessingError } from '../../media/upload/process-image';
import { authorizeAdminRoute, sharesActiveOrg } from '../../admin/_authorize';

// Avatar (photo de profil) de l'utilisateur courant. Modèle sécurité = upload média (§59) :
// JWT appelant → user.id ; l'utilisateur ne peut écrire QUE son propre avatar (chemin dérivé
// serveur de user.id, jamais du corps de requête). Le storage tourne en service-role (bypass
// RLS), donc cette dérivation serveur EST la frontière. L'image est redimensionnée ≤ 512 px et
// ses métadonnées EXIF/GPS sont strippées (processImage) — une photo perso peut porter du GPS.
// Bras admin (2026-08-28) : un champ `targetUserId` optionnel permet à un admin d'ORG (rang ≥ 30)
// ou un superuser de poser la photo d'un AUTRE membre — gardé rang + périmètre ORG partagé.
export const runtime = 'nodejs'; // sharp requires Node, not Edge

const BUCKET = 'avatars';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const server = getServerSupabaseClient();
  if (!server) {
    return NextResponse.json(
      { error: 'server_misconfigured' } /* cause serveur : SUPABASE_SERVICE_ROLE_KEY missing */,
      { status: 500 },
    );
  }

  // Auth : Bearer JWT de l'appelant.
  const authHeader = req.headers.get('authorization') ?? '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
  if (!jwt) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { data: userData, error: userErr } = await server.auth.getUser(jwt);
  if (userErr || !userData?.user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const callerId = userData.user.id;

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

  // Bras ADMIN (§ spec 2026-08-28) : un administrateur pose la photo d'un autre membre.
  // Le chemin storage est dérivé du target VALIDÉ, jamais du corps de requête tel quel — le
  // storage tourne en service-role, donc cette validation EST la frontière.
  const targetRaw = form.get('targetUserId');
  const target = typeof targetRaw === 'string' && targetRaw.trim() !== '' ? targetRaw.trim() : callerId;
  // toLowerCase() : un appelant qui renvoie son propre id dans une autre casse ne doit pas
  // basculer dans le bras admin.
  const isAdminBranch = target.toLowerCase() !== callerId.toLowerCase();
  // Chemin dérivé du JWT (callerId) sur le bras "soi-même", JAMAIS de la chaîne cliente `target` —
  // sinon une casse différente de son propre id produirait une clé storage distincte de l'objet
  // canonique (doublon dans le bucket). Sur le bras admin, `target` n'est qu'une valeur
  // PROVISOIRE : elle est écrasée plus bas par la valeur canonique rendue par `getUserById`
  // avant tout usage (chemin storage, upsert profil).
  let userId = isAdminBranch ? target : callerId;
  if (isAdminBranch) {
    // authorizeAdminRoute refait sa propre résolution client/JWT (getServerSupabaseClient +
    // auth.getUser) au lieu de réutiliser celles ci-dessus — acceptable pour la réutilisation de
    // la garde rang/scope, mais `auth.server`/`auth.callerId` sont donc des instances distinctes
    // de `server`/`callerId` déjà en portée ici, pas les mêmes objets.
    const auth = await authorizeAdminRoute(req);
    if (!auth.ok) return auth.response;
    if (!auth.isSuper && !(await sharesActiveOrg(server, callerId, target))) {
      return NextResponse.json({ error: 'out_of_scope' }, { status: 403 });
    }
    // Le chemin storage est dérivé du target VALIDE, pour les DEUX arms (superuser ET admin
    // d'ORG) : sans ce contrôle, un id malformé créerait une clé arbitraire dans le bucket (le
    // superuser ne validait jusqu'ici RIEN), et un id inexistant rendrait 201 sur une écriture
    // qui n'a persisté nulle part (`update().eq()` matche 0 ligne SANS erreur).
    const { data: authTarget, error: authTargetErr } = await auth.server.auth.admin.getUserById(target);
    if (authTargetErr || !authTarget?.user) {
      return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
    }
    userId = authTarget.user.id; // valeur canonique rendue par GoTrue, jamais la chaîne du formulaire
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

  // Persistance : EN TANT QU'APPELANT sur son propre profil (policy self-update id = auth.uid()),
  // en SERVICE-ROLE sur le bras admin (la policy n'autorise que soi-même ou un owner — l'admin
  // d'ORG n'y passerait pas, et sa légitimité a déjà été établie ci-dessus).
  let profErr: { message: string } | null = null;
  if (isAdminBranch) {
    // upsert (pas update) : une cible peut légitimement ne pas encore avoir de ligne
    // `app_user_profile` (compte invité) — un update() y serait un no-op silencieux (0 ligne
    // matchée, aucune erreur) et la route rendrait 201 sur une écriture qui n'a rien persisté.
    ({ error: profErr } = await server
      .from('app_user_profile')
      .upsert({ id: userId, avatar_url: url }, { onConflict: 'id' }));
  } else {
    const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
    const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
    const asCaller = createClient(supabaseUrl, anon, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    ({ error: profErr } = await asCaller.from('app_user_profile').update({ avatar_url: url }).eq('id', userId));
  }
  if (profErr) {
    return NextResponse.json({ error: 'profile_update_failed', detail: profErr.message }, { status: 500 });
  }

  return NextResponse.json({ url }, { status: 201 });
}
