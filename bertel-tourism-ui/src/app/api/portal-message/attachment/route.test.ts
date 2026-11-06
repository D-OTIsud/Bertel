/** @jest-environment node */
import { POST, PUT } from "./route";
import { authenticated, callerClient } from "../../_document-auth";
import { processActorDocumentBuffer } from "../../actor-document/process-actor-document";
jest.mock("../../_document-auth", () => ({
  authenticated: jest.fn(),
  callerClient: jest.fn(),
  PRIVATE_BUCKET: "actor-documents",
  UUID_SHAPE: /^[0-9a-f-]{36}$/i,
}));
jest.mock("../../actor-document/process-actor-document", () => ({
  ACTOR_PDF_MAX_BYTES: 5 * 1024 * 1024,
  processActorDocumentBuffer: jest.fn(async () => ({
    buffer: Buffer.from("processed"),
    mimeType: "image/jpeg",
    extension: "jpg",
  })),
}));
jest.mock("@/lib/request-body.server", () => ({
  ...jest.requireActual("@/lib/request-body.server"),
  readBoundedFormData: jest.fn((req) => req.formData()),
  readBoundedJson: jest.fn((req)=>req.json()),
}));
const rpc = jest.fn(),
  upload = jest.fn(),
  remove = jest.fn(),
  sign = jest.fn(),
  from = jest.fn();
const actor = "00000000-0000-4000-a000-000000008202",
  doc = "00000000-0000-4000-a000-000000008204";
function req(form?: FormData, body?: unknown): never {
  return {
    headers: new Headers(),
    formData: async () => form,
    json: async () => body,
  } as never;
}
function form(
  file = new File(["abc"], "certificat.jpg", { type: "image/jpeg" }),
) {
  const f = new FormData();
  f.append("object_id", "HOTRUN0000000001");
  f.append("file", file);
  return f;
}
beforeEach(() => {
  jest.clearAllMocks();
  rpc.mockResolvedValue({ data: { actorId: actor }, error: null });
  upload.mockResolvedValue({ error: null });
  remove.mockResolvedValue({ error: null });
  from.mockImplementation((table) =>
    table === "ref_document"
      ? {
          insert: () => ({
            select: () => ({
              single: async () => ({ data: { id: doc }, error: null }),
            }),
          }),
          delete: () => ({ eq: async () => ({ error: null }) }),
        }
      : { insert: async () => ({ error: null }) },
  );
  jest
    .mocked(authenticated)
    .mockResolvedValue({
      ok: true,
      userId: "user",
      jwt: "caller-jwt",
      server: {
        storage: { from: () => ({ upload, remove, createSignedUrl: sign }) },
        from,
      },
    } as never);
  jest
    .mocked(callerClient)
    .mockReturnValue({ schema: () => ({ rpc }) } as never);
});
test("aucun stockage ni traitement sans authentification", async () => {
  jest
    .mocked(authenticated)
    .mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 401 }),
    } as never);
  expect((await POST(req(form()))).status).toBe(401);
  expect(upload).not.toHaveBeenCalled();
  expect(processActorDocumentBuffer).not.toHaveBeenCalled();
});
test("fiche d’autrui ou non persona refusée avant le service de stockage", async () => {
  rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
  expect((await POST(req(form()))).status).toBe(403);
  expect(upload).not.toHaveBeenCalled();
  expect(from).not.toHaveBeenCalled();
  expect(processActorDocumentBuffer).not.toHaveBeenCalled();
});
test("5 Mo maximum et aucune écriture si le fichier est trop grand", async () => {
  const file = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.jpg", {
    type: "image/jpeg",
  });
  expect((await POST(req(form(file)))).status).toBe(413);
  expect(upload).not.toHaveBeenCalled();
});
test("dépose les octets traités dans le bucket privé et enregistre la preuve serveur", async () => {
  const result = await POST(req(form()));
  expect(result.status).toBe(201);
  expect(upload).toHaveBeenCalledWith(
    expect.stringMatching(new RegExp(`^portal-messages/${actor}/`)),
    Buffer.from("processed"),
    expect.objectContaining({ upsert: false, contentType: "image/jpeg" }),
  );
  expect(await result.json()).toEqual({ id: doc, title: "certificat.jpg" });
  expect(callerClient).toHaveBeenCalledWith("caller-jwt");
});
test("ne signe pas une URL forgée ni un document non autorisé", async () => {
  rpc.mockResolvedValue({
    data: { bucket: "media", path: "secret" },
    error: null,
  });
  expect((await PUT(req(undefined, { documentId: doc }))).status).toBe(403);
  expect(sign).not.toHaveBeenCalled();
});
test("URL temporaire 120 s, aucun cache", async () => {
  rpc.mockResolvedValue({
    data: {
      bucket: "actor-documents",
      path: `portal-messages/${actor}/doc.pdf`,
    },
    error: null,
  });
  sign.mockResolvedValue({
    data: { signedUrl: "https://private.test/signed" },
    error: null,
  });
  const result = await PUT(req(undefined, { documentId: doc }));
  expect(result.status).toBe(200);
  expect(sign).toHaveBeenCalledWith(`portal-messages/${actor}/doc.pdf`, 120, {
    download: true,
  });
  expect(result.headers.get("cache-control")).toBe("private, no-store");
});
