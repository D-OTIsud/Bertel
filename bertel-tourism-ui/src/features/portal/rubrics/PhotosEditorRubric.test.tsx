import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PhotosEditorRubric } from "./PhotosEditorRubric";
import { fakeEditor, portalModules } from "../__fixtures__/portal-fixtures";
import { PORTAL_RUBRICS, type BuiltPortalRubric } from "../portal-rubrics";
import * as service from "../../../services/portal-photos";

jest.mock("../../../services/portal-photos", () => ({ ...jest.requireActual("../../../services/portal-photos"),
  getPortalPhotoWorkspace: jest.fn(), updatePortalPhotoTexts: jest.fn(), listMyPortalPhotos: jest.fn(),
  withdrawPortalPhoto: jest.fn(), reorderPortalPhotos: jest.fn(), uploadPortalPhoto: jest.fn(),
  cancelPortalPhotoUpload: jest.fn(), getPortalPhotoPreview: jest.fn(),
  analyzePortalPhoto: jest.fn(), getPortalPhotoAnalysis: jest.fn(), appealPortalPhotoAnalysis: jest.fn(), appealPortalPhotoReview: jest.fn(),
}));
const mocked = jest.mocked(service);
const ID1 = "00000000-0000-4000-a000-000000008405", ID2 = "00000000-0000-4000-a000-000000008406";
const DOC = "00000000-0000-4000-a000-000000008407", REQ = "00000000-0000-4000-a000-000000008408";
const snapshot = (title: string, description = "") => ({ title, description, title_i18n: {}, description_i18n: {}, revision: "text-revision-1" });
const photos = [
  { id: ID1, url: "https://example.test/1.jpg", title: "Façade", description: "L’entrée du restaurant.", credit: "", position: 1, isMain: true, portalDocumentId: null, textSnapshot: snapshot("Façade", "L’entrée du restaurant.") },
  { id: ID2, url: "https://example.test/2.jpg", title: "Terrasse", description: "", credit: "", position: 2, isMain: false, portalDocumentId: null, textSnapshot: snapshot("Terrasse") },
];
type Workspace = Awaited<ReturnType<typeof service.getPortalPhotoWorkspace>>;
let current: Workspace;
function proposal(over: Partial<Workspace["proposals"][number]> = {}): Workspace["proposals"][number] {
  return { documentId: DOC, title: "Jardin", description: "Les tables sous les arbres.", status: "pending", replaceMediaId: null,
    changeId: null, submittedAt: null, reviewNote: null, textSnapshot: snapshot("Jardin", "Les tables sous les arbres."), analysis: null, reviewAppeal: null, canAppeal: false, ...over };
}
function fresh(): Workspace {
  return { published: photos.map((photo) => ({ ...photo })), proposals: [], analysisEnabled: false, writesEnabled: true,
    orderSnapshot: photos.map((photo) => ({ id: photo.id, position: photo.position, isMain: photo.isMain, revision: "order-revision-1" })), orderNeedsNormalization: false,
    capacity: { limit: 20, published: 2, reserved: 0, used: 2, remaining: 18 } };
}
function setup(cache?: Map<string, unknown>, options: { modules?: ReturnType<typeof portalModules>; baseline?: ReturnType<typeof portalModules>; rubric?: Partial<BuiltPortalRubric> } = {}) {
  const modules = options.modules ?? portalModules(), editor = fakeEditor(modules, {}, options.baseline ?? modules), onDone = jest.fn(), onDirtyChange = jest.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><PhotosEditorRubric editor={editor}
    rubric={{ ...PORTAL_RUBRICS.find((rubric) => rubric.id === "photos")!, state: "filled", readOnlyReason: null, ...options.rubric } as BuiltPortalRubric}
    archetype="RES" formKey="photos" formCache={cache} onDone={onDone} onCancel={jest.fn()} onDirtyChange={onDirtyChange} /></QueryClientProvider>);
  return { editor, onDone, client, onDirtyChange };
}
async function open(name = "Façade") {
  await userEvent.click(await screen.findByRole("button", { name: `Détails de ${name}` }));
  return screen.getByRole("dialog", { name });
}
async function queue(fileName = "Nouvelle.jpg") {
  await screen.findByRole("button", { name: "Détails de Façade" });
  fireEvent.change(screen.getByLabelText("Choisir des photos"), { target: { files: [new File(["image"], fileName, { type: "image/jpeg" })] } });
  return screen.getByRole("dialog", { name: "Préparer vos photos" });
}
beforeEach(() => {
  jest.clearAllMocks(); current = fresh();
  mocked.getPortalPhotoWorkspace.mockImplementation(async () => current);
  mocked.getPortalPhotoPreview.mockResolvedValue("https://private.test/signed");
  mocked.updatePortalPhotoTexts.mockImplementation(async (input) => {
    if (input.target === "published") current = { ...current, published: current.published.map((photo) => photo.id === input.id ? { ...photo, title: input.title, description: input.description, textSnapshot: snapshot(input.title, input.description) } : photo) };
    else current = { ...current, proposals: current.proposals.map((photo) => photo.documentId === input.id ? { ...photo, title: input.title, description: input.description, textSnapshot: snapshot(input.title, input.description) } : photo) };
    return current;
  });
  mocked.reorderPortalPhotos.mockImplementation(async (_objectId, ids) => {
    const next = ids.map((id, index) => ({ ...current.published.find((photo) => photo.id === id)!, position: index + 1, isMain: index === 0 }));
    current = { ...current, published: next, orderSnapshot: next.map(({ id, position, isMain }) => ({ id, position, isMain, revision: "order-revision-2" })), orderNeedsNormalization: false };
    return next;
  });
  mocked.withdrawPortalPhoto.mockImplementation(async (_objectId, id) => {
    const next = current.published.filter((photo) => photo.id !== id).map((photo, index) => ({ ...photo, isMain: index === 0 }));
    current = { ...current, published: next, proposals: current.proposals.map((photo) => photo.replaceMediaId === id ? { ...photo, replaceMediaId: null } : photo) };
    return next;
  });
  mocked.uploadPortalPhoto.mockImplementation(async (_id, file, _rights, uploadId, replaceId) => {
    current = { ...current, proposals: [...current.proposals, proposal({ documentId: uploadId, title: file.name, description: "", status: "draft", replaceMediaId: replaceId ?? null, textSnapshot: snapshot(file.name) })] };
    return { id: uploadId, title: file.name, width: 1800, height: 1200 };
  });
  mocked.cancelPortalPhotoUpload.mockResolvedValue();
  URL.createObjectURL = jest.fn(() => "blob:local-preview"); URL.revokeObjectURL = jest.fn();
});

test("planche-contact : un seul bouton image/nom, la vraie principale et aucun appel IA au chargement", async () => {
  setup(); await screen.findByRole("button", { name: "Détails de Façade" });
  expect(screen.getAllByText("Principale")).toHaveLength(1);
  expect(screen.getAllByText("En ligne")).toHaveLength(1);
  expect(screen.queryByRole("button", { name: /Retirer/ })).not.toBeInTheDocument();
  expect(mocked.analyzePortalPhoto).not.toHaveBeenCalled();
});

test("l’ancienne principale au rang 2 reste présentée en premier, sans réécriture implicite", async () => {
  current.published = [{ ...photos[0], isMain: false }, { ...photos[1], isMain: true }];
  current.orderNeedsNormalization = true;
  setup(); const list = await screen.findByRole("list");
  expect(within(list).getAllByRole("button")[0]).toHaveAccessibleName("Détails de Terrasse");
  expect(mocked.reorderPortalPhotos).not.toHaveBeenCalled();
});

test("une galerie sans principale garde cet état jusqu’à un classement explicite", async () => {
  current.published = photos.map((photo) => ({ ...photo, isMain: false })); current.orderNeedsNormalization = true;
  setup(); await screen.findByText(/Aucune photo principale n’est définie/);
  expect(screen.queryByText("Principale")).not.toBeInTheDocument(); expect(mocked.reorderPortalPhotos).not.toHaveBeenCalled();
});

test("classer garde un brouillon, cache le suivi et sauvegarde tous les IDs avec la baseline brute", async () => {
  current.proposals = [proposal()]; const { editor } = setup(); const baseline = current.orderSnapshot;
  await userEvent.click(await screen.findByRole("button", { name: "Réorganiser les photos" }));
  expect(screen.getByRole("heading", { name: "Ordre d’affichage" })).toHaveFocus();
  expect(screen.queryByText("Suivi des envois")).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Ajouter" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Descendre Façade" }));
  expect(mocked.reorderPortalPhotos).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByRole("button", { name: "Monter Façade" })).toHaveFocus());
  await userEvent.click(screen.getByRole("button", { name: "Enregistrer l’ordre" }));
  await screen.findByText("L’ordre des photos est enregistré.");
  expect(mocked.reorderPortalPhotos).toHaveBeenCalledWith(editor.objectId, [ID2, ID1], baseline);
  expect(editor.replaceModule).not.toHaveBeenCalled();
});

test("annuler un classement ne fait aucun appel et conserve la galerie", async () => {
  setup(); await userEvent.click(await screen.findByRole("button", { name: "Réorganiser les photos" }));
  await userEvent.click(screen.getByRole("button", { name: "Descendre Façade" })); await userEvent.click(screen.getByRole("button", { name: "Annuler" }));
  await screen.findByRole("button", { name: "Détails de Façade" }); expect(mocked.reorderPortalPhotos).not.toHaveBeenCalled();
});

test("une collection changée ailleurs bloque l’ancien brouillon d’ordre", async () => {
  const { client } = setup(); await userEvent.click(await screen.findByRole("button", { name: "Réorganiser les photos" }));
  current = { ...current, published: [photos[0]], orderSnapshot: [{ id: ID1, position: 1, isMain: true, revision: "order-revision-2" }] };
  act(() => { client.setQueriesData({ queryKey: ["portal-photo-workspace"] }, current); });
  expect(await screen.findByRole("button", { name: "Enregistrer l’ordre" })).toBeDisabled();
  expect(screen.getByRole("alert")).toHaveTextContent("Les photos ont changé"); expect(mocked.reorderPortalPhotos).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Annuler" }));
  await waitFor(() => expect(screen.getByText("2 / 20").parentElement).toHaveFocus());
});

test("le retrait est confirmé dans Détails puis enregistré directement", async () => {
  const { editor, onDone } = setup(); const dialog = await open();
  await userEvent.click(within(dialog).getByRole("button", { name: "Retirer de la fiche" }));
  const confirm = screen.getByRole("dialog", { name: "Retirer cette photo ?" });
  expect(confirm).toHaveTextContent("La première autre photo en ligne deviendra principale");
  await userEvent.click(within(confirm).getByRole("button", { name: "Retirer de la fiche" }));
  await screen.findByText("La photo est retirée de votre fiche."); expect(mocked.withdrawPortalPhoto).toHaveBeenCalledWith(editor.objectId, ID1);
  expect(editor.replaceModule).not.toHaveBeenCalled(); expect(onDone).not.toHaveBeenCalled();
});

test("le retrait de l’unique publique décrit la galerie sans principale et conserve la proposition", async () => {
  current.published = [photos[0]]; current.proposals = [proposal({ replaceMediaId: ID1 })]; setup(); const dialog = await open();
  await userEvent.click(within(dialog).getByRole("button", { name: "Retirer de la fiche" }));
  const confirm = screen.getByRole("dialog", { name: "Retirer cette photo ?" });
  expect(confirm).toHaveTextContent("Votre galerie n’aura plus de photo principale");
  await userEvent.click(within(confirm).getByRole("button", { name: "Retirer de la fiche" }));
  await screen.findByRole("button", { name: "Détails de Jardin" });
  expect(current.proposals[0].description).toBe("Les tables sous les arbres.");
});

test("les textes de la version publique se sauvegardent sans modifier ceux du remplacement", async () => {
  current.proposals = [proposal({ replaceMediaId: ID1 })]; const { editor } = setup(); const dialog = await open();
  await userEvent.click(within(dialog).getByRole("button", { name: "Modifier le titre et la description de Façade" }));
  await userEvent.clear(screen.getByLabelText("Titre")); await userEvent.type(screen.getByLabelText("Titre"), "Entrée principale");
  await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
  await screen.findByRole("dialog", { name: "Entrée principale" });
  expect(mocked.updatePortalPhotoTexts).toHaveBeenCalledWith({ objectId: editor.objectId, target: "published", id: ID1,
    expected: photos[0].textSnapshot, title: "Entrée principale", description: "L’entrée du restaurant." });
  expect(current.proposals[0].title).toBe("Jardin"); expect(current.proposals[0].description).toBe("Les tables sous les arbres.");
});

test("le titre saisi survit à une actualisation et un conflit exige une reprise explicite", async () => {
  const { client } = setup(); const dialog = await open(); await userEvent.click(within(dialog).getByRole("button", { name: "Modifier le titre et la description de Façade" }));
  await userEvent.clear(screen.getByLabelText("Titre")); await userEvent.type(screen.getByLabelText("Titre"), "Ma saisie");
  current = { ...current, published: [{ ...photos[0], title: "Texte office", textSnapshot: snapshot("Texte office") }, photos[1]] };
  act(() => { client.setQueriesData({ queryKey: ["portal-photo-workspace"] }, current); });
  expect(screen.getByLabelText("Titre")).toHaveValue("Ma saisie");
  mocked.updatePortalPhotoTexts.mockRejectedValueOnce(Object.assign(new Error("Les textes ont changé."), { code: "PT409", details: "photo_text_conflict" }));
  await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
  await screen.findByText("Les textes ont changé ailleurs. Votre saisie est conservée.");
  expect(screen.getByRole("button", { name: "Enregistrer" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Reprendre avec cette version" }));
  await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
  await waitFor(() => expect(mocked.updatePortalPhotoTexts).toHaveBeenCalledTimes(2));
  expect(mocked.updatePortalPhotoTexts.mock.calls[1][0]).toMatchObject({ expected: snapshot("Texte office"), title: "Ma saisie" });
});

test("Échap annule seulement l’édition des textes et revient au bouton Modifier", async () => {
  setup(); const dialog = await open(); await userEvent.click(within(dialog).getByRole("button", { name: "Modifier le titre et la description de Façade" }));
  await userEvent.type(screen.getByLabelText("Titre"), " temporaire"); await userEvent.keyboard("{Escape}");
  expect(screen.getByRole("dialog", { name: "Façade" })).toBeInTheDocument(); expect(screen.queryByLabelText("Titre")).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "Modifier le titre et la description de Façade" })).toHaveFocus());
  expect(mocked.updatePortalPhotoTexts).not.toHaveBeenCalled();
});

test("un ajout exige les droits puis confirme les textes avant le brouillon à envoyer", async () => {
  const { editor, onDone } = setup(); const dialog = await queue();
  fireEvent.change(within(dialog).getByLabelText("Titre"), { target: { value: "Vue du jardin" } });
  fireEvent.change(within(dialog).getByLabelText("Description"), { target: { value: "Une terrasse ombragée." } });
  await userEvent.click(within(dialog).getByRole("button", { name: "Valider les ajouts" }));
  expect(within(dialog).getByRole("alert")).toHaveTextContent("Confirmez que vous avez l’autorisation"); expect(mocked.uploadPortalPhoto).not.toHaveBeenCalled();
  await userEvent.click(within(dialog).getByRole("checkbox", { name: /Ces photos sont les miennes/ }));
  await userEvent.click(within(dialog).getByRole("button", { name: "Valider les ajouts" }));
  await waitFor(() => expect(onDone).toHaveBeenCalled());
  expect(mocked.uploadPortalPhoto).toHaveBeenCalledTimes(1); expect(mocked.updatePortalPhotoTexts).toHaveBeenCalledTimes(1);
  expect(jest.mocked(editor.replaceModule).mock.calls[0][1]).toMatchObject({ objectItems: expect.arrayContaining([
    expect.objectContaining({ title: "Vue du jardin", description: "Une terrasse ombragée.", isPublished: false }),
  ]) });
});

test("échec après dépôt : le réessai ne téléverse pas les octets confirmés", async () => {
  const { onDone } = setup(); const dialog = await queue();
  fireEvent.change(within(dialog).getByLabelText("Description"), { target: { value: "Texte conservé." } });
  mocked.updatePortalPhotoTexts.mockRejectedValueOnce(new Error("Connexion interrompue."));
  await userEvent.click(within(dialog).getByRole("checkbox", { name: /Ces photos sont les miennes/ }));
  await userEvent.click(within(dialog).getByRole("button", { name: "Valider les ajouts" }));
  await within(dialog).findByText("Connexion interrompue."); expect(mocked.uploadPortalPhoto).toHaveBeenCalledTimes(1);
  await userEvent.click(within(dialog).getByRole("button", { name: "Valider les ajouts" }));
  await waitFor(() => expect(onDone).toHaveBeenCalled()); expect(mocked.uploadPortalPhoto).toHaveBeenCalledTimes(1);
});

test("annuler un nouveau choix avant dépôt ne fait pas de mutation serveur", async () => {
  setup(); const dialog = await queue(); await userEvent.click(within(dialog).getByRole("button", { name: "Annuler cet ajout" }));
  expect(mocked.cancelPortalPhotoUpload).not.toHaveBeenCalled(); expect(mocked.uploadPortalPhoto).not.toHaveBeenCalled();
  expect(screen.queryByText("Nouvelle.jpg")).not.toBeInTheDocument();
});

test("les dépôts draft récupérés du serveur sont repris sans nouveau téléversement", async () => {
  current.proposals = [proposal({ status: "draft" })]; const { editor, onDone } = setup();
  await screen.findByRole("button", { name: "Détails de Jardin" }); await userEvent.click(screen.getByRole("button", { name: "Valider" }));
  await waitFor(() => expect(onDone).toHaveBeenCalled()); expect(mocked.uploadPortalPhoto).not.toHaveBeenCalled();
  expect(jest.mocked(editor.replaceModule).mock.calls[0][1]).toMatchObject({ objectItems: expect.arrayContaining([expect.objectContaining({ portalUploadId: DOC })]) });
});

test("à21/20 un remplacement reste possible et n’ajoute pas de place", async () => {
  current.capacity = { limit: 20, published: 21, reserved: 0, used: 21, remaining: 0 }; setup();
  await screen.findByRole("button", { name: "Détails de Façade" });
  expect(screen.getByRole("button", { name: "Ajouter" })).toBeDisabled();
  const dialog = await open();
  await userEvent.click(within(dialog).getByRole("button", { name: "Remplacer la photo" }));
  fireEvent.change(screen.getByLabelText("Choisir une photo de remplacement"), { target: { files: [new File(["a"], "Remplacement.jpg", { type: "image/jpeg" })] } });
  expect(screen.getByRole("dialog", { name: "Préparer vos photos" })).toHaveTextContent("Remplacement proposé"); expect(screen.getByText("21 / 20")).toBeInTheDocument();
});

test("P fermé : ni analyse ni recours cliquable, même avec un ancien reçu refusé", async () => {
  current.proposals = [proposal({ status: "refused", analysis: { requestId: REQ,
    state: "assessed", assessment: { score: 3, summary: "Sombre.", strengths: [], issues: [] },
    sourceCurrent: true, appealInteractionId: null, appealStatus: null } })];
  setup(); const dialog = await open("Jardin");
  expect(screen.queryByRole("button", { name: "Demander une révision" })).not.toBeInTheDocument();
  expect(within(dialog).queryByRole("button", { name: /Analyser|Retrouver l’analyse/ })).not.toBeInTheDocument();
  expect(mocked.analyzePortalPhoto).not.toHaveBeenCalled(); expect(mocked.appealPortalPhotoAnalysis).not.toHaveBeenCalled();
});

test("le recours suit canAppeal indépendamment d’un nouveau lancement IA désactivé", async () => {
  current.proposals = [proposal({ status: "refused", canAppeal: true, reviewNote: "Photo trop sombre.", analysis: {
    requestId: REQ, state: "assessed", assessment: { score: 3, summary: "Sombre.", strengths: [], issues: [] },
    sourceCurrent: true, appealInteractionId: null, appealStatus: null,
  } })];
  mocked.appealPortalPhotoAnalysis.mockImplementation(async () => {
    current = { ...current, proposals: current.proposals.map((photo) => ({ ...photo, canAppeal: false,
      analysis: photo.analysis ? { ...photo.analysis, appealInteractionId: "appeal-1" } : null })) };
    return "appeal-1";
  });
  setup(); await userEvent.click(await screen.findByRole("button", { name: "Demander une révision" }));
  fireEvent.change(screen.getByLabelText("Votre demande de révision"), { target: { value: "La terrasse est visible, merci de revoir la photo." } });
  await userEvent.click(screen.getByRole("button", { name: "Envoyer la demande" }));
  await screen.findByText(/Révision demandée. L’office vous répondra/);
  expect(mocked.appealPortalPhotoAnalysis).toHaveBeenCalledWith({ requestId: REQ,
    body: "La terrasse est visible, merci de revoir la photo.", clientId: expect.stringMatching(/^[0-9a-f-]{36}$/) });
  expect(mocked.analyzePortalPhoto).not.toHaveBeenCalled();
});

test("un reçu incertain est relu sans nouveau lancement, y compris P désactivé", async () => {
  current.proposals = [proposal({ analysis: { requestId: REQ, state: "uncertain", assessment: null,
    sourceCurrent: true, appealInteractionId: null, appealStatus: null } })];
  mocked.getPortalPhotoAnalysis.mockResolvedValue({ requestId: REQ, state: "uncertain" });
  setup(); const dialog = await open("Jardin");
  await userEvent.click(within(dialog).getByText("Analyse de la photo"));
  await userEvent.click(within(dialog).getByRole("button", { name: "Retrouver l’analyse" }));
  await waitFor(() => expect(mocked.getPortalPhotoAnalysis).toHaveBeenCalledWith(REQ));
  expect(mocked.analyzePortalPhoto).not.toHaveBeenCalled();
});

test("une proposition conserve ses propres textes lors d’une édition privée", async () => {
  current.proposals = [proposal({ replaceMediaId: ID1 })]; setup(); const dialog = await open("Jardin");
  await userEvent.click(within(dialog).getByRole("button", { name: "Modifier le titre et la description de Jardin" }));
  await userEvent.clear(screen.getByLabelText("Description"));
  await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
  await waitFor(() => expect(mocked.updatePortalPhotoTexts).toHaveBeenCalledWith(expect.objectContaining({ target: "proposal", id: DOC, title: "Jardin", description: "" })));
  expect(current.published[0].description).toBe("L’entrée du restaurant.");
});

test("valider sans nouvel ajout ne transforme pas les propositions envoyées en modification", async () => {
  current.proposals = [proposal()]; const { editor, onDone } = setup(); await screen.findByRole("button", { name: "Détails de Jardin" });
  await userEvent.click(screen.getByRole("button", { name: "Valider" }));
  await waitFor(() => expect(onDone).toHaveBeenCalled()); expect(editor.replaceModule).not.toHaveBeenCalled();
});

test("une galerie vide propose un ajout sans inventer de principale ni de classement", async () => {
  current = { ...fresh(), published: [], orderSnapshot: [], capacity: { limit: 20, used: 0, published: 0, reserved: 0, remaining: 20 } };
  setup(); await screen.findByText(/Votre galerie n’a pas encore de photo en ligne/);
  expect(screen.getByRole("button", { name: "Ajouter" })).toBeEnabled(); expect(screen.queryByText("Principale")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Réorganiser les photos" })).not.toBeInTheDocument();
});

test("refus humain sans IA : reprise idempotente, demande locale et seconde carte indépendante", async () => {
  const otherDoc = "00000000-0000-4000-a000-000000008409", changeId = "00000000-0000-4000-a000-000000008410";
  current.proposals = [proposal({ status: "refused", canAppeal: true, changeId }),
    proposal({ documentId: otherDoc, title: "Bar", status: "refused", canAppeal: true, changeId })];
  mocked.appealPortalPhotoReview.mockRejectedValueOnce(new Error("Connexion interrompue."));
  mocked.appealPortalPhotoReview.mockImplementationOnce(async () => {
    current = { ...current, proposals: current.proposals.map((photo) => photo.documentId === DOC ? { ...photo, canAppeal: false,
      reviewAppeal: { interactionId: "human-appeal", status: "in_progress" } } : photo) };
    return "human-appeal";
  });
  const { editor } = setup(); await screen.findByRole("button", { name: "Détails de Jardin" });
  await userEvent.click(screen.getAllByRole("button", { name: "Demander une révision" })[0]);
  fireEvent.change(screen.getByLabelText("Votre demande de révision"), { target: { value: "Le jardin est bien visible." } });
  await userEvent.click(screen.getByRole("button", { name: "Envoyer la demande" }));
  await screen.findByText("Connexion interrompue."); expect(screen.getByLabelText("Votre demande de révision")).toHaveValue("Le jardin est bien visible.");
  await userEvent.click(screen.getByRole("button", { name: "Envoyer la demande" }));
  await screen.findByText("État de la demande : En cours de révision");
  expect(mocked.appealPortalPhotoReview).toHaveBeenCalledTimes(2);
  const first = mocked.appealPortalPhotoReview.mock.calls[0][0], retry = mocked.appealPortalPhotoReview.mock.calls[1][0];
  expect(first).toEqual(retry); expect(first).toMatchObject({ objectId: editor.objectId, documentId: DOC, changeId, body: "Le jardin est bien visible." });
  expect(mocked.appealPortalPhotoAnalysis).not.toHaveBeenCalled(); expect(mocked.analyzePortalPhoto).not.toHaveBeenCalled();
  await userEvent.keyboard("{Escape}"); await screen.findByRole("button", { name: "Voir ma demande" });
  await waitFor(() => expect(screen.getByRole("button", { name: "Détails de Jardin" })).toHaveFocus());
  expect(screen.getAllByRole("button", { name: "Demander une révision" })).toHaveLength(1);
  await userEvent.click(screen.getByRole("button", { name: "Voir ma demande" }));
  expect(screen.getByRole("dialog", { name: "Jardin" })).toHaveTextContent("En cours de révision");
});

test("consultation : galerie et détails lisibles, aucune mutation proposée", async () => {
  current.writesEnabled = false; current.analysisEnabled = true;
  current.proposals = [proposal({ status: "refused", canAppeal: true, changeId: REQ })]; setup();
  await screen.findByRole("button", { name: "Détails de Jardin" });
  expect(screen.getByRole("button", { name: "Ajouter" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Réorganiser les photos" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Demander une révision" })).not.toBeInTheDocument();
  const dialog = await open(); expect(within(dialog).queryByRole("button", { name: /Modifier le titre/ })).not.toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "Remplacer la photo" })).toBeDisabled();
  expect(within(dialog).getByRole("button", { name: "Retirer de la fiche" })).toBeDisabled();
  expect(mocked.uploadPortalPhoto).not.toHaveBeenCalled(); expect(mocked.updatePortalPhotoTexts).not.toHaveBeenCalled();
});

test("fermeture des écritures après refetch : l’éditeur ouvert conserve ses textes et bloque Enregistrer", async () => {
  const { client } = setup(); const dialog = await open();
  await userEvent.click(within(dialog).getByRole("button", { name: "Modifier le titre et la description de Façade" }));
  fireEvent.change(screen.getByLabelText("Titre"), { target: { value: "Texte en cours" } });
  current = { ...current, writesEnabled: false };
  act(() => { client.setQueriesData({ queryKey: ["portal-photo-workspace"] }, current); });
  await waitFor(() => expect(screen.getByRole("button", { name: "Enregistrer" })).toBeDisabled());
  expect(screen.getByLabelText("Titre")).toHaveValue("Texte en cours");
  expect(screen.getByRole("button", { name: "Annuler" })).toBeEnabled();
  expect(mocked.updatePortalPhotoTexts).not.toHaveBeenCalled();
});

test("fermeture des écritures pendant classement : annulation possible et aucune RPC d’ordre", async () => {
  const { client } = setup(); await userEvent.click(await screen.findByRole("button", { name: "Réorganiser les photos" }));
  current = { ...current, writesEnabled: false };
  act(() => { client.setQueriesData({ queryKey: ["portal-photo-workspace"] }, current); });
  await waitFor(() => expect(screen.getByRole("button", { name: "Enregistrer l’ordre" })).toBeDisabled());
  expect(screen.getByRole("button", { name: "Descendre Façade" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Annuler" }));
  await screen.findByRole("button", { name: "Détails de Façade" }); expect(mocked.reorderPortalPhotos).not.toHaveBeenCalled();
});

test("fermeture entre dépôt et textes : aucun second writer et dépôt conservé", async () => {
  mocked.uploadPortalPhoto.mockImplementationOnce(async (_id, file, _rights, uploadId) => {
    current = { ...current, writesEnabled: false, proposals: [proposal({ documentId: uploadId, title: file.name, description: "", status: "draft", textSnapshot: snapshot(file.name) })] };
    return { id: uploadId, title: file.name, width: 1800, height: 1200 };
  });
  const { onDone } = setup(); const dialog = await queue();
  fireEvent.change(within(dialog).getByLabelText("Description"), { target: { value: "Texte non encore envoyé." } });
  await userEvent.click(within(dialog).getByRole("checkbox", { name: /Ces photos sont les miennes/ }));
  await userEvent.click(within(dialog).getByRole("button", { name: "Valider les ajouts" }));
  await within(dialog).findByText("La galerie est actuellement en consultation. Votre dépôt et votre saisie sont conservés.");
  expect(mocked.uploadPortalPhoto).toHaveBeenCalledTimes(1); expect(mocked.updatePortalPhotoTexts).not.toHaveBeenCalled();
  expect(within(dialog).getByLabelText("Description")).toHaveValue("Texte non encore envoyé."); expect(onDone).not.toHaveBeenCalled();
});

test("même ordre revenu A→B→A : une revision changée invalide le classement ouvert", async () => {
  const { client } = setup(); await userEvent.click(await screen.findByRole("button", { name: "Réorganiser les photos" }));
  current = { ...current, orderSnapshot: current.orderSnapshot.map((entry) => ({ ...entry, revision: "order-revision-ABA" })) };
  act(() => { client.setQueriesData({ queryKey: ["portal-photo-workspace"] }, current); });
  await waitFor(() => expect(screen.getByRole("button", { name: "Enregistrer l’ordre" })).toBeDisabled());
  expect(mocked.reorderPortalPhotos).not.toHaveBeenCalled();
});

function legacyModules() {
  const modules = portalModules();
  const canonical = { ...service.portalPhotoDraft({ id: ID1, title: "Photo déjà publiée", width: 1600, height: 1200 }, "Auteur", null, modules.media),
    id: ID1, portalUploadId: undefined, portalReplaceMediaId: undefined, visibility: "public", isPublished: true,
    url: "https://public.test/old.jpg", description: "Une façade déjà diffusée.", isMain: true };
  modules.media.objectItems = [canonical,
    { ...canonical, id: "private", title: "Image privée", visibility: "private" },
    { ...canonical, id: "partners", title: "Image partenaires", visibility: "partners" },
    { ...canonical, id: "unpublished", title: "Image non publiée", isPublished: false },
    { ...canonical, id: "upload", title: "Dépôt privé", portalUploadId: DOC },
    { ...canonical, id: "place-in-object", title: "Image d’un lieu", scope: "place" },
    { ...canonical, id: "local-url", title: "Aperçu local", url: "blob:local-preview" },
  ];
  modules.media.placeItems = [{ ...canonical, id: "place", scope: "place", title: "Photo de lieu" }];
  return modules;
}

test("PGRST202 seul : mêmes vignettes publiques de baseline, sans quota ni suivi ni écriture", async () => {
  const baseline = legacyModules(), modules = portalModules();
  modules.media.objectItems = [{ ...baseline.media.objectItems[0], id: "unsaved", title: "Public local non confirmé" }];
  mocked.getPortalPhotoWorkspace.mockRejectedValue(Object.assign(new Error("RPC absente"), { code: "PGRST202" }));
  setup(undefined, { modules, baseline });
  await screen.findByRole("button", { name: "Détails de Photo déjà publiée" });
  for (const title of ["Image privée", "Image partenaires", "Image non publiée", "Dépôt privé", "Image d’un lieu", "Aperçu local", "Photo de lieu", "Public local non confirmé"])
    expect(screen.queryByRole("button", { name: `Détails de ${title}` })).not.toBeInTheDocument();
  expect(screen.queryByText(/\/ 20/)).not.toBeInTheDocument(); expect(screen.queryByText("Suivi des envois")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Ajouter" })).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Réorganiser les photos" })).not.toBeInTheDocument();
  const dialog = await open("Photo déjà publiée"); expect(within(dialog).getByAltText("Une façade déjà diffusée.")).toBeInTheDocument();
  expect(within(dialog).queryByRole("button", { name: /Modifier/ })).not.toBeInTheDocument(); expect(mocked.getPortalPhotoPreview).not.toHaveBeenCalled();
  expect(mocked.uploadPortalPhoto).not.toHaveBeenCalled(); expect(mocked.reorderPortalPhotos).not.toHaveBeenCalled();
});

test("42501 puis PGRST202 ne révèle jamais la galerie en repli", async () => {
  mocked.getPortalPhotoWorkspace.mockRejectedValueOnce(Object.assign(new Error("Accès refusé"), { code: "42501" }))
    .mockRejectedValue(Object.assign(new Error("RPC absente"), { code: "PGRST202" }));
  const { client } = setup(undefined, { modules: legacyModules() });
  await screen.findByText("Votre compte ne peut pas consulter les photos de cette fiche.");
  await act(async () => { await client.refetchQueries({ queryKey: ["portal-photo-workspace"] }); });
  expect(screen.queryByRole("button", { name: "Détails de Photo déjà publiée" })).not.toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument(); expect(mocked.getPortalPhotoPreview).not.toHaveBeenCalled();
});

test.each(["readOnlyReason", "unavailable", "mediaUnavailable"])("le repli respecte le verrou %s du composant", async (guard) => {
  const modules = legacyModules(); if (guard === "mediaUnavailable") modules.media.unavailableReason = "Photos indisponibles.";
  mocked.getPortalPhotoWorkspace.mockRejectedValue(Object.assign(new Error("RPC absente"), { code: "PGRST202" }));
  setup(undefined, { modules, rubric: guard === "readOnlyReason" ? { readOnlyReason: "Rubrique fermée." } : guard === "unavailable" ? { state: "unavailable" } : {} });
  expect(screen.getByRole("alert")).toBeInTheDocument(); expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(mocked.getPortalPhotoWorkspace).not.toHaveBeenCalled();
});

test("une autre erreur du lecteur ne déclenche pas de galerie locale", async () => {
  mocked.getPortalPhotoWorkspace.mockRejectedValue(Object.assign(new Error("Indisponible"), { code: "503" }));
  setup(undefined, { modules: legacyModules() }); await screen.findByText("Vos photos n’ont pas pu être chargées.");
  expect(screen.queryByRole("img")).not.toBeInTheDocument(); expect(screen.queryByText(/\/ 20/)).not.toBeInTheDocument();
});

test("ordre appliqué, réponse perdue : une seule RPC puis confirmation par la lecture normalisée", async () => {
  mocked.reorderPortalPhotos.mockImplementationOnce(async (_objectId, ids) => {
    const next = ids.map((id, index) => ({ ...current.published.find((photo) => photo.id === id)!, position: index + 1, isMain: index === 0 }));
    current = { ...current, published: next, orderSnapshot: next.map(({ id, position, isMain }) => ({ id, position, isMain, revision: "committed-order" })) };
    throw new Error("Réponse perdue.");
  });
  setup(); await userEvent.click(await screen.findByRole("button", { name: "Réorganiser les photos" }));
  await userEvent.click(screen.getByRole("button", { name: "Descendre Façade" }));
  await userEvent.click(screen.getByRole("button", { name: "Enregistrer l’ordre" }));
  await screen.findByText("L’ordre des photos est enregistré.");
  expect(screen.queryByRole("heading", { name: "Ordre d’affichage" })).not.toBeInTheDocument();
  expect(mocked.reorderPortalPhotos).toHaveBeenCalledTimes(1); expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test.each(["positions", "principale"])("réponse d’ordre perdue, %s non normalisées : brouillon conservé sans faux succès", async (bad) => {
  mocked.reorderPortalPhotos.mockImplementationOnce(async (_objectId, ids) => {
    const rows = ids.map((id, index) => ({ id, position: bad === "positions" ? index : index + 1, isMain: bad === "principale" ? index === 1 : index === 0, revision: "other-order" }));
    current = { ...current, orderSnapshot: rows };
    throw new Error("Réponse perdue.");
  });
  setup(); await userEvent.click(await screen.findByRole("button", { name: "Réorganiser les photos" }));
  await userEvent.click(screen.getByRole("button", { name: "Descendre Façade" }));
  await userEvent.click(screen.getByRole("button", { name: "Enregistrer l’ordre" }));
  await screen.findByText("Réponse perdue. Votre classement est conservé.");
  expect(screen.getByRole("heading", { name: "Ordre d’affichage" })).toBeInTheDocument();
  expect(screen.queryByText(/aucun ordre n’a été envoyé/)).not.toBeInTheDocument();
  expect(screen.queryByText("L’ordre des photos est enregistré.")).not.toBeInTheDocument();
  expect(mocked.reorderPortalPhotos).toHaveBeenCalledTimes(1);
});

test("annuler un ajout dans Détails ramène au compteur si la carte disparaît", async () => {
  current.proposals = [proposal({ status: "draft" })];
  mocked.cancelPortalPhotoUpload.mockImplementationOnce(async () => { current = { ...current, proposals: [] }; });
  setup(); const dialog = await open("Jardin"); await userEvent.click(within(dialog).getByRole("button", { name: "Annuler cet ajout" }));
  await screen.findByText("L’ajout de la photo est annulé.");
  await waitFor(() => expect(screen.getByText("2 / 20").parentElement).toHaveFocus());
});

test("un retrait refusé affiche l’erreur dans la confirmation active, sans reprise de textes", async () => {
  mocked.withdrawPortalPhoto.mockRejectedValueOnce(Object.assign(new Error("La principale doit être vérifiée par l’office."), { code: "PT409", details: "photo_main_conflict" }));
  setup(); const dialog = await open(); await userEvent.click(within(dialog).getByRole("button", { name: "Retirer de la fiche" }));
  const confirm = screen.getByRole("dialog", { name: "Retirer cette photo ?" });
  await userEvent.click(within(confirm).getByRole("button", { name: "Retirer de la fiche" }));
  expect(await within(confirm).findByRole("alert")).toHaveTextContent("La principale doit être vérifiée par l’office.");
  expect(confirm).toBeInTheDocument(); await userEvent.click(within(confirm).getByRole("button", { name: "Annuler" }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Retirer cette photo ?" })).not.toBeInTheDocument());
  await userEvent.click(within(dialog).getByRole("button", { name: "Modifier le titre et la description de Façade" }));
  expect(screen.queryByRole("button", { name: "Reprendre avec cette version" })).not.toBeInTheDocument();
});

test.each(["photo_writes_closed", "photo_main_conflict", undefined])("PT409 %s sur un texte ne propose pas de rebase générique", async (details) => {
  mocked.updatePortalPhotoTexts.mockRejectedValueOnce(Object.assign(new Error("Opération temporairement indisponible."), { code: "PT409", details }));
  setup(); const dialog = await open(); await userEvent.click(within(dialog).getByRole("button", { name: "Modifier le titre et la description de Façade" }));
  fireEvent.change(screen.getByLabelText("Titre"), { target: { value: "Saisie conservée" } });
  await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
  await screen.findByText("Opération temporairement indisponible.");
  expect(screen.getByLabelText("Titre")).toHaveValue("Saisie conservée");
  expect(screen.queryByRole("button", { name: "Reprendre avec cette version" })).not.toBeInTheDocument();
  expect(mocked.updatePortalPhotoTexts).toHaveBeenCalledTimes(1);
});

test.each([["Titre", "🌺".repeat(181), "Le titre ne peut pas dépasser 180 caractères."],
  ["Description", "D".repeat(5001), "La description ne peut pas dépasser 5 000 caractères."]])("borne Unicode %s visible et bloquante avant écriture", async (field, value, message) => {
  setup(); const dialog = await open(); await userEvent.click(within(dialog).getByRole("button", { name: "Modifier le titre et la description de Façade" }));
  fireEvent.change(screen.getByLabelText(field), { target: { value } });
  expect(screen.getByLabelText(field)).toHaveAttribute("aria-invalid", "true"); expect(screen.getByText(message)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
  expect(screen.getByLabelText(field)).toHaveFocus(); expect(mocked.updatePortalPhotoTexts).not.toHaveBeenCalled();
});

test("180 emoji sont acceptés comme 180 caractères, sans troncature UTF16", async () => {
  setup(); const dialog = await open(); await userEvent.click(within(dialog).getByRole("button", { name: "Modifier le titre et la description de Façade" }));
  const title = "🌺".repeat(180); fireEvent.change(screen.getByLabelText("Titre"), { target: { value: title } });
  await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
  await waitFor(() => expect(mocked.updatePortalPhotoTexts).toHaveBeenCalledWith(expect.objectContaining({ title })));
});

test.each(["Titre", "Description"])("modifier %s conserve exactement l’autre ancien texte au-delà des bornes", async (field) => {
  const oldTitle = ` ${"T".repeat(181)} `, oldDescription = ` ${"D".repeat(5001)} `;
  current.published = [{ ...photos[0], title: oldTitle, description: oldDescription, textSnapshot: snapshot(oldTitle, oldDescription) }];
  setup(); await userEvent.click(await screen.findByRole("button", { name: /^Détails de T/ }));
  const dialog = screen.getByRole("dialog"); await userEvent.click(within(dialog).getByRole("button", { name: /^Modifier le titre et la description de T/ }));
  fireEvent.change(screen.getByLabelText(field), { target: { value: "Texte corrigé" } });
  await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
  await waitFor(() => expect(mocked.updatePortalPhotoTexts).toHaveBeenCalledWith(expect.objectContaining(field === "Titre"
    ? { title: "Texte corrigé", description: oldDescription } : { title: oldTitle, description: "Texte corrigé" })));
});

test("la borne d’un nouveau titre empêche aussi le dépôt des octets", async () => {
  setup(); const dialog = await queue(); fireEvent.change(within(dialog).getByLabelText("Titre"), { target: { value: "T".repeat(181) } });
  await userEvent.click(within(dialog).getByRole("button", { name: "Valider les ajouts" }));
  expect(within(dialog).getByLabelText("Titre")).toHaveAttribute("aria-invalid", "true");
  expect(mocked.uploadPortalPhoto).not.toHaveBeenCalled(); expect(mocked.updatePortalPhotoTexts).not.toHaveBeenCalled();
});
