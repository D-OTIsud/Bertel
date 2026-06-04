# Database Object Content Audit - 2026-06-04

Audit method:
- Objects were enumerated with Supabase MCP.
- Each visible object was read through `api.get_object_resource(...)` with the app user's JWT claim set in the MCP SQL context.
- API-readable scope: 848 objects.
- Coverage by status/type after API read: 373 published, 474 draft, 1 archived.

## Corrections Applied

| Object | Field | Before | After |
| --- | --- | --- | --- |
| `HLORUN0000000133` - Toi + Moi | `object_description.description` | `Meublé de de Tourisme  Toi   Moi ... jardin..` | `Meublé de Tourisme Toi + Moi ... jardin.` |
| `HLORUN0000000133` - Toi + Moi | `object_location.address1` | `; D36` | `D36` |
| 260 objects | `object_location.address1` | Doubled spaces and/or `Blvrd de l'Ocean` style address text | Collapsed whitespace; normalized `Blvrd` to `Boulevard`; normalized `Ocean` to `Océan` in address lines. |
| `ACTRUN00000001AO` - Spéléolave | `object_description.description` | Double spaces, `manière régulières`, `DECOUVERTE`, extra spaces before `)` | Normalized spacing, agreement, accents, and parenthesis spacing. |
| `HLORUN00000000RL` - Maison Chamelle | `object_description.description` / `description_chapo` | `location tres interessante...`; `Maison creole a 2 niveaux ,convient a...` | `Location très intéressante...`; `Maison créole à 2 niveaux, convient à...` |
| `HLORUN00000000SB` - Les Cazes de la Mer Cassée | `object_description.description` | `toute commodités`, `foret`, `La maison et toute équipée`, punctuation/capitalization issues | Corrected agreement, accents, punctuation, and `Jacuzzi`. |
| `HLORUN000000013S` - La Table des Randonneurs | `object_description.description` | `Cuisine équipée.. .`; `table d'hôte` | `Cuisine équipée.`; `table d'hôtes`. |
| `HLORUN000000013Y` - Héritage Écolodge & Spa | `object_description.description` / `description_chapo` | `HEBERGEMENTS`, spacing/agreements, missing hyphens in `ressourcez vous` / `laissez vous` | Corrected accents, spacing, agreement, and hyphenation. |
| 30 objects | `object_location.direction` | Doubled literal spaces | Collapsed repeated spaces while preserving line breaks. |
| 116 rows | `object_description` text fields | Doubled literal spaces | Collapsed repeated spaces in description text fields while preserving line breaks. |
| 74 objects | `object_location.direction` | Common direction typos: `rond point`, `centre ville`, `rendez vous`, `Apres`, `st pierre/joseph/philippe`, `ce trouve`, `dessuite`, `jusquau`, `Air de pique-nique` | Corrected to `rond-point`, `centre-ville`, `rendez-vous`, `Après`, `Saint-*`, `se trouve`, `de suite`, `jusqu'au`, `Aire de pique-nique`. |
| 9 objects | `object_description.description` / `description_chapo` | Broken punctuation and obvious French spelling/agreement issues including `... .`, `… .`, `vis-à-vis..`, `sud de île`, `propriétés..`, `petits dris`, and space-before-period defects | Corrected punctuation, accents, agreement, and readable phrasing for Aquasens, Villa Letchi, Villa Saint Jo, L'Horizon Bleu, La Case O Gecko, BAN'VERTE, Z'Escargots des Hauts, Côté Sauvage, and La Ferme du Pêcher Gourmand. |
| `HLORUN00000000PD` - La Caverne des Hirondelles | `object.name` | `La Caverne  des Hirondelles` | `La Caverne des Hirondelles` |
| `ORGRUN000000014S` - Couleurs du Sud Sauvage - EXCURSIONS | `object.name` | `Couleurs du Sud Sauvage -  EXCURSIONS` | `Couleurs du Sud Sauvage - EXCURSIONS` |
| 57 rows | `object_description.description` / `description_chapo` | Space before final periods, such as `confort .` or `séjour .` | Removed literal spaces/tabs before periods. |
| `HLORUN00000000W4` - Lékazaline | `object_description.description` | `accueillir.Pour` plus local wording issues such as `vous ai fournis`, `micro onde`, `vaisselles`, `a disposition` | Corrected sentence spacing and obvious spelling/wording issues in the same local paragraph/list. |
| `HLORUN000000015T` - Chez Titi | `object_description.description` | `bébé.Une sale à mangé`, `entré privé`, punctuation around commas | Corrected to `bébé. Une salle à manger`, `entrée privée`, and normalized the sentence. |
| `RESRUN0000000118` - Happy Time Run | `object_description.description_chapo` | `Happy Time.Run` | `Happy Time Run` |
| 74 rows | `object_description.description` / `description_chapo` | Common French compound-term variants: `micro onde(s)`, `four micro-onde`, `grille pain`, `lave vaisselle`, `lave linge`, `sèche linge`, `rez de chaussée`, `plein pied`, `centre ville`, `week end` | Normalized to `micro-ondes`, `four micro-ondes`, `grille-pain`, `lave-vaisselle`, `lave-linge`, `sèche-linge`, `rez-de-chaussée`, `plain-pied`, `centre-ville`, `week-end`. |
| 49 rows | `object_description.description` / `description_chapo`; `object_location.direction` | Abbreviated or unhyphenated Réunion place names such as `St Joseph`, `Saint Pierre`, `Saint Philippe`, `Saint Denis`, `Saint Benoit`, `Saint Leu`, `Saint Paul`, and `Étang Salé` | Normalized to canonical forms such as `Saint-Joseph`, `Saint-Pierre`, `Saint-Philippe`, `Saint-Denis`, `Saint-Benoît`, `Saint-Leu`, `Saint-Paul`, and `Étang-Salé`. |
| 9 rows | `object_description.description` / `description_chapo` | Missing circumflex in island-name phrases such as `ile de la Réunion`, `Ile de la Réunion`, and `ILE DE LA REUNION` | Corrected to `île de la Réunion`, `Île de la Réunion`, or `ÎLE DE LA RÉUNION` while leaving standalone brand/email `REUNION` strings unchanged. |
| 9 objects | `object_description.description` / `description_chapo` | Targeted obvious spelling/grammar defects including `sans vis à vis`, `jaccuzi`, `decembre`, `DESCRIPTION DETAILLEE`, `pique nique`, `manifiques`, `entiérement`, `Situer au 24eme kilomètres`, `Il à était`, `proposons proposons`, `Ferme,Le Rond`, and `seront très certainement ravir` | Corrected the selected API-visible text for Le Nid d'Amour, La Tomie, Ti'Kaz Sauvage, Grand Natte, Magnifique maison dans le sud sauvage, La Maison des Camélias, Joseph Henri Hoarau, Atelier Palmiste Rouge, and Le Rond de Basse Vallée. |
| 10 objects | `object_description.description` / `description_chapo` | Targeted lodging-copy issues including `10kgs`, `multi activité`, comma spacing, `UNE RESIDENCE`, `vous bercent`, `micro-onde`, `pièce principal`, `2 chambres double`, `océan indien`, `linge de toilettes`, `jeux de sociétés`, `160X200`, `SPA`, `de d’octobre à Mai`, `non fumeurs`, `réhausseur`, `ustensile de cuisine`, and `canapé lit` | Corrected the selected API-visible text for Ti Kaz Trankil, Les Terrasses de Manapany - Studio Vacoa, Les Palmistes, Couleurs du Sud Sauvage units Cap Jaune / Palmiste rouge / Bassin Bleu, Rose du Sud, Bienvenue dans le Sud de la Réunion, KAZ EMARA, and Gîte Des Orchidées. |
| 17 objects | `object_description.description` / `description_chapo` | Next-slice lodging-copy issues including `UNE RESIDENCE`, `vous bercent`, `conçue`, `Linges de maison`, `paranoramique`, `l'ocean`, `spendide levé`, `vous attends`, `gratuitements`, `Weekend`, `15jours`, `1600m`, duplicated `location saisonnière`, `propriètaire`, `wifi.,`, `160X200`, `cozy`, `balancoire`, `FETE`, `d une capacité`, `Les chambres privées se trouve`, and missing apostrophes in `d architecte` / `d éléments` | Corrected the selected API-visible text for Kaz Cyatheas, Les Terrasses de Manapany - Villa Moringa, Le Corossol, Le Flamboyant, Villa Nick & Yv, Le Ti Loryo, Kazalilas, France May LEBRETON, Rev'Horizon, L'Aquilégia, Meublé des Neiges, Villa Ti MoOn, Cœur Créole, L'Escala, La Case Charmante, L'Avocat Bleu, and L'Antre du Fouquet. |
| 14 objects | `object_description.description` / `description_chapo` | Next API slice lodging-copy issues including `40euro`, `Grand-Bassin ou l’accès`, `chacune d’elle`, `l’ espace Spa`, `15 mns`, `sous sol`, `pic-nics`, `de l'Ile`, `St-Louis`, `15€`, `formule sucré`, punctuation around Tikalikata listing text, `3chambres équipe`, `gaziniere`, `veinoisseri fais maison`, `séjourné gratuitement sli`, `50m2`, `140x190cm`, `Toilette indépendant`, `fibre internet , wifi`, `aout`, `vaisselles`, `éteignez les`, `pic-nic`, and `jardin arborée` | Corrected the selected API-visible text for Le Chalet Co Gite, Parenthèse Inattendue, Chez M. Cassier Michel, La Rose du Sud room record, Villa Tikalikata, Les Chalets à l'Orée du Bois - Le grand chalet, Ti Kaz Payet, Ti'Kaz Sauvage, LES HIBISCUS, Case Vi D'O', LA CASE BOUISSEAU, Villa Beau Soleil, Les Chalets à l'Orée du Bois - Le petit chalet, and La Villa Tortue. |

Verification:
- Re-read `HLORUN0000000133` through `api.get_object_resource`.
- Duplicate-word findings are now `0`.
- Address-line-leading-punctuation findings are now `0`.
- Re-read all 848 API-readable objects through `api.get_object_resource`.
- `address.address1` doubled-space findings are now `0`.
- `address.address1` `Blvrd` / unaccented `Ocean` findings are now `0`.
- Five targeted canonical description rows were re-read through `api.get_object_resource`.
- Selected typo checks for `creole`, `foret`, `HEBERGEMENTS`, and `DECOUVERTE` in those corrected rows are now `0`.
- Re-read all 848 API-readable objects after the spacing pass.
- `address.direction` doubled-space findings are now `0`.
- `canonical_description.description` doubled-space findings are now `0`.
- Corrected direction-term findings are now `0`.
- Re-read the 9 latest corrected description objects through `api.get_object_resource`.
- The batch now has `0` findings for `... .`, `… .`, and simple space-before-period checks.
- Re-read `HLORUN00000000PD` through `api.get_object_resource`; API name now returns `La Caverne des Hirondelles`.
- Re-read `ORGRUN000000014S` through `api.get_object_resource`; API name now returns `Couleurs du Sud Sauvage - EXCURSIONS`.
- Re-read samples from the 57-row period-spacing batch through `api.get_object_resource`; sample payloads had `0` space-before-period findings.
- Re-read `HLORUN00000000W4`, `HLORUN000000015T`, and `RESRUN0000000118` through `api.get_object_resource`; source/API checks now show `0` missing-space-after-period findings.
- Re-read representative compound-term corrections through `api.get_object_resource`; API samples show `0` remaining dirty compound-term findings.
- Verification caught 6 temporary `micro-ondess` artifacts from the first replacement pass; those 6 rows were corrected to `micro-ondes` and rechecked.
- Source checks for abbreviated/unhyphenated Réunion `Saint-*` / `Sainte-*` commune names and `Étang Salé` now return `0` rows.
- Re-read representative place-name corrections through `api.get_object_resource`; API samples show `0` remaining dirty place-name variants.
- Source checks for unaccented `ile de la Réunion` variants now return `0` rows.
- Re-read representative island-name corrections through `api.get_object_resource`; API samples show `0` remaining unaccented `ile de la Réunion` variants.
- Re-read the 9-object targeted correction batch through `api.get_object_resource`; the selected typo checks now show `0` API-facing findings.
- Re-read the 10-object lodging correction batch through `api.get_object_resource`; refined source and API checks for the selected typo patterns now show `0` findings.
- Re-read the 17-object next lodging correction batch through `api.get_object_resource`; refined source and API checks for the selected typo patterns now show `0` findings. A separate `Entre deux` source/API check for Villa Ti MoOn also returns `0`.
- Re-read the 14-object API slice correction batch through `api.get_object_resource`; refined source and API checks for the selected typo patterns now show `0` findings.
- Source-row residual snapshot after this continuation: doubled-space object names `0`; `... .` / `… .` punctuation rows `0`; space-before-period rows `0`; dirty compound-term rows `0`; dirty place-name rows `0`; unaccented `ile de la Réunion` rows `0`; latest targeted typo batch `0`; latest lodging-copy typo batch `0`; next lodging-copy typo batch `0`; latest API-slice typo batch `0`; punctuation-only direction rows `1`; broader double-period rows remain `141` and need manual review because many are intentional ellipses or copied listing style.

## Review Needed

### Slash-Only Direction

| Object | Field | Current value | Suggested action |
| --- | --- | --- | --- |
| `LOIRUN000000019U` - Découvertes en Terres Signées | `address.direction` | `/` | Replace with a real access note, or clear the field if no direction exists. |

### Canonical Website / Object Mapping Review

| Object | Current value | Suggested action |
| --- | --- | --- |
| `ACTRUN00000001AR` - Allon Bat A Pat Rando | Website contact is `http://www.allonbatapat-rando.fr`; current reachable official site appears to be `https://allonbatapat-rando.re/`. | Verify the domain move and update the canonical website if confirmed. |
| `HLORUN00000000PD` / `HLORUN00000000PX` - La Caverne des Hirondelles | Two published lodging objects point to the same offer/source family. | Confirm whether these are duplicates, separate room-level offers, or intentionally distinct records before importing shared enrichment data. |
| `HLORUN00000000U4` - La Maison des Hôtes / `HLORUN00000000U3` - Le Gecko Vert | Both belong to the same provider/site family, but one is the Saint-Joseph guesthouse and the other appears to be a Manapany-les-Bains apartment. | Keep provider/contact data shared only when appropriate; confirm unit-level page details before importing amenities/address into `Le Gecko Vert`. |
| `HLORUN00000000SR` - Entre Deux Rêves / `HLORUN00000000SS` - Entre Deux Rêves - Passion | One object appears establishment-level, the other may be the `Passion` room-level offer. | Confirm the mapping before copying establishment-level capacity/tariffs or room-specific amenities across both objects. |
| `HLORUN00000000QA` - Les Terrasses de Manapany - Studio Vacoa | Object name says `Studio Vacoa`, while the API description and current Airbnb/source listing use `Studio Vacoas`. | Confirm the canonical unit name before changing `object.name`; source evidence currently leans toward `Studio Vacoas`. |
| `HLORUN00000000QD` / `HLORUN00000000QF` / `HLORUN00000000QG` - Couleurs du Sud Sauvage units | Contact data includes both `https://www.couleursdusudsauvage.com/` and `http://www.couleursdusudsauvage.com/` variants, with one unit using a deeper `/fr-FR/homepage` URL. | Keep one canonical HTTPS website/contact if the provider confirms all three objects belong to the same site family. |
| `HLORUN00000000QK` - Bienvenue dans le Sud de la Réunion | Object name matches the official-site title, while the chapo starts with `Bienvenue dans le Sud Sauvage`. | Verify whether `Sud Sauvage` is intentional marketing copy or whether the chapo should match the canonical object title more closely. |
| `HLORUN00000000QR` - Gîte Des Orchidées | Database description says capacity can go from 6 people up to 8, while the current Airbnb listing house rules show `6 voyageurs maximum`. | Verify the intended public capacity before importing or normalizing capacity fields. |
| `HLORUN00000000R5` - Bienvenue à la ferme chez France May LEBRETON | API contact email is `lbtfrancem802@gmail.com`, while the current Bienvenue à la ferme source lists `lebreton.974@gmail.com`. | Confirm the canonical booking/contact email before replacing the database value. |
| `HLORUN00000000RK` - L'Antre du Fouquet | Internet sources include both a grouped `L'Antre du Fouquet 1 et 2` gîte listing and an Airbnb room-level offer `L'Antre du Fouquet 2`. | Confirm whether the database object is the grouped property, a single room/chalet, or one of several units before importing capacity, room count, address, and amenities. |
| `HLORUN00000000RS` - Villa Tikalikata | Chapo says the villa can accommodate 11 people, while the description says `Couchages : 15 personnes`. | Verify public capacity before normalizing capacity fields or using this offer for search/filter facets. |

### Measurement / Source Data Review

| Object | Field | Current value | Suggested action |
| --- | --- | --- | --- |
| `HLORUN00000000Q8` - Ti Kaz Trankil | `object_description.description` | Pool depth says `0.90 cm à 1.50 m`; kitchen island says `2.50cm x 1.20cm`. | Verify source units with the owner/provider. These look like likely meter values, but I did not auto-correct them because the database should not infer measurements. |

### Brand / Email `REUNION` Strings Left Unchanged

| Object | Field | Current value | Suggested action |
| --- | --- | --- | --- |
| `ORGRUN00000000PV` - VTC ALP Réunion | `object_description.description` | `JVTC-ALP-Reunion` | Confirm official brand spelling before adding an accent. |
| `ORGRUN0000000176` - KREOL TOURS REUNION | `object_description.description_chapo` | `KREOL TOURS REUNION` | Likely brand styling; confirm before changing to `RÉUNION`. |
| `ORGRUN0000000176` - KREOL TOURS REUNION | `object_location.direction` | `contact@kreol-tours-reunion.com` | Email/domain context; keep unchanged unless the canonical contact changes. |

### Website URLs With Tracking Parameters

These are not spelling mistakes, so I did not update them automatically. They are out-of-place in canonical contact data and can usually be cleaned by removing `fbclid` / `gclid`.

| Object | Current URL | Suggested URL |
| --- | --- | --- |
| `ACTRUN00000000UU` - Natur'aissance | `https://naturaissance.re/?fbclid=...` | `https://naturaissance.re/` |
| `ACTRUN000000019X` - LAVE'NTURE | `https://www.tunnelsdelave.net/?fbclid=...` | `https://www.tunnelsdelave.net/` |
| `CAMRUN00000000PH` - L'Eden du Randonneur (camping) | `https://www.gite-eden-durandonneur.com/?fbclid=...` | `https://www.gite-eden-durandonneur.com/` |
| `HLORUN00000000NR` - Le Cypres | `https://www.caroandconciergerie.com/?fbclid=...` | `https://www.caroandconciergerie.com/` |
| `HLORUN00000000OO` - Cote Volcan | `https://www.cote-volcan.fr/?fbclid=...` | `https://www.cote-volcan.fr/` |
| `HLORUN00000000P1` - Ti Palissandre | `https://location-tipalissandre.re/?fbclid=...` | `https://location-tipalissandre.re/` |
| `HLORUN00000000P2` - L'Instant d'Evasion 1 | `https://linstantdevasion.re/?fbclid=...` | `https://linstantdevasion.re/` |
| `HLORUN00000000PI` - L'Eden du Randonneur (chambres d'hotes) | `https://www.gite-eden-durandonneur.com/?fbclid=...` | `https://www.gite-eden-durandonneur.com/` |
| `HLORUN00000000QQ` - LE BELVEDERE | `https://www.location-belvedere.com/?fbclid=...` | `https://www.location-belvedere.com/` |
| `HLORUN00000000QT` - Kaz Cyatheas | `https://kaz-cyatheas.com/?fbclid=...` | `https://kaz-cyatheas.com/` |
| `HLORUN00000000R5` - Bienvenue a la ferme chez France May LEBRETON | `https://www.bienvenue-a-la-ferme.com/.../633429?...&fbclid=...` | Keep the useful query parameters, remove only `fbclid`. |
| `HLORUN00000000RM` - Le Chalet Co Gite | `https://chaletcogite.re/?utm_source=ig&utm_medium=social&utm_content=link_in_bio&fbclid=...` | `https://chaletcogite.re/?utm_source=ig&utm_medium=social&utm_content=link_in_bio` or canonical homepage. |
| `HLORUN00000000SO` - La Villa JoLi | `https://www.villajoli.fr/?fbclid=...` | `https://www.villajoli.fr/` |
| `HLORUN00000000TG` - Location saisonniere Ti Kaze Creole | `https://location-saisonniere-ti-kaze-creole.odoo.com/?fbclid=...` | `https://location-saisonniere-ti-kaze-creole.odoo.com/` |
| `HLORUN00000000UK` - Entre Mer et Montagne - Meuble Volcan | `http://meuble-tampon.fr/?fbclid=...` | `http://meuble-tampon.fr/` |
| `HLORUN00000000WF` - Ferme Auberge Ti Planteur | `https://www.bienvenue-a-la-ferme.com/.../630994?fbclid=...` | `https://www.bienvenue-a-la-ferme.com/dom-tom/reunion/st-philippe/ferme/ti-planteur/630994` |
| `HLORUN00000000WG` - L'Instant d'Evasion 2 | `https://linstantdevasion.re/?fbclid=...` | `https://linstantdevasion.re/` |
| `HLORUN00000000Y7` - MECHANT! | `https://www.mechant.re/?fbclid=...` | `https://www.mechant.re/` |
| `HLORUN00000000YK` - Coco Vanille | `https://www.coco-vanille.com/reserver.html?fbclid=...` | `https://www.coco-vanille.com/reserver.html` |
| `HLORUN00000000YL` - JASMIN NUIT JACUZZI REUNION - Villa Songes | `https://www.jasmin-de-nuit.com/?fbclid=...` | `https://www.jasmin-de-nuit.com/` |
| `HLORUN00000000YM` - JASMIN NUIT JACUZZI REUNION - Villa Fournaise | `https://www.jasmin-de-nuit.com/?fbclid=...` | `https://www.jasmin-de-nuit.com/` |
| `HLORUN00000000ZU` - TAMAR'INN | `https://beds24.com/booking2.php?propid=151283&fbclid=...` | `https://beds24.com/booking2.php?propid=151283` |
| `HLORUN0000000123` - Entre Mer et Montagne - Meuble "Mer" | `http://meuble-tampon.fr/?fbclid=...` | `http://meuble-tampon.fr/` |
| `HLORUN000000014D` - MY HOME Villa | `https://ticazloc.wixsite.com/volcan-reunion?fbclid=...` | `https://ticazloc.wixsite.com/volcan-reunion` |
| `HLORUN0000000152` - Entre Mer et Montagne - meuble "Montagne" | `http://meuble-tampon.fr/?fbclid=...` | `http://meuble-tampon.fr/` |
| `HLORUN0000000162` - Villa Tropicale Detente & Spa | `https://contacttropicalede.wixsite.com/monsite-1?fbclid=...` | `https://contacttropicalede.wixsite.com/monsite-1` |
| `HLORUN000000016F` - Villa Vetiver | `https://paa.ge/villavetiver/fr?fbclid=...` | `https://paa.ge/villavetiver/fr` |
| `HLORUN000000016G` - Villa O Ti Paille-en-queue | `https://paa.ge/villaotipailleenqueue/fr?fbclid=...` | `https://paa.ge/villaotipailleenqueue/fr` |
| `HLORUN000000016W` - Ti Case Louise | `https://www.caroandconciergerie.com/les-logements-de-la-conciergerie?fbclid=...` | `https://www.caroandconciergerie.com/les-logements-de-la-conciergerie` |
| `LOIRUN00000000OR` - Vit@l e-the | `https://vitle-the.webador.fr/?fbclid=...` | `https://vitle-the.webador.fr/` |
| `LOIRUN00000000S5` - Le Jardin des Bestioles | `https://www.lejardindesbestioles.com/?fbclid=...` | `https://www.lejardindesbestioles.com/` |
| `LOIRUN00000000XZ` - Antre O Pots | `https://www.clairefalconnet.re/?fbclid=...` | `https://www.clairefalconnet.re/` |
| `LOIRUN000000010Z` - TIPOPEI | `https://www.tipopei.com/?fbclid=...` | `https://www.tipopei.com/` |
| `LOIRUN000000011X` - Margoz Amer | `https://www.etsy.com/fr/shop/Margozboutik?fbclid=...` | `https://www.etsy.com/fr/shop/Margozboutik` |
| `LOIRUN000000019S` - ISDrawing 97430 | `https://sites.google.com/view/isdrawing974/accueil?fbclid=...` | `https://sites.google.com/view/isdrawing974/accueil` |
| `LOIRUN00000001A5` - Paintball de Grand Coude | `https://paintball974.wixsite.com/website?fbclid=...` | `https://paintball974.wixsite.com/website` |
| `ORGRUN00000000SF` - Vel'Hauts Run | `https://www.velhautsrun.com/?fbclid=...` | `https://www.velhautsrun.com/` |
| `ORGRUN00000000Z9` - Destination Bien Etre | `https://fabien480-dlg.pagesperso-orange.fr/?fbclid=...` | `https://fabien480-dlg.pagesperso-orange.fr/` |
| `ORGRUN00000000Z9` - Destination Bien Etre | `https://fabien480.alwaysdata.net/?fbclid=...` | `https://fabien480.alwaysdata.net/` |

## Bulk Formatting Buckets

These are broad formatting buckets and should be reviewed before batch updating:

| Bucket | Count |
| --- | ---: |
| `address.address1` contains doubled spaces | 0 objects after correction |
| `address.direction` contains doubled spaces | 0 objects after correction |
| `canonical_description.description` contains doubled spaces | 0 objects after correction |
| `object_description.description` / `description_chapo` contains broader `..` patterns | 141 source rows after current corrections; review manually because many are intentional ellipses or copied listing style |

Recommendation:
- Direction and description spacing should be reviewed separately because many entries use lists, ellipses, or copied brochure text.
