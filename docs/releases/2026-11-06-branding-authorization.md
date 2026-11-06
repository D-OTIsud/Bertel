# Autorisation du branding — application et traçabilité du 6 novembre 2026

Le correctif de la [PR #75](https://github.com/D-OTIsud/Bertel/pull/75), intégrée dans `master` à `a582599`, a été appliqué à la base de production sous le nom `branding_admin_authorization`, version d’historique **`20261106075113`**.

Le fichier versionné est désormais `supabase/migrations/20261106075113_branding_admin_authorization.sql`. Son contenu SQL est identique au fichier relu dans la PR #75 ; seul son nom a été aligné avec la version réellement enregistrée lors de l’application. Cet alignement ne rejoue aucune migration et ne modifie pas l’historique de la base. Empreinte SHA-256 du contenu SQL normalisé en LF : `7585055f288412c39138411999b8654413e9e443bc2a3cc2355a4bbfc2f6e39a`.

## Contrôles après application

- La définition appliquée de `api.is_platform_admin()` correspond à la définition relue. Son identité, son propriétaire, sa signature, son langage SQL et ses attributs STABLE/SECURITY DEFINER sont conservés. Le chemin de recherche fixe et les droits d’exécution sont ceux du correctif.
- Les droits des profils canoniques `owner` et `super_admin`, ainsi que les identités techniques prévues, restent disponibles. Les contrôles de refus anonyme et des contextes ordinaires incomplets passent.
- La ligne de configuration du branding, les deux policies de sa table et les définitions des lecteurs et du writer restent identiques à leur état avant application.
- Une unique entrée d’historique porte le nom et la version indiqués ci-dessus. Les preuves détaillées de précontrôle, d’application et de postcontrôle sont conservées localement, hors du dépôt public.

La PR #75 dispose également de tests comportementaux PostgreSQL portant sur le véritable writer et les policies, d’un témoin de lecture publique anonyme non vide et de 12 tests Jest ciblés sur le logo et le branding par organisation. Le présent lot de traçabilité vérifie la correspondance du contenu SQL et des références ; il ne répète pas l’application en production.

## Actualisation ciblée du graphe de base

Seule la métadonnée vivante de `api.is_platform_admin()` a été relue par MCP, dans le format du supplément du graphe. La génération hors ligne avant/après a isolé son commentaire, sa référence source et la suppression d’une ancienne dépendance de lecture. Ces changements et le compteur de relations correspondant sont reportés dans le graphe et sa documentation.

Il s’agit d’une **actualisation partielle et ciblée**, pas d’une nouvelle extraction complète du catalogue ou des données de référence. Les autres nœuds et relations publiés sont conservés. Les snapshots bruts, les corps de fonctions et les preuves opérateur restent hors Git. Les contrôles des droits, du propriétaire et du chemin de recherche reposent sur les postcontrôles dédiés : ces attributs ne sont pas tous représentés dans le format du graphe.

## Limites

Ce compte rendu n’atteste pas un nouveau dépôt de fichier dans Storage depuis un navigateur. Les contrôles de route utilisent des mocks ; les écritures comportementales ont été exercées dans une base locale jetable. Le lot de traçabilité n’applique aucun autre SQL, ne modifie pas les permissions par organisation et ne déploie pas l’application.
