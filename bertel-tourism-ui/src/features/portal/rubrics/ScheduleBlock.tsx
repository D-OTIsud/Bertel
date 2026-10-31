"use client";
import { Plus, Trash2 } from "lucide-react";
import { PortalChoice } from "./rubric-kit";
import {
  MAX_EDITABLE_SLOTS_PER_DAY,
  PORTAL_DAY_READONLY_REASON,
  type WeekDayHours,
  type WeekHours,
} from "../portal-bindings";
import { OPENING_WEEKDAYS } from "../../object-editor/sections/opening-period-edit";
import type { ObjectWorkspaceOpeningSlot } from "../../../services/object-workspace-parser";
export interface ScheduleForm {
  hours: WeekHours;
  individual: boolean;
  error: { message: string; fieldId: string } | null;
}
const emptySlot = (): ObjectWorkspaceOpeningSlot => ({ start: "", end: "" });
const SHORTCUTS = [
  { label: "Tous les jours", codes: OPENING_WEEKDAYS.map((day) => day.code) },
  {
    label: "Du lundi au vendredi",
    codes: ["monday", "tuesday", "wednesday", "thursday", "friday"],
  },
  {
    label: "Du mardi au samedi",
    codes: ["tuesday", "wednesday", "thursday", "friday", "saturday"],
  },
  { label: "Le week-end", codes: ["saturday", "sunday"] },
];

function dayLabel(codes: string[]): string {
  const days = OPENING_WEEKDAYS.filter((day) => codes.includes(day.code));
  if (days.length === 7) return "Tous les jours";
  if (days.length === 1) return days[0].label;
  const indexes = days.map((day) =>
    OPENING_WEEKDAYS.findIndex((entry) => entry.code === day.code),
  );
  const consecutive = indexes.every(
    (value, index) => index === 0 || value === indexes[index - 1] + 1,
  );
  return consecutive
    ? "Du " +
        days[0].label.toLowerCase() +
        " au " +
        days[days.length - 1].label.toLowerCase()
    : days.map((day) => day.label).join(", ");
}

function groupsOf(form: ScheduleForm): string[][] {
  const groups = new Map<string, string[]>();
  for (const { code } of OPENING_WEEKDAYS) {
    const entry = form.hours[code];
    if (!entry?.open) continue;
    const key =
      form.individual || entry.readOnly
        ? code
        : JSON.stringify([entry.fixedHours, entry.slots]);
    groups.set(key, [...(groups.get(key) ?? []), code]);
  }
  return [...groups.values()];
}

export function validateSchedule(
  form: ScheduleForm,
  idPrefix = "portal-hours",
): ScheduleForm["error"] {
  for (const codes of groupsOf(form)) {
    const entry = form.hours[codes[0]];
    if (entry.readOnly || !entry.fixedHours) continue;
    let complete = false;
    for (const [index, slot] of entry.slots.entries()) {
      const field = idPrefix + "-" + codes[0] + "-" + index;
      if (slot.start && !slot.end)
        return {
          message: "Indiquez aussi l’heure de fermeture.",
          fieldId: field + "-end",
        };
      if (!slot.start && slot.end)
        return {
          message: "Indiquez aussi l’heure d’ouverture.",
          fieldId: field + "-start",
        };
      if (slot.start && slot.end) {
        complete = true;
        if (slot.end <= slot.start)
          return {
            message: "Indiquez une heure de fin après l’heure de début.",
            fieldId: field + "-end",
          };
        if (
          entry.slots.some(
            (other, otherIndex) =>
              otherIndex < index &&
              other.start &&
              other.end &&
              other.start < slot.end &&
              slot.start < other.end,
          )
        ) {
          return {
            message: "Les deux créneaux ne doivent pas se chevaucher.",
            fieldId: field + "-start",
          };
        }
      }
    }
    if (!complete)
      return {
        message:
          "Indiquez un créneau ou cochez « Ouvert, sans horaires fixes ».",
        fieldId: idPrefix + "-" + codes[0] + "-0-start",
      };
  }
  return null;
}

export function ScheduleBlock({
  value: form,
  onChange: setForm,
  idPrefix = "portal-hours",
  label = "Horaires",
  daysQuestion = "Quels jours êtes-vous ouvert ?",
}: {
  value: ScheduleForm;
  onChange: (update: (previous: ScheduleForm) => ScheduleForm) => void;
  idPrefix?: string;
  label?: string;
  daysQuestion?: string;
}) {
  function chooseDays(codes: string[]) {
    setForm((previous) => {
      const template: WeekDayHours = Object.values(previous.hours).find(
        (entry) => entry.open && !entry.readOnly,
      ) ?? { open: true, fixedHours: true, slots: [emptySlot()] };
      const hours = { ...previous.hours };
      for (const { code } of OPENING_WEEKDAYS) {
        const current = hours[code];
        // Le writer protège également ces jours : le raccourci ne promet pas de les fermer.
        if (current?.readOnly) continue;
        const open = codes.includes(code);
        const restored = current?.slots.length ? current : template;
        hours[code] = {
          ...(open && !current?.open ? restored : current),
          open,
        };
      }
      return { ...previous, hours, error: null };
    });
  }

  function update(codes: string[], patch: Partial<WeekDayHours>) {
    setForm((previous) => ({
      ...previous,
      error: null,
      hours: Object.fromEntries(
        Object.entries(previous.hours).map(([code, entry]) => [
          code,
          codes.includes(code) && !entry.readOnly
            ? { ...entry, ...patch }
            : entry,
        ]),
      ),
    }));
  }

  const groups = groupsOf(form);
  const closed = OPENING_WEEKDAYS.filter(({ code }) => !form.hours[code]?.open);

  return (
    <div className="portal-schedule-block" role="group" aria-label={label}>
      <fieldset className="portal-fieldset">
        <legend>{daysQuestion}</legend>
        <div className="portal-shortcuts">
          {SHORTCUTS.map(({ label, codes }) => (
            <button
              key={label}
              type="button"
              className="portal-pill"
              aria-pressed={OPENING_WEEKDAYS.every(
                ({ code }) =>
                  Boolean(form.hours[code]?.open) === codes.includes(code),
              )}
              onClick={() => chooseDays(codes)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="portal-days">
          {OPENING_WEEKDAYS.map(({ code, label }) => (
            <PortalChoice
              key={code}
              type="checkbox"
              checked={Boolean(form.hours[code]?.open)}
              disabled={form.hours[code]?.readOnly}
              onChange={(checked) =>
                chooseDays(
                  OPENING_WEEKDAYS.filter((day) =>
                    day.code === code ? checked : form.hours[day.code]?.open,
                  ).map((day) => day.code),
                )
              }
            >
              {label}
            </PortalChoice>
          ))}
        </div>
      </fieldset>
      <fieldset className="portal-fieldset portal-week">
        <legend>À quelles heures ?</legend>
        {groups.map((codes) => {
          const entry = form.hours[codes[0]];
          const label = dayLabel(codes);
          const slots = entry.slots.length ? entry.slots : [emptySlot()];
          return (
            <section
              className="portal-week__day"
              key={codes[0]}
              aria-label={label}
            >
              <h3 className="portal-week__name">{label}</h3>
              {entry.readOnly ? (
                <p className="notice">{PORTAL_DAY_READONLY_REASON}</p>
              ) : (
                <>
                  <PortalChoice
                    type="checkbox"
                    checked={!entry.fixedHours}
                    onChange={(checked) =>
                      update(codes, { fixedHours: !checked })
                    }
                  >
                    Ouvert, sans horaires fixes
                  </PortalChoice>
                  {entry.fixedHours ? (
                    <>
                      {slots.map((slot, index) => {
                        const prefix = idPrefix + "-" + codes[0] + "-" + index;
                        return (
                          <div className="portal-slot" key={index}>
                            <label htmlFor={prefix + "-start"}>
                              de
                              <span className="sr-only">
                                {" "}
                                quelle heure, {label}, créneau {index + 1}
                              </span>
                            </label>
                            <input
                              id={prefix + "-start"}
                              type="time"
                              className="portal-input portal-input--time"
                              value={slot.start}
                              aria-invalid={
                                form.error?.fieldId === prefix + "-start" ||
                                undefined
                              }
                              aria-describedby={
                                form.error?.fieldId === prefix + "-start"
                                  ? idPrefix + "-error"
                                  : undefined
                              }
                              onChange={(event) =>
                                update(codes, {
                                  slots: slots.map((item, position) =>
                                    position === index
                                      ? { ...item, start: event.target.value }
                                      : item,
                                  ),
                                })
                              }
                            />
                            <label htmlFor={prefix + "-end"}>
                              à
                              <span className="sr-only">
                                {" "}
                                quelle heure, {label}, créneau {index + 1}
                              </span>
                            </label>
                            <input
                              id={prefix + "-end"}
                              type="time"
                              className="portal-input portal-input--time"
                              value={slot.end}
                              aria-invalid={
                                form.error?.fieldId === prefix + "-end" ||
                                undefined
                              }
                              aria-describedby={
                                form.error?.fieldId === prefix + "-end"
                                  ? idPrefix + "-error"
                                  : undefined
                              }
                              onChange={(event) =>
                                update(codes, {
                                  slots: slots.map((item, position) =>
                                    position === index
                                      ? { ...item, end: event.target.value }
                                      : item,
                                  ),
                                })
                              }
                            />
                            {slots.length > 1 ? (
                              <button
                                type="button"
                                className="ghost-button portal-slot__remove"
                                aria-label={
                                  "Retirer le créneau " +
                                  (index + 1) +
                                  " (" +
                                  label +
                                  ")"
                                }
                                onClick={() =>
                                  update(codes, {
                                    slots: slots.filter(
                                      (_, position) => position !== index,
                                    ),
                                  })
                                }
                              >
                                <Trash2 size={18} aria-hidden />
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                      {slots.length < MAX_EDITABLE_SLOTS_PER_DAY ? (
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() =>
                            update(codes, { slots: [...slots, emptySlot()] })
                          }
                        >
                          <Plus size={18} aria-hidden /> Ajouter un créneau
                        </button>
                      ) : null}
                    </>
                  ) : null}
                </>
              )}
            </section>
          );
        })}
        {groups.length > 0 && !form.individual ? (
          <button
            type="button"
            className="ghost-button"
            onClick={() =>
              setForm((previous) => ({ ...previous, individual: true }))
            }
          >
            Horaires différents selon les jours ?
          </button>
        ) : null}
        {closed.length > 0 ? (
          <p className="muted">
            Fermé : {closed.map((day) => day.label.toLowerCase()).join(", ")}.
          </p>
        ) : null}
      </fieldset>
      {form.error ? (
        <p className="field-error" id={`${idPrefix}-error`} role="alert">
          {form.error.message}
        </p>
      ) : null}
    </div>
  );
}
