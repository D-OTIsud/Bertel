# Audit live — Taxonomie des fiches d'hébergement existantes

Date de lecture : 2026-07-29 à 06:15 UTC / 10:15 RUN
Base : Supabase cloud Bertelv3, PostgreSQL 17.6
Mode : lecture seule, transactions BEGIN READ ONLY terminées par ROLLBACK
Périmètre : HOT, HLO, RVA, CAMP, HPA, puis recherche sémantique sur tous les types d'objet

## Conclusion

La structure des affectations est saine, mais l'audit métier n'est pas totalement vide :

- une fiche est certainement mal classée : Gîte Hydrangea 974 doit passer de Chambre d'hôtes à Refuge et gîte d'étape ;
- trois fiches portent encore Bulle, Lodge ou Insolite dans la taxonomie HLO : leur nature Chambre d'hôtes est une décision PO à conserver, tandis que l'unité doit être déplacée vers le nouvel axe Type d'unité ;
- quatre autres fiches décrivent explicitement une unité Lodge ou Cabane et doivent alimenter le nouvel axe sans changer de nature ;
- La Roulotte Géante propose réellement du bivouac en complément de son chalet et nécessite une décision sur la création éventuelle d'une fiche HPA Aire de bivouac séparée ;
- Le Verger de la Chapelle révèle un chevauchement entre Terrain de camping déclaré, Camping à la ferme et Camping chez l'habitant. Ces valeurs ne doivent pas rester trois natures sœurs sans règle supplémentaire.

Aucune écriture n'a été effectuée pendant cet audit.

## 1. Contrôles structurels

| Contrôle | Résultat live |
|---|---:|
| Hébergement sans taxonomie compatible avec son type | 0 |
| Affectation dont le domaine est incompatible avec object_type | 0 |
| Porteur d'un nœud inactif ou non assignable | 0 |
| Doublon object_id + domain | 0 |
| Ancêtre assignable absent de cached_taxonomy_codes | 0 |

Comptes publiés :

| Type | Fiches |
|---|---:|
| HOT | 8 |
| HLO | 476 |
| RVA | 0 |
| CAMP | 1 |
| HPA | 2 |

Trois HLO archivés possèdent également une taxonomie compatible.

Répartition collective HLO :

| Code actuel | Fiches publiées | Décision globale |
|---|---:|---|
| gite_de_groupe | 3 | conserver |
| gite_de_randonnee | 17 | conserver |
| auberge_collective | 0 | aucune reprise |

Les vingt descriptions ont été relues. Elles restent cohérentes avec les décisions PO du 24 juillet. Le nom Auberge de Grand Bassin ne suffit pas à en faire une Auberge collective : sa description et son fonctionnement de gîte de randonnée justifient le maintien dans Refuge et gîte d'étape.

Répartition plein air :

| Fiche | Affectation actuelle | Résultat de l'audit |
|---|---|---|
| Camping Pré-Vert Entre 2 Songes | CAMP / Camping | nature conservée ; Cabane à ajouter comme type d'unité |
| L'Eden du Randonneur (camping) | HPA / Camping chez l'habitant | nature conservée ; Cabane à ajouter comme type d'unité |
| Le Verger de la Chapelle | HPA / Camping chez l'habitant | décision à reprendre après clarification déclaré/ferme/habitant |

## 2. Recherche sémantique transversale

La recherche a été exécutée sur le nom, le chapo et la description canonique de tous les objets. Elle a recherché les anciens et nouveaux termes : collectif, résidence, terrain déclaré, ferme, habitant, PRL, bivouac, halte, camping-car, glamping, bulle, tipi, lodge et cabane.

Elle a produit 31 occurrences. Un mot-clé n'a jamais été traité comme une preuve.

Résultats importants :

- aucune occurrence pour Auberge collective, Résidence hôtelière, Village de vacances, Aire naturelle, Terrain de camping déclaré, PRL, Halte nocturne, Aire d'accueil camping-car, Aire de services camping-car, Glamping ou Tipi ;
- cinq activités mentionnent un bivouac comme partie d'une randonnée, d'une sortie équestre ou d'un canyoning : elles restent ACT ;
- Ô Chalet mentionne uniquement la location de matériel de bivouac : sa nature Chalet reste correcte ;
- les trois mentions Refuge trouvées dans des locations utilisent le mot au sens figuré : leurs taxonomies Bungalow ou Location saisonnière restent correctes ;
- Résidence Touristiques des Thés reste un HLO : la fiche officielle la présente comme Gîte & villa / Location de vacances, composée de quatre villas autonomes, sans preuve de fonctionnement en résidence de tourisme ;
- Héritage Écolodge & Spa reste Chambre d'hôtes : le site de l'établissement et Gîtes de France le décrivent comme Guest House / Bed & Breakfast et chambre d'hôtes.

Sources de vérification :

- [Gîte Hydrangea 974 — Île de la Réunion Tourisme](https://www.reunion.fr/offres/gite-hydrangea-974-la-plaine-des-cafres-le-tampon-fr-5836297/) ;
- [Résidence Touristiques des Thés — Île de la Réunion Tourisme](https://www.reunion.fr/offres/residence-touristiques-des-thes-saint-joseph-fr-557999/) ;
- [Héritage Écolodge — site de l'établissement](https://heritage-ecolodge.fr/notre-histoire/) ;
- [Héritage Écolodge — Gîtes de France](https://www.gites-de-france.com/fr/reunion/reunion/heritage-ecolodge-h97h025210) ;
- [Camping Pré-Vert Entre 2 Songes — Île de la Réunion Tourisme](https://www.reunion.fr/offres/camping-pre-vert-entre-2-songes-entre-deux-fr-560233/) ;
- [Le Verger de la Chapelle — Île de la Réunion Tourisme](https://www.reunion.fr/offres/verger-de-la-chapelle-le-entre-deux-fr-558400/).

## 3. Correction certaine de nature

| object_id | Fiche | Avant | Après | Type technique |
|---|---|---|---|---|
| HLORUN000000017A | Gîte Hydrangea 974 | taxonomy_hlo.chambre_d_hotes | taxonomy_hlo.gite_de_randonnee — Refuge et gîte d'étape | HLO inchangé |

Justification : l'offre officielle la qualifie de Gîte d'étape et de randonnée, indique un accueil principalement destiné aux randonneurs du GRR2 et décrit trois chambres doubles et deux dortoirs pour quatorze personnes. L'affectation actuelle provient de old_data_enrichment_20260512 et n'avait pas fait l'objet d'un arbitrage nominatif.

La migration devra vérifier l'ancienne valeur chambre_d_hotes avant d'écrire et enregistrer une source et une note d'audit datées.

## 4. Reprise certaine vers Type d'unité

Ces reprises ne changent pas la nature de l'établissement.

| object_id | Fiche | Nature conservée | Type d'unité à ajouter | Preuve |
|---|---|---|---|---|
| HLORUN000000015Q | La BBO La Bulle by Baril O'thentik | Chambre d'hôtes | Bulle | ancienne feuille structurée bulle + description |
| HLORUN000000013Y | Héritage Écolodge & Spa | Chambre d'hôtes | Lodge | ancienne feuille structurée lodges + sources officielles |
| HLORUN000000017V | Entre 2 Bulles | Chambre d'hôtes | Bulle | ancienne feuille insolite + unité explicitement décrite comme bubble dôme |
| HLORUN00000000UW | Anae Lodge | Chambre d'hôtes | Lodge | deux unités explicitement décrites comme lodges |
| HLORUN000000018Q | Au pays du mouton blanc | Meublé de tourisme | Cabane | logement explicitement décrit comme cabane de berger |
| CAMRUN000000013G | Camping Pré-Vert Entre 2 Songes | Camping | Cabane | cabanes perchées ou non proposées dans le camping |
| CAMRUN00000000PH | L'Eden du Randonneur (camping) | Camping chez l'habitant | Cabane | tarif et capacité propres à une cabane |

Pour les trois premières lignes, réaffecter object_taxonomy au nœud de nature Chambre d'hôtes lorsque l'ancienne feuille Type d'unité est retirée de la taxonomie. La décision PO du 24 juillet sur leur nature est conservée.

Les autres occurrences de lodge sont des noms commerciaux ou décrivent en réalité une maison, un chalet ou un bungalow. Elles ne doivent pas recevoir automatiquement le type d'unité Lodge. La mention Cabane portée par la fiche HLO L'Eden du Randonneur provient du texte partagé avec sa fiche Camping ; seule la fiche Camping reçoit l'unité Cabane.

## 5. Deux décisions métier restantes

### D1 — La Roulotte Géante

La fiche HLO reste une Roulotte. Sa description indique toutefois qu'un bivouac payant est possible en complément de la location du chalet.

Décision attendue :

- si un emplacement de bivouac autonome peut être réservé et localisé, créer une fiche HPA Aire de bivouac liée à l'établissement ;
- sinon conserver la seule fiche HLO et décrire le bivouac comme prestation secondaire ;
- ne jamais retyper la fiche HLO existante en HPA.

### D2 — Le Verger de la Chapelle et la hiérarchie des terrains déclarés

La source touristique locale le présente comme Camping chez l'habitant, tout en indiquant qu'il se trouve sur une exploitation agricole. Une simple règle sur les mots ferme ou exploitation produirait donc une décision contraire au classement source.

La Direction générale des Entreprises précise que les terrains de camping déclarés sont communément appelés campings à la ferme ou terrains ruraux et peuvent être mis à disposition par des exploitants agricoles ou des particuliers : [DGE — Les terrains de camping déclarés](https://www.entreprises.gouv.fr/espace-entreprises/s-informer-sur-la-reglementation/les-terrains-de-camping-declares).

Conséquence de modèle recommandée :

    Terrain de camping déclaré                         [nature]
    ├── Camping à la ferme / sur exploitation agricole [sous-type]
    └── Camping chez l'habitant / chez un particulier   [sous-type]

Le référent doit confirmer si Le Verger reste Chez l'habitant selon la source IRT ou passe À la ferme selon le statut de l'exploitant. Tant que cette décision n'est pas signée, sa fiche n'est pas modifiée.

## 6. Manifeste minimal à intégrer au chantier

| Groupe | Nombre | Traitement |
|---|---:|---|
| Correction certaine de nature | 1 | migration object_taxonomy contrôlée |
| Reprises certaines vers Type d'unité | 7 | backfill de la nouvelle table ; quatre natures inchangées et trois feuilles HLO ramenées à Chambre d'hôtes |
| Décisions métier ouvertes | 2 | aucune écriture avant arbitrage |
| Autres occurrences textuelles | 22 | conserver ; faux positifs ou vocabulaire secondaire |

Après reprise, vérifier :

- 0 fiche sans taxonomie compatible ;
- 0 doublon par objet et domaine ;
- 0 porteur des anciennes feuilles HLO Bulle, Lodge ou Autre hébergement insolite si elles deviennent exclusivement des types d'unité ;
- les sept unités présentes dans object_accommodation_unit_type ;
- Gîte Hydrangea visible sous Hébergement collectif > Refuge et gîte d'étape ;
- caches et exports partenaires régénérés sans perte.
