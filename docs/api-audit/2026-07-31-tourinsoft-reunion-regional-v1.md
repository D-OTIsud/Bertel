# Audit API — Tourinsoft Réunion régional v1

Date : 2026-07-31
Statut : implémenté, testé sans persistance, non déployé en production
Variante : `?format=tourinsoft&variant=reunion-regional-v1`

## Résultat

La projection Tourinsoft régionale couvre désormais les six flux fournis par l'OTI :
Découverte, Hébergement, Information et service touristique, Loisir / plein air,
Restauration et Transport. Elle est strictement opt-in. L'absence de `variant`
continue d'utiliser `legacy-v1` et `reunion-hebergement-v1` garde son implémentation
antérieure.

Le snapshot contrôlé contient 411 objets. L'inventaire associe l'observation des
objets au `$metadata` OData : **683 chemins déclarés ou observés** et **1 983
occurrences champ-profil**. `$metadata` ajoute les champs valides mais vides dans le
snapshot ; ces champs doivent être classés, mais leur déclaration ne prouve ni qu'ils
sont obligatoires ni qu'une API d'import les accepte.

La matrice `field-mapping.csv` couvre les 683 chemins exactement une fois :

| Statut | Nombre | Effet actuel |
|---|---:|---|
| `approved` | 187 | produit depuis une source canonique publique Bertel |
| `pending_crt` | 278 | non inventé ; admissible uniquement par l'extension `service_role` et sa liste blanche profilée |
| `excluded` | 218 | non exporté : auxiliaire, technique, privé ou hors contrat |

## Architecture livrée

### Routage

`public.ref_tourinsoft_reunion_profile` porte les six profils de fil exacts : GUID de
flux, type fixe, code de classification et variantes de noms de collections.
`public.ref_tourinsoft_reunion_route` choisit un profil par type Bertel et peut le
raffiner par taxonomie. Une route taxonomique active gagne sur le repli par type ;
l'ancêtre applicable le plus proche est choisi.

Les routes actuelles sont :

- Découverte : `PCU`, `PNA`, `PRD`, `LOI` ;
- Hébergement : `HOT`, `HLO`, `CAMP`, ainsi que `HPA` vers camping et `RVA` vers
  hébergement locatif ;
- Information/service : office d'information `SPU` et agence réceptive `PSV` ;
- Loisir/plein air : `ACT` uniquement pour les taxonomies approuvées et locations de
  cycles `PSV` ; aucun repli `ACT` ou `ASC` n'existe ;
- Restauration : `RES` ;
- Transport : repli `PSV` après les exceptions précédentes.

Une fiche sans route, sans type cible ou sans crosswalk n'est pas forcée dans une
famille. Deux routes taxonomiques spécifiques vers des profils différents échouent
également en mode fermé. Ces cas restent dans la réponse Bertel sans bloc `tourinsoft`
et sont remontés par `api.tourinsoft_reunion_regional_routing_issues()`. Les replis
`HLO` et `RES`, conservés pour le pilote, y sont également signalés comme
`provisional_type_fallback` jusqu'à validation du CRT.

### Sérialisation

`api.tourinsoft_reunion_regional_documents(text[])` construit les documents en SQL de
façon set-based, avec déduplication et plafond de 200 identifiants. Il ne sélectionne
que les objets `published`. Il alimente le noyau commun et les extensions de famille :
identité Tourinsoft, description nettoyée, adresse/géolocalisation, contacts publics,
réservation, médias publiables, langues, paiements, capacités, animaux, tarifs,
ouvertures, équipements, classifications, taxonomie et cuisines.

Les crosswalks sont versionnés par profil dans `ref_interop_value_crosswalk`. Cinq
codes PSV réellement absents du vocabulaire Bertel et la métrique de capacité
`terrace_seats` sont ajoutés par la migration.

`public.object_interop_extension` conserve, par objet et par profil, l'identifiant
Tourinsoft confirmé et certaines propriétés partenaire sans modèle canonique. Sans cet
identifiant profilé, `SyndicObjectID` est omis : l'UUID Bertel n'est jamais présenté
comme un identifiant Tourinsoft. Cette table n'est pas une voie d'écriture publique.

Le contenu JSON est filtré par `ref_tourinsoft_reunion_extension_field`, généré depuis
`extension-allowlist.json`. Seuls les chemins `pending_crt` et les clés structurelles
nécessaires à l'appariement sont admissibles. Les chemins exclus, privés ou inconnus
sont omis et diagnostiqués par
`api.tourinsoft_reunion_regional_extension_issues()`. La superposition récursive donne
la priorité aux valeurs canoniques publiques, ne ressuscite pas une feuille canonique
absente et écarte les éléments d'extension sans correspondant canonique. Les tarifs,
ouvertures et relations sont appariés avec des clés stables qui conservent la position
des valeurs nulles.

Le SIRET n'est émis que depuis un enregistrement légal actif déclaré public, après
normalisation et validation stricte de 14 chiffres ; aucun JSON juridique brut n'est
repris sur le fil.

Les deux points d'entrée partagés assurent la compatibilité :

- `api.get_object_tourinsoft(id, variant)` pour le détail ;
- `api.get_objects_tourinsoft_batch(ids, variant)` pour une page.

Ils conservent les branches `legacy-v1` et `reunion-hebergement-v1`, et ajoutent la
branche `reunion-regional-v1`. La passerelle Next.js valide la variante, appelle ces
RPC côté serveur et fusionne le document sous la clé additive `data.tourinsoft` ou
`data[i].tourinsoft`. Le batch fait un seul appel RPC par page.

`api.tourinsoft_reunion_regional_unmapped_values()` fournit au connecteur un diagnostic
des valeurs réellement utilisées dans Bertel mais absentes des crosswalks actifs.
`api.tourinsoft_reunion_regional_routing_issues()` fournit la file de revue des objets
non routables, ambigus, privés de crosswalk de type ou dépendants d'un repli provisoire.
`api.tourinsoft_reunion_regional_extension_issues()` signale les feuilles d'extension
rejetées par la liste blanche.

## Sécurité

- La passerelle partenaire conserve son authentification par clé, son contrôle de
  débit et son filtrage de fiches publiées.
- Les quatre nouvelles tables ont RLS activée. `PUBLIC`, `anon` et `authenticated`
  n'ont aucun privilège ; seule `service_role` peut les lire ou les modifier.
- Les fonctions régionales et leurs helpers sont `SECURITY INVOKER` avec un `search_path` fixé.
  Leur exécution est révoquée à `PUBLIC`, `anon` et `authenticated`, puis accordée à
  `service_role` uniquement.
- Le sérialiseur refiltre `object.status = 'published'`, même si la passerelle a déjà
  appliqué cette règle.
- Les contacts exigent `is_public=true`. Les descriptions privées sont exclues. Les
  médias doivent être publics, publiés et non expirés. Les données CRM et le contenu
  juridique autre qu'un SIRET public/actif de 14 chiffres ne sont pas projetés.
- Les documents ne sont jamais construits dans le navigateur et aucune clé
  `service_role` n'est exposée au client.

## Vérifications effectuées

### Contrat et métadonnées

```powershell
python tools/tourinsoft/check-regional-contract.py
```

Résultat : 6 flux, 411 objets, 683 chemins, 1 983 occurrences et 683 mappings. Le
contrôle exige un schéma par flux, l'identité exacte du catalogue, la concordance
inventaire/couverture/union et une décision unique pour chaque chemin.

### SQL Supabase sans persistance

La migration complète a été chargée sur la base Supabase liée, avec son prérequis
temporaire, dans une transaction externe. Le probe fonctionnel six familles a passé,
puis la transaction a été annulée. Aucun objet, crosswalk, table ou fonction de ce
dry-run n'a persisté sur la base distante.

Le test versionné
`Base de donnée DLL et API/tests/test_tourinsoft_reunion_regional_v1.sql` crée une
fixture publiée par famille, deux cas `PSV` de surcharge taxonomique et un cas
volontairement ambigu, puis vérifie :

- six GUID/URL de flux exacts et routage type+taxonomie fermé ;
- noms de collections et catégorie scalaire propres au profil ;
- valeur canonique prioritaire, liste blanche d'extension et rejet diagnostiqué des
  feuilles privées/exclues ;
- appariement stable des tableaux après réordonnancement et absence de résurrection
  de métadonnées canoniques obsolètes ;
- SIRET public normalisé et rejet fermé du JSON juridique non conforme ;
- identité Tourinsoft propre au profil, sans repli sur l'UUID Bertel ;
- rejet fermé et diagnostic d'une double route taxonomique ;
- parité stricte détail/batch et déduplication ;
- RLS, absence de DML public et couverture complète des privilèges d'exécution ;
- `SECURITY INVOKER` sur les fonctions.

Le test déclenche volontairement `ROLLBACK_PROBE` et l'intercepte après annulation du
sous-bloc : ses douze fiches, dont huit sorties attendues, et leurs données associées
sont toujours auto-nettoyées.

### Passerelle

Les 54 tests ciblés de résolution de variante, détail et liste passent, ainsi que le
typecheck. Ils vérifient notamment le défaut `legacy-v1`, l'acceptation explicite des
deux variantes Réunion, le rejet des combinaisons invalides, l'appel RPC régional
dédié, le batch unique et le comportement best-effort.

Ce bilan ne vaut pas smoke test de production : la migration n'a pas été laissée sur
la base liée et aucun appel d'import Tourinsoft n'a été effectué.

## Déploiement et repli

La migration est additive et encapsulée dans `BEGIN`/`COMMIT`. L'ordre prévu est : SQL
I4f après I4e, test SQL auto-nettoyant, `NOTIFY pgrst, 'reload schema'`, smoke tests RPC,
puis déploiement de la passerelle. La variante ne s'active que lorsque le partenaire
la demande explicitement.

En cas d'incident, désactiver les lignes `reunion-regional-v1` dans
`ref_tourinsoft_reunion_route` coupe immédiatement les documents régionaux sans
modifier `legacy-v1` ni `reunion-hebergement-v1`. Ne pas supprimer les codes,
crosswalks ou extensions avant d'en avoir vérifié les dépendances et le contenu.

## Décisions CRT restantes

La projection de lecture est prête ; l'écriture bidirectionnelle ne l'est pas. Les P0
restants sont : contrat et authentification de l'API d'import, types/bordereaux
inscriptibles, identité durable, sémantique patch/remplacement, suppression,
propriété des champs et conflits, référentiels d'écriture et validation du routage.

Les P1 doivent ensuite lever ou exclure les 278 chemins `pending_crt`, puis valider
descriptions, contacts, médias, formats/unités et règles propres aux six familles. La
liste décisionnelle complète est dans
[`crt-decisions.md`](../integrations/tourinsoft/reunion-regional-v1/crt-decisions.md).

## Fichiers de référence

- migration Supabase :
  `supabase/migrations/20260731041455_tourinsoft_reunion_regional_v1.sql` ;
- wrapper fresh apply :
  `Base de donnée DLL et API/migration_tourinsoft_reunion_regional_v1.sql` ;
- test SQL :
  `Base de donnée DLL et API/tests/test_tourinsoft_reunion_regional_v1.sql` ;
- contrat et preuves :
  [`reunion-regional-v1`](../integrations/tourinsoft/reunion-regional-v1/README.md) ;
- guide partenaire : [`guide-partenaires.md`](../guide-partenaires.md) ;
- contrat HTTP : [`openapi.json`](../openapi.json).
