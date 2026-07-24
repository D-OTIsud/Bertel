# Décision PO signée — Taxonomie HLO nature/forme (§190)

**Date** : 2026-07-24
**Statut** : VALIDÉ — sans exception
**Support** : `docs/taxonomy-hlo-po-arbitrage-2026-07-24.md`
**Manifeste exécutable** : `Base de donnée DLL et API/taxonomy_nature_forme_manifest_20260724.sql`

## Décision reçue

> Je valide toutes les recommandations du support §190, sans exception. Entr’Deux Gones reste chambre_d_hotes. Je confirme les trois fiches du pool en bungalow.

## Traduction exécutable

- PO-1 : les 14 décisions de nature suivent toutes la recommandation du support ; Entr’Deux Gones reste `chambre_d_hotes` et les trois insolites conservent leur code sous la branche Chambre d’hôtes.
- PO-2 : les 16 `gite_villa` sans signal vont sur `location_saisonniere`.
- PO-3 : les 10 `bungalow_chalet` sans signal vont sur `location_saisonniere`.
- PO-4 : `gite_rural` est conservé ; `cottage` est fondu dans `maison` ; `rez_de_chaussee_d_une_maison` est fondu dans `appartement`.
- PO-5 : le module Listes conserve « Location » / « Rental ».
- PO-6 : mappings DATAtourisme validés tels que proposés dans le support.
- PO-7 : communication partenaires validée (pré-annonce, bump `updated_at`, confirmation et re-pull `/catalog`).
- PO-8 : crosswalk avec FK composite `(taxonomy_domain, taxonomy_code)` et contrôle de paire NULL.
- Pool : Gîte du Malmany, Cap Vanisa et Manapany Lodge vont en `bungalow`.

## Comptes gelés

- 199 lignes automatiques publiées + 1 porteur archivé technique, source `taxonomy_nature_forme_20260724` ;
- 40 arbitrages nominatifs validés ;
- 3 fusions PO-4 validées ;
- 43 lignes PO au total, source `taxonomy_nature_forme_arbitrage_20260724` ;
- 243 objets uniques dans le manifeste ;
- 231 porteurs publiés ou archivés des deux feuilles legacy `gite_villa` / `bungalow_chalet` couverts exactement une fois.

Le porteur technique supplémentaire est `HLORUN00000000PX` (La Caverne des Hirondelles), archive déjà validée comme doublon au §189. Il est rangé sur `location_saisonniere` uniquement pour libérer `gite_villa` avec une garde zéro-porteur ; il n’a aucun impact public.

Cette décision autorise la construction et la validation repo-first de la migration. L’application cloud reste soumise aux gardes de dérive et aux critères T1–T10 du plan.
