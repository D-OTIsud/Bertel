"use client";
import { Plus, Trash2 } from "lucide-react";
import { PortalChoice, PortalField } from "./rubric-kit";
import { ScheduleBlock, validateSchedule } from "./ScheduleBlock";
import { PORTAL_SERVICE_SUGGESTIONS } from "../portal-rubrics";
import {
  newPortalNamedSchedule,
  type PortalNamedSchedule,
} from "../portal-named-schedules";
import type { ArchetypeCode } from "../../object-editor/archetypes";

export function validateNamedSchedules(
  entries: PortalNamedSchedule[],
): { message: string; fieldId: string } | null {
  for (const entry of entries) {
    if (entry.readOnlyReason) continue;
    const prefix = `portal-${entry.key}`;
    if (entry.type === "service" && !entry.name.trim())
      return {
        message: "Donnez un nom au service.",
        fieldId: prefix + "-name",
      };
    if (
      !entry.source &&
      entry.type === "reception" &&
      !Object.values(entry.form.hours).some((d) => d.open)
    )
      continue;
    const error = validateSchedule(entry.form, prefix);
    if (error) return error;
    if (
      entry.type === "service" &&
      !Object.values(entry.form.hours).some((d) => d.open)
    )
      return {
        message: "Indiquez au moins un jour pour ce service.",
        fieldId: prefix + "-name",
      };
  }
  return null;
}

export function NamedSchedules({
  value,
  onChange,
  archetype,
  readOnly = false,
}: {
  value: PortalNamedSchedule[];
  onChange: (value: PortalNamedSchedule[]) => void;
  archetype: ArchetypeCode;
  readOnly?: boolean;
}) {
  const reception = value.find((s) => s.type === "reception");
  const services = value.filter((s) => s.type === "service");
  const suggestions = PORTAL_SERVICE_SUGGESTIONS[archetype];
  function add(name: string) {
    onChange([
      ...value,
      newPortalNamedSchedule("service", name, crypto.randomUUID()),
    ]);
  }
  function update(key: string, patch: Partial<PortalNamedSchedule>) {
    onChange(value.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }
  function hours(entry: PortalNamedSchedule) {
    return entry.readOnlyReason ? (
      <p className="notice">{entry.readOnlyReason}</p>
    ) : (
      <ScheduleBlock
        label={entry.name || "Service"}
        daysQuestion={entry.type==='reception'?'Quels jours y a-t-il un accueil ?':'Quels jours ce service est-il proposé ?'}
        idPrefix={`portal-${entry.key}`}
        value={entry.form}
        onChange={(change) => update(entry.key, { form: change(entry.form) })}
      />
    );
  }
  return (
    <fieldset
      className="portal-fieldset portal-named-schedules"
      disabled={readOnly}
    >
      {archetype === "HEB" ? (
        <section className="portal-named-schedule">
          <h2>L’accueil sur place</h2>
          <PortalChoice
            type="checkbox"
            checked={Boolean(reception)}
            onChange={(checked) =>
              onChange(
                checked
                  ? [
                      ...value,
                      newPortalNamedSchedule(
                        "reception",
                        "Accueil",
                        "reception-new",
                      ),
                    ]
                  : value.filter((s) => s.type !== "reception"),
              )
            }
          >
            Il y a un accueil sur place
          </PortalChoice>
          {reception ? hours(reception) : null}
        </section>
      ) : null}
      {suggestions ? (
        <section className="portal-named-services">
          <h2>
            {archetype === "HEB"
              ? "Services pour vos voyageurs"
              : "Les horaires de vos services"}
          </h2>
          <div className="portal-shortcuts">
            {suggestions
              .filter((name) => !services.some((s) => s.name === name))
              .map((name) => (
                <button
                  className="portal-pill"
                  type="button"
                  key={name}
                  onClick={() => add(name)}
                >
                  <Plus size={16} aria-hidden />
                  {name}
                </button>
              ))}
            <button
              className="ghost-button"
              type="button"
              onClick={() => add("")}
            >
              <Plus size={18} aria-hidden />
              Autre service
            </button>
          </div>
          {services.map((entry) => (
            <section
              className="portal-named-schedule"
              key={entry.key}
              aria-label={entry.name || "Nouveau service"}
            >
              <div className="portal-named-schedule__head">
                <PortalField
                  id={`portal-${entry.key}-name`}
                  label="Nom du service"
                >
                  {(props) => (
                    <input
                      {...props}
                      maxLength={120}
                      value={entry.name}
                      disabled={Boolean(entry.readOnlyReason)}
                      onChange={(event) =>
                        update(entry.key, { name: event.target.value })
                      }
                    />
                  )}
                </PortalField>
                <button
                  className="ghost-button"
                  type="button"
                  aria-label={`Retirer le service ${entry.name || "sans nom"}`}
                  onClick={() =>
                    onChange(value.filter((s) => s.key !== entry.key))
                  }
                >
                  <Trash2 size={18} aria-hidden />
                  Retirer
                </button>
              </div>
              {hours(entry)}
            </section>
          ))}
        </section>
      ) : null}
    </fieldset>
  );
}
