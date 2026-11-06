"use client";
import { useEffect } from "react";
import {
  PortalRubricActions,
  focusPortalField,
  useRubricForm,
  type PortalFormCache,
} from "./rubric-kit";
import { readWeekHours, setWeekHours } from "../portal-bindings";
import { OPENING_WEEKDAYS } from "../../object-editor/sections/opening-period-edit";
import type { PortalRubricFormProps } from "./types";
import type {
  ObjectWorkspaceOpeningsModule,
  ObjectWorkspaceOpeningSlot,
} from "../../../services/object-workspace-parser";
import {
  ScheduleBlock,
  validateSchedule,
  type ScheduleForm,
} from "./ScheduleBlock";
import { NamedSchedules, validateNamedSchedules } from "./NamedSchedules";
import {
  readPortalNamedSchedules,
  setPortalNamedSchedules,
  type PortalNamedSchedule,
} from "../portal-named-schedules";
import { PORTAL_SERVICE_SUGGESTIONS } from "../portal-rubrics";
interface HoursForm extends ScheduleForm {
  named?: PortalNamedSchedule[];
}
const emptySlot = (): ObjectWorkspaceOpeningSlot => ({ start: "", end: "" });
function compatibleCache(
  cache: PortalFormCache | undefined,
  openings: ObjectWorkspaceOpeningsModule,
): PortalFormCache | undefined {
  if (!cache) return undefined;
  return {
    get(key) {
      const saved = cache.get(key);
      if (!saved || typeof saved !== "object") return undefined;
      if ("hours" in saved) return saved;
      const old = saved as {
        open?: Record<string, boolean>;
        mode?: string;
        same?: ObjectWorkspaceOpeningSlot[];
        perDay?: Record<string, ObjectWorkspaceOpeningSlot[]>;
      };
      if (!old.open || !["same", "per-day", "none"].includes(old.mode ?? ""))
        return undefined;
      const hours = readWeekHours(openings).hours;
      for (const { code } of OPENING_WEEKDAYS) {
        if (hours[code].readOnly) continue;
        const slots = (old.mode === "same" ? old.same : old.perDay?.[code]) ?? [
          emptySlot(),
        ];
        hours[code] = {
          ...hours[code],
          open: Boolean(old.open[code]),
          fixedHours: old.mode !== "none",
          slots,
        };
      }
      return {
        hours,
        individual: old.mode === "per-day",
        error: null,
      } satisfies HoursForm;
    },
    set: (key, value) => cache.set(key, value),
    delete: (key) => cache.delete(key),
  };
}

export function HoursRubric({
  editor,
  archetype,
  formKey,
  onDone,
  onCancel,
  onDirtyChange,
  formCache,
}: PortalRubricFormProps) {
  const openings = editor.draft.openings;
  const { form, setForm, dirty } = useRubricForm<HoursForm>(
    formKey,
    () => ({
      hours: readWeekHours(openings).hours,
      individual: false,
      error: null,
      named: readPortalNamedSchedules(openings),
    }),
    compatibleCache(formCache, openings),
  );
  const named = form.named ?? readPortalNamedSchedules(openings);
  const hasServices = Boolean(PORTAL_SERVICE_SUGGESTIONS[archetype]);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  return (
    <form
      className="portal-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const error =
          validateSchedule(form) ||
          (hasServices ? validateNamedSchedules(named) : null);
        if (error) {
          setForm((previous) => ({ ...previous, error }));
          focusPortalField(error.fieldId);
          return;
        }
        let next = setWeekHours(openings, form.hours);
        if (hasServices) next = setPortalNamedSchedules(next, named);
        editor.replaceModule("openings", next);
        onDone();
      }}
    >
      <ScheduleBlock
        value={form}
        onChange={(change) =>
          setForm((previous) => ({ ...previous, ...change(previous) }))
        }
      />
      {hasServices ? (
        <NamedSchedules
          value={named}
          archetype={archetype}
          onChange={(named) =>
            setForm((previous) => ({ ...previous, named, error: null }))
          }
        />
      ) : null}
      <PortalRubricActions onCancel={onCancel} />
    </form>
  );
}
