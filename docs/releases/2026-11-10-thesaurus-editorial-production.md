# Livraison éditoriale du thésaurus du 10 novembre 2026

**Contenu livré en production, publication 25 du 10 novembre à 10:02:41 UTC.**
Les 152 comparaisons finales couvrent les 1 477 concepts sans divergence.
L'application, le corpus et la documentation sont livrés et vérifiés.

## Résultat vérifié

- 78 domaines gouvernés avec des noms métier français ; définition obligatoire
  et noms/définitions complets en FR/EN/ES/DE pour les 1 477 concepts.
- 1 449 concepts corrigés, puis 16 simplifications de noms sur ces mêmes identités :
  1 465 révisions exactes, publiées en 16 versions, de 10 à 25.
- Les 16 tâches d'actualisation sont terminées en une tentative. Aucun brouillon,
  révision validée en attente ni tâche restante.
- Snapshot final : 1 362 concepts publics et 115 privés. Aucun flag public ni
  identité publique n'a été changé.
- 152 requêtes, 1 477 identités, 39 tableaux de recherches héritées non vides et
  les 1 438 tableaux vides comparés ; aucune divergence ni erreur de transport.
  Les champs éditoriaux, identités, états, parents, relations et correspondances
  sont vérifiés. Les empreintes des entrées et des requêtes sont revérifiées.

Les preuves minimales versionnées sont la
[comparaison du contenu](../../db-graph-out/THESAURUS_EDITORIAL_CONTENT_POSTFLIGHT.json),
la [capture finale du catalogue](../../db-graph-out/THESAURUS_EDITORIAL_POLICY_FINAL_CATALOG.json)
et sa [comparaison à la phase 1](../../db-graph-out/THESAURUS_EDITORIAL_POLICY_COMPARISON.json).
Les reçus individuels et les exports de travail restent privés dans le dossier
local de qualification.

## Application qualifiée et déployée

- Source : `a5078a8aea0c304d65212994aef6c643d3732bd2`, issue de la
  [PR 230](https://github.com/D-OTIsud/Bertel/pull/230).
- Archive qualifiée : run GitHub Actions `42781521291`, tentative 1 ; image
  `sha256:2e32c657b4b634d246a41c2df31358fdb48404b78cec9f91aff43b9a49b9f277`.
- Déploiement Coolify `fa6rnkdpnb18zgvzpzx07ccg`, terminé le 10 novembre à
  08:42:28 UTC. L'image physique et `SOURCE_COMMIT` du conteneur ont été vérifiés.
- Contrôles HTTP à 08:44:49 UTC : santé et disponibilité 200 ; contrat client
  minimal 2, contrat d'écriture 2 ; configuration runtime canonique vérifiée.
- Les contrôles CI du commit source sont passés, y compris SQL sur pile jetable,
  frontend, documentation, sécurité de publication et confidentialité DB.
- Point de retour conservé : branche
  `codex/rollback-thesaurus-editorial-20261110` à
  `a9bcfcfbb621f41a55616e0a506ce40ce7cead0c` ; ancienne image conservée.

L'interface réutilise le circuit approuvé : import de corrections, analyse des
conflits, création privée, validation séparée, aperçu, publication. Le guide métier
reste accessible depuis Configuration. Aucun jeton de session n'a été extrait et
aucune identité d'authentification n'a été simulée en production.

## Schéma et premiers résultats constatés

Les migrations natives de la phase 1, des lots administratifs et des noms courts
portent respectivement les versions `20261110075054`, `20261110075103` et
`20261110075111`. Les 78 domaines ont une définition obligatoire et des noms
métier courts en français. Les clés techniques restent stables.

Le roundtrip des recherches héritées a reçu la version native `20261110081126`.
Les 39 tableaux non vides ont été conservés ; l'empreinte agrégée des 1 477 tableaux
était `466aec136221bea757ec5e3d9da4432d` après cette installation.

L'index de la garde des relations publiques a reçu la version native
`20261110090528`. Le reçu et la mesure de 37,609 ms sont conservés dans
[l'audit de complétude](../audits/2026-11-10-thesaurus-editorial-completeness.md).
Le corps d'activation reste `985839358c6e0d68eb7db280f42bb6ed` (MD5).

La première tentative de publication a dépassé huit secondes et a été annulée
atomiquement. Après index, les 27 concepts ont été publiés dans la version 10,
avec 517 fiches affectées et une tâche d'actualisation terminée en une tentative.
Une tentative suivante de 75 concepts a également été annulée : la version 10
et les 75 brouillons validés ont été vérifiés avant toute reprise.

Le délai borné de la façade `api.thesaurus_admin(text,jsonb)` a ensuite reçu la
version native `20261110091117` : `statement_timeout=30s`, avec rechargement du cache
de schéma PostgREST. Ce paramètre est relevé par PostgREST avant sa requête principale ;
il concerne toutes les actions de cette façade. Les corps de la façade et du noyau,
leurs propriétaires et leurs ACL ne sont pas réécrits. Le contrôle d'exploitation
confirme que les rôles gardent huit secondes pour `authenticated` et `authenticator`,
trois secondes pour `anon`. Les autres points d'entrée ne reçoivent pas l'exception.
Le [runbook](../SQL_ROLLOUT_RUNBOOK.md) précise les limites et les contrôles HTTP.

La politique renforcée a reçu la version native `20261110095723`, après la
publication 24 et la vérification de 1 477 documents complets, sans brouillon
restant. Elle impose les quatre langues, vérifie les langues supplémentaires et
rejette les définitions vides, provisoires ou répétant le nom. La publication 25
des noms simplifiés porte ensuite ces métadonnées dans une publication normale.

Le contenu final relu est versionné dans `fe0932fdf4c0d42e2fb34ad950c4d3954a7428e6`
([PR 231](https://github.com/D-OTIsud/Bertel/pull/231)). Il comprend le complément
de 16 noms français, dont les anciennes formes restent des termes cachés.
Les 36 tests locaux de préparation, de corpus et du CLI passent. La CI SQL
`42790272913` est terminée avec succès à 09:29:01 UTC, nouveaux tests d'index et de
portée du délai compris ; documentation, références DB et confidentialité passent.

La publication 19 contient les 150 révisions exactes du premier regroupement,
plus six premières intégrations privées du domaine `mood`. Ces six concepts ont
été comparés à l'export initial sur 22 champs métier, sans différence. Le domaine
passe d'un état non gouverné à gouverné ; son flag public reste faux, comme celui
des dix documents du domaine. Aucun de ces six concepts n'est une révision
supplémentaire. Le compteur de publication porte sur les changements du snapshot,
tandis que celui de l'aperçu porte sur les révisions sélectionnées.

## Documentation publique actualisée

Le déploiement Coolify `s6dnqiltckvqknblxb9im5co` est épinglé sur la même source S.
Le build s'est terminé à 09:25:42 UTC, le nouveau conteneur a démarré à 09:25:43 et
la bascule s'est terminée à 09:25:48. Les lectures HTTP à **09:28:08 UTC** confirment
que les trois pages publiques et les deux dépendances du guide partenaires
correspondent exactement à S, après normalisation des seules fins de ligne.

Le [guide métier public](https://doc.bertel.otisud.re/thesaurus.html) répond 200,
avec 58 897 octets et l'empreinte SHA-256
`9001c3a678310eaa551d648f3d4d4591aac9c045b8eb4aed9f90485e536b7c2f`.
Ses 41 identifiants sont uniques et ses 53 liens locaux sont résolus. La section
d'import des corrections est présente. Le relevé avant livraison à 09:07:32 UTC
avait bien identifié l'ancienne version ; il est conservé séparément.

`guide-metier-thesaurus.md` et `thesaurus-render.js` renvoient chacun **404**,
conformément à l'allowlist de `docs/Dockerfile`. Seule la page HTML statique du
guide doit être servie ; sa source canonique, son générateur et les audits restent
dans le dépôt. Le contrôle statique confirme 41 ancres uniques et 53 liens locaux
valides. Les deux contrôles de rendu passent ; la construction Docker effective
est attestée par le déploiement ci-dessus et la qualification documentaire CI.

Les reçus privés `postflight-docs-http-after-s6dnqilt.json` et `postflight-migrations.json`, dans
le dossier de qualification du chantier, conservent les métadonnées HTTP et la
lecture du registre. Ils ne contiennent ni session utilisateur ni clé API.

Une dernière actualisation documentaire livre aussi l'exemple OpenAPI corrigé :
déploiement `dgmbthfdke9npqifzqotwxqt`, source qualifiée
`e4f19d290119c3c6359380b1c085814abc44bf08`, fusionnée par la PR 231 dans
`6f78708b3bc2e2b445e72168b7141391f40af9ef` (arbres identiques).
Les CI SQL de push et de PR ont toutes deux réussi, ainsi que documentation,
références DB et confidentialité.

Build terminé à 10:13:07 UTC, nouveau conteneur à 10:13:08 et bascule terminée
à 10:13:13. Le contrôle HTTP à **10:16:55 UTC** confirme les six ressources
publiques conformes à cette source, après normalisation des seules fins de ligne.
L'OpenAPI servi compte 126 843 octets, SHA-256
`21bf85b55a0806aa53d9b0793a6ea3d8162bf200f9f25b49b186441a8cbb87cd`.
Son exemple utilise « Restauration », les définitions relues et les identifiants
natifs cohérents ; le libellé « Taxonomie RES » en est absent. Les 41 identifiants
et 53 liens locaux du guide sont valides ; les deux sources internes restent en
404. Reçu privé : `postflight-docs-http-after-dgmbthfd.json`.

## Droits et limites des vérifications

Le contrôle indépendant et la capture à 10:11:17 UTC confirment les ACL,
propriétaires et modes de sécurité inchangés, les 17 tables sous RLS et leurs
18 politiques, ainsi que le rôle de publication et ses appartenances. Le corps
de la façade conserve `74693eebd27b41db9afc57237c95ff28` ; seule son empreinte DDL
varie avec le réglage de délai. Les huit sources gardent leurs contrôles et les
13 contrats de préparation correspondent à leurs fonctions installées.

Le GET anonyme de `/api/public/thesaurus`, à 10:04:03 UTC, retourne le 401 attendu.
Il prouve la fermeture anonyme, pas le contenu d'une réponse authentifiée. Le
parcours HTTP avec une clé partenaire n'a pas été réalisé, conformément au choix
de poursuivre avec les contrôles disponibles. Aucune clé ni session n'a été extraite.

Le supplément du graphe DB est ciblé ; il ne prétend pas remplacer une extraction
complète du catalogue, indisponible ici sans `TBLS_DSN`.

La revue des textes et traductions a été menée par des agents, avec relectures
croisées. Les contrôles ne constituent pas une certification par un locuteur natif.
