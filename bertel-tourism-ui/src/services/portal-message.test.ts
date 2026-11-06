import { getApiClient } from "../lib/supabase";
import { listPortalMessageDocuments } from "./portal-message";
jest.mock("../lib/supabase", () => ({ getApiClient: jest.fn() }));
const rpc = jest.fn(), DOC = "00000000-0000-4000-a000-00000000f101";
beforeEach(() => {
  rpc.mockReset();
  jest.mocked(getApiClient).mockReturnValue({ schema: () => ({ rpc }) } as unknown as ReturnType<typeof getApiClient>);
});
test("lecteur ancien : documents et adresse restent lisibles sans lien photo", async () => {
  rpc.mockResolvedValue({ data: { documents: [{ id: "document-1", title: "Attestation.pdf" }], replyTo: "auteur@example.test" }, error: null });
  await expect(listPortalMessageDocuments("exchange-1")).resolves.toEqual({ documents: [{ id: "document-1", title: "Attestation.pdf" }], replyTo: "auteur@example.test", photoReview: null });
});
test("identité photo seulement dans le champ typé : ni URL ni chemin ni métadonnées libres", async () => {
  rpc.mockResolvedValue({ data: { documents: [], replyTo: "", photoReview: { documentId: DOC, title: "Façade", url: "https://forged.test/image", path: "private/secret.jpg", bucket: "actor-documents" },
    extra: { documentId: "unrelated", photoReview: { documentId: "forged" } } }, error: null });
  await expect(listPortalMessageDocuments("exchange-1")).resolves.toEqual({ documents: [], replyTo: "", photoReview: { documentId: DOC, title: "Façade" } });
  expect(rpc).toHaveBeenCalledWith("list_portal_message_documents", { p_interaction_id: "exchange-1" });
});
test.each([undefined, { url: "https://forged.test/photo" }, { documentId: "private/path.jpg" }])("sans identité typée valide, aucune photo n’est fabriquée (%j)", async (photoReview) => {
  rpc.mockResolvedValue({ data: { documents: [], photoReview, extra: { photo_review_document_id: DOC } }, error: null });
  expect((await listPortalMessageDocuments("exchange-1")).photoReview).toBeNull();
});
test("une lecture refusée reste un échec sans repli", async () => {
  rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
  await expect(listPortalMessageDocuments("exchange-1")).rejects.toThrow(); expect(rpc).toHaveBeenCalledTimes(1);
});
