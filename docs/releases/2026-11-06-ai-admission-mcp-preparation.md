# IA : source fraîche et préparation de transport MCP

Cette préparation sépare le source frais inchangé de son enveloppe d’upgrade.
Le manifeste inclut ai_request_admission.sql ; ses octets restent ceux du source
initial 20261106145451 (SHA256 3d618baf364e2ad281393177bbebf118208ed1e196c207bd0e4626106373139b).
Le template tools/ai-quota/prepared-mcp-upgrade.sql est une unique instruction DO :
gardes de l’état revu, corps source exact sauf les seules lignes externes
BEGIN/COMMIT, puis postconditions de schéma, fonction, RLS et privilèges. Il n’est
pas inclus dans le fresh-install. Aucun fichier de nouvelle version n’est créé
par cette préparation.

Le candidat a été exécuté seulement sur PostgreSQL 17.10 local, avec un ledger
synthétique et sans identité Auth ni ligne de quota : refus du mauvais état,
rollback après exception forcée après tout le corps, succès des postconditions
et refus de replay. Cette preuve ne qualifie pas le backend Management API.
Le [code MCP épinglé](https://github.com/supabase/mcp/blob/6b2fca972b5264474949fd738f02537082f5c898/packages/mcp-server-supabase/src/platform/api-platform.ts#L259)
transmet name/query à l’API et ne renvoie aucune version. La
[documentation de l’endpoint](https://supabase.com/docs/reference/api/v1-apply-a-migration)
ne garantit pas explicitement une transaction commune au corps et au reçu.
success:true seul n’est donc pas un reçu ni une preuve d’atomicité de l’historique.

Avant toute utilisation, contre-relire le SQL, vérifier à nouveau son état cible
et choisir un transport qualifié. Après application réellement attestée seulement :
relever la version exacte dans le ledger et vérifier l’absence d’autres deltas ;
déplacer ce même blob DO vers supabase/migrations/<VERSION_REELLE>_distributed_ai_request_admission.sql ;
retirer l’ancien fichier 145451 jamais appliqué, sans rejouer son SQL ni modifier
l’historique distant ; actualiser les références et publier un record indiquant
les hashes distincts du source et du payload. Les anciens fichiers/empreintes
restent des preuves de filiation, pas des reçus rétroactifs. Une réponse perdue ou
un état partiel impose une réconciliation, jamais un retry automatique ou une
insertion manuelle d’un reçu.

Les tests de provenance vérifient le source exact, le corps embarqué dans le DO
et le chemin frais indépendant du fichier upgrade. Les tests comportementaux
existants d’admission restent requis ; aucun appel de test production ni secret
serveur n’est nécessaire à ces vérifications.
