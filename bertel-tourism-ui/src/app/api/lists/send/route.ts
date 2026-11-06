import { createHash, randomBytes } from 'node:crypto';
import { createCallerClient } from '@/lib/supabase-caller.server';
import { NextResponse, type NextRequest } from 'next/server';

import { getServerSupabaseClient } from '@/lib/supabase-server';
import { getCanonicalAppOrigin } from '@/lib/canonical-app-origin.server';
import { isSandboxDiscoveryUser, SANDBOX_EMAIL_DETAIL, SANDBOX_EXTERNAL_EFFECTS_ERROR } from '@/lib/sandbox-effects';
import { prepareListEmail, MailDeliveryError, MailNotConfiguredError } from '@/lib/mail.server';
import { resolveSmtpConfig } from '@/lib/smtp-settings.server';
import { renderListEmailHtml, listEmailSubject, type ListEmailItem } from '@/emails/ListEmail';
import { ACCENT_INK, typeLabel } from '@/features/lists/type-meta';

// Envoi d'une liste par e-mail MÉTIER (relais Google par IP du VPS). Modèle sécurité = upload média
// (§59) : JWT appelant → get_list + ensure_list_share_link DEFINER auto-autorisent (en tant
// qu'appelant, jamais la service key) → une tentative par intention → marquage mark_list_sent fait
// APRÈS coup par le client SERVICE-ROLE, avec p_sender_id = l'appelant authentifié (contrat
// listes 2026-09-07 : la signature UUID-only du RPC est retirée aux clients ordinaires — seul
// service_role peut l'appeler). SMTP absent ⇒ 503 sans casser lien/PDF.
export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
  if (isSandboxDiscoveryUser(userData.user)) {
    return NextResponse.json({ error: SANDBOX_EXTERNAL_EFFECTS_ERROR, detail: SANDBOX_EMAIL_DETAIL }, { status: 403 });
  }

  // 2. Corps.
  let body: Rec;
  try {
    const parsed = asRec(await req.json());
    if (!parsed) return NextResponse.json({ error: 'bad_json' }, { status: 400 });
    body = parsed;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }
  const listId = str(body.listId);
  const phase = body.phase;
  const api = server.schema('api');
  if (!listId) return NextResponse.json({ error: 'missing_list' }, { status: 400 });
  if (phase === 'context') {
    try {
      const result = await api.rpc('get_list_email_context', { p_user_id: userData.user.id, p_list_id: listId });
      const data = asRec(result.data);
      if (result.error || !data) return protectionUnavailable();
      if (data.state === 'forbidden') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
      if (data.state !== 'ready' || !asRec(data.generations)) return protectionUnavailable();
      return NextResponse.json({ ok: true, phase: 'context', listId, userId: userData.user.id, generations: data.generations },
        { status: 200, headers: { 'Cache-Control': 'no-store' } });
    } catch { return protectionUnavailable(); }
  }
  if (phase !== 'prepare' && phase !== 'dispatch' && phase !== 'ack') return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const operationId = (req.headers.get('idempotency-key') ?? '').trim().toLowerCase();
  if (!UUID_RE.test(operationId)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  if (phase === 'ack') {
    const proof = str(body.resultToken);
    if (!/^[0-9a-f]{64}$/.test(proof)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    try {
      const result = await api.rpc('ack_list_email_client', { p_user_id: userData.user.id, p_list_id: listId, p_operation_id: operationId, p_result_token: proof });
      if (result.error) return protectionUnavailable();
      return NextResponse.json({ ok: true, phase: 'acknowledged', operationId, acknowledged: result.data === true },
        { status: 200, headers: { 'Cache-Control': 'no-store' } });
    } catch { return protectionUnavailable(); }
  }
  const toEmail = str(body.toEmail).trim();
  if (!EMAIL_RE.test(toEmail)) return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  const previous = body.confirmedPreviousOperationId;
  const previousIds = body.confirmedPreviousOperationIds;
  if ((previous !== undefined && (typeof previous !== 'string' || !UUID_RE.test(previous)))
    || (previousIds !== undefined && (!Array.isArray(previousIds) || !previousIds.every((id) => typeof id === 'string' && UUID_RE.test(id))))) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const confirmedPreviousOperationIds = [...new Set([
    ...(Array.isArray(previousIds) ? previousIds.map((id: string) => id.toLowerCase()) : []),
    ...(typeof previous === 'string' ? [previous.toLowerCase()] : []),
  ])].sort();
  if (confirmedPreviousOperationIds.includes(operationId)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const confirmResend = body.confirmResend === true;
  const expectedGeneration = str(body.expectedGeneration);
  const dispatchToken = str(body.dispatchToken);
  if (phase === 'prepare' && ((!/^(0|[1-9][0-9]{0,18})$/.test(expectedGeneration)
    || BigInt(expectedGeneration) > 9223372036854775807n)
    || (body.confirmResend !== undefined && typeof body.confirmResend !== 'boolean')
    || (confirmedPreviousOperationIds.length > 0 && !confirmResend))) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  if (phase === 'dispatch' && !UUID_RE.test(dispatchToken)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

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
  const asCaller = createCallerClient(url, anon, jwt);

  // 4. get_list : auto-autorise (RAISE FORBIDDEN si l'appelant ne peut pas lire la liste).
  const { data: listData, error: listErr } = await asCaller.schema('api').rpc('get_list', { p_list_id: listId });
  if (listErr) return NextResponse.json({ error: 'forbidden', detail: listErr.message }, { status: 403 });
  const list = asRec(listData);
  if (!list) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const origin = getCanonicalAppOrigin();
  if (!origin) return NextResponse.json({ error: 'app_origin_unavailable' }, { status: 503 });

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

  // Freeze exactly what is submitted, including the configured From identity. Hashes are
  // pseudonymous receipts, not aggregate measurement or a promise of SMTP exactly-once.
  const subject = listEmailSubject(name, lang);
  let prepared: Awaited<ReturnType<typeof prepareListEmail>>;
  try { prepared = await prepareListEmail({ to: toEmail, subject, html }); }
  catch (error) {
    return NextResponse.json({ error: error instanceof MailNotConfiguredError ? 'smtp_not_configured' : 'smtp_unavailable' }, { status: 503 });
  }
  const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
  const fingerprint = hash(JSON.stringify([listId, toEmail, subject, html, prepared.sender.address, prepared.sender.name]));
  const args = { p_user_id: userData.user.id, p_list_id: listId, p_operation_id: operationId };
  const unavailable = protectionUnavailable;
  const receiptResponse = (receipt: Rec): NextResponse | null => {
    if (receipt.state === 'accepted') {
      const proof = str(receipt.result_token);
      return /^[0-9a-f]{64}$/.test(proof) ? success(toEmail, receipt.tracking_updated === true, operationId, proof) : unavailable();
    }
    if (receipt.state === 'forbidden') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (receipt.state === 'stale') return NextResponse.json({ error: 'email_context_stale' }, { status: 409 });
    if (receipt.state === 'conflict' || receipt.state === 'superseded') return NextResponse.json({ error: 'bad_request' }, { status: 409 });
    if (receipt.state === 'started' || receipt.state === 'unknown') {
      const previousOperation = str(receipt.operation_id) || operationId;
      return NextResponse.json({ error: 'email_delivery_unknown', operationId: previousOperation,
        operationIds: Array.isArray(receipt.operation_ids) ? receipt.operation_ids : [previousOperation] }, { status: 409 });
    }
    if (receipt.state === 'rejected') {
      if (receipt.rejection_code === 'NOT_CONFIGURED') return NextResponse.json({ error: 'smtp_not_configured' }, { status: 503 });
      return NextResponse.json({ error: 'send_failed', detail: new MailDeliveryError({ code: receipt.rejection_code }).message }, { status: 502 });
    }
    return null;
  };
  const recipientFingerprint = hash(toEmail);
  if (phase === 'prepare') {
    let receipt: Rec | null;
    try {
      const result = await api.rpc('prepare_list_email', { ...args, p_fingerprint: fingerprint,
        p_recipient_fingerprint: recipientFingerprint, p_expected_generation: expectedGeneration,
        p_confirm_resend: confirmResend, p_confirmed_previous_operation_ids: confirmedPreviousOperationIds });
      receipt = asRec(result.data);
      if (result.error || !receipt) return unavailable();
    } catch { return unavailable(); }
    const response = receiptResponse(receipt);
    if (response) return response;
    const token = str(receipt.attempt_token);
    if (receipt.state !== 'reserved' || !UUID_RE.test(token)) return unavailable();
    // This acknowledgement is a permit only. No SMTP or automatic continuation
    // exists on the server; a lost prepare response cannot dispatch by itself.
    return NextResponse.json({ ok: true, phase: 'prepared', operationId, dispatchToken: token },
      { status: 200, headers: { 'Cache-Control': 'no-store' } });
  }
  const attemptToken = dispatchToken;
  try {
    const result = await api.rpc('begin_list_email', { ...args, p_attempt_token: attemptToken,
      p_fingerprint: fingerprint, p_recipient_fingerprint: recipientFingerprint });
    const verdict = asRec(result.data);
    if (result.error || !verdict) return unavailable();
    if (verdict.started !== true) return receiptResponse(verdict) ?? unavailable();
  } catch { return unavailable(); }
  const complete = async (outcome: 'accepted' | 'rejected' | 'unknown', trackingUpdated = false, rejectionCode: string | null = null, resultToken: string | null = null) => {
    try {
      const result = await api.rpc('complete_list_email', { ...args, p_attempt_token: attemptToken,
        p_outcome: outcome, p_tracking_updated: trackingUpdated, p_rejection_code: rejectionCode, p_result_token: resultToken });
      return !result.error && result.data === true;
    } catch { return false; }
  };
  // The durable started state is committed BEFORE SMTP. A crash/timeout after this point
  // remains uncertain and cannot automatically reserve another transmission.
  let resultToken: string;
  try { resultToken = randomBytes(32).toString('hex'); }
  catch { await complete('rejected', false, 'CONFIG_UNAVAILABLE'); return unavailable(); }
  // The result proof stays server-only until the relay accepts the message. Its
  // HEX64 type is distinct from the UUID permit; ACK still requires durable accepted.
  try { await prepared.send(); }
  catch (error) {
    const rejectionCode = error instanceof MailNotConfiguredError ? 'NOT_CONFIGURED'
      : error instanceof MailDeliveryError ? error.rejectionCode : null;
    await complete(rejectionCode ? 'rejected' : 'unknown', false, rejectionCode);
    if (!rejectionCode) return NextResponse.json({ error: 'email_delivery_unknown', operationId, operationIds: [operationId] }, { status: 409 });
    if (rejectionCode === 'NOT_CONFIGURED') return NextResponse.json({ error: 'smtp_not_configured' }, { status: 503 });
    return NextResponse.json({ error: 'send_failed', detail: error instanceof Error ? error.message : '' }, { status: 502 });
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

  // A missing receipt ACK cannot undo the known relay acceptance. Keep 200; a replay
  // sees started/unknown and asks for explicit confirmation rather than resending.
  await complete('accepted', trackingUpdated, null, resultToken);
  return success(toEmail, trackingUpdated, operationId, resultToken);
}

function protectionUnavailable(): NextResponse {
  return NextResponse.json({ error: 'email_protection_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}

function success(toEmail: string, trackingUpdated: boolean, operationId: string, resultToken: string): NextResponse {
  return NextResponse.json(
    trackingUpdated
      ? { ok: true, phase: 'accepted', operationId, resultToken, sentTo: toEmail, trackingUpdated: true }
      : { ok: true, phase: 'accepted', operationId, resultToken, sentTo: toEmail, trackingUpdated: false, warning: 'tracking_update_failed' },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
