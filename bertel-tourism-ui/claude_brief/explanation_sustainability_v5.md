# Explanation - Sustainability V5

## Goal
This V5 adaptation aligns the sustainability catalog to the real `schema_unified.sql` model.

## Why V5 was needed
The unified schema already contains:
- `ref_sustainability_action_category`
- `ref_sustainability_action`
- `object_sustainability_action`
- `object_classification`
- `object_sustainability_action_label`
- `ref_classification_scheme`
- `ref_classification_value`

Two corrections were therefore necessary:
1. add a real intermediate group table instead of simulating it in flat seeds
2. seed classification **values** as well as classification **schemes**, because `object_classification` requires both `scheme_id` and `value_id`

## Target model after V5
### Sustainability catalog
- `ref_sustainability_action_category` = theme
- `ref_sustainability_action_group` = macro-group
- `ref_sustainability_action` = concrete micro-action

### Object-side implementation
- `object_sustainability_action` = action really declared by the establishment
- `object_classification` = official label really held by the establishment
- `object_sustainability_action_label` = explicit proof that a concrete declared action supports a granted label

### Search expansion
Two reference-level lookup tables are added:
- `ref_classification_equivalent_group`
- `ref_classification_equivalent_action`

These tables do **not** say that an establishment has the label.
They only allow the search engine to say:
"this establishment carries actions equivalent to the spirit of this label".

## What is seeded in `seeds_sustainability_v5.sql`
- all non-accessibility categories
- all non-accessibility groups
- all non-accessibility micro-actions
- all non-accessibility label schemes
- one singleton value per label scheme, code `granted`
- label-to-group mappings
- label-to-action mappings

## Why singleton values are seeded
`object_classification` cannot work with a scheme alone.
A row also needs a `value_id`, and the schema enforces that the value belongs to the scheme.
For label-style classifications, V5 seeds one default selectable value per scheme.

## Why CAT_ACCESS is excluded here
Accessibility is not modeled as a sustainability checklist in the real schema.
It must be handled separately.
