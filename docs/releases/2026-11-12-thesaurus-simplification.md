# Thésaurus — simplification (préparation, non déployée)

**Statut : candidat implémenté et contrôlé localement, non déployé.** Aucune publication externe, aucun déploiement et aucune clé réelle utilisée. Les contrôles d'API portent sur des réponses simulées ; ils ne constituent pas une nouvelle recette authentifiée de production.

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

## 2. Contrat implémenté (additif, non déployé)

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

### Résultats

| Contrôle | Résultat |
|---|---|
| Suite frontend complète, candidat après corrections | **635 suites et 7 174 tests réussis**, un test ignoré |
| Tests API ciblés après corrections | **105 tests réussis**, dont projections, langues, curseurs, ETag, paramètres et réponses historiques |
| Vérification TypeScript | Réussie |
| Construction applicative | **Réussie sur le candidat final**, en mode démo de CI |
| Tests unitaires hors ligne (`test_partner_http.py`) | **10 tests réussis**, sans réseau ni clé réelle |
| Contrôles Postman | **38 contrôles réussis**, 112 requêtes canoniques et 33 requêtes partenaires |
| Exemples JSON et schémas OpenAPI | **13 exemples validés** localement avec Ajv 2020-12 : dix OpenAPI et trois réponses Postman. Ce contrôle supplémentaire utilise les outils installés du checkout ; le contrôleur Postman versionné reste un contrôle structurel, non un validateur JSON Schema général. |
| Rendus documentaires | Contrôles partenaires et métier réussis ; 41 ancres uniques et 54 liens locaux valides dans le guide statique |
| Outils de contenu | Trois validations de contenu/catalogue et **40 tests réussis** |
| E2E Chromium | Premier passage : 45 réussis, deux ignorés, deux échecs sur les cartes à 1 180 px. Les deux mêmes cas passent ensuite en série sur la base inchangée et le candidat : échecs intermittents du passage parallèle, sans modification de l'interface cartographique. |
| Lecture bureau/mobile | Trois pages contrôlées à 390 et 1 280 px, sans erreur JavaScript. Les deux guides tiennent à 390 px après retour à la ligne des URL inline ; navigation clavier fonctionnelle. L'index technique présente toujours le même débordement de sommaire que la base inchangée (936 px), hors de la surface modifiée. |
| Graphe de code | Mise à jour AST locale terminée : **25 795 nœuds, 43 103 arêtes, 1 597 communautés**, sans appel de modèle. Le rendu HTML du graphe est volontairement omis par la limite de taille de l'outil. |
| Image Docker documentaire | **Non exécutée : Docker absent sur cet hôte.** Les sources de `COPY` et l'exclusion des documents internes sont contrôlées ; le build demeure requis dans la CI de diffusion. |
| Phases HTTP authentifiées sur recette/production | Non exécutées ; les scénarios sont vérifiés avec un serveur simulé dans les tests hors ligne |
| Déploiement applicatif/documentaire et workspace Postman | Non exécutés ; état et références à consigner lors d'une diffusion autorisée |

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
