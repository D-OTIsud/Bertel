# Publication 26 : contrôles de production

La publication 26 a terminé le 10 novembre 2026 à 21:20:40.251679 UTC après
import, création et validation des 148 brouillons dans la session Bertel
authentifiée. L’aperçu portait sur 148 révisions et 1 186 représentations de
fiches affectées. Le journal affiche « Terminée », une tentative. Aucune
identité utilisateur ni clé partenaire n’a été simulée ou extraite.

| Portée | Résultat observé |
| --- | --- |
| Concepts figés | 1 625 : 1 496 publics, 129 internes |
| Domaines gouvernés | 87 : 72 publics, 15 internes |
| Nouveaux concepts | 148 : 134 publics, 14 internes |
| Quatre langues des nouveaux concepts | 148 comparaisons exactes, zéro divergence |
| Noms publics de domaines figés | 72 comparaisons exactes |
| Liens hiérarchiques publics | 837, dont 76 groupes vers leur propre catégorie |
| Appartenances action/groupe | 239 exactes, dont deux entre catégories différentes |
| Révisions restant en attente | 0 |

Les sources ajoutées sont les capacités (12), rôles associés aux itinéraires (8),
relations entre objets (10), types de pièces légales (21), sources d’avis (7) et
groupes de durabilité (76). Les rôles métier d’acteur (5), de contact (6) et
d’organisation (3) restent internes. Les rôles d’autorisation et permissions
conservent leur traitement distinct.

Les 1 477 concepts de la publication 25 sont tous retrouvés avec la même
visibilité et le même document après exclusion des seuls champs relationnels
additifs `narrower`, `member_of` et `members`. Leurs 1 477 empreintes historiques
correspondent. L’empreinte de toutes les lignes de publication jusqu’à 25 reste
`9efdd0fad56332aebe6bf453a4882be6`, identique au préflight.

La publication 26 fige les métadonnées avec `metadata_scope: release_snapshot`.
Son empreinte de concepts est `1d1ff90fa0e40c71c17db967e55e1cd4` ; son empreinte
de métadonnées est `0bc9b188189d0ee1739ea61f58412f88`, identique au calcul sur
les domaines JSONB réellement conservés. La publication 25 conserve son manifeste
historique sans ces nouveaux champs.

Les cinq SELECT d’intégrité, exécutés après publication entre 21:38:11 et
21:38:15 UTC, reproduisent exactement les 171 résultats de la référence :
104 identités de catalogue et 67 clés étrangères publiques racines. Aucune
identité manquante ou dupliquée, aucune cible orpheline. Les partitions physiques
ne sont pas comptées comme de nouvelles contraintes métier.

Les migrations installées sont `20261110195115` et `20261110210758` ; le second
corps SQL conserve l’empreinte
`0d44a607d218191089779cc5eff15cf989fcec84981492075f000ccecb771f67`.
La CI SQL complète [42899777890](https://github.com/D-OTIsud/Bertel/actions/runs/42899777890)
et la CI frontend [42899778274](https://github.com/D-OTIsud/Bertel/actions/runs/42899778274)
ont réussi avant installation. Le nom du fichier est aligné sur le registre
réel sans modifier ses octets SQL.

Les [résultats agrégés](../../db-graph-out/THESAURUS_NATIVE_PUBLICATION_POSTFLIGHT.json)
excluent le corpus lexical privé. Les premières requêtes de vérification
contenaient trois défauts de contrôle : comparaison d’alias réservés à l’éditeur,
alias SQL de groupe ambigu et décompte de la ligne d’un agrégat vide. Les reçus
initiaux sont conservés ; les SELECT corrigés vérifient les véritables champs
figés et les groupes sans membre. Ces corrections n’ont modifié aucune donnée.

Ce reçu atteste l’installation et la publication du contenu. La livraison de
l’image applicative et les réponses HTTP authentifiées sont qualifiées
séparément ; elles ne sont pas déduites du succès SQL.
