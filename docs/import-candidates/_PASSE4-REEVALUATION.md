# Passe 4 (53 fiches) + Réévaluation du 2026-07-30

> **Fichier local, NON SUIVI par git** (exclu via `.git/info/exclude`), comme les 53 fiches de la passe 4.
> Le `README.md` tracké du dossier ne documente que les passes 1-3 (31 fiches) — volontairement laissé intact pour garder l'arbre git propre.
>
> **Statut de toutes les fiches ci-dessous : À RÉVISER par l'OTI avant tout import. Aucune n'est en base.**

---

## 1. Ce qu'est la passe 4

Produite le **2026-06-26** (run `wf_900b28b7-051`) : 12 lentilles de recherche en parallèle → dédoublonnage code (contre l'inventaire **live** des 4 communes CASUD + les 31 candidates des passes 1-3) → rédaction au gabarit 14 sections (+ géocodage BAN) → vérification adversariale par fiche (existence ≥2 sources, périmètre INSEE, **doublon SQL live**, GPS, complétude).

**73 candidats bruts → 71 uniques → 55 retenues → 53 finalisées** (2 doublons internes retirés).

Périmètre : Le Tampon (97422), Saint-Joseph (97412), Saint-Philippe (97417), Entre-Deux (97403). Règle absolue : **aucune donnée inventée** (tout non confirmé = « Non trouvé — à compléter »). Toutes proposent `status: draft` + `object_org_link [publisher] → OTI du Sud`.

### Les 16 propositions rejetées par la vérif (garantie « pas de doublons »)
Déjà en base / hors périmètre / fermées, confirmé par SQL live : Théâtre Luc Donat (=LOI), Le Jardin des Parfums et des Épices (=LOI), Escale Bleue - Atelier Vanille (=LOI), Maison du Curcuma (=LOI), **Brasserie du Yab (fermée depuis le 20/09/2022)**, La Ferme du Kilimandjaro (=HLO+RES), Ferme Lebon Papillon (=RES+HLO), Chez Jo (=RES), Le Vieux Bardeau (=RES), Le Panoramic (=RES), Hôtel l'Écrin (=HOT), Hôtel Les Géraniums (=HOT), Hôtel Les Embruns du Baril (=HOT), Au pays du mouton blanc (=HLO), + « Vanille 100% Réunion » en PRD.

### Les 2 doublons internes retirés
- `ITI De Bois Court → Voile de la Mariée` : recouvre la candidate **ITI-01** (même tracé). Ses données sont plus riches (Randopitons #1705 : 13,2 km / +860 m / 6 h 30) → **à fusionner dans ITI-01**.
- `PNA Sentier botanique de Notre-Dame de la Paix` : doublon interne de **ITI-07** (mêmes GPS, même fiche Randopitons #1016). Un sentier = ITI.

---

## 2. Réévaluation du 2026-07-30 — contre-vérification web des 53 fiches

Re-recherche web **fraîche** fiche par fiche pour confirmer l'**existence/activité en 2026** et **challenger la pertinence touristique**. 53/53 traitées : 33 par agents indépendants (run `wf_09f065d4-553`) + 20 en vérification directe (le quota de session ayant été épuisé en cours de route).

### Bilan
| Verdict | Nombre |
|---|---|
| ✅ **CONFIRMÉES** (existent + pertinentes) | **42** |
| ⚠️ **À SURVEILLER** (existent, doute documenté) | **9** |
| ⛔ **REJETÉE** (doublon avéré) | **1** — LOI-03 |
| ➖ **Écartement recommandé** (pertinence faible) | **1** — ASC-06 |

→ **51 fiches restent proposables**, dont 9 avec un arbitrage explicite.

### ⛔ LOI-03 « Vanille 100% Réunion » — REJETÉE, doublon avéré
= **« Kaban' à Vanille », déjà en base** (PRD `published`). Preuves du 2026-07-30 (Petit Futé, TripAdvisor, Facebook `@HarryLeichnig`) : **même adresse (48 RN2, Le Baril)**, **même exploitant (Harry Leichnig)**, **mêmes horaires (visites gratuites lun→ven 9h30–17h30)**, **mêmes produits (Vanille Bourbon AB + eau de parfum « Vanille gourmande »)**, **même IGP 2021**.
**Le verdict initial de la lentille PRD était juste ; l'arbitrage de finalisation du 2026-06-26 l'avait écarté à tort en supposant deux opérateurs distincts.** Contenu à réutiliser pour **enrichir** l'objet existant ; « Vanille 100% Réunion » = alias commercial. L'ACTOR « Mr Harry Leichnig » existe déjà → réutiliser.

### ➖ ASC-06 « Gymnase de Vincendo » — écartement recommandé
Équipement réel (gymnase du **lycée** de Vincendo, 1999 ; salle 40×25 m / 500 m², tribune 400 places, mur d'escalade, lun-ven 8h-21h, sam 8h-17h) mais **intérêt visiteur quasi nul** : gymnase scolaire/municipal, sans programmation publique ni billetterie. Ne pas importer sauf décision PO de couvrir les équipements de proximité.

### ⚠️ Les 9 fiches À SURVEILLER
| Code | Doute à trancher |
|---|---|
| **ACT-02** Galops du Sud Sauvage | **Risque de doublon de SITE** : l'EARL « Ferme équestre du Sud Sauvage » (en base, `ACTRUN00000000S3`) est aussi listée au **89 RN2 Basse Vallée** — l'adresse de Galops — et les deux citent **les calèches de Véronique (Galop 5)**. Lecture probable : **un seul site, deux structures juridiques** (EARL exploitation + association loi 1901 affiliée FFE/CRE). Site officiel HS (DNS) ⇒ vérif terrain. **Fusionner dans ASC-03** ou rattacher à l'ACT existant — ne pas créer un 3ᵉ objet. |
| **ACT-01** Equimix | Existe (SIRET 81288028400011 ; 4 imp. des Acacias, 97414 ; association d'équitation) mais **activité 2026 non attestée** par source fraîche ; pertinence moyenne. |
| **ASC-05** Complexe Henri Ganofsky | Réel (inauguré 14/12/2019, ~3 000 m², 690 k€ HT : skatepark + bowl, street workout, aire de jeux, boulodrome ; 1 rue du Centre Nautique) mais **pertinence visiteur faible** → offre famille/proximité. |
| **ITI-06** Dimitile / Sentier Bayonne | Réserves d'itinéraire (voir fiche). |
| **ITI-08** Littoral Le Tremblet → Pointe de la Table | Réserves d'itinéraire (voir fiche). |
| **ITI-09** Tour de la Forêt de Jacques Payet | Réserves + pertinence moyenne. |
| **FMA-07** Manapany Festival | Tenue des éditions récentes à confirmer. |
| **PCU-04** Ancien cimetière de Basse Vallée | Réserve d'accès/statut (voir fiche). |
| **PCU-05** Église paroissiale Saint-Joseph | Réserve documentée (voir fiche). |

### Corrections appliquées DANS les fiches
- **PNA-08 Bassin Bleu** — mise à jour datée : interdictions de baignade **2026 pour qualité d'eau (ARS)**, secteur Passerelle–Embouchure depuis le **26/03/2026 « jusqu'à nouvel ordre »**, **non levée au 30/07/2026**. Le site reste accessible ; seule la baignade est conditionnelle. Même périmètre d'arrêté pour **PNA-12 Trou Noir**.
- **PNA-09 Manapany** — requin juvénile (arrêté n°217 du 04/02/2026) puis **réautorisation mi-février 2026** ; aucun arrêté plus récent trouvé.
- **PCU-08 Église Saint-François de Sales** — **horaires de messes corrigés** (samedi 17h15 ; dimanche 6h15 / 8h15 / 17h15 — ceux de juin étaient périmés) ; **site officiel identifié : `p-stfs.com`** (comblait un « Non trouvé »).
- **ACT-02 / LOI-03 / ASC-06** — bandeaux d'avertissement ajoutés en tête de fiche.

### Confirmations fraîches notables
- **PNA-10 Belvédère de Bois-Court** — passerelle de verre **en exploitation 2026** (la mairie a publié une fermeture exceptionnelle le 1ᵉʳ mai 2026 = preuve d'activité) ; horaires officiels : mar→dim (lundi maintenance), 9h-18h du 1/09 au 30/04 et 9h-17h du 1/05 au 31/08, dernière entrée 20 min avant, fermeture si pluie ou vent > 80 km/h ; **accès toujours gratuit** (aucune décision de tarif trouvée).
- **PCU-09 Usine du Baril** — **inscrite aux Monuments Historiques** : arrêté du **22/03/2022** (ensemble : cheminée + ruines, bâti et archéologique), après le **11/07/2002** (cheminée et terrain) ; notice Mérimée **PA97400067**. Construite 1861-1863 par J.-H. Montbel Fontaine (maire de Saint-Philippe 1842-1850), vendue 1868 au Crédit foncier colonial, fermée 1887, féculerie de manioc en 1919, ruinée par le cyclone de 1932.
- **FMA-05 Saint-Jo** — édition **2026 confirmée les 9, 10 et 19 mars** : « Saint-Jo Marmailles » **sous la Halle François Mitterrand** (9h-16h45) — ce qui **cross-valide VIL-05** — et défilé associatif/civique à 19h30. ⚠️ **Piège d'homonymie : `saintjoseph972.com` = Saint-Joseph de MARTINIQUE**, à ne jamais confondre avec `saintjoseph.re`.
- **Les 4 bureaux OTI (SPU-04..07)** — coordonnées confirmées : Entre-Deux *13 rue Fortuné Hoareau, 0262 39 69 80, lun-sam 9h-12h/13h-17h* ; Saint-Joseph *15 allée du Four à Chaux, Manapany-les-Bains, 0262 37 37 11* (**correspond au mot près à la fiche**) ; Saint-Philippe *41A rue Leconte Delisle, 0262 97 75 84* (horaires divergents entre sources) ; Tampon/Plaine des Cafres *160 rue Maurice et Katia Krafft, Bourg-Murat RN3, 0262 27 40 00, lun-ven 9h-17h*.
- **ACT-03 Langevin Tyroliennes** — actif (224 rue de la Passerelle, 0262 61 00 42 ; offres commerciales en vente ; tyroliennes aquatiques 60 m et 40 m).
- **ACT-04 SpéléoCanyon.re (Julien Dez)** — actif (site `speleocanyon.re` en ligne ; 11 rue Jean Lauret, Entre-Deux ; DE spéléo/canyon + DE alpinisme ; opération « Spéléo-Musique » depuis 2012).
- **LOI-02 Parc des Palmiers** — ouvert et **gratuit** ; 20 ha ; 246 chemin Dassy, Trois-Mares ; horaires saisonniers (1/12→30/04 : 6h-19h ; 1/05→30/11 : 6h30-18h30) ; pique-nique, chiens, vélos et rollers interdits.
- **RES-01 Le Nirvana** — ouvert (1 imp. de la Digue, 0692 35 91 09 ; 444 avis ; TripAdvisor 3,5/5 ; vue sur la cascade Jacqueline). Réserve : **service critiqué** dans les avis récents.
- **RES-02 Restaurant Les Embruns du Baril** — **objet séparé justifié** : l'IRT **et** l'OTI publient une fiche *restaurant* distincte de la fiche *hôtel* (`en-1873816` vs `en-1873814` ; OTI `eta_4542`) ; restaurant gastronomique, fermé dimanche soir et lundi. → **lier** à l'objet HOT déjà en base.
- **LOI-01 Camp Marron** — la fiche localise correctement le musée au **plateau du Guetteur (sommet du Dimitile, ~1794 m)** et non à l'adresse du village : **le piège a été évité** (le « 13 rue Fortuné Hoareau » de certains annuaires est en réalité le bureau de tourisme de l'Entre-Deux). Réserve réelle : **horaires non fiables** (musée tenu par les bénévoles de l'association Le Capitaine Dimitile — appeler le 0692 64 52 75 / 0692 25 10 34 ou l'OT).
- **ASC-04 Auditorium Harry Payet** — réel et actif (176 places ; programmation théâtre/chant/conte/danse + séances de cinéma référencées sur cine974) ; pertinence moyenne. Aucune date à l'affiche sur monticket.re au 30/07.
- **ASC-07 Stade Klébert Picard** — réel (capacité 4 000 dont 3 275 places assises ; 86 bis rue Roland Garros ; antre de l'US Stade Tamponnaise, Réunion Premier League et CAF Champions League) ; pertinence moyenne (matchs ouverts au public, accueille les Foulées des Florilèges).

---

## 3. Inventaire des 53 fiches

| Code | Objet | Commune | Réévaluation 30/07 |
|---|---|---|---|
| PNA-08 | Bassin Bleu (vallée de Langevin) | Saint-Joseph | ✅ (baignade conditionnelle) |
| PNA-09 | Bassin naturel de Manapany-les-Bains | Saint-Joseph | ✅ |
| PNA-10 | Belvédère de Bois-Court | Le Tampon | ✅ passerelle active |
| PNA-11 | Belvédère du Serré (Grand Coude) | Saint-Joseph | ✅ |
| PNA-12 | Cascade du Trou Noir | Saint-Joseph | ✅ (baignade interdite en cours) |
| PNA-13 | Forêt de Mare Longue | Saint-Philippe | ✅ (↔ ITI-02 : site vs sentier) |
| PNA-14 | Pointe de la Table | Saint-Philippe | ✅ (éruption 1986) |
| ITI-05 | Le Coteau Maigre | Le Tampon | ✅ |
| ITI-06 | Le Dimitile par le Sentier Bayonne | Entre-Deux | ⚠️ |
| ITI-07 | Sentier botanique de Notre-Dame de la Paix | Le Tampon | ✅ |
| ITI-08 | Littoral Le Tremblet → Pointe de la Table | Saint-Philippe | ⚠️ |
| ITI-09 | Tour de la Forêt de Jacques Payet | Saint-Joseph | ⚠️ |
| ITI-10 | Tour de Saint-Philippe (Chemin de Ceinture) | Saint-Philippe | ✅ |
| ITI-11 | Roche Plate par la Rivière des Remparts | Saint-Joseph | ✅ |
| ITI-12 | Sentier marron de Grand Coude au Morne Langevin | Saint-Joseph | ✅ |
| VIL-04 | Basse Vallée | Saint-Philippe | ✅ |
| VIL-05 | Bourg de Saint-Joseph (Halle F. Mitterrand) | Saint-Joseph | ✅ (cross-validé par FMA-05) |
| VIL-06 | Bourg de Saint-Philippe | Saint-Philippe | ✅ |
| VIL-07 | La Marine de Langevin | Saint-Joseph | ✅ |
| VIL-08 | La Plaine des Grègues | Saint-Joseph | ✅ |
| VIL-09 | Le Baril (village historique) | Saint-Philippe | ✅ |
| VIL-10 | Manapany-les-Bains (village) | Saint-Joseph | ✅ |
| VIL-11 | Vincendo (bourg et Marine) | Saint-Joseph | ✅ (↔ PNA-04 : bourg vs Marine) |
| FMA-04 | Fête du Lait de la Plaine des Cafres | Le Tampon | ✅ |
| FMA-05 | Fête patronale de Saint-Joseph (Saint-Jo) | Saint-Joseph | ✅ 9/10/19 mars 2026 |
| FMA-06 | Florilèges du Tampon | Le Tampon | ✅ |
| FMA-07 | Manapany Festival | Saint-Joseph | ⚠️ |
| FMA-08 | Marché forain du Tampon | Le Tampon | ✅ |
| FMA-09 | Safran en Fête (Fête du Curcuma) | Saint-Joseph | ✅ |
| FMA-10 | Trans-Dimitile (Trail du Dimitile) | Entre-Deux | ✅ |
| PCU-04 | Ancien cimetière de Basse Vallée | Saint-Philippe | ⚠️ |
| PCU-05 | Église paroissiale Saint-Joseph | Saint-Joseph | ⚠️ |
| PCU-06 | Église paroissiale Saint-Philippe | Saint-Philippe | ✅ |
| PCU-07 | Église Saint-Athanase de Vincendo | Saint-Joseph | ✅ |
| PCU-08 | Église Saint-François de Sales du Tampon | Le Tampon | ✅ corrigée (messes + site) |
| PCU-09 | Usine du Baril (cheminée et vestiges) | Saint-Philippe | ✅ **MH inscrit 2022** |
| ASC-04 | Auditorium Harry Payet | Saint-Joseph | ✅ |
| ASC-05 | Complexe Henri Ganofsky | Saint-Joseph | ⚠️ pertinence faible |
| ASC-06 | Gymnase de Vincendo | Saint-Joseph | ➖ **écarter** |
| ASC-07 | Stade Klébert Picard | Le Tampon | ✅ |
| SPU-04 | BIT OTI Entre-Deux | Entre-Deux | ✅ |
| SPU-05 | BIT OTI Saint-Joseph | Saint-Joseph | ✅ exact |
| SPU-06 | BIT OTI Saint-Philippe (Domaine des Laves) | Saint-Philippe | ✅ |
| SPU-07 | BIT OTI Tampon / Plaine des Cafres | Le Tampon | ✅ |
| ACT-01 | Equimix | Entre-Deux | ⚠️ |
| ACT-02 | Galops du Sud Sauvage | Saint-Philippe | ⚠️ **risque doublon de site** |
| ACT-03 | Langevin Tyroliennes | Saint-Joseph | ✅ |
| ACT-04 | SpéléoCanyon.re (Julien Dez) | Entre-Deux | ✅ |
| LOI-01 | Espace muséographique du Dimitile — Camp Marron | Entre-Deux | ✅ (horaires non fiables) |
| LOI-02 | Parc des Palmiers | Le Tampon | ✅ |
| LOI-03 | Vanille 100% Réunion | Saint-Philippe | ⛔ **REJETÉE (doublon)** |
| RES-01 | Le Nirvana | Saint-Joseph | ✅ |
| RES-02 | Restaurant Les Embruns du Baril | Saint-Philippe | ✅ (lier à l'HOT) |

---

## 4. Notes d'import (rappel)

- Facettes type-spécifiques : ITI → `object_iti` (+ stages) ; FMA → `object_fma` + `object_fma_occurrence` ; ACT/ASC → `object_act` ; PCU/PNA/VIL/SPU/LOI → pas de table facette (classifications/labels génériques).
- Adresses à repasser par la standardisation BAN de l'éditeur (§02) ; plusieurs GPS sont issus de géocodage BAN, d'OSM ou de Randopitons et restent à confirmer.
- Labels revendiqués → mapper vers les codes canoniques `LBL_*` avant écriture en `object_classification`. **PCU-09 : inscription MH (2022) à modéliser.**
- Les acteurs déjà en base (ex. « Mr Harry Leichnig ») doivent être **réutilisés**, jamais recréés.
- **L'import reste verrouillé sur revue humaine OTI** — ces fiches sont des propositions, jamais importées automatiquement.
