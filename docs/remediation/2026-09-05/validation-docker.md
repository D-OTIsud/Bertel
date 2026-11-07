# Validation Docker locale — 6 septembre 2026

La construction Node 22 de l'application et les **quatre cas de disponibilité réussissent**. Le démarrage non root, les exclusions de fichiers d'environnement, les en-têtes de sécurité et les routes vérifiées fonctionnent. Le défaut de disponibilité figée au build, découvert pendant cette revue, est corrigé et vérifié dans une nouvelle image avec des valeurs différentes au démarrage.

## Périmètre et image testée

- Docker Desktop 4.25.2, Engine 24.0.6, backend Linux amd64, contexte local `default`.
- Image locale de référence : `bertel-audit-local-20260906:node22-runtime-fixed`.
- Empreinte : `sha256:3c8f2aadaf7e07d95fb121f7d480efd6ccc89524f24eca287726806dc1d06298`.
- Construction datée du 5 septembre 2026 à 21:18:05 UTC, soit le 6 septembre à 01:18 à La Réunion.
- Version réellement exécutée : **Node v22.23.2**, application **Next.js 16.2.11**.
- Build réalisé avec `NEXT_PUBLIC_ENABLE_DEMO_MODE=true`, sans URL Supabase, clé réelle ou fichier `.env` transmis au contexte.
- Aucun déploiement ni publication d'image. Les essais de conteneurs utilisent `--network none`, sans port exposé sur l'hôte. Le cas « service disponible » utilise uniquement un faux service Auth sur la boucle locale du conteneur.
- Aucun conteneur Bertel existant n'a été modifié, arrêté ou utilisé comme cible. Les conteneurs de test ont été arrêtés et supprimés ; le contrôle final des noms `audit-bertel-node22-20260906-*` est vide.

Cette image correspond à l'instantané reconstruit après la correction de readiness par `Reflect.get` et les derniers ajustements de la route RGPD présents dans l'espace de travail. Les images antérieures et leurs échecs sont conservés comme éléments de diagnostic ; ils ne constituent pas l'image de référence ci-dessus. La validation porte sur cette empreinte, pas sur d'éventuelles modifications ultérieures.

## Construction

Commande, depuis la racine du dépôt :

```powershell
docker build --progress=plain --tag bertel-audit-local-20260906:node22-runtime-fixed --build-arg NEXT_PUBLIC_ENABLE_DEMO_MODE=true --file bertel-tourism-ui/Dockerfile bertel-tourism-ui
```

Résultat : **exit 0**, installation issue du cache npm, compilation Webpack réussie, vérification TypeScript réussie, 34 pages statiques générées, assemblage de l'image terminé. Le build Next a pris environ **168 secondes** sur cet environnement. Les avertissements de convention `middleware`, de données Browserslist anciennes et de classes Tailwind ambiguës sont restés non bloquants.

Une première tentative, avant stabilisation du code RGPD, avait échoué sur un cast TypeScript dans `src/app/api/rgpd/erase/route.ts:167`. Cet échec a été conservé dans le journal initial ; il est distinct de la construction finale réussie.

Journaux : [construction de référence](/C:/Users/dphil/Bertel3.0/scratch/remediation-2026-09-05/docker-node22-build-runtime-fixed.log), [première tentative](/C:/Users/dphil/Bertel3.0/scratch/remediation-2026-09-05/docker-node22-build.log), [identité de l'image](/C:/Users/dphil/Bertel3.0/scratch/remediation-2026-09-05/docker-runtime-fixed-image-identity.log).

## Résultats des contrôles

| Contrôle | Résultat |
|---|---|
| Utilisateur effectif | **Réussi** : configuration Docker `User=node`, processus de test UID **1000**. |
| Script de démarrage Linux | **Réussi après correction** : fichiers shell imposés en LF et normalisation défensive dans Docker. La version CRLF initiale échouait effectivement sous Linux avec `no such file or directory`. |
| Génération de configuration publique | **Réussi** sous UID 1000 ; le fichier est généré, servi et lisible en JavaScript. |
| Mode démo par défaut | **Réussi** : sans variable démo ni configuration, l'image complète refuse de démarrer, exit **1**. Une activation explicite `true` permet la démo. |
| Compose | **Réussi** : démo build/runtime par défaut `false`, valeurs publiques alignées, clé serveur uniquement dans l'environnement runtime et absente des arguments de build. Test avec valeurs fictives et sans fichier `.env`. |
| Exclusion `.env` | **Réussi** : sentinelles `.env` et variantes exclues à la racine et dans les sous-dossiers ; seule `.env.example` racine est autorisée. Aucun fichier `.env` ou variante non exemple trouvé dans `/app` de l'image finale. |
| Exclusion des fichiers de clés imbriqués | **Réussi après correction** : les motifs initiaux laissaient passer les sentinelles imbriquées `.key` et `service-account-*.json`. Le contexte reconstruit avec les motifs récursifs corrigés les exclut. |
| `/api/health` | **Réussi** : HTTP **200**, `ok=true`, dans les quatre cas d'exécution. Cette sonde indique uniquement que le processus répond. |
| En-têtes HTTP | **Réussi** : CSP présente, HSTS `max-age=63072000; includeSubDomains`, X-Frame-Options `SAMEORIGIN`, vérifiés sur la réponse de santé de l'image. Aucun reverse proxy de production n'a été testé. |
| Routes HTTP | **Réussi dans les quatre cas** : `/login`, `/explorer`, `/crm`, `/legal/rgpd.html` répondent **200** avec un contenu HTML. Ce contrôle n'exécute pas l'interface dans un navigateur et ne couvre pas l'hydratation ni les interactions. |

Preuves : [configuration de l'image](/C:/Users/dphil/Bertel3.0/scratch/remediation-2026-09-05/docker-runtime-fixed-image-config.log), [matrice HTTP complète](/C:/Users/dphil/Bertel3.0/scratch/remediation-2026-09-05/docker-runtime-fixed-matrix.log), [refus par défaut](/C:/Users/dphil/Bertel3.0/scratch/remediation-2026-09-05/docker-runtime-fixed-default-refusal.log), [Compose](/C:/Users/dphil/Bertel3.0/scratch/remediation-2026-09-05/docker-compose-defaults.log), [inventaire du contexte corrigé](/C:/Users/dphil/Bertel3.0/scratch/remediation-2026-09-05/docker-context-inventory-v2.log), [échec CRLF initial](/C:/Users/dphil/Bertel3.0/scratch/remediation-2026-09-05/docker-entrypoint-crlf.log), [absence de conteneur de test restant](/C:/Users/dphil/Bertel3.0/scratch/remediation-2026-09-05/docker-runtime-fixed-leftover-containers.log).

## Readiness : défaut de compilation corrigé et vérifié

L'image de référence a été construite en démo. Trois conteneurs ont ensuite été démarrés avec `NEXT_PUBLIC_ENABLE_DEMO_MODE=false`, vérifié dans leur environnement réel **et** dans la configuration servie au navigateur. La sonde reflète désormais ces valeurs d'exécution.

| Configuration d'exécution | Attendu | Observé | Verdict |
|---|---|---|---|
| Démo explicitement activée | 200, `mode=demo` | 200, `mode=demo` | Réussi |
| Démo désactivée, adresse loopback sans service | 503, `reason=degraded` | 503, `reason=degraded`, 109 ms | Réussi |
| Démo désactivée, faux service Auth local répondant 200 | 200, `mode=live` | 200, `mode=live`, 64 ms | Réussi |
| Démo désactivée, URL invalide non vide | 503, `reason=misconfigured` | 503, `reason=misconfigured`, 28 ms | Réussi |

La commande de matrice termine avec **exit 0** et `RUNTIME_MATRIX_OK`. Les délais ci-dessus sont ceux des réponses locales observées ; ils ne constituent pas une mesure de performance d'un service Supabase réel.

Le défaut initial a été reproduit dans l'image antérieure `node22-final`, empreinte `24b7f360…`. La première tentative de correction passait par `const runtimeEnv = process.env`, puis lisait les propriétés `NEXT_PUBLIC_*` de cet alias. L'inspection de cette ancienne route compilée montrait que ces propriétés avaient tout de même été remplacées par les valeurs du build :

```javascript
if (process.env, "true".trim().toLowerCase() === "true")
  return { status: 200, body: { ready: true, mode: "demo" } };
```

Les URL et clé publiques vides du build sont également devenues des chaînes littérales. Le script de post-traitement Next installé reconnaît les accès `NEXT_PUBLIC_*` à travers un alias (`node_modules/next/dist/lib/inline-static-env.js:40`). Un simple alias n'est donc pas une garantie de lecture à l'exécution.

Ce défaut produisait une sonde faussement verte lorsqu'une image construite en démo était démarrée hors démo. Il n'est plus reproduit dans l'image de référence.

**Correction appliquée et validée :** `runtimeValue(key)` utilise `Reflect.get(process.env, key)` dans [la route readiness](/C:/Users/dphil/Bertel3.0/bertel-tourism-ui/src/app/api/ready/route.ts:56). Les quatre essais sur la nouvelle image vérifient que les valeurs d'exécution déterminent le résultat. Les tests unitaires seuls n'avaient pas détecté la transformation du build précédent.

Preuves de validation : [démo](/C:/Users/dphil/Bertel3.0/scratch/remediation-2026-09-05/docker-runtime-fixed-http-demo.log), [service indisponible](/C:/Users/dphil/Bertel3.0/scratch/remediation-2026-09-05/docker-runtime-fixed-http-degraded.log), [service local disponible](/C:/Users/dphil/Bertel3.0/scratch/remediation-2026-09-05/docker-runtime-fixed-http-live.log), [configuration invalide](/C:/Users/dphil/Bertel3.0/scratch/remediation-2026-09-05/docker-runtime-fixed-http-misconfigured.log). Le [diagnostic du build antérieur](/C:/Users/dphil/Bertel3.0/scratch/remediation-2026-09-05/docker-ready-compiled-check.log) reste archivé.

Ce test volontaire de configurations opposées porte sur la sonde. Il ne certifie pas qu'une application entière construite en démo puisse être basculée vers la production sans autre vérification : les valeurs publiques de l'application doivent rester alignées entre build et runtime, comme prévu dans Compose. La sonde ne valide que le point de santé Auth, pas la base métier, Storage/RLS ou SMTP.

## Tests ciblés et limite CI

Les tests suivants ont été exécutés sur le poste hôte, avec des appels réseau simulés :

```powershell
node node_modules/jest/bin/jest.js src/app/api/ready/route.test.ts src/lib/env.test.ts --runInBand
node node_modules/jest/bin/jest.js src/app/api/ready/route.test.ts --runInBand
```

Le premier lancement passe **2 suites / 11 tests** ; le second, après la modification de readiness, passe **1 suite / 7 tests**. Il s'agit d'une répétition partielle, pas de 18 tests distincts. Les tests hôte étaient exécutés sous Node 25.8.1 ; la construction et les sondes dans le conteneur constituent ici les vérifications effectivement réalisées sous Node 22.

Journaux : [configuration et readiness](/C:/Users/dphil/Bertel3.0/scratch/remediation-2026-09-05/docker-ready-env-jest.log), [readiness après modification](/C:/Users/dphil/Bertel3.0/scratch/remediation-2026-09-05/docker-ready-final-jest.log).

La CI actuelle construit l'application puis lance les E2E avec `next dev` (`scripts/run-e2e.mjs:72`) ; elle ne teste pas l'artefact issu du build. Un mode exécutant `next start`, ou une recette de l'image, doit couvrir les différences de compilation et de configuration comme celle découverte ici.

## Modifications et limites de la revue

- Ce sous-agent a actualisé le commentaire Docker pour Next 16.2.11, corrigé la documentation d'exploitation sur l'incertitude d'acceptation SMTP et réalisé les fixtures/logs de test. Aucune ligne de code applicatif n'a été corrigée par ce sous-agent.
- La tâche principale a corrigé les exclusions récursives, les fins de ligne du script et la normalisation dans Docker. Après l'échec intégré de la lecture par alias, elle a remplacé cette lecture par `Reflect.get` ; la nouvelle image passe les quatre cas.
- Les images `bertel-audit-*` restent locales ; aucune image n'a été publiée. Les conteneurs jetables ont été supprimés. Les fixtures ne contiennent que des valeurs fictives.
- Aucun projet Supabase réel, relais SMTP, reverse proxy public, contrat d'hébergement ou procédure de restauration n'a été testé. Le cas Auth disponible vérifie la gestion d'une réponse locale simulée, pas un service réel.
- Cette recette ne valide pas l'accessibilité visuelle, les parcours authentifiés complets, les permissions de base ou les mutations métier. Les résultats de ces autres validations relèvent des documents et tests correspondants.
