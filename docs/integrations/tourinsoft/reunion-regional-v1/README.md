# Export Tourinsoft — Réunion régional v1

La variante opt-in `?format=tourinsoft&variant=reunion-regional-v1` est désormais
implémentée pour les six familles actuellement publiées par Tourinsoft Réunion. Elle
est additive : `legacy-v1` reste le défaut et `reunion-hebergement-v1` reste inchangée.

Ce dossier sépare trois choses qui ne doivent pas être confondues :

1. la forme déclarée par `$metadata` et observée dans les flux publics de syndication ;
2. la donnée métier réellement disponible dans Bertel ;
3. le futur contrat d'écriture, qui reste à faire valider par le CRT.

Un flux public de lecture ne constitue pas, à lui seul, une spécification d'import.
Les fichiers de ce dossier constituent la preuve de surface, la matrice de mapping et
le support de décision. Ils ne constituent toujours pas une certification d'écriture
Tourinsoft : l'endpoint et les règles d'import doivent être validés par le CRT.

## Surface déclarée et observée

| Profil cible | Objets | Champs racine déclarés (observés) | Relations déclarées | Champs de relations déclarés (observés) | Type fixe Tourinsoft |
|---|---:|---:|---:|---:|---|
| Découverte | 49 | 41 (41) | 32 | 296 (205) | `C713C5B4-8DE3-4B95-9597-C8206B3EE13C` |
| Hébergement | 211 | 48 (48) | 35 | 327 (266) | 3 types : camping, locatif, hôtellerie |
| Information et service touristique | 5 | 44 (44) | 24 | 224 (130) | `8A787E66-2FDC-4A4C-95D1-3D08E6C86505` |
| Loisir / plein air | 28 | 41 (41) | 34 | 312 (201) | `7737C632-EB09-4E81-B3CA-2F1C9BCCAD5D` |
| Restauration | 100 | 44 (44) | 32 | 301 (218) | `BF6C9728-398A-4E02-B258-0B4E945F8574` |
| Transport | 18 | 39 (39) | 27 | 266 (147) | `1F1D1630-34B0-40E3-99CC-D999FAE76872` |

Le corpus contient **411 objets**, **1 983 occurrences champ-profil déclarées ou
observées** et **683 chemins distincts**. Parmi ces chemins, 186 sont présents dans les
six profils, 111 sont partagés par deux à cinq profils et 386 sont propres à une seule
famille.

La différence avec le seul inventaire des valeurs rencontrées vient de `$metadata` :
le schéma OData déclare aussi les propriétés et relations valides qui sont vides dans
les 411 fiches du snapshot. Ces champs non observés doivent rester dans le contrat et
être classés ; leur présence dans `$metadata` ne prouve cependant ni qu'ils sont
obligatoires ni qu'ils sont acceptés par l'API d'import.

Cette surface plus grande ne signifie pas que Bertel présente 683 manques métier.
Elle mélange :

- un noyau réellement utile : identité, publication, adresse, géolocalisation,
  descriptions, contacts publics, médias, langues et équipements ;
- des données métier propres à une famille : capacités et classement d'un
  hébergement, cuisines d'un restaurant, catégories d'activités, services de
  transport, tarifs, réservations et périodes d'ouverture ;
- des propriétés auxiliaires de Tourinsoft : identifiants de thésaurus, ordre,
  pictogramme, métadonnées de relation et tracking. Elles doivent être conservées
  seulement si le contrat d'import les exige ou si elles sont utiles au rapprochement.

## Routage des objets

Le profil cible doit être choisi par la taxonomie et le bordereau Tourinsoft, pas par
une simple correspondance avec `object_type` dans Bertel. Le rapprochement exact des
titres déjà publiés le démontre : la famille Découverte recoupe notamment des objets
Bertel `LOI`, `PRD` et `ACT`, tandis que Loisir / plein air recoupe surtout `ACT` et
Transport `PSV`. Information et service touristique n'a, pour l'instant, aucun titre
exactement rapproché dans le corpus publié Bertel.

Le sérialiseur régional implémente :

- un noyau partagé pour les champs communs ;
- six profils de sortie versionnés, portant chacun son identifiant de flux, son type
  fixe et ses référentiels ;
- une règle de routage explicite fondée sur les classifications Bertel ; un objet
  sans route ou portant des routes taxonomiques contradictoires reste hors projection
  et apparaît dans le diagnostic de revue `tourinsoft_reunion_regional_routing_issues()` ;
- aucun repli global n'est autorisé pour `ACT` ou `ASC` : seuls les `ACT` portant une
  taxonomie Loisir approuvée sont routés automatiquement ; `ASC` et les autres `ACT`
  restent en revue. Les replis de type `HLO` et `RES` restent exportables mais sont
  signalés comme `provisional_type_fallback` jusqu'à validation du CRT ;
- les noms exacts attendus sur le fil Tourinsoft, paramétrés par profil. Les variantes
  telles que `Localisations` / `Localisationss`, `ClassificationCategories` /
  `ClassificationCategoriess` et `AccueilPMR` / `AccessibilitePMR` ne sont pas
  fusionnées aveuglément à l'export.

## Surface métier prise en compte par profil

| Profil | Extensions au noyau commun, approuvées ou en attente CRT |
|---|---|
| Découverte | catégories patrimoine/terroir, sous-catégories, animaux, capacités, labels, marques, paiements, activités, proximités, réservations, tarifs, thèmes et types d'équipement |
| Hébergement | sous-types, classement, chaînes, accès, capacités hébergement/camping, horaires arrivée-départ, ouvertures, zones, paiements, réseaux sociaux, réservations et tarifs |
| Information / service | catégorie accueil/organisme, sous-catégories, accès, chaînes, labels, marques, proximités, thèmes et types d'équipement |
| Loisir / plein air | catégories adrénaline/attractions/exploration/nautisme/véhicules/autres, capacités, paiements, réservations, tarifs et thèmes |
| Restauration | catégories et sous-catégories, types de cuisine, accessibilité, menu enfant, accueil de groupe, dimanche soir, capacités, ouvertures, paiements et tarifs |
| Transport | catégories service/location, sous-catégories services/véhicules, paiements, réservations, tarifs et types d'équipement |

Les codes observés sont des preuves de lecture, non des autorisations d'écriture. Les
crosswalks sont versionnés par profil et doivent encore être validés par le CRT avant
toute alimentation de production.

## État du mapping

Les **683 chemins** déclarés ou observés sont tous classés dans `field-mapping.csv` :

| Statut | Nombre | Traitement |
|---|---:|---|
| `approved` | 187 | émis depuis le modèle canonique public de Bertel |
| `pending_crt` | 278 | jamais synthétisé ; admissible dans l'extension `service_role` uniquement si le connecteur fournit la valeur et si le chemin figure dans la liste blanche |
| `excluded` | 218 | métadonnée auxiliaire, technique, privée ou hors contrat |

Le stockage d'extension est cloisonné par objet et profil. Il porte aussi l'identifiant
Tourinsoft de ce profil ; en l'absence d'identifiant confirmé, `SyndicObjectID` est
omis et n'est jamais fabriqué à partir de l'UUID Bertel. Il n'est accessible qu'au
`service_role`.

L'extension n'est pas recopiée en bloc. `extension-allowlist.json`, synchronisé dans
`ref_tourinsoft_reunion_extension_field`, ne garde que les chemins `pending_crt` et
les quelques clés métier nécessaires à un appariement sûr. Les chemins exclus,
privés ou inconnus sont omis et remontés par
`tourinsoft_reunion_regional_extension_issues()`. Les valeurs canoniques publiques de
Bertel restent prioritaires ; un sous-champ canonique absent n'est pas ressuscité par
une ancienne valeur partenaire. Les tableaux sont appariés par clé métier stable et
les éléments d'extension sans correspondant canonique ne sont pas émis.

Le SIRET constitue une exception juridique explicitement bornée : seuls les enregistrements
actifs d'un type légal déclaré public sont considérés, puis la valeur est normalisée et
rejetée si elle ne contient pas exactement 14 chiffres. Le JSON juridique brut et ses
autres sous-champs ne sont jamais sérialisés.

## Artefacts

- `feeds.json` : catalogue autoritatif des six flux fournis par l'OTI ;
- `source-schemas/*.json` : forme déclarée et couverture observée, sans recopier les objets ;
- `feed-summary.json` : volumes et types fixes ;
- `field-union.json` : union des 683 chemins déclarés ou observés et niveau de réutilisation ;
- `field-inventory.csv` : déclaration et mesures source par champ et par profil ;
- `field-coverage.csv` : registre généré qui rend compte des 1 983 occurrences ;
- `field-mapping.csv` : décision de mapping pour chacun des 683 chemins ;
- `extension-allowlist.json` : chemins d'extension et clés d'appariement autorisés par profil ;
- `bertel-overlap.json` : rapprochement agrégé et anonymisé avec le corpus Bertel ;
- `crt-decisions.md` : décisions nécessaires avant de qualifier l'écriture.

`field-coverage.csv` décrit la déclaration `$metadata` et l'observation dans les
objets ; son statut `unclassified` ne doit pas être interprété comme un champ à
exporter. La décision d'export fait foi dans `field-mapping.csv`.

## Régénération et contrôle

```powershell
python tools/tourinsoft/analyze-regional-feeds.py
python tools/tourinsoft/build-regional-coverage.py
python tools/tourinsoft/build-regional-mapping.py
python tools/tourinsoft/sync-regional-allowlist.py
python tools/tourinsoft/check-regional-contract.py
```

La première commande appelle les six flux publics et leurs `$metadata`. Les suivantes
sont locales. La synchronisation injecte dans la migration la liste blanche générée ;
le contrôle échoue si elle diverge de `extension-allowlist.json`, ou si un flux, un
schéma, un chemin d'union, une occurrence de couverture ou une décision de mapping
disparaît sans mise à jour cohérente des artefacts.
