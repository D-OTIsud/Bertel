# Borne de recharge TotalEnergies La Châtoire — Le Tampon — SPU (Service public)

> Fiche candidate à l'import — recherche web du 2026-06-11. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : SPU
- name : « Borne de recharge — Station TotalEnergies La Châtoire, Le Tampon »
- status : draft
- commune : Le Tampon (INSEE 97422)
- publisher : object_org_link [publisher] → OTI du Sud
- Sous-catégorie (taxonomy_spu) : electric_charging
- Doublon potentiel en base : aucun repéré (requête du 2026-06-11 sur `object.name` ILIKE borne/recharge/châtoire → 0 résultat ; re-vérifié le 2026-06-11 lors de la vérification adversariale, toujours 0 résultat)
- ⚠️ Ne pas confondre à l'import : il existe une AUTRE borne Freshmile dans le même quartier, « Freshmile - Hyper U - La Chatoire » (parking Hyper U, station distincte — fiche Chargemap séparée) ; la présente fiche concerne uniquement la borne de la station-service TotalEnergies

## Identité
- Chapo : Borne de recharge rapide 50 kW pour véhicules électriques, en accès libre 24h/24 sur le parking de la station-service TotalEnergies de La Châtoire, au Tampon. Réseau Freshmile, prises Combo CCS, CHAdeMO et Type 2.

## Description
Implantée sur le parking public de la station-service TotalEnergies de La Châtoire, avenue de l'Europe au Tampon, cette borne de recharge rapide délivre jusqu'à 50 kW en courant continu. Elle est tri-standard : connecteurs Combo CCS et CHAdeMO pour la charge rapide DC, prise Type 2 (câble attaché) pour la charge AC, complétées d'une prise domestique. Aménagée par TotalEnergies Réunion et opérée par Freshmile (réseau FR*FR1), elle est référencée dans le fichier consolidé national des infrastructures de recharge (IRVE) et accessible en itinérance via les badges et applications compatibles (Freshmile, Chargemap Pass). L'accès est libre, sans réservation, 24h/24 et 7j/7 ; la recharge est payante. Située sur l'axe de la RN3, elle constitue un point de recharge utile pour les visiteurs du Sud en route vers les hauts du Tampon, la Plaine des Cafres et le massif du volcan.

## Adresse & localisation (object_location)
- Adresse : 2 avenue de l'Europe, station-service TotalEnergies La Châtoire (implantation : parking public)
- Code postal / ville : 97430 Le Tampon
- GPS (WGS84) : -21.28043, 55.5014 — source : fichier consolidé IRVE Etalab (data.gouv.fr), champ `coordonneesXY` ; coordonnées non re-vérifiées par Etalab (flag `consolidated_is_lon_lat_correct = false`, code INSEE absent du flux source) — à confirmer sur le terrain

## Contacts (object_contact)
- Gestionnaire / exploitant : aménageur TotalEnergies Réunion (« Total Réunion ») ; opérateur de recharge Freshmile (réseau FR*FR1) — contact opérateur : roaming@freshmile.com (source : IRVE consolidé)
- Téléphone : station : Non trouvé — à compléter ; service client mobilité électrique TotalEnergies Réunion : 02 62 55 20 20 (appel gratuit, lun.–ven. 8h–16h, contact réseau, source : services.totalenergies.re)
- E-mail support e-mobilité TotalEnergies Réunion : support.emobilite.re@totalenergies.com (contact réseau, source : services.totalenergies.re, consulté le 2026-06-11)
- Site web / appli : https://services.totalenergies.re/mon-vehicule/bornes-electriques ; application Freshmile (Charge) pour le lancement et le paiement de la charge

## Horaires (object_opening)
24/7 — accès libre, sans réservation (source : IRVE consolidé Etalab, champs `horaires` = « 24/7 » et `condition_acces` = « Accès libre »)

## Coût (object_price)
Payant (IRVE consolidé : `gratuit = false`). Tarif exact : Non trouvé — à compléter. Paiement via les solutions d'itinérance de l'opérateur (badge/application Freshmile, Chargemap Pass…) — IRVE : `paiement_autre = true`, pas de paiement CB sur ce point de charge (`paiement_cb = false`) ; le réseau TotalEnergies Réunion annonce par ailleurs CB et carte de mobilité au niveau réseau (à vérifier pour cette borne).

## Données spécifiques SPU
- Sous-catégorie taxonomy_spu : electric_charging
- Accès : 24/7, accès libre, sans réservation (IRVE consolidé)
- Coût : payant ; tarif exact Non trouvé — à compléter
- Accessibilité PMR : Non trouvé (« Accessibilité inconnue » dans l'IRVE consolidé)
- Gestionnaire / exploitant : aménageur TotalEnergies Réunion ; opérateur de recharge Freshmile (FR*FR1)
- Caractéristiques techniques :
  - Puissance nominale : 50 kW (IRVE consolidé ; confirmée par la liste officielle TotalEnergies Réunion « La Châtoire (50 kW) » et par la fiche Mappy)
  - Type de prises : Combo CCS, CHAdeMO, Type 2 (câble T2 attaché), prise domestique (type EF)
  - Nombre de points de charge : 1 (id PDC itinérance : FRFR1EAFTQ1 ; id station itinérance : FRFR1P6126329391675602124)
  - Opérateur / réseau : Freshmile (FR*FR1), enseigne « Freshmile France » ; station hébergée par la station-service TotalEnergies La Châtoire
  - Itinérance : oui — station référencée au consolidé national via la plateforme GIREVE ; badges/applications d'itinérance acceptés (mention « méthode de paiement du fournisseur » sur Mappy)
  - Restriction de gabarit : non précisée ; station non dédiée deux-roues (IRVE consolidé)

## Accessibilité
Non trouvé — « Accessibilité inconnue » dans l'IRVE consolidé ; aucune mention PMR sur les autres sources consultées.

## Données manquantes / à vérifier
- Tarif exact de la recharge (€/kWh ou €/min) — non publié dans l'IRVE ni sur le site TotalEnergies Réunion ; à relever via l'application Freshmile ou sur place
- Date de mise en service — non renseignée dans l'IRVE (la station figure au consolidé depuis mars 2023 ; dernière mise à jour opérateur du 2025-10-01)
- Accessibilité PMR de l'emplacement
- Coordonnées GPS à confirmer sur le terrain (flag Etalab `consolidated_is_lon_lat_correct = false` ; cohérentes toutefois avec le quartier de La Châtoire)
- Téléphone direct de la station-service hôte
- Moyens de paiement effectifs sur place (CB annoncée au niveau réseau TotalEnergies, mais `paiement_cb = false` pour ce point dans l'IRVE)
- État de fonctionnement réel au jour de l'import (donnée IRVE statique ; vérifier la disponibilité dans l'app Freshmile ou Chargemap)

## Sources
- Fichier consolidé des bornes de recharge pour véhicules électriques (IRVE) — Etalab / data.gouv.fr, interrogé via l'API tabulaire (ressource `eb76d20a-8501-400e-b336-d85724de5435`, enregistrement PDC `FRFR1EAFTQ1`, flux GIREVE, dernière modification 2026-05-15) — https://www.data.gouv.fr/fr/datasets/fichier-consolide-des-bornes-de-recharge-pour-vehicules-electriques/ — consulté le 2026-06-11
- Bornes électriques | TotalEnergies Réunion (liste des stations équipées : « La Châtoire (50 kW) » ; moyens de paiement ; contact 02 62 55 20 20) — https://services.totalenergies.re/mon-vehicule/bornes-electriques — consulté le 2026-06-11
- Freshmile - Borne de recharge, Avenue de l'Europe, 97430 Le Tampon — fiche Mappy (50 kW ; prises CHAdeMO, Type 2, Combo, domestique ; réseau Freshmile ; sans restriction) — https://fr.mappy.com/poi/67c6f9291dbac130577327a5 — consulté le 2026-06-11
- Station-service TotalEnergies La Chatoire, 2 Avenue de l'Europe, Le Tampon — Waze (confirmation de l'adresse de la station hôte) — https://www.waze.com/live-map/directions/station-service-totalenergies-la-chatoire-avenue-de-leurope-2-(le)-tampon?to=place.w.36374067.363740672.17515312 — consulté le 2026-06-11 (via résultats de recherche)
- Freshmile - TotalEnergies, La Châtoire : borne de recharge à Le Tampon, Réunion — Chargemap (page existante confirmant la borne ; contenu détaillé non consultable automatiquement, accès bloqué) — https://chargemap.com/fr-fr/freshmile-avenue-de-l-europe-le-tampon.html — consulté le 2026-06-11
