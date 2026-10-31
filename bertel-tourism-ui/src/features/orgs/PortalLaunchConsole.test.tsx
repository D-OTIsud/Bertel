import {
  render,
  screen,
  within,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PortalLaunchConsole } from "./PortalLaunchConsole";
import {
  getPortalLaunch,
  invitePortalLaunchGroup,
  type PortalLaunchSnapshot,
} from "../../services/portal-launch";
jest.mock("../../services/portal-launch", () => ({
  ...jest.requireActual("../../services/portal-launch"),
  getPortalLaunch: jest.fn(),
  invitePortalLaunchGroup: jest.fn(),
  sendPortalLaunchTest: jest.fn(),
}));
const snapshot: PortalLaunchSnapshot = {
  stats: { reachable: 2, invited: 0, activated: 0, submitted: 0, reminded: 0 },
  actors: [
    {
      actor_id: "a",
      actor_name: "Marie",
      email: "marie@example.test",
      user_id: null,
      invited_at: null,
      activated_at: null,
      first_submission_at: null,
      reminded_at: null,
      fiche_names: ["La Case"],
      types: ["HLO"],
      communes: ["Saint-Pierre"],
      email_conflict: false,
    },
  ],
  pending: 0,
  averageReviewDays: null,
  smtp: { configured: true, tested: true, testedAt: "2026-10-31" },
  office: { name: "Office", email: "office@example.test", phone: "0262000000" },
  applicationConfigured: true,
  invitationHtml: "<p>Invitation fictive</p>",
  remindersEnabled: true,
};
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <PortalLaunchConsole orgId="ORG" onShowSections={jest.fn()} />
    </QueryClientProvider>,
  );
  return client;
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getPortalLaunch).mockResolvedValue(snapshot);
  jest
    .mocked(invitePortalLaunchGroup)
    .mockImplementation(async (people, progress) =>
      people.map((person, index) => {
        const result = {
          actorId: person.actor_id,
          name: person.actor_name,
          sent: true,
        };
        progress(result, index + 1);
        return result;
      }),
    );
});
test("un SMTP absent bloque le groupe et renvoie vers le formulaire approuvé", async () => {
  jest
    .mocked(getPortalLaunch)
    .mockResolvedValue({
      ...snapshot,
      smtp: { ...snapshot.smtp, configured: false },
    });
  mount();
  expect(
    await screen.findByRole("button", { name: "Inviter 1 partenaire" }),
  ).toBeDisabled();
  expect(screen.getByRole("link", { name: "Configurer" })).toHaveAttribute(
    "href",
    "/settings?section=org-smtp",
  );
});
test("l’office relit les destinataires exacts avant l’envoi ; un rafraîchissement ne change pas le groupe confirmé", async () => {
  const client = mount();
  fireEvent.click(
    await screen.findByRole("button", { name: "Inviter 1 partenaire" }),
  );
  const dialog = await screen.findByRole("dialog", {
    name: "Inviter 1 partenaires",
  });
  expect(within(dialog).getByText("marie@example.test")).toBeInTheDocument();
  expect(invitePortalLaunchGroup).not.toHaveBeenCalled();
  client.setQueryData(["portal-launch", "ORG"], { ...snapshot, actors: [] });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Envoyer les invitations" }),
  );
  await waitFor(() =>
    expect(invitePortalLaunchGroup).toHaveBeenCalledWith(
      snapshot.actors,
      expect.any(Function),
    ),
  );
  expect(await screen.findByText("1 e-mail envoyé.")).toBeInTheDocument();
});
