# Prompt de reprise — implémentation du portail acteur

> Copier-coller le bloc ci-dessous au démarrage de la prochaine session. Il est
> auto-porteur : il dit où travailler, quoi lire, dans quel ordre, ce qui est non
> négociable, et ce qu'il faut demander au PO avant de coder.

---

Tu implémentes le **portail acteur** de Bertel : un espace dédié où un prestataire
(propriétaire de gîte, restaurateur, guide) met à jour la fiche de son établissement, et
où chaque envoi crée une tâche de vérification pour l'office de tourisme. Rien de ce qu'il
saisit n'atteint la fiche publiée avant validation.

**Où.** Worktree `C:\Users\dphil\Bertel3.0\.claude\worktrees\actor-sheet-interface-spec-26b57f`,
branche `claude/actor-sheet-interface-spec-26b57f`. Tout se passe là ; ne jamais `cd` vers
le dépôt principal. Le worktree n'a pas de `node_modules` : la Task 0 pose la jonction.

**À lire AVANT toute action, dans cet ordre :**
1. `docs/superpowers/specs/2026-09-01-portail-acteur-design.md` — la spec (décisions D1→D12,
   architecture, §4.5 l'interface, §6 les invariants de sécurité, §7 les cas limites).
2. `docs/superpowers/plans/2026-09-01-portail-acteur.md` — le plan, 20 tasks TDD. Lire
   l'en-tête et **Global Constraints** en entier, puis chaque task au moment de la faire.
3. `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` § **228** et son addendum —
   pourquoi l'interface n'est pas l'éditeur, et les sept défauts déjà corrigés dans le plan.
4. La maquette validée : https://claude.ai/code/artifact/c0475d08-c84f-4578-9513-a0de6c8d8234
   (7 écrans, dont l'ordinateur).

**Méthode.** Utilise `superpowers:subagent-driven-development` (ou
`superpowers:executing-plans`) et suis le plan task par task, dans l'ordre : Task 0, puis
1→9 (SQL), puis 10→19 (front), puis 20. Chaque task est TDD : le test d'abord, **vérifié
ROUGE**, puis l'implémentation, puis vert, puis un commit. Commits conventionnels en
français, un par incrément vérifié.

**Ce qui n'est pas négociable (le reste du plan le détaille) :**

- **L'interface est celle de D10** : liste de rubriques par fiche, une rubrique = un petit
  formulaire (≤ 6 contrôles natifs), un seul geste « Envoyer à l'office », états en mots +
  icône, zéro jargon (liste noire en spec §4.5 : jamais « canonique », « modération »,
  « soumission », « module », « section », « brouillon local », « contributeur »…).
  **Ne remonte jamais `ObjectEditPage` ni une primitive de `features/object-editor`** :
  leur CSS est scopée `.object-editor` et taillée back-office. Le portail réutilise la
  *couche d'état* (`useObjectEditorState`, `buildContributorSubmission`) et rien d'autre.
- **Deux tailles d'écran, un seul arbre React** : `data-view="hub" | "rubric"` + CSS ;
  ≥ 1024 px la liste des rubriques reste à gauche pendant la saisie. Pas de `useMediaQuery`,
  pas de rendu conditionnel par taille.
- **Toute écriture rend la tranche COMPLÈTE du module** (spread depuis le draft courant) :
  chaque writer côté office est « remplace tout ». Chaque updater a un test de sabotage —
  retire le spread, le test DOIT rougir, et tu le rapportes dans le message de commit.
- **Une enveloppe par module modifié**, exactement `buildContributorSubmission`, un seul
  appel `submit_actor_fiche`. Seules `metadata.field/before/after` sont surchargées (D12) ;
  `section`, `rpc`, `manual_apply`, `payload` restent byte-identiques — un test l'épingle.
- **Aucun `client.from(...)`** sur `pending_change`, `fiche_submission`, `crm_*`,
  `app_notification`, `org_actor_module_visibility` : RLS service_role uniquement.
- **SQL** : chaque bloc se valide contre la base LIVE via `mcp__supabase__execute_sql` en
  transaction annulée (remplacer le `COMMIT;` final par `ROLLBACK;`). **Le déploiement réel
  n'a lieu qu'à la Task 9.** Avant de re-déployer une fonction existante, compare son
  `prosrc` vif au fichier source cité : si ça diverge, **arrête-toi et signale** — la base
  fait foi, pas le plan.

**Les pièges déjà identifiés** sont écrits dans les tasks concernées, avec leur preuve
(fichier:ligne). Les plus coûteux : la sentinelle `[{start:'',end:''}]` des horaires
(« ouvert sans horaires fixes » — un filtre naïf ferme le jour en un clic), les jours
absents de `period.weekdays`, `updateTranslatableField(field,'fr','fr',v)`, le tri-état
animaux (`null` ≠ `false`), `mergeEstablishmentAmenitySelection` (codes PMR),
`buildContributorSubmission` sans garde `unavailableReason`, `Modal` qui portalise vers
`document.body` (les règles `.portal-shell` ne l'atteignent pas), le refus « déjà en cours »
en `PT409` (`23505` s'affiche « doublon »), et l'empreinte du brouillon calculée sur les
modules **serveur** sans catalogues. Ne les redécouvre pas : lis la task avant d'écrire.

**Avant de coder le front, pose au PO les arbitrages ouverts en UNE fois** (`AskUserQuestion`),
ils sont encapsulés dans des constantes donc rien ne bloque :
- D11 photos (lecture seule + repli e-mail en v1 ?) et D12 diff lisible pour l'office ;
- `PORTAL_AMENITY_CODES` : ≤ 12 équipements par type — et pour VIS, `visite_libre` /
  `visite_guidee` / `audioguide` **n'existent pas** dans `ref_amenity` (à seeder ou à
  remplacer) ;
- `PORTAL_PRICE_UNIT` pour RES : « par personne » ou « par couvert » ;
- horaires des hébergements : question « ouvert toute l'année / fermetures » ou rien ;
- délai d'engagement de l'office (proposition : 5 jours ouvrés) ;
- le mot « prestataire » dans « Espace prestataire ».

**Mise en service.** La Task 20 Step 0 liste six prérequis à vérifier avant toute
invitation d'un vrai prestataire (18a avec `p_applied_manually`, Task 10 fusionnée, 17i-17l
en prod avec preuve de parité de lecture acteur/superuser, leg `canonical_description` sur
le chemin réel, canaux publics de l'ORG saisis, écriture canonique des vérificateurs).
Aucun compte acteur n'est créé avant qu'ils soient verts.

**Vérification.** Depuis `bertel-tourism-ui/` : `npm run test:run -- <chemin>` (jamais
`npm test`, qui est en watch) et `npm run typecheck`. Recette manuelle sur données réelles
à la fin : téléphone (375 px) **et** ordinateur (1440 px), plus la bascule à 1023 px.

Commence par la Task 0, et dis-moi ce que tu trouves si la base ou le code diverge du plan.
