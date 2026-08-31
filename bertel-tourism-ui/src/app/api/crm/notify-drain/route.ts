import { NextResponse, type NextRequest } from 'next/server';
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { sendMail } from '@/lib/mail.server';
import { readSmtpConfig } from '@/lib/env.server';
import {
  renderTaskAssignedEmailHtml,
  taskAssignedEmailSubject,
  type TaskAssignedEmailData,
} from '@/emails/TaskAssignedEmail';

// Drainage de l'outbox e-mail d'assignation (17i). N'importe quel utilisateur CONNECTÉ
// peut pinger : le corps de requête est IGNORÉ — la route ne fait que déclencher l'envoi
// de messages dont destinataires et contenu sont 100 % dérivés en DB par
// api.claim_unmailed_notifications (⇒ pas de vecteur spam/relais). SMTP absent ⇒ 503
// SANS réclamer : consommer le TTL sans pouvoir envoyer retarderait le vrai drain.
export const runtime = 'nodejs';

type Rec = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const nstr = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

export async function POST(req: NextRequest): Promise<NextResponse> {
  const server = getServerSupabaseClient();
  if (!server) return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });

  // Authentification d'abord : n'importe quel appelant CONNECTÉ peut déclencher le drain
  // (le contenu ne dépend jamais de lui), mais un appelant anonyme ne le peut pas.
  const authHeader = req.headers.get('authorization') ?? '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
  if (!jwt) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { data: userData, error: userErr } = await server.auth.getUser(jwt);
  if (userErr || !userData?.user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  // SMTP absent ⇒ on sort AVANT de réclamer quoi que ce soit : chaque ligne réclamée a un TTL
  // de 10 minutes pendant lequel elle est invisible aux autres appels — la consommer sans
  // pouvoir envoyer retarderait le vrai drain (le prochain passage utile) de 10 minutes pour rien.
  if (!readSmtpConfig()) return NextResponse.json({ error: 'smtp_not_configured' }, { status: 503 });

  const { data, error } = await server.schema('api').rpc('claim_unmailed_notifications', { p_limit: 20 });
  if (error) {
    // MÊME règle qu'à l'acquittement plus bas : le message SQL brut n'a pas à sortir de ce
    // process — il nomme des tables, des colonnes, parfois de la configuration. Ce fichier
    // l'énonçait déjà pour l'acquittement et le violait ici, quarante lignes plus haut.
    // Journalisé côté serveur pour rester diagnosticable, jamais renvoyé à l'appelant.
    console.error('[notify-drain] claim_unmailed_notifications failed', error.message);
    return NextResponse.json({ error: 'claim_failed' }, { status: 500 });
  }

  const rows = Array.isArray(data) ? data : [];
  const origin = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim() || req.nextUrl.origin;
  const sent: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];

  // Envois séquentiels : volumes faibles, et le relais n'aime pas les rafales.
  for (const raw of rows) {
    const row = (raw ?? {}) as Rec;
    const id = str(row.notification_id);
    const to = str(row.recipient_email);
    // Ligne malformée ou sans e-mail (le claim les termine normalement lui-même) :
    // on la SAUTE — le claim la re-traitera, jamais de boucle d'erreur ici.
    if (!id || !to) continue;
    const emailData: TaskAssignedEmailData = {
      taskTitle: str(row.task_title) || 'Tâche',
      objectName: str(row.object_name) || 'Établissement',
      dueAt: nstr(row.due_at),
      assignerName: nstr(row.assigner_name),
      // Le claim JOINT ce nom (et sa jointure app_user_profile dédiée) : le laisser inutilisé
      // aurait fait porter au contrat une clé que personne ne lit. `nstr` rend `null` sur une
      // chaîne vide comme sur une valeur absente — le template replie alors sur « Bonjour, ».
      recipientName: nstr(row.recipient_name),
      appUrl: `${origin}/crm`,
    };
    try {
      await sendMail({
        to,
        subject: taskAssignedEmailSubject(emailData),
        html: renderTaskAssignedEmailHtml(emailData),
      });
      sent.push(id);
    } catch (err) {
      failed.push({ id, error: err instanceof Error ? err.message : 'send_failed' });
    }
  }

  // File vide ⇒ pas d'acquittement du tout : aucun appel RPC inutile quand il n'y a rien à
  // acquitter (claim vide ⇒ sent et failed restent vides tous les deux).
  let ackFailed = false;
  if (sent.length > 0 || failed.length > 0) {
    const { error: ackError } = await server
      .schema('api')
      .rpc('mark_notifications_emailed', { p_sent: sent, p_failed: failed });
    if (ackError) {
      // Les e-mails sont DÉJÀ partis : rien à annuler côté SMTP, donc le statut HTTP
      // reste 200 (ce n'est pas un échec de la requête). Mais si l'acquittement échoue,
      // les lignes restent non acquittées et repartiront après leur TTL de 10 minutes —
      // doublon, jamais perte, c'est l'arbitrage assumé. Le vrai risque n'est pas le
      // doublon isolé : c'est qu'un chemin d'acquittement durablement cassé (régression
      // de droits sur ce RPC, par ex.) ferait re-envoyer tout le drain à chaque cycle
      // SANS qu'aucun signal n'existe. On journalise donc côté serveur pour rendre
      // l'échec diagnosticable, et on le signale à l'appelant par un booléen dédié —
      // sans y recopier le message SQL brut, qui n'a pas à sortir de ce process.
      console.error('[notify-drain] mark_notifications_emailed failed', ackError.message);
      ackFailed = true;
    }
  }
  const body: { sent: number; failed: number; ackFailed?: true } = { sent: sent.length, failed: failed.length };
  if (ackFailed) body.ackFailed = true;
  return NextResponse.json(body);
}
