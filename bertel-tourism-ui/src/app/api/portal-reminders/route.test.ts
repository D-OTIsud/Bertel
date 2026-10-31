/** @jest-environment node */
jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase-server", () => ({
  getServerSupabaseClient: jest.fn(),
}));
jest.mock("@/lib/portal-office.server", () => ({
  readPartnerInvitationContextForOffice: jest.fn(),
}));
jest.mock("@/lib/mail.server", () => ({ sendMail: jest.fn() }));
import { NextRequest } from "next/server";
import { POST } from "./route";
import { getServerSupabaseClient } from "@/lib/supabase-server";
import { readPartnerInvitationContextForOffice } from "@/lib/portal-office.server";
import { sendMail } from "@/lib/mail.server";
const row = {
  id: "invitation",
  claim: "lease",
  userId: "partner-user",
  actorId: "actor",
  orgId: "ORG",
  email: "partner@example.test",
};
function setup({
  active = false,
  start = true,
  link = true,
  ackError = false,
} = {}) {
  const user = {
    id: "partner-user",
    email: "partner@example.test",
    last_sign_in_at: active ? "2026-10-30" : null,
    email_confirmed_at: null,
  };
  const generateLink = jest
    .fn()
    .mockResolvedValue({
      data: {
        user,
        properties: {
          action_link: link
            ? "https://project.supabase.co/auth/v1/verify?redirect_to=https%3A%2F%2Fapp.example.test%2Fset-password%3Fespace%3D1"
            : "https://project.supabase.co/auth/v1/verify?redirect_to=https://wrong.example.test",
        },
      },
      error: null,
    });
  const rpc = jest.fn(async (name: string) => ({
    data:
      name === "claim_portal_reminders"
        ? [row]
        : name === "start_portal_reminder"
          ? start
          : null,
    error:
      name === "finish_portal_reminder" && ackError
        ? { message: "lost" }
        : null,
  }));
  const server = {
    schema: () => ({ rpc }),
    auth: {
      admin: {
        getUserById: jest
          .fn()
          .mockResolvedValue({ data: { user }, error: null }),
        generateLink,
        deleteUser: jest.fn(),
      },
    },
    from: jest.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { actor_id: "actor", role: "actor" },
            error: null,
          }),
        }),
      }),
    })),
  };
  jest.mocked(getServerSupabaseClient).mockReturnValue(server as never);
  jest
    .mocked(readPartnerInvitationContextForOffice)
    .mockResolvedValue({
      orgId: "ORG",
      email: {
        officeName: "Office",
        officeLogoUrl: null,
        recipientName: "Marie",
        ficheNames: ["La Case"],
      },
    });
  return { server, rpc, generateLink };
}
const req = (token = "secret") =>
  new NextRequest("http://localhost/api/portal-reminders", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ email: "attacker@example.test" }),
  });
beforeEach(() => {
  jest.clearAllMocks();
  process.env.SUPABASE_SERVICE_ROLE_KEY = "secret";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  delete process.env.PORTAL_REMINDERS_ENABLED;
  delete process.env.NEXT_PUBLIC_ENABLE_DEMO_MODE;
  jest.mocked(sendMail).mockResolvedValue();
});
test("refuse avant toute lecture le visiteur et un utilisateur ordinaire", async () => {
  setup();
  const response = await POST(req("normal-jwt"));
  expect(response.status).toBe(401);
  expect(getServerSupabaseClient).not.toHaveBeenCalled();
  expect(sendMail).not.toHaveBeenCalled();
});
test("ne réclame rien si l’adresse de l’application manque", async () => {
  const { rpc } = setup();
  delete process.env.NEXT_PUBLIC_APP_URL;
  expect((await POST(req())).status).toBe(503);
  expect(rpc).not.toHaveBeenCalled();
});
test("renouvelle le lien du compte existant et envoie depuis l’office au destinataire de la réservation", async () => {
  const { server, rpc, generateLink } = setup();
  const response = await POST(req());
  expect(await response.json()).toEqual({ sent: 1, failed: 0, skipped: 0 });
  expect(generateLink).toHaveBeenCalledWith({
    type: "invite",
    email: row.email,
    options: { redirectTo: "https://app.example.test/set-password?espace=1" },
  });
  expect(sendMail).toHaveBeenCalledWith(
    expect.objectContaining({ orgId: "ORG", to: row.email }),
  );
  expect(server.auth.admin.deleteUser).not.toHaveBeenCalled();
  expect(rpc).toHaveBeenCalledWith("start_portal_reminder", {
    p_id: row.id,
    p_claim: row.claim,
  });
  expect(rpc).toHaveBeenCalledWith(
    "finish_portal_reminder",
    expect.objectContaining({ p_sent: true }),
  );
});
test("un compte activé depuis la réservation ne reçoit pas de lien", async () => {
  const { generateLink } = setup({ active: true });
  expect(await (await POST(req())).json()).toMatchObject({
    sent: 0,
    skipped: 1,
  });
  expect(generateLink).not.toHaveBeenCalled();
  expect(sendMail).not.toHaveBeenCalled();
});
test.each([{ start: false }, { link: false }])(
  "refuse une réservation périmée ou un retour Auth mal configuré %j",
  async (options) => {
    setup(options);
    await POST(req());
    expect(sendMail).not.toHaveBeenCalled();
  },
);
test("un acquittement perdu est rapporté sans renvoyer le message dans la même exécution", async () => {
  const spy = jest.spyOn(console, "error").mockImplementation(() => {});
  setup({ ackError: true });
  await POST(req());
  expect(sendMail).toHaveBeenCalledTimes(1);
  expect(spy).toHaveBeenCalled();
  spy.mockRestore();
});
