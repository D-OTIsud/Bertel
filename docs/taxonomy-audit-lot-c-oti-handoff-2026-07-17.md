# §187 — Lot C : arbitrages à trancher par l'OTI

> Source : audit taxonomique tous domaines `docs/taxonomy-audit-all-domains-2026-07-17.md` (§C).
> Lots A et B ont été appliqués sur live le 2026-07-17 (voir décision log §188). Ce lot C ne
> comporte AUCUNE correction SQL — il attend une réponse de l'OTI par fiche avant toute action.
> Remplacer `<URL_APP>` ci-dessous par le domaine réel de l'Explorer avant diffusion.

Merci de compléter les 3 colonnes **Décision / Commentaire / Qui a vérifié** pour chaque ligne,
puis de renvoyer ce tableau. Chaque fiche est visible via son lien Explorer.

## 1. Fiches à statuer individuellement (16)

| Fiche | Type | Situation | Options | Décision | Commentaire | Qui a vérifié |
|---|---|---|---|---|---|---|
| [NANA BARKET & FASTFOOD](<URL_APP>/?fiche=RESRUN00000000SH) (`RESRUN00000000SH`, service_de_livraison) | RES | Fastfood ; livraison peut être réelle | snack_bar ou garder | | | |
| [Ti Macaron PéÏ](<URL_APP>/?fiche=RESRUN000000016J) (`RESRUN000000016J`, salon_de_the) | RES | « Biscuiterie artisanale » | garder salon_de_the / PRD produits_terroir | | | |
| [Irise Traiteur](<URL_APP>/?fiche=RESRUN00000000PO) (`RESRUN00000000PO`, restaurant) | RES | Traiteur qui accueille aussi sur place | traiteur ou garder | | | |
| [Pizzeria La Gondole](<URL_APP>/?fiche=RESRUN0000000107) (`RESRUN0000000107`, restaurant) + [L'Impériale Pirun Pizzeria](<URL_APP>/?fiche=RESRUN0000000119) (`RESRUN0000000119`, restaurant) | RES | Noms « pizzeria », descriptions « restaurant-pizzeria » | pizzeria (harmonisation) ou garder | | | |
| [Le Tinto](<URL_APP>/?fiche=RESRUN00000000PR) (`RESRUN00000000PR`, restaurant) | RES | « Crêperie... cuisine savoyarde » | creperie ou garder | | | |
| [Snack Le Boi Zoly](<URL_APP>/?fiche=RESRUN00000000PW) (`RESRUN00000000PW`, restaurant) | RES | Nom « Snack » | snack_bar ou garder | | | |
| [Dolly La Fêe](<URL_APP>/?fiche=RESRUN00000000TJ) (`RESRUN00000000TJ`, atelier_cuisine) | RES | « Cuisine végétale » — atelier ou chef ? | garder / chef_a_domicile | | | |
| [Les Crins de Bel Air](<URL_APP>/?fiche=LOIRUN00000000VM) (`LOIRUN00000000VM`, centre_d_equitation) | LOI | Ferme pédagogique + élevage | garder (pas de code « ferme pédagogique ») | | | |
| [Association Aster Lontan](<URL_APP>/?fiche=LOIRUN000000018U) (`LOIRUN000000018U`, art_artisanat) | LOI | Promotion du patrimoine culturel | patrimoine_culturel ou garder | | | |
| [Sucette péï](<URL_APP>/?fiche=LOIRUN0000000170) (`LOIRUN0000000170`, atelier) | LOI | Sucettes personnalisées + ateliers + impression | garder | | | |
| [Couleurs du Sud Sauvage - EXCURSIONS](<URL_APP>/?fiche=ORGRUN000000014S) (`ORGRUN000000014S`, private_driver) | PSV | « Excursions, découverte de l'île » | tourist_excursion_transport ou garder | | | |
| [Austral Taxis Réunion](<URL_APP>/?fiche=ORGRUN000000012R) (`ORGRUN000000012R`, tourist_excursion_transport) | PSV | Taxi qui fait aussi de l'excursion | garder | | | |
| [L'Or du Temps](<URL_APP>/?fiche=HLORUN00000001B8) (`HLORUN00000001B8`) | HLO | Sans sous-catégorie, description sans indice de forme | à renseigner par l'éditeur de la fiche | | | |
| [La Kaz Bon Dimanche](<URL_APP>/?fiche=HLORUN00000001BF) (`HLORUN00000001BF`) | HLO | Sans sous-catégorie, description sans indice de forme | à renseigner par l'éditeur de la fiche | | | |
| [Zévi sur Mer](<URL_APP>/?fiche=HLORUN00000000NU) (`HLORUN00000000NU`, chambre) | HLO | Code vague (1 usage) | chambre_d_hotes ? à vérifier | | | |
| [Bungalow Ti Kaz Misouk](<URL_APP>/?fiche=HLORUN000000015Y) (`HLORUN000000015Y`, studio) | HLO | Nom dit bungalow, code dit studio | vérifier la forme réelle | | | |

## 2. Doublons homonymes même type (fusion/archivage — 3 paires)

| Paire | Fiche A | Fiche B | Décision (garder A / garder B / les deux sont légitimes) | Commentaire | Qui a vérifié |
|---|---|---|---|---|---|
| Auberge de campagne Les 4 Saisons (HLO, Le Tampon) | [`HLORUN00000000WW`](<URL_APP>/?fiche=HLORUN00000000WW) (1 média) | [`HLORUN000000019T`](<URL_APP>/?fiche=HLORUN000000019T) (0 média) | | Doublon quasi certain | |
| La Caverne des Hirondelles (HLO, Saint-Joseph) | [`HLORUN00000000PD`](<URL_APP>/?fiche=HLORUN00000000PD) | [`HLORUN00000000PX`](<URL_APP>/?fiche=HLORUN00000000PX) | | | |
| La Rose du Sud (HLO, Saint-Joseph) | [`HLORUN00000000RO`](<URL_APP>/?fiche=HLORUN00000000RO) (7 médias) | [`HLORUN00000000RQ`](<URL_APP>/?fiche=HLORUN00000000RQ) (5 médias) | | Possiblement deux unités légitimes distinctes | |

**Si fusion demandée** : la fiche archivée n'est **jamais** supprimée directement (`DELETE FROM object`
interdit) — elle est mise `status='archived'` ; une suppression définitive passe par la voie unique
`api.rpc_delete_object` (§108, superuser).

## 3. Cas frontière type LOI/ASC (1)

| Fiche | Code LOI actuel | Options | Décision | Commentaire | Qui a vérifié |
|---|---|---|---|---|---|---|
| [Bouillon d'Aventure](<URL_APP>/?fiche=LOIRUN00000000YR) (`LOIRUN00000000YR`) | terre | ASC `sports_club` (séjours multi-activités + natation enfants/adultes) — ou rester LOI `divertissement` | | | |

---

À réception des réponses, les décisions seront appliquées avec le même pattern que le lot A
(migration `migration_taxonomy_audit_lot_c.sql`, idempotente, gardes fail-closed).
