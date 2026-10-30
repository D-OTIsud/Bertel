
export type ObjectWorkspaceOpeningBucket = 'current' | 'next-year' | 'undated';

export interface ObjectWorkspaceOpeningSlot {
  start: string;
  end: string;
}

export interface ObjectWorkspaceOpeningWeekday {
  code: string;
  label: string;
  slots: ObjectWorkspaceOpeningSlot[];
}

/** Fields accepted by save_object_openings, kept alongside the weekly editing projection. */
export interface ObjectWorkspaceOpeningTimeFrame {
  id: string | null;
  start_time: string | null;
  end_time: string | null;
  recurrence: string | null;
}

export interface ObjectWorkspaceOpeningTimePeriod {
  id: string | null;
  closed: boolean;
  note: string | null;
  weekdays: { weekday_code: string }[];
  time_frames: ObjectWorkspaceOpeningTimeFrame[];
}

export interface ObjectWorkspaceOpeningSchedule {
  id: string | null;
  schedule_type_id: string | null;
  schedule_type_code: string | null;
  name: string | null;
  note: string | null;
  name_i18n: Record<string, unknown> | null;
  note_i18n: Record<string, unknown> | null;
  extra: Record<string, unknown>;
  time_periods: ObjectWorkspaceOpeningTimePeriod[];
}

export interface ObjectWorkspaceOpeningPeriod {
  recordId: string | null;
  order: string;
  bucket: ObjectWorkspaceOpeningBucket;
  label: string;
  /** Explicit period-type code (ref_code_opening_period_type, e.g. high_season). '' = legacy/untyped. */
  seasonTypeCode: string;
  startDate: string;
  endDate: string;
  allYears: boolean;
  /** Mode de récurrence dérivé/explicite (source de vérité de l'UI). */
  recurrence: 'always' | 'cyclic' | 'fixed';
  /** Couche fermeture (prioritaire, surcharge les périodes ouvertes). */
  isClosure: boolean;
  closedDays: string[];
  weekdays: ObjectWorkspaceOpeningWeekday[];
  sourcePeriodId?: string | null;
  periodTypeId?: string | null;
  originalSeasonTypeCode?: string;
  originalRecurrence?: ObjectWorkspaceOpeningPeriod['recurrence'];
  originalAllYears?: boolean;
  nameI18n?: Record<string, unknown> | null;
  extra?: Record<string, unknown>;
  /** Full writer-compatible tree, including closed days and otherwise hidden notes. */
  schedules?: ObjectWorkspaceOpeningSchedule[];
  /** Notes belong to time periods; a simple weekly projection keeps their origin per day. */
  weekdayNotes?: Record<string, string | null>;
  /** Only this period is read-only when its full tree cannot be edited by one weekly grid. */
  editingUnavailableReason?: string | null;
}

/** Admin-extensible period-type option (ref_code domain `opening_period_type`). */
export interface ObjectWorkspaceOpeningPeriodTypeOption {
  code: string;
  label: string;
  /** Ribbon/stripe colour (hex), from ref_code.metadata.color. '' when unset. */
  color: string;
  /** metadata.all_year = true ⇒ "open all year, no dates" (drives the modal's date UI). */
  allYear: boolean;
}

export interface ObjectWorkspaceOpeningsModule {
  periods: ObjectWorkspaceOpeningPeriod[];
  periodTypeOptions: ObjectWorkspaceOpeningPeriodTypeOption[];
  unavailableReason: string | null;
}
