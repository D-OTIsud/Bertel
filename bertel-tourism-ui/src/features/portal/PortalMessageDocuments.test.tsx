import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PortalMessageDocuments } from "./PortalMessageDocuments";
import { CrmTimeline, type CrmTimelineCardItem } from "../crm/crm-primitives";
import * as messages from "../../services/portal-message";
import * as photos from "../../services/portal-photos";

jest.mock("../../services/portal-message", () => ({ ...jest.requireActual("../../services/portal-message"), listPortalMessageDocuments: jest.fn(), getPortalMessageDocumentUrl: jest.fn() }));
jest.mock("../../services/portal-photos", () => ({ ...jest.requireActual("../../services/portal-photos"), getPortalPhotoPreview: jest.fn() }));
const mocked = jest.mocked(messages), preview = jest.mocked(photos.getPortalPhotoPreview);
const DOC = "00000000-0000-4000-a000-00000000f101", EXCHANGE = "00000000-0000-4000-a000-00000000f102";
const signed = "https://preview.test/signed-photo";
const photo = { documentId: DOC, title: "Façade le soir" };
function setup(interactionId = EXCHANGE) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { client, ...render(<QueryClientProvider client={client}><PortalMessageDocuments interactionId={interactionId} /></QueryClientProvider>) };
}
beforeEach(() => {
  jest.clearAllMocks();
  mocked.listPortalMessageDocuments.mockResolvedValue({ documents: [], replyTo: "", photoReview: photo });
  preview.mockResolvedValue(signed); mocked.getPortalMessageDocumentUrl.mockResolvedValue("https://preview.test/signed-document");
});
afterEach(() => jest.restoreAllMocks());

test.each(["refus humain B", "recours P"])("CRM %s : ouvre uniquement la photo typée de cet échange", async (kind) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }), openActor = jest.fn();
  const item: CrmTimelineCardItem = { id: EXCHANGE, interactionType: "mail", subject: `Révision — ${kind}`, body: "Merci de revoir la photo.",
    occurredAt: "2026-11-04T12:00:00Z", topicName: "Correction", sentimentCode: null, sentimentName: null,
    objectId: "RESRUN999999B201", objectName: "Le Longanis", ownerName: "Partenaire", actorId: "actor-1", source: "portal", status: "new" };
  render(<QueryClientProvider client={client}><CrmTimeline items={[item]} onOpenActor={openActor} /></QueryClientProvider>);
  const button = await screen.findByRole("button", { name: "Préparer l’aperçu : Façade le soir" });
  expect(preview).not.toHaveBeenCalled(); await userEvent.click(button);
  const link = await screen.findByRole("link", { name: "Ouvrir la photo : Façade le soir" });
  expect(screen.getByRole("status")).toHaveTextContent("L’aperçu est prêt. Ouvrez la photo dans un nouvel onglet.");
  expect(link).toHaveAttribute("href", signed); expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noopener noreferrer"); expect(preview).toHaveBeenCalledWith(DOC);
  expect(mocked.listPortalMessageDocuments).toHaveBeenCalledWith(EXCHANGE);
  expect(mocked.getPortalMessageDocumentUrl).not.toHaveBeenCalled(); expect(openActor).not.toHaveBeenCalled();
});

test("ancienne réponse sans photoReview : pièces jointes et adresse de réponse inchangées", async () => {
  mocked.listPortalMessageDocuments.mockResolvedValue({ documents: [{ id: "document-1", title: "Certificat.pdf" }], replyTo: "auteur@example.test" });
  setup(); await userEvent.click(await screen.findByRole("button", { name: "Certificat.pdf" }));
  expect(await screen.findByRole("link", { name: "Ouvrir Certificat.pdf" })).toHaveAttribute("href", "https://preview.test/signed-document");
  expect(screen.getByRole("link", { name: "auteur@example.test" })).toHaveAttribute("href", "mailto:auteur@example.test");
  expect(screen.queryByRole("region", { name: "Révision photo" })).not.toBeInTheDocument(); expect(preview).not.toHaveBeenCalled();
});

test("aperçu refusé : erreur lisible, aucun lien privé, nouvel essai authentifié", async () => {
  preview.mockRejectedValueOnce(new Error("forbidden")); setup();
  await userEvent.click(await screen.findByRole("button", { name: /Préparer l’aperçu/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent("La photo n’a pas pu être ouverte.");
  expect(screen.queryByRole("link", { name: /Ouvrir la photo/ })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
  expect(await screen.findByRole("link", { name: /Ouvrir la photo/ })).toHaveAttribute("href", signed);
  expect(preview.mock.calls).toEqual([[DOC], [DOC]]);
});

test("l’expiration impose de préparer un nouvel aperçu avant de suivre le lien", async () => {
  const now = jest.spyOn(Date, "now").mockReturnValue(1_000_000); setup();
  await userEvent.click(await screen.findByRole("button", { name: /Préparer l’aperçu/ }));
  const oldLink = await screen.findByRole("link", { name: /Ouvrir la photo/ });
  now.mockReturnValue(1_101_000); preview.mockResolvedValueOnce("https://preview.test/new-signed-photo");
  fireEvent.click(oldLink);
  await waitFor(() => expect(preview).toHaveBeenCalledTimes(2));
  expect(await screen.findByRole("link", { name: /Ouvrir la photo/ })).toHaveAttribute("href", "https://preview.test/new-signed-photo");
});

test("un autre échange doit revérifier l’aperçu, même pour le même document", async () => {
  const view = setup(); await userEvent.click(await screen.findByRole("button", { name: /Préparer l’aperçu/ }));
  await screen.findByRole("link", { name: /Ouvrir la photo/ });
  view.rerender(<QueryClientProvider client={view.client}><PortalMessageDocuments interactionId="other-exchange" /></QueryClientProvider>);
  await screen.findByRole("button", { name: /Préparer l’aperçu/ }); expect(screen.queryByRole("link", { name: /Ouvrir la photo/ })).not.toBeInTheDocument();
  expect(preview).toHaveBeenCalledTimes(1); await userEvent.click(screen.getByRole("button", { name: /Préparer l’aperçu/ }));
  await waitFor(() => expect(preview).toHaveBeenCalledTimes(2));
});

test("un refus de lecture de l’échange ne déduit jamais de photo depuis le message", async () => {
  mocked.listPortalMessageDocuments.mockRejectedValueOnce(new Error("forbidden")); setup();
  expect(await screen.findByRole("alert")).toHaveTextContent("Les pièces jointes n’ont pas pu être chargées.");
  expect(screen.queryByRole("button", { name: /Préparer l’aperçu/ })).not.toBeInTheDocument(); expect(preview).not.toHaveBeenCalled();
});
