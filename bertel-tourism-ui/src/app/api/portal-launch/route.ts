import { NextResponse, type NextRequest } from "next/server";
import { authenticated, callerClient } from "../_document-auth";
import { BodyTooLargeError, readBoundedJson } from "@/lib/request-body.server";
import { readOfficeIdentity } from "@/lib/portal-office.server";
import { sendMail } from "@/lib/mail.server";
import {
  renderPartnerInvitationEmailHtml,
  partnerInvitationEmailSubject,
} from "@/emails/PartnerInvitationEmail";

export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  const auth = await authenticated(req);
  if (!auth.ok) return auth.response;
  let body: Record<string, unknown>;
  try {
    body = (await readBoundedJson(req, 2048)) as Record<string, unknown>;
  } catch (error) {
    return NextResponse.json(
      { error: "invalid_body" },
      { status: error instanceof BodyTooLargeError ? 413 : 400 },
    );
  }
  if (
    !body ||
    typeof body.orgId !== "string" ||
    body.orgId.length > 100 ||
    !["read", "test"].includes(String(body.action))
  )
    return NextResponse.json({ error: "invalid_request" }, { status: 422 });
  const { data, error } = await callerClient(auth.jwt)
    .schema("api")
    .rpc("get_portal_launch", { p_org_id: body.orgId });
  if (error || !data)
    return NextResponse.json(
      { error: "launch_unavailable" },
      { status: error?.code === "42501" ? 403 : 500 },
    );
  // Les lectures service_role suivent le contrôle administratif EN TANT QU'APPELANT.
  try {
    const office = await readOfficeIdentity(auth.server, body.orgId);
    let appUrl: string | null = null;
    try {
      const url = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "");
      if (url.protocol === "https:") appUrl = url.origin;
    } catch {
      /* prérequis affiché */
    }
    const invitation = {
      officeName: office.name,
      officeLogoUrl: office.logoUrl,
      recipientName: null,
      ficheNames: ["Votre établissement"],
      invitationUrl: appUrl ? `${appUrl}/espace/login` : "",
      theme: office.theme,
    };
    if (body.action === "test") {
      const { data: user, error: userError } =
        await auth.server.auth.admin.getUserById(auth.userId);
      if (userError || !user?.user?.email || !appUrl)
        return NextResponse.json(
          { error: "test_unavailable" },
          { status: 422 },
        );
      await sendMail({
        orgId: body.orgId,
        to: user.user.email,
        subject: `[TEST] ${partnerInvitationEmailSubject(invitation)}`,
        html: renderPartnerInvitationEmailHtml(invitation),
      });
      return NextResponse.json(
        { sent: true },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      {
        ...data,
        office: { name: office.name, email: office.email, phone: office.phone },
        applicationConfigured: !!appUrl,
        invitationHtml: renderPartnerInvitationEmailHtml(invitation),
        remindersEnabled:
          process.env.PORTAL_REMINDERS_ENABLED !== "false" &&
          process.env.NEXT_PUBLIC_ENABLE_DEMO_MODE !== "true",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "office_unavailable" }, { status: 503 });
  }
}
