import { NextResponse, type NextRequest } from 'next/server';
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { sendMail } from '@/lib/mail.server';
import { readSmtpConfig } from '@/lib/env.server';
import {
  renderTaskAssignedEmailHtml,
  taskAssignedEmailSubject,
  type TaskAssignedEmailData,
} from '@/emails/TaskAssignedEmail';
import {
  renderSubmissionReviewedEmailHtml,
  submissionReviewedEmailSubject,
  type SubmissionReviewedEmailData,
} from '@/emails/SubmissionReviewedEmail';
import { isSubmissionOutcome } from '@/lib/submission-outcome';

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
  // ⚠ MISE EN SERVICE — `NEXT_PUBLIC_APP_URL` DOIT être posé en production. Sans lui,
  // `origin` retombe sur `req.nextUrl.origin`, c'est-à-dire sur l'en-tête `Host` de
  // l'appelant. C'était sans grande portée tant que ces liens ne partaient qu'à des membres
  // de l'équipe ; depuis 18a ils partent à des PARTENAIRES EXTERNES, et un `Host` falsifié
  // les enverrait vers un domaine choisi par l'appelant du drain — qui doit être connecté,
  // mais pas nécessairement digne de confiance.
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
    // 18a — le claim rend DEUX espèces (crm_task_assigned et fiche_submission_reviewed) et
    // chacune a SON gabarit. Composer la seconde avec TaskAssignedEmail enverrait au
    // partenaire une notification d'assignation interne — sujet « Nouvelle tâche », bouton
    // pointant /crm, une page que la persona `actor` ne peut pas ouvrir — et `outcome`, la
    // seule information utile, serait jeté.
    //
    // Le repli sur 'crm_task_assigned' quand la clé est ABSENTE couvre l'ordre de
    // déploiement inverse (front neuf, claim antérieur à 18a §8.2, qui n'émet pas `kind`) :
    // toutes les lignes restent alors traitées comme avant.
    //
    // Une espèce que ce relais ne sait pas composer est TERMINÉE en échec explicite, jamais
    // sautée. Un `continue` nu ne suffirait pas : mark_notifications_emailed n'incrémente
    // email_attempts que par le bras p_failed, donc une ligne sautée sans acquittement
    // redevient réclamable à chaque TTL de 10 min, indéfiniment, en consommant un des 20
    // slots du LIMIT — file bouchée à vie. La notification in-app, elle, subsiste.
    //
    // La COMPOSITION est DANS le `try`, au même titre que l'envoi. Hors de lui, un gabarit
    // qui jette (une date pourrie, un escapeHtml durci) remonterait hors de la route en 500 :
    // `mark_notifications_emailed` ne serait JAMAIS appelé, les vingt lignes déjà réclamées
    // resteraient claimées avec `email_attempts` INCHANGÉ, et redeviendraient réclamables à
    // chaque TTL — file bouchée à vie, précisément ce que les gardes ci-dessous existent
    // pour empêcher. Le `continue` d'un bras d'échec reste valide depuis un `try`.
    try {
      const kind = str(row.kind) || 'crm_task_assigned';
      if (kind !== 'crm_task_assigned' && kind !== 'fiche_submission_reviewed') {
        failed.push({ id, error: 'unsupported_kind' });
        continue;
      }

      let mail: { subject: string; html: string };
      if (kind === 'fiche_submission_reviewed') {
        // L'ISSUE décide de tout le message, et elle ne se devine pas. Le brief proposait un
        // repli sur 'approved' ; il est refusé ici, et c'est le seul écart assumé de la Task :
        // annoncer « vos modifications ont été validées » à un partenaire dont le travail a
        // été refusé est le pire message que ce fichier puisse produire — il ne rouvrira
        // jamais son espace pour corriger, et sa fiche restera bloquée (une seule vérification
        // ouverte à la fois). Le trigger de résolution écrit TOUJOURS une issue parmi les
        // trois : une issue absente signifie un payload que ce relais ne sait pas composer,
        // exactement comme une espèce inconnue — même traitement, même bras p_failed. L'état
        // reste lisible sur /espace, et email_error nomme la cause côté office.
        const outcome = str(row.outcome);
        if (!isSubmissionOutcome(outcome)) {
          failed.push({ id, error: 'unknown_outcome' });
          continue;
        }
        const reviewData: SubmissionReviewedEmailData = {
          objectName: str(row.object_name) || 'Votre fiche',
          outcome,
          recipientName: nstr(row.recipient_name),
          // L'espace du partenaire, JAMAIS /crm : la persona `actor` ne peut pas l'ouvrir.
          appUrl: `${origin}/espace`,
          // …et la porte de récupération d'accès : ce lecteur-là a posé son mot de passe une
          // seule fois, il y a des mois, et le lien ci-dessus le dépose sur un mur de connexion.
          loginUrl: `${origin}/login`,
        };
        mail = {
          subject: submissionReviewedEmailSubject(reviewData),
          html: renderSubmissionReviewedEmailHtml(reviewData),
        };
      } else {
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
        mail = {
          subject: taskAssignedEmailSubject(emailData),
          html: renderTaskAssignedEmailHtml(emailData),
        };
      }

      await sendMail({ to, subject: mail.subject, html: mail.html });
      sent.push(id);
    } catch (err) {
      // UN seul bras d'échec pour la composition ET l'envoi : dans les deux cas la ligne
      // est acquittée en p_failed (email_attempts+1, claim levé), jamais laissée en suspens.
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
