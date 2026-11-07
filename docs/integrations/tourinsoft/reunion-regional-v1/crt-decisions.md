# Décisions à obtenir du CRT — export régional v1

Les décisions P0 bloquent un véritable test d'écriture. Les P1 bloquent la conformité
métier complète ; les P2 peuvent être arrêtées pendant la recette.

La projection de lecture `reunion-regional-v1`, son routage taxonomique et sa matrice
de **683 chemins** sont implémentés. La matrice compte **187 `approved`**, **278
`pending_crt`** et **218 `excluded`**. Les décisions ci-dessous portent donc sur la
qualification de l'import et la levée des 278 attentes, pas sur l'existence de la
projection Bertel.

| ID | Priorité | Décision demandée au CRT | Proposition Bertel | Preuve ou risque traité |
|---|---|---|---|---|
| CRT-01 | P0 | Fournir le contrat d'import : endpoint, authentification, média, schéma, taille de lot et environnement de test. | Qualifier l'export uniquement contre ce contrat, jamais contre le seul flux de syndication. | Les six URL connues sont des flux publics de lecture. |
| CRT-02 | P0 | Confirmer les bordereaux, `ObjectTypeFix` et champs acceptés pour les six familles. | Un profil versionné par famille, avec le type fixe validé par le CRT. | 6 profils, dont 3 types distincts pour l'hébergement. |
| CRT-03 | P0 | Définir l'identité lors d'une création et d'une mise à jour : qui produit `SyndicObjectID`, et quels identifiants restent immuables ? | Maintenir un rapprochement durable UUID Bertel ↔ identifiant Tourinsoft ; ne jamais rapprocher par le titre en production. | Les titres servent seulement à l'analyse et comportent des absences/ambiguïtés. |
| CRT-04 | P0 | Définir la portée d'une écriture : patch partiel ou remplacement complet ; sens de `null`, chaîne vide, collection vide et propriété absente. | Omettre une valeur inconnue et n'effacer que sur instruction explicite et idempotente. | Sans cette règle, une synchronisation peut effacer des données CRT. |
| CRT-05 | P0 | Définir la suppression : dépublication, archivage, suppression physique et délai de propagation. | Utiliser une dépublication réversible puis archiver après accusé de réception. | Les flux exposent `Published`/`EnLigne`, mais pas la procédure d'import. |
| CRT-06 | P0 | Définir le propriétaire de chaque champ et la résolution de conflit en synchronisation bidirectionnelle. | Bertel maître des champs édités par l'OTI ; CRT maître des enrichissements régionaux ; journaliser et mettre en revue tout conflit. | Un « dernier écrit gagne » global détruirait les enrichissements de l'autre base. |
| CRT-07 | P0 | Fournir les référentiels inscriptibles et préciser si l'API attend `ThesID`, code, libellé ou une combinaison. | Émettre seulement les codes approuvés et conserver les GUID/labels comme valeurs dérivées. | Les flux répètent code, GUID, libellé, ordre et pictogramme sans indiquer la clé d'écriture. |
| CRT-08 | P0 | Valider le routage des objets Bertel vers Découverte, Hébergement, Information/service, Loisir, Restauration ou Transport. | Router par taxonomie et bordereau ; aucun repli `ACT`/`ASC`, seulement les taxonomies `ACT` Loisir approuvées ; garder les replis `HLO`/`RES` en revue provisoire. | Un même `object_type` Bertel peut apparaître dans plusieurs familles Tourinsoft. |
| CRT-09 | P1 | Confirmer les noms et cardinalités exacts attendus à l'import, y compris les variantes historiques de collections. | Normaliser les alias dans Bertel et restituer le nom exact du profil sur le fil. | `Localisations`/`Localisationss` et plusieurs variantes de `ClassificationCategories` coexistent. |
| CRT-10 | P1 | Valider, famille par famille, les champs obligatoires, recommandés, en lecture seule et calculés par Tourinsoft. | Revoir les 278 chemins `pending_crt`, puis régénérer la liste blanche d'extension ; ne jamais ouvrir les 218 exclusions par défaut. | Les 683 chemins sont déjà classés : 187 approuvés, 278 en attente, 218 exclus. `$metadata` inclut des champs valides mais jamais renseignés dans le snapshot. |
| CRT-11 | P1 | Valider les règles pour descriptions multilingues, HTML/Markdown, tailles maximales et caractères admis. | Exporter du texte nettoyé, conserver la langue et ne pratiquer aucune troncature silencieuse. | Les relations de descriptif sont partagées, mais leur contrat d'import reste inconnu. |
| CRT-12 | P1 | Définir les contacts et données publiables : téléphone, courriel, site, réservation, réseaux sociaux, SIRET et éventuels contacts privés. | N'envoyer que les canaux marqués publics ; pour le SIRET, uniquement un enregistrement légal public/actif normalisé à 14 chiffres ; exclure tout autre JSON juridique, le CRM et les contacts internes. | Les flux publics ne prouvent pas que toutes les données Bertel sont publiables. |
| CRT-13 | P1 | Définir le traitement des photos : upload ou URL, droits, crédit, ordre, expiration, remplacement et suppression. | N'envoyer que les médias publiés, non expirés, avec crédit et droits exploitables. | Une URL lisible ne prouve pas que l'import accepte ou recopie le média. |
| CRT-14 | P1 | Valider les formats et unités des capacités, tarifs, dates, horaires, périodes, latitude/longitude, devise et fuseau. | ISO 8601, fuseau `Indian/Reunion`, EUR explicite, nombres non localisés et contrôles de bornes. | Les six schémas montrent la forme OData, pas toutes les contraintes métier d'écriture. |
| CRT-15 | P1 | Confirmer les règles propres aux familles : classements hébergement, cuisines, accessibilité, sous-catégories d'activités et services de transport. | Maintenir des crosswalks séparés et versionnés par référentiel. | Ces données constituent la principale richesse métier au-delà du noyau commun. |
| CRT-16 | P2 | Fixer fréquence, quota, pagination, idempotence, accusé de réception, reprise sur erreur et éventuels webhooks. | Lot différentiel horaire, idempotency key, retry exponentiel et quarantaine par objet. | Évite doublons et blocage de toute la synchronisation par une fiche invalide. |
| CRT-17 | P2 | Fournir un protocole de recette et les critères de conformité. | Tester création, modification, dépublication et conflit sur au moins un objet de chaque famille, puis comparer la relecture. | La conformité doit être prouvée de bout en bout, pas seulement par validation JSON. |

## Livrables attendus après réponse

1. `field-mapping.csv` validé par le CRT : levée ou exclusion motivée des 278
   lignes `pending_crt`, sans modifier les 218 exclusions techniques sans preuve ;
2. crosswalks validés : codes Bertel ↔ codes/GUID Tourinsoft approuvés et
   version du référentiel ;
3. règles de routage validées par le CRT pour les six profils ;
4. fixtures de recette anonymisées et réponses attendues de l'API d'import ;
5. matrice de propriété des champs pour la synchronisation bidirectionnelle.
