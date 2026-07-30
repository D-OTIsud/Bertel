# Contrat candidat Tourinsoft — Réunion hébergement v1

Ce dossier décrit la variante opt-in `?format=tourinsoft&variant=reunion-hebergement-v1`.
Il est construit à partir du flux public `FSHebergementOTISud` fourni par le CRT Réunion.

- `source-schema.json` inventorie la forme observée sans recopier les 211 fiches.
- `field-mapping.csv` classe chaque propriété : approuvée, en attente CRT ou exclue.
- `value-crosswalk.csv` contient uniquement les traductions de codes prouvées par le flux et les référentiels Bertel.
- `crt-decisions.md` porte les décisions qui conditionnent la conformité à un futur import.

Le flux analysé est un flux de lecture. Ce contrat ne vaut pas certification d’écriture dans Tourinsoft tant que le CRT n’a pas fourni et validé son contrat d’import.

## Forme émise

Une clé scalaire sans valeur est omise. Une collection sans valeur est omise ; lorsqu'elle est
présente, elle est toujours un tableau. Les tableaux sont dédupliqués et ordonnés de façon stable.
Toutes les sources sont publiques ; les contacts privés, médias privés/non publiés/expirés et les
données CRM ou juridiques non approuvées sont exclus avant sérialisation.

| Collection | Cardinalité | Contenu approuvé |
|---|---|---|
| racine | 1 | identité stable, bordereau/GUID CRT, publication/mise à jour, adresse et géolocalisation |
| `Access` | 0..n | plan d'accès, Markdown retiré |
| `Descriptifss` | 0..n | accroche et description commerciale publiques |
| `Moyencommunications` | 0..n | valeur publique + type de communication traduit |
| `Reseauxsociauxs` | 0..n | URL publique + plateforme traduite |
| `Reservations` | 0..n | liens de réservation publics |
| `Photos` | 0..n | URL, titre, crédit, id et fin de droits des médias publiables |
| `LanguesParleess` | 0..n | code et libellé CRT via crosswalk |
| `ModesPaiements` | 0..n | code et libellé CRT via crosswalk |
| `Animauxacceptess` | 0..n | acceptation et conditions publiques |
| `Capacites` | 0..n | personnes, lits, chambres, surface et présence de salle de réunion |
| `Capacitecampings` | 0..n | capacité, emplacements et surface, uniquement pour CAMP |
| `Horairearriveedeparts` | 0..n | arrivée, arrivée maximale et départ |
| `Tarifs` | 0..n | minimum/maximum, période de validité et complément |
| `PeriodeOuvertures` | 0..n | début et fin des périodes non fermées |

Le détail champ par champ, y compris la source Bertel, la transformation, la confidentialité et la
preuve dans le flux, est dans `field-mapping.csv`.

Régénération et contrôle :

```powershell
node tools/tourinsoft/build-contract.mjs --source=outputs/019fb14c-4037-7712-8d37-8b3a387f3c29/tourinsoft_reunion_schema.json
node tools/tourinsoft/check-contract.mjs
```
