import { parseWorkspaceOpeningPeriodRows } from "../../services/object-workspace-parser";
import { buildOpeningsPayload } from "../../services/object-workspace";
import {
  readPortalNamedSchedules,
  setPortalNamedSchedules,
  newPortalNamedSchedule,
  receptionByDefault,
} from "./portal-named-schedules";
import { setWeekHours } from "./portal-bindings";
import { portalModules } from "./__fixtures__/portal-fixtures";

function data() {
  const module = portalModules().openings;
  module.periods = parseWorkspaceOpeningPeriodRows([
    {
      all_years: true,
      schedules: [
        {
          name: "Ouverture",
          schedule_type_code: "regular",
          extra: { principal: true },
          time_periods: [
            {
              weekdays: [{ weekday_code: "monday" }],
              time_frames: [{ start_time: "09:00", end_time: "18:00" }],
            },
          ],
        },
        {
          name: "Nourrissage des animaux",
          schedule_type_code: "service",
          extra: { imported: true },
          name_i18n: { en: "Animal feeding" },
          time_periods: [
            {
              note: "Réserver à l’accueil",
              weekdays: [{ weekday_code: "monday" }],
              time_frames: [{ start_time: "15:00", end_time: "15:30" }],
            },
          ],
        },
        {
          name: "Accueil",
          schedule_type_code: "reception",
          time_periods: [
            {
              weekdays: [{ weekday_code: "monday" }],
              time_frames: [{ start_time: "10:00", end_time: "16:00" }],
            },
          ],
        },
      ],
    },
  ]);
  return module;
}
test("modifier un service ne modifie ni l’ouverture ni l’accueil et conserve notes et métadonnées", () => {
  const before = data(),
    forms = readPortalNamedSchedules(before);
  forms[0].form.hours.monday.slots = [{ start: "14:30", end: "15:00" }];
  const payload = buildOpeningsPayload(
    setPortalNamedSchedules(before, forms).periods,
  )[0].schedules;
  expect(payload[0]).toEqual(
    buildOpeningsPayload(before.periods)[0].schedules[0],
  );
  expect(payload[2]).toEqual(before.periods[0].schedules?.[2]);
  expect(payload[1]).toMatchObject({
    name: "Nourrissage des animaux",
    name_i18n: { en: "Animal feeding" },
    extra: { imported: true },
    time_periods: expect.arrayContaining([
      expect.objectContaining({
        note: "Réserver à l’accueil",
        time_frames: [
          expect.objectContaining({ start_time: "14:30", end_time: "15:00" }),
        ],
      }),
    ]),
  });
});
test("lire puis valider sans rien changer ne crée pas de différence et garde la grille principale modifiée", () => {
  const before = data();
  expect(
    setPortalNamedSchedules(before, readPortalNamedSchedules(before)),
  ).toBe(before);
  const changed = setWeekHours(before, {
    monday: {
      open: true,
      fixedHours: true,
      slots: [{ start: "08:00", end: "18:00" }],
    },
  });
  expect(
    setPortalNamedSchedules(changed, readPortalNamedSchedules(before)),
  ).toBe(changed);
});
test("retirer un service conserve les autres ; ajouter un service ne réutilise aucun identifiant", () => {
  const before = data();
  const forms = readPortalNamedSchedules(before).filter(
    (s) => s.type === "reception",
  );
  const added = newPortalNamedSchedule(
    "service",
    "Visite guidée",
    "new-service",
  );
  added.form.hours.tuesday = {
    open: true,
    fixedHours: true,
    slots: [{ start: "11:00", end: "12:00" }],
  };
  const output = buildOpeningsPayload(
    setPortalNamedSchedules(before, [...forms, added]).periods,
  )[0].schedules;
  expect(output.map((s) => s.name)).toEqual([
    "Ouverture",
    "Accueil",
    "Visite guidée",
  ]);
  expect(output[2].id).toBeNull();
});
test("la réponse par défaut de l’accueil ne crée pas de planning vide au moment de valider les heures de séjour", () => {
  const before = portalModules().openings;
  before.periods = parseWorkspaceOpeningPeriodRows([
    { all_years: true, schedules: [] },
  ]);
  expect(
    setPortalNamedSchedules(before, [
      newPortalNamedSchedule("reception", "Accueil", "new"),
    ]),
  ).toBe(before);
  expect(["HOT", "HPA", "CAMP"].map(receptionByDefault)).toEqual([
    true,
    true,
    true,
  ]);
  expect(["HLO", "RVA"].map(receptionByDefault)).toEqual([false, false]);
});
