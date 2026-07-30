# Restes de la réunion « Point V3 BERTEL » (17/07) — plan d'exécution

**Date du plan** : 2026-07-30 · **Source** : notes Gemini de la réunion du 17/07/2026 (Mélodie
Lallement, Émilie Morel, Noémie Chevalier, Cloé Metro, David Philippe) + PDF « Anomalies bertel »
partagé en séance. Bilan complet des points déjà livrés : voir le récapitulatif du 30/07 — environ
deux tiers des ~35 points sont en production (§194→§205 du journal de décisions).

Ce document ne couvre que **ce qui reste** : les quick wins exécutés ce jour, ce qui est prêt et
n'attend qu'un GO, et les chantiers qui demandent encore travail et réflexion.

---

## 1 · Quick wins exécutés le 30/07 (cette passe)

### 1a. Retrait du « Classement auberge collective » — FAIT

Décision de réunion (01:22:34) : une auberge collective n'est pas classable en étoiles (catégorie
déclarée du Code du tourisme, pas de référentiel Atout France — même logique que les chambres
d'hôtes). Le schéma `auberge_collective_stars` avait été créé par excès de zèle lors de
l'expansion §71.

- Vérifié avant retrait : **0 attribution** (`object_classification`), 0 template d'audit,
  0 équivalence ; seulement les 5 valeurs d'étoiles et la ligne d'applicabilité (HLO/RVA).
- Retrait fait **dans le catalogue** (invariant §196) : `seeds_data.sql` +
  `migration_classification_labels_expansion.sql` (source 14d, corrigée en place) +
  `migration_classification_scheme_applicability.sql` (registre 16n) n'insèrent plus le schéma ;
  nouvelle migration **16s** `migration_remove_auberge_collective_scheme.sql` converge le live
  (garde fail-closed : refuse si une attribution existe).
- Test CI `test_classification_labels_expansion.sql` inversé : il **exige l'absence** du schéma
  (4 classements attendus, plus 5). Découverte au passage : ce test était **orphelin** (jamais
  enrôlé dans le manifeste CI) et portait une dérive invisible depuis §176 (`logis` déplacé vers
  `graded_label`) — corrigé et enrôlé (16s-test).
- Aucun code frontend ne référence le schéma (vérifié) — tout est piloté par le catalogue.
  Le cache de session des catalogues (1 h) se purge tout seul.

### 1b. Harmonisation mécanique des lieux-dits — FAIT (partie sans arbitrage)

Constat mesuré : 80 valeurs distinctes sur 649 lignes `object_location.lieu_dit`. Fusions
**mécaniques** (casse, tirets, accents, coquille avérée) appliquées sur live — la partie qui ne
demande aucun arbitrage :

| Avant (nb) | Après |
|---|---|
| bourg murat (3) | Bourg-Murat |
| centre ville (22), Centre-ville (1) | Centre-ville |
| dassy (2) | Dassy |
| Grand fond intérieur (5) | Grand Fond Intérieur |
| Le Temblet (1) | Le Tremblet (coquille — le lieu-dit de Saint-Philippe s'écrit Tremblet) |
| ligne des 400 (2) | Ligne des 400 |
| Manapany-Les-Bains (37) | Manapany-les-Bains (particule en minuscule) |
| Plaine des Cafres (2) | La Plaine des Cafres (forme dominante, 128) |
| Plaine des Gregues (1), Plaine des Grègues (1) | La Plaine des Grègues (forme dominante, 8) |
| piton hyacinthe (2) | Piton Hyacinthe |
| Saint Joseph (8) | Saint-Joseph |
| Saint Philippe (8) | Saint-Philippe |
| Trois-Mares (1) | Trois Mares (forme dominante, 28) |
| La cayenne (1) | La Cayenne |
| sud sauvage (1) | Sud Sauvage |
| Berive (2) | Bérive (accent) |

Impact recherche : nul pour casse/accents/tirets (le tsvector normalise) ; la ligne « Temblet »
corrigée gardera son ancien jeton dans `search_document` jusqu'au prochain rafraîchissement naturel
(assumé — pas de refresh forcé, cf. gotcha §197 sur le bump `updated_at`).

**Arbitrages restants (OTI / PO)** — non touchés, à trancher avec Mélodie :

| Valeurs en base | Question |
|---|---|
| Baril (9) · Le Baril (4) · Baril les Hauts (4) | Même lieu-dit avec/sans article ? « les Hauts » distinct ? |
| Mare-Longue (4) · Forêt de Mare Longue (2) | Le PDF demandait « forêt OU mare longue » — fusionner vers quoi ? |
| Ravine Citrons (4) · Ravine des Citrons (18) | Même ravine ? (le « des » est une vraie différence toponymique) |
| 10e (1) · PK11 (1) · PK12/14/17/19/23 | « PK11 ou 10è » (PDF) : quel système retenir ? |
| Tampon (18) | Un lieu-dit « Tampon » dans la commune du Tampon est-il une info ? |
| Centre-ville (23) | Générique multi-communes — acceptable ou à préfixer ? |

⚠️ La synchro Berta (§168) peut réintroduire des variantes à l'import — si les fusions deviennent
récurrentes, normaliser à l'entrée du mapping d'import (pas de garde posée aujourd'hui).

---

## 2 · Prêt — n'attend qu'un GO du PO

### Purge des tags de l'import 20260512 (§203) — « bord de mer », « cadre & environnement »

Tout est écrit, commité, testé et **au manifeste CI** (16p + 16q + garde `test_tags_purge_catalog`) ;
seul le live attend. Contenu : sauvegarde puis purge des **4 529** liens `tag_link` de l'import
fautif (les 6 saisies éditeur sont préservées), catalogue réduit aux tags conformes à la doctrine,
ré-application par règles mesurées de 3 tags (Vue mer, Cuisine au feu de bois, Case créole —
~146 liens attendus). Réversible lien par lien (`extra.source` + `extra.rule`).

**Procédure de GO** : appliquer `migration_tags_purge_import_20260512.sql` puis
`migration_tags_curated_seed.sql` sur la prod, rejouer `tests/test_tags_purge_catalog.sql`,
vérifier les comptes (liens ≈ 152, catalogue = 5).

**Décision produit à rendre AVANT le GO** : l'essentiel `e_tags` du filtre Remplissage (§204)
compte « au moins un tag ». La purge videra les tags de la quasi-totalité des fiches ⇒ « N
manquants » montera mécaniquement partout et le Dashboard Qualité bougera. Deux options :
**(a)** assumer — les tags deviennent une vraie tâche éditoriale à mener fiche par fiche ;
**(b)** retirer `tags` du bundle des 8 essentiels en même temps que la purge (édition de
`internal.v_object_essentials`). Trancher explicitement, sinon l'équipe verra ses chiffres
de remplissage chuter sans explication.

Le même import a pollué « Cadre & environnement » (jumeau malade, §203) — couvert par la même purge.

---

## 3 · Chantiers — travail et réflexion nécessaires

### 3a. CRM : requêtes, tâches et statistiques (le bloc le plus attendu par l'équipe)

Demandes de la réunion (01:04→01:14, 01:26→01:37) :
1. afficher les **tâches dans la section requêtes** (aujourd'hui deux onglets disjoints) ;
2. statut de tâche « **en attente** » + séparation visuelle actives/en attente dans la vue chrono ;
3. bug d'affichage : des requêtes traitées sur l'ancien Bertel apparaissent « en attente »
   (ex. Zèbre à carreaux — vérifier le mapping de statut à l'import des interactions) ;
4. filtre annuaire « prestataires **avec/sans établissement** » (workflow porteurs de projet) ;
5. **statistiques d'interactions** auto (remplacement du tableau de bord Excel — chiffres mensuels
   par canal/commune) — dépend du tableau Excel que Mélodie doit transmettre ;
6. rubriques d'interaction ajoutables au besoin (le domaine `demand_topic` est administrable via
   /settings §119 — vérifier que ça couvre le besoin, sinon c'est un trou).

Approche : une passe spec → maquette (maquette d'abord, préférence PO) → plan, en réutilisant le
kanban §63 et `list_crm_directory`. Le point 2 touche le vocabulaire de statut des tâches (à ce
jour codé en dur côté UI — différé §61) : c'est l'occasion de le normaliser. Taille : plusieurs
jours, SQL + UI. Ne pas découper le point 3 du reste : c'est le même écran.

### 3b. Réconciliation d'import Berta (les « trous » vus par l'équipe)

Constats du PDF, tous vérifiés encore ouverts : réseaux sociaux non transférés, photos manquantes
(fiches hébergeur), **écart d'environ 62 prestataires**, 5 fiches structures manquantes (2 HLO,
3 RES) dont « Réunion Boutik », prestataires récents absents (Christopher Clavier, Patrick L.),
requêtes récentes non migrées, horaires/plan d'accès/moyens de paiement absents sur certaines
fiches (« Allon Manger »). Et le constat SIRET mesuré ce jour : **1 seul SIRET et 1 seul SIREN en
base** (17 types de documents légaux, tous les autres à 0) — l'identité juridique n'a jamais été
importée ; le badge « SIRET manquant » est honnête, il n'y a pas de bug d'affichage.

Approche : repartir du cadre §85/§168 (Google Sheet = source de vérité, mapping par
`object_origin.source_object_id`) et produire d'abord un **rapport d'écart chiffré** (qui manque,
pourquoi, quelle donnée source existe), puis des lots d'import ciblés (réseaux sociaux →
`object_web_channel` ; SIRET → `object_legal` ; photos → pipeline média single-writer §59 —
attention : l'upload passe par la route unique, pas d'insert direct). Chaque lot = dry-run +
comptage avant/après + respect du bump `updated_at` (signal partenaires). Les requêtes legacy →
`crm_interaction` (ancrage acteur, §61). Taille : le plus gros chantier de la liste ; commencer
par le rapport d'écart, qui est lui-même livrable à l'équipe.

### 3c. Recherche d'établissements par téléphone / e-mail (Explorer)

Couvert côté acteurs (§195, annuaire CRM). Côté établissements, `contact_channel` n'alimente pas
`search_document` — chercher un numéro dans l'Explorer ne trouve rien. Réflexion nécessaire avant
de foncer : ajouter des téléphones/e-mails au tsvector expose ces valeurs dans
`search_document_text` (porté par des vues/exports — vérifier qui le lit : PII dans un document de
recherche largement lisible). Alternative plus sûre : un bras dédié dans `get_filtered_object_ids`
qui matche `contact_channel.value` normalisé (chiffres des deux côtés, recette §195) **sans
l'indexer dans le document**, seulement pour les éditeurs. Backfill : aucun (pas de colonne
nouvelle) — c'est un prédicat. Taille : petite passe SQL + test, mais l'arbitrage PII d'abord.

### 3d. Libellés et infobulles des chips de filtres

Demande réunion (01:56:33) : clarifier les sélections multiples. Aujourd'hui les chips
« compteur » (Cadre · 3 critères, Services · 2…) n'énumèrent pas leur contenu — le builder
`buildExplorerActiveChips` est pur et n'a pas les catalogues. Rejoint le différé §58
(`resolveChipLabel(catalogues)`) : injecter un résolveur de libellés optionnel dans le builder,
et poser `title` (énumération résolue) sur chaque chip + sur les groupes du panneau. Jamais de
code brut à l'écran (règle maison). Taille : demi-journée frontend, zéro SQL.

### 3e. Lexique / définitions contextuelles (i)

Demande récurrente de la réunion (« groupe », « dégagement suffisant », capacités…). Le centre
d'aide couvre le vocabulaire de haut niveau (aligné taxonomie v2), mais pas le mot-à-mot des
champs de l'éditeur. Deux morceaux : **(1)** une primitive `InfoDot` (icône i + popover) posable
sur un libellé de champ ; **(2)** le **contenu** — les définitions doivent venir de l'équipe
(ex. « groupe = à partir de 10 personnes » dixit Mélodie) : demander à l'OTI une liste
terme → définition, la stocker dans un module de contenu (pas en dur dans les composants).
Commencer par les 10 termes cités en réunion. Taille : primitive = petite ; contenu = dépend de
l'OTI.

### 3f. Impression : page blanche depuis l'aperçu

Le plafonnement à 50 fiches (28/07) traite le plantage par volume côté sélection. Le bug PDF
« page blanche quand on clique imprimer depuis l'aperçu » reste à reproduire : suspecter le CSS
d'impression (le tiroir en overlay est probablement masqué à l'impression, il ne reste rien à
imprimer). Piste : soit un stylesheet `@media print` dédié au tiroir, soit rediriger le bouton
vers l'impression Carnet des Listes (§134-148) qui, elle, fonctionne. À reproduire d'abord —
time-boxer une demi-journée.

### 3g. Import des documents / photos depuis l'ancien outil (Drive)

Annoncé difficile en réunion (38:04) ; l'équipe met à jour à la main en attendant. À traiter
après 3b (même infrastructure de rapprochement) et via le pipeline média unique (§59) pour les
photos ; les documents iront dans les sections propriétaires (vision PO §59, différé existant).
Ne rien promettre de daté tant que 3b n'a pas chiffré ce qui est récupérable.

---

## 4 · Hors code — actions à la main du PO

| Action | Note |
|---|---|
| Comptes Tourisoft pour l'équipe | Contact externe à joindre |
| Partager la liste des types de documents (canal Meet) | La liste vit dans `ref_legal_type` (17 types) |
| Analyser la pertinence des licences hébergement/restaurant | Types `accommodation_license` / `business_license` déjà en base, 0 usage |
| Intégrer la liste officielle des documents taxe de séjour | Seed à écrire quand la liste est fournie |
| Tableau Excel des interactions (Mélodie) | Préalable au chantier stats 3a.5 |

Réglés par explication en séance (aucun développement) : mode hors-connexion (préchargement),
« canonique » (superposition par ORG sans écrasement), adresses des ambulants/guides (lieu
d'exercice ≠ adresse de l'entité, multi-lieux possible §16).
