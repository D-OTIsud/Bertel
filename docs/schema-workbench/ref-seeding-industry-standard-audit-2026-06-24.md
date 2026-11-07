# Reference-data Seeding — Industry-Standard Completeness Audit — 2026-06-24

**Author:** automated audit (goal: *"go over each ref table and compare the content of each seeded
data to the tourism industry standard, see if there is missing seeding and complete it"*).

**Angle.** This is **content-vs-external-standard** completeness — *does each vocabulary contain the
values the tourism sector expects?* It is **complementary to**, not a repeat of, the
[2026-06-15 integrity audit](ref-seeding-audit-2026-06-15.md) (§68), which reconciled
LIVE ↔ SOURCE ↔ DOC row counts and i18n. That audit concluded counts are "almost universally sound";
this one asks whether the *seeded set itself* matches sector references.

**Method.** LIVE ground truth pulled per vocabulary via Supabase MCP (read-only `SELECT`), then each
vocabulary mapped to its governing external standard and the gap assessed. One concrete completion was
applied (amenities — see §6); softer enrichments are listed as PO-arbitration candidates (§7) rather
than injected, consistent with how this project governs controlled vocabularies (decision log
§57 PO "oui à tout", §61 CRM vocab).

**Standards referenced**

| Standard | Governs |
|---|---|
| **EU Reg. 1169/2011 (INCO), Annex II** | the 14 mandatory food allergens |
| **CEFR** (Common European Framework) | language proficiency levels |
| **INSEE** | communes (La Réunion = 24) |
| **Atout France** classements | hôtel, camping, meublé, résidence de tourisme, village vacances, PRL, auberge collective (all 1–5★) |
| **Gîtes de France / Clévacances** | meublé equipment grid; épis (1–5) / clés (1–5) |
| **Tourisme & Handicap** | 4 familles de handicap (moteur, auditif, visuel, mental) |
| **DATAtourisme / Apidae** | French national/regional SIT POI types, amenities, themes |
| **Booking / Airbnb** amenity taxonomies | guest-facing self-catering amenity checklists |

---

## 1. Executive summary

The seeding is **broadly complete and well-aligned** with French tourism standards. The label/classement
graph in particular is comprehensive (all Atout France star schemes 1–5, Gîtes épis 1–5, Clévacances clés
1–5, Tourisme & Handicap 4 familles, the green-label family, regional Qualité Tourisme Réunion). The
hard-standard vocabularies are **exactly at standard** (allergen 14/14, CEFR 7/7, communes 24/24, T&H 4/4).

**One concrete content gap was found and fixed:** the `ref_amenity` catalogue declared **21 amenity
families but only 16 carried any value** — and standard **self-catering equipment** (lave-linge,
lave-vaisselle, four, sèche-linge, congélateur, bouilloire, grille-pain…) was **absent from the entire
136-amenity set**. This is material: per decision §64, **485/497 lodgings are whole-unit rentals**, for
which appliance equipment is a core Gîtes de France / Clévacances classification criterion and the first
filter guests use. **25 amenities were added** across the 4 empty families + `kitchen`; live 136 → 161,
20/21 families now populated (`sustainable` intentionally left empty — §6.3).

Everything else is either at-standard or a **soft enrichment deferred to PO** (§7): controlled vocabularies
(languages offered, trail practices, social networks, menu sub-categories) are editorial/business choices,
not objective gaps, and this project routes such decisions through PO arbitration.

---

## 2. Hard-standard vocabularies — verified COMPLETE (no action)

| Vocabulary | Live | Standard | Verdict |
|---|---|---|---|
| `allergen` | 14 | EU INCO 14 (gluten, crustaceans, eggs, fish, peanuts, soy, milk, nuts, celery, mustard, sesame, sulphites, lupin, molluscs) | ✅ **14/14 exact** |
| `language_level` | 7 | CEFR A1·A2·B1·B2·C1·C2 + native | ✅ **7/7 exact** |
| `ref_commune` | 24 | INSEE — La Réunion has 24 communes (97401–97424) | ✅ **24/24 exact** |
| `weekday` + `dow_number` | 7 | ISO-8601 (Mon=1…Sun=7) | ✅ correct (the §68 NULL `dow_number` HIGH is now fixed) |
| `LBL_TOURISME_HANDICAP` values | 5 | T&H = `granted` + 4 familles (motor, hearing, visual, cognitive) | ✅ **4 familles exact** |
| Atout France star schemes | 1–5 each | hôtel, camping, meublé, résidence tourisme, village vacances, PRL, auberge collective | ✅ all **1–5** |
| `gites_epics` / `clevacances_keys` | 5 / 5 | Gîtes 1–5 épis · Clévacances 1–5 clés | ✅ exact |
| `monument_historique` | 2 | `classe` · `inscrit` (the two official MH statuses) | ✅ exact |

---

## 3. Labels & classements (`ref_classification_scheme` = 36 / `ref_classification_value` = 124)

Coverage is **strong**. Present: all 7 Atout France classements (1–5★); Gîtes de France (épis), Clévacances
(clés), Logis (cheminées + cocottes), Bienvenue à la Ferme, Accueil Paysan, Accueil Vélo, Centre de Tourisme
Équestre, Esprit Parc National, Jardin Remarquable, Monument Historique, Musée de France, Maison des Illustres,
Maîtres Restaurateurs, Tables & Auberges; green labels (Clef Verte, Écolabel UE, Pavillon Bleu, ATR, Flocon
Vert, Green Destinations, Label bas-carbone, Destination d'excellence); Qualité Tourisme + **regional Qualité
Tourisme Île de La Réunion**.

**One value-range item to verify with PO (not changed):**
- `logis` carries `cheminee_1..3` + `cocotte_1..3`. Web check confirms the **classic Logis de France 1–3
  cheminées / 1–3 cocottes** system (which the seed matches). Logis has since introduced a "nouveau
  classement"; if OTI Sud follows the **current Logis Hôtels 1–5** scale, add `cheminee_4/5` + `cocotte_4/5`.
  Deferred — the current range is ambiguous in public sources and the seeded 1–3 is internally consistent.
  → **§7 candidate L1.**

No missing scheme of consequence. Note chambres d'hôtes correctly have **no** star scheme (none exists in
France; they carry Gîtes épis / Clévacances clés / Fleurs de Soleil instead).

---

## 4. `ref_legal_type` is NOT "forme juridique" (no action — correct as designed)

`ref_legal_type` (17 rows) catalogues **legal documents / attributes** (licences, assurances, SIREN/SIRET,
TVA, taxe de séjour, permis environnemental…), *not* company legal forms (SARL/SAS/EI…). This matches
decision-log note "forme/NAF not surfaced = no legal_type". **No SIRENE forme-juridique seeding is owed here.**

---

## 5. Per-domain verdict matrix (every `ref_code` domain + standalone `ref_*`)

Legend: ✅ at standard · ➕ enriched this pass · 🔶 soft enrichment candidate (→ §7) · ⚙️ internal/system
vocabulary (no external standard; sized to product) · 🅿️ PO-governed taxonomy (per object type).

| Vocabulary | Live | Verdict |
|---|---|---|
| allergen | 14 | ✅ INCO 14/14 |
| cuisine_type | 43 | ✅ rich incl. créole / sino-réunionnaise / malgache / mauricienne / seychelloise (note: FR/EN code-language mix, cosmetic) |
| dietary_tag | 12 | ✅ / 🔶 (could add `dairy_free`, `nut_free`, `keto`) |
| menu_category | 10 | ✅ / 🔶 (`plat_du_jour`, `formule_midi`, `aperitif`, `fromage`, `accompagnement`) |
| accommodation_type | 10 | ✅ (legacy descriptor; object typing now via `object_type` + `taxonomy_*`) |
| room_type / bed_type | 10 / 10 | ✅ |
| view_type | 13 | ✅ / 🔶 (Réunion-specific `volcano`, `lagoon`, `valley`, `panoramic`, `waterfall`) |
| meeting_equipment | 11 | ✅ MICE-adequate |
| season_type | 10 | ✅ (incl. Réunion `cyclone_season`, `lychee_season`, `sugar_cane_harvest`) |
| iti_difficulty | 5 | ✅ (1–5 ≈ FFRandonnée très facile→très difficile) |
| iti_practice | 16 | ✅ / 🔶 (`marche_nordique`, `stand_up_paddle`, `speleologie` [tunnels de lave], `via_ferrata`) |
| iti_stage_kind | 8 | ✅ |
| payment_method | 15 | ✅ incl. FR specifics (cheque_vacances, vacaf, tickets_restaurant, carte_bleue) |
| social_network | 11 | ✅ / 🔶 (`snapchat`, `whatsapp` display, `vimeo`) |
| environment_tag | 30 | ✅ rich (volcan, lagon, cirque-adjacent terms) |
| contact_kind | 15 | ✅ |
| media_type / media_tag | 11 / 23 | ✅ (media_tag en/es gap noted in §68) |
| ref_amenity | 161 | ➕ **+25 this pass** (was 136; see §6) |
| amenity_family | 21 | ✅ vocab complete; 20/21 now populated (`sustainable` empty by design) |
| ref_language | 20 | ✅ / 🔶 (add `ru`; review placeholder-looking `haw`/`zu`/`ty`) |
| ref_classification_scheme / _value | 36 / 124 | ✅ (one verify item — Logis range, §7 L1) |
| ref_legal_type | 17 | ✅ (legal documents, not company forms — §4) |
| ref_object_relation_type | 10 | ✅ |
| ref_review_source | 7 | ✅ (google, tripadvisor, booking, airbnb, expedia, hotels_com, internal) |
| ref_capacity_metric | 12 | ✅ |
| ref_iti_assoc_role | 8 | ✅ (the §68 "0 rows" HIGH is now seeded) |
| ref_actor_role / contact_role / org_role(s) / permission | 5/6/3/11 | ⚙️ app-domain (sized to product) |
| ref_sustainability_action(_category/_group) | 239 / 9 / 76 | ✅ V5 vocabulary (deliberate §-V5 effort) |
| booking_status, feedback_type, insurance_type, package_type, partnership_type, client_type, destination_type, tourism_type, transport_type, service_type, assistance_type, mood, promotion_type, price_kind/type/unit, opening_*, distribution_channel, membership_*, document_type, crm_sentiment, demand_topic | various | ⚙️ internal/system vocabularies — no external tourism standard; several are "seeded-ahead, no consumer wired" (PO triage tracked in §68, not re-opened here) |
| taxonomy_act/asc/camp/com/fma/hlo/hot/hpa/iti/loi/org/pcu/pna/prd/psv/res/rva/spu/vil | per type | 🅿️ per-object-type taxonomies, PO-governed (§57); 1:1 with the `object_type` enum (verified §68) |

---

## 6. IMPLEMENTED — `ref_amenity` self-catering & family/comfort/business completion

### 6.1 The gap
`amenity_family` declared **21** families; only **16** held any `ref_amenity` row. The 5 empty families were
`business`, `comforts`, `equipment`, `family`, `sustainable`. Worse, across the **whole** 136-amenity set the
standard **self-catering appliances were entirely absent** — no washing machine, dishwasher, oven, dryer,
freezer, kettle, toaster. The Gîtes de France classement grid *requires* these from the 1–3 épis levels
upward; they are the headline amenities on every OTA. With 485/497 lodgings being whole-unit rentals (§64),
this was the single most impactful content gap.

### 6.2 The fix (live + folded into `seeds_data.sql`)
**+25 amenities** (idempotent `ON CONFLICT (code) DO NOTHING`, FR + en/es i18n, explicit `scope`):

- **kitchen (4 → 12):** `equipped_kitchen`, `oven`, `stove`, `dishwasher`, `freezer`, `toaster`, `kettle`, `kitchenware`
- **equipment (0 → 5):** `washing_machine`, `clothes_dryer`, `vacuum_cleaner`, `ironing_board`, `drying_rack`
- **comforts (0 → 4):** `welcome_basket`, `daily_housekeeping`, `slippers`, `welcome_drink`
- **family (0 → 5):** `changing_table`, `baby_bath`, `child_safety_gates`, `bottle_warmer`, `child_tableware`
- **business (0 → 3):** `meeting_room`, `coworking_space`, `printer`

All 25 codes verified **net-new** against the existing 136 (no duplication). The editor reads `ref_amenity`
by family (loaders §32/§42), so the new values surface in the §05 amenities picker with **no frontend
change**. Verified live: total **161**, all new rows carry en/es, `families_used` 16 → 20.

### 6.3 `sustainable` family — deliberately left empty
Populating a `sustainable` *amenity* family would duplicate the dedicated **sustainability module**
(`ref_sustainability_action`, 239 actions / 9 categories / 76 groups) — violating the project's "one source
of truth / no duplicate concepts" rule (CLAUDE.md §3). **Recommendation for PO:** either drop the
`amenity_family:sustainable` row as redundant, or repurpose it for non-overlapping *physical* eco-equipment
only (e.g. `ev_charger` already exists under `parking`, `water_fountain`). Flagged, not actioned.

---

## 7. Deferred — candidate enrichments for PO arbitration

Additive, standard-plausible, but **editorial/business** choices (which languages we advertise, which trail
practices the territory offers). Listed prioritised; none applied.

| ID | Vocabulary | Proposed additions | Rationale |
|---|---|---|---|
| L1 | `ref_classification_value:logis` | `cheminee_4/5`, `cocotte_4/5` | only if OTI Sud follows current Logis 1–5 scale (classic 1–3 seeded) |
| L2 | `iti_practice` | `marche_nordique`, `stand_up_paddle`, `speleologie`, `via_ferrata` | real Réunion outdoor practices (lava-tube speleo, canyoning already present) |
| L3 | `view_type` | `volcano`, `lagoon`, `valley`, `panoramic`, `waterfall` | Réunion-defining views absent from the generic list |
| L4 | `ref_language` | add `ru`; review placeholder-looking `haw`/`zu`/`ty` | Russian is a real source market; some codes look like seed noise |
| L5 | `menu_category` | `plat_du_jour`, `formule_midi`, `aperitif`, `fromage`, `accompagnement` | standard French menu sections |
| L6 | `dietary_tag` | `dairy_free`, `nut_free`, `keto` | common dietary filters |
| L7 | `social_network` | `snapchat`, `whatsapp` (display), `vimeo` | distribution surfaces |
| L8 | `amenity_family:sustainable` | drop-or-repurpose decision | see §6.3 |

---

## 8. Out of scope / referred to the prior audit (§68)

i18n holes (43 `acc_*` FR-only; `view_type`/`media_tag` no en/es), "seeded-ahead, no consumer" domains, and
the stale doc plane are **integrity** items already tracked by the 2026-06-15 audit and not re-litigated here.

---

## 9. Verification evidence

- Live `ref_amenity` count: **136 → 161** (+25), `families_used` 16 → 20, `still_empty` = `sustainable` only.
- All 25 new rows carry `name_i18n {en,es}` (query: `name_i18n ? 'en' AND name_i18n ? 'es'`).
- Idempotency: re-running the block is a no-op (`ON CONFLICT (code) DO NOTHING`).
- Deploy integrity: block folded into `Base de donnée DLL et API/seeds_data.sql` immediately after the main
  `ref_amenity` insert → a fresh DB reproduces live.
