# Enums & the object-model rule

## `public.crm_consent_channel`
- values: `email`, `phone`, `sms`, `whatsapp`, `postal`

## `public.crm_direction`
- values: `inbound`, `outbound`, `internal`

## `public.crm_interaction_type`
- values: `call`, `email`, `meeting`, `visit`, `whatsapp`, `sms`, `note`, `other`

## `public.crm_status`
- values: `planned`, `done`, `canceled`

## `public.crm_task_priority`
- values: `low`, `medium`, `high`, `urgent`

## `public.crm_task_status`
- values: `todo`, `in_progress`, `done`, `canceled`, `blocked`

## `public.legal_validity_mode`
- values: `forever`, `tacit_renewal`, `fixed_end_date`

## `public.object_status`
- values: `draft`, `published`, `archived`, `hidden`

## `public.object_type`
- values: `RES`, `PCU`, `PNA`, `ORG`, `ITI`, `VIL`, `HPA`, `ASC`, `COM`, `HOT`, `HLO`, `LOI`, `FMA`, `CAMP`, `PSV`, `RVA`, `ACT`

## Type → facet applicability (`ref_facet_applicability`)

- `ACT` → `public.object_act`
- `ASC` → `public.object_act`
- `CAMP` → `public.object_meeting_room`, `public.object_room_type`
- `FMA` → `public.object_fma`, `public.object_fma_occurrence`
- `HLO` → `public.object_meeting_room`, `public.object_room_type`
- `HOT` → `public.object_meeting_room`, `public.object_room_type`
- `HPA` → `public.object_meeting_room`, `public.object_room_type`
- `ITI` → `public.object_iti`, `public.object_iti_associated_object`, `public.object_iti_info`, `public.object_iti_practice`, `public.object_iti_profile`, `public.object_iti_section`, `public.object_iti_stage`
- `RES` → `public.object_menu`
- `RVA` → `public.object_meeting_room`, `public.object_room_type`