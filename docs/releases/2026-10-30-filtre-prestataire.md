# Filtre prestataire sur Bertel V3

La migration `20261030123304_provider_scope_preference` a été appliquée directement
sur **Bertelv3** (`ryycrdhlkmzpxwwwwupy`) le 30 octobre 2026 à 16 h 33, heure de
La Réunion. L’utilisateur a demandé de travailler sur cette base avec des contrôles
ciblés. Aucune base isolée ni donnée métier d’essai n’a été créée pendant cette
intervention.

Après demande de l’utilisateur, le code de l’interface est intégré à la livraison
sur `master`, à partir du commit `fe858c7`. Le lot est séparé des autres travaux
locaux et conserve les évolutions récentes de l’éditeur et des filtres.

La préparation de cette publication a validé le typecheck, la compilation de
production et douze suites Jest ciblées, soit 120 assertions. Le registre des
critères de filtres du `master` actuel reconnaît le nouveau périmètre et le
conserve dans les URL et les transferts entre pages. Les services de lecture
`rpc.ts`, `object-workspace.ts` et les routes publiques d’objets sont inchangés
par rapport à ce `master`. La migration déjà appliquée n’est pas rejouée.

## Changements appliqués

- Ajout de `has_provider=true` au moteur commun `api.get_filtered_object_ids`.
  Tout rôle d’acteur compte, dont `content_editor`. Les dates du lien sont
  inclusives et évaluées selon la date de La Réunion. Un `EXISTS` évite les doublons.
- Ajout de `api.set_provider_only_preference(boolean)` pour modifier uniquement
  `preferences.provider_only` sur le profil authentifié, en conservant ses autres
  préférences et sa RLS. Aucun choix utilisateur n’a été modifié par la migration.
- Ajout de deux helpers internes et des trois RPC d’activité prestataires, qui
  conservent les calculs existants sur le corpus filtré de la session.
- Conservation des signatures et droits des fonctions existantes. Aucun index,
  table ou colonne n’a été ajouté. Aucune donnée métier n’a été réécrite.

Le toggle préparé dans le code reste dans le bloc Catégorie, sous les choix de
catégories, sur le dashboard et l’explorateur. Le choix explicite est partagé entre
les deux écrans et rechargé depuis le compte à la reconnexion.

## Protection des fonctions de lecture des fiches

À la demande de l’utilisateur, les contrôles prioritaires ont porté sur :

- `api.get_object_resource` ;
- `api.get_object_with_deep_data` ;
- `api.get_object_resource_adapted` ;
- `api.get_object_resources_batch` ;
- `api.get_object_cards_batch`.

Leurs corps, signatures, retours, droits et paramètres d’exécution sont identiques
avant et après la migration. Douze fiches publiées ont été effectivement chargées
dans `get_object_resource` et `get_object_with_deep_data` : leurs réponses JSON
complètes ont des empreintes identiques avant/après. Cinq de ces fiches n’ont pas
d’acteur rattaché ; elles restent donc accessibles directement par identifiant.

Ces lectures ont utilisé les options de l’application : langue française,
`render=false`, `include_private=true`, et `geojson` pour `get_object_resource`.
Les contenus des fiches ne sont pas reproduits dans le compte rendu.

## Résultats des contrôles

| Contrôle | Résultat |
| --- | --- |
| Recherche sans critère | 835 fiches publiées, comme avant. |
| Recherche avec `has_provider=false` | Les mêmes 835 fiches. |
| Recherche avec `has_provider=true` | 758 fiches publiées. |
| Scorecard du dashboard avec le filtre | 758 fiches, cohérentes avec la recherche. |
| Autres statistiques | Répartition par type, complétude, actualisation, communes et distinctions exécutées avec succès. |
| Liste et carte | Pagination filtrée et marqueurs exécutés avec succès. |
| CRM prestataires réel | 169 interactions et 1 tâche ouvertes, total 170. |
| CRM prestataires test | 270 interactions et 89 tâches ouvertes, total 359, dans le contexte de test distinct. |
| Activité | Les trois nouvelles RPC renvoient les formes attendues dans les deux contextes. |
| Droits | RPC prestataires et préférence exécutables par les utilisateurs autorisés, pas par anon ; helpers internes non exécutables directement par authenticated ou anon. |
| Application | Typecheck réussi ; cinq suites Jest ciblées réussies, 122 assertions. |

Les fonctions et le chemin d’écriture de préférence ont été vérifiés par leurs
droits et les tests ciblés du service, du store et du toggle. Aucun compte réel
n’a été modifié pour simuler un clic utilisateur pendant les contrôles distants.

Les avis Supabase ont été consultés. Les RPC d’agrégation suivent le modèle
autorisé `SECURITY DEFINER` des RPC dashboard existantes ; elles apparaissent
dans l’[avertissement sur les fonctions exécutables par les comptes authentifiés](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
Leurs gardes de session et de corpus ainsi que leurs droits ont été contrôlés.

Les preuves agrégées sont conservées dans
[le relevé de vérification](2026-10-30-filtre-prestataire-verification.json).

## Périmètre conservé pour cette livraison

Les anciennes RPC d’activité globales restent strictement identiques, y compris
le mélange réel/test constaté dans l’audit lorsque le nouveau filtre est désactivé.
La correction de ce défaut préexistant reste distincte du filtre livré. Les
nouvelles RPC prestataires séparent bien les deux corpus.

La collecte et les relevés historiques existants sont conservés. Le code du widget
signale l’indisponibilité de l’historique prestataire lorsque le toggle est actif ;
il n’affiche pas la courbe globale comme une courbe filtrée. La nouvelle collecte
historique et le lien de consultation proposé dans le plan ne sont pas inclus.

## Sources et retour arrière

La [migration](../../supabase/migrations/20261030123304_provider_scope_preference.sql)
est alignée sur le numéro réellement enregistré par Supabase. Le manifeste de
création complète et le harnais de validation pointent vers ce même fichier.

Le [script de retour arrière](<../../Base de donnée DLL et API/rollback/rollback_provider_scope_preference.sql>)
restaure uniquement le moteur commun, après vérification de son empreinte.
Il doit être précédé du retour au frontend antérieur. Il conserve les préférences,
les données métier et les nouvelles RPC pour les clients déjà ouverts. Il n’a
pas été exécuté sur la base.

Le catalogue des fonctions et le graphe DB ont été actualisés depuis la lecture
réelle du catalogue. Le graphe du code est également régénéré après les changements.
