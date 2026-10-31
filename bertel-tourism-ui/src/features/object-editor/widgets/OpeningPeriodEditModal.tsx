import { useId, useState } from "react";
import {
  Chip,
  ChipSet,
  Disclosure,
  EditorModal,
  Field,
  Input,
  ScheduleEditor,
  Select,
} from "../primitives";
import { validatePeriodDraft } from "../sections/opening-period-edit";
import {
  decodeCyclicFields,
  encodeCyclicFields,
  EMPTY_CYCLIC_FIELDS,
  findPeriodConflicts,
  type CyclicFields,
  type RecurrencePeriod,
} from "../sections/opening-recurrence";
import {
  openingPeriodEditingReason,
  openingPeriodNotes,
  scheduleRowsFromPeriod,
} from "../sections/blocks/opening-schedule";
import {
  buildRibbonSegments,
  formatPeriodRange,
  MONTHS,
} from "../sections/blocks/opening-period-meta";
import { formatScheduleTime } from "../primitives/schedule-time";
import {
  addOfficeOpeningSchedule,
  officeOpeningSchedules,
  OFFICE_SCHEDULE_TYPES,
  patchOfficeOpeningRows,
  patchOfficeOpeningSchedule,
  removeOfficeOpeningSchedule,
  normalizeOfficeOpeningSchedules,
} from "../sections/opening-schedules";
import type {
  ObjectWorkspaceOpeningPeriod,
  ObjectWorkspaceOpeningPeriodTypeOption,
} from "../../../services/object-workspace-parser";
import "./opening-period-edit-modal.css";

interface OpeningPeriodEditModalProps {
  open: boolean;
  mode: "add" | "edit";
  draft: ObjectWorkspaceOpeningPeriod;
  /** The other periods of the object, used for live overlap validation. */
  existingPeriods: ObjectWorkspaceOpeningPeriod[];
  /** Admin-managed period-type catalog (ref_code_opening_period_type). */
  periodTypeOptions: ObjectWorkspaceOpeningPeriodTypeOption[];
  onClose: () => void;
  onSave: (period: ObjectWorkspaceOpeningPeriod) => void;
}

const RECURRENCE_OPTIONS: {
  v: ObjectWorkspaceOpeningPeriod["recurrence"];
  l: string;
}[] = [
  { v: "cyclic", l: "Chaque année" },
  { v: "fixed", l: "Une seule fois" },
  { v: "always", l: "Toute l'année" },
];

const MONTH_OPTIONS = [
  { v: "", l: "— Mois —" },
  ...[
    "Janvier",
    "Février",
    "Mars",
    "Avril",
    "Mai",
    "Juin",
    "Juillet",
    "Août",
    "Septembre",
    "Octobre",
    "Novembre",
    "Décembre",
  ].map((l, i) => ({ v: String(i + 1), l })),
];

const DAY_OPTIONS = [
  { v: "", l: "—" },
  ...Array.from({ length: 31 }, (_, i) => ({
    v: String(i + 1),
    l: String(i + 1),
  })),
];

/** Build the visible day groups from the editable draft without changing its source data. */
function weeklyPreview(
  period: ObjectWorkspaceOpeningPeriod,
): { days: string; hours: string }[] {
  const groups = new Map<string, { index: number; label: string }[]>();
  scheduleRowsFromPeriod(period).forEach((row, index) => {
    const slots = row.slots.filter((slot): slot is NonNullable<typeof slot> =>
      Boolean(slot),
    );
    const hours =
      period.isClosure || slots.length === 0
        ? "Fermé"
        : slots
            .map((slot) =>
              !slot.start && !slot.end
                ? "Sans horaire fixe"
                : `${formatScheduleTime(slot.start) || slot.start || "—"}–${formatScheduleTime(slot.end) || slot.end || "—"}`,
            )
            .join(", ");
    const days = groups.get(hours) ?? [];
    days.push({
      index,
      label: `${(row.shortLabel ?? row.label).toLocaleLowerCase("fr-FR")}.`,
    });
    groups.set(hours, days);
  });
  return [...groups].map(([hours, days]) => ({
    hours,
    days:
      days.length === 7
        ? "Tous les jours"
        : days.length > 2 &&
            days[days.length - 1].index - days[0].index === days.length - 1
          ? `${days[0].label} → ${days[days.length - 1].label}`
          : days.map((day) => day.label).join(", "),
  }));
}

/**
 * Focused add/edit modal for one §14 opening period (parallel to ClassificationEditModal).
 * Holds a local draft; the section commits the whole period array on save. recordId/order are
 * carried by spreading the edited period into the draft — no modal control ever sets them.
 *
 * The Récurrence selector (not the period type) now drives the date UI:
 *  - cyclic → month + optional day pickers (stored via encodeCyclicRange in sentinel year 2000)
 *  - fixed  → full calendar dates
 *  - always → no dates
 * The period TYPE is optional and only labels the period (seasonTypeCode).
 */
export function OpeningPeriodEditModal({
  open,
  mode,
  draft: initialDraft,
  existingPeriods,
  periodTypeOptions,
  onClose,
  onSave,
}: OpeningPeriodEditModalProps) {
  const [draft, setDraft] = useState(initialDraft);
  const schedulesId = useId();
  const set = (patch: Partial<ObjectWorkspaceOpeningPeriod>) =>
    setDraft((current) => ({ ...current, ...patch }));

  const schedules = officeOpeningSchedules(draft);
  const dates = validatePeriodDraft({ ...draft, weekdays: [] });
  const timeError =
    schedules
      .filter((view) => !view.reason)
      .map((view) => validatePeriodDraft(view.period).timeError)
      .find(Boolean) ?? null;
  const nameError = schedules.some(
    (view) =>
      ["reception", "service"].includes(view.source.schedule_type_code ?? "") &&
      !view.source.name?.trim(),
  )
    ? "Nommez chaque planning d’accueil ou de service."
    : null;
  const validation = {
    ...dates,
    timeError,
    canSave: dates.canSave && !timeError && !nameError,
  };
  const legacyBlocked = !draft.schedules?.length
    ? openingPeriodEditingReason(draft)
    : null;
  const previewPeriods = [
    ...existingPeriods.filter(
      (period) =>
        period !== initialDraft &&
        (!initialDraft.recordId || period.recordId !== initialDraft.recordId),
    ),
    draft,
  ];
  const segments = buildRibbonSegments(previewPeriods);

  // Overlap validation: a period must not partially cross another same-layer period.
  // ObjectWorkspaceOpeningPeriod structurally satisfies RecurrencePeriod (recurrence,
  // isClosure, startDate, endDate, label), so the cast is sound.
  const others = (initialDraft.recordId
    ? existingPeriods.filter((pp) => pp.recordId !== initialDraft.recordId)
    : existingPeriods) as unknown as RecurrencePeriod[];
  const conflicts = findPeriodConflicts(
    draft as unknown as RecurrencePeriod,
    others,
  );
  const overlapError =
    conflicts.length > 0
      ? `Cette période recoupe : ${conflicts.map((c) => c.label).join(", ")}.`
      : null;

  const typeSelectOptions = [
    { v: "", l: "— Aucun —" },
    ...periodTypeOptions.map((option) => ({ v: option.code, l: option.label })),
  ];

  // The TYPE is now purely a label; it no longer drives dates/allYears/recurrence.
  function selectType(code: string) {
    set({ seasonTypeCode: code });
  }

  // --- Cyclic month/day editing ---------------------------------------------
  // The picker lives in its OWN state, NOT derived from the encoded date: a partial
  // selection (only the start month, say) cannot be encoded, so deriving the selects
  // from startDate/endDate dropped the pick (it snapped back to "— Mois —"). We hold the
  // fields here and mirror them onto the draft dates (empty while incomplete) so the save
  // gate ("Renseignez le début et la fin") and the overlap check still read from the draft.
  const [cyclic, setCyclic] = useState<CyclicFields>(() =>
    decodeCyclicFields(initialDraft.startDate, initialDraft.endDate),
  );
  function patchCyclic(patch: Partial<CyclicFields>) {
    const next = { ...cyclic, ...patch };
    setCyclic(next);
    set(encodeCyclicFields(next));
  }

  return (
    <EditorModal
      className="ed-opening-period-modal"
      open={open}
      title={mode === "edit" ? "Modifier la période" : "Ajouter une période"}
      eyebrow="Horaires · Période d’ouverture"
      onClose={onClose}
      onSave={() =>
        onSave(
          normalizeOfficeOpeningSchedules({
            ...draft,
            weekdays: draft.weekdays.map((day) => ({
              ...day,
              slots: day.slots.map((slot) => ({
                start: formatScheduleTime(slot.start) ?? slot.start,
                end: formatScheduleTime(slot.end) ?? slot.end,
              })),
            })),
          }),
        )
      }
      saveDisabled={
        !validation.canSave || Boolean(overlapError) || Boolean(legacyBlocked)
      }
      saveLabel={mode === "add" ? "Ajouter" : "Appliquer"}
      size="lg"
      footerNote={
        legacyBlocked
          ? "Période conservée sans modification"
          : validation.dateError ||
            validation.timeError ||
            nameError ||
            overlapError ||
            "Prêt à appliquer au brouillon"
      }
      aside={
        <>
          <h3>Votre année</h3>
          <div className="ed-record-modal__preview">
            <div className="ed-modal__calendar">
              {MONTHS.map((month) => (
                <span key={month}>{month.slice(0, 1)}</span>
              ))}
            </div>
            {previewPeriods.map((period, index) => (
              <div key={period.recordId ?? index}>
                <div className="ed-modal__calendar" aria-hidden>
                  {MONTHS.map((month, monthIndex) => (
                    <i
                      key={month}
                      data-active={segments.some(
                        (segment) =>
                          segment.periodIndex === index &&
                          segment.start < monthIndex + 1 &&
                          segment.end > monthIndex,
                      )}
                    />
                  ))}
                </div>
                <p>
                  {period.label ||
                    (index === previewPeriods.length - 1
                      ? "Nouvelle période"
                      : `Période ${index + 1}`)}
                </p>
              </div>
            ))}
          </div>
          <h3>Sur la fiche</h3>
          <div className="ed-record-modal__preview">
            <strong>{draft.label || "Nouvelle période"}</strong>
            <p>{formatPeriodRange(draft)}</p>
            {schedules.map((view) => (
              <div key={view.index} className="opening-schedule-preview">
                <h4>{view.title}</h4>
                {view.reason ? (
                  <p>
                    Horaires complexes conservés ; cet aperçu simplifié ne les
                    représente pas.
                  </p>
                ) : (
                  <dl
                    className="opening-preview-hours"
                    aria-label={
                      schedules.length === 1
                        ? "Aperçu des horaires hebdomadaires"
                        : `Aperçu des horaires : ${view.title}`
                    }
                  >
                    {weeklyPreview(view.period).map(({ days, hours }) => (
                      <div key={hours}>
                        <dt>{days}</dt>
                        <dd>{hours}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            ))}
          </div>
          <h3>Avant d’appliquer</h3>
          <ul className="ed-record-modal__checks">
            <li data-complete={validation.canSave}>
              {validation.canSave ? "✓" : "○"} Dates
            </li>
            <li data-complete={!overlapError}>
              {overlapError ? "○" : "✓"} Pas de chevauchement
            </li>
            <li data-complete={!legacyBlocked}>
              {legacyBlocked ? "○" : "✓"} Horaires conservés
            </li>
          </ul>
        </>
      }
    >
      <section className="ed-modal__section">
        <h3>Quand ?</h3>
        <div
          className="ed-modal__segmented"
          role="group"
          aria-label="Récurrence"
        >
          {RECURRENCE_OPTIONS.map((option) => (
            <button
              key={option.v}
              type="button"
              aria-pressed={draft.recurrence === option.v}
              onClick={() => {
                const r = option.v;
                const recurrence =
                  r as ObjectWorkspaceOpeningPeriod["recurrence"];
                // Reset dates + the cyclic picker. A year-round period carries no season étiquette,
                // so drop the type when switching to "Toute l'année" (nothing to label).
                setCyclic(EMPTY_CYCLIC_FIELDS);
                set({
                  recurrence,
                  startDate: "",
                  endDate: "",
                  ...(recurrence === "always" ? { seasonTypeCode: "" } : {}),
                });
              }}
            >
              {option.l}
            </button>
          ))}
        </div>
      </section>

      {draft.recurrence === "cyclic" && (
        <>
          <div className="grid-2" style={{ gap: 10 }}>
            <Field label="Début (mois / jour)">
              <div style={{ display: "flex", gap: 6 }}>
                <Select
                  aria-label="Mois de début"
                  value={cyclic.startMonth}
                  options={MONTH_OPTIONS}
                  onChange={(v) => patchCyclic({ startMonth: v })}
                />
                <Select
                  aria-label="Jour de début"
                  value={cyclic.startDay}
                  options={DAY_OPTIONS}
                  onChange={(v) => patchCyclic({ startDay: v })}
                />
              </div>
            </Field>
            <Field label="Fin (mois / jour)">
              <div style={{ display: "flex", gap: 6 }}>
                <Select
                  aria-label="Mois de fin"
                  value={cyclic.endMonth}
                  options={MONTH_OPTIONS}
                  onChange={(v) => patchCyclic({ endMonth: v })}
                />
                <Select
                  aria-label="Jour de fin"
                  value={cyclic.endDay}
                  options={DAY_OPTIONS}
                  onChange={(v) => patchCyclic({ endDay: v })}
                />
              </div>
            </Field>
          </div>
          {validation.dateError && (
            <p
              role="alert"
              className="muted"
              style={{ marginTop: 0, color: "var(--red, #93392a)" }}
            >
              {validation.dateError}
            </p>
          )}
          {overlapError && (
            <p
              role="alert"
              className="muted"
              style={{ marginTop: 0, color: "var(--red, #93392a)" }}
            >
              {overlapError}
            </p>
          )}
        </>
      )}

      {draft.recurrence === "fixed" && (
        <>
          <div className="grid-2" style={{ gap: 10 }}>
            <Field label="Date de début">
              <Input
                type="date"
                aria-label="Date de début"
                value={draft.startDate}
                onChange={(startDate) => set({ startDate })}
              />
            </Field>
            <Field label="Date de fin">
              <Input
                type="date"
                aria-label="Date de fin"
                value={draft.endDate}
                onChange={(endDate) => set({ endDate })}
              />
            </Field>
          </div>
          {validation.dateError && (
            <p
              role="alert"
              className="muted"
              style={{ marginTop: 0, color: "var(--red, #93392a)" }}
            >
              {validation.dateError}
            </p>
          )}
          {overlapError && (
            <p
              role="alert"
              className="muted"
              style={{ marginTop: 0, color: "var(--red, #93392a)" }}
            >
              {overlapError}
            </p>
          )}
        </>
      )}

      {draft.recurrence === "always" && overlapError && (
        <p
          role="alert"
          className="muted"
          style={{ marginTop: 0, color: "var(--red, #93392a)" }}
        >
          {overlapError}
        </p>
      )}

      {draft.recurrence !== "always" && (
        <Field
          label="Saison"
          hint="Facultatif · colore la période dans le calendrier."
        >
          <div role="group" aria-label="Type de période">
            <ChipSet>
              {typeSelectOptions
                .filter((option) => option.v)
                .map((option) => (
                  <Chip
                    key={option.v}
                    label={option.l}
                    on={draft.seasonTypeCode === option.v}
                    onClick={() =>
                      selectType(
                        draft.seasonTypeCode === option.v ? "" : option.v,
                      )
                    }
                  />
                ))}
            </ChipSet>
          </div>
        </Field>
      )}
      <Disclosure
        title="Donner un nom à la période"
        defaultOpen={Boolean(draft.label)}
      >
        <Field label="Nom de la période (optionnel)">
          <Input
            aria-label="Nom de la période"
            value={draft.label}
            placeholder="ex. Vacances de juillet"
            onChange={(label) => set({ label })}
          />
        </Field>
      </Disclosure>

      <div className="opening-schedules">
        {schedules.map((view) => (
          <section
            className="opening-schedule-card"
            key={view.source.id ?? view.index}
            aria-labelledby={`${schedulesId}-${view.index}`}
          >
            <h3 id={`${schedulesId}-${view.index}`}>{view.title}</h3>
            <fieldset
              disabled={Boolean(legacyBlocked)}
              className="opening-schedule-fields"
            >
              <Field label="Type de planning">
                <Select
                  aria-label="Type de planning"
                  value={view.source.schedule_type_code ?? "regular"}
                  options={[
                    ...OFFICE_SCHEDULE_TYPES,
                    ...(!OFFICE_SCHEDULE_TYPES.some(
                      (option) => option.v === view.source.schedule_type_code,
                    ) && view.source.schedule_type_code
                      ? [
                          {
                            v: view.source.schedule_type_code,
                            l: `Ouverture · ${({ seasonal: "Saisonnier", exceptional: "Exceptionnel", by_appointment: "Sur rendez-vous", continuous_service: "Service continu" } as Record<string, string>)[view.source.schedule_type_code] ?? view.source.schedule_type_code}`,
                          },
                        ]
                      : []),
                  ]}
                  onChange={(type) =>
                    setDraft((current) =>
                      patchOfficeOpeningSchedule(current, view.index, {
                        schedule_type_code: type,
                      }),
                    )
                  }
                />
              </Field>
              <Field label="Nom du planning">
                <Input
                  aria-label="Nom du planning"
                  value={view.source.name ?? ""}
                  onChange={(name) =>
                    setDraft((current) =>
                      patchOfficeOpeningSchedule(current, view.index, { name }),
                    )
                  }
                />
              </Field>
            </fieldset>
            <Field
              label="Horaires hebdomadaires"
              hint="Cliquez un jour pour l’ouvrir, puis saisissez les plages. Laissez les heures vides = ouvert sans horaire précis."
            >
              <fieldset
                disabled={Boolean(view.reason)}
                className="opening-schedule-grid"
              >
                <ScheduleEditor
                  presetsBeforeGrid
                  rows={scheduleRowsFromPeriod(view.period)}
                  colA="Plage 1"
                  colB="Plage 2"
                  onChange={(rows) =>
                    setDraft((current) =>
                      patchOfficeOpeningRows(current, view.index, rows),
                    )
                  }
                />
              </fieldset>
            </Field>
            {openingPeriodNotes(view.period).map(({ days, note }) => (
              <p key={note} className="muted opening-schedule-note">
                {days} — {note}
              </p>
            ))}
            {view.reason ? (
              <p role="status" className="muted opening-schedule-note">
                {view.reason}
              </p>
            ) : null}
            {schedules.length > 1 ? (
              <button
                type="button"
                className="ghost-button"
                onClick={() =>
                  setDraft((current) =>
                    removeOfficeOpeningSchedule(current, view.index),
                  )
                }
              >
                Retirer ce planning
                <span className="sr-only"> : {view.title}</span>
              </button>
            ) : null}
          </section>
        ))}
        <button
          type="button"
          className="ghost-button"
          disabled={Boolean(legacyBlocked)}
          onClick={() => setDraft(addOfficeOpeningSchedule)}
        >
          Ajouter un planning
        </button>
      </div>
      {nameError ? (
        <p role="alert" className="muted">
          {nameError}
        </p>
      ) : null}
      {validation.timeError && (
        <p role="alert" className="muted" style={{ color: "var(--red)" }}>
          {validation.timeError}
        </p>
      )}
    </EditorModal>
  );
}
