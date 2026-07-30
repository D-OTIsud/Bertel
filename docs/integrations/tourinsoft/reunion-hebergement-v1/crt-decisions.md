# Décisions et questions CRT

## Décisions prouvées par le flux

| Date | Sujet | Décision candidate | Preuve |
|---|---|---|---|
| 2026-07-30 | Périmètre | Le premier contrat couvre HOT, HLO et CAMP. | 7 identifiants HOT, 201 HLO, 3 CAM dans le flux. |
| 2026-07-30 | Camping | Le code d’identifiant/bordereau observé est `CAM`; Bertel conserve `CAMP` en source. | Préfixes `CAM` et catégorie `CAMP`. |
| 2026-07-30 | Confidentialité | Raison sociale et SIRET sont exclus du contrat candidat. | Absence d’exigence d’import et caractère potentiellement non public. |
| 2026-07-30 | Propriétés auxiliaires | IDs/ordres de lignes, GUIDs de thésaurus, pictogrammes et tracking TIS ne créent pas de champs Bertel. | Données techniques répétées dans les collections. |

## Questions bloquant la qualification « import compatible »

- Quel endpoint d’écriture, quelle authentification et quels quotas le CRT met-il à disposition ?
- La structure d’import reprend-elle exactement les noms/casses du flux de syndication ?
- Quelles propriétés et collections sont obligatoires ? Quelle convention pour `null`, chaîne vide et tableau vide ?
- Bertel peut-il conserver son identifiant dans `SyndicObjectID` ? Comment sont gérées création et mise à jour idempotente ?
- Quels GUIDs/codes de thésaurus sont obligatoires à l’écriture, et les codes suffisent-ils sans `ThesID` ?
- Comment HPA et RVA doivent-ils être classés dans la base CRT Réunion ?
- Quelles limites s’appliquent aux photos (nombre, poids, dimensions, droits, durée de disponibilité) ?
- Quelle opération représente une dépublication ou une suppression ?
- Quelle source gagne lors d’une modification concurrente Bertel/CRT ?
- Où placer les données Bertel plus riches : chambres, lits, salles de réunion, conditions de séjour et remises ?

## Valeurs réellement utilisées mais sans crosswalk approuvé

Rapport transactionnel exécuté le 2026-07-30 sur les hébergements publiés du projet lié :

| Domaine | Code Bertel | Libellé | Fiches | Décision attendue |
|---|---|---|---:|---|
| langue | `zh` | Chinois | 1 | code/GUID CRT à fournir |
| paiement | `apple_pay` | Apple Pay | 1 | code/GUID CRT ou exclusion explicite |
| paiement | `mastercard` | Mastercard | 9 | confirmer si inclus dans « Cartes bancaires » (`CB`) ou valeur distincte |
| paiement | `tickets_restaurant` | Tickets restaurant | 1 | code/GUID CRT ou exclusion explicite |

Ces valeurs ne sont ni envoyées sous leur code Bertel ni remplacées par un libellé libre. Elles
restent visibles dans `api.tourinsoft_reunion_unmapped_values()` jusqu'à décision CRT.

## Historique des réponses CRT

À compléter avec une date, un auteur, la décision et le lien vers le bordereau ou la documentation reçue.
