# Motif des changements de cycle de vie — 26 novembre 2026

L’archivage et la dépublication demandent un motif obligatoire dans leur fenêtre de confirmation. La section « Publication & cycle de vie » affiche ensuite le motif, l’auteur et la date de la dernière transition. Les restaurations et les publications restent possibles sans motif ; les informations historiques absentes ne sont pas inventées.

La migration `20261126044807_object_lifecycle_reason.sql` ajoute la signature RPC à trois arguments et conserve celle à deux arguments pour la publication et la restauration. Une ancienne requête d’archivage ou de dépublication sans motif échoue explicitement. Le statut, l’auteur et le motif de sa nouvelle version sont enregistrés dans la même transaction, sans modification rétroactive des anciens événements.

Déploiement : appliquer la migration avant l’application. Au moment de la préparation de cette branche, l’installation de production et le déploiement de l’application restent à confirmer ; les résultats effectifs doivent être relevés après leurs vérifications.
