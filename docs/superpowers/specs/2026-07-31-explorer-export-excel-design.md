# Export Excel de la sélection, avec sélecteur de colonnes — conception

**Date** : 2026-07-31 · **Révision R1** : 2026-07-31 (revue externe intégrée — voir §0)
**Statut** : conception validée par le PO + corrigée en revue, prête pour le plan d'implémentation
**Journal de décisions** : §208 (dernier utilisé : §207)
**Étape de manifeste SQL** : 16t (dernière utilisée : 16s)

## 0. Révision R1 — corrections de revue (prévalent sur le texte d'origine)

Une revue externe a corrigé la conception sur six points. En cas de contradiction avec
le reste du document, **cette section fait foi**.

1. **L'export ne donne jamais plus de droits que la consultation.** Les colonnes
   Acteur — nom / rôle / principal ne sont PAS « publiques » : elles suivent le droit
   réel de consultation des acteurs (capacité `actor_identity` ↔ le gate de ligne
   existant `v_can_read_extended OR visibility='public'` — on ne réinvente PAS une
   deuxième interprétation des rôles pour l'export). Les coordonnées/notes/résumé
   restent sous `actor_contacts` (garde 16t + finalité + journal). La modale applique
   ces capacités pour l'ergonomie ; **le serveur réévalue toujours par fiche**. Une
   sélection forgée ou un localStorage modifié ne contourne rien.
2. **`get_object_with_deep_data` / `get_objects_with_deep_data` ne sont PAS modifiées
   dans ce chantier.** La migration 16t ne touche que `get_object_resource` (leg
   `actors` : PII/canaux/note + `contacts_restricted` ; `render.actor_lines` ;
   `render.contact_lines`). Motif : éviter la cascade sur le tiroir, l'éditeur,
   l'impression et tous les consommateurs de `getObjectResource`. La divergence
   deep↔resource sur les acteurs est une **dette nommée, distincte** (le latéral deep
   émet la PII sans gate mais est `SECURITY INVOKER` : RLS vide déjà les canaux pour
   `authenticated`, et il n'a **aucun appelant service-role aujourd'hui** — vérifié).
   Un test CI prouve que la migration n'a pas touché ces fonctions.
3. **Aucun plafond fonctionnel d'export.** Toute la sélection (jusqu'au corpus entier)
   est exportable : ressources par lots de 50, coordonnées d'acteur par lots de 500
   (500 puis 340 pour 840 fiches). **Fusion par `object_id`, jamais par position seule**
   (ceinture : vérifier `payload.id` contre l'id attendu) ; ordre initial de la
   sélection conservé ; **un seul classeur, construit après la réussite de TOUS les
   lots** — un lot en échec ⇒ aucun fichier (les journaux des lots sensibles déjà
   réussis sont conservés : la donnée a réellement atteint le navigateur).
4. **Journal multi-ORG et multi-lots.** Tous les lots d'un même export partagent un
   `export_run_id` (généré client, transmis au RPC) ; chaque lot rend
   `{logId, exportRunId, batchIndex, batchCount, authorizedObjectIds, deniedObjectIds}` ;
   Lisez-moi liste TOUS les logId + les comptes demandées/autorisées/refusées.
   `current_user_crm_object_ids()` ne dit pas QUELLE ORG autorise chaque fiche : le
   journal porte l'attribution objet↔ORG (`org_object_ids TEXT[]` pour la RLS de
   lecture + `org_attributions JSONB` détaillée), sinon « lecture par l'admin de l'ORG
   exportatrice » est ambigu à plusieurs ORG.
5. **Contrat de cellule typé.** `value()` rend `string | number | null` avec
   `cellType: 'text' | 'number'` — `latitude`/`longitude` sont **numériques** (le
   « tout texte » de la v0 ne vaut que pour les identifiants/codes). `actor_primary`
   est **multi-valué** (la contrainte permet un principal PAR RÔLE, pas un par fiche) :
   noms joints par ` | `. La **matrice exhaustive des colonnes** (source, libellé,
   type XLSX, capacité, règle d'agrégation, comportement si absent, caractère
   public/partenaire/interne/personnel) est **validée avant le code du registre**.
6. **Performance exigée, pas espérée.** (a) chaque colonne déclare ses blocs API
   (`fields`) ; le service passe l'**union** des blocs des colonnes cochées à
   `p_options.fields` (mécanisme non étanche mais qui réduit l'essentiel du payload) ;
   (b) **concurrence bornée à 2 lots** simultanés (jamais illimitée) ; (c)
   **aplatissement immédiat** de chaque lot en lignes d'export puis libération du JSON
   (ne jamais accumuler 10,5 Mo de JSON brut) ; (d) RPC acteur **set-based** (une
   requête relationnelle par lot, jamais get_object_resource par fiche) ; le plafond
   de 500 n'est **validé qu'après mesure sous le `statement_timeout` de 8 s**.
   Cibles d'acceptation (machine bureautique, depuis La Réunion) :

   | Sélection | Cible |
   |---|---|
   | ≤ 50 fiches | 2-5 s |
   | 200 fiches | 5-10 s |
   | 840 fiches, colonnes usuelles | 15-25 s |
   | 840 fiches, toutes colonnes + acteurs | < 30 s |

   Sans (a)-(c), annoncer honnêtement 30-40 s — pas de promesse « en un clic ».

**Révision R2 (2e passe de revue, même jour) — deux précisions et une correction :**

7. **Préflight serveur des capacités acteur.** Le proxy client « membre d'une ORG »
   est trop large : le droit de consulter les acteurs est PAR FICHE. La modale
   interroge `api.export_actor_capabilities(p_object_ids)` →
   `{actor_identity_available, actor_contacts_available}` — booléens agrégés sur la
   sélection, évalués avec les MÊMES prédicats que les gates réels (extended OU lien
   public ; ORG publisher). L'offre de colonnes acteur suit ce résultat ; échec ou
   RPC absent ⇒ offre fermée (fail-closed). **Ergonomie, jamais une garde** :
   `export_actor_contacts` refait impérativement les contrôles fiche par fiche.
8. **La preuve « deep intouchée » est une comparaison de définitions complètes**
   (extraction des deux corps de fonction dans HEAD et dans l'arbre de travail,
   `diff` strict, garde de non-vacuité sur les extraits) — un `git diff | grep` sur
   le nom peut manquer une modification au milieu du corps, et l'assertion
   `pg_proc.prosrc NOT LIKE '%can_read_actor_contacts%'` ne prouve que l'absence de
   la garde, pas l'identité. Elle reste en complément CI.
9. Correction éditoriale : plus AUCUNE liste de fichiers du plan ne mentionne les
   fonctions deep comme site à modifier (la R1 avait laissé la contradiction dans
   l'en-tête de T13).

---

## 1. Le problème

Le bouton « CSV » de la barre flottante de l'Exploreur
([`SelectionBar.tsx:176`](../../../bertel-tourism-ui/src/components/explorer/SelectionBar.tsx))
appelle `exportSelectedObjectsCsv`
([`selection-export.ts:13`](../../../bertel-tourism-ui/src/services/selection-export.ts)),
qui produit six colonnes : `id, name, type, city, address, raw_json`.

Trois défauts, tous vérifiés :

1. **`raw_json` déverse la fiche entière en JSON dans une seule cellule**
   (`selection-export.ts:31`). Une soixantaine de clés de premier niveau, dont des
   sous-arbres imbriqués. Illisible, non triable, non filtrable.
2. **Les colonnes `city` et `address` sont vides sur 100 % des fiches**, depuis
   toujours : `getLocationStrings` (`selection-export.ts:6-11`) lit
   `raw.location.city` / `.address`, alors que `get_object_resource` émet
   `location = {latitude, longitude, altitude_m, geometry}` — la ville et l'adresse
   vivent dans le bloc `address`. Bug préexistant, jamais signalé — ce qui renseigne
   sur l'usage réel du bouton.
3. **N appels serveur non groupés**, avec `render: true` dont personne ne lit la
   sortie hors du blob, et **aucun plafond** — alors que « Imprimer », qui fait le
   même travail, est plafonné à 50 (`selection-print.ts:17`). Aucun test ne couvre
   ce chemin.

## 2. Ce qu'on livre

Le bouton devient **Excel** et ouvre une modale de sélection de colonnes. Le fichier
produit est un `.xlsx` lisible par un non-technicien : une ligne par fiche, des
libellés français en en-tête, des valeurs en clair. `raw_json` disparaît.

**Périmètre arbitré avec le PO :**

| Question | Décision |
|---|---|
| Quoi exporter | **La sélection uniquement** (cohérent avec la barre où vit le bouton) |
| Valeurs multiples | **Une cellule, texte lisible** — jamais d'onglet normalisé, jamais de matrice |
| Préréglages | **Mémorisés sur le poste** + 3 modèles livrés |
| Colonne propriétaire | **Colonnes séparées + une colonne récapitulative** |
| Acteur — nom, rôle, principal | **`actor_identity`** (R1) : suivent le droit réel de consultation des acteurs — jamais « publiques » par déclaration |
| Acteur — coordonnées | Téléphone, mobile, e-mail, adresse, résumé, note : **`actor_contacts`** — gardées serveur à l'ORG éditrice (16t), **finalité saisie + export journalisé multi-lots** |
| Plafond d'export | **Aucun plafond fonctionnel** (R1) — plafonds techniques PAR LOT (50 ressources / 500 acteur), fusion par `object_id`, un seul classeur en fin de course |
| Adresse acteur | **Colonne créée**, bien qu'aucune ligne n'existe aujourd'hui — invariant §150 : la surface suit le modèle, pas la donnée |
| Notes d'équipe | **Aucune colonne n'existe.** Pas « décochée par défaut » : absente du registre |
| SIRET / SIREN | **Exportables sans garde** — `is_public = TRUE` assumé, arbitrage PO du 2026-07-31 |
| Colonnes vides sur le corpus | **Proposées comme les autres**, sans distinction visuelle |

## 3. Faits mesurés qui contraignent la conception

Tous relevés le 2026-07-31, en lecture seule sur la base de production.

### 3.1 Volumétrie et coût

| Mesure | Valeur |
|---|---|
| Objets | 846 (840 `published`, 6 `archived`, 0 `draft`, 0 `hidden`) |
| `get_object_resource` × 1 | 157 ms / 31 Ko |
| `get_object_resources_batch` × 50 | 1 655 ms / 630 Ko |
| idem avec `{render:false, omit_empty:true}` | **1 374 ms / 573 Ko** |
| Corpus complet extrapolé | ~26-28 s / 10,5 Mo |
| `statement_timeout` | `anon` 3 s · `authenticated` **8 s** · `service_role` aucun |

⇒ **Lots de 50**, toujours avec `{render:false, omit_empty:true}` : marge ×5,8 sous
le timeout. Ne pas monter à 100 (3,3 s, marge ×2,4, trop mince sur la latence
Réunion↔Supabase de 220-310 ms par aller-retour). Barre de progression et bouton
Annuler **obligatoires**, pas optionnels.

### 3.2 Le RPC groupé existe et est dormant

`api.get_object_resources_batch(text[], text[], text, jsonb)`
([`api_views_functions.sql:1946`](../../../Base%20de%20donnée%20DLL%20et%20API/api_views_functions.sql)) :
set-based, `unnest … WITH ORDINALITY`, ordre d'entrée préservé. **Zéro appelant
frontend, zéro mention dans la documentation partenaire** — l'export en serait le
premier consommateur.

Il est `SECURITY INVOKER` mais délègue à `api.get_object_resource`
(`SECURITY DEFINER`, qui s'auto-autorise) : **les gardes de visibilité sont
intégralement conservées**. Vérifié : 629 599 octets identiques en `anon` et en
`postgres` pour 50 fiches.

`proacl = NULL` ⇒ `PUBLIC` détient `EXECUTE` par le défaut PostgreSQL. **L'export
fonctionne sans aucun `GRANT`.** On pose quand même l'hygiène (invariant : pas de
droit implicite) :

```sql
REVOKE ALL ON FUNCTION api.get_object_resources_batch(text[],text[],text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.get_object_resources_batch(text[],text[],text,jsonb) TO authenticated, service_role;
```

Délibérément **pas `anon`** (zéro consommateur documenté).

> **Piège à ne pas reproduire.** Ne jamais faire ce `REVOKE FROM PUBLIC` sur
> `api.get_object_resource` : `anon` **et** `service_role` n'y ont `EXECUTE` que par
> `PUBLIC`, et les routes partenaires appellent en service-role
> (`src/app/api/public/objects/[id]/route.ts:17-19`). Un `REVOKE` nu y casserait tout
> le chemin public.

### 3.3 Le modèle acteur, tel qu'il est réellement rempli

| Mesure | Valeur |
|---|---|
| `actor` | 696 |
| `actor_object_role` | 778 — **100 % `visibility='partners'`, 0 `public`** |
| Objets publiés portant ≥ 1 acteur | 760 |
| `actor_channel` | 1 353 : `email` 681, `mobile` 672, **`phone` 0, `address` 0** |
| ORG publisher | **une seule** — OTI du Sud, 839/840 objets |

Deux conséquences honnêtes :

- **Aucune adresse d'acteur n'existe.** La colonne est créée quand même (§150) ;
  elle rendra `''` jusqu'à la première saisie.
- **La garde « membre de l'ORG éditrice » ne restreint rien aujourd'hui**, puisqu'il
  n'y a qu'une ORG. Elle prend son sens à la deuxième ORG publisher. On la pose
  maintenant parce que l'ajouter après coup demanderait de rappeler les fichiers déjà
  distribués.

### 3.4 Une fuite préexistante, à réparer dans la même passe

`api.get_object_resource` est `SECURITY DEFINER` : il contourne la RLS
d'`actor_channel`. Le **lien** est gardé (`api_views_functions.sql:4077` —
`v_can_read_extended OR aor.visibility='public'`), **les canaux ne le sont pas**
(`:4044-4069`), et `actor_object_role.visibility` vaut `DEFAULT 'public'`
(`schema_unified.sql:2125`). Classe §49.

Preuve d'exécution en `anon` : `actors = []` (bras gardé) **mais**
`render.actor_lines = ["Mr Stéphane Calçada (Exploitant)"]`. **760 objets publiés
concernés.** `render.contact_lines` (`:5045`) a le même défaut.

Ce n'est pas un dommage collatéral de l'export : c'est la raison pour laquelle la
garde 16t doit exister avant que le fichier circule.

### 3.5 Types de colonnes et codes

`object_location.postcode` `varchar(10)`, `object_location.code_insee` `varchar(5)`,
`object_zone.insee_commune` `varchar(5)`, `ref_commune.insee_code` `varchar(5)`.
**Aucune n'est numérique** : le zéro initial ne peut se perdre qu'à l'écriture du
fichier.

`code_insee` est **NULL sur 844/844** et `object_zone` a **0 ligne**. Les colonnes
correspondantes existent (§150) et rendent `''`.

---

## 4. Architecture

Génération **dans le navigateur**, par import dynamique. Le fichier est un artefact
de session — un agent qui trie dans Excel — pas une ressource serveur. Aucune route
API nouvelle, aucune surface d'autorisation nouvelle côté HTTP.

### 4.1 La librairie

**`write-excel-file@4.1.1`** — MIT, 19 Ko gzip (69 Ko min), une dépendance
(`fflate@0.8.3`, MIT, 0 dépendance), publiée le 2026-06-08.

La contrainte est dure : `next.config.ts:66` pose
`'script-src': 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}` — **en
production `unsafe-eval` est absent**. Une librairie qui appelle `eval()` ou
`new Function()` au runtime **passe en `next dev` et casse uniquement en production**.

Preuve d'innocuité : scan des archives npm réelles (pas d'un service tiers) —
**0 occurrence de `eval(` / `new Function(` sur 182 fichiers + 8 fichiers `fflate`**.

Écartés avec motif :

| Candidat | Motif |
|---|---|
| `exceljs@4.4.0` | 250 Ko gzip ; 3 amorces d'`eval` vivantes, inoffensives seulement par une garde `typeof globalThis` d'une dépendance transitive ; aucune version depuis 10/2023 |
| `xlsx@0.18.5` (SheetJS) | CVE-2023-30533 + CVE-2024-22363 **non corrigeables via npm** (upstream parti sur son propre CDN, interdit par `default-src 'self'`) ; **pas de gel de première ligne** |
| `sheetjs-style@0.15.8` | mêmes CVE, fork figé |
| `@e965/xlsx` | sain, mais miroir tiers non officiel — risque chaîne d'approvisionnement |
| `xlsx-populate@1.21.0` | `eval(this.code)` non gardé ⇒ **casse en production** ; abandonné 03/2020 |

Usage : `await import('write-excel-file/browser')` (précédent maison :
`await import('pdfjs-dist')` dans `src/lib/pdf-rasterize.ts:14`), sortie `.toBlob()`
→ `URL.createObjectURL` → `<a download>`. **Aucune directive CSP à modifier.**

### 4.2 Le registre de colonnes

Le cœur du travail est **un registre unique**, `src/services/export/export-columns.ts`.

Il étend le contrat déjà en production `TableColumnDef`
([`table-columns.tsx:53-62`](../../../bertel-tourism-ui/src/components/explorer/table-columns.tsx)),
avec deux différences :

- **la source est `ParsedObjectDetail`**, pas `ObjectCard` — l'export travaille sur
  la fiche complète, pas sur la donnée de liste ;
- chaque colonne porte un **`group`** et un **`clearance`**.

```ts
type ExportClearance = 'public' | 'org' | 'actor_identity' | 'actor_contacts' | 'editor' | 'superuser';
type ExportCellValue = string | number | null;

type ExportColumnDef = {
  id: string;
  label: string;            // libellé FR, celui qui part en en-tête
  group: ExportColumnGroup;
  clearance: ExportClearance;
  cellType: 'text' | 'number';   // R1 — latitude/longitude sont numériques
  /** Blocs de get_object_resource nécessaires (R1, projection p_options.fields). Absent = fiche complète requise. */
  fields?: string[];
  value: (detail: ParsedObjectDetail, ctx: ExportContext) => ExportCellValue;
};
```

`actor_identity` reprend exactement le droit normal de consultation des acteurs
(le gate de ligne existant) ; `actor_contacts` exige le droit d'export renforcé
(16t) et implique finalité + journal. Le plan d'implémentation fixe la traduction
de ces capacités dans les prédicats EXISTANTS — pas de deuxième interprétation
des rôles inventée pour l'export.

> **`clearance` FILTRE, il ne masque pas** (leçon §205). L'offre de colonnes se
> construit par `columns.filter(hasClearance)`, jamais par un `display:none` sur une
> option qui resterait dans l'état. Et ce n'est **pas** la garde : la garde reste
> serveur (§4.5). Un préréglage restauré depuis `localStorage` est refiltré au
> chargement, exactement comme le fait déjà `explorer-view-store.ts` pour les
> colonnes de la vue Table.

**Il y a aujourd'hui quatre écrivains CSV divergents** — `table-columns.tsx:210`
(`;`), `selection-export.ts:22` (`,`), `object-io-serialize.ts:54` (`,`),
`ObjectDetailView.tsx:1298` — et **la protection anti-injection de formule a déjà été
perdue deux fois par copier-coller** (`csvEscape` et `escapeCsvValue`, dette SEC-8
nommée dans `safe-output.ts:12`). On n'en ajoute pas un cinquième :

- l'export Excel est le premier consommateur du nouveau registre ;
- les trois écrivains existants sont rebranchés sur `csvCell` de
  `src/lib/safe-output.ts` — correction d'une régression de sécurité réelle, deux
  lignes chacun ;
- l'unification complète des registres (`ColumnDef<TSource>` générique) est
  **différée** : `TableColumnDef` a cinq consommateurs et sert un écran, pas un
  fichier.

### 4.3 Le catalogue

**~140 colonnes, 14 groupes.** Répartition : Identité 16 · Localisation 16 ·
Contacts 9 · Descriptions 12 · Labels et classements 8 · Équipements 7 ·
Capacité 14 · Tarifs 6 · Horaires 4 · Médias 7 · **Acteur/Propriétaire 9** ·
Organisation éditrice 7 · Légal 5 · Liens et références 21.

Par source : `ParsedObjectDetail` ~116 · lecture directe dans `raw` 18 ·
`ObjectCard` 2.

Le tableau colonne par colonne (id, libellé FR, groupe, chemin source, niveau) vit
en annexe du plan d'implémentation — il est trop long pour cette spec et c'est un
livrable de code, pas de conception. **Un seul groupe est détaillé ici**, parce que
c'est celui que le PO a arbitré explicitement et que la cartographie initiale le
sous-estimait (elle proposait 4 colonnes agrégées) :

| id | Libellé FR | Contenu | Capacité (R1) |
|---|---|---|---|
| `actor_names` | Acteur — nom | Les noms, joints par ` \| ` s'il y en a plusieurs | `actor_identity` |
| `actor_roles` | Acteur — rôle | Exploitant, gérant, guide… (libellé `ref_actor_role`) | `actor_identity` |
| `actor_primary` | Acteur(s) principal(aux) | **Multi-valué** (un principal PAR RÔLE possible) — noms joints par ` \| ` | `actor_identity` |
| `actor_phone` | Acteur — téléphone | canaux `phone` — **0 ligne en base à ce jour** | `actor_contacts` |
| `actor_mobile` | Acteur — mobile | canaux `mobile` — 672 lignes | `actor_contacts` |
| `actor_email` | Acteur — e-mail | canaux `email` — 681 lignes | `actor_contacts` |
| `actor_address` | Acteur — adresse | canaux `address` — **0 ligne en base à ce jour** | `actor_contacts` |
| `actor_summary` | Propriétaire (résumé) | Une phrase : « Nom (rôle) — tél — e-mail — adresse » | `actor_contacts` |
| `actors_notes` | Acteur — note | `actor_object_role.note` | `actor_contacts` |

Pour une **sélection mixte** (certaines fiches autorisées, d'autres non), les lignes
autorisées sont remplies et les autres restent vides — le fichier n'échoue pas, et
Lisez-moi porte les comptes demandées / autorisées / refusées.

Les colonnes `actor_phone` et `actor_address` sont créées bien qu'aucune ligne
n'existe (§150 : la surface suit le modèle, pas la donnée). Elles rendent `''`
jusqu'à la première saisie, sans mention particulière — décision PO.

`actor_summary` est dérivée des colonnes ci-dessus, jamais lue séparément : une
seule source, un seul jeu de gardes.

**Trois règles d'aplatissement**, sans exception :

1. **Valeurs multiples** → une cellule, jointes par ` | `. Jamais `;` (c'est le
   séparateur de cellules en locale FR).
2. **Libellés, jamais de codes.** Ils n'ont rien à résoudre côté client : chaque bloc
   catalogue de `get_object_resource` émet déjà `{code, name}` avec `name` résolu par
   `COALESCE(api.i18n_pick_strict(name_i18n, lang, 'fr'), name)` — `amenities`
   (`:3563`), `payment_methods` (`:3611`), `languages` (`:3455`),
   `environment_tags` (`:3590`), `taxonomy` (`:3781`), `classifications` (`:3736`),
   `accessibility_labels` (`:4380`), `web_channels` (`:3429`). On réutilise
   `readNamedValue` (`features/object-drawer/utils.ts:374-396`).
   **Un code SNAKE_CASE visible dans un export est un bug serveur, pas un manque de
   catalogue côté client.** Quatre exceptions seulement, résolues localement :
   `resolveTypeLabel` (`utils/labels.ts:30`), `STATUS_LABELS`
   (`table-columns.tsx:19`), `humanizeWeekday` (`object-drawer/utils.ts:781`), et une
   table littérale de 4 entrées pour les types de handicap.
   **Ne pas brancher le cache de catalogues** (`useReferenceCatalogsQuery`) : les noms
   voyagent avec la donnée, ce serait 43 requêtes pour rien.
3. **Un champ absent rend `''`**, jamais un signal positif. Les tri-états (`open_now`)
   rendent une cellule vide sur `null` — jamais `Boolean(x)` ni « Non » (§133).

**Union pré-déclarée.** Le nombre de clés du JSON varie de 44 (ORG) à 58 (RES) selon
le type : le schéma de colonnes est **déclaré**, jamais dérivé de la première fiche lue.

### 4.4 Le fichier

Deux feuilles.

**« Fiches »** — une ligne par fiche, dans l'ordre de la sélection.
- Première ligne gelée (`stickyRowsCount: 1`), largeurs de colonnes calculées.
- **Cellules typées par le registre (R1)** : `cellType: 'text'` ⇒ `type: String`
  (identifiants, codes postaux, `code_insee`, `siret` — la première fiche métropole
  en `01xxx` perdrait sinon son zéro) ; `cellType: 'number'` ⇒ `type: Number`
  (**`latitude` / `longitude` uniquement** aujourd'hui). Un test relit le classeur
  et vérifie les deux familles.
- Chaque cellule passe par `csvCell` (`src/lib/safe-output.ts`) : `name` et
  `description` sont éditables par un opérateur et le fichier s'ouvre dans Excel.
  **Attention, contre-intuitif** : `csvCell` préfixe une apostrophe devant `= + - @`.
  Dans un `.xlsx` la cellule est **typée**, une chaîne commençant par `=` n'est pas
  évaluée — l'apostrophe serait **visible**. La neutralisation correcte en xlsx est le
  typage texte ; on adapte `safe-output.ts` avec une fonction sœur `xlsxCell` et un
  commentaire qui explique pourquoi elle diffère.
- Jamais de `geometry` ni de `trackGeojson` en cellule : deux colonnes lat/lon.

**« Lisez-moi »** — date de l'export, nombre de fiches, dictionnaire des colonnes
retenues (id, libellé, ce que contient la cellule), et — si des coordonnées d'acteur
sont incluses — la mention de traçabilité et l'identifiant de journal. C'est ce qui
rend l'export reproductible et auditable.

### 4.5 La garde acteur — migration 16t

Le seul SQL neuf. Trois pièces, dans
`Base de donnée DLL et API/migration_actor_contacts_org_gate.sql`.

**1. Le périmètre est réutilisé, pas réinventé.** `api.current_user_crm_object_ids()`
(`migration_crm_module.sql:269-280`) rend exactement « les objets dont une ORG de mon
membership actif est publisher » — l'arbitrage PO mot pour mot.

> **On n'utilise pas** `api.user_can_read_crm()` ni `api.is_platform_superuser()` :
> leur premier bras est `auth.role() IN ('service_role','admin')`
> (`rls_policies.sql:1856`), et **les routes partenaires appellent en service-role**.
> La garde dirait `TRUE` au seul chemin qui fuit. Une garde d'accès aux données
> personnelles ne s'appuie jamais sur `auth.role()` : la clé de service n'est pas une
> personne.

**2. `api.can_read_actor_contacts(p_object_id)`** — `SECURITY DEFINER`, `STABLE`,
`search_path` restreint, `REVOKE ALL … FROM PUBLIC, anon` puis `GRANT` à
`authenticated, service_role`. Court-circuit `CASE WHEN auth.uid() IS NULL THEN FALSE`
en tête : hors contexte HTTP la fonction ne lit rien. `COALESCE(…, FALSE)` obligatoire
— `auth.uid()` est à trois valeurs, et sans lui la garde serait **fail-OPEN** (§204).

**3. Le patch du leg `actors`** (`api_views_functions.sql:4022-4079`) : sonde
**paresseuse**, évaluée **une seule fois et seulement si le leg est demandé** ;
`first_name` / `last_name` / `gender` / `note` sous `CASE` ;
`contacts = CASE WHEN NOT v_actor_contacts THEN '[]'::jsonb ELSE (…) END` — le `CASE`
court-circuite, donc la corrélée sur `actor_channel` n'est **jamais exécutée** sur le
chemin public (§197 : un `WHERE` dans un `LATERAL` sans `FROM` n'est pas une garde).
Clé neuve **`contacts_restricted: true`** — « réservé » ≠ « pas saisi ».
`render.actor_lines` et `render.contact_lines` reçoivent la même garde.

**4. Le journal.** `actor_contact_export_log`, sur le modèle de `object_deletion_log` :
immuable, **pas de FK** vers `object` ni `actor` (il survit à `rpc_delete_object` et à
l'effacement RGPD art. 17), écrit uniquement par le RPC, RLS lecture superuser + admin
de l'ORG exportatrice. **Aucune valeur de coordonnée n'y entre jamais** — qui, quand,
combien de fiches, quels `object_id`, quels *types* de canaux, quels champs
d'identité. Pas les valeurs.

**5. `api.export_actor_contacts(p_object_ids, p_reason, p_format, p_export_run_id, p_batch_index, p_batch_count)`**
— autorise-une-fois (§36 : la liste d'ids du client n'est jamais de confiance, la
fonction est PostgREST-exécutable), **set-based** (une requête relationnelle par lot,
jamais `get_object_resource` par fiche), filtre le périmètre, lit, **journalise dans
la même transaction**, rend `{log_id, export_run_id, batch_index, batch_count,
authorized_object_ids, denied_object_ids, rows}`.

Contrat de sécurité (R1, exhaustif) : `SECURITY DEFINER` · `auth.uid() IS NOT NULL`
· `search_path` restreint · `REVOKE` de `PUBLIC`, `anon` **ET `service_role`** ·
`GRANT EXECUTE` à `authenticated` seulement (un export de PII est imputable à une
personne) · **finalité validée SERVEUR** (non vide après trim, longueur 5-500 — la
modale seule n'est pas une protection) · format sur liste blanche · ids vides/doublons
**supprimés côté serveur** · plafond **500 par appel, après dédoublonnage** (validé
sous le `statement_timeout` de 8 s avant d'être figé) · autorisation **par fiche** ·
**aucune valeur de coordonnée au journal**. `gen_random_uuid()`, jamais
`uuid_generate_v4()`. Tableau passé **en valeur** (`= ANY(v_scope)`), jamais
`ANY((SELECT …))` — 42883.

**Journal multi-ORG (R1)** : `current_user_crm_object_ids()` ne dit pas quelle ORG
autorise chaque fiche. Le journal porte `export_run_id` (partagé entre les lots d'un
même export), `batch_index`/`batch_count`, **`org_object_ids TEXT[]`** (les ORG
publisher ayant permis l'accès — bras RLS de lecture pour l'admin d'ORG) et
**`org_attributions JSONB`** (paires objet↔ORG détaillées). Lecture : superuser OU
admin d'une ORG présente dans `org_object_ids`.

**Sémantique d'échec (R1)** : un lot en échec ⇒ **aucun fichier produit** ; les
journaux des lots déjà réussis sont **conservés** (la donnée a réellement atteint le
navigateur — le journal dit la vérité, pas l'intention).

**Hors périmètre EXPLICITE (R1)** : `api.get_object_with_deep_data` et
`api.get_objects_with_deep_data` ne sont pas modifiées — l'export ne passe pas par
elles (chemin : modale → service → `get_object_resources_batch` → `get_object_resource`),
et les patcher cascaderait sur le tiroir, l'éditeur, l'impression. La divergence
deep↔resource sur les acteurs est une dette distincte (INVOKER : RLS vide déjà les
canaux pour `authenticated` ; 0 appelant service-role — vérifié). Un test CI prouve
que 16t ne les a pas touchées.

**Conséquence UI — la ligne de démarcation est la CAPACITÉ (R1), vérifiée par
préflight serveur (R2).** `actor_names`, `actor_roles`, `actor_primary` portent
`actor_identity` : elles sortent du batch (lignes déjà filtrées serveur par la
visibilité du lien), sans friction, et ne sont **proposées** que si le préflight
`api.export_actor_capabilities(sélection)` confirme qu'au moins une fiche de la
sélection y donne accès — jamais sur la seule foi d'un proxy de session.
Les six colonnes `actor_contacts` déclenchent la **finalité obligatoire** et passent
par `api.export_actor_contacts` (journalisé, multi-lots, `export_run_id` partagé).
Les colonnes gardées 16t et les colonnes journalisées sont **exactement le même
ensemble** — une seule règle, aucune zone grise. Ordre d'exécution : les lots acteur
d'abord (légers), puis les lots ressources avec **aplatissement immédiat** (R1-6).

**Rupture du contrat partenaire, assumée :** `actors[].contacts` devient `[]` +
`contacts_restricted: true` sur `/api/public/objects/{id}` et `?view=full`. À
répercuter dans `docs/openapi.json`, `docs/guide-partenaires.md` et
`docs/Bertel_API_v3.postman_collection.json`. **Ces trois fichiers sont déjà modifiés
dans l'arbre de travail courant** (chantier Tourinsoft) : le plan doit prévoir de
rebaser proprement, pas d'écraser.

**Front à mettre à jour** pour ne pas recréer « tableau vide ≠ champ absent » :
`object-drawer/utils.ts` (`parseActors`) et `object-workspace-parser.ts:3438` doivent
lire `contacts_restricted`.

### 4.6 La modale

`src/features/explorer/export/ExportExcelModal.tsx`, sur la primitive maison `Modal`
(`src/components/common/Modal.tsx` — overlay, `role="dialog"`, Échap, piège à focus,
verrou de défilement compté, animation de sortie).

> **Piège documenté** (`Modal.tsx:10-12`) : ne **pas** entourer d'un
> `if (!open) return null`. Le composant gère son propre montage, sinon l'animation
> de sortie ne joue jamais.

`Modal` fait 520 px : on ajoute une variante large (~720 px) — un `size` prop, pas une
seconde primitive.

Groupes repliables via `FilterColumnGroup`
(`src/components/common/FilterColumnGroup.tsx`, `collapsible`), case « tout le
groupe », compteur par groupe. Trois préréglages :

| Préréglage | Contenu | Cible |
|---|---|---|
| **Essentiel** | Identité + Localisation + Contacts publics + accroche, ~15 colonnes | Le tri Excel du quotidien |
| **Complet** | Tout ce que l'autorisation permet, hors groupe Acteur | L'inventaire |
| **Diffusion partenaire** | Strictement public : ni légal non-public, ni acteur. **Verrouillé** | Ce qui peut sortir de la maison |

Le modèle verrouillé est ce qui rend l'arbitrage visible dans l'outil plutôt que dans
une note de bas de page.

Persistance du dernier choix en `localStorage`, en réutilisant le mécanisme de
`explorer-view-store.ts` (`persist` + `partialize` + `merge` qui filtre les ids
inconnus et retombe sur le défaut si vide, avec la garde « jamais zéro colonne »).

Pied de modale : « N colonnes · M lignes », Annuler, Télécharger .xlsx. Pendant
l'export : progression par lot et bouton Annuler.

---

## 5. Hors périmètre, explicitement

| Exclu | Raison |
|---|---|
| **Notes d'équipe** | Décision PO. Aucune colonne dans le registre — pas « décochée » |
| `canonical_description` / `org_description` | Legs éditeur Markdown non strippées, que l'API partenaire retire déjà (`api/public/objects/route.ts:95-105`) |
| Onglets normalisés (une ligne par tarif / horaire) | Un modèle relationnel déguisé ; l'utilisateur visé trie une grille |
| Export « tous les résultats du filtre » | Décision PO : la sélection. La colonne `id` en première position rend l'ajout strictement additif |
| Unification complète des registres de colonnes | `TableColumnDef` a 5 consommateurs et sert un écran ; différé, journalisé |
| Montage de `SelectionBar` sous 1180 px | Elle n'est montée que sur l'onglet carte (`ExplorerPage.tsx:111-137`). Constat, pas régression de cette passe |
| Ajout de `is_public` sur `actor_channel` | Le vrai correctif du modèle, mais c'est une migration + une passe de saisie. 16t couvre le besoin immédiat |
| **Modification de `get_object_with_deep_data` / `get_objects_with_deep_data`** | **R1 — exclusion explicite.** L'export ne passe pas par elles ; les patcher cascaderait sur tiroir/éditeur/impression. Dette nommée : divergence deep↔resource sur les acteurs (INVOKER, RLS vide les canaux pour authenticated, 0 appelant service-role). N'entre dans cette passe QUE si les tests démontrent une régression réellement introduite par 16t |
| `n_photos` compte aussi vidéos et documents | Différé documenté §204 ; l'export recompte plutôt que de réutiliser ce chiffre |

---

## 6. Vérification

**Règle maison : une garde non vacante.** Asserter qu'une colonne est dans le registre
ne prouve pas que l'export la remplit.

1. **Test de bout en bout du classeur** — construire le fichier depuis des fiches
   témoins, **le relire cellule par cellule** (`write-excel-file` produit un zip ;
   le test le déballe). Assertions : l'en-tête est en français, `postcode` est une
   chaîne, la première ligne est gelée, une valeur multiple est jointe par ` | `,
   un champ absent rend `''` et non « Non ».
2. **Fichier témoin ouvert dans Excel** — trois colonnes (`postcode`, `id`,
   `latitude`), vérifier de visu qu'un `97418` reste texte et qu'un `01234` conserve
   son zéro. **À faire en premier**, avant d'écrire le reste : c'est le seul point que
   la vérification statique ne peut pas trancher.
3. **Build de production, pas `next dev`** — la CSP sans `unsafe-eval` ne s'applique
   qu'en production. Le test doit tourner sur `next build` + `next start`.
4. **`tests/test_actor_contacts_org_gate.sql`** — personas par `request.jwt.claims`,
   **jamais `SET ROLE` seul** : sans JWT, `auth.uid()` est `NULL`, toutes les personas
   retombent sur « refus » et le test est parfaitement vacant. Assertions clés :
   un membre de l'ORG publisher obtient les coordonnées ; un non-membre obtient
   `contacts: []` + `contacts_restricted: true` ; **`service_role` obtient `[]`**
   (non-régression du chemin partenaire) ; le journal ne contient aucune valeur de
   coordonnée. **Vérifié rouge par sabotage** avant d'être figé : retirer le `CASE`
   doit faire tomber ces assertions.
5. **Le préréglage verrouillé** ne peut rien laisser passer, même avec un
   `localStorage` forgé.
6. **Ajouts R1 — le plan de tests couvre aussi** : export > 500 fiches (fusion
   multi-lots par `object_id`, ordre initial conservé) ; sélection mixte
   autorisée/refusée (lignes autorisées remplies, comptes en Lisez-moi) ; personas
   membre autorisé / éditeur / lecteur simple refusé ; coordonnées journalisées sur
   PLUSIEURS lots (`export_run_id` partagé, tous les `log_id` en Lisez-moi) ; échec
   du second lot ⇒ **aucun fichier** (journaux du 1er lot conservés) ; annulation
   entre deux lots ; non-régression du tiroir et de l'éditeur (suites front) ;
   **preuve que `get_objects_with_deep_data` n'a pas été modifiée** (assertion sur
   `pg_proc.prosrc`) ; `=2+2` conservé comme texte ; zéro initial des codes postaux ;
   plusieurs acteurs principaux joints par ` | ` ; finalité trop courte refusée
   SERVEUR ; cibles de temps mesurées (§0-6) comme critères d'acceptation.

---

## 7. Pièges maison qui s'appliquent

1. CSP de production sans `unsafe-eval` — une librairie à `eval` casse **uniquement** en production.
2. `REVOKE ALL … FROM PUBLIC` obligatoire sur toute fonction `DEFINER` neuve ; un `GRANT` ciblé ne le retire pas.
3. Ne jamais `REVOKE FROM PUBLIC` sans re-`GRANT` explicite : sur ces RPC, `anon` et `service_role` n'ont `EXECUTE` que par `PUBLIC`.
4. Une garde d'accès aux données personnelles ne s'appuie jamais sur `auth.role()` — la clé de service n'est pas une personne.
5. §49 — un drapeau de champ **compose**, il ne se substitue jamais.
6. §204 — `auth.uid()` est à trois valeurs : `COALESCE(…, FALSE)`, sinon fail-OPEN.
7. §204 — une sonde d'autorisation doit être **paresseuse** (`CASE`), sinon elle coûte à chaque appel, chemin anonyme compris.
8. §197 — un `WHERE` dans un `LATERAL` sans `FROM` n'est pas une garde.
9. §36 — autoriser-une-fois : la liste d'ids du client n'est jamais de confiance.
10. §39 — `auth.*()` wrappé en `(select …)` dans toute policy neuve.
11. `x = ANY((SELECT arr FROM cte))` ⇒ 42883 : passer le tableau **en valeur**.
12. `gen_random_uuid()`, jamais `uuid_generate_v4()` en `search_path` restreint.
13. §205 — masquer n'est pas la garde : `clearance` **filtre** la liste.
14. §133 — tri-état : `null` ⇒ cellule vide, jamais `Boolean(x)`.
15. §150 — la surface suit le modèle, jamais la donnée : les colonnes vides existent.
16. `object_org_link.role_id` → `ref_org_role`, **pas** `ref_code` : la jointure « naturelle » rend 0 ligne en silence.
17. `object_price.amount` vaut la chaîne `'n/a'` quand absent, pas `''` — filtrer avant tout `Math.min`.
18. Contacts : exporter `value`, pas `displayValue` (qui est le nom de plateforme) ni `href` (qui porte `mailto:`/`tel:`).
19. Horaires : `weekdaySlots`, jamais `slots[]` seul — sinon les créneaux sont détachés des jours (cas réels §151).
20. `p_options.fields` n'est pas étanche : `opening_times`, `incoming/outgoing_relations` et `render` sortent même non demandés.
21. Ne jamais passer `NULL` dans `p_ids` (supprimé par `WHERE t.id IS NOT NULL` ⇒ décalage des positions).
22. Intégrité de déploiement : 16t entre dans `ci_fresh_apply.sql` **et** dans `docs/SQL_ROLLOUT_RUNBOOK.md`. Un apply live seul est un incident.
23. `NOTIFY pgrst, 'reload schema';` obligatoire (deux fonctions `api` neuves).

**Dérive de manifeste à redresser au passage** : `16r` et `16s` sont dans
`ci_fresh_apply.sql` et dans les sections `##` du runbook mais **absents du manifeste
ordonné**, et le libellé `16q` y est utilisé deux fois. Insérer `16t` sans corriger
cela perpétue la dérive. Insertion dans `ci_fresh_apply.sql` entre les lignes 360 et
362 (le bloc `I4f-final-test` reste dernier).

---

## 8. Risques résiduels

1. **Le rendu réel dans Excel n'a pas été éprouvé.** `type: String` produit bien une
   chaîne partagée `t="s"` dans le XML (vérifié dans le code de la librairie), mais
   personne n'a ouvert un `.xlsx` généré. C'est la vérification n° 2, à faire en
   premier.
2. **Six tables non mesurées** (`object_discount`, `promotion_object`,
   `object_stay_policy`, `cuisine_types`, `dietary_tags`, `allergens`) alimentent 9
   colonnes qui pourraient être aussi vides que les 26 autres. Un `SELECT count(*)`
   groupé avant de figer le catalogue. Sans conséquence de conception (§150), mais
   utile pour calibrer le préréglage « Essentiel ».
3. **18 colonnes lisent directement dans `raw`**, donc sans typage : un renommage de
   clé serveur les casserait en silence (le piège `object_zone` vs `zones` existe
   déjà). Patcher `parseObjectDetail` pour ces 18 est une passe à part entière — 11
   blocs, dont `legal_records[].value` qui porte le SIRET. Le plan doit trancher :
   lecture directe assumée avec un test de présence de clé, ou patch du parser.
4. **28 s pour le corpus complet** : onglet fermé ou machine en veille ⇒ export perdu
   sans trace. Annulation propre et message explicite ; ne pas promettre « en un clic »
   sur 840 fiches.
5. **Collision de diff** sur les trois fichiers de documentation partenaire, déjà
   modifiés dans l'arbre de travail par le chantier Tourinsoft.
6. **R1 — le plafond 500 du RPC acteur est une hypothèse** tant qu'il n'a pas été
   mesuré sous le `statement_timeout` de 8 s : le valider en production (et le
   descendre si > 4 s) avant de le figer dans la doc.
7. **R1 — les cibles de temps** (15-25 s pour 840 fiches avec projection +
   concurrence 2 + aplatissement immédiat) sont réalistes mais non prouvées : un
   benchmark depuis La Réunion les confirme ou les révise — sans ces optimisations,
   annoncer 30-40 s.
