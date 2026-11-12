# Thésaurus — simplification livrée le 12 novembre 2026

**Statut : intégré par la PR 240 et déployé sur l'application et la documentation.** Le commit servi est `e48ece594f7a54c52ff162d035ece2ad0d86f18f`. Les contrôles locaux et CI ci-dessous précèdent la livraison ; les preuves de production figurent en section 8. Aucun import dans le workspace Postman public ni nouvelle recette authentifiée de l'API partenaire n'a été effectué. Aucune clé partenaire réelle utilisée ou créée.

- Base : `221195b8` (merge PR #239).
- Branche : `codex/thesaurus-simplification`.
- Checkout d'origine : préservé, non modifié.
- Plan de référence : [simplification du thésaurus](../superpowers/plans/2026-11-12-thesaurus-simplification-plan.md), lots 0 à 8, avec diffusion préparée séparément.

## 1. Périmètre

Le candidat couvre :

- `bertel-tourism-ui/src/lib/thesaurus-api.ts`, la projection compacte pure et ses tests : trois vues optionnelles, sans changement du comportement historique.
- Les guides partenaire et métier, les accès documentaires et le guide Postman ; le HTML métier est régénéré depuis ses sources.
- `docs/openapi.json` : schémas précis des sept opérations thésaurus et dix exemples de réponse.
- Une collection partenaire distincte : trois appels principaux, parcours avancés et réponses synthétiques ; la collection canonique conserve ses 112 requêtes de référence. Le candidat partenaire en contient 33, sans nouvelle destination Postman publique inventée.
- Le Dockerfile à liste explicite et le workflow documentaire, comprenant les contrôles hors ligne du vérificateur HTTP.
- `tools/thesaurus/verify_partner_http.py` : contrôles HTTP de recette, avec parcours compact et correction de l'hypothèse « l'édition officielle augmente à chaque publication ».
- `tools/thesaurus/test_partner_http.py` : tests unitaires hors ligne (`urlopen` simulé, aucune requête réseau).
- Le plan, ce reçu et le graphe de code local, hors de l'image publique.

Le schéma SQL, les données publiées, l'administration et les autres contrats publics n'ont pas été modifiés.

L'implémentation principale et la première revue ont été déléguées à **Claude Haiku 5.5**, avec plafond de 0,35 USD de coût estimé par lot. La coordination a terminé les corrections de cohérence des exemples, champs absents, scénario de continuation et habillage mobile des URL longues. Le total rapporté par les huit exécutions réussies, sonde comprise, est **0,704562 USD au tarif de référence estimé** ; il ne représente ni une facture ni une mesure du solde de crédits de l'abonnement.

## 2. Contrat livré (additif)

Option `view=compact`, uniquement sur :

| Opération | Vue compacte |
|---|---|
| `GET /api/public/thesaurus` | Licence, attribution, domaines (`domain`, `name`, `effective_lang`), historique résumé (`release_id`, `previous_release_id`, `as_of`) |
| `GET /api/public/thesaurus/releases/{id}` | Mêmes métadonnées et domaines, sans historique |
| `GET /api/public/thesaurus/releases/{id}/concepts` | Noyau de concept plus champs optionnels présents seulement s'ils sont renseignés |

Sans `view`, les réponses, ETag, curseurs et erreurs actuels restent inchangés. Les détails, exports JSON/JSON-LD, changements et résolutions ne reçoivent aucune option. Les curseurs compacts et complets sont distincts.

**Valeurs par défaut riches (inchangées) :** manifeste complet, traductions intégrales, compteurs, règles éditoriales, `before`/`after` des changements.

Aucune refonte de l'interface, aucune modification SQL, aucune migration.

## 3. Comportement des éditions et des snapshots

- L'édition officielle (`release_id`) et le snapshot de préparation sont des notions distinctes.
- Une préparation peut modifier le snapshot sans nouvelle édition officielle. Le mode `continue` exige par défaut un snapshot figé et échoue s'il a changé. Pour tester explicitement l'invalidation, utiliser `--continuation-mode snapshot-changed` : le curseur ancien doit alors être rejeté (`400 invalid_cursor`), sans prétendre que la pagination épinglée a réussi. Ce mode échoue également si le changement attendu n'a pas eu lieu.
- Si le snapshot épinglé est inchangé et l'édition n'a pas régressé, la pagination stable et la comparaison des identités sont exécutées.
- Une régression d'édition, ou un changement du manifeste épinglé sur une édition plus récente, arrête la recette.
- Les ajouts de la première édition restent des ajouts ; ils ne sont pas traités comme des pertes.

## 4. Procédure de vérification

Commandes (sans clé dans le dépôt ; `<key-file>` pointe vers une clé de recette dédiée, hors dépôt) :

```text
python -I tools/thesaurus/test_partner_http.py

python -I tools/thesaurus/verify_partner_http.py --base-url <URL-HTTPS-de-recette> --key-file <key-file> --state <state.json> --report <report.json> --phase start
python -I tools/thesaurus/verify_partner_http.py ... --phase continue
python -I tools/thesaurus/verify_partner_http.py ... --phase continue --continuation-mode snapshot-changed
python -I tools/thesaurus/verify_partner_http.py ... --phase quota     # scénario contrôlé uniquement
python -I tools/thesaurus/verify_partner_http.py ... --phase revoked   # scénario contrôlé uniquement
python -I tools/thesaurus/verify_partner_http.py ... --phase final
```

- Les phases `quota` et `revoked` supposent un état provoqué ; elles ne sont pas des vérifications de lecture en production.
- Les anciens outils SQL de `tools/thesaurus/` sont archivés et ne sont pas rejoués.

### Résultats locaux

La suite complète et les E2E ci-dessous décrivent la première validation locale. Les contrôles ciblés, Postman, HTTP et OpenAPI ont été rejoués après la revue personnelle finale sur `b26c892f` ; les résultats GitHub sont consignés séparément.

| Contrôle | Résultat |
|---|---|
| Suite frontend complète, première validation locale | **635 suites et 7 174 tests réussis**, un test ignoré |
| Tests API ciblés après revue finale | **107 tests réussis**, dont projections, langues, curseurs, ETag, paramètres, réponses historiques et traductions absentes/nulles dans les snapshots figés |
| Vérification TypeScript | Réussie |
| Construction applicative | **Réussie lors de la première validation locale**, en mode démo de CI |
| Tests unitaires hors ligne (`test_partner_http.py`) | **12 tests réussis**, sans réseau ni clé réelle |
| Contrôles Postman | **44 contrôles réussis**, 112 requêtes canoniques et 33 requêtes partenaires |
| Exemples JSON et schémas OpenAPI | **13 exemples validés** localement avec Ajv 2020-12 : dix OpenAPI et trois réponses Postman. Ce contrôle supplémentaire utilise les outils installés du checkout ; le contrôleur Postman versionné reste un contrôle structurel, non un validateur JSON Schema général. |
| Rendus documentaires | Contrôles partenaires et métier réussis ; 41 ancres uniques et 54 liens locaux valides dans le guide statique |
| Outils de contenu | Trois validations de contenu/catalogue et **40 tests réussis** |
| E2E Chromium | Premier passage : 45 réussis, deux ignorés, deux échecs sur les cartes à 1 180 px. Les deux mêmes cas passent ensuite en série sur la base inchangée et le candidat : échecs intermittents du passage parallèle, sans modification de l'interface cartographique. |
| Lecture bureau/mobile | Trois pages contrôlées à 390 et 1 280 px, sans erreur JavaScript. Les deux guides tiennent à 390 px après retour à la ligne des URL inline ; navigation clavier fonctionnelle. L'index technique présente toujours le même débordement de sommaire que la base inchangée (936 px), hors de la surface modifiée. |
| Graphe de code | Mise à jour AST locale terminée : **25 795 nœuds, 43 103 arêtes, 1 597 communautés**, sans appel de modèle. Le rendu HTML du graphe est volontairement omis par la limite de taille de l'outil. |
| Image Docker documentaire | Docker absent sur l'hôte local ; **construction réussie dans la CI GitHub Documentation** sur `b26c892f`, sans publication d'image ni déploiement. |
| Phases HTTP authentifiées sur recette/production | Non exécutées ; les scénarios sont vérifiés avec un serveur simulé dans les tests hors ligne |
| Déploiement applicatif/documentaire et workspace Postman | Application et documentation livrées et vérifiées (section 8) ; fichiers Postman distribués par le site documentaire, sans import dans le workspace public |

### Revue personnelle finale

La revue finale a été effectuée par Codex directement, sans nouvel appel à Claude. Les corrections sont regroupées dans `b26c892f0e702d18687ae57e585f2e0d310ae825` :

- La requête Postman de page suivante conserve désormais `view=compact` : auparavant, elle envoyait un curseur compact avec la vue complète, provoquant `400 invalid_cursor`.
- Le banc de contrôle Postman exécute les scripts de la collection concernée. Il vérifie le parcours première page/page suivante, nettoie les identifiants après une page vide et empêche un ancien ETag d'environnement de masquer celui de la collection.
- Les scripts acceptent les métadonnées nulles permises par le contrat, les listes de domaines vides et le repli français des anciens snapshots. Ils continuent de rejeter une traduction incorrecte lorsqu'une traduction publiée existe.
- Le schéma OpenAPI conserve le caractère optionnel et nullable de `name_i18n` dans les vocabulaires historiques. Deux tests API couvrent les snapshots dont cette valeur est absente ou nulle ; le guide précise la différence entre métadonnées complètes et compactes.
- Le vérificateur HTTP compare toutes les pages compactes à l'export complet et contrôle la stabilité du total. Les tests d'invalidation de snapshot exercent maintenant explicitement le scénario attendu, au lieu d'échouer sur une précondition du mode figé.

Les contrôles de publication (16 tests et vérification du diff) et `git diff --check` réussissent également. Aucun défaut concret ne reste identifié dans le périmètre revu ; la recette HTTP authentifiée reste une étape distincte, non exécutée ici.

### CI GitHub de la revue finale

Exécutions sur le commit applicatif `b26c892f0e702d18687ae57e585f2e0d310ae825`, branche `codex/thesaurus-simplification` :

| Workflow | Résultat |
|---|---|
| [Frontend CI](https://github.com/D-OTIsud/Bertel/actions/runs/43246571266) | Réussi : types, **635 suites et 7 176 tests unitaires réussis** (un ignoré), build et **47 E2E Chromium réussis** (deux ignorés) |
| [Documentation](https://github.com/D-OTIsud/Bertel/actions/runs/43246571724) | Réussi, y compris les 44 contrôles Postman, les 12 tests HTTP hors ligne et le build Docker documentaire |
| [Storybook Security](https://github.com/D-OTIsud/Bertel/actions/runs/43246571315) | Réussi, construction et contrôles de sécurité dans un navigateur réel |
| [Publication safety](https://github.com/D-OTIsud/Bertel/actions/runs/43246571330) | Réussi |
| [Thesaurus tool archive boundary](https://github.com/D-OTIsud/Bertel/actions/runs/43246571425) | Réussi |

Ces workflows valident le code et construisent les artefacts de contrôle ; ils ne déploient pas le candidat.

### Mesures du corps HTTP sur un corpus synthétique

Les réponses utilisent 66 titres de domaines issus d'une fixture, avec traductions et concepts illustratifs. Les deux représentations emploient le même corpus et le JSON canonique. Ce ne sont pas des tailles ni des performances de production ; gzip est mesuré sans les en-têtes HTTP.

| Scénario | JSON complet | JSON compact | Réduction JSON | Gzip complet → compact |
|---|---:|---:|---:|---:|
| Découverte, un manifeste historique | 39 111 octets | 5 469 octets | 86,0 % | 2 041 → 1 238 octets |
| Découverte, 100 manifestes historiques | 1 967 318 octets | 12 779 octets | 99,4 % | 20 857 → 1 835 octets |
| Page de 100 concepts | 60 971 octets | 25 884 octets | 57,5 % | 1 568 → 853 octets |

## 5. Ordre de publication et retour arrière

Les ressources sont distinctes et se publient séparément :

1. **Application** (`bertel-tourism-ui`) : livrer d'abord le support compact, avant toute annonce publique.
2. **Documentation** (site documentaire) : publier ensuite guides, OpenAPI et artefacts correspondant au même contrat. Vérifier avant intégration que les déclencheurs de déploiement de la documentation et de l'application ne se lancent pas l'un l'autre sur la même branche.
3. **Postman** : ne déclarer la destination mise à jour qu'après import vérifié de la collection distribuée.

Retour arrière :

- **Avant adoption de l'option** : retirer la mention du compact des supports, puis revenir à l'image applicative précédente. Le parcours historique reste disponible.
- **Après adoption** : revenir uniquement à une image compatible avec `view=compact`, ou préparer un correctif qui conserve l'option. Modifier les guides ne retire pas les clients ni les collections déjà importées.
- Ne toucher ni aux publications du thésaurus ni aux données métier pour corriger une projection HTTP.

## 6. Docker et artefacts publics

- La liste explicite de `docs/Dockerfile` reste la référence : seuls les artefacts publics choisis y sont ajoutés.
- Les plans, audits, scripts de génération, espaces de travail et sources métier privées restent hors de l'image servie et ne sont pas publiés automatiquement.
- Les deux nouveaux fichiers partenaires sont ajoutés explicitement au Dockerfile. Les artefacts privés demeurent exclus.

## 7. Limites

- Le gain mesuré porte sur la réponse HTTP, non sur le coût SQL : le RPC charge encore les manifestes complets.
- La vue compacte ne modifie pas les curseurs ni les ETag existants ; les validateurs compacts sont distincts.
- Aucune donnée réelle de production n'est citée ici.

## 8. Livraison de production

La [PR 240](https://github.com/D-OTIsud/Bertel/pull/240) est fusionnée dans `master` au commit `e48ece594f7a54c52ff162d035ece2ad0d86f18f`, arbre `dec2c3f91f031b1c26d5efe37704dc5819420acb`. Les deux ressources Coolify ont été relues en mode manuel, avec files vides. L'application a été livrée avant la documentation, sans migration ni modification des données du thésaurus.

### Application

- [Archive qualifiée](https://github.com/D-OTIsud/Bertel/actions/runs/43251495328), tentative 1, profil `protocol-v1` : gardes, construction non-démo, outils natifs, smoke et qualification des quatre modes runtime réussis. Artefact `13960860607`, 94 928 123 octets, SHA-256 `b182f2be2765270414a605b43f0cd8a4598f784546ba7a32a91a6dd212168828`.
- Image physique vérifiée : `sha256:94a061abe1fdf6033527d70492b69b9f149e99fb188c95b6b7db534a0220ecf5`, Linux/amd64, utilisateur `node`, configuration et onze couches RootFS conformes à l'archive. Réception, import, tag exact et smoke hôte isolé réussis ; aucun secret de service fourni au smoke.
- [Déploiement applicatif](https://coolify.otisud.re/project/qw40sk0s4w8sc0gkggokwso4/environment/mo4o40c8o8occs40o4cs0ks4/application/r48k844wg04kks848s00wco4/deployment/lxhdslrjma0zh2kzfury0wig) terminé en 18 secondes. Le conteneur effectif porte l'image attendue et `SOURCE_COMMIT=e48ece594f7a54c52ff162d035ece2ad0d86f18f` ; état `healthy` relevé à 16:01:28 UTC.
- `/api/health`, `/api/ready`, `/api/app-version` et `/runtime-config.js` répondent 200 : santé correcte, disponibilité `live`, contrats client/écriture 2/2. La configuration publique conserve son empreinte `7fe2834caefc75655f1bb96d263b62de8085d0e431a2561111dad1fc953e6547`.
- Les deux sondes de santé sur les boucles locales IPv4 et IPv6 réussissent. Les publications restent exclusivement `127.0.0.1:8081` et `[::1]:8081`. La connexion extérieure IPv4 à 8081 est refusée ; aucun enregistrement DNS IPv6 public n'est disponible pour cette sonde extérieure.

### Documentation

- [Déploiement documentaire](https://coolify.otisud.re/project/qw40sk0s4w8sc0gkggokwso4/environment/mo4o40c8o8occs40o4cs0ks4/application/fws8g8k4ok0osogcwccowssc/deployment/fddnswjrilhm5mlil4lv3rli) terminé sur le même commit. Le conteneur et son `SOURCE_COMMIT` ont été relus ; image `sha256:6f488d9138df11565286ba57c3382367730bbb1cfe11ab8bc8361a484e5e1cea`.
- Recette HTTP du 12 novembre, 16:03:59–16:04:34 UTC : les **16 fichiers publics** correspondent exactement à la source, après normalisation des seules fins de ligne CRLF. Les **sept fichiers inchangés** correspondent aussi à la sauvegarde HTTP antérieure.
- Les deux nouveaux fichiers partenaires répondent 200 avec du JSON valide : collection de 112 084 octets et environnement de 405 octets. Avant livraison, ces URL renvoyaient l'index HTML de repli ; ce faux positif a été distingué d'un fichier JSON réellement publié.
- Les quatre chemins contrôlés hors de l'image publique répondent réellement **404** : source du guide métier, générateur, reçu de livraison et plan interne. Aucun repli SPA n'a été accepté pour conclure ces quatre contrôles.

### CI du commit livré et retour préparé

[Frontend](https://github.com/D-OTIsud/Bertel/actions/runs/43251447311), [Documentation](https://github.com/D-OTIsud/Bertel/actions/runs/43251447183), [Storybook Security](https://github.com/D-OTIsud/Bertel/actions/runs/43251447277), [Publication safety](https://github.com/D-OTIsud/Bertel/actions/runs/43251447123) et [Thesaurus tool archive boundary](https://github.com/D-OTIsud/Bertel/actions/runs/43251447051) réussissent sur le commit intégré, en plus du workflow d'archive.

Le retour applicatif précédent est préservé : source `221195b83048e37020fe769c4bf9a7bdcab89dc2`, branche `codex/rollback-thesaurus-simplification-20261112`, image `sha256:e6539a3c6edb99a9551515f906c8326a6508085e5e535f40850f1381393b75e1`, archive conservée et ancien smoke isolé confirmé. Le retour documentaire conserve la source `2dfb7f140f42ec84667fc221515d00a549bddcbb` et l'image `sha256:5551713e5a93ae90ab7cfdc72e1f40d6925b0eedee16f7c2019deb8d670bdd20`. Aucun retour arrière n'a été exécuté. Les gardes de la section 5 restent applicables après adoption du compact.

Les reçus opérateur, journaux et captures détaillés restent privés. Cette livraison ne révoque ni ne régénère les secrets runtime. Les anciennes clés de recette ont déjà été révoquées et supprimées ; aucun parcours HTTP partenaire authentifié n'est donc revendiqué ici. Le présent ajout ne modifie aucun fichier servi ni code applicatif et ne nécessite pas un nouveau déploiement.
