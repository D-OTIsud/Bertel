# Audit — Observabilité, diagnostic et alertes

Date : 5 septembre 2026. Révision : `5873ec69879e61ff34030d196c65f2eb0ac14de0`.

## Périmètre et méthode

Lecture des limites d'erreur, de la traduction des erreurs, du healthcheck, des mécanismes Realtime et du cycle de synchronisation. Recherche ciblée d'instrumentation et de corrélation dans le frontend et les routes. Les outils de supervision de l'hébergeur et les tableaux de bord Supabase n'ont pas été inspectés.

## Points solides

Des écrans de repli remplacent les pages blanches et attribuent une référence d'incident (`bertel-tourism-ui/src/components/common/ErrorBoundary.tsx:22`). La traduction centralisée limite l'exposition des détails techniques ; les journaux produits par `src/services/api-error.ts:35` sont réduits en production. Les abonnements Realtime disposent d'une reconstruction avec temporisation et reprise au retour en ligne (`src/lib/realtime-recovery.ts:55`, `:142`). La synchronisation ONF possède un identifiant d'exécution, des compteurs et une finalisation SQL.

## Constats

### OBS-01 — P2 — Les références d'incident frontend ne sont pas reliées à un collecteur identifié

**Statut : confirmé dans le chemin inspecté.** `bertel-tourism-ui/src/components/common/ErrorBoundary.tsx:26` journalise uniquement dans la console du navigateur. `src/app/error.tsx:19` utilise également `console.error`. Aucun module de collecte d'exceptions ou propagation d'identifiant de requête commun n'a été trouvé dans `src`.

**Impact :** l'utilisateur peut communiquer une référence que le support ne sait pas retrouver côté serveur. Une fermeture d'onglet peut faire perdre le contexte.

**Recommandation :** collecteur d'erreurs minimal avec version applicative, route normalisée, identifiant d'incident et corrélation serveur ; filtrer tokens, adresses, contenu métier et données personnelles. Définir rétention et accès.

**Validation :** déclencher une erreur synthétique sur un environnement de test et retrouver la même référence dans le ticket, le navigateur et la supervision, sans donnée sensible.

### OBS-02 — P2 — Le healthcheck ne mesure que la disponibilité du processus HTTP

**Statut : confirmé ; choix de conception à compléter.** `bertel-tourism-ui/src/app/api/health/route.ts:5` renvoie toujours `{ok:true}` sans dépendance externe ; le Dockerfile utilise précisément cette route. Son test vérifie ce contrat (`bertel-tourism-ui/src/app/api/health/route.test.ts:5`).

**Impact :** indisponibilité Supabase, configuration backend absente ou accès Storage rompu peuvent coexister avec un conteneur considéré sain. La sonde reste utile pour la vivacité du processus ; il ne faut pas la transformer en cause de redémarrage permanent lors d'une panne tierce.

**Recommandation :** garder la vivacité et ajouter une vérification distincte d'aptitude au service, courte et bornée, ainsi que des contrôles synthétiques du parcours critique. Ne jamais exposer la configuration ou les clés dans la réponse.

**Validation :** backend volontairement indisponible en test : sonde HTTP vivante, sonde dépendances dégradée et alerte compréhensible.

### OBS-03 — P2 — Les journaux métier ne prouvent pas une supervision technique complète

**Statut : à vérifier pour la production.** Les tables `audit_log`, `metric_snapshot`, `partner_api_call` et `trail_sync_run` figurent dans `db-graph-out/DB_AGENT_INDEX.md:13` et l'inventaire. Leur présence ne garantit pas des alertes sur erreurs, latence, saturation, échecs SMTP ou synchronisations bloquées. Aucun seuil d'alerte ou objectif de disponibilité versionné n'a été identifié dans le périmètre applicatif inspecté.

**Recommandation :** quelques alertes rattachées à un responsable : erreurs des routes critiques, délai des RPC, synchronisation sans succès depuis l'échéance attendue, échec de sauvegarde, échec SMTP et consommation IA. Documenter résolution et escalade.

**Validation :** une panne synthétique émet une seule alerte actionnable, puis un signal de rétablissement ; les seuils évitent le bruit sur les erreurs utilisateur normales.

### OBS-04 — P2 — Un échec métier ONF peut retourner HTTP 200

**Statut : confirmé dans le code.** `supabase/functions/trail-sync/orchestrator.ts:135` classe `source_error` comme exécution échouée en base, mais `:147` retourne HTTP 200 avec le résultat. Une supervision fondée uniquement sur le statut HTTP déclarerait ce déclenchement réussi.

**Recommandation :** consommer explicitement le statut métier du corps/registre, ou définir un contrat HTTP distinguant résultat refusé et succès, en préservant les règles de retry. Un simple HTTP 200 ne doit pas satisfaire l'alerte de fraîcheur.

**Validation :** fixture déclenchant le garde-fou : aucune modification incorrecte en base, statut métier failed, échec visible dans la supervision. Le garde-fou lui-même est un point positif.
