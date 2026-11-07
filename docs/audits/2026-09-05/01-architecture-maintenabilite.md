# Audit — Architecture et maintenabilité

Date : 5 septembre 2026. Révision examinée : `5873ec69879e61ff34030d196c65f2eb0ac14de0`. Audit du dépôt de travail, sans correction applicative.

## Périmètre et méthode

Navigation initiale par `graphify query`, puis lecture des points d'entrée, services, configuration TypeScript, documentation et inventaire des fichiers. Le frontend contient 515 fichiers TypeScript/TSX hors tests, soit 90 074 lignes, et 407 fichiers de tests ; ces comptes n'incluent pas les CSS, SQL ou scripts. L'App Router expose 17 fichiers `page.tsx` et 20 routes API. Les nombres décrivent le périmètre, pas une lecture exhaustive ligne par ligne.

La séparation effective comprend : pages Next.js, vues et fonctionnalités React, hooks TanStack Query, état Zustand, services de conversion métier, Supabase Auth/Storage/RPC, fonctions SQL et une Edge Function de synchronisation. L'accès navigateur aux données et l'accès serveur privilégié coexistent : leurs frontières doivent rester explicites.

## Points solides

- Découpage par fonctionnalités pour l'éditeur, le CRM, les listes, l'aide et l'administration.
- Carte chargée à la demande (`bertel-tourism-ui/src/views/ExplorerPage.tsx:20`) et export XLSX importé à la demande (`src/services/export/export-workbook.ts:172`, sous le même répertoire).
- `server-only` protège notamment le module SMTP ; TypeScript strict et tests nombreux ; la construction Next.js réussit pendant cet audit.
- Modèle objet canonique et manifeste SQL documentés, avec un dispositif de reconstruction d'une base neuve.

## Constats

### ARC-01 — P2 — Concentration des responsabilités dans quelques fichiers

**Statut : confirmé par inventaire ; risque de maintenance.** `bertel-tourism-ui/src/services/object-workspace.ts:1` compte 6 789 lignes et rassemble des lectures, transformations, permissions et écritures de nombreuses sections. `src/services/object-workspace-parser.ts:1` en compte 3 596 ; `src/features/object-drawer/ObjectDetailView.tsx:1`, 4 130. Ces trois fichiers totalisent 14 515 lignes, environ 16 % du TypeScript applicatif inventorié.

**Impact :** une évolution de facette, de permission ou de représentation augmente la surface de revue et les conflits de modification. Ce volume ne prouve ni un défaut d'exécution ni une duplication de chaque fonction.

**Recommandation :** extraire progressivement les domaines (tarifs, ouvertures, acteurs, itinéraires, médias) derrière une façade publique stable. Séparer adaptation de payload, autorisation et orchestration. Ne pas commencer par une réécriture générale.

**Validation :** conservation des signatures publiques et des résultats des tests de chaque domaine ; un changement métier local doit pouvoir être relu dans un module de taille limitée.

### ARC-02 — P2 — Contrat base/frontend largement porté par des conversions manuelles

**Statut : confirmé dans les clients et services inspectés.** Le singleton utilise `SupabaseClient` et `createClient(...)` sans type de schéma généré (`bertel-tourism-ui/src/lib/supabase.ts:8`, `:16`). Des réponses sont converties depuis `Record<string, unknown>` dans le service workspace, notamment `src/services/object-workspace.ts:1451` et `:1813`. Aucun fichier de types de base générés n'a été trouvé dans le frontend inspecté.

**Impact :** une colonne ou une forme RPC peut évoluer sans erreur de compilation au point d'appel ; les parseurs et tests deviennent alors la principale garantie. Cela n'implique pas que toute réponse soit dépourvue de validation.

**Recommandation :** générer les types des schémas exposés, conserver des adaptateurs métiers explicites et valider à l'exécution les frontières JSON critiques. Vérifier automatiquement la dérive des types contre le schéma de référence.

**Validation :** une modification incompatible d'un contrat RPC provoque un échec de contrôle ou de test de contrat avant livraison.

### ARC-03 — P2 — Documentation de démarrage en décalage avec le code

**Statut : confirmé.** `bertel-tourism-ui/README.md:7` affirme encore qu'un build Node 18 est possible ; le Next.js verrouillé exige au moins Node 20.9. Le README décrit Docker + Nginx et deux clients Supabase distincts, tandis que le Dockerfile lance `node server.js` et que `src/lib/supabase.ts:34` exporte `getApiClient = getSupabaseClient`. Le commentaire du singleton explique justement l'abandon du second client.

**Impact :** nouvel environnement mal configuré, diagnostic erroné de sessions et procédures de déploiement ambiguës.

**Recommandation :** aligner README, scripts, versions de référence et variables réellement consommées. Distinguer documentation actuelle et comptes rendus historiques ; garder la carte canonique comme point d'entrée métier.

**Validation :** installation et démarrage par une personne extérieure à partir du seul guide, avec la même architecture et les mêmes commandes que la CI.

## Limites

Le graphe sert à orienter la revue et ne prouve pas l'état déployé. Aucun refactoring, changement SQL ou contrôle d'historique Git exhaustif n'a été réalisé. Les risques de reconstruction SQL et de tests sont détaillés dans les audits 04–06, 12 et 14.
