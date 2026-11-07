# Accessibility V6 Research

Status: Step 1 discovery only. No SQL was written or applied, and no live Supabase MCP tooling was used.

Date: 2026-06-04

## Scope

This note researches the French accessibility label context needed before designing Accessibility V6 seeds. The user prompt says "4 filieres"; the current official Tourisme & Handicap wording uses "quatre familles de handicap" for the four disability dimensions, while the Atout France guide also uses "filieres" for activity-specific evaluation referentials. This document maps the four disability dimensions to repo concepts and leaves activity-filiere modelling out of scope for V6 unless explicitly added later.

## Web Sources

| Source | URL | Use in V6 research |
|---|---|---|
| Atout France - procedure de labellisation Tourisme & Handicap | https://www.atout-france.fr/fr/tourisme-et-handicap/procedure-de-labellisation | Current operational page. It states eligible sectors, the three broad criteria areas, 5-year validity, and the condition that at least two of the four disability families must satisfy the referential. |
| Atout France - Guide methodologique Tourisme & Handicap, March 2026 PDF | https://www.atout-france.fr/sites/default/files/2026-03/Guide%20m%C3%A9thodologique%20-%20Tourisme%20%26%20Handicap.pdf | Current guide. It confirms evaluation flow, activity/referential selection, the four disability families, mandatory criteria, 75% comfort-use threshold, and that evaluated services must cover the establishment's relevant prestations. |
| Legifrance - Arrete du 18 avril 2024 relatif aux conditions d'attribution et de retrait du label "Tourisme & Handicap" | https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000049446167 | Legal basis. It creates the State label, names Atout France as operational manager, defines eligible tourism sectors, and frames criteria around accessibility of infrastructure/prestations, reception/information, and safety. |
| Service-Public - search tool for Tourisme & Handicap establishments | https://www.service-public.gouv.fr/particuliers/vosdroits/R51552 | Government public-facing wording for the label: establishments are accessible for auditif, mental, moteur, and visuel disabilities. |
| DGE - Reforme des marques nationales du tourisme | https://www.entreprises.gouv.fr/espace-presse/reforme-des-marques-nationales-du-tourisme | Reform context: Tourisme & Handicap and quality labels became State labels in 2024; Atout France took operational management; T&H evaluation covers auditive, mentale, motrice, and visuelle deficiencies. |
| DGE - Destination pour tous | https://www.entreprises.gouv.fr/priorites-et-actions/proximite-et-territoires/renforcer-le-secteur-du-tourisme/destination-pour-tous | Relevant adjacent French accessibility label. It is territory/destination-level, not establishment-level, and covers universal accessibility across all disability and autonomy situations. |
| Acceslibre API docs | https://acceslibre.beta.gouv.fr/api/docs/ | Not a label. Useful adjacent public data source for ERP accessibility information and future import/editor thinking. |
| Acceslibre privacy/finality page | https://acceslibre.beta.gouv.fr/politique-confidentialite | Confirms Acceslibre's purpose: collect, consult, and expose ERP accessibility data so users can know whether they can access an establishment. |
| DGE historic Tourisme & Handicap cahier des charges for tourist sites | https://www.entreprises.gouv.fr/files/files/directions_services/marques-nationales-tourisme/documents%20TH/Cahiers_des_charges/TH_CC_Gestionnaires-sites-touristiques.pdf | Older official DGE referential material. Useful only as concept support for concrete aids such as LSF/subtitles, FALC, adapted plans, and sensory mediation. Current design should prefer the 2024 legal order and 2026 Atout France guide for authority. |

## Official Label Takeaways

Tourisme & Handicap is now a French State label for tourism accessibility. Current official sources keep four disability families: auditif, mental, moteur, and visuel. DGE reform wording also uses auditive, mentale, motrice, and visuelle.

The label is establishment/prestation oriented. Eligible tourism actors include hebergement, restauration, loisirs, lieux de visite, and information touristique.

The current criteria model is not a simple yes/no feature list. To be labelled, an establishment must meet regulatory requirements and, for each requested disability family, satisfy all mandatory referential criteria plus a minimum comfort-use score. Current Atout France guidance states the label is obtained for at least two of the four families.

The official criteria areas are broad: accessibility of infrastructures and tourism prestations, reception and customer information, and safety. V6 should therefore model both physical amenities and service/information actions.

## Adjacent French Accessibility Labels/Data

| Name | Type | V6 relevance | Recommended treatment |
|---|---|---|---|
| Tourisme & Handicap | State label, establishment/prestation-level | Primary Accessibility V6 target. The four disability families can be represented as label subvalues and amenity/action coverage dimensions. | Keep as `LBL_TOURISME_HANDICAP`; enrich with disability subvalues and equivalent action coverage only after review. |
| Destination pour tous | State label, territory/destination-level | Relevant for accessible destination discovery, but not equivalent to an individual establishment certification. | Do not fold into T&H. Consider future `LBL_DESTINATION_POUR_TOUS` only for destination/territory object types if product scope needs it. |
| Acceslibre | Public accessibility data platform/API, not a label | Useful source of ERP accessibility facts and concepts. It can complement amenities but does not certify a tourism label. | Use only as a future data/reference source, not as a classification label equivalence. |
| Destination d'excellence | State quality/eco-responsibility label | Adjacent to T&H in Atout France workflows and existing repo sustainability labels, but not an accessibility label. | Keep under sustainability/quality labels; do not use as Accessibility V6 evidence. |

## Disability Family Mapping

The 43 `acc_*` codes and their `disability_types` already exist in `seeds_data.sql:3774-3905`; this table documents intent and family semantics, not a creation list.

| Canonical code | Official FR name for T&H | Establishment actions implied by official criteria | Amenity/action concepts for the repo |
|---|---|---|---|
| `motor` | Handicap moteur / deficience motrice | Provide accessible arrival and circulation; remove steps/ressauts; ensure pathway width and turning space; provide accessible parking, lowered reception, lift access, adapted room/sanitary/shower equipment; account for evacuation/support needs. | `acc_pmr_parking`, `acc_pmr_signage`, `acc_step_removal`, `acc_width_120cm`, `acc_lowered_counter`, `acc_accessible_lift`, `acc_room_clearance`, `acc_adapted_bed_height`, `acc_turning_space`, `acc_grab_bars`, `acc_adapted_toilet_height`, `acc_walk_in_shower`, `acc_shower_seat`, `acc_grab_bar_shower`, `acc_readable_height`, `acc_flexible_visit`, `acc_guide_dog_welcome` where assistance dogs or mobility support are relevant. |
| `hearing` | Handicap auditif / deficience auditive | Provide alternatives to spoken/audio information; make hearing-assistance devices visible and usable; subtitle films/media; support written communication or LSF/video LSF for guided visits; provide visual/vibrating safety alerts where relevant. | `acc_magnetic_loop`, `acc_hearing_signage`, `acc_subtitles`, `acc_visual_audio_announce`, `acc_flash_alarms`, `acc_vibrating_alarms`, `acc_visit_device`, `acc_sign_language`, `acc_written_communication`. |
| `visual` | Handicap visuel / deficience visuelle | Improve contrast and lighting; remove or signal obstacles; provide tactile/braille/relief information where relevant; provide large-print, braille, audio, or audio-description content; allow guide dogs; make lift/signage controls readable by touch or sound. | `acc_large_print_docs`, `acc_braille_or_audio_docs`, `acc_braille_signage`, `acc_tactile_guidance`, `acc_contrast_signage`, `acc_contrast_menu`, `acc_large_print_menu`, `acc_braille_buttons`, `acc_audio_description`, `acc_visual_audio_announce`, `acc_visit_device`, `acc_readable_height`, `acc_guide_dog_welcome`. |
| `cognitive` | Handicap mental / deficience mentale; adjacent public policy wording also mentions cognitif/psychique | Simplify orientation and documents; use pictograms and easy-read/FALC supports; provide adapted plans and visits; train staff for clear reception; reduce sensory overload where useful; offer flexible visit pace. | `acc_falc_docs`, `acc_simplified_menu`, `acc_pictograms_used`, `acc_quiet_space`, `acc_sensory_room`, `acc_staff_cognitive_training`, `acc_staff_mental_training`, `acc_low_stimulation`, `acc_flexible_visit`. |

The repo's `cognitive` value is a single internal bucket for the official T&H "mental" family and adjacent cognitive/psychic support concepts; it should not be split during V6 seed design.

## Criteria-to-Seed Implications

V6 should not treat `LBL_TOURISME_HANDICAP:granted` as a single undifferentiated badge when official data can identify covered disability families. The existing canonical disability codes `motor`, `hearing`, `visual`, and `cognitive` are a reasonable internal vocabulary, with `cognitive` mapping to the T&H "mental" family.

The official criteria mix physical infrastructure, customer information, reception/service, and safety. A complete seed design should therefore keep both evidence paths: official label subvalues for certified coverage and accessibility amenities/actions for observable establishment practices.

Important implementation reality for design scope: the API can read and filter certified T&H family subvalues, but the current editor save path does not persist `object_classification.subvalue_ids`. Seeds can define and document subvalues, but cannot by themselves make the certified-label per-family filter end-to-end writable. **Update 2026-06-04:** the `subvalue_ids` save path was since wired (`lot1_mapping_decisions.md` §30); the end-to-end blocker was then the label `status` vocabulary mismatch (editor writes `active`, backend reads require `granted` — live: 230/230 rows are `granted`). **Both fixed 2026-06-04 (`lot1_mapping_decisions.md` §30 + §31): the editor now writes canonical `granted`; accessibility V6 is functional end-to-end. Frontend-only, no seed change.**

Destination pour tous is relevant but should stay separate because it certifies a destination-level universal accessibility policy, not a single establishment's Tourisme & Handicap family coverage.
