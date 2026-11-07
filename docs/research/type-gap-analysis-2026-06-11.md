# Analyse des manques typologiques — 2026-06-11

> Question : « Y a-t-il des types d'objets touristiques auxquels on n'a pas pensé ? »
> Méthode : 4 analyses indépendantes (référentiel **Apidae** — 16 types officiels vérifiés sur la doc technique ; ontologie **DATAtourisme** — classes vérifiées sur framagit/ontology ; **offre réelle CASUD** — sudreuniontourisme.fr/IRT/ONF/presse ; **modèles internationaux** — schema.org/OTA/destinations comparables), puis verdict adversarial d'un juge-architecte appliquant les principes CLAUDE.md (nouveau type ⇔ sémantique distincte + besoins de données distincts + offre réelle ; sinon nœud de taxonomie). Run `wf_632b7a60-826` ; 24 manques candidats → 21 concepts dédupliqués. **STATUT : analyse — arbitrages product owner en attente.**

## Réponse courte

La typologie (18 types) tient très bien la comparaison : **un seul vrai type manquant** (PRD « Producteur »), un **manque transverse de taxonomies** (8 types sans aucun nœud), et une **famille SPU à élargir**. Tout le reste = nœuds de taxonomie, seeds, ou refus motivés.

## Priorité HAUTE

| Concept | Verdict | Détail |
|---|---|---|
| **Producteur / agritourisme / dégustation** | **NOUVEAU TYPE `PRD`** (seul de l'analyse) | Aujourd'hui éclaté SANS règle d'arbitrage entre 4 nœuds LOI (Agrotourisme, Plantation, Exploitation agricole, Produits du terroir), RES « Distillerie - sucrerie » et COM — l'OTI a même inventé une catégorie maison « Patrimoine agricole » sur son site. Offre identitaire dense : thé de Grand Coude, vanille de Saint-Philippe (Escale Bleue, Vanille 100% Réunion), curcuma de la Plaine des Grègues, miel de la Plaine des Cafres, palmiste, géranium. Apidae y consacre un type entier (DEGUSTATION « Producteur »), DATAtourisme a TastingProvider. Conditions : migrer les 4 nœuds agro de LOI → PRD, recoder la distillerie RES, documenter l'arbitrage (production+accueil→PRD / repas→RES / revente seule→COM / visite guidée→ACT), pas de facette au jour 1 (ajoutable plus tard via `ref_facet_registry`, 1 INSERT). |
| **Taxonomies vides (manque transverse)** | Seeds | Vérifié live : seuls 10 domaines de taxonomie existent — **PNA, FMA, HPA, ITI, VIL, PCU, ASC, RVA n'ont AUCUN nœud**, alors que l'import des 31 fiches candidates (§50) en dépend. Prioriser `taxonomy_pna` (plage, bassin de baignade, cascade, belvédère, forêt, site volcanique, littoral), puis FMA (dont « Événement sportif / trail ») et HPA (dont « Aire d'accueil camping-car »). |
| **Aire de pique-nique / kiosque** | Nœud sous **SPU** | Convergence 4/4 angles. ~300 aires / 236 kiosques ONF-Département à l'échelle île, marqueur culturel réunionnais, source géolocalisée importable. SPU est défini dans le code comme « équipement public autonome » — l'aire en est l'archétype. Besoins 100 % génériques (amenities tables/sanitaires/eau ; + éventuelle amenity « boucan/BBQ »). |
| **Bureau d'information touristique (BIT)** | Nœud sous **SPU** | Trou structurel : ORG n'est pas un POI (pas d'archétype éditeur), or l'OTI voudra cartographier ses propres bureaux — premier réflexe de tout adoptant white-label. Nœud SPU + `object_org_link [publisher]` vers l'ORG : invariant ORG-vs-lieu préservé. |
| **Plage / bassin de baignade** | Nœuds sous **PNA** (via le seed taxonomy_pna) | Le statut baignade (autorisée/interdite/surveillée — enjeu requin = responsabilité d'éditeur public) se porte en données de l'objet, pas en type. |

## Priorité MOYENNE

- **Marchés forains / couverts / brocantes** → nœuds **COM** avec horaires hebdo (le module horaires porte la récurrence nativement) ; **FMA réservé aux éditions datées** (marché de Noël, foire). ⚠ Règle d'arbitrage lieu-vs-événement à documenter au decision log AVANT l'import §50.
- **Équipements sport/loisir en accès libre** (piscine municipale, stade, skatepark, pumptrack, aire de jeux) → nœuds **SPU**, en assumant le libellé élargi « Services & équipements au public ». Règle unique : accès libre non marchand → SPU ; marchand → LOI.
- **Infrastructures transport/nautique** (parking touristique, gare routière, covoiturage, port de plaisance) → nœuds **SPU** (PSV couvre l'opérateur, jamais le lieu ; `object_capacity` a déjà les métriques véhicules). Survols volcan = déjà ACT.
- **Bien-être / spa / thermalisme** → branche **LOI** « Bien-être » (spa intégré à un hôtel = amenity du HOT, ne pas dupliquer ; soins réservables = ACT). New_type santé refusé.
- **MICE autonome** → 1 nœud LOI « Centre de congrès / salle de réception » + **1 INSERT `ref_facet_applicability` (object_meeting_room, LOI)** — cas nominal de la registry §46, déjà au backlog.
- **Territoires / « Sud Sauvage » / massifs** → **référentiel de regroupement de zones** (`ref_zone_group` : communes membres), pas un type — chaque territoire white-label définit ses regroupements en données. La moitié communale existe déjà (object_zone + ref_commune §41).
- **Route touristique scénique** (Route des Laves, route du Volcan) → **ITI** avec pratique routière dans `object_iti_practice` + nœud taxonomie.
- **Doublon « Musée » LOI vs PCU** → violation « une source de vérité » : PCU est canonique, retirer le nœud LOI et re-router les objets.
- **META — assainissement de `taxonomy_loi`** (34 nœuds fourre-tout) : branches de niveau 1 (Bien-être / Parcs & jardins / Parcs à thème & animaliers / Divertissement / Artisanat & ateliers) et SORTIE des nœuds agro (→PRD), Musée (→PCU), Boutique/terroir (→COM). Une seule passe de migration de taxonomie, conditionne les autres verdicts « nœud sous LOI ».

## Priorité BASSE (à seeder opportunistiquement)

Hébergement collectif résiduel (HLO « Gîte d'étape » couvre déjà les refuges réunionnais ; « Auberge de jeunesse »/« Centre de vacances » seulement si l'import en présente) · aires camping-car (nuitée → taxonomy_hpa ; services/vidange → SPU) · casino, zoo/aquarium, golf, agence réceptive (nœuds LOI/ASC/PSV).

## Refus motivés (ne PAS créer)

- **Séjour packagé** : même DATAtourisme n'a pas de classe package — objet e-commerce, pas POI de SIT ; le jour venu, rôle `part_of_package` dans `ref_object_relation_type`.
- **Coworking** : stock que l'OTI ne maintiendra pas (hors mission) ; nœud PSV créable le jour même si une stratégie digital-nomads émerge.
- **Webcam / panneau RIS / table d'orientation** : attributs/médias/amenities d'objets existants, jamais des objets racine.
- **Domaine skiable** : zéro offre, zéro adoptant ; la procédure « ajout d'un type » + la registry §46 rendent l'anticipation inutile.

## Confirmations (le modèle est isomorphe ou plus fin que les référentiels)

ORG/ACTOR vs « STRUCTURE » Apidae (évite le piège une-structure-par-prestataire) · ITI type+facette (Apidae bricole des critères sur EQUIPEMENT) · ASC/ACT structure-vs-prestation (Apidae confond) · lieux de culte (PCU + FMA pour les célébrations) · gîtes d'étape (HLO) · jardins (LOI) · belvédères (PNA) · trails récurrents (FMA). Échos actionnables à coût d'un seed : rôle de relation « sur_le_parcours_de » (PNA/PRD/HLO ↔ ITI), nœud « Événement sportif / trail » au seed FMA.

## Ordre d'exécution suggéré par le juge

1. **Seeds des taxonomies vides + nœuds SPU (pique-nique, BIT)** — débloque l'import §50.
2. **Passe PRD + assainissement LOI + règles d'arbitrage** au decision log.
3. Extensions SPU/LOI/MICE/groupes de zones au fil des besoins.

Hors PRD (1 valeur d'enum) et le référentiel de groupes de zones (1 table), **tout le reste s'encaisse en données** — c'est exactement la promesse white-label du modèle.
