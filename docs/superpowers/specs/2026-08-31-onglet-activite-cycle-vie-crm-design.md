# Onglet Activité équipe + cycle de vie CRM — design

**Date :** 2026-08-31
**Statut :** conception validée en brainstorming (5 arbitrages PO confirmés ce jour)
**Origine :** axe C de `docs/audits/2026-08-30-dashboard-audit-propositions.md`, plus la Brique 3 de `docs/superpowers/specs/2026-06-18-dashboard-timeseries-observatory-design.md` (conçue en juin, jamais construite)
**Maquette validée :** artifact « Onglet Activité équipe »

---

## 1. Objectif produit

Deux choses, livrées ensemble parce que la seconde alimente la première.

**Rendre l'onglet « Activité équipe » réel.** Il affiche aujourd'hui un placeholder. L'audit prévoyait vélocité, contributeurs et modération ; le widget modération est mort-né (`pending_change` est vide depuis toujours) et se transforme en suivi CRM.

**Donner au CRM un cycle de vie qui distingue ce que l'équipe maîtrise de ce qu'elle attend.** Une demande en attente d'un document du prestataire n'est pas une demande que l'équipe traîne. Le temps passé à attendre doit être **déduit** du temps de traitement, faute de quoi le KPI mesure la lenteur du prestataire et non le travail de l'équipe.

---

## 2. Constat de disponibilité (vérifié sur la base vive, 2026-08-31)

Ce constat a redessiné trois des quatre widgets. Il est reproduit ici parce qu'il justifie chaque choix de métrique.

### Le versionnage

| Fait | Valeur |
|---|---|
| Versions totales | 3 960 |
| **Sans auteur** (`created_by IS NULL`) | **2 299 — 58 %** |
| Éditeurs humains distincts | **3** |
| Historique | 2026-05-01 → 2026-08-28 |

Les versions sans auteur sont des imports et des opérations système. Les versions humaines sont elles-mêmes dominées par des passes en masse : une semaine à **844 versions sur 842 fiches**, contre une autre à 41 versions sur 2 fiches.

**La séparation est nette et sans recouvrement** — c'est ce qui rend la métrique choisie défendable :

| Fiches touchées en un jour par un éditeur | Nombre de jours |
|---|--:|
| 482, 308, 277, 251, 58 | 5 (passes en masse) |
| 9 | 1 |
| 2 | 6 |
| 1 | 18 |

Rien entre 9 et 58. Le travail éditorial réel ne dépasse jamais 9 fiches par jour.

### Les contributeurs

| Éditeur | Versions | Fiches | Jours actifs | Période |
|---|--:|--:|--:|---|
| David Philippe | 1 534 | 486 | 17 | 16/06 → 27/08 |
| cl.metro@otisud.com | 125 | **6** | 12 | 04/08 → 28/08 |
| m.lallement@otisud.com | 2 | 1 | 1 | 12/08 |

Deux des trois n'ont pas de `display_name` renseigné et s'afficheraient par leur adresse e-mail.

### Le CRM

| Fait | Valeur |
|---|---|
| Interactions totales | 3 144 |
| **Créées dans l'application** | **3** |
| Imports Berta (2 sources) | 3 141, arrêtés au 16/04/2026 |
| `first_response_at` renseigné | **0** |
| `resolved_at` renseigné | 1 253 |
| Demandes ouvertes | 170 |

Les 170 demandes ouvertes ne sont pas une charge vivante :

| Ancienneté | Nombre |
|---|--:|
| moins de 30 j | 3 |
| 30 à 90 j | 0 |
| 90 j à 1 an | 24 |
| **plus d'un an** | **143** |

Dont **123 « Demande signalétique »**, la plus ancienne de novembre 2018, d'âge moyen 1 506 jours.

**Conséquence directe :** le temps de première réponse est inconstruisible (`first_response_at` vide sur 3 144 lignes) et une courbe de flux CRM afficherait zéro. Ce sont des faits, pas des choix.

---

## 3. Arbitrages verrouillés

| # | Question | Décision |
|---|---|---|
| 1 | Que mesure l'onglet ? | **Le travail humain seul.** Les versions sans auteur sont exclues ; on compte des **jours-éditeur**, pas des versions. |
| 2 | Contenu du lot | **Les trois widgets**, plus le cycle de vie CRM. |
| 3 | Widget CRM | **Composition et âge de l'arriéré**, plus une courbe de flux en **état vide honnête**. |
| 4 | Carte du bandeau | **Distinguer le récent de l'arriéré** : le chiffre d'alerte porte sur le récent, l'arriéré est mentionné en second. |
| 5 | Vocabulaire de statut | **Le cycle complet** : `new, in_progress, awaiting_provider, resolved, closed` — plus `canceled` conservé (voir §6.1). |
| 6 | Migration de l'enum | **Recréation propre** du type, pas d'ajout de valeurs à l'ancien. |
| 7 | Remappage des données | `planned → new`, `done → resolved`. **Traduction littérale**, sans rien inventer. |

---

## 4. Les widgets de l'onglet

### 4.1 Rythme de saisie

**Métrique : jours-éditeur distincts par semaine**, sur 12 semaines, plus les fiches créées en surimpression.

Un jour compte pour un, qu'on ait repris une fiche ou trois cents. C'est ce qui rend la courbe insensible aux passes en masse. Sur les données réelles : 1, 1, 2, 2, 3, 4, 3, **6**, 5, 3 — une montée en charge lisible, là où le volume brut aurait donné un pic à 844 suivi de plat.

Les versions sans auteur sont **exclues du calcul**. Les semaines sans activité humaine s'affichent à zéro, jamais omises.

**Le widget doit dire pourquoi il compte des jours.** Sans cette note, quelqu'un « corrigera » un jour en repassant au volume, et le graphique redeviendra un compteur d'imports.

### 4.2 Contributeurs

Par éditeur : **jours actifs**, fiches touchées, période couverte. **Classement par jours actifs, pas par volume** — sinon cinq passes en masse placent un compte devant douze jours de reprise patiente.

Un éditeur dont une journée dépasse le seuil de 9 fiches porte une mention « dont N passes en masse » à côté de son total de fiches. Le chiffre reste affiché ; il ne se fait pas passer pour de la saisie.

Le seuil de 9 n'est **pas** un paramètre à régler : il est dérivé du trou observé dans la distribution. Si un jour la distribution se remplit entre 9 et 58, la mention devient trompeuse et il faudra revoir — c'est écrit ici pour que le futur lecteur le sache.

**Affichage du nom :** `display_name` s'il existe, sinon la partie locale de l'adresse e-mail (avant l'arobase), jamais l'adresse entière — c'est une donnée de contact, pas un identifiant d'affichage.

### 4.3 Demandes CRM — composition de l'arriéré

Deux vues côte à côte :

- **Par ancienneté** : moins de 30 j / 30 à 90 j / 90 j à 1 an / plus d'un an, en barres.
- **Par sujet** : les demandes ouvertes groupées par `demand_topic`, avec la date de la plus ancienne de chaque groupe.

C'est ce qui rend l'arriéré actionnable : « 123 demandes signalétique, la plus ancienne de 2018 » se traite, « 170 demandes en cours » ne se traite pas.

### 4.4 Demandes CRM — flux mensuel

Nouvelles et traitées par mois. **Il affichera son état vide**, et c'est voulu : 3 demandes créées dans l'application depuis la mise en service. Le widget se remplit avec l'usage, comme le registre de séries a attendu d'accumuler.

L'état vide doit dire **pourquoi** il est vide — sinon il se lit comme une panne.

### 4.5 Temps de traitement net

`temps net = (résolution − création) − Σ(durées passées en attente prestataire)`

**Forward-only.** Les 3 144 demandes importées n'ont aucun historique de transitions et restent **hors moyenne**. Le widget affichera son état vide jusqu'à la première demande ayant parcouru son cycle après la mise en service.

En attendant, il affiche le **calcul** plutôt qu'une fausse moyenne : une barre segmentée d'exemple montrant l'écoulé, l'attente déduite, et le net.

---

## 5. La carte du bandeau

Elle passe de « 172 demandes en cours » à une formulation qui sépare le récent de l'hérité :

> **5** éléments à traiter
> Tout le périmètre · 3 demandes de moins de 90 jours, 2 tâches à faire
> \+ 167 demandes plus anciennes

Le chiffre d'alerte redevient un signal d'action. **Seuil : 90 jours** — au-delà, une demande rejoint l'arriéré mentionné en seconde ligne.

*(Corrigé à la livraison, manifeste 17h. Trois écarts entre ce que cette maquette annonçait et ce que la RPC calcule :*
*— « moins de 30 jours » contredisait le seuil de 90 jours écrit deux lignes plus bas, et que le SQL applique ;*
*— « demandes récentes » nommait une somme qui contient des **tâches**, deux vocabulaires que la base sépare (`crm_status` / `crm_task_status`), et dont rien ne borne l'âge côté tâche — « récente » y serait faux ;*
*— « en attente depuis plus de 90 jours » prêtait un âge à un arriéré obtenu par **soustraction**, qui ramasse aussi les demandes sans date d'occurrence. « Plus anciennes » est vrai sans sur-affirmer.)*

Le contrat de `api.get_dashboard_crm_open` gagne deux clés : `recent_interactions` (moins de 90 j) et `backlog_interactions` (90 j et plus). `open_interactions` et `total` sont **conservés** — ils alimentent l'invariant de cohérence avec la courbe (§6.4).

---

## 6. Le cycle de vie CRM

### 6.1 Le vocabulaire

| Statut | Sens | Compte comme ouvert ? |
|---|---|---|
| `new` | Reçue, pas encore prise en main | oui |
| `in_progress` | Un agent la traite | oui |
| `awaiting_provider` | On attend un retour du prestataire | oui, **mais le temps ne compte pas** |
| `resolved` | Traitée | non |
| `closed` | Clôturée sans traitement actif | non |
| `canceled` | Annulée | non |

**`canceled` est conservé** bien que la spec §100 ne le mentionne pas : il existe déjà dans le type, il est sémantiquement distinct de `closed` (annulée ≠ clôturée), et `CLOSED_INTERACTION_STATUSES` du kanban s'en sert. Le retirer casserait un comportement livré.

### 6.2 Le journal de transitions

```
crm_interaction_status_event(
  id            uuid primary key default gen_random_uuid(),
  interaction_id uuid not null references crm_interaction(id) on delete cascade,
  from_status   crm_status,        -- null à la création
  to_status     crm_status not null,
  changed_at    timestamptz not null default now(),
  changed_by    uuid                -- null si opération système
)
```

Alimenté par un trigger `AFTER INSERT OR UPDATE OF status ON crm_interaction`. RLS activée, lecture via RPC `SECURITY DEFINER` selon la doctrine CRM §61 — jamais en PostgREST direct.

**Pourquoi une table dédiée alors que l'audit trace déjà tout.** Le trigger `audit.log_row_changes` enregistre le avant/après complet de chaque modification : sur **4 595 lignes** d'audit CRM, **57** sont de vrais changements de statut — 1,2 %. Calculer un KPI en balayant un journal générique en JSONB, qui grossit à chaque édition de champ, n'est pas tenable sur un chemin d'affichage.

**Amorçage :** les 57 transitions déjà présentes dans `audit.audit_log` depuis le 11 juin sont **rejouées une fois** dans le journal à la migration. Le journal n'est donc pas vide au premier jour. C'est un backfill de fait avéré — chaque ligne d'audit porte son `changed_at` et son `changed_by` réels — et non une reconstitution.

### 6.3 La migration du type

**Recréation, pas ajout de valeurs.** PostgreSQL ne sait pas retirer une valeur d'un enum ; ajouter les cinq nouvelles laisserait un type à huit valeurs dont trois mortes, et rien ne signalerait un prédicat oublié.

`crm_status` ne sert qu'à **une seule colonne** — `public.crm_interaction.status`, sans DEFAULT (supprimé par §220). La bascule est donc circonscrite.

Ordre :
1. Créer `crm_status_v2` avec les six valeurs.
2. `ALTER TABLE crm_interaction ALTER COLUMN status TYPE crm_status_v2 USING (mapping explicite)` — `planned→new`, `done→resolved`, `canceled→canceled`.
3. Redéployer les 7 fonctions dépendantes avec le nouveau vocabulaire (§6.4).
4. `DROP TYPE crm_status` puis renommer `crm_status_v2` en `crm_status`.

### 6.4 Le rayon d'impact — et pourquoi la recréation ne suffit pas

**Sept fonctions référencent l'ancien vocabulaire.** Elles ne se comportent pas de la même façon face au renommage, et la distinction est la partie la plus importante de cette spec.

**Trois échoueraient EN SILENCE**, toutes pour la même raison : la comparaison se fait **en texte**, ce qui désarme le typage. Après renommage, aucune ligne ne vaut plus `'done'` en texte, donc les prédicats basculent sans une seule erreur.

**L'ampleur est mesurée, pas estimée** (base vive, 31/08) : le prédicat se réduit à `resolved_at IS NULL`, et **1 721 lignes `done` importées portent `resolved_at NULL`**. Le compteur passerait donc de **170 à 1 891 — onze fois plus**.

| Fonction | Expression | Effet |
|---|---|---|
| `api.capture_metric_snapshots` | `WHERE resolved_at IS NULL AND status::text <> 'done'` | Le cron de 03:00 écrit `crm_backlog` **chaque nuit**. Dès le lendemain la série saute de 170 à 1 891 et l'historique de 73 jours est **empoisonné définitivement** — la rupture ressemble à un événement métier réel, personne ne la lira comme un bug. |
| `api.get_dashboard_crm_open` | `AND status::text <> 'done'` | La carte du bandeau afficherait 1 891. |
| `api.save_crm_interaction`, bras UPDATE | `CASE (p_payload->>'status') WHEN 'done' THEN COALESCE(resolved_at, NOW()) WHEN 'planned' THEN NULL ELSE resolved_at END` | **Celui-ci est le pire.** Le `->>` rend du texte : après renommage, ni `'done'` ni `'planned'` ne matchent, on tombe dans le `ELSE` et **`resolved_at` n'est plus jamais posé**. Marquer une demande traitée cesserait silencieusement de la dater — et `resolved_at` est justement ce sur quoi reposent les deux prédicats ci-dessus. |

**Un quatrième effet, non corrigible et à documenter.** Le trigger d'audit sérialise le libellé de l'enum en JSON : `audit.audit_log` contient déjà `"status":"done"` (4 216 fois) et `"planned"` (342 fois), les nouvelles lignes porteront `"resolved"` / `"new"`. La piste d'audit sera **coupée en deux vocabulaires**.

> **Ne pas réécrire `audit.audit_log`.** Un journal d'audit se lit, il ne se corrige pas : remapper son JSON falsifierait l'historique et créerait un doute pire que l'incohérence. La césure se documente dans l'en-tête de la migration, et la traduction vit **dans le lecteur** — c'est-à-dire dans le rejeu des 57 transitions (§6.2), qui doit traduire explicitement.

**Cinq échoueraient bruyamment — mais au premier appel, pas au déploiement.** PL/pgSQL ne valide pas les littéraux de son corps à la création, et `DROP TYPE` ne cascade **pas** sur un `'planned'::crm_status` écrit dans un corps de fonction : la dépendance n'est tracée que pour les signatures et les types de colonne.

| Fonction | Usage |
|---|---|
| `api.save_crm_interaction` | défaut dérivé du sujet (§220), pose de `resolved_at`, `'planned'::crm_status`, `'done'::crm_status` |
| `api.list_crm_timeline` | `p_status='active' → v_status := 'planned'` |
| `api.list_crm_directory_linked` | idem |
| `api.create_crm_artifacts_from_incident` | insère `'done'` |
| `api.log_publication_proof_interaction` | insère `'done'` |

> **Conséquence structurante.** Recréer le type ne rend **pas** l'oubli visible au déploiement. Un DDL vert ne vaut pas validation : toute la casse est reportée au premier appel — le premier signalement d'incident, le premier BAT envoyé, le premier filtre « Actives ».

**La garde qui protège vraiment — et ses trois angles morts.** Une garde balayant `pg_proc.prosrc` à la recherche de `'planned'`/`'done'` est nécessaire mais naît fragile :

1. **`'done'` appartient aussi à `crm_task_status`.** Aucune fonction de tâche ne porte ce littéral aujourd'hui, donc une garde naïve est propre — mais la première qui le fera la fera rougir sans raison, quelqu'un ajoutera une exclusion, et cette exclusion masquera le jour suivant un vrai oubli. **La garde doit être ancrée sur les fonctions qui touchent `crm_interaction`**, jamais sur la chaîne seule.
2. **`prosrc` ne contient pas les `COMMENT ON FUNCTION`** — ils vivent dans `pg_description`. Or deux commentaires recopient le prédicat mot pour mot, et ce sont eux qui documentent l'invariant carte ↔ courbe. La garde balaie donc aussi `obj_description`.
3. **`prosrc` ne voit ni le frontend ni les fixtures.** Une garde CI côté dépôt complète les deux volets SQL.

Les trois volets sont **prouvés non vacants par sabotage** : on réintroduit `'done'` en transaction annulée, chaque volet doit rougir.

### 6.5 Ce que devient `save_crm_interaction`

Le défaut dérivé du sujet établi par §220 est **conservé, traduit** : sujet de demande renseigné ⇒ `new` (c'était `planned`) ; sans sujet ⇒ `resolved` (c'était `done`, une note interne naît traitée).

La pose de `resolved_at` suit désormais **trois** statuts terminaux au lieu d'un : `resolved`, `closed`, `canceled` posent `COALESCE(resolved_at, NOW())` ; les trois autres le laissent à `NULL`.

Les deux triggers qui écrivent `'done'` deviennent `'resolved'` — leur raison d'être est inchangée (le BAT *est* parti ; la note d'incident *est* écrite).

### 6.6 L'édition du statut dans le CRM

Un sélecteur à six états sur la fiche d'une demande. Il **remplace** la bascule à deux états actuelle (« À traiter / Déjà traitée » de §220), qui devient un cas particulier du nouveau.

Quand `awaiting_provider` est actif, un encart indique **depuis quand** et rappelle que ce temps est déduit du traitement — et qu'il continue de courir tant que le statut ne change pas. C'est cette phrase qui fait qu'un agent pense à repasser le statut ; sans elle, la métrique se dégrade en silence.

Les trois vues qui font aujourd'hui `status: done ? 'done' : 'planned'` (`CrmActorFiche`, `CrmObjectView`, `CrmTimelineView`) passent par le nouveau contrôle.

**Les libellés FR des six statuts vivent en un seul endroit.** S'ils sont aujourd'hui éparpillés, cette passe les regroupe — sinon l'ajout de trois statuts se paie à dix endroits.

---

## 7. Tests

**SQL, sous `Base de donnée DLL et API/tests/`, transactionnels (`BEGIN`/`ROLLBACK`) :**
- **Les trois volets de garde** (`prosrc`, `obj_description`, grep CI) : chacun prouvé **non vacant** par sabotage — on réintroduit `'done'` en transaction annulée et chaque volet doit rougir séparément. Un volet qu'on ne sait pas faire rougir ne garde rien.
- **Le prédicat de comptage, après bascule** : `open_interactions` doit valoir 170 et non 1 891. C'est le test qui attrape l'oubli des trois `::text`, et il doit être écrit **avant** la migration pour être vu rouge.
- Le remappage : aucune ligne perdue, `planned` toutes devenues `new`, `done` toutes devenues `resolved`, les comptes conservés.
- Le trigger : une transition écrit exactement une ligne de journal, avec le bon `from_status`, `to_status` et `changed_by`.
- Le backfill : les 57 transitions d'audit sont rejouées, et **pas davantage**.
- Le temps net : sur un cycle simulé `new → in_progress → awaiting_provider → in_progress → resolved`, le net vaut l'écoulé moins la durée d'attente exactement.
- L'invariant de cohérence : `open_interactions` de `get_dashboard_crm_open` reste égal au `crm_backlog` écrit par `capture_metric_snapshots`, **après** la bascule de vocabulaire. Cette garde existe déjà (§226) et doit rester verte.

**Jest :** les widgets (trois états), le sélecteur de statut, le calcul de profondeur d'historique, le mapping jours-éditeur. Les fixtures et les données de démo doivent être **migrées au nouveau vocabulaire** — une fixture restée sur `'planned'` ferait passer un test tout en décrivant un état qui n'existe plus.

**Live :** après application, comparer le backlog avant/après (il doit rester à 170, le remappage étant une traduction) et vérifier qu'aucune des 7 fonctions ne rougit à l'appel.

---

## 8. Phasage

**Le déploiement n'est pas atomique** : le SQL s'applique à la main, le frontend arrive par un build Coolify depuis `master`. Un découpage naïf « SQL d'abord, front ensuite » laisserait donc la production cassée dans l'intervalle — les cinq sites d'écriture du front enverraient encore `'done'`, que `save_crm_interaction` rejetterait en `22P02`. « Marquer traitée » serait mort le temps du build.

D'où **cinq tranches**, dont deux préparatoires qui ne changent aucune valeur.

| # | Contenu | SQL | Pourquoi à cette place |
|---|---|---|---|
| **A0** | Front **bilingue** : type `CrmInteractionStatus`, registre de libellés FR avec repli sur le code brut, prédicat `isOpenInteractionStatus` partagé. La chip et les teintes rendent les six codes **et tolèrent les deux anciens**. | aucun | Supprime la fenêtre de panne muette. Déployable seule, sans coordination : l'app tourne inchangée sur la base actuelle mais ne casse plus si elle voit `new`. |
| **A1** | Contrat capable de porter six états : `onResolve(rootId, done)` devient `onChangeStatus(rootId, status)`. **Les valeurs passées ne changent pas.** | aucun | Changement de forme qui fait rougir la compilation. Mélangé à A0, la revue devient illisible. Chaque vue **garde son invalidation propre** — ne pas les mutualiser. |
| **A2** | La migration, **indivisible** : type recréé, colonne basculée, journal + trigger, rejeu des 57 transitions, les 8 fonctions redéployées, les deux `COMMENT`, les trois volets de garde, les fichiers de test SQL. | migration + trigger | Indivisible parce qu'un `schema_unified.sql` passé aux six valeurs sans les deux triggers d'écriture donnerait un fresh apply **vert** dont le premier incident lèverait `22P02`. |
| **B** | Le vocabulaire côté front, le sélecteur à six états, l'encart d'attente, les fixtures et les tests. | aucun | Après A2. |
| **C** | L'onglet Activité : 4 widgets, carte du bandeau, temps net. | 2 RPC | Après A2 pour le vocabulaire ; le temps net est inutilisable avant que le journal ait tourné. |

**Deux contraintes d'ordre à l'intérieur d'A2.** Le type, puis la colonne, puis le trigger, puis les fonctions, puis le rejeu, puis les gardes. Et au manifeste, la migration se place **après** tous les fichiers qui redéfinissent un corps lisant le statut (`schema_unified`, `api_views_functions`, 8z, 8z2, 16z, 17b, 17e, 17f) — placée avant l'un d'eux, son corps corrigé serait écrasé par la version ancienne rejouée ensuite.

**Décision de déploiement à prendre en écrivant le plan.** Soit A2 embarque une **tolérance transitoire** dans `save_crm_interaction` (accepter `'done'`/`'planned'` en entrée et les traduire), soit A2 et B partent dans la même fenêtre. Recommandation : la tolérance, parce qu'un build Coolify n'est pas instantané et qu'un retour arrière du front serait sinon impossible. **Si on la retient, son identifiant de suppression figure dans l'écho du manifeste dès le premier jour** — sinon la tolérance devient elle-même une panne muette permanente.

---

## 9. Pièges de confusion — règle d'édition

**Trois vocabulaires de statut coexistent** et partagent des libellés :

| Enum | Valeurs | Porte sur |
|---|---|---|
| `crm_status` | `new, in_progress, awaiting_provider, resolved, closed, canceled` | les **demandes** |
| `crm_task_status` | `todo, in_progress, done, canceled, blocked` | les **tâches** |
| adhésions (colonne TEXT) | `prospect, invoiced, paid, canceled, lapsed` | les **adhésions** |

Ils partagent `canceled`, et — **à partir de ce chantier** — `in_progress` aussi. Un grep sur une chaîne de statut devient ambigu dans les deux sens.

> **Règle non négociable : aucun remplacement global sur une chaîne de statut n'est admissible dans ce lot.** La seule ancre fiable est le **contexte** — `crm_interaction`, `crm_status`, `saveCrmInteraction`, `relatedInteractionStatus` — jamais la valeur seule.

Les endroits où les deux vocabulaires se touchent à quelques lignes près méritent une relecture ligne à ligne : `api.get_dashboard_crm_open` (l'interaction et la tâche sont à **5 lignes** d'écart), `create_crm_artifacts_from_incident` (qui écrit `'done'` pour une interaction et `'todo'` pour une tâche dans la même fonction), `CrmTaches.tsx` (le `CLOSED_INTERACTION_STATUSES` des demandes jouxte les colonnes du kanban des tâches), et une fixture de test où les deux vocabulaires cohabitent **sur la même ligne**.

Piège symétrique : `dueBadgeClassOf(dueAt, status: string, …)` prend un `string` non typé et compare à `'done'` — l'occurrence sort à tout grep, mais son unique appelant passe un statut de **tâche**. Ne pas y toucher.

---

## 10. À trancher en écrivant le plan

Ces points ne sont pas des détails d'implémentation : ce sont des arbitrages que le plan doit poser explicitement plutôt que de les laisser se décider par accident.

1. **Qui écrit `closed` ?** Aucune surface décrite ne le produit, et le bouton « Oui, clôturer » du kanban écrit aujourd'hui la seule valeur terminale existante. Sans décision, il écrira `resolved` par continuité et `closed` restera inatteignable.
2. **`resolved_at` ou le journal, lequel fait foi ?** Les deux deviennent capables de dater une résolution. Recommandation : `resolved_at` reste la colonne de fait, le journal est l'historique — mais il faut l'écrire, sinon elles divergeront au premier chemin d'écriture qui oublie l'autre.
3. **Le temps net après réouverture.** La formule suppose un cycle unique ; une demande rouverte a plusieurs résolutions. Et une demande `canceled` — qui posera désormais `resolved_at` — entre-t-elle dans la moyenne ?
4. **Les 1 721 lignes `resolved` sans `resolved_at`.** Après remappage elles sont « traitées sans date ». Le chantier 17b avait explicitement refusé de leur inventer une date (invariant §218) ; confirmer que la décision tient, et dire si elles sont exclues des statistiques ou marquées.
5. **RGPD — à vérifier avant d'écrire la table, pas après.** `crm_interaction_status_event.changed_by` est une donnée personnelle. La migration d'effacement anonymise déjà `crm_interaction` ; le journal doit y être **câblé**, sinon ce chantier crée une rétention nouvelle.
6. **`ALTER COLUMN … TYPE` ne déclenche pas les triggers de ligne.** La recette en dépend. Le confirmer sur la version PostgreSQL du projet, et **interdire explicitement** toute variante « backfill par `UPDATE` », qui elle en déclencherait 3 144.
7. **La fenêtre d'application.** Le cron écrit `crm_backlog` à 03:00 ; appliquer pendant cette écriture produirait une journée hybride dans `metric_snapshot`.
8. **L'identifiant de manifeste.** Vérifier qu'il est libre — le manifeste porte déjà une collision `17c` non résolue.
9. **Les six teintes.** La feuille de style ne porte aujourd'hui que deux couleurs de statut. Six teintes distinctes, ou trois familles (ouvert / en attente d'un tiers / fermé) ? Arbitrage design non pris.
10. **Consommateurs hors dépôt.** `list_object_crm` et `list_actor_crm` émettent le statut **brut** en pass-through. L'export Excel, l'API partenaire et le contrat Tourinsoft n'ont pas été vérifiés — le faire avant de considérer le rayon fermé.
11. **Tous les nombres de cette spec datent du 31/08.** Les re-mesurer le jour J : 3 144 interactions, 170 ouvertes, 1 721 `done` sans date, 4 595 lignes d'audit, 57 transitions. **Aucun ne doit être recopié en dur dans le SQL.**

---

## 11. Écarté / différé

- **Le temps de première réponse** : inconstruisible, `first_response_at` est vide sur les 3 144 lignes. Il le restera tant que rien ne l'écrit — hors périmètre.
- **Le backfill du temps net sur les demandes importées** : impossible et non souhaitable. Aucune n'a d'historique de transitions ; en inventer un violerait l'invariant §218 (« une colonne de provenance ne se remplit QUE si la ligne le prouve »).
- **Le tri de l'arriéré** (les 143 demandes de plus d'un an) : décision métier, pas technique. L'écran les rend visibles par sujet et par âge ; les clôturer en masse au remappage a été explicitement écarté.
- **Le `display_name` manquant** de deux éditeurs : donnée à compléter côté profils, pas un correctif de cet écran.
- **La collision d'identifiant `17c`** dans le manifeste (deux migrations la portent) : signalée, à corriger dans une passe dédiée.
