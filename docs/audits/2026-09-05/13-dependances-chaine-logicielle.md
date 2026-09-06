# Audit — Dépendances et chaîne logicielle

Date de consultation du registre npm : 5 septembre 2026. Révision : `5873ec69879e61ff34030d196c65f2eb0ac14de0`.

## Périmètre et résultats

Lecture de `package.json`, `package-lock.json`, Dockerfile et imports Edge ; exécution de `npm audit --json --ignore-scripts` puis `npm audit --omit=dev --json --ignore-scripts`. Aucune installation, mise à jour de paquet ou correction automatique.

| Périmètre npm | Faible | Modérée | Élevée | Critique | Total |
|---|---:|---:|---:|---:|---:|
| Arbre complet | 9 | 34 | 16 | 0 | 59 |
| Avec `--omit=dev` | 1 | 27 | 7 | 0 | 35 |

Il s'agit de paquets signalés dans l'arbre, **pas de 59 failles distinctes exploitables dans Bertel**. Plusieurs entrées proviennent d'une même dépendance transitive. Le périmètre `--omit=dev` peut encore comprendre un paquet déclaré en développement lorsqu'il appartient aussi à une chaîne de production. La preuve structurée est conservée dans [preuves/dependances.json](./preuves/dependances.json).

Versions verrouillées relevées : Next.js 16.1.6, React 19.2.6, Supabase JS 2.99.1, PDF.js 4.10.38, Nodemailer 9.0.3, MapLibre 5.20.1, TypeScript 5.7.3. Le lockfile et `npm ci` dans Docker constituent une base de reproductibilité utile.

## Constats

### DEP-01 — P1 — Versions de production signalées par des avis élevés

**Statut : versions concernées confirmées par audit de dépendances ; exploitabilité spécifique non démontrée.** Les sept paquets classés élevés avec `--omit=dev` sont `next`, `sharp`, `postcss`, `ws`, `nanoid`, `linkify-it` et `picomatch`. Exemples de preuves : `bertel-tourism-ui/package-lock.json:18499` pour Next, `:21435` pour sharp et `:23750` pour ws.

Next 16.1.6 appartient notamment à l'intervalle affecté décrit par l'[avis officiel sur le déni de service Server Components](https://github.com/vercel/next.js/security/advisories/GHSA-8h8q-6873-q5fj). Un autre [avis officiel relatif aux Server Actions](https://github.com/vercel/next.js/security/advisories/GHSA-m99w-x7hq-7vfj) a des préconditions différentes. La présence d'App Router ou du paquet ne suffit pas à conclure que tous les avis Next s'appliquent : middleware, image optimizer, Server Actions et configuration doivent être examinés séparément.

**Impact :** maintien de composants pour lesquels des correctifs de sécurité existent, dont certains traitent l'épuisement de ressources. Aucun exploit n'a été envoyé à l'application.

**Recommandation :** prioriser Next et les composants utilisés sur les fichiers ou connexions externes ; choisir une version compatible couvrant tous les avis pertinents à la date de correction. Mettre à jour par lots, relire le lockfile et rejouer tests, build et parcours. Ne pas appliquer `npm audit fix --force` indistinctement : certaines remédiations proposées impliquent une version majeure ou une régression de version.

**Validation :** plus aucun avis élevé pertinent sans analyse d'exposition documentée, et aucun échec de régression.

### DEP-02 — P2 — Pas de contrôle de dépendances continu dans la CI examinée

**Statut : confirmé pour le dépôt ; réglages GitHub distants non inspectés.** Un seul workflow est versionné (`.github/workflows/sql-fresh-apply.yml:1`), centré SQL. Aucun job npm audit ni configuration Dependabot/Renovate n'a été trouvé dans `.github`.

**Impact :** les avis apparus après une livraison peuvent ne pas être détectés par le projet lui-même. Les outils distants de l'organisation peuvent compléter ce dispositif ; leur existence reste à vérifier.

**Recommandation :** suivi automatique des versions et contrôle des avis sur les changements de lockfile ; triage production/développement et exceptions motivées avec échéance.

**Validation :** une PR introduisant un paquet connu vulnérable déclenche un signal exploitable. La [documentation npm audit](https://docs.npmjs.com/cli/v11/commands/npm-audit/) précise le périmètre de l'outil et ses limites.

### DEP-03 — P2 — Références d'exécution et de construction hétérogènes

**Statut : confirmé.** `bertel-tourism-ui/package.json:7` accepte Node `>=20`, le README évoque Node 18, Docker utilise `node:22-alpine` (`Dockerfile:1`), et l'audit local tourne sous Node 25.8.1/npm 11.11.0. Le build Docker utilise `--legacy-peer-deps` pour une incompatibilité documentée. L'Edge Function importe `npm:@supabase/supabase-js@2` (`supabase/functions/trail-sync/index.ts:11`) sans version mineure exacte ni lock Deno trouvé dans son périmètre.

**Impact :** résolution, avertissements et compatibilité peuvent diverger entre poste, CI, Docker et Edge. La réussite locale ne prouve pas la reproductibilité du conteneur ou de l'Edge Function.

**Recommandation :** choisir une version LTS de référence suivant le [calendrier officiel Node.js](https://nodejs.org/en/about/previous-releases), aligner le guide et les jobs, verrouiller les imports Edge et vérifier le graphe des peer dependencies.

**Validation :** reconstruction propre à partir des seuls fichiers versionnés sur l'environnement cible, sans résolution imprévue.

## Limites

L'audit npm ne vérifie pas les paquets système Alpine, l'historique des secrets, les images réellement déployées, ni les licences de tous les assets ou services tiers. Ces vérifications restent nécessaires avant une attestation de chaîne logicielle complète.
