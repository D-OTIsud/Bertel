import {
  selectPortalLaunchActors,
  invitePortalLaunchGroup,
  type PortalLaunchActor,
} from "./portal-launch";
import { invitePortalAccess, resendPortalAccess } from "./actor-access";
jest.mock("./actor-access", () => ({
  invitePortalAccess: jest.fn(),
  resendPortalAccess: jest.fn(),
}));
const actor = (
  id: string,
  patch: Partial<PortalLaunchActor> = {},
): PortalLaunchActor => ({
  actor_id: id,
  actor_name: id,
  email: `${id}@example.test`,
  user_id: null,
  invited_at: null,
  activated_at: null,
  first_submission_at: null,
  reminded_at: null,
  fiche_names: ["Une fiche"],
  types: ["HLO"],
  communes: ["Saint-Pierre"],
  email_conflict: false,
  ...patch,
});
test("le groupe exclut les comptes actifs et les conflits d’adresse, puis filtre commune, type et taille", () => {
  const people = [
    actor("a"),
    actor("b", { types: ["RES"] }),
    actor("c", { activated_at: "2026-10-31" }),
    actor("d", { email_conflict: true }),
    actor("e", { invited_at: "2026-10-20" }),
    actor("f", { communes: ["Le Tampon"] }),
  ];
  expect(
    selectPortalLaunchActors(people, {
      types: ["HLO"],
      commune: "Saint-Pierre",
      limit: 20,
      excludeInvited: true,
    }).map((row) => row.actor_id),
  ).toEqual(["a"]);
  expect(
    selectPortalLaunchActors(people, {
      types: [],
      commune: "",
      limit: 2,
      excludeInvited: false,
    }).map((row) => row.actor_id),
  ).toEqual(["a", "b"]);
});
test("une erreur d’envoi n’efface pas les succès ; un compte existant est renvoyé sans créer un doublon", async () => {
  jest
    .mocked(invitePortalAccess)
    .mockResolvedValueOnce({ traced: true })
    .mockRejectedValueOnce(new Error("SMTP indisponible"));
  jest
    .mocked(resendPortalAccess)
    .mockResolvedValueOnce({ traced: true, tracked: false });
  const progress = jest.fn();
  const result = await invitePortalLaunchGroup(
    [actor("a"), actor("b"), actor("c", { user_id: "existing" })],
    progress,
  );
  expect(result.map((row) => row.sent)).toEqual([true, false, true]);
  expect(result[2].trackingFailed).toBe(true);
  expect(resendPortalAccess).toHaveBeenCalledWith("c", "c@example.test");
  expect(progress).toHaveBeenCalledTimes(3);
});
