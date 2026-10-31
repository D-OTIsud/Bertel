import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PortalWriteOffice } from "./PortalWriteOffice";
import * as service from "../../services/portal-message";
jest.mock("../../services/portal-message", () => ({
  ...jest.requireActual("../../services/portal-message"),
  listMyPortalMessages: jest.fn(),
  sendPortalMessage: jest.fn(),
  uploadPortalMessageAttachment: jest.fn(),
}));
const mocked = jest.mocked(service);
function setup(initialSubject?: string) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <PortalWriteOffice
        objectId="HOTRUN0000000001"
        ficheName="Le Longanis"
        email="contact@example.test"
        initialSubject={initialSubject}
      />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  mocked.listMyPortalMessages.mockResolvedValue([]);
  mocked.sendPortalMessage.mockResolvedValue("message-id");
});
test("les sept sujets exacts de la maquette, aucun choix par défaut ni canal de promotion", () => {
  setup();
  expect(screen.getAllByRole("radio")).toHaveLength(7);
  screen.getAllByRole("radio").forEach((r) => expect(r).not.toBeChecked());
  expect(
    screen.getByRole("radio", { name: "Me faire connaître" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByText(/Facebook|promotion SIT|Explore/),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Envoyer le message" }),
  ).toBeDisabled();
});
test("provenance correction pré-cochée et exemple de la maquette", () => {
  setup("correction");
  expect(
    screen.getByRole("radio", { name: "Une erreur ou une modification" }),
  ).toBeChecked();
  expect(
    screen.getByPlaceholderText(
      "Par exemple : notre adresse a changé, ou notre nom commercial change le mois prochain.",
    ),
  ).toBeInTheDocument();
});
test("un échec conserve texte et sujet ; un réessai garde la même clé d’idempotence", async () => {
  mocked.sendPortalMessage.mockRejectedValueOnce(
    new Error("Envoi impossible."),
  );
  setup("fermeture");
  fireEvent.change(screen.getByLabelText("Votre message"), {
    target: { value: "Fermé pour travaux." },
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Envoyer le message" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Envoi impossible.",
  );
  expect(screen.getByLabelText("Votre message")).toHaveValue(
    "Fermé pour travaux.",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Envoyer le message" }),
  );
  await screen.findByText("Votre message a bien été envoyé à l’office.");
  expect(mocked.sendPortalMessage.mock.calls[0][0]).toEqual(
    mocked.sendPortalMessage.mock.calls[1][0],
  );
  expect(mocked.sendPortalMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      objectId: "HOTRUN0000000001",
      subject: "fermeture",
      body: "Fermé pour travaux.",
      replyTo: "contact@example.test",
      attachments: [],
    }),
  );
  expect(screen.getByLabelText("Votre message")).toHaveValue("");
});
test("la pièce proposée pour un label est privée et reste visible après changement de sujet", async () => {
  mocked.uploadPortalMessageAttachment.mockResolvedValue({
    id: "doc-1",
    title: "Certificat.pdf",
  });
  setup("label");
  fireEvent.change(
    screen.getByLabelText("Joindre le certificat (facultatif)"),
    {
      target: {
        files: [
          new File(["abc"], "Certificat.pdf", { type: "application/pdf" }),
        ],
      },
    },
  );
  await screen.findByText("Certificat.pdf");
  await userEvent.click(screen.getByRole("radio", { name: "Des conseils" }));
  expect(screen.getByText("Certificat.pdf")).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Retirer Certificat.pdf du message" }),
  );
  expect(screen.queryByText("Certificat.pdf")).not.toBeInTheDocument();
});
test("une panne d’historique a une action de reprise", async () => {
  mocked.listMyPortalMessages.mockRejectedValueOnce(new Error("Network"));
  setup();
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Vos échanges n’ont pas pu être chargés.",
    ),
  );
  await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
  await screen.findByText(/Aucun message pour l’instant/);
});
