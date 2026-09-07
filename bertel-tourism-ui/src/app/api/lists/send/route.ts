import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { sendListEmail, MailNotConfiguredError } from '@/lib/mail.server';
import { resolveSmtpConfig } from '@/lib/smtp-settings.server';
import { renderListEmailHtml, listEmailSubject, type ListEmailItem } from '@/emails/ListEmail';
import { ACCENT_INK, typeLabel } from '@/features/lists/type-meta';

// Envoi d'une liste par e-mail MÉTIER (relais Google par IP du VPS). Modèle sécurité = upload média
// (§59) : JWT appelant → get_list + ensure_list_share_link DEFINER auto-autorisent (en tant
// qu'appelant, jamais la service key) → envoi une seule fois → marquage mark_list_sent fait
// APRÈS coup par le client SERVICE-ROLE, avec p_sender_id = l'appelant authentifié (contrat
// listes 2026-09-07 : la signature UUID-only du RPC est retirée aux clients ordinaires — seul
// service_role peut l'appeler). SMTP absent ⇒ 503 sans casser lien/PDF.
export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ITEMS = 4; // n'embarquer que les premières fiches ; le reste via « sélection complète »

type Rec = Record<string, unknown>;
const asRec = (v: unknown): Rec | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : null);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const nstr = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

export async function POST(req: NextRequest): Promise<NextResponse> {
  const server = getServerSupabaseClient();
  if (!server) {
    return NextResponse.json({ error: 'server_misconfigured' } /* cause serveur : SUPABASE_SERVICE_ROLE_KEY missing */, { status: 500 });
  }

  // 1. Auth : Bearer JWT de l'appelant.
  const authHeader = req.headers.get('authorization') ?? '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
  if (!jwt) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { data: userData, error: userErr } = await server.auth.getUser(jwt);
  if (userErr || !userData?.user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  // 2. Corps.
  let body: Rec;
  try {
    body = (await req.json()) as Rec;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }
  const listId = str(body.listId);
  const toEmail = str(body.toEmail).trim();
  if (!listId) return NextResponse.json({ error: 'missing_list' }, { status: 400 });
  if (!EMAIL_RE.test(toEmail)) return NextResponse.json({ error: 'invalid_email' }, { status: 400 });

  // Resolve before creating a share link or reading any mutable list side effect. A disabled
  // database setting intentionally wins over environment fallback in resolveSmtpConfig.
  try {
    if (!await resolveSmtpConfig()) return NextResponse.json({ error: 'smtp_not_configured' }, { status: 503 });
  } catch {
    return NextResponse.json({ error: 'smtp_unavailable' }, { status: 503 });
  }

  // 3. Client « en tant qu'appelant » — c'est CE client (JWT) qui autorise, pas la service key.
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  const asCaller = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 4. get_list : auto-autorise (RAISE FORBIDDEN si l'appelant ne peut pas lire la liste).
  const { data: listData, error: listErr } = await asCaller.schema('api').rpc('get_list', { p_list_id: listId });
  if (listErr) return NextResponse.json({ error: 'forbidden', detail: listErr.message }, { status: 403 });
  const list = asRec(listData);
  if (!list) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // 5. S'assurer d'un lien public pour le bouton « sélection complète » — en tant qu'appelant,
  // via ensure_list_share_link (contrat listes 2026-09-07) : génère le premier lien s'il n'existe
  // pas, ou réutilise le lien actif SANS toucher son expiration. Un membre non-éditeur ne peut PAS
  // réactiver un lien explicitement désactivé/expiré (SHARE_NOT_AVAILABLE) — l'envoi échoue alors
  // proprement plutôt que de forcer une réactivation que `share_list` (éditeur uniquement) ferait.
  const { data: shareData, error: shareErr } = await asCaller
    .schema('api')
    .rpc('ensure_list_share_link', { p_list_id: listId });
  if (shareErr) return NextResponse.json({ error: 'forbidden', detail: shareErr.message }, { status: 403 });
  const token = nstr(asRec(shareData)?.share_token);
  if (!token) return NextResponse.json({ error: 'share_failed' }, { status: 500 });
  const origin = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim() || req.nextUrl.origin;
  const publicUrl = `${origin}/l/${token}`;

  // 6. Données e-mail (langue de la liste).
  const lang: 'fr' | 'en' = str(list.lang) === 'en' ? 'en' : 'fr';
  const name = lang === 'en' ? (nstr(list.name_en) ?? str(list.name)) : str(list.name);
  const intro = lang === 'en' ? nstr(list.intro_en) ?? nstr(list.intro_fr) : nstr(list.intro_fr);
  const rawItems = Array.isArray(list.items) ? list.items : [];
  const items: ListEmailItem[] = rawItems.slice(0, MAX_ITEMS).map((raw) => {
    const it = asRec(raw) ?? {};
    const card = asRec(it.card) ?? {};
    const loc = asRec(card.location);
    const contacts = asRec(it.contacts);
    return {
      name: str(card.name) || str(it.object_id),
      typeLabel: typeLabel(str(card.type), lang),
      city: loc ? nstr(loc.city) : null,
      image: nstr(card.image),
      note: lang === 'en' ? nstr(it.note_en) : nstr(it.note_fr),
      phone: contacts ? nstr(contacts.phone) : null,
      web: contacts ? nstr(contacts.web) : null,
    };
  });

  // Nom du conseiller : même source que l'aperçu in-app (app_user_profile.display_name),
  // avec repli sur user_metadata.full_name. L'e-mail s'affiche sous le nom (cf. ListEmail).
  const { data: profData } = await asCaller.from('app_user_profile').select('display_name, avatar_url').eq('id', userData.user.id).maybeSingle();
  const advisorName = nstr(asRec(profData)?.display_name) ?? nstr(asRec(userData.user.user_metadata)?.full_name);
  const advisorEmail = nstr(userData.user.email);
  const advisorAvatarUrl = nstr(asRec(profData)?.avatar_url);

  const html = renderListEmailHtml({
    name,
    intro,
    advisorName,
    advisorEmail,
    advisorAvatarUrl,
    publicUrl,
    accentInk: ACCENT_INK[str(list.accent)] ?? ACCENT_INK.teal,
    lang,
    // Même repli que le hero web : à défaut de cover_url, la photo du premier lieu embarqué.
    coverUrl: nstr(list.cover_url) ?? items.find((it) => it.image)?.image ?? null,
    items,
    totalCount: rawItems.length,
  });

  // 7. Envoi.
  try {
    await sendListEmail({ to: toEmail, subject: listEmailSubject(name, lang), html });
  } catch (err) {
    if (err instanceof MailNotConfiguredError) {
      return NextResponse.json({ error: 'smtp_not_configured', detail: err.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: 'send_failed', detail: err instanceof Error ? err.message : 'unknown' },
      { status: 502 },
    );
  }

  // 8. Marquer envoyée (best-effort : le relais SMTP a déjà accepté l'e-mail). Un échec ici — que
  // ce soit une erreur retournée par le RPC ou une exception (réseau, session) — ne doit JAMAIS
  // renvoyer autre chose que 200 : l'UI ne doit pas proposer de renvoyer un e-mail déjà parti.
  // Contrat listes 2026-09-07 : `mark_list_sent(p_list_id, p_sender_id)` est grant service_role
  // UNIQUEMENT — c'est pourquoi ce SEUL appel utilise `server` (client service-role déjà détenu
  // pour la vérification du JWT), avec `p_sender_id` = l'utilisateur authentifié à l'étape 1.
  // Le RPC contrôle lui-même que ce sender est autorisé à utiliser la liste.
  let trackingUpdated = true;
  try {
    const { error: markErr } = await server
      .schema('api')
      .rpc('mark_list_sent', { p_list_id: listId, p_sender_id: userData.user.id });
    if (markErr) trackingUpdated = false;
  } catch {
    trackingUpdated = false;
  }

  return NextResponse.json(
    trackingUpdated
      ? { ok: true, sentTo: toEmail, trackingUpdated: true }
      : { ok: true, sentTo: toEmail, trackingUpdated: false, warning: 'tracking_update_failed' },
    { status: 200 },
  );
}
