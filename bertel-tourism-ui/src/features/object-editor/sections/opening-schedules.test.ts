import { createPeriodDraft } from "./opening-period-edit";
import { buildOpeningsPayload } from "../../../services/object-workspace-payloads/openings";
import {
  projectWorkspaceOpeningSchedules,
  type ObjectWorkspaceOpeningSchedule,
} from "../../../services/object-workspace-parser";
import {
  officeOpeningSchedules,
  patchOfficeOpeningSchedule,
  patchOfficeOpeningRows,
  addOfficeOpeningSchedule,
  removeOfficeOpeningSchedule,
  normalizeOfficeOpeningSchedules,
} from "./opening-schedules";

const schedule = (
  name: string,
  type: string,
  start = "09:00",
  end = "12:00",
): ObjectWorkspaceOpeningSchedule => ({
  id: null,
  schedule_type_id: null,
  schedule_type_code: type,
  name,
  note: null,
  name_i18n: { en: name },
  note_i18n: null,
  extra: { imported: true },
  time_periods: [
    {
      id: null,
      closed: false,
      note: "Sur réservation",
      weekdays: [{ weekday_code: "monday" }],
      time_frames: [
        { id: null, start_time: start, end_time: end, recurrence: null },
      ],
    },
  ],
});
function period(
  schedules = [
    schedule("Ouverture", "regular"),
    schedule("Accueil", "reception"),
    schedule("Visite guidée", "service", "15:00", "15:30"),
  ],
) {
  return {
    ...createPeriodDraft(),
    recurrence: "always" as const,
    schedules,
    ...projectWorkspaceOpeningSchedules(schedules),
  };
}
test("chaque planning possède sa projection indépendante", () => {
  const views = officeOpeningSchedules(period());
  expect(views).toHaveLength(3);
  expect(views[2].period.weekdays[0].slots).toEqual([
    { start: "15:00", end: "15:30" },
  ]);
  expect(views.every((view) => !view.reason)).toBe(true);
});
test("une période sans planning propose une grille principale sans ajouter de données avant une saisie", () => {
  const before = period([]);
  expect(officeOpeningSchedules(before)).toHaveLength(1);
  expect(normalizeOfficeOpeningSchedules(before)).toBe(before);
  const edited = patchOfficeOpeningRows(before, 0, [
    {
      code: "monday",
      label: "lundi",
      slots: [{ start: "09:00", end: "18:00" }],
    },
  ]);
  expect(buildOpeningsPayload([edited])[0].schedules[0]).toMatchObject({
    schedule_type_code: "regular",
    time_periods: [
      expect.objectContaining({
        time_frames: [
          expect.objectContaining({ start_time: "09:00", end_time: "18:00" }),
        ],
      }),
    ],
  });
});
test("modifier un service garde exactement les autres plannings et leurs métadonnées à l’envoi", () => {
  const before = period();
  const next = patchOfficeOpeningRows(before, 2, [
    {
      code: "monday",
      label: "lundi",
      slots: [{ start: "16:00", end: "16:30" }, null],
    },
  ]);
  const payload = buildOpeningsPayload([next])[0];
  expect(payload.schedules.slice(0, 2)).toEqual(before.schedules.slice(0, 2));
  expect(payload.schedules[2]).toMatchObject({
    name: "Visite guidée",
    name_i18n: { en: "Visite guidée" },
    extra: { imported: true },
    time_periods: [
      expect.objectContaining({
        note: "Sur réservation",
        time_frames: [
          expect.objectContaining({ start_time: "16:00", end_time: "16:30" }),
        ],
      }),
    ],
  });
});
test("nom et type changent sans perdre les jours, notes ou traductions importées", () => {
  const before = period();
  const next = patchOfficeOpeningSchedule(before, 2, {
    name: "Nourrissage des animaux",
    schedule_type_code: "reception",
  });
  expect(next.schedules![2]).toMatchObject({
    ...before.schedules[2],
    name: "Nourrissage des animaux",
    schedule_type_id: null,
    schedule_type_code: "reception",
  });
});
test("un planning complexe reste intact pendant l’édition d’un autre", () => {
  const complex = schedule("Importé", "regular");
  complex.time_periods[0].time_frames.push({
    id: null,
    start_time: "17:00",
    end_time: "19:00",
    recurrence: "00:30:00",
  });
  const before = period([complex, schedule("Visite", "service")]);
  expect(officeOpeningSchedules(before)[0].reason).toBeTruthy();
  const next = patchOfficeOpeningRows(before, 1, [
    {
      code: "monday",
      label: "lundi",
      slots: [{ start: "14:00", end: "15:00" }],
    },
  ]);
  expect(buildOpeningsPayload([next])[0].schedules[0]).toEqual(complex);
});
test("ajouter, retirer ou convertir le seul planning principal ne crée pas un faux horaire d’ouverture", () => {
  const before = period([schedule("Ouverture", "regular")]);
  const added = addOfficeOpeningSchedule(before);
  expect(added.schedules).toHaveLength(2);
  expect(added.schedules![1].schedule_type_code).toBe("service");
  const converted = patchOfficeOpeningSchedule(before, 0, {
    schedule_type_code: "service",
  });
  expect(converted.weekdays).toEqual([]);
  expect(
    buildOpeningsPayload([converted])[0].schedules.map(
      (s) => s.schedule_type_code,
    ),
  ).toEqual(["service"]);
  expect(removeOfficeOpeningSchedule(added, 1).schedules).toEqual(
    before.schedules,
  );
});
test("les saisies courtes sont normalisées seulement à l’application", () => {
  const before = period();
  const changed = patchOfficeOpeningRows(before, 2, [
    { code: "monday", label: "lundi", slots: [{ start: "9h30", end: "12h" }] },
  ]);
  const saved = normalizeOfficeOpeningSchedules(changed);
  expect(saved.schedules![2].time_periods[0].time_frames[0]).toMatchObject({
    start_time: "09:30",
    end_time: "12:00",
  });
  expect(saved.schedules![0]).toEqual(before.schedules[0]);
});
