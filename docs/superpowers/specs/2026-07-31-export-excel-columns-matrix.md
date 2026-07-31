# Export Excel de la sélection — matrice exhaustive des colonnes (§208)

**Date** : 2026-07-31 · **Chantier** : §208 (export Excel de la sélection de l'Exploreur)
**Statut** : matrice à valider par le PO **AVANT** l'écriture du registre `export-columns.ts`
(Tâches 5-7 du plan) — c'est le Step 0 de la Tâche 4.
**Conception** : [`docs/superpowers/specs/2026-07-31-explorer-export-excel-design.md`](2026-07-31-explorer-export-excel-design.md)
**Plan** : `.superpowers/sdd/x208/` (task-4-brief.md à task-7-brief.md pour le registre)
**Source des colonnes** : le code `ExportColumnDef` tel qu'écrit dans task-5-brief.md,
task-6-brief.md et task-7-brief.md — vérifié ligne à ligne contre le parser réel
(`bertel-tourism-ui/src/services/object-detail-parser.ts` et
`bertel-tourism-ui/src/features/object-drawer/utils.ts`). Ce document décrit ce que ce
code FAIT, il n'invente ni n'ajoute de colonne.

**Quatre règles du chantier, rappelées :**
1. **Type XLSX** — `number` UNIQUEMENT pour `latitude`/`longitude`. Tout le reste est `text`
   (identifiants, codes postaux, SIRET, montants, compteurs) pour ne perdre ni les zéros de
   tête ni laisser Excel réinterpréter une valeur.
2. **Si absent** — une colonne sans donnée rend `''` (texte) ou une cellule vide (nombre) —
   **jamais** un signal positif comme « Non » (tri-état, §133 : absent ≠ faux).
3. **Caractère** — `public` / `partenaire` / `interne` / `personnel`. Les colonnes `actor_*`
   portent **« personnel »** ; les colonnes de niveau `org` portent **« interne »** (imposé
   par le plan). Pour les autres, déduit honnêtement de la nature de la donnée.
4. **Capacités** — `clearance` (`public`/`org`/`actor_identity`/`actor_contacts`/`superuser`)
   **FILTRE l'offre** de colonnes dans la modale (ergonomie) — **ce n'est jamais la garde**.
   La garde reste serveur (RLS + gates `SECURITY DEFINER` + la migration 16t pour les
   coordonnées d'acteur, qui réévalue fiche par fiche). Une colonne `actor_contacts` porte
   en plus `requiresPurpose` : finalité saisie + appel journalisé (`api.export_actor_contacts`).

**Invariant** : l'export ne donne **jamais** plus que la consultation. `actor_identity`
reprend exactement le droit normal de lire les acteurs d'une fiche (le gate de ligne
`v_can_read_extended OR visibility='public'`) ; `actor_contacts` exige le droit d'export
renforcé (16t). La modale n'est qu'une ergonomie — le serveur réévalue toujours.

**Vérification effectuée** : aucune des 122 colonnes ci-dessous ne lit
`text.privateNote`, `text.privateNotes` ou `internal.privateNotes` (interdit du chantier).
Confirmé par lecture ligne à ligne des trois briefs.

---

## Sommaire par groupe

| Groupe | Libellé FR | Colonnes |
|---|---|---|
| `identite` | Identité | 13 |
| `localisation` | Localisation | 15 |
| `contacts` | Contacts | 9 |
| `descriptions` | Descriptions | 8 |
| `labels` | Labels & classements | 7 |
| `equipements` | Équipements | 7 |
| `capacite` | Capacité & politiques | 14 |
| `tarifs` | Tarifs | 6 |
| `horaires` | Horaires | 3 |
| `medias` | Médias | 7 |
| `acteur` | Propriétaire / acteur | 9 |
| `organisation` | Organisation éditrice | 6 |
| `legal` | Légal | 5 |
| `liens` | Liens & références | 13 |
| **Total** | | **122** |

---

## Identité (13 colonnes)

| id | libellé FR | groupe | source | type XLSX | capacité requise | règle d'agrégation | si absent | caractère |
|---|---|---|---|---|---|---|---|---|
| `id` | Identifiant | identite | `identity.id` | text | public | valeur directe | `''` | public |
| `name` | Nom | identite | `identity.name` | text | public | valeur directe | `''` | public |
| `type_code` | Code type | identite | `identity.type` | text | public | valeur directe (code brut, ex. `HOT`) | `''` | public |
| `type` | Type | identite | `identity.type` | text | public | résolution catalogue local `resolveTypeLabel` (repli : humanisation du code si type inconnu) | `''` | public |
| `status` | Statut | identite | `identity.status` | text | public | résolution vocabulaire local `STATUS_LABELS` recopié (repli : code brut si statut inconnu) | `''` | public |
| `commercial_visibility` | Visibilité commerciale | identite | `identity.commercialVisibility` | text | org | valeur directe | `''` | interne |
| `region_code` | Territoire | identite | `identity.regionCode` | text | public | valeur directe | `''` | public |
| `created_at` | Créée le | identite | `identity.createdAt` | text | public | date FR jj/mm/aaaa (`dateFr`) | `''` | public |
| `updated_at` | Mise à jour le | identite | `identity.updatedAt` | text | public | date FR jj/mm/aaaa | `''` | public |
| `published_at` | Publiée le | identite | `identity.publishedAt` | text | public | date FR jj/mm/aaaa | `''` | public |
| `taxonomy` | Sous-catégorie | identite | `taxonomy.groups[key='taxonomy'].items[].label` | text | public | jointure (espace-pipe-espace) des libellés | `''` | public |
| `tags` | Étiquettes | identite | `taxonomy.groups[key='tags'].items[].label` | text | public | jointure (espace-pipe-espace) | `''` | public |
| `environment_tags` | Cadre & environnement | identite | `taxonomy.groups[key='environment'].items[].label` | text | public | jointure (espace-pipe-espace) | `''` | public |

---

## Localisation (15 colonnes)

| id | libellé FR | groupe | source | type XLSX | capacité requise | règle d'agrégation | si absent | caractère |
|---|---|---|---|---|---|---|---|---|
| `address` | Adresse | localisation | `location.address` | text | public | valeur directe (`location` peut être `null` → `''`) | `''` | public |
| `city` | Commune | localisation | `location.city` | text | public | valeur directe | `''` | public |
| `postcode` | Code postal | localisation | `location.postcode` | text | public | valeur directe (jamais numérique — zéro de tête) | `''` | public |
| `lieu_dit` | Lieu-dit | localisation | `location.lieuDit` | text | public | valeur directe | `''` | public |
| `direction` | Accès / itinéraire | localisation | `location.direction` | text | public | valeur directe | `''` | public |
| `location_label` | Localisation (ligne) | localisation | `location.label` | text | public | valeur directe (ligne déjà composée par le parser : adresse · lieu-dit · CP ville) | `''` | public |
| `latitude` | Latitude | localisation | `location.latitude` | **number** | public | valeur directe | cellule vide (`null`) | public |
| `longitude` | Longitude | localisation | `location.longitude` | **number** | public | valeur directe | cellule vide (`null`) | public |
| `google_maps_url` | Lien Google Maps | localisation | `location.googleMapsUrl` | text | public | URL composée par le parser | `''` | public |
| `directions_url` | Lien itinéraire | localisation | `location.directionsUrl` | text | public | URL composée par le parser | `''` | public |
| `code_insee` | Code INSEE | localisation | `raw.address.code_insee` | text | public | lecture directe (`rawStr`) | `''` | public |
| `altitude_m` | Altitude (m) | localisation | `raw.location.altitude_m` | text | public | lecture directe (`rawStr`, converti en chaîne) | `''` | public |
| `zones` | Communes desservies | localisation | `raw.object_zone[]` | text | public | jointure (espace-pipe-espace) des libellés résolus (`namedList`) | `''` | public |
| `places_count` | Nombre de sous-lieux | localisation | `text.places.length` | text | public | comptage (`0` ⇒ `''`) | `''` | public |
| `places` | Sous-lieux | localisation | `text.places[].name` | text | public | jointure (espace-pipe-espace) des noms | `''` | public |

---

## Contacts (9 colonnes)

| id | libellé FR | groupe | source | type XLSX | capacité requise | règle d'agrégation | si absent | caractère |
|---|---|---|---|---|---|---|---|---|
| `phone` | Téléphone | contacts | `contacts.public[kindCode∈{phone,tel,telephone,telephone_fixe}].value` | text | public | premier contact public correspondant | `''` | public |
| `mobile` | Mobile | contacts | `contacts.public[kindCode∈{mobile,telephone_mobile}].value` | text | public | premier contact public correspondant | `''` | public |
| `email` | E-mail | contacts | `contacts.public[kindCode='email'].value` | text | public | premier contact public correspondant | `''` | public |
| `website` | Site web | contacts | `contacts.public[kindCode='website'].value` | text | public | premier contact public correspondant | `''` | public |
| `contacts_public` | Contacts publics | contacts | `contacts.public[].{kind,value}` | text | public | jointure (espace-pipe-espace) de « kind : value » (`contactLine`) | `''` | public |
| `contacts_object` | Contacts de la fiche (tous) | contacts | `contacts.object[].{kind,value}` | text | org | jointure (espace-pipe-espace) — inclut les contacts non publics | `''` | interne |
| `contacts_orgs` | Contacts organisations | contacts | `contacts.organizations[].{kind,value}` | text | org | jointure (espace-pipe-espace) | `''` | interne |
| `web_channels` | Réseaux & distribution | contacts | `raw.web_channels[].{platform,url}` | text | public | jointure (espace-pipe-espace) de « plateforme : url » (lecture directe, résolution via `readNamedValue`) | `''` | public |
| `spoken_languages` | Langues parlées | contacts | `taxonomy.groups[key='languages'].items[].label` | text | public | jointure (espace-pipe-espace) | `''` | public |

---

## Descriptions (8 colonnes)

| id | libellé FR | groupe | source | type XLSX | capacité requise | règle d'agrégation | si absent | caractère |
|---|---|---|---|---|---|---|---|---|
| `chapo` | Accroche | descriptions | `text.chapo` | text | public | valeur directe (texte propre — Markdown déjà strippé côté API) | `''` | public |
| `description` | Description | descriptions | `text.description` | text | public | valeur directe | `''` | public |
| `description_adapted` | Description adaptée | descriptions | `text.adaptedDescription` | text | public | valeur directe | `''` | public |
| `description_mobile` | Description mobile | descriptions | `text.mobileDescription` | text | public | valeur directe | `''` | public |
| `description_edition` | Description édition | descriptions | `text.editorialDescription` | text | public | valeur directe | `''` | public |
| `description_hors_zone` | Offre hors zone | descriptions | `raw.description_offre_hors_zone` | text | public | lecture directe (`rawStr`) | `''` | public |
| `sanitary_measures` | Mesures sanitaires | descriptions | `raw.sanitary_measures` | text | public | lecture directe (`rawStr`) | `''` | public |
| `descriptions_langs` | Langues de description | descriptions | `text.descriptions[].language` | text | public | dédoublonnage (`Set`) + jointure (espace-pipe-espace) | `''` | public |

*Interdits vérifiés dans le brief (Tâche 5) : pas de `description_md`/`chapo_md` (legs Markdown
bruts réservés à l'éditeur), pas de `is_editing`/`updated_at_source`, aucune colonne notes.*

---

## Labels & classements (7 colonnes)

| id | libellé FR | groupe | source | type XLSX | capacité requise | règle d'agrégation | si absent | caractère |
|---|---|---|---|---|---|---|---|---|
| `classifications` | Classements & labels | labels | `taxonomy.groups[key='classifications'].items[].{label,meta}` | text | public | jointure (espace-pipe-espace) de « label meta » | `''` | public |
| `labels_neutral` | Labels | labels | `taxonomy.groups[key='labels'].items[].label` | text | public | jointure (espace-pipe-espace) | `''` | public |
| `badges` | Badges | labels | `taxonomy.groups[key='badges'].items[].label` | text | public | jointure (espace-pipe-espace) | `''` | public |
| `sustainability_labels` | Labels durabilité | labels | `taxonomy.sustainability.labels[].label` | text | public | jointure (espace-pipe-espace) | `''` | public |
| `sustainability_actions` | Actions durabilité | labels | `taxonomy.sustainability.actions[].label` | text | public | jointure (espace-pipe-espace) | `''` | public |
| `accessibility_labels` | Labels accessibilité | labels | `raw.accessibility_labels[]` | text | public | jointure (espace-pipe-espace) des libellés résolus (`namedList`) | `''` | public |
| `disability_types` | Handicaps couverts | labels | `raw.accessibility_labels[].disability_types_covered[]` | text | public | jointure (espace-pipe-espace), résolution via table locale de 4 entrées (`DISABILITY_LABELS`) | `''` | public |

---

## Équipements (7 colonnes)

| id | libellé FR | groupe | source | type XLSX | capacité requise | règle d'agrégation | si absent | caractère |
|---|---|---|---|---|---|---|---|---|
| `amenities` | Équipements | equipements | `taxonomy.amenities[]` | text | public | jointure (espace-pipe-espace) | `''` | public |
| `amenities_count` | Nombre d'équipements | equipements | `taxonomy.amenities.length` | text | public | comptage (`0` ⇒ `''`) | `''` | public |
| `payment_methods` | Moyens de paiement | equipements | `taxonomy.groups[key='payments'].items[].label` | text | public | jointure (espace-pipe-espace) | `''` | public |
| `practices` | Pratiques | equipements | `taxonomy.groups[key='practices'].items[].label` | text | public | jointure (espace-pipe-espace) | `''` | public |
| `cuisine_types` | Types de cuisine | equipements | `raw.cuisine_types[]` | text | public | jointure (espace-pipe-espace) résolue (`namedList`) | `''` | public |
| `dietary_tags` | Régimes alimentaires | equipements | `raw.dietary_tags[]` | text | public | jointure (espace-pipe-espace) résolue | `''` | public |
| `allergens` | Allergènes | equipements | `raw.allergens[]` | text | public | jointure (espace-pipe-espace) résolue | `''` | public |

---

## Capacité & politiques (14 colonnes)

| id | libellé FR | groupe | source | type XLSX | capacité requise | règle d'agrégation | si absent | caractère |
|---|---|---|---|---|---|---|---|---|
| `capacity` | Capacités | capacite | `operations.capacities[].{label,value}` | text | public | jointure (espace-pipe-espace) de « label : value » | `''` | public |
| `capacity_max` | Capacité maximale | capacite | `operations.capacities[].{label,value}` | text | public | recherche du libellé contenant « capacit » (regex), repli sur le PREMIER élément de la liste si aucun ne matche (assumé — pas de `metric_code` sur `CapacityItem`, cf. Points à trancher) | `''` | public |
| `rooms_count` | Types de chambres | capacite | `operations.roomTypes.length` | text | public | comptage (`0` ⇒ `''`) | `''` | public |
| `room_types` | Chambres | capacite | `operations.roomTypes[].{name,quantity,capacityAdults}` | text | public | jointure (espace-pipe-espace) de « nom ×qté N pers. » | `''` | public |
| `meeting_rooms_count` | Salles de séminaire | capacite | `operations.meetingRooms.length` | text | public | comptage (`0` ⇒ `''`) | `''` | public |
| `meeting_rooms` | Salles (détail) | capacite | `operations.meetingRooms[].{name,areaM2,capacityTheatre}` | text | public | jointure (espace-pipe-espace) de « nom — m² — théâtre N » | `''` | public |
| `group_min` | Groupe — taille min | capacite | `operations.groupPolicy.minSize` | text | public | valeur directe (`groupPolicy` peut être `null`) | `''` | public |
| `group_max` | Groupe — taille max | capacite | `operations.groupPolicy.maxSize` | text | public | valeur directe | `''` | public |
| `group_only` | Groupes uniquement | capacite | `operations.groupPolicy.groupOnly` | text | public | tri-état Oui/Non (`''` si pas de politique groupe, §133) | `''` | public |
| `group_notes` | Groupe — conditions | capacite | `operations.groupPolicy.notes` | text | public | valeur directe | `''` | public |
| `pets_accepted` | Animaux acceptés | capacite | `operations.petPolicy.accepted` | text | public | tri-état Oui/Non/vide — **jamais « Non » sur absence** (§133, vérifié par test dédié) | `''` | public |
| `pets_conditions` | Animaux — conditions | capacite | `operations.petPolicy.details[]` | text | public | jointure (espace-pipe-espace) (inclut `pet_policy.conditions` côté source brute) | `''` | public |
| `checkin` | Heure d'arrivée | capacite | `raw.stay_policy.{checkin_from,checkin_to}` | text | public | jointure « – » des deux bornes (`rawStr` ×2) | `''` | public |
| `checkout` | Heure de départ | capacite | `raw.stay_policy.checkout_until` | text | public | lecture directe (`rawStr`) | `''` | public |

---

## Tarifs (6 colonnes)

| id | libellé FR | groupe | source | type XLSX | capacité requise | règle d'agrégation | si absent | caractère |
|---|---|---|---|---|---|---|---|---|
| `prices` | Tarifs | tarifs | `operations.prices[].{label,amount,currency,periodLabel}` | text | public | jointure (espace-pipe-espace) de lignes « label — montant devise — période » (`priceLine`) | `''` | public |
| `price_min` | Tarif minimum | tarifs | `operations.prices[].amount` | text | public | `Math.min` sur les montants numériques valides — **filtre `'n/a'` avant tout calcul** (piège maison, `object_price.amount` vaut la chaîne `'n/a'` quand absent) | `''` | public |
| `currency` | Devise | tarifs | `operations.prices[].currency` | text | public | premier tarif portant une devise | `''` | public |
| `discounts_count` | Réductions (nombre) | tarifs | `operations.discounts.length` | text | public | comptage (`0` ⇒ `''`) | `''` | public |
| `discounts` | Réductions | tarifs | `operations.discounts[]` (records bruts) | text | public | jointure (espace-pipe-espace) des libellés résolus (`readNamedValue`) | `''` | public |
| `promotions` | Promotions | tarifs | `raw.promotions[]` | text | org | jointure (espace-pipe-espace) résolue (`namedList`) | `''` | interne |

---

## Horaires (3 colonnes)

| id | libellé FR | groupe | source | type XLSX | capacité requise | règle d'agrégation | si absent | caractère |
|---|---|---|---|---|---|---|---|---|
| `openings` | Horaires d'ouverture | horaires | `operations.openings[]` | text | public | jointure (espace-pipe-espace) de `openingToText` (libellé — période — jours via `weekdaySlots` — détails) | `''` | public |
| `openings_count` | Périodes d'ouverture | horaires | `operations.openings.length` | text | public | comptage (`0` ⇒ `''`) | `''` | public |
| `open_all_year` | Ouvert toute l'année | horaires | `operations.openings[].allYears` | text | public | tri-état Oui/Non, `''` si 0 période (pas de faux « Non » sur absence) | `''` | public |

---

## Médias (7 colonnes)

| id | libellé FR | groupe | source | type XLSX | capacité requise | règle d'agrégation | si absent | caractère |
|---|---|---|---|---|---|---|---|---|
| `photo_main` | Photo principale (URL) | medias | `media.hero.url` | text | public | valeur directe (premier média du tableau = hero) | `''` | public |
| `photo_main_credit` | Crédit photo principale | medias | `media.hero.credit` | text | public | valeur directe | `''` | public |
| `media_count` | Nombre de médias | medias | `media.items.length` | text | public | comptage (`0` ⇒ `''`) | `''` | public |
| `media_urls` | URLs des médias | medias | `media.items[].url` | text | public | jointure (espace-pipe-espace) | `''` | public |
| `media_credits` | Crédits médias | medias | `media.items[].credit` | text | public | dédoublonnage (`Set`) + jointure (espace-pipe-espace) | `''` | public |
| `media_tags` | Tags médias | medias | `media.tagCloud[]` | text | public | jointure (espace-pipe-espace) | `''` | public |
| `media_private_count` | Médias non publics | medias | `media.items[].visibility` | text | org | comptage des médias dont `visibility` est défini et ≠ `'public'` (`0` ⇒ `''`) | `''` | interne |

---

## Propriétaire / acteur (9 colonnes)

Les 3 premières colonnes (identité) suivent le droit normal de consultation des acteurs
(`actor_identity`). Les 6 suivantes (coordonnées/note/résumé) sont gardées `actor_contacts`
**et** `requiresPurpose: true` — elles ne lisent **jamais** la fiche elle-même, uniquement
`ctx.actorContacts`, rempli par le seul appel journalisé `api.export_actor_contacts` (16t).
Sans ce contexte (`ctx.actorContacts === null`), ces 6 colonnes rendent `''` même si la
fiche porte des données acteur par ailleurs.

| id | libellé FR | groupe | source | type XLSX | capacité requise | règle d'agrégation | si absent | caractère |
|---|---|---|---|---|---|---|---|---|
| `actor_names` | Acteur — nom | acteur | `relations.actors[].name` | text | actor_identity | jointure (espace-pipe-espace) | `''` | personnel |
| `actor_roles` | Acteur — rôle | acteur | `relations.actors[].role` | text | actor_identity | jointure (espace-pipe-espace) | `''` | personnel |
| `actor_primary` | Acteur(s) principal(aux) | acteur | `relations.actors[isPrimary].name` | text | actor_identity | filtre `isPrimary` + jointure (espace-pipe-espace) — **multi-valué** : un principal possible PAR RÔLE | `''` | personnel |
| `actor_phone` | Acteur — téléphone | acteur | `ctx.actorContacts[].contacts[kindCode='phone'].value` | text | actor_contacts + finalité obligatoire, journalisé (16t) | jointure (espace-pipe-espace) des valeurs de canal | `''` | personnel |
| `actor_mobile` | Acteur — mobile | acteur | `ctx.actorContacts[].contacts[kindCode='mobile'].value` | text | actor_contacts + finalité obligatoire, journalisé | jointure (espace-pipe-espace) | `''` | personnel |
| `actor_email` | Acteur — e-mail | acteur | `ctx.actorContacts[].contacts[kindCode='email'].value` | text | actor_contacts + finalité obligatoire, journalisé | jointure (espace-pipe-espace) | `''` | personnel |
| `actor_address` | Acteur — adresse | acteur | `ctx.actorContacts[].contacts[kindCode='address'].value` | text | actor_contacts + finalité obligatoire, journalisé | jointure (espace-pipe-espace) — colonne créée bien que 0 ligne en base à ce jour (§150 : la surface suit le modèle) | `''` | personnel |
| `actor_summary` | Propriétaire (résumé) | acteur | `ctx.actorContacts[].{displayName,roleName,note,contacts}` | text | actor_contacts + finalité obligatoire, journalisé | ligne composée « Nom (rôle) — tél/mobile — e-mail — adresse » par acteur, jointure (espace-pipe-espace) entre acteurs | `''` | personnel |
| `actors_notes` | Acteur — note | acteur | `ctx.actorContacts[].note` | text | actor_contacts + finalité obligatoire, journalisé | jointure (espace-pipe-espace) des notes | `''` | personnel |

---

## Organisation éditrice (6 colonnes)

| id | libellé FR | groupe | source | type XLSX | capacité requise | règle d'agrégation | si absent | caractère |
|---|---|---|---|---|---|---|---|---|
| `publisher` | Organisation éditrice | organisation | `relations.orgLinks[].{name,linkType}` | text | public | recherche du lien dont `linkType` matche `/publisher\|édit/i`, repli sur le premier lien | `''` | public |
| `org_links` | Organisations rattachées | organisation | `relations.orgLinks[].{name,linkType}` | text | public | jointure (espace-pipe-espace) de « nom (type) » | `''` | public |
| `parent_objects` | Fiches parentes | organisation | `relations.parentObjects[].name` | text | public | jointure (espace-pipe-espace) | `''` | public |
| `org_emails` | E-mails organisations | organisation | `relations.organizations[].emails[]` | text | org | jointure (espace-pipe-espace), `flatMap` sur toutes les organisations | `''` | interne |
| `memberships` | Adhésions | organisation | `relations.memberships[].{name,status}` | text | org | jointure (espace-pipe-espace) de « nom (statut) » | `''` | interne |
| `membership_expires` | Adhésion — échéance | organisation | `relations.memberships[0].expiresAt` | text | org | date FR jj/mm/aaaa du PREMIER élément de la liste | `''` | interne |

---

## Légal (5 colonnes)

| id | libellé FR | groupe | source | type XLSX | capacité requise | règle d'agrégation | si absent | caractère |
|---|---|---|---|---|---|---|---|---|
| `siret` | SIRET | legal | `raw.legal_records[type.code='siret'].value` | text | public | recherche par code de type + nettoyage des guillemets (`legalValue`) — public ASSUMÉ (`is_public=TRUE` en base, arbitrage PO 2026-07-31) | `''` | public |
| `legal_records` | Mentions légales (publiques) | legal | `internal.legalRecords[isPublic].{label,status}` | text | public | filtre `isPublic` + jointure (espace-pipe-espace) de « label (statut) » | `''` | public |
| `legal_records_all` | Mentions légales (tout) | legal | `internal.legalRecords[].{label,status}` | text | org | jointure (espace-pipe-espace), inclut les mentions non publiques | `''` | interne |
| `legal_validity` | Validité des documents | legal | `internal.legalRecords[].{label,validityMode}` | text | org | jointure (espace-pipe-espace) de « label : mode » | `''` | interne |
| `legal_expiring` | Documents à échéance (<90 j) | legal | `internal.legalRecords[daysUntilExpiry<90].label` | text | org | filtre numérique sur `daysUntilExpiry` + jointure (espace-pipe-espace) | `''` | interne |

---

## Liens & références (13 colonnes)

| id | libellé FR | groupe | source | type XLSX | capacité requise | règle d'agrégation | si absent | caractère |
|---|---|---|---|---|---|---|---|---|
| `relations_out` | Relations sortantes | liens | `relations.outgoing[].{name,relationship}` | text | public | jointure (espace-pipe-espace) de « nom (relation) » | `''` | public |
| `relations_in` | Relations entrantes | liens | `relations.incoming[].{name,relationship}` | text | public | jointure (espace-pipe-espace) | `''` | public |
| `external_ids` | Identifiants externes | liens | `internal.externalIds[].{source,externalId}` | text | org | jointure (espace-pipe-espace) de « source : id » | `''` | interne |
| `origins` | Sources d'import | liens | `internal.origins[]` (records bruts) | text | org | jointure (espace-pipe-espace) des libellés résolus (`readNamedValue`) | `''` | interne |
| `iti_distance_km` | Distance (km) | liens | `itinerary.summary.distanceKm` | text | public | valeur directe (`summary` peut être `null`) | `''` | public |
| `iti_duration_h` | Durée (h) | liens | `itinerary.summary.durationHours` | text | public | valeur directe | `''` | public |
| `iti_difficulty` | Difficulté | liens | `itinerary.summary.difficulty` | text | public | valeur directe | `''` | public |
| `iti_elevation` | Dénivelé positif (m) | liens | `itinerary.summary.elevationGain` | text | public | valeur directe | `''` | public |
| `iti_is_loop` | Boucle | liens | `itinerary.summary.isLoop` | text | public | tri-état Oui/Non/vide | `''` | public |
| `iti_stages` | Nombre d'étapes | liens | `itinerary.summary.stagesCount` | text | public | comptage (`0` ⇒ `''`) | `''` | public |
| `iti_open_status` | État du sentier | liens | `raw.itinerary.open_status` | text | public | lecture directe (`rawStr`) | `''` | public |
| `fma_occurrences_count` | Dates d'événement (nombre) | liens | `itinerary.fmaOccurrences.length` | text | public | comptage (`0` ⇒ `''`) | `''` | public |
| `unhandled_keys` | Clés non traitées (diagnostic) | liens | `coverage.unhandledKeys[]` | text | superuser | jointure (espace-pipe-espace) des clés JSON non reconnues par le parser | `''` | interne |

---

## Total général : 122 colonnes

Identité 13 · Localisation 15 · Contacts 9 · Descriptions 8 · Labels & classements 7 ·
Équipements 7 · Capacité & politiques 14 · Tarifs 6 · Horaires 3 · Médias 7 ·
Propriétaire / acteur 9 · Organisation éditrice 6 · Légal 5 · Liens & références 13.

---

## Points à trancher par le PO

1. **`readNamedValue` n'est pas exporté par `object-drawer/utils.ts` — bloquant à la
   compilation.** La fonction vit à `utils.ts:374` sans mot-clé `export`
   (`function readNamedValue(...)`). Or task-4-brief.md (helper `namedList`) et
   task-5/6/7-brief.md (colonnes `web_channels`, `discounts`, `origins`, et via `namedList`
   les colonnes `zones`, `accessibility_labels`, `cuisine_types`, `dietary_tags`,
   `allergens`, `promotions`) l'importent comme s'il l'était :
   `import { readNamedValue } from '../../features/object-drawer/utils';`. Le code des
   Tâches 4-7, tel qu'écrit dans les briefs, ne compilera pas sans ajouter `export` devant
   cette déclaration. Ce n'est pas une ambiguïté de conception — c'est un oubli mécanique —
   mais il touche 8 colonnes directement et bloque toute la Tâche 4 (Step 3) : à corriger
   au moment de l'implémentation, avant d'exécuter le Step 2 (vérifier l'échec) de la
   Tâche 4.

2. **Écart de comptage avec les chiffres de la conception (§4.3 du design doc).** Le
   catalogue réel (Tâches 5-7, cette matrice) totalise **122** colonnes contre les **~140**
   indiquées dans la spec de conception, avec des écarts par groupe : Identité 13 (spec 16),
   Localisation 15 (spec 16), Descriptions 8 (spec 12), Labels & classements 7 (spec 8),
   Horaires 3 (spec 4), Organisation éditrice 6 (spec 7), Liens & références 13 (spec 21).
   Contacts (9), Équipements (7), Capacité (14), Tarifs (6), Médias (7), Acteur (9), Légal (5)
   correspondent exactement. Le design doc présente lui-même ces chiffres comme une
   estimation pré-implémentation (« le tableau colonne par colonne … vit en annexe du plan
   d'implémentation — il est trop long pour cette spec »). Informational, mais à confirmer :
   le PO n'attendait-il pas des colonnes supplémentaires (ex. plus de détail horaires,
   davantage de colonnes légales ou de liens) qui auraient été perdues entre la conception
   et l'écriture des briefs ?

3. **`capacity_max` : repli sur le premier élément quel qu'il soit.** En l'absence d'un
   `metric_code` sur `CapacityItem` (retiré au dédoublonnage, `utils.ts:1320`), la colonne
   cherche un libellé contenant « capacit » (regex `/capacit/i`) et, à défaut, replie sur
   le PREMIER élément de `operations.capacities` — qui peut être n'importe quelle métrique
   (ex. « Chambres : 18 » affiché sous l'étiquette « Capacité maximale » si aucun libellé ne
   contient « capacit »). Le brief documente lui-même cette limite comme assumée. Signalé
   pour information — pas nécessairement à corriger dans ce chantier.

4. **Caractère « public » appliqué uniformément à toutes les colonnes `clearance: 'public'`.**
   Le code ne distingue structurellement PAS une donnée « publique » (site public) d'une
   donnée « partenaire » (API B2B) : les deux consomment le même `get_object_resource` /
   `get_object_resources_batch`, avec la même garde de publication. J'ai donc marqué
   uniformément « public » toutes les colonnes `clearance: 'public'`, y compris certaines
   qui ne sont pas forcément rendues aujourd'hui dans le tiroir public de l'Exploreur
   (heures d'arrivée/départ, communes desservies, libellés d'accessibilité, handicaps
   couverts, SIRET, mentions légales publiques, état du sentier). Si le PO souhaite qu'un
   sous-ensemble soit reclassé « partenaire » uniquement (visible via l'API mais pas sur le
   site public), il faut le dire explicitement — cette distinction n'existe pas dans le
   code actuel et demanderait une décision de modélisation séparée.

5. **`unhandled_keys` (groupe liens, `clearance: 'superuser'`).** Aucune des deux règles
   forcées du plan (`actor_*` → personnel, niveau `org` → interne) ne couvre ce cas —
   c'est le seul niveau `superuser` du registre. Classé « interne » par déduction
   (diagnostic technique listant des clés JSON non reconnues, ni personnel ni public) —
   à confirmer.

6. **Les 6 colonnes `actor_contacts` ne rentrent pas dans le format de `source` demandé
   (« chemin `ParsedObjectDetail` ou `raw.*` »).** Elles lisent exclusivement
   `ctx.actorContacts` (l'`ExportContext`, alimenté par l'appel journalisé
   `api.export_actor_contacts`, 16t) — **jamais** `d.relations.actors[].contacts` ni
   aucun autre chemin de la fiche. C'est un choix de sécurité délibéré (le journal serait
   contournable sinon), documenté dans le brief. Je l'ai noté avec la notation
   `ctx.actorContacts[...]` dans la colonne source plutôt que d'inventer un chemin
   `ParsedObjectDetail` qui n'existe pas — signalé pour transparence, pas une ambiguïté à
   trancher.

7. **`status` / `type` : repli sur le code brut si non reconnu.** Si `identity.status` ou
   `identity.type` porte une valeur absente du vocabulaire local (`STATUS_LABELS`,
   `TYPE_LABEL` via `resolveTypeLabel`), le code affiche le CODE BRUT (ou une humanisation
   pour `type`) plutôt qu'une chaîne vide. Ce n'est pas une violation de la règle
   « absent ⇒ `''` » (le champ n'est pas absent, juste non mappé) mais à signaler : un code
   inattendu resterait visible tel quel dans le fichier exporté.

8. **~16 colonnes lisent `raw.*` directement**, sans passer par le parser typé
   (`code_insee`, `altitude_m`, `zones`, `description_hors_zone`, `sanitary_measures`,
   `accessibility_labels`, `disability_types`, `cuisine_types`, `dietary_tags`, `allergens`,
   `checkin`, `checkout`, `promotions`, `web_channels`, `siret`, `iti_open_status`). C'est
   le risque déjà nommé dans le design doc (§8, risque 3 : « un renommage de clé serveur les
   casserait en silence »). Pas une nouvelle découverte — juste un rappel que la matrice
   confirme l'ampleur du risque déjà accepté en conception.
