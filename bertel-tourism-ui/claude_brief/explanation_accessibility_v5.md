# Explanation - Accessibility V5

## Goal
This V5 adaptation separates accessibility from sustainability and maps it to the places where `schema_unified.sql` already models it natively.

## Why accessibility must not stay in the sustainability catalog
The unified schema already contains dedicated accessibility-friendly structures:
- `object_description.description_adapted`
- `object_description.description_adapted_i18n`
- `object_place_description.description_adapted`
- `object_place_description.description_adapted_i18n`
- `object_room_type.is_accessible`
- `ref_amenity`
- `object_amenity`
- `object_room_type_amenity`

That means CAT_ACCESS should not remain inside the sustainability seed stream.

## Translation rules used in V5
### 1. Official accessibility labels
`LBL_TOURISME_HANDICAP` is seeded in:
- `ref_classification_scheme`
- `ref_classification_value`

This allows real attribution later through `object_classification`.

### 2. Editorial accessibility
The following concepts are **not** seeded as global references:
- access factsheets
- Acceslibre registration
- public accessibility register
- RGAA website compliance
- narrative accessibility explanations

They belong to:
- `object_description.description_adapted`
- `object_place_description.description_adapted`

### 3. Room-level accessibility
Concepts such as accessible rooms remain object-specific and should be expressed through:
- `object_room_type.is_accessible`
- optionally room-type amenities via `object_room_type_amenity`

### 4. Physical or tangible accessibility features
Only concrete, reusable items are converted into `ref_amenity`, for example:
- magnetic loop
- accessible lift
- tactile guidance
- walk-in shower
- shower seat
- subtitles
- audio description
- PMR parking
- accessible signage

## Amenity family handling
V5 does **not** invent a new family table.
The schema already uses:
- `ref_code`
- partition `ref_code_amenity_family`
- `ref_amenity.family_id`

So the accessibility family is seeded through `ref_code` with domain `amenity_family`, then linked from `ref_amenity`.

## What is deliberately excluded from the accessibility seed
- editorial accessibility descriptions
- training-only items
- administrative compliance tasks
- booking-channel process items

Those remain either user-entered content or operational data, not generic equipment references.
