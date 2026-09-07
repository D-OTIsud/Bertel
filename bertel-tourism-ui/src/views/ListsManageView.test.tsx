// ListsManageView — grilles Une / Mes listes / Archives / Propositions (cadrage listes
// 2026-09-07). Ces tests couvrent le contrat frontend : dédup de la une, création ouverte à un
// lecteur, capacités par carte, et les circuits propose/accepte/refuse/restaure/duplique.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ListsManageView from "./ListsManageView";
import {
  createListFromSelection,
  duplicateList,
  listFeaturedLists,
  listListProposals,
  listMyLists,
  listsQueryKeys,
  requestListFeature,
  restoreList,
  reviewListFeature,
  setListFeatured,
  type ObjectListCard,
} from "@/services/lists";
import { useSessionStore } from "@/store/session-store";

jest.mock("@/services/lists", () => ({
  // listsQueryKeys est de la logique PURE (aucun appel réseau) : on garde la vraie implémentation
  // pour que les clés utilisées par le composant restent celles réellement exportées par le
  // service, sans les dupliquer ici (elles se dédoubleraient au premier renommage).
  ...jest.requireActual("@/services/lists"),
  listMyLists: jest.fn(),
  listFeaturedLists: jest.fn(),
  listListProposals: jest.fn(),
  createListFromSelection: jest.fn(),
  requestListFeature: jest.fn(),
  reviewListFeature: jest.fn(),
  setListFeatured: jest.fn(),
  restoreList: jest.fn(),
  duplicateList: jest.fn(),
}));

const push = jest.fn();
const replace = jest.fn();
let searchParams = new URLSearchParams();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => searchParams,
}));

function card(overrides: Partial<ObjectListCard> = {}): ObjectListCard {
  return {
    id: overrides.id ?? "L1",
    name: overrides.name ?? "Ma liste",
    nameEn: null,
    kind: "static",
    status: "draft",
    lang: "fr",
    accent: "teal",
    recipientLabel: null,
    coverUrl: null,
    updatedAt: null,
    itemCount: 2,
    typeBreakdown: [],
    createdBy: "user-1",
    creatorName: null,
    orgObjectId: "ORG1",
    lastActivityAt: null,
    isArchived: false,
    isFeatured: false,
    featureRequestedAt: null,
    canEdit: true,
    canManageFeature: false,
    canProposeFeature: false,
    canRestore: false,
    canManageSharing: true,
    ...overrides,
  };
}

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ListsManageView />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  searchParams = new URLSearchParams();
  useSessionStore.setState({
    orgId: "org-1",
    userId: "user-1",
    role: "tourism_agent",
    adminRank: null,
  });
  jest.mocked(listFeaturedLists).mockResolvedValue([]);
  jest.mocked(listListProposals).mockResolvedValue([]);
  jest.mocked(listMyLists).mockResolvedValue([]);
});

describe("ListsManageView — création ouverte à tout membre (règle 1)", () => {
  it("un lecteur (canEditObjects false, rôle non-admin) voit « Nouvelle liste » dès qu’il a une organisation active", async () => {
    useSessionStore.setState({
      orgId: "org-1",
      role: "tourism_agent",
      adminRank: null,
    });
    renderView();
    expect(
      await screen.findByRole("button", { name: /Nouvelle liste/ }),
    ).toBeInTheDocument();
  });

  it("sans organisation active, le bouton disparaît", async () => {
    useSessionStore.setState({ orgId: null, role: null, adminRank: null });
    renderView();
    await screen.findByText(/Aucune liste pour l’instant/i);
    expect(
      screen.queryByRole("button", { name: /Nouvelle liste/ }),
    ).not.toBeInTheDocument();
  });

  it("crée une liste vide et navigue vers sa composition", async () => {
    jest.mocked(createListFromSelection).mockResolvedValue("new-id");
    renderView();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: /Nouvelle liste/ }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/listes/new-id"));
    expect(createListFromSelection).toHaveBeenCalledWith("Nouvelle liste", []);
  });
});

describe("ListsManageView — onglets personnels et collectifs", () => {
  it("une liste du créateur déjà à la une reste dans « Mes listes » et apparaît dans la vue collective", async () => {
    const featured = card({
      id: "F1",
      name: "Ma liste à la une",
      isFeatured: true,
    });
    jest.mocked(listFeaturedLists).mockResolvedValue([featured]);
    jest
      .mocked(listMyLists)
      .mockResolvedValue([featured, card({ id: "M2", name: "Autre liste" })]);

    renderView();

    await screen.findByText("Ma liste à la une");
    expect(screen.getByText("Autre liste")).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /Mes listes 2/ }),
    ).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: /À la une/ }));
    expect(await screen.findByText("Ma liste à la une")).toBeInTheDocument();
    expect(screen.queryByText("Autre liste")).not.toBeInTheDocument();
  });
});

describe("ListsManageView — proposer / mettre à la une", () => {
  it("un créateur non-admin voit « Proposer à la une », jamais « Mettre à la une »", async () => {
    jest
      .mocked(listMyLists)
      .mockResolvedValue([
        card({ canProposeFeature: true, canManageFeature: false }),
      ]);
    renderView();
    await screen.findByText("Ma liste");
    expect(
      screen.getByRole("button", { name: /Proposer à la une/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Mettre à la une/ }),
    ).not.toBeInTheDocument();
  });

  it("une proposition déjà envoyée affiche un badge, pas un bouton actionnable", async () => {
    jest.mocked(listMyLists).mockResolvedValue([
      card({
        canProposeFeature: true,
        featureRequestedAt: "2026-08-01T00:00:00Z",
      }),
    ]);
    renderView();
    await screen.findByText("Ma liste");
    expect(screen.getByText(/Proposition envoyée/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Proposer à la une/ }),
    ).not.toBeInTheDocument();
  });

  it("un admin voit « Mettre à la une » sur sa propre liste et peut la déclencher", async () => {
    jest
      .mocked(listMyLists)
      .mockResolvedValue([
        card({ canManageFeature: true, canProposeFeature: false }),
      ]);
    // Le composant n'inspecte pas la valeur résolue (seul l'appel du RPC est testé) : `null` est
    // un membre valide du contrat `ObjectListDetail | null`, pas un raccourci qui cache des champs.
    jest.mocked(setListFeatured).mockResolvedValue(null);
    renderView();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: /Mettre à la une/ }),
    );
    await waitFor(() =>
      expect(setListFeatured).toHaveBeenCalledWith("L1", true),
    );
  });

  it("proposer à la une appelle requestListFeature avec l’id de LA carte cliquée", async () => {
    jest
      .mocked(listMyLists)
      .mockResolvedValue([
        card({ id: "A", name: "Alpha", canProposeFeature: true }),
        card({ id: "B", name: "Beta", canProposeFeature: true }),
      ]);
    jest.mocked(requestListFeature).mockResolvedValue(null);
    renderView();
    await screen.findByText("Beta");
    const betaCard = screen
      .getByText("Beta")
      .closest("div.group") as HTMLElement;
    const user = userEvent.setup();
    await user.click(
      within(betaCard).getByRole("button", { name: /Proposer à la une/ }),
    );
    await waitFor(() => expect(requestListFeature).toHaveBeenCalledWith("B"));
  });
});

describe("ListsManageView — propositions dans « À la une »", () => {
  it("un membre non-admin ne reçoit pas les propositions", async () => {
    useSessionStore.setState({
      orgId: "org-1",
      role: "tourism_agent",
      adminRank: null,
    });
    renderView();
    await screen.findByRole("tab", { name: /À la une/ });
    expect(
      screen.queryByRole("tab", { name: /Propositions/ }),
    ).not.toBeInTheDocument();
    expect(listListProposals).not.toHaveBeenCalled();
  });

  it("un admin voit la proposition dans « À la une » et l’icône ouvre la revue", async () => {
    useSessionStore.setState({
      orgId: "org-1",
      role: "tourism_agent",
      adminRank: 30,
    });
    const proposal = card({
      id: "P1",
      name: "Proposée",
      creatorName: "Camille",
      recipientLabel: null,
      featureRequestedAt: "2026-08-01T00:00:00Z",
    });
    jest.mocked(listListProposals).mockResolvedValue([proposal]);
    jest.mocked(reviewListFeature).mockResolvedValue(null);
    renderView();

    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: /À la une/ }));

    expect(await screen.findByText(/Proposée par Camille/)).toBeInTheDocument();
    expect(screen.queryByText(/^Pour /)).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Valider la proposition Proposée/ }),
    );
    expect(screen.getByRole("link", { name: /Voir la liste/ })).toHaveAttribute(
      "href",
      "/listes/P1",
    );
    await user.click(screen.getByRole("button", { name: /Mettre à la une/ }));
    await waitFor(() =>
      expect(reviewListFeature).toHaveBeenCalledWith("P1", true),
    );
  });

  it("un lien de notification ouvre la revue pending et traite sans bouton obsolète", async () => {
    useSessionStore.setState({
      orgId: "org-1",
      role: "tourism_agent",
      adminRank: 30,
    });
    searchParams = new URLSearchParams(
      "section=featured&state=pending&review=P1",
    );
    jest.mocked(listListProposals).mockResolvedValue([
      card({
        id: "P1",
        name: "À revoir",
        featureRequestedAt: "2026-08-01T00:00:00Z",
      }),
    ]);
    renderView();

    expect(
      await screen.findByRole("region", {
        name: /Validation d’une proposition/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("À revoir")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Mettre à la une/ }),
    ).toBeInTheDocument();
  });

  it("retire la cible de revue du lien lors de la fermeture ou d’un changement d’onglet", async () => {
    useSessionStore.setState({
      orgId: "org-1",
      role: "tourism_agent",
      adminRank: 30,
    });
    searchParams = new URLSearchParams(
      "section=featured&state=pending&review=P1",
    );
    jest.mocked(listListProposals).mockResolvedValue([
      card({
        id: "P1",
        name: "À revoir",
        featureRequestedAt: "2026-08-01T00:00:00Z",
      }),
    ]);
    renderView();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: /Fermer la proposition/ }),
    );
    expect(replace).toHaveBeenLastCalledWith(
      "/listes?section=featured&state=pending",
    );

    await user.click(screen.getByRole("tab", { name: /Archives/ }));
    expect(replace).toHaveBeenLastCalledWith("/listes?section=archives");
  });
});

describe("ListsManageView — filtres indépendants", () => {
  it("le statut brouillon et le lien actif se combinent sans s’appuyer sur le statut shared", async () => {
    const linkedDraft = {
      ...card({ id: "D1", name: "Brouillon lié", status: "draft" }),
      hasActiveShareLink: true,
    } as ObjectListCard;
    const plainDraft = {
      ...card({ id: "D2", name: "Brouillon simple", status: "draft" }),
      hasActiveShareLink: false,
    } as ObjectListCard;
    jest.mocked(listMyLists).mockResolvedValue([linkedDraft, plainDraft]);
    renderView();
    await screen.findByText("Brouillon lié");
    const user = userEvent.setup();
    await user.click(screen.getByText("Filtres"));
    await user.selectOptions(
      screen.getByRole("combobox", { name: /État/ }),
      "draft",
    );
    await user.click(
      screen.getByRole("checkbox", { name: /Avec un lien actif/ }),
    );
    expect(screen.getByText("Brouillon lié")).toBeInTheDocument();
    expect(screen.queryByText("Brouillon simple")).not.toBeInTheDocument();
  });
});

describe("ListsManageView — Archives et restauration", () => {
  it("une liste archivée avec droit de restauration montre le bouton « Restaurer »", async () => {
    jest.mocked(listMyLists).mockResolvedValue([
      card({
        id: "AR1",
        name: "Vieille liste",
        isArchived: true,
        canRestore: true,
      }),
    ]);
    jest.mocked(restoreList).mockResolvedValue(null);
    renderView();

    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: /Archives/ }));
    await user.click(await screen.findByRole("button", { name: /Restaurer/ }));
    await waitFor(() => expect(restoreList).toHaveBeenCalledWith("AR1"));
  });

  it("une liste à la une n’apparaît jamais dans Archives même si elle a un statut d’ancienneté", async () => {
    // Contrat : is_archived = NOT is_featured AND ... — le serveur ne renverrait jamais
    // is_archived:true pour une liste à la une, mais on vérifie que le tri client respecte l'id.
    jest
      .mocked(listMyLists)
      .mockResolvedValue([card({ id: "M1", isArchived: false })]);
    renderView();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: /Archives/ }));
    expect(screen.getByText(/Aucune liste archivée/)).toBeInTheDocument();
  });
});

describe("ListsManageView — Dupliquer", () => {
  it("dupliquer une carte navigue vers la nouvelle composition", async () => {
    jest.mocked(listMyLists).mockResolvedValue([card({ id: "M1" })]);
    jest.mocked(duplicateList).mockResolvedValue("M1-copy");
    renderView();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Dupliquer/ }));
    await waitFor(() => expect(duplicateList).toHaveBeenCalledWith("M1"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/listes/M1-copy"));
  });
});

// Revue architecte (2026-09-07) — un QueryClient est un singleton mémoire PARTAGÉ entre tous les
// composants d'un même onglet ; sans l'identité dans la clé, deux personnes de la même ORG (ou
// une même personne changeant d'ORG) verraient la grille/les capacités de l'autre tant que le
// composant reste monté dans la session, bien avant tout rechargement de page.
describe("ListsManageView — isolation du cache par identité (revue architecte)", () => {
  function renderWithClient(queryClient: QueryClient) {
    return render(
      <QueryClientProvider client={queryClient}>
        <ListsManageView />
      </QueryClientProvider>,
    );
  }

  it("utilisateur A puis utilisateur B, MÊME organisation : aucune liste héritée", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    useSessionStore.setState({
      orgId: "org-1",
      userId: "user-A",
      role: "tourism_agent",
      adminRank: null,
    });
    jest
      .mocked(listMyLists)
      .mockResolvedValueOnce([card({ id: "A1", name: "Liste de A" })]);
    const { unmount } = renderWithClient(queryClient);
    await screen.findByText("Liste de A");
    unmount();

    useSessionStore.setState({
      orgId: "org-1",
      userId: "user-B",
      role: "tourism_agent",
      adminRank: null,
    });
    jest
      .mocked(listMyLists)
      .mockResolvedValueOnce([card({ id: "B1", name: "Liste de B" })]);
    renderWithClient(queryClient);
    await screen.findByText("Liste de B");

    expect(screen.queryByText("Liste de A")).not.toBeInTheDocument();
    // Les deux entrées coexistent, distinctes, dans le même QueryClient — la preuve que la clé
    // sépare bien les identités plutôt que d'écraser l'une par l'autre.
    expect(
      queryClient.getQueryData(listsQueryKeys.myLists("org-1", "user-A")),
    ).toEqual([expect.objectContaining({ id: "A1" })]);
    expect(
      queryClient.getQueryData(listsQueryKeys.myLists("org-1", "user-B")),
    ).toEqual([expect.objectContaining({ id: "B1" })]);
  });

  it("même utilisateur, organisation différente : aucune liste héritée", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    useSessionStore.setState({
      orgId: "org-1",
      userId: "user-A",
      role: "tourism_agent",
      adminRank: null,
    });
    jest
      .mocked(listMyLists)
      .mockResolvedValueOnce([card({ id: "A1", name: "Liste ORG1" })]);
    const { unmount } = renderWithClient(queryClient);
    await screen.findByText("Liste ORG1");
    unmount();

    useSessionStore.setState({
      orgId: "org-2",
      userId: "user-A",
      role: "tourism_agent",
      adminRank: null,
    });
    jest
      .mocked(listMyLists)
      .mockResolvedValueOnce([card({ id: "A2", name: "Liste ORG2" })]);
    renderWithClient(queryClient);
    await screen.findByText("Liste ORG2");

    expect(screen.queryByText("Liste ORG1")).not.toBeInTheDocument();
  });
});

describe("ListsManageView — erreurs de lecture (revue architecte)", () => {
  it("un échec de « à la une » affiche une relance, jamais « aucune liste »", async () => {
    jest.mocked(listFeaturedLists).mockRejectedValue(new Error("réseau"));
    renderView();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: /À la une/ }));
    expect(
      await screen.findByText(/Impossible de charger les listes à la une/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Aucune liste à la une pour le moment/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Réessayer/ }),
    ).toBeInTheDocument();
  });

  it("la relance « à la une » redemande la liste au service", async () => {
    jest.mocked(listFeaturedLists).mockRejectedValueOnce(new Error("réseau"));
    renderView();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: /À la une/ }));
    await screen.findByRole("button", { name: /Réessayer/ });
    jest
      .mocked(listFeaturedLists)
      .mockResolvedValueOnce([
        card({ id: "F1", name: "Une liste", isFeatured: true }),
      ]);
    await user.click(screen.getByRole("button", { name: /Réessayer/ }));
    expect(await screen.findByText("Une liste")).toBeInTheDocument();
  });

  it("une liste personnelle NE disparaît PAS de « Mes listes » quand « à la une » échoue", async () => {
    jest.mocked(listFeaturedLists).mockRejectedValue(new Error("réseau"));
    jest
      .mocked(listMyLists)
      .mockResolvedValue([card({ id: "M1", name: "Ma liste perso" })]);
    renderView();
    expect(await screen.findByText("Ma liste perso")).toBeInTheDocument();
  });

  it("un échec des propositions (admin) affiche une alerte dans « À la une »", async () => {
    useSessionStore.setState({
      orgId: "org-1",
      role: "tourism_agent",
      adminRank: 30,
    });
    jest.mocked(listListProposals).mockRejectedValue(new Error("réseau"));
    renderView();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: /À la une/ }));
    expect(
      await screen.findByText(
        /Impossible de charger les propositions en attente/,
      ),
    ).toBeInTheDocument();
  });

  it("une recherche sans résultat se distingue d’une section réellement vide (à la une)", async () => {
    jest
      .mocked(listFeaturedLists)
      .mockResolvedValue([
        card({ id: "F1", name: "Escapade Sud", isFeatured: true }),
      ]);
    renderView();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: /À la une/ }));
    await screen.findByText("Escapade Sud");
    await user.type(
      screen.getByRole("textbox", { name: /Rechercher une liste/ }),
      "zzz-inexistant",
    );
    expect(
      await screen.findByText(/Aucune liste ne correspond à la recherche/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/^Aucune liste à la une pour le moment\.$/),
    ).not.toBeInTheDocument();
  });
});
