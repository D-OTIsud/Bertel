# Export Tourinsoft CRT Réunion complet — Plan d’implémentation

**Objectif :** remplacer le simple « socle cœur » Tourinsoft de Bertel par un export versionné couvrant les champs utiles observés dans le flux hébergement du CRT Réunion, sans modifier les profils DATAtourisme/APIDAE et sans casser les consommateurs du format Tourinsoft actuel.

**Architecture :** conserver `?format=tourinsoft` dans sa forme actuelle comme contrat `legacy-v1`, puis ajouter la variante explicite `?format=tourinsoft&variant=reunion-hebergement-v1`. La variante s’appuie sur une projection publique dédiée et set-based, des crosswalks de valeurs pilotés par table, et un sérialiseur Tourinsoft isolé. Le détail et la liste utilisent exactement le même contrat ; le batch ne doit pas exécuter une série de sous-requêtes par objet.

**Périmètre initial prouvable :** hébergements (`HOT`, `HLO`, `CAMP`, puis `HPA`/`RVA` après validation) sur la base du flux `FSHebergementOTISud` fourni par le CRT. Les autres bordereaux seront ajoutés par variantes ou lots ultérieurs dès que leurs flux/schémas CRT auront été fournis ; le plan n’invente pas leurs correspondances à partir du seul bordereau hébergement.

**Technologies :** PostgreSQL/Supabase, fonctions `api.*` service-role-only, Next.js Route Handlers, Jest, tests SQL transactionnels, OpenAPI 3.1, collection Postman.

**État d'exécution au 2026-07-30 :** le contrat exhaustif, les 55 champs approuvés, les 30
crosswalks runtime, la variante détail/liste, les tests de confidentialité/parité, la mesure de
performance, l'OpenAPI, le guide et Postman sont implémentés. La migration est validée sur
PostgreSQL 17 dans une transaction annulée et n'est pas déployée. Restent volontairement différés :
les 96 champs `pending_crt`, les quatre valeurs runtime sans crosswalk, toute extension de modèle,
la recette d'import CRT, le pilote et les bordereaux hors hébergement.

---

## 1. Décisions structurantes

### 1.1 Compatibilité

- Le contrat actuel de 13 champs reste disponible et inchangé sous `legacy-v1`.
- Sans paramètre `variant`, `?format=tourinsoft` continue d’utiliser `legacy-v1` pendant le pilote.
- La nouvelle sortie est demandée explicitement avec `variant=reunion-hebergement-v1` et reste fusionnée sous `data.tourinsoft`.
- Après recette CRT et préavis aux consommateurs, `reunion-hebergement-v1` pourra devenir la variante par défaut pour les types couverts. `variant=legacy-v1` restera alors la voie de repli pendant au moins une fenêtre de version contractuelle.
- Les sorties `jsonld`, `datatourisme` et `apidae` doivent rester identiques à leur baseline.

### 1.2 Limite de la preuve fournie

Le flux transmis est un flux de **syndication en lecture**. Il prouve les noms de champs, collections, cardinalités observées et codes actuellement émis par la base CRT ; il ne prouve pas à lui seul le contrat d’écriture/import Tourinsoft.

La variante peut être développée et testée à partir de ce flux, mais elle ne doit pas être qualifiée « compatible avec l’import CRT » avant validation par Stéphane/CRT des points suivants :

- endpoint et mécanisme d’écriture ; authentification et quotas ;
- noms exacts, casse et structure attendus à l’import ;
- champs obligatoires, cardinalités, traitement de `null`, chaîne vide et collection vide ;
- identifiants techniques et propriétaire de `SyndicObjectID`/identifiant de fiche ;
- codes de bordereau (`CAM` observé dans le flux, contre `CAMP→HPA` dans le profil Bertel actuel) ;
- identifiants/codes des thésaurus et règles d’acceptation des valeurs inconnues ;
- limites et contraintes des photos ;
- règle de dépublication, suppression, conflit et priorité de source.

### 1.3 Sécurité et données publiques

- Exporter uniquement les objets `status='published'`.
- Exporter uniquement les descriptions de visibilité publique et l’overlay OTI explicitement retenu par le contrat.
- Exporter uniquement les contacts et canaux web publics.
- Exporter uniquement les médias publiés, dont les droits ne sont pas expirés.
- Exclure les notes privées, CRM, interactions, modération, brouillons, champs de suivi prestataire et données d’authentification.
- Exclure par défaut SIRET/raison sociale et autres données légales : ne les ajouter qu’avec une exigence CRT explicite et une validation de leur caractère publiable.
- Les RPC restent `SECURITY INVOKER`, `STABLE`, avec `search_path` figé, révoqués à `PUBLIC`, `anon`, `authenticated` et accordés à `service_role` seulement.

### 1.4 Principe de modélisation

Chaque ligne de la matrice doit recevoir l’un des statuts suivants :

1. `direct` : donnée Bertel existante, transformation simple ;
2. `crosswalk` : donnée existante, code CRT à traduire par référentiel ;
3. `derived` : valeur calculée de façon déterministe et documentée ;
4. `extension_pending` : Bertel est plus riche, mais aucun champ CRT cible n’est prouvé ;
5. `source_missing` : champ CRT utile sans source Bertel confirmée ;
6. `excluded` : champ auxiliaire, technique, privé ou sans valeur métier pour la synchronisation.

Une propriété n’entre pas dans le code tant que sa ligne de mapping n’est pas `approved`.

---

## 2. Couverture fonctionnelle cible

### 2.1 Champs communs à couvrir dans `reunion-hebergement-v1`

| Bloc | Cible Tourinsoft observée | Sources Bertel principales | Traitement attendu |
|---|---|---|---|
| Identité/synchronisation | identifiant de syndication, bordereau, publication, mise à jour, ordre | `object`, `ref_interop_crosswalk` | id stable, dates UTC ISO 8601, code de bordereau piloté par profil |
| Nom/descriptions | nom, accroche, description commerciale | `object`, `object_description` | français contractuel, Markdown retiré, overlay OTI explicitement décidé |
| Accès/localisation | adresse complète, CP, commune, INSEE, lieu-dit, plan d’accès, coordonnées, zones | `object_location`, `object_place`, `object_zone` | emplacement principal ; ordre stable pour les zones |
| Communications | téléphone fixe/mobile, courriel, site, réservation | `contact_channel`, `object_web_channel` | toutes les valeurs publiques utiles, typées et ordonnées |
| Réseaux sociaux | collections de réseaux sociaux | `object_web_channel` | type réseau via crosswalk, URL HTTP(S) uniquement |
| Photos/médias | galerie, photo principale, titre/légende, crédit, copyright, ordre | `media`, `media_tag` | galerie complète publiable, dédoublonnée et ordonnée |
| Catégories | catégorie, sous-catégories HLO, classifications | `object_taxonomy`, `object_classification`, référentiels | nearest-ancestor explicite ; aucun fallback silencieux |
| Labels/thématiques | labels, distinctions, thèmes | classifications, taxonomie, tags applicables | crosswalk de codes, valeurs non mappées visibles dans le rapport |
| Langues | langues parlées | `object_language`, `ref_language` | codes normalisés, pas de libellé libre si un code existe |
| Paiements | modes de paiement | `object_payment_method` | crosswalk du domaine `payment_method` |
| Prestations | équipements, services, accessibilité, proximité | `object_amenity`, classifications/taxonomies applicables | séparer équipement sur place, service et proximité |
| Animaux/groupes/séjour | animaux acceptés + complément, politiques groupe/séjour | `object_pet_policy`, `object_group_policy`, `object_stay_policy` | booléens et commentaires sans perdre la distinction |
| Capacités | personnes, chambres, surfaces, PMR, réunion | `object_capacity`, `object_meeting_room` | métrique + valeur + unité/applicabilité, pas de somme arbitraire |
| Tarifs | tarifs, périodes, unités, conditions | `object_price`, `object_price_period`, `object_discount` | montants numériques, devise, unité et période explicitement mappées |
| Ouvertures | périodes, horaires, arrivée/départ | tables `opening_*`, `object_stay_policy` | représentation structurée ; texte libre seulement en complément |

### 2.2 Hébergement spécifique à couvrir ou qualifier

- types d’unités d’hébergement (`object_accommodation_unit_type`) ;
- positionnements hôteliers et affiliation/chaîne (`object_hotel_positioning` ou manque de modèle à confirmer) ;
- types de chambres, lits, équipements et médias de chambre (`object_room_type*`) ;
- salles de réunion et équipements (`object_meeting_room`, `meeting_room_equipment`) ;
- capacité camping (`object_capacity`, type/applicabilité camping) ;
- arrivée/départ, durée minimale et politiques de séjour ;
- classement, catégorie, chambre d’hôtes, gîte et location saisonnière via taxonomie HLO.

Ces blocs sont exportés dans les collections CRT existantes lorsqu’un champ cible est prouvé. Les données Bertel plus riches passent en `extension_pending` jusqu’à ce que le CRT indique leur emplacement : aucune collection propriétaire Bertel ne doit être glissée dans le contrat Tourinsoft sans accord.

### 2.3 Propriétés Tourinsoft à ne pas confondre avec de la richesse métier

Les champs répétés de jointure (`ID`, `Ordre`, identifiant de fiche), les métadonnées de thésaurus (`ThesID`, `ThesOrdre`, pictogramme), `ObjectTypeFix`, le tracking TIS et la structure répétée sont classés `excluded` ou `derived`. Ils ne justifient pas la création de champs Bertel supplémentaires, sauf exigence technique de l’import CRT.

### 2.4 Manques de modèle Bertel à confirmer avant DDL

Le diagnostic initial ne fait apparaître que quelques candidats : chaîne/affiliation hôtelière, formule « tout compris », bureau/structure de rattachement exacte et proximités dans le thésaurus CRT. Chaque candidat doit d’abord être recherché dans les taxonomies, classifications, amenities et liens d’organisation existants.

Une migration de schéma Bertel n’est autorisée que si les trois conditions sont réunies :

1. le champ a une valeur métier utile et non auxiliaire ;
2. aucune source Bertel sémantiquement correcte n’existe ;
3. le CRT confirme la cible, le type et la cardinalité.

---

## 3. Travaux d’implémentation

### Tâche 0 — Geler le contrat candidat et les questions CRT

**Fichiers :**

- Créer `docs/integrations/tourinsoft/reunion-hebergement-v1/README.md`
- Créer `docs/integrations/tourinsoft/reunion-hebergement-v1/source-schema.json`
- Créer `docs/integrations/tourinsoft/reunion-hebergement-v1/field-mapping.csv`
- Créer `docs/integrations/tourinsoft/reunion-hebergement-v1/value-crosswalk.csv`
- Créer `docs/integrations/tourinsoft/reunion-hebergement-v1/crt-decisions.md`
- Créer `tools/tourinsoft/check-contract.mjs`

- [ ] Extraire du flux fourni uniquement le schéma : propriétés, collections, types, cardinalités et exemples de codes ; ne pas versionner les 211 fiches.
- [ ] Donner à `field-mapping.csv` les colonnes : `object_type`, `group`, `bertel_table`, `bertel_field`, `tourinsoft_collection`, `tourinsoft_field`, `cardinality`, `transform`, `crosswalk_domain`, `required`, `privacy`, `mapping_status`, `review_status`, `evidence`, `notes`.
- [ ] Reporter les correspondances déjà établies dans la matrice de travail, puis marquer chaque ligne `approved`, `pending_crt` ou `excluded`.
- [ ] Consigner dans `crt-decisions.md` les réponses du CRT, datées et attribuées ; ne jamais remplacer une incertitude par une supposition dans le code.
- [ ] Faire échouer `check-contract.mjs` si un champ de `source-schema.json` n’a aucun statut dans la matrice, si un champ `approved` n’a pas de source/transformation, ou si deux champs cibles scalaires reçoivent des sources concurrentes.
- [ ] Ajouter le check au CI documentaire.

**Critère de sortie :** 100 % des champs/collections du flux sont classés ; tous les vrais champs métier sont mappés ou portent une question CRT explicite.

### Tâche 1 — Verrouiller la baseline et la stratégie de version

**Fichiers :**

- Modifier `Base de donnée DLL et API/tests/test_interop_profiles.sql`
- Modifier `Base de donnée DLL et API/tests/test_interop_batch.sql`
- Créer `Base de donnée DLL et API/tests/fixtures/tourinsoft_legacy_v1.expected.json`
- Modifier les tests de routes `objects/[id]/route.test.ts` et `objects/route.test.ts`

- [ ] Capturer un fixture synthétique du contrat actuel, incluant ses 13 clés et le mapping actuel des types.
- [ ] Pinner que l’absence de `variant` conserve le payload `legacy-v1` à l’octet près pendant le pilote.
- [ ] Pinner que `variant` est ignoré/rejeté pour `jsonld`, `datatourisme` et `apidae`, sans modifier leur sortie.
- [ ] Ajouter les tests 400 pour une variante Tourinsoft inconnue.
- [ ] Définir les variantes autorisées dans une constante serveur unique, pas dans l’UI.

**Critère de sortie :** tous les tests passent avant l’implémentation enrichie et constituent la protection anti-régression.

### Tâche 2 — Ajouter les référentiels de contrat et de valeurs

**Fichiers :**

- Créer `Base de donnée DLL et API/migration_tourinsoft_reunion_contract.sql`
- Créer `Base de donnée DLL et API/tests/test_tourinsoft_reunion_contract.sql`
- Modifier `Base de donnée DLL et API/ci_fresh_apply.sql`
- Modifier `.github/workflows/sql-fresh-apply.yml`
- Modifier `docs/SQL_ROLLOUT_RUNBOOK.md`

- [ ] Utiliser le profil `tourinsoft_reunion_hebergement_v1` dans `ref_interop_crosswalk` pour isoler les codes de bordereau régionaux du profil générique.
- [ ] Ne semer actifs que les couples validés. Le cas `CAMP→CAM`, observé dans le flux, doit être testé ; `HPA`/`RVA` restent inactifs si le CRT ne les confirme pas.
- [ ] Créer `public.ref_interop_value_crosswalk(profile, domain, source_code, target_code, target_label, is_active, notes)` avec clé unique `(profile, domain, source_code)`.
- [ ] Couvrir au minimum les domaines : langue, moyen de communication, réseau social, paiement, amenity/service/proximité, capacité, classification/label, taxonomie, type/unité de prix, saison, type de période d’ouverture, lit/chambre/réunion.
- [ ] Appliquer les politiques `ref_*` du projet, sans permettre de mutation depuis l’API partenaire.
- [ ] Ajouter une requête de rapport listant toute valeur source utilisée par une fiche publiée mais non mappée.
- [ ] Ne pas réutiliser les tables `staging.mapping_contract*` comme référentiel runtime : elles sont liées aux lots d’import et à la revue de feuilles, pas au contrat public stable.

**Critère de sortie :** aucun UUID/GUID Tourinsoft ni traduction de code métier n’est codé en dur dans le sérialiseur.

### Tâche 3 — Construire une projection Bertel publique et set-based

**Fichiers :**

- Créer `Base de donnée DLL et API/migration_tourinsoft_reunion_projection.sql`
- Créer `Base de donnée DLL et API/tests/test_tourinsoft_reunion_projection.sql`

- [ ] Créer une projection acceptant un tableau d’ids et renvoyant une ligne normalisée par objet publié.
- [ ] Agréger en CTE/LATERAL par bloc fonctionnel : base, descriptions, localisation, contacts/web, médias, taxonomies/classifications, prestations/langues/paiements, politiques, capacités, tarifs, ouvertures, hébergement.
- [ ] Rendre tous les tableaux déterministes : indicateur principal, `position`, date, puis id comme dernier départage.
- [ ] Dédupliquer les contacts, URLs, médias et valeurs de référentiel.
- [ ] Centraliser le nettoyage Markdown et la normalisation URL/téléphone/date/unité.
- [ ] Utiliser les mêmes tables que `api.get_object_resource`, mais ne pas appeler directement cette fonction `SECURITY DEFINER` riche : la projection Tourinsoft doit garder une allowlist publique explicite et testable.
- [ ] Produire un objet normalisé indépendant des noms Tourinsoft afin que le mapping et la sérialisation restent séparés.

**Critère de sortie :** un appel sur 200 ids exécute une lecture groupée, sans boucle de 200 appels au lecteur complet, et ne contient aucune clé privée.

### Tâche 4 — Sérialiser tous les champs communs approuvés

**Fichiers :**

- Créer `Base de donnée DLL et API/migration_tourinsoft_reunion_serializer.sql`
- Créer `Base de donnée DLL et API/tests/test_tourinsoft_reunion_common.sql`
- Créer `Base de donnée DLL et API/tests/fixtures/tourinsoft_reunion_common.expected.json`

- [ ] Créer `api.get_object_tourinsoft(p_object_id text, p_variant text)` et sa forme batch.
- [ ] Faire déléguer `legacy-v1` au sérialiseur existant ; la nouvelle variante consomme la projection de la Tâche 3.
- [ ] Implémenter les groupes du tableau §2.1 dans l’ordre : identité, descriptions, localisation, communications, médias, taxonomies/classifications, langues/paiements/prestations, politiques/capacités, tarifs, ouvertures.
- [ ] Reproduire les noms, casse, types et cardinalités du contrat gelé ; ne pas aplatir une collection en un champ scalaire.
- [ ] Définir une règle unique pour les absences : clé scalaire omise, collection absente ou `[]` selon décision CRT ; ne jamais produire alternativement `null`, `""` et `[]`.
- [ ] Ajouter un test golden JSON par bloc et un test global de forme.
- [ ] Ajouter un test de parité : sortie unitaire = entrée correspondante de la sortie batch.

**Critère de sortie :** chaque ligne `approved` de la matrice commune est émise et testée ; aucune ligne `pending_crt`, `extension_pending` ou `excluded` ne l’est.

### Tâche 5 — Ajouter la profondeur hébergement

**Fichiers :**

- Créer `Base de donnée DLL et API/migration_tourinsoft_reunion_accommodation.sql`
- Créer `Base de donnée DLL et API/tests/test_tourinsoft_reunion_accommodation.sql`
- Créer trois fixtures synthétiques : `HOT`, `HLO` et `CAMP`

- [ ] Couvrir les catégories et sous-catégories HLO par taxonomie leaf-aware.
- [ ] Couvrir capacités générales et camping sans confondre unités, chambres, emplacements et personnes.
- [ ] Couvrir unités/chambres/lits/amenities/médias de chambre lorsque leur cible CRT est approuvée.
- [ ] Couvrir classement, labels, positionnements hôteliers et chaîne uniquement par référentiels validés.
- [ ] Couvrir arrivée/départ, animaux, groupe, durée de séjour, réservation et salles de réunion.
- [ ] Pinner les différences HOT/HLO/CAMP et l’absence propre des blocs non applicables.

**Critère de sortie :** les trois fixtures passent le validateur de contrat et chaque collection est ordonnée/dédupliquée.

### Tâche 6 — Traiter les vrais manques de modèle, et eux seuls

**Fichiers conditionnels :**

- Créer une migration de schéma nommée par manque confirmé
- Modifier les RPC de lecture/écriture de la facette concernée
- Modifier `dbdoc/`, `db-graph-out/` via leurs générateurs

- [ ] Exécuter pour chaque `source_missing` une recherche dans le graphe DB, les référentiels et les facettes applicables.
- [ ] Documenter si le manque est réel, dérivable, auxiliaire ou seulement un crosswalk absent.
- [ ] Pour un manque réel confirmé, ajouter le modèle minimal avec FK/référentiel, contraintes, RLS, lecture, écriture, staging/import et tests ; ne pas ajouter une colonne JSON « fourre-tout ».
- [ ] Régénérer le graphe DB après chaque modification de schéma.

**Critère de sortie :** aucune propriété auxiliaire Tourinsoft n’a provoqué une extension inutile de Bertel ; chaque DDL additionnelle pointe vers une décision CRT.

### Tâche 7 — Brancher la variante sur le détail et la liste partenaires

**Fichiers :**

- Modifier `bertel-tourism-ui/src/app/api/public/objects/[id]/route.ts`
- Modifier `bertel-tourism-ui/src/app/api/public/objects/[id]/route.test.ts`
- Modifier `bertel-tourism-ui/src/app/api/public/objects/route.ts`
- Modifier `bertel-tourism-ui/src/app/api/public/objects/route.test.ts`

- [ ] Accepter `variant` uniquement lorsque `format=tourinsoft`.
- [ ] Sans variante, conserver les RPC et le payload actuels.
- [ ] Avec `reunion-hebergement-v1`, appeler `get_object_tourinsoft` ou `get_objects_tourinsoft_batch` et fusionner le résultat sous `tourinsoft`.
- [ ] Garder le comportement best-effort de la liste : une fiche hors périmètre n’a pas de bloc Tourinsoft ; un échec global est journalisé et ne corrompt pas la page Bertel.
- [ ] Tester le détail, la liste, `view=card`, `view=full`, page de 200, variante inconnue et combinaison invalide format/variant.
- [ ] Ajouter la variante aux allowlists RPC serveur, jamais au client navigateur.

**Critère de sortie :** le même objet renvoie le même document Tourinsoft par le détail et la liste.

### Tâche 8 — Tests de confidentialité, conformité et performance

**Fichiers :**

- Créer `Base de donnée DLL et API/tests/test_tourinsoft_reunion_security.sql`
- Créer `Base de donnée DLL et API/tests/test_tourinsoft_reunion_batch.sql`
- Créer `tools/tourinsoft/compare-payload.mjs`
- Modifier le workflow SQL fresh apply

- [ ] Construire des fixtures synthétiques avec valeurs publiques et privées concurrentes, média expiré, valeurs multiples, référentiel non mappé et objet non publié.
- [ ] Prouver l’absence des contacts privés, descriptions privées, CRM, notes, légal non approuvé et médias non publiables.
- [ ] Prouver le comportement `NULL`/absence pour id inconnu, objet non publié, type hors contrat et variante inconnue.
- [ ] Prouver l’ordre déterministe en insérant les fixtures dans un ordre différent.
- [ ] Prouver que toute valeur sans crosswalk apparaît dans un rapport de couverture et n’est pas remplacée silencieusement par son libellé Bertel.
- [ ] Comparer le payload à `source-schema.json` et aux golden files.
- [ ] Mesurer `EXPLAIN (ANALYZE, BUFFERS)` sur HOT/HLO/CAMP et sur 200 objets.
- [ ] Budget initial : p95 unitaire < 150 ms, lot de 200 < 2 s hors réseau, aucune croissance linéaire due à 200 appels imbriqués. Ajuster le plafond de page seulement sur mesure documentée.
- [ ] Lancer les advisors Supabase après les DDL et traiter toute nouvelle alerte sécurité/performance.

**Critère de sortie :** CI verte, aucun leak, contrat exact et budget batch respecté.

### Tâche 9 — Mettre à jour le contrat partenaire

**Fichiers :**

- Modifier `docs/openapi.json`
- Modifier `docs/guide-partenaires.md`
- Modifier `docs/Bertel_API_v3.postman_collection.json`
- Modifier `docs/README_Postman.md`
- Créer `docs/api-audit/2026-07-30-tourinsoft-reunion-v1.md`
- Modifier `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md`

- [ ] Ajouter le paramètre `variant` et ses règles de compatibilité à l’OpenAPI.
- [ ] Remplacer la description « socle cœur » par deux schémas distincts : legacy et Réunion hébergement.
- [ ] Documenter chaque collection, cardinalité, type, absence et règle de confidentialité.
- [ ] Ajouter des requêtes Postman détail et liste avec la variante.
- [ ] Documenter le cycle de synchronisation : export publié, curseur de liste, contrôle des mises à jour et réutilisation du flux existant `/objects/deletions` pour les suppressions définitives.
- [ ] Préciser qu’une dépublication reste détectée par réconciliation du corpus tant qu’un vrai delta de dépublication n’est pas exposé.
- [ ] Valider les JSON, `$ref`, rendu Markdown et collection Postman dans le CI.

**Critère de sortie :** OpenAPI, guide, Postman, journal de livraison et implémentation décrivent le même contrat.

### Tâche 10 — Pilote CRT, promotion et repli

- [ ] Déployer la variante inactive par défaut.
- [ ] Produire un rapport de couverture sur le corpus publié : objets couverts, taux de remplissage par champ, valeurs sans crosswalk, objets rejetés et taille moyenne/p95 des payloads.
- [ ] Faire valider par le CRT un échantillon représentatif HOT/HLO/CAMP, comprenant les cas riches et les champs vides.
- [ ] Exécuter un export miroir sans écriture CRT ; comparer ids, types, cardinalités et codes.
- [ ] Si un bac à sable d’import est fourni, tester création, mise à jour, idempotence, rejet d’un code inconnu, dépublication et média.
- [ ] Corriger uniquement par nouvelle révision de contrat (`reunion-hebergement-v1.1` ou `v2`) si la modification est cassante ; ne pas changer silencieusement une variante publiée.
- [ ] Promouvoir la variante par défaut uniquement après validation CRT, couverture minimale convenue, budget de performance vert et plan de communication partenaire.
- [ ] Repli : repasser le défaut à `legacy-v1` sans rollback DDL ni perte de référentiels.

**Critère de sortie :** validation CRT écrite, rapport de couverture archivé, monitoring actif et repli testé.

### Tâche 11 — Étendre aux autres bordereaux

Pour `RES`, `ASC/ACT/LOI`, `ITI`, `FMA`, `PCU/PNA/PRD`, `COM/PSV/SPU/VIL/ORG` :

- [ ] obtenir un flux ou bordereau CRT représentatif ;
- [ ] créer un inventaire et une matrice spécifiques ;
- [ ] réutiliser les blocs communs et ajouter seulement la facette métier nécessaire ;
- [ ] ajouter une variante/version de contrat et des fixtures propres au type ;
- [ ] répéter recette, couverture, performance et pilote.

Cette tâche n’est pas un prérequis à la livraison hébergement, mais elle est requise avant de qualifier l’export Tourinsoft de « complet tous bordereaux ».

---

## 4. Ordre de livraison recommandé

1. **Contrat et preuves** : Tâches 0–1.
2. **Socle technique** : Tâches 2–3.
3. **Couverture utile** : Tâches 4–5.
4. **Manques réels seulement** : Tâche 6.
5. **Exposition et durcissement** : Tâches 7–8.
6. **Documentation et pilote** : Tâches 9–10.
7. **Autres bordereaux** : Tâche 11, par lots indépendants.

Les Tâches 2–5 peuvent avancer avec les lignes `approved` sans attendre la réponse à toutes les questions CRT. En revanche, aucune ligne `pending_crt` ne doit être émise, et la promotion en production reste bloquée par la validation du contrat d’import.

---

## 5. Définition de « terminé »

L’export hébergement est terminé lorsque :

- 100 % des champs du flux fourni sont classés ;
- 100 % des champs métier `approved` sont couverts par un test et un mapping ;
- les propriétés auxiliaires sont explicitement exclues ;
- les valeurs sans crosswalk sont à zéro sur le corpus pilote, ou acceptées comme dette documentée par le CRT ;
- le détail et le batch sont identiques ;
- `legacy-v1`, DATAtourisme et APIDAE ne régressent pas ;
- les tests de confidentialité et le budget de performance passent ;
- le CRT a validé la forme d’import et un échantillon représentatif ;
- OpenAPI, guide et Postman sont synchronisés ;
- le repli vers `legacy-v1` est testé.

## 6. Hors périmètre de ce plan

- Écriture effective dans Tourinsoft, tant que l’API d’import et les habilitations CRT ne sont pas fournies.
- Synchronisation Tourinsoft→Bertel.
- Résolution automatique de conflits bidirectionnels.
- Invention de mappings pour les bordereaux non observés.
- Exposition de données privées, CRM ou légales non approuvées.
