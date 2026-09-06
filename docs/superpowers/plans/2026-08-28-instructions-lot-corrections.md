# Instructions de travail — lot de 5 corrections & améliorations (28/08/2026)

> **Pour l'exécutant** : les chantiers peuvent être développés en parallèle par des personnes
> différentes, mais ils ne sont PAS indépendants côté déploiement — plusieurs touchent les mêmes
> fichiers canoniques (`schema_unified.sql`, `migration_crm_module.sql`, `ci_fresh_apply.sql`,
> runbook, journal de décisions). Lire le bloc « Coordination & intégration SQL » avant de
> commencer. Les constats ci-dessous viennent d'une investigation sur le code (branche `master`
> au 28/08/2026) **et** sur la base de PRODUCTION (sondes SQL en lecture seule). Les repères
> `fichier:ligne` sont exacts à cette date — re-vérifier l'ancrage avant d'éditer (le code bouge).

| # | Chantier | Effort | Risque | Arbitrage PO requis avant de coder ? |
|---|----------|--------|--------|--------------------------------------|
| 1 | Profil « Éditeur » : droits réels, canal d'acteur privé, écran /team | L (découpé en 5 sous-lots) | Moyen (autorisations) | Oui (3 questions) |
| 2 | Type de document « Courrier de fermeture » | S (½ j) | Faible | Oui (2 questions mineures) |
| 3 | Doublon de contacts sur la fiche de détail | M — en 2 incréments (3a visible, 3b export) | Faible (3a) / Moyen (3b) | Oui (1 question export, bloque 3b seulement) |
| 4 | Erreurs en français + validation par champ | L (3 lots ordonnés) | **Moyen (lot A)** / Faible (B-C) | Non (lot A/B) ; C = choix UX |
| 5 | Statut des demandes CRM à la création | S–M (1 j) | Moyen (RPC live) | Oui (1 question notes internes) |

**Ordre conseillé** :
0. arbitrages PO + désignation de l'**intégrateur SQL** (voir Coordination) ;
1. chantier 2 ;
2. chantier 3a (correction visible minimale) ;
3. chantier 4-lot-A sur un périmètre pilote, puis généralisation ;
4. chantier 5 (une fois la règle serveur de statut validée — voir son étape 2) ;
5. chantier 1 découpé en livraisons séparées (1a de préférence après 1e — sauf urgence CRM,
   voir 1a ; 1b/1c/1d/1e chacun sa livraison) ;
6. chantiers 4-B/C et 3b.

---

## Règles communes (à lire avant de coder — non négociables)

- **Arborescence** : frontend Next.js dans `bertel-tourism-ui/` (UI 100 % française) ; sources SQL
  dans `Base de donnée DLL et API/` ; journal de décisions canonique
  `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (grepper par `§numéro`).
- **Vérification frontend** : `npx jest <fichiers ciblés>` puis la suite complète, puis
  `npx tsc --noEmit` (0 erreur). Sur un worktree neuf : junction `node_modules` d'abord.
- **Tout changement SQL déployé en PROD** = migration idempotente **+** repli dans le fichier source
  (`schema_unified.sql`, `migration_crm_module.sql`, `api_views_functions.sql`… selon l'objet) **+**
  entrée dans `ci_fresh_apply.sql` **+** runbook `docs/SQL_ROLLOUT_RUNBOOK.md`. Jamais de DDL
  vivant uniquement en PROD (c'est traité comme un incident).
- **Catalogues de référence** : renommer = `UPDATE` du code (l'`id` préserve les lignes rattachées),
  jamais `DELETE`+`INSERT` ; toute suppression est fail-closed (§209).
- **Avant de ré-appliquer un corps de fonction depuis un fichier de base** : DIFFER contre le
  `prosrc` vif (§213) — le fichier peut porter plus que votre patch et ré-appliquer peut révoquer
  une passe déployée entre-temps :
  ```sql
  SELECT pg_get_functiondef(oid) FROM pg_proc
  WHERE proname = 'save_crm_interaction' AND pronamespace = 'api'::regnamespace;
  ```
- **Après tout déploiement d'une garde ou d'une colonne nouvelle** : balayer `pg_proc.prosrc` pour
  trouver TOUS les consommateurs (§213) — une garde que personne n'appelle ne garde rien :
  ```sql
  SELECT proname FROM pg_proc WHERE prosrc LIKE '%actor_channel%' AND pronamespace = 'api'::regnamespace;
  ```
- **Toute garde d'écriture s'éprouve avec le persona le MOINS privilégié** qui doit passer, jamais
  avec un superuser — « ça marche chez moi (admin) » est la signature du bug, pas son infirmation
  (§214). Harnais persona :
  ```sql
  BEGIN;
  SELECT set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub','<uuid du user>','email','<email>')::text, true);
  SET LOCAL ROLE authenticated;
  -- ... sondes SELECT / appels RPC ...
  ROLLBACK;
  ```
- **Jamais de delete-all + re-insert** sur une table lue par un prédicat d'autorisation : réconcile
  non destructif (§214).
- **Commits** : conventionnels (`feat:`/`fix:`/…), petits, un par incrément vérifié.

### Coordination & intégration SQL (obligatoire dès que 2 chantiers tournent en parallèle)

Les chantiers 1, 2 et 5 écrivent tous dans `schema_unified.sql`, `ci_fresh_apply.sql` et le
runbook ; 1 et 5 touchent tous deux `migration_crm_module.sql`. Règles :

1. **Une personne est désignée intégrateur SQL** du lot. Elle seule replie dans les fichiers
   canoniques et attribue les numéros de § du journal de décisions.
2. **Une migration distincte par chantier**, jamais de migration partagée entre deux chantiers.
3. **Aucun repli dans les fichiers canoniques avant relecture croisée** par l'intégrateur : chaque
   développeur livre sa migration + ses tests ; le repli (`schema_unified.sql`,
   `migration_crm_module.sql`, manifeste, runbook) se fait au moment de la fusion, dans l'ordre
   ci-dessous, un chantier à la fois.
4. **Ordre de fusion explicite** (même si le développement est parallèle) : 2 → 3a → 4A → 5 → 1b →
   1c/1d → 1e → 3b → 4B/C. Après chaque fusion SQL : rejouer le gate fresh-apply du chantier
   concerné + le diff `prosrc` des fonctions touchées.

---

## Chantier 1 — Profil « Éditeur » : droits réels, canal d'acteur privé, écran /team

### Ce que l'investigation a établi

1. **Le rôle métier « Éditeur » ne confère AUCUN droit en base.** Il n'existe aucune table
   `role_permission` (vérifié sur live). Les seuls porteurs de droit sont : `user_permission`
   (grants individuels), `org_permission` (héritage ORG — **les 12 lignes de l'ORG OTI Sud sont
   toutes `is_active=false`**, donc inactif en prod), le rôle admin
   (`api.current_user_admin_rank()`) et le statut superuser. Le « préréglage Éditeur »
   (`bertel-tourism-ui/src/features/team/permission-presets.ts:20-45`) n'est appliqué que sur 3
   gestes : invitation (`InviteMemberDialog.tsx:53`), création d'ORG (`CreateOrgDialog.tsx:45`),
   bouton « Appliquer le préréglage » (`MemberPermissionsDrawer.tsx:69`). **Changer le rôle d'un
   membre existant (`TeamAdminPage.tsx:107-115` → `rpc_set_business_role`) n'applique RIEN** :
   le membre obtient l'étiquette « Éditeur » et zéro permission.
2. **Passer un canal de contact d'acteur en privé est impossible pour TOUT LE MONDE**, superuser
   compris : la table `actor_channel` n'a **ni colonne `is_public` ni `visibility`**
   (`schema_unified.sql:2102-2115`, identique en live), le RPC `api.save_actor_channel`
   (`migration_crm_module.sql:1409-1477`) n'accepte que `{id, actor_id, kind_code, value,
   is_primary}`, et l'UI (`CrmActorModals.tsx:542-606`) n'a pas de toggle. Ce n'est pas une garde
   trop stricte — c'est une **fonctionnalité absente aux trois étages**. (La garde du RPC,
   `api.user_can_write_crm_actor`, accepte déjà l'Éditeur : `write_crm_notes` OU rang admin.)
3. **Catalogue des permissions** (`ref_permission`, 12 codes actifs) : seuls **8 sont réellement
   gardés** par du SQL. Les 4 autres — `edit_hours`, `edit_pricing`, `edit_gallery`,
   `manage_team_messages` — n'apparaissent dans **aucun** garde SQL ni frontend : cases à cocher
   inertes qui promettent un droit qui n'existe pas.
4. **Écran /team** (`src/views/TeamAdminPage.tsx` + `src/features/team/*`) — 4 défauts :
   - **D1** : `api.rpc_list_org_members` n'agrège que `user_permission` — l'héritage
     `org_permission` est invisible du compteur et des cases (case décochée à côté d'un badge
     « héritée de l'ORG » : un admin qui coche « pour réparer » crée un doublon).
   - **D2** : la catégorie `legal` n'est pas traduite — titre de groupe brut « legal »
     (`MemberPermissionsDrawer.tsx:31-36` : `CATEGORY_LABELS` n'a que content/crm/team/media).
   - **D3** : les 4 permissions fantômes (point 3).
   - **D4** : l'écran ne montre pas les accès qui comptent le plus — rôle admin
     (`team_lead`/`org_manager`/`org_admin` ouvre TOUTE écriture CRM), statut superuser, héritage
     ORG. **5 des 7 Éditeurs de prod tiennent leurs droits CRM de leur rôle `team_lead`**, pas de
     leurs permissions — l'écran ne le dit nulle part.
5. **Bonus découvert** : la sonde client `userCanWriteCrmNotes()` (`src/services/crm.ts:1250-1268`)
   ne teste QUE `user_has_permission('write_crm_notes')` et ignore la branche « rang admin » que le
   serveur accepte. Un membre admin sans la permission voit tout le module CRM en « Lecture
   seule » alors que le serveur l'autoriserait. C'est le cas de 2 comptes de prod.

### Arbitrages PO à trancher AVANT de coder

| Question | Recommandation |
|---|---|
| **Q1** — Veut-on vraiment une visibilité PAR CANAL d'acteur ? Les coordonnées d'acteur sont déjà gardées globalement par `api.can_read_actor_contacts` (§208) et la RLS ne les rend qu'aux membres autorisés. | Oui si le besoin est « certains canaux visibles partenaires, d'autres purement internes ». Défaut à la création : **privé** (`is_public=false`) — c'est de la donnée personnelle, à l'inverse de `contact_channel` (donnée d'établissement, défaut public). |
| **Q2** — Comment le rôle « Éditeur » doit-il porter ses droits ? | ⚠️ Le schéma documente une décision d'architecture EXISTANTE : le rôle métier « ne confère aucun droit implicite — les droits passent par org/user_permission » (`schema_unified.sql:6079-6082`, plan d'accès v1.5). Une table `role_permission` n'est donc pas une correction mais un **changement du modèle d'autorisation**. **Court terme (aligné sur l'architecture actuelle)** : le préréglage est une **photographie ADDITIVE** — il ajoute des grants au moment où on l'applique, il n'en révoque JAMAIS automatiquement (sans provenance des grants, une révocation auto pourrait retirer un droit accordé individuellement). Conséquence : on garde le **bandeau de confirmation** (D5), pas d'application silencieuse ; à la RÉTROGRADATION (Éditeur → Lecteur), aucun retrait automatique — un bandeau liste les permissions qui excèdent le nouveau rôle, révocation manuelle via le tiroir. **Si le PO veut des rôles porteurs de droits** (avec vraie provenance des grants et révocation à la rétrogradation) : petit ADR préalable précisant au minimum — précédence rôle / droits ORG / droits individuels ; comportement au changement de rôle dans les deux sens ; exceptions individuelles ; révocation des anciens droits ; auditabilité ; contraintes et nom exact de la table. Hors de ce chantier ; pas de code avant l'ADR. |
| **Q3** — Les 4 permissions fantômes : retirer ou implémenter leurs gardes ? | **Retirer** (personne ne les lit depuis SP-4). Les gardes fines par domaine (horaires, tarifs, galerie) sont un chantier à part entière si le besoin se confirme. |

### Sous-lot 1a — réparer les Éditeurs en place (sans code)

Les Éditeurs existants qui n'ont pas reçu `write_crm_notes` (le commit `4a93abf` a modifié le
préréglage, **pas** les grants déjà posés).

**Ordre** : si rien ne presse, exécuter 1a **APRÈS 1e** — sinon on pose les 12 permissions du
préréglage actuel pour en désactiver 4 juste après. Si l'accès CRM doit être réparé
immédiatement : n'accorder QUE `write_crm_notes` (case individuelle dans le tiroir, pas le
préréglage complet) et tracer l'opération (qui, quand, pourquoi) dans le journal de décisions.

1. En tant que superuser : `/settings?section=team` → pour chaque membre au rôle Éditeur, ouvrir
   le tiroir Permissions → bouton **« Appliquer le préréglage »** (ou la seule case
   `write_crm_notes` dans le cas urgent ci-dessus).
2. Vérifier ensuite en SQL (lecture) que chaque Éditeur porte bien les codes attendus dans
   `user_permission` (`is_active=true`) — 12 si 1a passe avant 1e, 8 après.

> Ne PAS « réparer » `compte-test@example.invalid` en lui donnant des droits sur les objets OTI Sud : ce
> compte appartient à une AUTRE ORG (`ORGRUN00000001C4`) — ses `false` aux sondes sont le
> comportement correct du périmètre publisher, pas un bug.

### Sous-lot 1b — visibilité d'un canal d'acteur (fonctionnalité, après Q1)

**Fichiers** :
- Créer : `Base de donnée DLL et API/migration_actor_channel_visibility.sql`
- Modifier : `Base de donnée DLL et API/schema_unified.sql` (~l.2102, DDL `actor_channel`),
  `migration_crm_module.sql:1409-1477` (corps de `save_actor_channel`), `ci_fresh_apply.sql`,
  `docs/SQL_ROLLOUT_RUNBOOK.md`
- Modifier : `bertel-tourism-ui/src/services/crm.ts` (~l.350-357 `ActorCrmChannel`, ~l.820-849
  `SaveActorChannelInput`/`saveActorChannel`), `bertel-tourism-ui/src/features/crm/CrmActorModals.tsx`
  (l.153-162 `ChannelRow`, repeater l.542-606)
- Test : `Base de donnée DLL et API/tests/test_actor_channel_visibility.sql` + spec Jest du modal

**Étapes** :

1. **Stratégie de données AVANT la migration** — `ADD COLUMN … DEFAULT false` rend privés TOUS
   les canaux existants. C'est le comportement voulu SEULEMENT si la sémantique du flag est :
   **`is_public` ne gate que les surfaces de DIFFUSION** (public/partenaires) ; les surfaces CRM
   et d'édition continuent d'émettre tous les canaux aux membres autorisés (le flag y est affiché,
   jamais filtré). Sous cette sémantique, rien ne change à l'écran pour les agents le jour du
   déploiement — seule la diffusion future exige une qualification canal par canal. À écrire
   noir sur blanc dans la migration, ET : mesurer les lignes concernées
   (`SELECT count(*) FROM actor_channel;` + répartition par kind), le présenter au PO, et décider
   d'un éventuel backfill contrôlé (ex. passer `true` les canaux déjà exposés par une surface de
   diffusion existante). Sans cette décision explicite, ne pas déployer.
2. Migration (idempotente) :
   ```sql
   BEGIN;
   ALTER TABLE public.actor_channel
     ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;
   COMMENT ON COLUMN public.actor_channel.is_public IS
     'Visibilité du canal (chantier 2026-08-28) : ne gate QUE les surfaces de diffusion (false = interne, défaut, PII ; true = diffusable). Les surfaces CRM/édition émettent toujours le canal aux membres autorisés. Ne remplace PAS api.can_read_actor_contacts (§208) : les deux composent.';
   COMMIT;
   ```
3. Patch du RPC `api.save_actor_channel` — les DEUX branches, en préservant la garde existante
   `api.user_can_write_crm_actor` telle quelle (elle accepte déjà l'Éditeur) :
   - branche UPDATE : ajouter
     `is_public = CASE WHEN p_payload ? 'is_public' THEN (p_payload->>'is_public')::boolean ELSE is_public END`
   - branche INSERT (l.~1467) : colonne `is_public` explicite,
     `COALESCE((p_payload->>'is_public')::boolean, false)`
   Déploiement : **diff du `prosrc` vif d'abord** (règle commune §213), puis `CREATE OR REPLACE`
   dans la migration ; repli dans `migration_crm_module.sql` par l'intégrateur.
4. **Balayage des surfaces de LECTURE** (obligatoire — sinon la colonne est morte, classe §16q) :
   `SELECT proname FROM pg_proc WHERE prosrc LIKE '%actor_channel%'` sur le LIVE — **le balayage
   fait foi, pas une liste écrite d'avance** (contre-exemple vérifié : `api.list_item_contacts`
   avait été citée comme consommatrice, or elle ne lit QUE `contact_channel`,
   `migration_object_list.sql:211`). Candidates à vérifier au balayage : `api.list_actor_crm`
   (clé `channels` — émettre `is_public`), `api.get_object_resource` (leg acteurs §213),
   `api.get_objects_with_deep_data`, `api.get_actor_data`,
   `api.list_object_contact_suggestions`. Pour chacune : émettre le flag (surfaces d'édition) ou
   filtrer dessus (surfaces de diffusion) — consigner le choix PAR surface dans la migration,
   cohérent avec la sémantique de l'étape 1.
5. Frontend : `ActorCrmChannel` + `ChannelRow` gagnent `isPublic: boolean` ; le repeater gagne le
   toggle en réutilisant le VOCABULAIRE de `ContactChannelEditModal` (« Visible publiquement » /
   « Interne ») — ne pas créer un 3ᵉ dialecte à côté de Public/Interne/Partenaires de
   `actor-links.ts`. `saveActorChannel` ajoute `is_public` au payload.
6. Test SQL persona : un Éditeur (JWT `write_crm_notes`, sans rôle admin) bascule un canal →
   succès ; un anon ne lit jamais un canal `is_public=false` par les voies publiques ; un membre
   CRM autorisé voit TOUJOURS les canaux `is_public=false` (garde mesurée des deux côtés, §213).
7. **Correctif compagnon** (write-trap latent découvert au passage) :
   `bertel-tourism-ui/src/services/object-workspace.ts:6548` — l'`update` de `contact_channel`
   n'a pas de `.select()` : si la RLS filtre la ligne, PostgREST renvoie 204 sans erreur et la
   bascule Public/Interne est perdue en silence au rechargement. Ajouter `.select('id')` et lever
   une erreur si 0 ligne retournée.

### Sous-lot 1c — écran /team honnête

1. **D2 (trivial)** — `MemberPermissionsDrawer.tsx:31-36` :
   ```ts
   const CATEGORY_LABELS: Record<string, string> = {
     content: 'Contenu', crm: 'CRM', team: 'Équipe', media: 'Médias',
     legal: 'Juridique',
   };
   ```
2. **D1** — `api.rpc_list_org_members` (source `migration_sp4_list_org_members.sql`) : ajouter
   DEUX colonnes séparées (ne pas fusionner — la case à cocher pilote `user_permission`,
   l'héritage doit rester lisible mais non modifiable) :
   ```sql
   -- inherited_permission_codes text[] :
   (SELECT array_agg(rp.code ORDER BY rp.code)
      FROM org_permission op JOIN ref_permission rp ON rp.id = op.permission_id
     WHERE op.org_object_id = m.org_object_id AND op.is_active = TRUE),
   -- is_platform_superuser boolean :
   EXISTS (SELECT 1 FROM app_user_profile p
            WHERE p.user_id = m.user_id AND p.role IN ('owner','super_admin'))
   ```
   Côté client : `src/services/rbac.ts` parse les 2 champs ; `MemberPermissionsDrawer.tsx:149`
   affiche un état visuel distinct quand `orgHas && !userHas` (case indéterminée + pastille
   « héritée de l'ORG ») ; `MembersTable.tsx:38,70` compte l'union et ajoute un badge
   « + rôle admin » / « superuser » quand `adminRoleCode`/`isPlatformSuperuser` sont posés —
   **c'est là que vit l'accès réel de 5 Éditeurs sur 7 (D4)**.
3. **D5** — `TeamAdminPage.tsx:107-115` : après `setBusinessRole`, deux bandeaux selon le sens
   (sémantique additive de Q2, jamais de retrait automatique) :
   - **promotion** : « Ce membre n'a pas les permissions du rôle Éditeur — appliquer le
     préréglage ? » avec bouton (application = ajout des grants manquants uniquement) ;
   - **rétrogradation** : « Ce membre conserve N permissions au-delà de son nouveau rôle : …» —
     liste + lien vers le tiroir Permissions pour révocation MANUELLE. Aucun retrait automatique.

### Sous-lot 1d — aligner la sonde CRM client sur le serveur

**Fichiers** : créer `Base de donnée DLL et API/migration_crm_notes_probe.sql` +
`tests/test_crm_notes_probe.sql` ; entrée `ci_fresh_apply.sql` + runbook (repli canonique = la
migration elle-même, référencée au manifeste — ne PAS toucher `api_views_functions.sql`, en
retard d'une passe) ; modifier `src/services/crm.ts:1250-1268`.

`userCanWriteCrmNotes` doit reproduire la garde serveur (`write_crm_notes` **OU** rang admin).
Le plus propre : un petit RPC SQL dédié, source de vérité unique :

```sql
CREATE OR REPLACE FUNCTION api.current_user_can_write_crm_notes()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api AS $$
  SELECT COALESCE(
    api.is_platform_superuser()
    OR api.user_has_permission('write_crm_notes')
    OR api.current_user_admin_rank() IS NOT NULL,
    false);
$$;
REVOKE ALL ON FUNCTION api.current_user_can_write_crm_notes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.current_user_can_write_crm_notes() TO authenticated;
```

Deux gardes §204 obligatoires : `REVOKE … FROM PUBLIC` sur toute fonction DEFINER neuve, et le
`COALESCE(…, false)` — la chaîne de `OR` passe par `auth.*()`, qui rend NULL hors contexte HTTP ;
sans COALESCE la fonction serait à trois valeurs.

**Test persona** (`tests/test_crm_notes_probe.sql`, harnais JWT — jamais `SET ROLE` seul, §204) :
membre avec rôle admin SANS `write_crm_notes` ⇒ `true` ; membre lecteur sans rôle admin ⇒
`false` (pas NULL) ; session sans JWT ⇒ `false` (pas NULL). Côté client : remplacer la logique
par cet appel, fail-closed (erreur ⇒ lecture seule), et vérifier dans l'UI que le compte
admin-sans-permission sort de « Lecture seule ».

### Sous-lot 1e — permissions fantômes (après Q3, si « retirer »)

**Ordre impératif** : retirer les 4 codes de `permission-presets.ts:20-34` **AVANT** (ou dans le
même déploiement que) leur désactivation en base — `rpc_grant_user_permission` rejette un code
inactif (`NOT_FOUND`) et casserait l'invitation tant que le préréglage les contient encore.
Ensuite : `UPDATE ref_permission SET is_active=false WHERE code IN ('edit_hours','edit_pricing','edit_gallery','manage_team_messages');`
(le catalogue UI filtre déjà sur `is_active`). Ne PAS supprimer les lignes (des
`user_permission` pointent dessus).

---

## Chantier 2 — Ajouter le type de document « Courrier de fermeture »

### Ce que l'investigation a établi

Il y a **deux** catalogues de types de document ; il faut viser le bon :

| | **A — `ref_legal_type`** (recommandé) | B — `ref_code` domaine `document_type` |
|---|---|---|
| Rattachement | `object_legal.type_id` (FK `RESTRICT`) | `object_document.role_id` |
| Surface | Éditeur §18 « Juridique » | CRM (promotion doc acteur) + cartes PDF resto |
| Champs | description, catégorie, validité, statut, justificatif uploadé, `is_public` | ni validité ni statut ni gate de visibilité |
| Ajout | **migration SQL** (pas d'admin UI) | éditable depuis l'admin §119 sans migration |

Un courrier de fermeture est une **pièce administrative datée, non diffusable, avec justificatif**
→ modèle A. (Le commit `b65eda7` du CRM concerne le catalogue B, pas celui-ci.) Le catalogue A est
**global** — pas d'applicabilité par type d'objet : le nouveau type sera proposé sur toutes les
fiches. Le frontend n'a **aucun code en dur** hors identités (`legal-edit.ts:26-35`) : un nouveau
code non-identité devient automatiquement un « document » dans §18, **zéro changement TypeScript**.

⚠️ Contexte changé depuis §209 : `object_legal` porte désormais **44 lignes réelles** (contre 5) —
le fail-closed sur suppression n'est plus théorique.

### Arbitrages PO (mineurs)

- **Catégorie** : `business` (se range avec l'existence juridique) ou nouvelle catégorie
  `cycle_vie` (colonne `text` libre, ne casse rien, mais change le tri du sélecteur).
  Recommandation : `business`.
- **Texte de la description** (affichée en hint dans la modale) : valider la formulation proposée
  ci-dessous.
- Signaler : §18 s'intitule « documents juridiques » et §209 l'a cadré sur les pièces d'ENTRÉE en
  base ; un courrier de fermeture est une pièce de sortie. Tenable, mais c'est un choix PO.

### Étapes

**Fichiers** : créer `Base de donnée DLL et API/migration_legal_type_courrier_fermeture.sql` ;
modifier `schema_unified.sql` (bloc seed l.5883-5947), `tests/test_legal_document_catalog.sql`
(l.23-38), `migration_legal_document_catalog.sql:167-178`, `ci_fresh_apply.sql`.

1. **Migration** (patron exact de `migration_legal_document_catalog.sql:98-162`) :
   ```sql
   BEGIN;
   INSERT INTO ref_legal_type (code, name, description, category, is_required, is_public, review_interval_days) VALUES
     ('courrier_fermeture', 'Courrier de fermeture',
      'Courrier attestant la fermeture de l''établissement (cessation d''activité, fermeture administrative ou définitive). À joindre lorsqu''une fiche est retirée de la diffusion : il documente la date d''effet et l''origine de la décision.',
      'business', false, false, NULL)
   ON CONFLICT (code) DO UPDATE SET
     name = EXCLUDED.name, description = EXCLUDED.description, category = EXCLUDED.category,
     is_required = EXCLUDED.is_required, is_public = EXCLUDED.is_public,
     review_interval_days = EXCLUDED.review_interval_days, updated_at = NOW();
   COMMIT;
   ```
   Convention respectée : code `snake_case` **français**, `is_required=false` et `is_public=false`
   (règles §209 assertées par la CI), `review_interval_days=NULL` (pas de renouvellement).
2. **Fold** dans `schema_unified.sql` : ajouter le tuple dans le bloc `INSERT INTO ref_legal_type`
   (l.5883→5946), avant le `ON CONFLICT (code) DO NOTHING;` (l.5947).
   **PAS dans `seeds_data.sql`** (son bloc `document_type` l.489-494 = catalogue B ; la l.896 y
   renvoie explicitement vers `ref_legal_type`).
3. **⚠️ Piège n°1 du chantier** : `migration_legal_document_catalog.sql:167-178` porte un
   `RAISE EXCEPTION` si le compte de documents ≠ **15**. Passer la constante à **16** (sinon le
   rejeu de cette migration dans `ci_fresh_apply.sql` rougit).
4. **Garde CI** : `tests/test_legal_document_catalog.sql`, tableau `v_expected` (l.23-38) —
   ajouter `['courrier_fermeture', 'Courrier de fermeture']`. Les assertions « aucun document
   obligatoire/public » et « 5 identités intactes » passent telles quelles.
5. **Manifeste** : ajouter un `\ir` dans `ci_fresh_apply.sql` après le bloc 16t (l.393-397) — le
   créneau `16u` est déjà pris (§208) : prendre le premier libre en vérifiant dans le fichier.
   Runbook à jour.
6. **Appliquer en PROD** (MCP Supabase `apply_migration` ou psql), puis vérifier :
   `SELECT code, name, category FROM ref_legal_type WHERE code='courrier_fermeture';`
7. **Vérifier dans l'UI** : éditeur §18 → « Ajouter un document » → le type apparaît avec sa
   description en hint (`LegalDocumentEditModal.tsx:112`). Attention au **cache session** des
   catalogues (staleTime 1 h — recharger l'app). Aucun changement TS attendu.

**Pièges** : `is_required` reste `false` (le passer à `true` réveillerait la pastille rouge
« Document obligatoire expiré » sur TOUTES les fiches ET casserait la CI) ; la `description`
n'atteint l'UI que par le select de `reference-catalogs.ts:80-82` (déjà en place — ne pas la
retirer, un test la garde) ; pas de colonne `position` — la place dans le sélecteur découle du tri
`is_required DESC → category → name`.

---

## Chantier 3 — Doublon de contacts sur la fiche de détail

### Ce que l'investigation a établi (⚠. le doublon n'est pas où on le croit)

- Les canaux d'acteur sont **déjà fusionnés dans la section « Contact » elle-même** du tiroir
  (`ObjectDetailView.tsx:2967-3098`), sans marqueur de provenance : la même valeur y apparaît deux
  fois d'affilée, visuellement identique. La section « Équipe interne » (`TeamSection`,
  l.3100-3126) n'affiche en plus qu'UNE ligne par acteur (`actor.contacts[0]`).
- La cause : `src/services/object-detail-parser.ts:1036` — la clé de dédup
  `${item.source}-${item.sourceName}-${item.kindCode}-${item.value}` contient la **provenance** :
  deux entrées de même valeur mais de sources différentes survivent toutes les deux.
- Côté acteur, `parseActors` (`features/object-drawer/utils.ts:1129-1140` via `mapContactLines`
  l.635-644) **aplatit** chaque canal en chaîne `"Label: valeur"` — `kindCode`/`value` ne sont
  plus accessibles dans `ActorItem` : toute dédup posée dans `TeamSection` devrait re-parser des
  chaînes (à proscrire).
- Consommateurs de `contacts.public` : le tiroir (affichage) **et l'export Excel**
  (`services/export/export-columns.ts:169` `firstPublicContact`, `:281` colonne
  `contacts_public`). L'API partenaire, la modale « Copier les e-mails » (§211), l'impression
  carnet et l'éditeur ne passent PAS par là (vérifié).
- `parseContacts` dans `features/object-drawer/utils.ts:1041-1090` est **mort** (seul son test
  l'appelle) — ne pas y toucher, un correctif posé là n'aurait aucun effet.

### Vérification préalable (10 min, avant de coder)

En prod, les 778 liens `actor_object_role` étaient tous `visibility='partners'` au §213 — si c'est
toujours vrai, aucun canal d'acteur n'entre dans `contacts.public` aujourd'hui et le doublon vu
par le PO est celui de `TeamSection`. Sonder :
```sql
SELECT visibility, count(*) FROM actor_object_role GROUP BY 1;
```
**Le correctif doit couvrir les deux duplications dans tous les cas** (le code porte les deux).

### Arbitrage PO (ne bloque que l'incrément 3b)

La colonne d'export `contacts_public` perdra les lignes dédupliquées (changement du fichier Excel
livré). Valider — sinon, dédupliquer uniquement la vue `public` consommée par le tiroir et faire
pointer la colonne export sur une vue non dédupliquée.

### Incrément 3a — correction visible minimale (sans arbitrage, à faire d'abord)

Le bug signalé aujourd'hui vient très probablement de `TeamSection` (si la sonde préalable
confirme que les liens acteurs sont tous `partners`, aucun canal d'acteur n'atteint
`contacts.public`). Corriger d'abord ce rendu, sans toucher `contacts.public` ni l'export —
rayon de régression minimal.

**Fichiers (3a)** : `src/services/object-detail-parser.ts` (nouvelle fonction exportée),
`src/features/object-drawer/utils.ts` (`ActorItem` + `parseActors`),
`src/features/object-drawer/ObjectDetailView.tsx` (`buildPreview` l.~325-327, `TeamSection`) ;
tests `object-detail-parser.test.ts`, `ObjectDetailView.test.tsx`.

1. **Écrire une fonction de comparaison DÉDIÉE** dans `object-detail-parser.ts` (exportée pour le
   test — servira aussi à 3b). ⚠️ Ne PAS réutiliser `normalizePhoneValue` (l.507-518) : elle
   garde le `+` (`+262…` ≠ `0262…`) et sert à construire les `href tel:` — la modifier casserait
   le composeur. La normalisation §195 est du SQL, non réutilisable.
   ```ts
   /** Clé de comparaison inter-sources (dédup affichage). Jamais pour un href. */
   export function contactComparisonKey(kindCode: string, value: string): string {
     const trimmed = value.trim();
     if (!trimmed) return '';
     const digits = trimmed.replace(/\D/g, '');
     const looksPhone = digits.length >= 8 && digits.length >= trimmed.replace(/[\s.\-()+]/g, '').length;
     if (looksPhone) {
       // Replie +262/00262 (Réunion) sur la forme nationale 0XXXXXXXXX.
       const national = digits.replace(/^(?:00)?262(?=\d{9}$)/, '0');
       return `tel:${national}`;
     }
     if (trimmed.includes('@')) return `mail:${trimmed.toLowerCase()}`;
     return `${kindCode}:${trimmed.toLowerCase()}`;
   }
   ```
   La comparaison téléphone/e-mail porte sur la **valeur seule** (pas le couple kind+valeur) : le
   même numéro est souvent saisi `phone` sur l'objet et `mobile` sur l'acteur — comparer le couple
   raterait précisément le doublon signalé.
2. **`TeamSection`** : enrichir `ActorItem` d'un champ structuré (ex.
   `contactEntries: { label: string; kindCode: string; value: string }[]` rempli par
   `parseActors` AVANT l'aplatissement `mapContactLines` — garder `contacts: string[]` pour
   compat). Dans `buildPreview` (`ObjectDetailView.tsx:~327`), calculer la ligne visible de
   chaque acteur : première entrée dont `contactComparisonKey` n'est PAS dans l'ensemble des clés
   des **contacts objet effectivement AFFICHÉS** — c.-à-d. `parsed.contacts.public` filtré
   `source === 'object'`, PAS `parsed.contacts.object` entier : la section « Contact » ne rend
   que `contacts.public` (`ObjectDetailView.tsx:325`), donc comparer au leg complet ferait
   masquer la ligne d'un acteur par un contact objet **interne**, que le lecteur ne voit nulle
   part. La dédup s'applique **après** la garde `canSeeActors` (l.3977), jamais avant (sinon on
   fuit, par l'absence d'un contact objet, l'info qu'un acteur masqué porte la même valeur).
3. **Cas limites actés** (ne pas sur-concevoir) : un acteur dont tous les canaux sont dédupliqués
   garde sa carte nom + rôle sans ligne meta (rendu actuel vérifié, acceptable) ; ne JAMAIS
   router ce cas vers la branche `contactsRestricted` (l.3119-3121 — ce message signifie « refus
   serveur §208 », l'utiliser ici serait un mensonge sur la cause) ; deux acteurs partageant une
   valeur absente de l'objet : hors périmètre, on ne touche pas.
4. **Tests 3a** (AAA, dans les suites existantes) :
   - `contactComparisonKey` : `+262…`/`00262…`/`0262…` égaux ; `0692…` mobile égal à `+262692…` ;
     e-mails à casse différente égaux ; deux kinds différents, même numéro ⇒ même clé ;
   - `ObjectDetailView` : `TeamSection` saute la ligne dupliquée avec un contact objet PUBLIC et
     affiche la suivante ; **contact objet PRIVÉ (`isPublic=false`) + même valeur chez un acteur
     ⇒ la ligne acteur RESTE affichée** (le doublon n'existe pas à l'écran) ; acteur sans canal
     restant ⇒ carte nom + rôle, sans message `contactsRestricted`.
5. `npx jest object-detail-parser ObjectDetailView` puis suite complète + `tsc --noEmit`.

### Incrément 3b — dédup de `contacts.public` (après l'arbitrage export)

**Fichiers (3b)** : `src/services/object-detail-parser.ts:1000-1043` ; tests
`object-detail-parser.test.ts` + non-régression export (`export-columns`).

1. **Dédup dans `normalizeAggregatedContacts`** : laisser les legs
   `object`/`actors`/`organizations` INTACTS ; ne dédupliquer que les vues dérivées `public` (et
   `all`) avec `contactComparisonKey`. L'ordre de concaténation existant (objet d'abord) +
   `dedupeByKey` (premier gagnant) garantit déjà « l'objet gagne ». Le tri `sortContacts` opère
   par leg AVANT concaténation ⇒ les colonnes export `phone`/`email`/… (`firstPublicContact`)
   rendent la même valeur qu'avant — à épingler par un test de non-régression.
2. **Tests 3b** : objet `0262 12 34 56` (`phone`) + acteur `+262 262 12 34 56` (`mobile`) ⇒
   `contacts.public` contient UNE entrée, `source==='object'` ; une valeur portée par l'acteur
   seul reste présente ; e-mails à casse différente dédupliqués ; `firstPublicContact` inchangé
   sur la fixture ; la colonne `contacts_public` reflète la décision PO.

---

## Chantier 4 — Erreurs en français + validation par champ

### Ce que l'investigation a établi

- Le problème n'est PAS des chaînes anglaises codées en dur (quasi inexistantes) mais un
  **pass-through de l'anglais backend**, via un anti-pattern répliqué à l'identique dans 7
  services : `detail = payload.detail ?? payload.error ?? …` puis `throw new Error(detail)`.
- `mapMutationError` (`src/services/object-workspace.ts:157-166`) ne mappe QUE la famille
  RLS/42501. Son `fallback` français (~80 beaux messages déjà écrits dans le fichier) est du
  **code quasi mort** : PostgrestError a toujours un `.message`, donc c'est presque toujours le
  brut anglais qui sort.
- **L'infrastructure par champ existe déjà, complète et testée**
  (`features/object-editor/primitives/Field.tsx` : prop `error` → `aria-invalid` +
  `role="alert"` + bordure rouge via `object-editor.css:293-295`) mais elle est **utilisée 0 fois
  sur 189 usages de `<Field>`**.
- Le scroll par section existe (`useEditorScrollSpy.ts:23-27` `scrollToSection(num)` + ancres
  `id="section-NN"` posées par `Fs.tsx`) mais les erreurs de sauvegarde ne peuvent pas s'en
  servir : `Issue.section` est polymorphe (les règles de validation posent un **numéro**,
  `saveResultToIssues` pose un **libellé de module**) ⇒ le bloc « Erreurs d'enregistrement » de
  `BlockersModal.tsx:56-64` est en `<div>` statique quand les blockers (l.68-111) ont des
  boutons « Aller › ».
- Cas démonstrateur gratuit : `CreateObjectDialog` — `create-object-options.ts:84-99` calcule
  DÉJÀ `errors: { type?: string; name?: string }` avec messages français… jamais rendus (seul
  `validation.ok` est lu ; l'utilisateur voit un bouton grisé sans savoir quel champ manque).

### Lot A — traduction (à faire en premier, gain maximal — risque MOYEN)

⚠️ Ce lot touche la quasi-totalité des chemins d'écriture de l'application : inverser la
priorité brut/fallback change ce que voient les utilisateurs sur TOUTES les erreurs, pas
seulement les anglaises. Déploiement **progressif obligatoire** : d'abord un périmètre pilote
(les 3 services d'upload : `media-upload.ts`, `document-upload.ts`, `actor-documents.ts`),
vérification en conditions réelles, puis généralisation aux autres services et à
`mapMutationError`. Matrice de tests minimale pour `readApiErrorMessage` ET le mappeur SQLSTATE,
chaque cas dans les specs Jest du nouveau module :

| Cas | Attendu |
|---|---|
| Réponse JSON avec code connu | message FR de la table |
| Réponse JSON avec code inconnu | générique FR + `console.warn` du brut |
| Réponse non-JSON (HTML d'erreur, 502) | générique FR, pas d'exception de parsing |
| Erreur réseau (fetch rejeté) | générique FR « Connexion impossible… » |
| SQLSTATE connu (23505, 22P02…) | message FR dédié |
| SQLSTATE inconnu | fallback FR du site d'appel + `console.warn` |
| Diagnostic | le brut n'est JAMAIS affiché ; en **dev** il part entier en `console.warn`, en **prod** seulement statut + code (+ identifiant de corrélation si la route en fournit un) — le `detail` backend peut porter des noms de tables, des données ou de la configuration |

Cette politique de journalisation (brut complet en dev, statut + code seuls en prod) vaut pour
TOUS les points du lot : `readApiErrorMessage`, `mapMutationError` et les inversions
`error.message || '<FR>'` du point 4.

1. **Créer `src/services/api-error.ts`** : un helper unique `readApiError(response)` remplaçant le
   pattern dupliqué des 7 services (`media-upload.ts:30`, `document-upload.ts:33`,
   `actor-documents.ts:60`, `object-delete.ts:31`, `crm.ts:1237`, `rgpd.ts:71`, `lists.ts:438` —
   variantes `lists.ts`/`user-profile.ts:127`, `rbac.ts:113,129`). Table code → FR (compléter en
   balayant les `error:` des routes `src/app/api/**`) :
   ```ts
   const API_ERROR_LABELS: Record<string, string> = {
     unauthenticated: 'Vous devez être connecté pour effectuer cette action.',
     forbidden: "Cette action n'est pas autorisée avec vos droits actuels.",
     not_found: 'Élément introuvable — il a peut-être été supprimé entre-temps.',
     upload_failed: "Le téléversement a échoué. Réessayez ; si le problème persiste, contactez l'administrateur.",
     bad_multipart: 'Le fichier envoyé est illisible. Réessayez depuis le formulaire.',
     bad_json: 'Requête invalide. Rechargez la page et réessayez.',
     invalid_fields: 'Certains champs sont invalides.',
     server_misconfigured: "Configuration serveur incomplète. Contactez l'administrateur.",
     delete_failed: 'La suppression a échoué.',
     invite_failed: "L'invitation a échoué.",
     document_create_failed: "L'enregistrement du document a échoué.",
     signed_url_failed: "Le lien de téléchargement n'a pas pu être généré.",
     already_promoted: 'Ce document a déjà été rattaché à la fiche.',
     source_missing: 'Le document source est introuvable.',
     unknown_document_type: 'Type de document inconnu.',
     self_delete_forbidden: 'Vous ne pouvez pas supprimer votre propre compte.',
     invalid_user_id: 'Identifiant utilisateur invalide.',
   };
   export function readApiErrorMessage(payload: { error?: string; detail?: string } | null, status: number): string {
     const code = payload?.error ?? '';
     const mapped = API_ERROR_LABELS[code];
     if (mapped) return mapped;
     // Brut jamais affiché. En prod, ne journaliser QUE statut + code (le detail peut porter
     // noms de tables / données / configuration) ; le brut complet reste réservé au dev.
     if (process.env.NODE_ENV !== 'production') {
       console.warn('[api-error] réponse non mappée', { status, code, detail: payload?.detail });
     } else {
       console.warn('[api-error] réponse non mappée', { status, code });
     }
     return `Une erreur est survenue (code ${status}). Réessayez ; si le problème persiste, contactez l'administrateur.`;
   }
   ```
2. **Inverser la priorité dans `mapMutationError`** (`object-workspace.ts:157-166`) : mapper les
   SQLSTATE connus → FR, sinon **retourner le `fallback` FR** (déjà écrit aux ~80 sites d'appel)
   et journaliser le brut en `console.warn`. Cela réactive d'un coup tous les messages français
   existants. Table SQLSTATE minimale : `42501`/`row-level security` (déjà là), `23505` « Cette
   valeur existe déjà (doublon). », `23503` « Un élément lié a été supprimé entre-temps —
   rechargez la fiche. », `23514`/`23502` « Une valeur enregistrée est invalide ou manquante. »,
   `22P02` « Format de valeur invalide. », `22001` « Texte trop long pour ce champ. »,
   `PGRST301`/`JWT` « Session expirée — reconnectez-vous. ». ⚠️ `P0001` : nos RPCs lèvent des
   CODES (`FORBIDDEN`, `NOT_FOUND`, `MUST_ARCHIVE_FIRST`…) déjà traduits par `friendlyStatusError`
   (`object-workspace.ts:4147`) et consorts — ne pas doublonner : le mappeur générique ne traite
   `P0001` que s'il n'a pas déjà été traduit en amont.
3. **Franciser à la source les messages média** (gravité 1 — affichés en `role="alert"` sous le
   champ d'upload) : `src/app/api/media/upload/process-image.ts:51,54,63`, `process-video.ts:38,41`,
   `handle-upload.ts:57,69`. Ex. : « Format d'image non pris en charge (reçu : image/heic).
   Formats acceptés : JPEG, PNG, WebP. » ; « Vidéo trop volumineuse (max 100 Mo). ». Remplacer
   les `detail: 'SUPABASE_SERVICE_ROLE_KEY missing'` (6 routes) par un code neutre
   `server_misconfigured` — c'est aussi une fuite de configuration.
4. **Corriger le pattern piège `error.message || '<FR>'`** (le brut anglais gagne toujours) dans
   `moderation.ts:73,99,114,129` et `lists.ts:248-454` : passer par le mappeur du point 2, brut
   en `console.warn`.

### Lot B — erreur par champ (le contrat existe, il suffit de le brancher)

1. **Démonstrateur immédiat** — `CreateObjectDialog.tsx` : passer `validation.errors.type` /
   `validation.errors.name` aux `<Field error={…}>` correspondants (messages FR déjà calculés
   dans `create-object-options.ts:90-96`). Coût quasi nul, montre le pattern à toute l'équipe.
2. **Outline renforcé** — un seul endroit : `object-editor.css:293-295`, ajouter au sélecteur
   `[aria-invalid='true']` existant un halo `box-shadow: 0 0 0 3px rgb(var(--theme-danger-rgb) / .25)`
   (⚠. syntaxe tokens : `rgb(var(--token) / α)` UNIQUEMENT — jamais `rgba(var(…), α)`, déclaration
   silencieusement éliminée, §215/§216 ; si le token danger n'existe pas, rester sur `var(--red)`).
3. Étendre ensuite l'usage de `<Field error>` aux modales CRM (`CrmActorModals.tsx:461` : le
   `canSubmit` agrégé grise le bouton sans dire quel champ manque — décomposer en erreurs par
   champ affichées au blur/submit). Les primitives composées (`ChipMultiSelect`,
   `ReferenceSelect`…) ne propagent pas `aria-invalid` (plafond documenté `Field.tsx:17-18`) — les
   traiter au cas par cas APRÈS les contrôles simples.

### Lot C — scroll vers la première erreur (éditeur)

1. **Prérequis structurel** : ajouter `sectionNums: string[]` à `Issue`
   (`save-issues.ts`) et construire la table `WorkspaceModuleId → numéros de section` qui manque
   aujourd'hui (à dériver des clés de `MODULE_LABEL` `save-issues.ts:11-41` croisées avec
   `section-config.ts:30-83`). Cas plurivoques connus : `relationships` → §15/§17/§19,
   `characteristics` → plusieurs sections — la table renvoie une LISTE, le bouton saute à la
   première. `publishErrorToIssue` (`save-issues.ts:63-69`) pose `'21'` au lieu du littéral
   `'Publication'`.
2. **`BlockersModal.tsx:56-64`** : transformer les `<div className="issue issue--static">` du bloc
   « Erreurs d'enregistrement » en boutons `onClick={() => onGoToSection(num)}` identiques au bloc
   blockers (l.74-83) — `onGoToSection` est déjà câblé sur `scrollToSection` depuis
   `ObjectEditPage.tsx:621-623`.
3. **Ancre par champ** (phase ultérieure) : les `id` de `Field` viennent de `useId()` (non
   déterministes) — ajouter une prop `anchorId?` optionnelle à `Field` qui prime sur `useId`,
   puis `scrollIntoView` + `focus()` sur le premier champ invalide au submit. Commencer par le
   dialog B1 et les modales CRM (formulaires courts), l'éditeur ensuite.

**Hors périmètre (à ne pas « corriger »)** : `src/services/auth.ts:10-53` (`toFriendlyAuthError`)
est le MODÈLE du pattern, pas un problème ; `src/app/api/public/**` est une API
machine-à-machine, l'anglais y est correct ; les `console.error`/logs ne sont pas des surfaces
utilisateur.

---

## Chantier 5 — Les demandes CRM naissent « traitées »

### Ce que l'investigation a établi (symptôme PROUVÉ, pas déduit)

- L'entité « demande » = **`crm_interaction` RACINE** (`parent_interaction_id IS NULL`) avec un
  sujet `demand_topic_id`. Statut : enum `crm_status` = `planned` (« En attente ») / `done`
  (« Traitée ») / `canceled` (jamais produit ni affiché — valeur morte). Ce n'est PAS `crm_task`
  (le kanban `todo/in_progress/done` est sain).
- **Le défaut est à trois étages, tous sur `'done'`** :
  | Étage | Emplacement | Valeur |
  |---|---|---|
  | DDL | `schema_unified.sql:2198` | `status crm_status NOT NULL DEFAULT 'done'` |
  | RPC insert racine | `migration_crm_module.sql:990` | `COALESCE(NULLIF(p_payload->>'status',''),'done')` |
  | RPC insert réponse | `migration_crm_module.sql:958` | idem `'done'` — **voulu et documenté, à laisser** |
  | Front | `CrmInteractionModal.tsx:106-113` | n'envoie jamais `status` ⇒ le COALESCE tombe sur `'done'` |
- Preuve live : 3 144 interactions (`done` 2 974 / `planned` 170) ; **les 3 seules créées via
  l'UI** (`source='bertel_ui'`) sont nées `done` puis ont été **rebasculées à la main dans les
  secondes suivantes** (audit_log : 18 s, 15 s avec 5 allers-retours, 5 s). 100 % des demandes UI
  ont dû être « rouvertes » manuellement — c'est exactement le signalement du PO.
- Effet en chaîne : une demande née `done` est invisible du filtre « Actives »
  (`p_status='active'` → `planned`, `migration_crm_module.sql:425-426` et `:1042-1043`) et n'a
  pas de `resolved_at` (« traitée » sans preuve de traitement).
- Cycle actuel : un unique toggle binaire « Marquer traitée / Rouvrir » (`crm-primitives.tsx:626-645`,
  câblé dans `CrmActorFiche.tsx:380`, `CrmTimelineView.tsx:141`, `CrmObjectView.tsx:98`) ; `'done'`
  pose `resolved_at=COALESCE(resolved_at, NOW())`, `'planned'` le remet à NULL
  (`migration_crm_module.sql:898-903`). La clôture d'une tâche kanban peut aussi marquer
  l'interaction liée traitée (`CrmTaches.tsx:87-90`).

### Arbitrage PO (bloquant pour l'étape 3)

La même modale crée les **demandes** ET les **notes internes** (compte rendu d'un échange déjà
clos). Basculer le défaut sur `planned` sans discriminant transformerait toutes les notes en
demandes en attente. Discriminant recommandé : **sujet de demande renseigné ⇒ `planned` ;
sans sujet ⇒ `done`** (note). Alternative : un choix explicite « À traiter / Déjà traitée » dans
la modale. À trancher. Signaler aussi au PO : la carte Dashboard « Demandes à traiter »
(`components/dashboard/ScorecardStrip.tsx:52-68`) est alimentée par la **modération**
(`pending_changes`), pas par le CRM — le mot « demande » désigne aujourd'hui deux choses.

### Étapes

**Fichiers** : créer `Base de donnée DLL et API/migration_crm_interaction_default_status.sql` ;
modifier `migration_crm_module.sql` (:990 et bloc INSERT), `schema_unified.sql:2198`,
`ci_fresh_apply.sql`, runbook ; frontend `src/features/crm/CrmInteractionModal.tsx:106-113` et
`src/services/crm.ts:590` ; test `Base de donnée DLL et API/tests/test_crm_interaction_status.sql`.

1. **DIFFER le `prosrc` vif de `api.save_crm_interaction`** contre `migration_crm_module.sql`
   (règle commune §213). Si le vif porte des passes absentes du fichier, porter le patch sur le
   corps VIF, jamais l'inverse.
2. **Migration — la règle métier est AUTORITAIRE CÔTÉ SERVEUR** : `CREATE OR REPLACE FUNCTION
   api.save_crm_interaction` avec DEUX changements dans la branche INSERT **racine** uniquement
   (`v_topic_id` est déjà résolu avant l'INSERT, vérifié `migration_crm_module.sql:983-996`) :
   - défaut de statut dérivé du sujet — un client qui n'envoie pas de statut (autre front, futur
     appel RPC) obtient le MÊME comportement que l'UI, jamais une note transformée en demande :
     ```sql
     COALESCE(
       NULLIF(p_payload->>'status','')::crm_status,
       CASE WHEN v_topic_id IS NOT NULL THEN 'planned'::crm_status
            ELSE 'done'::crm_status END)
     ```
   - cohérence `resolved_at` : si le statut inséré est `'done'`, poser `resolved_at = NOW()` dès
     l'INSERT (aujourd'hui une ligne née `done` n'a pas de date de résolution).
   La branche réponse (l.958) reste `'done'` — « une réponse n'est pas une demande en attente »
   (commentaire l.949, décision existante).
   Dans la même migration, le filet DDL : **SUPPRIMER le défaut** plutôt que le remplacer — un
   `DEFAULT 'planned'` contredirait la règle par-sujet pour toute écriture directe qui contourne
   le RPC ; sans défaut, la colonne étant `NOT NULL`, une écriture directe sans statut **échoue**
   au lieu de deviner :
   ```sql
   ALTER TABLE public.crm_interaction ALTER COLUMN status DROP DEFAULT;
   ```
   Écritures directes existantes vérifiées : les deux triggers (`incident_report`
   `schema_unified.sql:3220` et workflow publication `:3356`) passent déjà `status` explicitement
   — rien à changer. Seul `tests/test_gdpr_erasure.sql:29` insère sans statut : lui ajouter
   `status = 'done'` explicite dans la même passe.
3. **Frontend — rendre le choix EXPLICITE en plus** : `CrmInteractionModal.tsx:106-113` envoie
   `status: topicCode ? 'planned' : 'done'` (le service `crm.ts:590` relaie déjà `status` quand
   il est défini). Le payload explicite documente l'intention ; la règle serveur de l'étape 2
   reste le filet pour tout autre appelant. Les deux doivent exprimer la MÊME règle — si
   l'arbitrage retient le toggle explicite plutôt que le discriminant, c'est le toggle qui
   alimente `status`, et la règle serveur par sujet reste le défaut en son absence.
4. **Replis** : reporter les deux patchs dans `migration_crm_module.sql` (source) ; dans
   `schema_unified.sql:2198`, retirer le `DEFAULT 'done'` de la ligne DDL (colonne
   `status crm_status NOT NULL`, sans défaut) ; manifeste + runbook ; `tests/test_gdpr_erasure.sql:29`
   reçoit son `status = 'done'` explicite.
5. **Test SQL** (persona Éditeur via le harnais JWT, PAS superuser) :
   `tests/test_crm_interaction_status.sql` —
   - racine AVEC sujet, sans `status` dans le payload ⇒ `status='planned'`,
     `resolved_at IS NULL`, ET elle apparaît dans `api.list_actor_crm(..., p_status:='active')`
     (garde non vacante : on teste le VRAI filtre, pas juste la colonne) ;
   - **racine SANS sujet et sans `status` ⇒ `status='done'` ET `resolved_at` renseigné** (le cas
     « note interne » — c'est lui qui prouve que la règle serveur ne transforme pas les notes en
     demandes) ;
   - `status` explicite dans le payload ⇒ il gagne sur le discriminant (les deux sens) ;
   - créer une réponse dans un fil ⇒ `status='done'` (comportement voulu conservé) ;
   - basculer la racine en `done` ⇒ `resolved_at` posé ; la rebasculer ⇒ `resolved_at` NULL.
   Vérifier le test ROUGE avant patch (sabotage), VERT après.
6. **Vérification UI** : créer une demande depuis la fiche acteur ⇒ chip « En attente » immédiate,
   sans devoir « Rouvrir » ; le compteur « Actives » l'inclut.
7. **Reprise de données — décision PO, ne rien exécuter sans elle** : 1 721 lignes
   `import_berta2_commentaire` sont `done` avec `resolved_at` NULL (le staging portait le même
   `DEFAULT 'done'` — probable héritage du défaut, pas une donnée métier). Proposer au PO :
   les laisser (historique) ou backfiller `resolved_at = created_at` pour les distinguer des
   vraies demandes traitées. Les 170 `planned` d'import sont, elles, de vraies demandes en
   attente à trier.

**Extensions différées (chacune = son propre arbitrage, ne pas les embarquer ici)** : état
intermédiaire `in_progress` aligné sur le kanban ; exposer ou retirer `canceled` ; écrire
`handled_by_actor_id` au moment du « Marquer traitée » ; `due_at` à la création.

---

## Traçabilité

- Chaque chantier terminé : consigner la décision dans
  `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (nouveau §) et mettre à jour le
  tracker de `.claude/WORKFLOW.md` si un différé est créé ou clos.
- Les arbitrages PO rendus (Q1-Q3 du chantier 1, catégorie du chantier 2, export du chantier 3,
  discriminant du chantier 5, reprise de données) se consignent MÊME quand la réponse est « non »
  — la trace du rejet vaut autant que celle de l'ajout (§209).
