# Version de production de référence et retour arrière — 6 septembre 2026

## Point de retour vérifié avant intégration

La version ci-dessous est celle affichée **Running (healthy)** dans Coolify lors de la préparation. Elle est distincte du sommet de `master`.

| Élément | Valeur vérifiée |
|---|---|
| Application | Bertel_v3 / production — `https://bertel.otisud.re` |
| Dépôt / branche | `D-OTIsud/Bertel` / `master` |
| Commit réellement déployé | **`9fcb6f0474afcd1b61c2621413a82a0638f655a3`** |
| Sujet du commit | `docs(sandbox): record build and SQL validation and refresh database graph` |
| Déploiement Coolify | `cg40ss8ggos888css0swgwwg` — Success, déclenchement Manual |
| Début / fin | 4 septembre 2026, 06:54:53 → 06:59:39 UTC ; soit 10:54:53 → 10:59:39 à La Réunion |
| Tag Git de référence | `rollback/production-20260904-9fcb6f0` |
| `master` avant cette intégration | `3fd9ce0797ae49d1465cd0a0de06102b08017d19` ; 10 commits après le déploiement de référence |
| Socle de l’audit initial | `5873ec69879e61ff34030d196c65f2eb0ac14de0` ; 177 commits derrière `master` avant intégration |

Preuves de l’hébergeur : [historique des déploiements](https://coolify.otisud.re/project/qw40sk0s4w8sc0gkggokwso4/environment/mo4o40c8o8occs40o4cs0ks4/application/r48k844wg04kks848s00wco4/deployment), [commit de référence](https://github.com/D-OTIsud/Bertel/commit/9fcb6f0474afcd1b61c2621413a82a0638f655a3). Les journaux de build bruts ne sont pas publiés : ils peuvent contenir des variables d’environnement sensibles.

## Configuration de l’hébergement relevée

- Source publique GitHub, branche `master`, champ **Commit SHA = `HEAD`**.
- Build Pack **Docker Compose**, Base Directory **`/bertel-tourism-ui`**, Docker Compose Location **`/docker-compose.yml`**.
- Domaine configuré **`https://bertel.otisud.re:3000`**.
- **Auto Deploy activé** : un push sur `master` peut déclencher une construction si le webhook est raccordé. L’historique consulté comporte des déclenchements manuels ; ce relevé n’atteste pas à lui seul la réception d’un webhook.
- Cache de build actif ; clonage superficiel, LFS et sous-modules activés.
- Mode démonstration désactivé dans le dernier build ; projet Supabase `ryycrdhlkmzpxwwwwupy`.
- Conserver les paramètres runtime nécessaires dans Coolify. Aucune valeur de secret n’est copiée dans Git. La clé de service doit rester un secret de serveur et être exclue des arguments de build et journaux publics.

L’écran Rollback n’affiche qu’une image locale **`latest`**, datée du 4 septembre 2026 à 06:59:36 UTC. Ce nom est mutable : **aucun digest immuable ni archive d’image n’est garanti par cette note**. Le tag protège le code source exact ; une reconstruction peut obtenir une image de base plus récente, puisque l’ancien Dockerfile utilise `node:22-alpine`.

## Revenir à cette version applicative

1. Mettre en pause les nouveaux effacements RGPD et diagnostiquer si le problème vient du front, de la configuration ou de la base. Si l’incident impose un arrêt, utiliser la procédure d’exploitation de l’hébergeur.
2. Dans **Configuration → Git Source**, conserver `master` et remplacer **Commit SHA** par **`9fcb6f0474afcd1b61c2621413a82a0638f655a3`**, puis enregistrer. Le champ a été observé dans cette installation Coolify ; ne pas remplacer ce SHA par `HEAD` pour un retour arrière.
3. Déclencher le redéploiement de ce commit. Si Coolify ne retrouve pas cet ancien commit avec le clonage superficiel, désactiver temporairement **Shallow Clone**, puis relancer. Autre possibilité : une branche de maintenance créée depuis le tag et sélectionnée dans Coolify.
4. Vérifier le **SHA réellement affiché comme Running**, l’état du conteneur, `/api/health`, la connexion, Explorer, la fiche acteur et une sauvegarde métier autorisée. L’ancienne version n’a pas la nouvelle sonde `/api/ready` : ne pas exiger cette route pour son contrôle.
5. Garder le SHA fixé pendant l’analyse. Après correction et validation, restaurer **Commit SHA = `HEAD`** pour reprendre les déploiements de `master`.

Cette procédure ne réécrit pas l’historique de `master` et ne demande aucun `push --force`. Le tag peut être vérifié dans un checkout de maintenance :

```sh
git fetch origin --tags
git rev-parse 'rollback/production-20260904-9fcb6f0^{commit}'
# Doit retourner 9fcb6f0474afcd1b61c2621413a82a0638f655a3
```

## État SQL séparé et ordre de déploiement

Le [préflight MCP en lecture seule](../remediation/2026-09-05/validation-sql.md#complément-du-6-septembre-2026--préflight-mcp-sur-bertel) relève comme dernière migration enregistrée `20260905105019_revoke_default_acl_rpc_only_18h`. **La base a donc un historique distinct du commit frontend déployé.** Ce relevé n’est ni une sauvegarde des données ni une sauvegarde du schéma complet.

Les trois migrations de l’audit ne sont pas encore enregistrées sur Bertel :

| Migration | Consigne |
|---|---|
| `20260905195257_gdpr_cleanup_operations.sql` | Comparer les fonctions remplacées et leurs prérequis ; appliquer avant d’utiliser le nouvel effacement durable. La garde ajoutée au front refuse les nouveaux effacements si le RPC de suivi est absent ou indisponible, avant tout appel destructif. |
| `20260905204133_audit_price_age_bounds.sql` | Vérifier les éventuels maxima négatifs hérités ; la migration les conserve et peut laisser la contrainte `NOT VALID`, tout en protégeant les nouvelles écritures. |
| `20260905200731_tourinsoft_service_read_grants.sql` | **Ne pas appliquer isolément** : le sérialiseur régional est absent de Bertel. Déployer avec les prérequis I4e/I4f du module Tourinsoft, ou conserver ce lot optionnel pour plus tard. |

Ne pas lancer le manifeste fresh apply sur une base de production existante. Après application des nouveaux RPC, recharger le schéma PostgREST conformément au [runbook SQL](../SQL_ROLLOUT_RUNBOOK.md), puis vérifier les permissions et les parcours concernés.

**Retour arrière après migration RGPD :** l’ancien front ne traite ni n’acquitte toutes les nouvelles tâches de nettoyage. Suspendre les effacements pendant ce retour arrière et conserver `internal.gdpr_cleanup_task`, le journal d’opérations et leurs données. Reprendre le traitement avec une version compatible. Ne pas supprimer la file pour masquer les opérations en attente.

Un retour au code antérieur ne restaure pas les personnes, fichiers Storage ou comptes Auth déjà effacés. Une restauration de données exige une sauvegarde/PITR vérifiée et une procédure distincte ; aucune restauration ni création de sauvegarde distante n’a été exécutée pendant cette préparation.

## Contenu livré et validation

Le lot regroupe les [17 audits](../audits/2026-09-05/README.md), les [dix lots de corrections](../remediation/2026-09-05/README.md), leurs tests, les migrations et cette procédure. Les évolutions déjà présentes sur `master` doivent être conservées lors de l’intégration. Les résultats de l’audit initial portent sur son ancien socle ; les contrôles d’intégration sont consignés ci-dessous après exécution.

Les captures, prompts et diagnostics sous `scratch/` sont des preuves locales, exclues du dépôt public. Les documents peuvent y faire référence, mais ces liens ne constituent pas des pièces téléchargeables depuis GitHub.

### Contrôles d’intégration

Préparation en cours : cette section sera complétée avec les résultats du code intégré avant promotion sur `master`.
