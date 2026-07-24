# Baseline API avant migration — Taxonomie HLO §190

**Capture** : 2026-07-24, base cloud, lecture seule, avant toute application persistante de `migration_taxonomy_nature_forme.sql` et `migration_interop_crosswalk_leafaware.sql`.

**Répétition intégrale** : PASS le 2026-07-24 via `tests/dry_run_taxonomy_nature_forme_full_api.sql` (migration taxonomie + migration crosswalk + assertions arbre/crosswalk/panier réel, puis `ROLLBACK`). Contrôle indépendant après la transaction : 476 HLO publiés, 231 porteurs legacy, 0 nouveau nœud et 0 colonne crosswalk persistés.

Cette baseline matérialise le panier T8/F1 du plan. Les empreintes sont calculées sur la représentation canonique PostgreSQL `jsonb::text` avec `md5`; la longueur est en octets UTF-8. Les fonctions interrogées sont `api.get_object_cards_batch`, `api.get_object_resource`, `api.get_object_jsonld` et `api.get_object_interop` pour les trois profils.

## Panier témoin

| Rôle | ID | Fiche | Code avant | Chemin avant |
|---|---|---|---|---|
| CdH directe | `HLORUN00000000NU` | Zévi sur Mer | `chambre_d_hotes` | `chambre_d_hotes` |
| future maison d’hôtes | `HLORUN0000000183` | La Belle du Sud | `maison` | `location_saisonniere > maison` |
| meublé maison | `HLORUN00000000NR` | Le Cyprès | `maison` | `location_saisonniere > maison` |
| meublé appartement | `HLORUN00000000NP` | L’Eau Forte | `appartement` | `location_saisonniere > appartement` |
| affectation au niveau nature | `HLORUN00000000QE` | Zen Location | `location_saisonniere` | `location_saisonniere` |
| collectif / étape | `HLORUN00000000OC` | La Cascade | `gite_de_randonnee` | `gite_de_randonnee` (ancien parent désactivé donc invisible) |
| code inchangé, chemin seul | `HLORUN000000015Q` | La BBO La Bulle by Baril O’thentik | `bulle` | `chambre_d_hotes > bulle` |
| témoin non-HLO | `RESRUN00000000NL` | Le Longboard | `restaurant` | `restaurant` (`taxonomy_res`) |

## Empreintes avant

Format de chaque cellule : `md5 / octets`.

| Rôle | card | full | schema.org | DATAtourisme | Apidae | Tourinsoft |
|---|---|---|---|---|---|---|
| CdH directe | `b43cb9e428f4398ce139084b971a2e4d / 2064` | `dd43b6024734b4d028e6253d353a104a / 20512` | `7a8d14a2db384eacfde12d88d62a76d6 / 1773` | `f9778ccd3b75e10a68418b4ca1d02f8c / 2331` | `25ae180a7b7c7affe6e549e3b5643e16 / 1888` | `c41ed82e23721f60c0c0fdd2640d1b91 / 1540` |
| future maison d’hôtes | `b1000c999413494177ba9f19c96e40af / 1834` | `5e0b5c8de5f276fd654188e7084aecf7 / 18512` | `69c23d5804ae93de1e198732f971d766 / 1995` | `29f3ba656765184de25aa56136b65057 / 2556` | `87661edcebb604d7ee08e24add384931 / 2113` | `990f8cbd2f3e47ae23b9ff7cdb227e63 / 1766` |
| meublé maison | `174dcfd74c783176cc6c94fc88b00f32 / 2539` | `05d0528f74d1a2a34dd07f542ceaa884 / 25896` | `8b452ddbc6500484c214106316a82a27 / 2467` | `a817ecb354952d546ad4a881679cbf1e / 3028` | `c03b70b674274a9e19fc7a28ded5039d / 2585` | `14b3c6adc709c1d7f86b37a1378e2376 / 2238` |
| meublé appartement | `ce0d02f854857259bf5b905f2b81544a / 2045` | `30abf0cbf2f6cf24064083f9b514e19f / 15426` | `7f4897d6877a5188b233c92dc7295438 / 1086` | `6c99450543cfd89b5457a1bce1d8639c / 1654` | `f5ec096a50a8192b7414720de8d9aa37 / 1254` | `2ba46d0dbbc8b86cb81088ecfbbc98a8 / 857` |
| affectation nature | `267142a93f92fdf3deab1613fb4cd112 / 1891` | `6cbf85340c0dfe589ad1b5d97d72d7ec / 12633` | `0975d2c018cbf164f35df8c9a44c5f85 / 672` | `ea3dc25b16f0492f49845ebde4531ffb / 1230` | `8d5da84afb3b89a2ba61c35288b265a7 / 787` | `cef52650f6756b4df07c6d96ac94acfe / 439` |
| collectif / étape | `7a7ce183cf58cecee8099945e3891767 / 1820` | `b6883788c9a983c561906effe1a530b5 / 13721` | `adbe653e2a5cc4460d121ee8c2a23b46 / 836` | `98dc768ace4065747aad548782901f6f / 1394` | `1aebd6a3eed0f9d53dfe3e7dea821023 / 951` | `4a2dc582c088d44f64ba2c423f4dfe1e / 603` |
| chemin seul / bulle | `a9bc9145ca9d663a6f4aedfa99d7a14d / 2043` | `e7f1c587972b1d06e296e1cadecb436b / 12125` | `64e1eb1b0bd74b52a5e9f1301aa5e9e0 / 1037` | `d3cb73c1df6c8f0ac9c38cb559bccaec / 1595` | `5c8cd845f6a3f732c75ad2743c7e3d76 / 1152` | `859cc6ab55f14a2ad3e6a2445dab66bf / 804` |
| témoin non-HLO | `4a1116dd5fda714f28a2d17d86d5401e / 1412` | `5c30a2dd8ddf8e5bc1901083af1076b8 / 17867` | `28204eb063fb85dddc50ba195b705d91 / 1603` | `b8b5d6abf4e5f5a132f52f285d389659 / 2180` | `8860115eda0038fe590d0607e7be054d / 1769` | `c0eaeff004bebbb7a951fc4f90888334 / 1379` |

## Contrat de comparaison après application

- Pour les sept HLO, `card` et `full` doivent changer uniquement sur la taxonomie, les chemins dérivés et `updated_at`; la comparaison se fera avec une projection qui retire ces champs volatils.
- Pour les huit fiches, schema.org, Apidae et Tourinsoft doivent conserver exactement leur empreinte.
- Pour les sept HLO, DATAtourisme doit uniquement changer la seconde valeur de `@type` selon le crosswalk §190; le reste du document doit être identique après retrait de `@type`.
- Le témoin RES doit conserver les six empreintes à l’identique.
- Toute divergence supplémentaire déclenche le rollback et l’analyse avant communication partenaire.

### Empreintes normalisées attendues après

Les projections retirent uniquement `taxonomy` et `updated_at` de la carte, `taxonomy`, `updated_at` et `render.taxonomy_lines` de la fiche complète, et `@type` du pivot DATAtourisme. Elles doivent rester strictement identiques après les deux migrations.

| Rôle | card normalisée | full normalisée | DATAtourisme sans `@type` |
|---|---|---|---|
| CdH directe | `4e3a8b97a9772a4fd61064e23c1c3c77` | `22e764e96db1feeafdf1c639def4bbcb` | `b0ff8f48e7c4d4b33f0bfb3c5e2de3b5` |
| future maison d’hôtes | `d24f4f9bbfac346a27d38209c93dcd0b` | `542de0e70a249705026d0208f8eced24` | `d2bc51cbecb6577cb94e01ac601940c4` |
| meublé maison | `802f8e441f8574068286ca5cc4ea2ab0` | `ac6587fdfae2a754d21070d2bb37658a` | `4de93a12d46cda0211b667e4e99d913a` |
| meublé appartement | `9a1660d460dd051e45824d623ddfcba4` | `cc1e988141dfcdd383ab53f7d27158c8` | `e0447fa84838409c3b57636a32abb7d8` |
| affectation nature | `e7fc27dd9ba2e9e7d62109fc917330eb` | `9e256c546ac4e705c3adff322ea1ea8c` | `6c525d7bf756af8c70b1a70407828559` |
| collectif / étape | `0d4d16776d9b280764d07b629c64af57` | `65a806608ce6247ed785f40017a0d91f` | `6006b60f20e3e479b2277dfb7a59c029` |
| chemin seul / bulle | `88acf2a3731a0b6a0ef0aa9bda93f6ca` | `e1e2e5a3ba591c59a334a05d0e30ae1d` | `3e5deb78f06f0736ae7ea4adb2e2aece` |
| témoin non-HLO | `f323e60d290ad0f31501243bab57fecd` | `78801da09ec886b260b254ddb4354f90` | `61e10a8502e52a0e0b685701dab823f3` |

Le contrôle exécutable correspondant est `Base de donnée DLL et API/tests/test_taxonomy_nature_forme_live_api.sql`. Il est volontairement hors fresh-apply : il cible ces huit identifiants cloud réels.
