import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase-server";
import { readPartnerInvitationContextForOffice } from "@/lib/portal-office.server";
import { sendMail } from "@/lib/mail.server";
import {
  renderPartnerReminderEmailHtml,
  partnerReminderEmailSubject,
} from "@/emails/PartnerReminderEmail";

export const runtime = "nodejs";
export const maxDuration = 240;
const str = (value: unknown) => (typeof value === "string" ? value : "");
export async function POST(req: NextRequest) {
  // Appel exclusivement serveur. Le worker local n'expose jamais la clé dans une URL.
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  const supplied = (req.headers.get("authorization") ?? "").replace(
    /^Bearer /,
    "",
  );
  if (
    !key ||
    Buffer.byteLength(key) !== Buffer.byteLength(supplied) ||
    !timingSafeEqual(Buffer.from(key), Buffer.from(supplied))
  )
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (
    process.env.PORTAL_REMINDERS_ENABLED === "false" ||
    process.env.NEXT_PUBLIC_ENABLE_DEMO_MODE === "true"
  )
    return NextResponse.json({ sent: 0, disabled: true });
  let origin: string;
  try {
    const url = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "");
    if (url.protocol !== "https:") throw new Error();
    origin = url.origin;
  } catch {
    return NextResponse.json(
      { error: "application_url_required" },
      { status: 503 },
    );
  }
  const server = getServerSupabaseClient();
  if (!server)
    return NextResponse.json(
      { error: "server_misconfigured" },
      { status: 503 },
    );
  const { data, error } = await server
    .schema("api")
    .rpc("claim_portal_reminders", { p_limit: 20 });
  if (error)
    return NextResponse.json({ error: "claim_failed" }, { status: 503 });
  let sent = 0,
    failed = 0,
    skipped = 0;
  for (const row of (Array.isArray(data) ? data : []) as Record<
    string,
    unknown
  >[]) {
    const id = str(row.id),
      claim = str(row.claim),
      userId = str(row.userId),
      actorId = str(row.actorId),
      orgId = str(row.orgId),
      email = str(row.email);
    let delivered = false,
      reason = "delivery_failed";
    try {
      const [account, profile] = await Promise.all([
        server.auth.admin.getUserById(userId),
        server
          .from("app_user_profile")
          .select("actor_id,role")
          .eq("id", userId)
          .maybeSingle(),
      ]);
      const user = account.data?.user;
      if (account.error || profile.error) throw new Error();
      if (
        !user ||
        user.last_sign_in_at ||
        user.email?.toLowerCase() !== email.toLowerCase() ||
        profile.data?.actor_id !== actorId ||
        profile.data?.role !== "actor"
      ) {
        reason = "account_changed";
        skipped++;
        continue;
      }
      const context = await readPartnerInvitationContextForOffice(
        server,
        orgId,
        actorId,
      );
      if (!context.email.ficheNames.length) {
        reason = "scope_changed";
        skipped++;
        continue;
      }
      const redirectTo = `${origin}/set-password?espace=1`;
      // GenerateLink sait renouveler une invitation non confirmée sans supprimer le
      // compte. Un compte déjà confirmé reçoit un magic link sur CE même identifiant.
      const generated = await server.auth.admin.generateLink({
        type: user.email_confirmed_at ? "magiclink" : "invite",
        email,
        options: { redirectTo },
      });
      const link = generated.data?.properties?.action_link;
      let valid = false;
      try {
        const url = new URL(link ?? "");
        valid =
          url.protocol === "https:" &&
          url.searchParams.get("redirect_to") === redirectTo;
      } catch {
        /* refus avant envoi */
      }
      if (
        generated.error ||
        generated.data?.user?.id !== userId ||
        !link ||
        !valid
      )
        throw new Error();
      const start = await server
        .schema("api")
        .rpc("start_portal_reminder", { p_id: id, p_claim: claim });
      if (start.error) throw new Error();
      if (start.data !== true) {
        reason = "claim_expired";
        skipped++;
        continue;
      }
      const mail = { ...context.email, invitationUrl: link };
      await sendMail({
        orgId,
        to: email,
        subject: partnerReminderEmailSubject(mail),
        html: renderPartnerReminderEmailHtml(mail),
      });
      delivered = true;
      sent++;
    } catch {
      failed++;
    } finally {
      try {
        const ack = await server
          .schema("api")
          .rpc("finish_portal_reminder", {
            p_id: id,
            p_claim: claim,
            p_sent: delivered,
            p_error: delivered ? null : reason,
          });
        if (ack.error)
          console.error("[portal-reminders] delivery acknowledgement failed");
      } catch {
        console.error(
          "[portal-reminders] delivery acknowledgement unavailable",
        );
      }
    }
  }
  return NextResponse.json(
    { sent, failed, skipped },
    { headers: { "Cache-Control": "no-store" } },
  );
}
