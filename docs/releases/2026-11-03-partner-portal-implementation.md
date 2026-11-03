# Portail partenaire — mise en œuvre du plan du 3 novembre 2026

Ce journal complète le plan et son audit datés du 3 novembre. Leur conclusion
« aucun code modifié » décrivait la fin de la planification, avant cette mise en
œuvre. La branche de travail est `codex/partner-portal-launch-20261030`, PR 73.
Le checkout principal et la production n'ont pas été modifiés par ces corrections.

## Contrat prestataire

Le contrat externe reste en version `1.0.0`. R1 ajoute une colonne interne et
l'exclut du lecteur dans la même transaction : aucune clé JSON nouvelle, même
avec une valeur `null`. R3a exclut les contenus restaurant non publics ou non
disponibles ; les clés, libellés, types, ordres et conventions `[]` restent les
mêmes. Le volet restaurant reste une projection publique ; l'éditeur office
conserve la collection complète. R3b traitera séparément les droits des tables.

Les dates de validité utilisent `CURRENT_DATE` dans le fuseau de la base,
comme l'export régional existant. Ce correctif ne change pas cette convention
en heure de La Réunion. Les quotas IA, distincts, devront utiliser le jour local.

## Preuves acquises et limites

- `0854579` : CI frontend complète verte (types, Jest, build et Playwright).
- `514ac3d` : les deux bases Supabase 17 jetables ont passé le manifeste, les
  tests SQL et 12 tests des vraies routes Next. Les dépendances métier ne sont
  pas simulées. La CI est encore rouge au nettoyage final des fixtures
  (`user_org_membership` doit être supprimé avant son office), correctif en cours.
- Le scénario d'upgrade compare 126 réponses SQL complètes avant/après avec
  six identités, sept fiches et trois variantes. Les différences autorisées
  sont nommées par identifiant. Le scénario fresh vérifie l'état final ; il ne
  prétend pas constituer une seconde preuve avant/après.
- Liste complète de 100 restaurants : médiane SQL 984,05 ms avant et
  972,67 ms après, budget isolé 1 476,08 ms, sur le run `41597103248`.
  Cette mesure ne représente pas la latence réseau de production.
- Le contrôle vivant du 3 novembre a confirmé les routes en ligne sans clé
  (401 attendu), la version 1.0.0 et les appels récents réussis dans le journal.
  Aucun GET authentifié de production n'a encore été exécuté pendant cette recette.

Les changements ultérieurs doivent repasser la CI sur leur propre commit.
Un test ignoré localement faute de Supabase n'est pas compté comme réussi.

## Revue indépendante Claude

Claude Opus 5.5, effort Max, a revu `d5f5d4d` en lecture seule. Il n'a relevé
aucun blocage de production dans les correctifs de ce commit, mais a démontré
que le manifeste frais n'atteignait pas l'empreinte attendue par R1.

Traitement des constats :

| Constat | Traitement |
|---|---|
| Écart entre reconstruction et lecteur vivant | `514ac3d` ajoute le packaging exact des correctifs déjà vivants ; garde conservée et tests SQL réellement passés. |
| Heures `expected` tronquées à la minute | Le client R2 conserve un instantané brut séparé de l'affichage, existence/null/secondes compris. Le contrat attendu reste brut ; on ne transforme pas silencieusement une référence obsolète. |
| Prédicat URL des cartes incomplet | Ajout de la condition HTTP(S) et d'une fixture non HTTP, avec comparaison au régional en cours. |
| Ancres SQL sensibles au checkout CRLF | `.gitattributes` impose LF aux migrations du jour, bascules et packaging. |
| Clé publique de test protégée seulement par PGOPTIONS | Marqueur indépendant créé uniquement par le bootstrap jetable et plafond de taille du corpus, requis aussi pour les fixtures. |
| Test de fermeture DML séjour sans identité valable | Assertions de privilèges par colonne et tentative réelle avec une identité autorisée en cours. |
| Harnais pouvant passer sans exécuter | Le runner exige un rapport Jest sans test ignoré, sonde l'authentification après le rechargement PostgREST ; les routes vérifient un quota effectivement consommé. |
| Ancien RPC séjour réactivable hors ordre | Retrait du GRANT de la migration encore non livrée, avec test. |
| X1 ignoré si son lecteur manque | En CI, sa présence devient obligatoire ; la migration optionnelle de production conserve sa non-activation. |

La revue finale devra porter sur le code consolidé, y compris R4 et les lots
suivants, et non seulement sur ce premier commit.

## Conditions de bascule

Les migrations préparatoires et les scripts de bascule restent séparés. Ne pas
rejouer un ancien fichier de grants ou le manifeste frais en production. Rejouer
la préparation R2 après sa bascule referme sa mutation acteur ; cela ne constitue
pas un retour arrière complet. Le runbook final doit relever l'état des droits
avant d'appliquer chaque étape.

Juste avant R1/R3a, exporter en lecture seule la définition du lecteur, son
empreinte, sa signature, ses attributs de sécurité, son propriétaire et ses ACL.
Conserver cet instantané avec la release. Une empreinte inattendue arrête le
déploiement ; elle ne doit jamais être remplacée par un ancien lecteur global.
Le point de secours R3 doit préserver l'exclusion R1 et la confidentialité déjà
acquise. L'API reste en service pendant ces vérifications.

Les nouveaux écrans Carte/Menus/Extraction/Photos attendent la validation de
l'aperçu isolé. Aucun fournisseur IA actif n'a été trouvé dans la configuration
vivante : extraction et analyse ne seront pas annoncées disponibles sans
configuration et quotas validés. Les crédits Claude servent à la revue du code,
pas aux appels IA du produit. Aucun déploiement, mail réel ou appel IA payant
du produit n'est effectué par cette recette.
