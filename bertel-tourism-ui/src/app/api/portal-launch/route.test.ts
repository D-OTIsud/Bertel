/** @jest-environment node */
jest.mock("server-only", () => ({}));
jest.mock("../_document-auth", () => ({
  authenticated: jest.fn(),
  callerClient: jest.fn(),
}));
jest.mock("@/lib/portal-office.server", () => ({
  readOfficeIdentity: jest.fn(),
}));
jest.mock("@/lib/mail.server", () => ({ sendMail: jest.fn() }));
import { NextRequest, NextResponse } from "next/server";
import { POST } from "./route";
import { authenticated, callerClient } from "../_document-auth";
import { readOfficeIdentity } from "@/lib/portal-office.server";
import { sendMail } from "@/lib/mail.server";
function setup(denied = false) {
  const rpc = jest
    .fn()
    .mockResolvedValue({
      data: denied ? null : { actors: [], stats: { reachable: 0 } },
      error: denied ? { code: "42501" } : null,
    });
  const getUserById = jest
    .fn()
    .mockResolvedValue({
      data: { user: { email: "admin@example.test" } },
      error: null,
    });
  jest
    .mocked(authenticated)
    .mockResolvedValue({
      ok: true,
      jwt: "caller",
      userId: "admin",
      server: { auth: { admin: { getUserById } } },
    } as never);
  jest
    .mocked(callerClient)
    .mockReturnValue({ schema: () => ({ rpc }) } as never);
  jest
    .mocked(readOfficeIdentity)
    .mockResolvedValue({
      id: "ORG",
      name: "Office",
      email: "office@example.test",
      phone: "0262000000",
      logoUrl: null,
      theme: {},
    } as never);
  return { rpc, getUserById };
}
const req = (action = "read") =>
  new NextRequest("http://localhost/api/portal-launch", {
    method: "POST",
    body: JSON.stringify({ action, orgId: "ORG", email: "other@example.test" }),
  });
beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
});
test("authentifie puis vérifie l’administration de cet office avant les lectures privilégiées", async () => {
  setup(true);
  expect((await POST(req())).status).toBe(403);
  expect(readOfficeIdentity).not.toHaveBeenCalled();
  expect(sendMail).not.toHaveBeenCalled();
});
test("un visiteur ne lit pas les partenaires", async () => {
  setup();
  jest
    .mocked(authenticated)
    .mockResolvedValue({
      ok: false,
      response: NextResponse.json(
        { error: "unauthenticated" },
        { status: 401 },
      ),
    });
  expect((await POST(req())).status).toBe(401);
  expect(callerClient).not.toHaveBeenCalled();
});
test("le test part uniquement vers l’administrateur connecté par le SMTP de l’office", async () => {
  const { getUserById } = setup();
  expect((await POST(req("test"))).status).toBe(200);
  expect(getUserById).toHaveBeenCalledWith("admin");
  expect(sendMail).toHaveBeenCalledWith(
    expect.objectContaining({
      orgId: "ORG",
      to: "admin@example.test",
      subject: expect.stringContaining("[TEST]"),
    }),
  );
});
