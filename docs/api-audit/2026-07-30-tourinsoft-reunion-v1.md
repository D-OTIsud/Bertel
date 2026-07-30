# Livraison candidate — Tourinsoft CRT Réunion hébergement v1

Date : 2026-07-30
Statut : **implémenté et testé, non déployé, pilote CRT à organiser**

## Résultat livré

- Variante partenaire opt-in : `format=tourinsoft&variant=reunion-hebergement-v1`.
- Compatibilité : l'absence de `variant` conserve `legacy-v1` et son sérialiseur historique.
- Périmètre : fiches publiées HOT, HLO et CAMP ; CAMP est traduit vers le bordereau régional CAM.
- Détail et liste : même document Tourinsoft ; batch set-based borné à 200 ids.
- Sécurité : contacts publics uniquement, médias publiés/publics/non expirés, aucune donnée CRM,
  privée ou juridique non approuvée.

## Contrat et couverture

Le schéma du flux CRT fourni a été gelé sans versionner les 211 fiches sources. Les 314 propriétés
observées sont toutes classées dans `docs/integrations/tourinsoft/reunion-hebergement-v1/` :

| Statut | Nombre | Conséquence |
|---|---:|---|
| `approved` | 55 | Émis par la variante et couvert par les tests |
| `pending_crt` | 96 | Non émis tant que le CRT n'a pas confirmé le contrat |
| `excluded` | 163 | Auxiliaire, technique, privé ou sans valeur métier de synchronisation |

Les 30 correspondances de valeurs approuvées sont documentées dans `value-crosswalk.csv` et
chargées dans `public.ref_interop_value_crosswalk`. Le rapport
`api.tourinsoft_reunion_unmapped_values()` rend visibles les codes utilisés mais non mappés.

## Validation exécutée

- `node tools/tourinsoft/check-contract.mjs` : 314/314 propriétés classées, 30 crosswalks valides.
- Migration compilée sur le PostgreSQL 17 du projet lié dans une transaction annulée.
- Test SQL transactionnel complet vert : compatibilité legacy, HOT/HLO/CAMP, confidentialité,
  Markdown, crosswalks, gate publié, déduplication, limite batch et parité unitaire/batch.
- Tests Jest ciblés des deux routes et de l'auth partenaire verts ; TypeScript `--noEmit` vert.
- OpenAPI, guide partenaire, collection Postman et manifeste fresh-apply alignés sur la variante.
- Mesure transactionnelle sur le corpus lié : **40,13 ms** pour une fiche et **1 061,83 ms** pour
  200 documents, hors temps de connexion CLI ; les budgets initiaux de 150 ms / 2 s sont tenus.
- Le rapport runtime remonte quatre valeurs sans crosswalk approuvé : langue `zh` (1 fiche),
  paiements `apple_pay` (1), `mastercard` (9) et `tickets_restaurant` (1). Elles sont omises sans
  fallback silencieux et consignées comme décisions CRT à obtenir.

Aucune migration ni fixture n'a persisté sur le projet lié pendant ces validations.

## Points à faire valider par le CRT

Le flux fourni est un flux de lecture. Il ne prouve pas le contrat d'écriture/import. Avant un test
d'alimentation, le CRT doit confirmer : endpoint et authentification, champs obligatoires,
cardinalités et représentation des absences, identifiant maître, thésaurus/GUID, règles photos,
dépublication/suppression et priorité de source en cas de conflit.

## Exploitation pilote

1. Déployer la migration sans changer la variante par défaut.
2. Produire un export miroir HOT/HLO/CAMP et le rapport des valeurs non mappées.
3. Faire valider un échantillon riche par le CRT, sans écriture dans Tourinsoft.
4. Tester ensuite un bac à sable d'import si le CRT en fournit un.
5. Promouvoir la variante seulement après validation écrite ; le repli immédiat reste
   `variant=legacy-v1`.

Pour la synchronisation, parcourir `/objects` au curseur, faire un upsert par id, réconcilier le
corpus publié pour détecter les dépublications et consommer `/objects/deletions` pour les
suppressions définitives.
