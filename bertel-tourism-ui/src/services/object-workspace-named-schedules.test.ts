import {
  parseWorkspaceOpeningPeriodRows,
  projectWorkspaceOpeningSchedules,
  type ObjectWorkspaceOpeningSchedule,
} from "./object-workspace-parser";
import {
  buildOpeningSchedules,
  buildOpeningsPayload,
} from "./object-workspace-payloads/openings";
const schedule = (
  type: string,
  name: string,
  start: string,
): ObjectWorkspaceOpeningSchedule => ({
  id: null,
  schedule_type_code: type,
  schedule_type_id: null,
  name,
  note: null,
  name_i18n: { en: name },
  note_i18n: null,
  extra: { retained: true },
  time_periods: [
    {
      id: null,
      closed: false,
      note: "Sur réservation",
      weekdays: [{ weekday_code: "monday" }],
      time_frames: [
        { id: null, start_time: start, end_time: "18:00", recurrence: null },
      ],
    },
  ],
});
test("ouverture + accueil + service : trois grilles distinctes, aucun horaire de service fusionné", () => {
  const schedules = [
    schedule("regular", "Ouverture", "09:00"),
    schedule("reception", "Accueil", "10:00"),
    schedule("service", "Nourrissage des animaux", "15:00"),
  ];
  const projection = projectWorkspaceOpeningSchedules(schedules);
  expect(projection.editingUnavailableReason).toBeNull();
  expect(projection.weekdays[0].slots).toEqual([
    { start: "09:00", end: "18:00" },
  ]);
  expect(
    projectWorkspaceOpeningSchedules([schedules[2]], true).weekdays[0].slots[0]
      .start,
  ).toBe("15:00");
});
test("deux plannings principaux concurrents restent protégés", () => {
  expect(
    projectWorkspaceOpeningSchedules([
      schedule("regular", "A", "09:00"),
      schedule("seasonal", "B", "10:00"),
    ]).editingUnavailableReason,
  ).not.toBeNull();
});
test("modifier l’ouverture conserve intégralement les deux autres plannings et leur ordre", () => {
  const main = schedule("regular", "Ouverture", "09:00"),
    service = schedule("service", "Nourrissage des animaux", "15:00"),
    reception = schedule("reception", "Accueil", "10:00");
  const period = parseWorkspaceOpeningPeriodRows([
    { id: null, all_years: true, schedules: [service, main, reception] },
  ])[0];
  period.weekdays[0].slots = [{ start: "08:30", end: "18:30" }];
  const output = buildOpeningsPayload([period])[0].schedules;
  expect(output.map((s) => s.name)).toEqual([
    "Nourrissage des animaux",
    "Ouverture",
    "Accueil",
  ]);
  expect(output[0]).toEqual(service);
  expect(output[2]).toEqual(reception);
  expect(output[1].time_periods[0].time_frames[0].start_time).toBe("08:30");
});
test("un planning nommé seul n’est pas converti en ouverture à l’envoi", () => {
  const service = schedule("service", "Nourrissage des animaux", "15:00");
  const period = parseWorkspaceOpeningPeriodRows([
    { all_years: true, schedules: [service] },
  ])[0];
  expect(period.weekdays).toEqual([]);
  expect(buildOpeningSchedules(period)).toEqual([service]);
});
