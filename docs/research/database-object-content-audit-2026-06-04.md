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

Verification:
- Re-read `HLORUN0000000133` through `api.get_object_resource`.
- Duplicate-word findings are now `0`.
- Address-line-leading-punctuation findings are now `0`.
- Re-read all 848 API-readable objects through `api.get_object_resource`.
- `address.address1` doubled-space findings are now `0`.
- `address.address1` `Blvrd` / unaccented `Ocean` findings are now `0`.
- Five targeted canonical description rows were re-read through `api.get_object_resource`.
- Selected typo checks for `creole`, `foret`, `HEBERGEMENTS`, and `DECOUVERTE` in those corrected rows are now `0`.

## Review Needed

### Slash-Only Direction

| Object | Field | Current value | Suggested action |
| --- | --- | --- | --- |
| `LOIRUN000000019U` - Découvertes en Terres Signées | `address.direction` | `/` | Replace with a real access note, or clear the field if no direction exists. |

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
| `address.direction` contains doubled spaces | 30 objects |
| `canonical_description.description` contains doubled spaces | 107 objects |
| `canonical_description.description` contains `..` | 117 objects |

Recommendation:
- Direction and description spacing should be reviewed separately because many entries use lists, ellipses, or copied brochure text.
