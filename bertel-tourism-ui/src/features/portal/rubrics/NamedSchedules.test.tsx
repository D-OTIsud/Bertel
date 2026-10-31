import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HoursRubric } from "./HoursRubric";
import { fakeEditor, portalModules } from "../__fixtures__/portal-fixtures";
import { PORTAL_RUBRICS, type BuiltPortalRubric } from "../portal-rubrics";
import { buildOpeningsPayload } from "../../../services/object-workspace";
import type { ObjectWorkspaceOpeningsModule } from "../../../services/object-workspace-parser";
function setup(archetype: "VIS" | "RES" | "ASC" = "VIS") {
  const editor = fakeEditor(portalModules());
  render(
    <HoursRubric
      editor={editor}
      archetype={archetype}
      rubric={
        {
          ...PORTAL_RUBRICS.find((r) => r.id === "hours")!,
          state: "todo",
          readOnlyReason: null,
        } as BuiltPortalRubric
      }
      formKey="hours"
      onDone={jest.fn()}
      onCancel={jest.fn()}
      onDirtyChange={jest.fn()}
    />,
  );
  return editor;
}
test("parc animalier : suggestion exacte, grille séparée et nom conservé dans l’envoi", async () => {
  const editor = setup();
  await userEvent.click(
    screen.getByRole("button", {
      name: "Nourrissage des animaux",
    }),
  );
  const service = screen.getByRole("region", {
    name: "Nourrissage des animaux",
  });
  await userEvent.click(
    within(service).getByRole("button", {
      name: "Tous les jours",
    }),
  );
  fireEvent.change(within(service).getByLabelText(/^de quelle heure/), {
    target: { value: "15:00" },
  });
  fireEvent.change(within(service).getByLabelText(/^à quelle heure/), {
    target: { value: "15:30" },
  });
  const ids = [...document.querySelectorAll("[id]")].map((e) => e.id);
  expect(new Set(ids).size).toBe(ids.length);
  await userEvent.click(screen.getByRole("button", { name: "Valider" }));
  const module = (editor.replaceModule as jest.Mock).mock
    .calls[0][1] as ObjectWorkspaceOpeningsModule;
  expect(buildOpeningsPayload(module.periods)[0].schedules).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: "Nourrissage des animaux",
        schedule_type_code: "service",
      }),
    ]),
  );
});
test("restaurant sans bloc services ; activités avec les deux suggestions prévues", () => {
  setup("RES");
  expect(
    screen.queryByText("Les horaires de vos services"),
  ).not.toBeInTheDocument();
  cleanup();
  setup("ASC");
  expect(
    screen.getByRole("button", { name: "Départs des sorties" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Location de matériel" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Petit-déjeuner" }),
  ).not.toBeInTheDocument();
});
test("un service ajouté sans nom ni horaires conserve le formulaire et explique ce qui manque", async () => {
  const editor = setup();
  await userEvent.click(
    screen.getByRole("button", { name: "Autre service" }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Valider" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Donnez un nom au service.",
  );
  expect(editor.replaceModule).not.toHaveBeenCalled();
});
