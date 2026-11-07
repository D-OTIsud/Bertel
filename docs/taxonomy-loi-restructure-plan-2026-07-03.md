# Plan de restructuration `taxonomy_loi` (§30) — 2026-07-03

**Statut : PLAN À VALIDER — aucune exécution.** Ce document est un artefact de revue.
Rien n'est appliqué en base tant que l'OTI n'a pas tranché les points marqués **[DÉCISION OTI]**.

## 1. Contexte

Le picker « sous-catégorie » de l'éditeur (§01) affiche, pour les fiches de type `LOI`,
un niveau 1 fourre-tout : « Patrimoine culturel / naturel / agricole », « Terre »,
« Terroir »… — des catégories qui ne parlent pas de *loisir* et qui sont, pour certaines,
des concepts d'autres types (patrimoine = PCU, terroir = COM). C'est le point §30 du
`docs/research/type-gap-analysis-2026-06-11.md` (« assainissement de `taxonomy_loi` »).

**§30 est déjà à moitié fait.** La migration `13d` (`migration_loi_prd_cleanup_retype.sql`,
§57) a **re-typé 43 objets hors de LOI** : 34 → PRD (agro), 2 → PCU (Musée, dont La Cité du
Volcan — tue le doublon de concept « Musée » LOI/PCU), 5 → COM (Boutique/Souvenirs), 1 → SPU
(Médiathèque). La grosse « SORTIE » a donc eu lieu.

**Ce qui reste** se scinde en deux niveaux de risque très différents :
- **C1 — restructure d'arbre (mécanique, sûr)** : réorganiser les nœuds en branches propres.
  Les objets **restent LOI**, ils changent juste de catégorie parente. Corrige le jumble visible.
- **C2 — re-typage de fiches (éditorial)** : une poignée de fiches LOI qui relèvent en réalité
  d'un autre type. Ça re-catégorise des établissements **souvent publiés** → décision OTI, fiche
  par fiche.

## 2. Arbre actuel `taxonomy_loi` (post-13d, live 2026-07-03)

Niveau 1 = enfants de la racine technique. `[n]` = nombre d'objets tagués.

```
Loisir (racine, non sélectionnable)
├─ Bien-être                          [0]  ├─ Spa / hammam [0]
│                                          ├─ Institut / massage [0]
│                                          └─ Thalasso / thermes [0]
├─ Centre de congrès / réception      [0]  (MICE)
├─ Art                                [0]  (vide)
├─ Artisanat                          [1]  ├─ Art & Artisanat [50]
│                                          ├─ Artisanat bijoux [6]
│                                          ├─ Atelier cuisine [1]
│                                          ├─ Atelier poterie et céramique [1]
│                                          └─ Chocolatier [1, archivé]
├─ Divertissement                     [0]  ├─ Atelier [5]
│                                          ├─ Dessin [1]
│                                          ├─ Paintball [2]
│                                          ├─ Théâtre ou salle de spectacle [3]
│                                          └─ V.T.T. - Autres cycles [1]
├─ Patrimoine agricole                [0]  └─ Visite guidée [16]
├─ Patrimoine culturel                [0]  └─ Restauration traditionnelle [1]
├─ Patrimoine naturel                 [0]  ├─ Horticulture [1]
│                                          ├─ Randonnée pédestre [2]
│                                          └─ Spéléologie / tunnels de lave [1]
├─ Terre                              [1]  ├─ Centre d'équitation [1]
│                                          ├─ Guide accompagnateur touristique [1]
│                                          └─ Parc - jardin [2]
└─ Terroir                            [1]  (vide de sous-nœuds)
```

Total ≈ 110 assignations, majorité en `LOI`, dont plusieurs **publiées**.

## 3. C1 — Restructure d'arbre (mécanique, objets restent LOI)

Cible §30 : **Bien-être / Parcs & jardins / Parcs à thème & animaliers / Divertissement /
Artisanat & ateliers**, plus le **Centre de congrès** existant (MICE). Aucun objet ne change
de type ; on renomme, fusionne et re-parente des nœuds `ref_code`. Les tags `object_taxonomy`
suivent leur nœud (pas de re-typage).

| Nœud cible (niveau 1) | Contenu (nœuds re-parentés) | Opération |
|---|---|---|
| **Artisanat & ateliers** | Art & Artisanat (50), Artisanat bijoux (6), Atelier (5), Atelier cuisine (1), Atelier poterie et céramique (1), Dessin (1), Chocolatier (1) | Promouvoir `artisanat` en branche, y fusionner `art` (vide), y déplacer `atelier`+`dessin` (aujourd'hui sous Divertissement — ce sont des ateliers) |
| **Divertissement** | Paintball (2), Théâtre / spectacle (3), V.T.T. (1) | Conserver ; sortir atelier/dessin |
| **Parcs & jardins** | Parc - jardin (2), Horticulture (1) | Renommer `terre`→« Parcs & jardins » ; y déplacer `horticulture` (sous Patrimoine naturel) |
| **Bien-être** | Spa, Institut/massage, Thermes | Déjà propre — inchangé |
| **Centre de congrès / réception** | — | Conserver (MICE) |
| **Parcs à thème & animaliers** | — | **[DÉCISION OTI]** créer la branche vide (forward-looking) ou l'omettre tant qu'aucune fiche n'existe |

**Nœuds dissous** (wrappers vides ou mal nommés, 0 objet propre après relocalisation) :
`art`, `patrimoine_agricole`, `patrimoine_culturel`, `patrimoine_naturel`, `terre` (→ renommé
Parcs & jardins), `terroir`. Dissolution conditionnée à la relocalisation/re-typage de leurs
enfants (§4).

## 4. C2 — Candidats au re-typage (éditorial — [DÉCISION OTI] fiche par fiche)

Ces nœuds portent des objets qui ressemblent à un **autre type** que LOI. Rien n'est fait
sans validation. Défaut proposé = piste, pas une décision.

| # | Fiche | Statut | Nœud LOI actuel | Type proposé | Raison |
|---|---|---|---|---|---|
| 1 | Papilles des Hauts | draft | Terroir | **COM** | Boutique terroir — §30 explicite (boutique/terroir → COM) |
| 2 | Association Tradition et Passions | draft | Restauration traditionnelle | **[?]** | Une association « tradition » — ni restaurant ni loisir marchand évident ; garder LOI ? PCU ? |
| 3 | Les Crins de Bel Air | draft | Centre d'équitation | **ASC** | Prestation encadrée équestre = activité, pas un site de loisir |
| 4 | Ti Karé Dan Péi | draft | Guide accompagnateur | **ASC / PSV** | Guide = opérateur d'activité ; PSV si prestataire pur |
| 5 | Ricaric | draft | Spéléologie / tunnels de lave | **ASC** | Activité encadrée de pleine nature |
| 6 | Découvertes en Terres Signées | draft | Randonnée pédestre | **ASC** | Rando encadrée = activité |
| 7 | AGENCE AVENTURE LA REUNION | **published** | Randonnée pédestre | **ASC** | Agence d'aventure = opérateur d'activités |
| 8 | Bouillon d'Aventure | draft | Terre (nœud branche) | **ASC** | Nom = activité aventure ; tag sur un nœud vague |
| 9–24 | 16 fiches « Visite guidée » | 8 publiées / 8 draft | Visite guidée | **PRD ou ASC/PSV, à répartir** | Mélange : visites de producteurs (Maison du Curcuma, Escale Bleue – Atelier Vanille, Le Jardin Créole, Domaine Archambaud…) → **PRD** ; guides/tour-opérateurs (Insel Tours, Alexandre Dijoux – Guide Conférencier, Au Cœur de La Réunion…) → **ASC/PSV** ; jardins-visite (Le Jardin des Bestioles) → rester LOI/Parcs & jardins |

**Liste complète des 16 « Visite guidée »** (pour l'arbitrage) : Le Jardin des Bestioles (pub),
Naturev (pub), Entre Deux Z'Epok (pub), Domaine Archambaud (draft), Maison du Curcuma (pub),
Le Jardin Créole (pub), Entre 2 Songes (pub), Enis Rockel (draft), Escale Bleue – Atelier
Vanille (pub), Au Cœur de La Réunion (pub), Insel Tours (draft), Association Entre-Deux Culture
et Traditions (draft), Dalon La Kour (pub), Alexandre Dijoux – Guide Conférencier (draft), Rando
Péizaj 974 (draft), La forêt de nuages (draft).

**Observation transverse :** beaucoup de fiches LOI « pleine nature » (rando, spéléo, équitation,
guides, agences d'aventure) sont en réalité des **activités encadrées (ASC/ACT)**, pas des
*sites* de loisir. Si l'OTI confirme, C2 est un vrai passage LOI→ASC de masse, pas juste 2-3
fiches. Alternative : si l'OTI veut garder ces fiches en LOI, il faut une branche
**« Activités de pleine nature »** dans `taxonomy_loi` (rando/spéléo/équitation) plutôt que de
les éclater sous Patrimoine naturel/Terre.

## 5. Contraintes d'exécution (leçons de 13d)

Quand C1/C2 seront validés, la migration devra respecter :

1. **Ordre forcé par `validate_object_taxonomy_assignment`** (13d, erreur 23514) : le domaine
   d'une assignation doit matcher le type **courant** de l'objet. Un re-typage se fait en UNE
   transaction : `capture → DELETE anciens liens → UPDATE object.type → INSERT nouveaux liens
   sous le nouveau domaine`. Jamais un cross-UPDATE de `object_taxonomy`.
2. **Nœuds vidés supprimés derrière une garde** « 0 assignation ET 0 enfant » (précédent 13d).
3. **Caches** : `api.refresh_object_taxonomy_cache_for_domain(...)` par domaine touché +
   `api.refresh_object_filter_caches` par objet re-typé + refresh `mv_filtered_objects`
   CONCURRENTLY après coup (13d).
4. **Idempotence + parité source** : la migration doit être idempotente ; les changements de
   nœuds `ref_code` doivent aussi être répercutés dans `migration_taxonomy_trees_seed.sql`
   (le snapshot `taxo` qui tourne en dernier) pour qu'un build frais converge — sinon le seed
   re-crée l'ancien arbre. C'est le même piège que la hygiène A/B du 2026-07-03 (`13e`).
5. **Fresh-apply** : couvert par `tests/test_reference_catalog.sql` (assertions de hiérarchie).

## 6. Décisions attendues de l'OTI avant exécution

- **[D1]** Valider l'arbre cible C1 (§3) — branches et regroupements.
- **[D2]** Créer ou non la branche « Parcs à thème & animaliers » (aucune fiche aujourd'hui).
- **[D3]** Trancher chaque candidat C2 (§4) : rester LOI (+ nouvelle branche « Activités de
  pleine nature » ?) ou re-typer (COM/PRD/ASC/PSV).
- **[D4]** Répartir les 16 « Visite guidée » : PRD (producteurs) vs ASC/PSV (guides) vs LOI
  (jardins-visite).
- **[D5]** « Association Tradition et Passions » : LOI, PCU, ou autre ?

Une fois D1–D5 tranchés, je produis **une** migration idempotente (C1 mécanique + C2 re-typages
validés) + l'édition du seed `taxo` + entrée runbook, appliquée en transaction sur live avec
vérification avant/après (même protocole que la hygiène 13e).
```
