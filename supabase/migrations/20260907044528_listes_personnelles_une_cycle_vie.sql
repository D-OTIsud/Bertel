-- migration_listes_personnelles_une_cycle_vie.sql
-- Listes personnelles, mise à la une et cycle de vie.
--
-- Cadrage : docs/superpowers/specs/2026-09-07-listes-personnelles-une-cycle-vie-design.md
-- Contrat : docs/superpowers/plans/2026-09-07-listes-implementation-contract.md
-- Note de déploiement : docs/listes-cycle-vie.md
--
-- CE QUE FAIT CETTE MIGRATION
--   1. Rouvre la création de listes à tout membre connecté d'une ORG (lecteurs compris) :
--      révoque la restriction superuser-only posée par 17l
--      (migration_list_create_superuser_only.sql, arbitrage PO du 2026-08-31), remplacée
--      par un arbitrage PO plus récent (2026-09-07, règle 1 du cadrage).
--   2. Ajoute le cycle de vie : mise à la une (is_featured / feature_requested_at),
--      horloge d'activité métier (last_activity_at, DISTINCTE de updated_at) et
--      l'archivage/la purge qui en dérivent.
--   3. Resserre la lecture/l'écriture d'une liste : plus de grille générale
--      « tout l'ORG lit tout ». Une liste personnelle non proposée reste
--      invisible aux collègues, y compris à un administrateur ou au superuser
--      « par défaut » — le superuser garde un accès global explicite, documenté
--      ligne par ligne ci-dessous, jamais un bypass implicite d'organisation.
--   4. Ajoute les RPCs de cycle de vie : list_featured_lists, list_list_proposals,
--      request_list_feature, review_list_feature, set_list_featured, restore_list,
--      duplicate_list, ensure_list_share_link.
--   5. Remplace la signature CLIENT de `api.mark_list_sent` : (uuid) → (uuid, uuid),
--      service_role UNIQUEMENT — un client ne doit plus pouvoir se déclarer
--      « envoyé » sans preuve d'acceptation SMTP côté serveur (route email).
--   6. Purge annuelle : `internal.purge_expired_lists()`, planifiée en cron
--      quotidien uniquement si `pg_cron` est installé (contrôle par nom de job,
--      jamais de purge dans le corps de cette migration).
--
-- CORRECTIONS DE REVUE ARCHITECTE (2026-09-07, avant la fin des tests) — ce
-- fichier intègre déjà les 6 points ci-dessous ; ils ne sont PAS un historique,
-- ils décrivent la forme FINALE :
--   §1 ANCIEN MEMBRE / COMPTE SUPPRIMÉ. `created_by` ne porte aucune FK (survit
--      à la suppression d'un compte) et n'était jamais recroisé avec une
--      adhésion ACTIVE. Tout bras "propriétaire" (lecture/écriture/usage/grille
--      Mes listes/proposition/marquage envoyé) revérifie désormais
--      `internal.org_membership_active(created_by, org_de_la_liste)` — jamais
--      `created_by = auth.uid()` seul.
--   §2 ADMIN DANS LA BONNE ORG. `api.current_user_admin_rank()` agrège le rang
--      maximum TOUTES ORGANISATIONS confondues (aucune contrainte n'impose une
--      unique adhésion active — les superusers en sont exemptés et une
--      rétrogradation ne la rejoue pas). Tout contrôle "est admin" est
--      désormais scopé à l'ORG de la liste via `internal.org_admin_rank` /
--      `internal.org_is_admin`, jointure directe
--      user_org_membership → user_org_admin_role(active) → ref_org_admin_role,
--      filtrée sur l'ORG exacte — jamais combiné avec `current_user_org_id()`
--      comme deux faits indépendants.
--   §3 CIRCUIT PROPOSITION STRICT. `set_list_featured(TRUE)` n'agit plus que
--      sur les PROPRES listes de l'appelant — AUCUNE exception superuser sur
--      la propriété (2e revue architecte). Celle d'un collègue passe PAR
--      `review_list_feature` sur une proposition en
--      attente. `set_list_featured(FALSE)` n'agit que si la liste est
--      EFFECTIVEMENT à la une (un retrait répété ne relance plus l'horloge).
--      `restore_list` est un NO-OP sur une liste déjà active ou à la une.
--      `can_manage_feature` reflète désormais l'action RÉELLEMENT possible sur
--      CETTE ligne (retirer / featurer sa propre liste / revoir une
--      proposition) — jamais un simple "est admin de l'ORG".
--   §4 FUITE PHOTO/CONTACTS D'UN OBJET NON PUBLIÉ OU HORS CORPUS. Un lecteur
--      peut désormais créer une liste ; `create_list`/`set_list_items`
--      filtraient seulement l'EXISTENCE de l'id. « published » seul n'est PAS
--      la lisibilité : le projet cloisonne aussi `object.is_test` via
--      `api.current_user_test_realm()` (§18a) — une fiche PUBLIÉE de l'AUTRE
--      corpus (test) passait le filtre de statut et fuitait sa photo/ses
--      contacts. `api.list_effective_object_ids` (statique) exige désormais
--      `status = published ET is_test = current_user_test_realm()`, et TOUTE
--      admission ET lecture (grilles + détail + lien public) en dérive le
--      même ensemble — ferme la fuite pour les items nouveaux ET pour
--      d'éventuelles lignes historiques déjà en base.
--   §5 CONCURRENCE. `ensure_list_share_link`, `update_list`, `set_list_items`,
--      `delete_list`, `share_list`, `review_list_feature`, `set_list_featured`
--      et `restore_list` verrouillent désormais la ligne (`FOR UPDATE`) AVANT
--      toute décision dépendant de is_featured/proposition — un créateur ne
--      peut plus passer sa garde personnelle juste avant qu'un admin ne mette
--      la liste à la une, puis écrire quand même sur l'ancien état lu. La
--      purge (`internal.purge_expired_lists`) reste un DELETE au prédicat
--      direct : PostgreSQL réévalue ce prédicat contre la dernière version de
--      la ligne (EvalPlanQual) sans code applicatif dédié — conservé tel quel.
--   §6 COÛT DES GRILLES. Les 3 grilles résolvaient l'ensemble effectif 3 fois
--      (couverture / compte / répartition). `internal.list_grid_summary`
--      résout une fois (CTE MATERIALIZED, published-only) et dérive les trois
--      valeurs de cette même résolution.
--
-- CE QUI N'EST PAS TOUCHÉ (signatures ET corps strictement inchangés)
--   `api.list_item_contacts`, `api.get_public_list_by_token`,
--   `api.resolve_list_object_ids` / `internal.resolve_list_object_ids`,
--   `api.list_selection_emails`. Leur comportement s'adapte NATURELLEMENT au
--   nouveau `user_can_write_list` / `user_can_read_list` (même fonction,
--   nouveau corps) sans avoir besoin d'être réécrits — `list_selection_emails`,
--   en particulier, continue d'utiliser `api.user_can_read_list` sur son bras
--   `p_list_id`, qui refuse désormais correctement un collègue sur une liste
--   personnelle non proposée. `api.list_effective_object_ids` EST touché
--   (§2, 2e revue architecte) : signature/ACL/branche dynamique inchangés,
--   seule sa condition published-only statique gagne le filtre de corpus de
--   test — voir section 5b ci-dessous.
--
-- Idempotent (CREATE OR REPLACE / ADD COLUMN IF NOT EXISTS / DROP ... IF EXISTS
-- avant re-création lors d'un changement de signature). NON foldé dans
-- schema_unified.sql à ce stade (comme 17k/17l/§211 qu'elle remplace en partie).

-- =====================================================================
-- 1. Colonnes de cycle de vie + backfill + contrainte
-- =====================================================================

ALTER TABLE object_list ADD COLUMN IF NOT EXISTS last_activity_at timestamptz;
ALTER TABLE object_list ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;
ALTER TABLE object_list ADD COLUMN IF NOT EXISTS feature_requested_at timestamptz;

-- Backfill sans faire bumper `updated_at` par accident (§197 : vérifier/éteindre
-- les triggers de la table AVANT un backfill de colonne dérivée). Le seul
-- trigger de object_list est `trg_object_list_touch` (BEFORE UPDATE → now()).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM object_list WHERE last_activity_at IS NULL) THEN
    ALTER TABLE object_list DISABLE TRIGGER trg_object_list_touch;
    UPDATE object_list
       SET last_activity_at = GREATEST(created_at, updated_at, COALESCE(last_sent_at, created_at))
     WHERE last_activity_at IS NULL;
    ALTER TABLE object_list ENABLE TRIGGER trg_object_list_touch;
  END IF;
END $$;

ALTER TABLE object_list ALTER COLUMN last_activity_at SET DEFAULT now();
ALTER TABLE object_list ALTER COLUMN last_activity_at SET NOT NULL;

-- Invariant : une fois mise à la une, la proposition est nécessairement close
-- (acceptée). Les deux RPC qui posent is_featured=TRUE effacent toujours
-- feature_requested_at dans la même UPDATE ; la contrainte documente et
-- verrouille cet invariant plutôt que de dépendre de la discipline du code.
ALTER TABLE object_list DROP CONSTRAINT IF EXISTS chk_object_list_feature_request_closed;
ALTER TABLE object_list ADD CONSTRAINT chk_object_list_feature_request_closed
  CHECK (NOT (is_featured AND feature_requested_at IS NOT NULL));

COMMENT ON COLUMN object_list.last_activity_at IS
  'Horloge métier de rétention (design 2026-09-07), DISTINCTE de updated_at : '
  'bumpée par une modification effective de contenu/items, un envoi réussi ou '
  'une restauration/retrait-de-la-une explicite. JAMAIS par une lecture, un '
  'partage, une proposition ou la résolution dynamique. is_archived et la '
  'purge annuelle se calculent à partir d''elle, jamais de updated_at.';
COMMENT ON COLUMN object_list.is_featured IS
  'Mise à la une (organisation entière). Exempte l''archivage/la purge tant '
  'que vrai. Mise à la une directe réservée aux PROPRES listes de l''appelant '
  '(aucune exception superuser sur la propriété) ; celle d''un collègue passe '
  'par review_list_feature.';
COMMENT ON COLUMN object_list.feature_requested_at IS
  'Proposition à la une en attente (posée par le créateur, revue par un admin '
  'd''ORG). NULL si aucune proposition en cours OU si déjà mise à la une '
  '(chk_object_list_feature_request_closed).';

-- =====================================================================
-- 2. Index (grilles + purge)
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_object_list_featured
  ON object_list (org_object_id) WHERE is_featured;
CREATE INDEX IF NOT EXISTS idx_object_list_pending_feature
  ON object_list (org_object_id) WHERE feature_requested_at IS NOT NULL AND NOT is_featured;
CREATE INDEX IF NOT EXISTS idx_object_list_retention
  ON object_list (last_activity_at) WHERE NOT is_featured;

-- =====================================================================
-- 3. Helpers ORG internes, non exposés (§1/§2 revue architecte)
-- =====================================================================
-- Jamais grantés à authenticated/anon : ils prennent un p_user_id ARBITRAIRE
-- (pas forcément l'appelant), ce qui serait une sonde d'appartenance/rang
-- d'un tiers si exposée. Utilisés UNIQUEMENT depuis d'autres fonctions
-- SECURITY DEFINER de ce module (la vérification d'EXECUTE s'effectue alors
-- contre le PROPRIÉTAIRE de la fonction appelante, pas contre l'appelant SQL
-- final — même convention que internal.resolve_list_object_ids).

-- Le créateur (ou tout p_user_id) est-il ACTIVEMENT membre de cette ORG ?
-- `user_org_membership.user_id` référence `users(id) ON DELETE CASCADE` : un
-- compte réellement supprimé n'a donc plus AUCUNE ligne ici, et cette
-- fonction rend FALSE pour lui — c'est ce qui couvre à la fois "ancien
-- membre" (adhésion désactivée) ET "compte supprimé" (adhésion disparue) en
-- un seul test.
CREATE OR REPLACE FUNCTION internal.org_membership_active(p_user_id uuid, p_org_object_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_org_membership m
    WHERE m.user_id = p_user_id AND m.org_object_id = p_org_object_id AND m.is_active
  );
$$;

-- Rang admin de p_user_id DANS CETTE ORG PRÉCISE (jamais agrégé toutes ORG
-- confondues, à l'inverse de api.current_user_admin_rank()). NULL si aucune
-- adhésion active + rôle admin actif dans p_org_object_id.
CREATE OR REPLACE FUNCTION internal.org_admin_rank(p_user_id uuid, p_org_object_id text)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT r.rank
  FROM user_org_membership m
  JOIN user_org_admin_role ar ON ar.membership_id = m.id AND ar.is_active
  JOIN ref_org_admin_role r   ON r.id = ar.role_id
  WHERE m.user_id = p_user_id AND m.org_object_id = p_org_object_id AND m.is_active
  ORDER BY r.rank DESC
  LIMIT 1;
$$;

-- p_user_id est-il admin (rang >= 30) DE CETTE ORG PRÉCISE ? Implique déjà
-- une adhésion active (la jointure d'internal.org_admin_rank l'exige) —
-- aucun appelant n'a besoin de revérifier org_membership_active en plus.
CREATE OR REPLACE FUNCTION internal.org_is_admin(p_user_id uuid, p_org_object_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, internal, pg_temp AS $$
  SELECT COALESCE(internal.org_admin_rank(p_user_id, p_org_object_id), 0) >= 30;
$$;

REVOKE ALL ON FUNCTION internal.org_membership_active(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION internal.org_admin_rank(uuid, text)        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION internal.org_is_admin(uuid, text)          FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION internal.org_membership_active(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION internal.org_admin_rank(uuid, text)        TO service_role;
GRANT EXECUTE ON FUNCTION internal.org_is_admin(uuid, text)          TO service_role;

-- =====================================================================
-- 4. Petit helper partagé : le seuil d'archivage (21 jours), en un seul endroit
-- =====================================================================

CREATE OR REPLACE FUNCTION api.list_is_archived(p_is_featured boolean, p_last_activity_at timestamptz)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT (NOT p_is_featured) AND (p_last_activity_at <= now() - interval '21 days');
$$;
REVOKE ALL ON FUNCTION api.list_is_archived(boolean, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.list_is_archived(boolean, timestamptz) TO authenticated, service_role;

-- =====================================================================
-- 5. Helpers d'autorisation
-- =====================================================================
-- Toujours COALESCE(..., FALSE) en tête : ces fonctions sont à TROIS valeurs
-- hors contexte HTTP (auth.uid()/auth.role() rendent NULL — §204), et les
-- appelants écrivent `IF NOT <fn>(...) THEN RAISE`, où `NOT NULL` = NULL ne
-- déclenche PAS le RAISE. Sans le COALESCE, chaque garde deviendrait fail-OPEN.
--
-- Chaque bras est désormais AUTONOME et scopé à l'ORG DE LA LIGNE (jamais
-- combiné avec current_user_org_id()/current_user_admin_rank() comme deux
-- faits indépendants — §1/§2 revue architecte) :
--   - propriétaire  : created_by = appelant ET internal.org_membership_active
--                     (created_by, org_de_la_liste) — un ancien membre ou un
--                     compte supprimé ne passe plus jamais ce bras, y compris
--                     pour lui-même.
--   - à la une      : n'importe quel membre ACTIF de l'ORG de la liste.
--   - proposition   : admin (rang >= 30) DE CETTE ORG PRÉCISE.
--   - orpheline      : admin DE CETTE ORG PRÉCISE, ET créateur devenu inactif
--                     dans CETTE ORG PRÉCISE.

-- Lecture : propriétaire actif, membre actif pour une liste à la une, admin de
-- l'ORG pour une proposition en attente (revue), reprise d'orpheline, ou
-- superuser plateforme (accès global, explicite). AUCUN accès général "tout
-- membre de l'ORG lit toute liste" (règle 2 du cadrage).
CREATE OR REPLACE FUNCTION api.user_can_read_list(p_list_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, internal, auth, pg_temp AS $$
  SELECT COALESCE(
    api.is_platform_superuser()
    OR EXISTS (
      SELECT 1 FROM object_list l
      WHERE l.id = p_list_id
        AND l.org_object_id = api.current_user_org_id()
        AND (
          (
            l.created_by = (SELECT auth.uid())
            AND internal.org_membership_active(l.created_by, l.org_object_id)
          )
          OR (
            l.is_featured
            AND internal.org_membership_active((SELECT auth.uid()), l.org_object_id)
          )
          OR (
            l.feature_requested_at IS NOT NULL
            AND internal.org_is_admin((SELECT auth.uid()), l.org_object_id)
          )
          OR (
            internal.org_is_admin((SELECT auth.uid()), l.org_object_id)
            AND NOT internal.org_membership_active(l.created_by, l.org_object_id)
          )
        )
    ),
    FALSE
  );
$$;

-- Utilisation (dupliquer, obtenir/générer le lien de partage) : propriétaire
-- actif, membre actif pour une liste à la une, reprise d'orpheline, ou
-- superuser. Volontairement PLUS ÉTROIT que la lecture : un admin qui voit
-- une proposition EN ATTENTE (bras revue de user_can_read_list) n'a pas de
-- droit d'usage tant qu'il ne l'a pas acceptée.
CREATE OR REPLACE FUNCTION api.user_can_use_list(p_list_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, internal, auth, pg_temp AS $$
  SELECT COALESCE(
    api.is_platform_superuser()
    OR EXISTS (
      SELECT 1 FROM object_list l
      WHERE l.id = p_list_id
        AND l.org_object_id = api.current_user_org_id()
        AND (
          (
            l.created_by = (SELECT auth.uid())
            AND internal.org_membership_active(l.created_by, l.org_object_id)
          )
          OR (
            l.is_featured
            AND internal.org_membership_active((SELECT auth.uid()), l.org_object_id)
          )
          OR (
            internal.org_is_admin((SELECT auth.uid()), l.org_object_id)
            AND NOT internal.org_membership_active(l.created_by, l.org_object_id)
          )
        )
    ),
    FALSE
  );
$$;

-- Écriture : le créateur ACTIF pour SA liste tant qu'elle n'est PAS à la une ;
-- un admin DE L'ORG DE LA LISTE pour une liste À LA UNE ; la reprise
-- d'orpheline ; ou le superuser plateforme.
CREATE OR REPLACE FUNCTION api.user_can_write_list(p_list_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, internal, auth, pg_temp AS $$
  SELECT COALESCE(
    api.is_platform_superuser()
    OR EXISTS (
      SELECT 1 FROM object_list l
      WHERE l.id = p_list_id
        AND l.org_object_id = api.current_user_org_id()
        AND (
          (
            l.created_by = (SELECT auth.uid())
            AND NOT l.is_featured
            AND internal.org_membership_active(l.created_by, l.org_object_id)
          )
          OR (
            l.is_featured
            AND internal.org_is_admin((SELECT auth.uid()), l.org_object_id)
          )
          OR (
            internal.org_is_admin((SELECT auth.uid()), l.org_object_id)
            AND NOT internal.org_membership_active(l.created_by, l.org_object_id)
          )
        )
    ),
    FALSE
  );
$$;

-- « Est admin de l'ORG de cette liste » (rang >= 30 DANS CETTE ORG, ou
-- superuser). Indépendant de la propriété — c'est ce qui permet à un admin de
-- revoir la liste d'un collègue sans lui donner de droit d'édition général.
CREATE OR REPLACE FUNCTION api.user_is_list_org_admin(p_list_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, internal, auth, pg_temp AS $$
  SELECT COALESCE(
    api.is_platform_superuser()
    OR EXISTS (
      SELECT 1 FROM object_list l
      WHERE l.id = p_list_id
        AND l.org_object_id = api.current_user_org_id()
        AND internal.org_is_admin((SELECT auth.uid()), l.org_object_id)
    ),
    FALSE
  );
$$;

-- Capacité PRÉCISE affichée en carte : l'admin (ou superuser) peut-il faire
-- QUELQUE CHOSE sur CETTE ligne via set_list_featured/review_list_feature —
-- retirer une liste déjà à la une, featurer directement SA PROPRE liste, ou
-- revoir une proposition en attente. Ni "est admin de l'ORG" au sens large,
-- ni un droit d'édition général (§3 revue architecte).
CREATE OR REPLACE FUNCTION api.user_can_manage_list_feature_action(p_list_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, internal, auth, pg_temp AS $$
  SELECT COALESCE(
    api.is_platform_superuser()
    OR EXISTS (
      SELECT 1 FROM object_list l
      WHERE l.id = p_list_id
        AND l.org_object_id = api.current_user_org_id()
        AND internal.org_is_admin((SELECT auth.uid()), l.org_object_id)
        AND (
          l.is_featured
          OR l.created_by = (SELECT auth.uid())
          OR l.feature_requested_at IS NOT NULL
        )
    ),
    FALSE
  );
$$;

REVOKE ALL ON FUNCTION api.user_can_read_list(uuid)                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION api.user_can_use_list(uuid)                  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION api.user_can_write_list(uuid)                FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION api.user_is_list_org_admin(uuid)             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION api.user_can_manage_list_feature_action(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.user_can_read_list(uuid)                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.user_can_use_list(uuid)                  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.user_can_write_list(uuid)                TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.user_is_list_org_admin(uuid)             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.user_can_manage_list_feature_action(uuid) TO authenticated, service_role;

-- =====================================================================
-- 5b. list_effective_object_ids — published-only ÉTEND au bon corpus de test
-- =====================================================================
-- §2 (2e revue architecte) : published-only n'est PAS lisibilité. Le projet
-- cloisonne object.is_test via api.current_user_test_realm() (§18a) — une
-- fiche PUBLIÉE du corpus test PASSE le seul filtre o.status='published',
-- alors qu'un utilisateur de production ne doit ni la voir ni voir sa photo
-- ou ses contacts. Signature, ACL et le fonctionnement DYNAMIQUE (délégué à
-- api.resolve_list_object_ids, non touché) restent strictement identiques à
-- migration_object_list.sql — seule la condition published-only de la
-- branche STATIQUE gagne le filtre de corpus. Comme TOUS les consommateurs de
-- ce module (grilles, détail, lien public) résolvent leur ensemble effectif
-- via cette fonction, corriger ICI ferme la fuite pour l'admission ET pour
-- toute ligne historique déjà en base, sans dupliquer le filtre ailleurs.
CREATE OR REPLACE FUNCTION api.list_effective_object_ids(
  p_list_id uuid,
  p_published_only boolean
) RETURNS TABLE(object_id text, pos int, note_fr text, note_en text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, pg_temp AS $$
  WITH l AS (SELECT * FROM object_list WHERE id = p_list_id)
  SELECT i.object_id, i.position, i.note_fr, i.note_en
  FROM l
  JOIN object_list_item i ON i.list_id = l.id
  JOIN object o ON o.id = i.object_id
  WHERE l.kind = 'static'
    AND (
      NOT p_published_only
      OR (o.status = 'published' AND o.is_test = (SELECT api.current_user_test_realm()))
    )
  UNION ALL
  SELECT r.object_id, r.ord::int, NULL::text, NULL::text
  FROM l
  CROSS JOIN LATERAL api.resolve_list_object_ids(l.filters, p_published_only, 200)
    WITH ORDINALITY AS r(object_id, ord)
  WHERE l.kind = 'dynamic';
$$;
COMMENT ON FUNCTION api.list_effective_object_ids(uuid, boolean) IS
  'Ensemble effectif d''une liste (statique = items curatés ; dynamique = '
  'résolution vive des filtres). published_only=TRUE exige désormais status '
  '= published ET is_test = current_user_test_realm() (§2, 2e revue '
  'architecte) — published seul n''est pas lisibilité. Périmètre/signature/ACL '
  'et branche dynamique inchangés depuis migration_object_list.sql.';

-- =====================================================================
-- 6. Résumé de grille (compte/répartition/couverture) — résolu UNE FOIS
-- =====================================================================
-- §6 revue architecte : les 3 grilles appelaient auparavant 3 fois
-- api.list_effective_object_ids par ligne de liste (couverture, compte,
-- répartition). Ce helper le fait UNE fois (CTE MATERIALIZED) et dérive les
-- trois valeurs de la même résolution. TOUJOURS published ET du bon corpus
-- de test (§2/§4 revue architecte, via api.list_effective_object_ids) : un
-- item statique non publié OU hors corpus (brouillon ou fiche test, quelle
-- que soit son ORG) ne compte JAMAIS dans item_count/type_breakdown, et ne
-- peut JAMAIS devenir la couverture. Jamais exposé (ni grant PUBLIC, ni RPC dédiée) :
-- consommé uniquement par les grilles ci-dessous.
CREATE OR REPLACE FUNCTION internal.list_grid_summary(p_list_id uuid)
RETURNS TABLE(item_count int, type_breakdown jsonb, cover_image text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, pg_temp AS $$
  WITH e AS MATERIALIZED (
    SELECT * FROM api.list_effective_object_ids(p_list_id, TRUE)
  ), joined AS MATERIALIZED (
    SELECT e.object_id, e.pos, o.object_type, o.cached_main_image_url
    FROM e JOIN object o ON o.id = e.object_id
  )
  SELECT
    (SELECT count(*)::int FROM joined),
    (SELECT COALESCE(jsonb_agg(jsonb_build_object('code', otype, 'n', n) ORDER BY n DESC), '[]'::jsonb)
       FROM (SELECT object_type::text AS otype, count(*) AS n FROM joined GROUP BY object_type) t),
    (SELECT cached_main_image_url FROM joined
      WHERE COALESCE(cached_main_image_url, '') <> ''
      ORDER BY pos LIMIT 1);
$$;
REVOKE ALL ON FUNCTION internal.list_grid_summary(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION internal.list_grid_summary(uuid) TO service_role;

-- =====================================================================
-- 7. Assemblage du détail (interne — jamais exposé à PostgREST)
-- =====================================================================
-- Factorisé hors de `api.get_list` pour que les RPC d'action (review/set
-- featured/restore) puissent, APRÈS leur propre mutation, rendre le détail
-- SI ENCORE LISIBLE ou `NULL` sinon — sans jamais lever une exception juste
-- parce que la visibilité a changé À CAUSE de l'action qu'on vient d'exécuter.
-- AUCUNE vérification d'autorisation ici : chaque appelant a déjà fait la
-- sienne avant d'appeler cette fonction.
CREATE OR REPLACE FUNCTION internal.build_list_detail_json(p_list_id uuid)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, auth, pg_temp AS $$
DECLARE
  v_list            object_list;
  v_ids             text[];
  v_cards           jsonb;
  v_items           jsonb;
  v_effective_cover text;
  v_can_edit        boolean;
  v_can_use         boolean;
  v_can_manage_feat boolean;
  v_can_propose     boolean;
  v_is_archived     boolean;
  v_can_restore     boolean;
  v_recipient       text;
  v_creator_name    text;
BEGIN
  SELECT * INTO v_list FROM object_list WHERE id = p_list_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Ensemble EFFECTIF toujours published ET du bon corpus de test (statique
  -- ET dynamique — §2/§4 revue architecte, via api.list_effective_object_ids) :
  -- un item non publié OU hors corpus (brouillon, ou fiche test vue par un
  -- utilisateur de production) ne doit jamais apparaître dans les cartes, les
  -- contacts, ni la couverture — même pour le créateur. Protège aussi les
  -- listes HISTORIQUES dont object_list_item contiendrait déjà un tel id : le
  -- filtre est appliqué à la LECTURE, pas seulement à l'admission.
  SELECT array_agg(object_id ORDER BY pos)
    INTO v_ids
  FROM api.list_effective_object_ids(p_list_id, TRUE);

  v_cards := COALESCE(
    api.get_object_cards_batch(COALESCE(v_ids, ARRAY[]::text[]), ARRAY[v_list.lang]::text[])::jsonb,
    '[]'::jsonb);

  WITH e AS (SELECT * FROM api.list_effective_object_ids(p_list_id, TRUE)),
       c AS (SELECT (elem->>'id') AS oid, elem AS card
             FROM jsonb_array_elements(v_cards) elem),
       ct AS (SELECT * FROM api.list_item_contacts(COALESCE(v_ids, ARRAY[]::text[])))
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
             'object_id', e.object_id, 'position', e.pos,
             'note_fr',   e.note_fr,   'note_en',  e.note_en,
             'card',      c.card,
             'contacts',  COALESCE(ct.contacts, '{}'::jsonb)
           ) ORDER BY e.pos), '[]'::jsonb),
    (SELECT c2.card->>'image'
       FROM e AS e2
       LEFT JOIN c AS c2 ON c2.oid = e2.object_id
      WHERE COALESCE(c2.card->>'image', '') <> ''
      ORDER BY e2.pos
      LIMIT 1)
  INTO v_items, v_effective_cover
  FROM e
  LEFT JOIN c  ON c.oid = e.object_id
  LEFT JOIN ct ON ct.object_id = e.object_id;

  v_can_edit        := api.user_can_write_list(p_list_id);
  v_can_use         := api.user_can_use_list(p_list_id);
  v_can_manage_feat := api.user_can_manage_list_feature_action(p_list_id);
  v_can_propose     := (v_list.created_by = (SELECT auth.uid())) AND NOT v_list.is_featured;
  v_is_archived     := api.list_is_archived(v_list.is_featured, v_list.last_activity_at);
  v_can_restore     := v_is_archived AND v_can_edit;
  -- PII : jamais projetée hors du créateur, même pour l'admin en revue de
  -- proposition ou le membre qui consulte une liste à la une (cadrage, règle 6).
  v_recipient       := CASE WHEN v_list.created_by = (SELECT auth.uid())
                            THEN v_list.recipient_label ELSE NULL END;
  SELECT p.display_name INTO v_creator_name FROM app_user_profile p WHERE p.id = v_list.created_by;

  RETURN json_build_object(
    'id', v_list.id, 'kind', v_list.kind,
    'name', v_list.name, 'name_en', v_list.name_en,
    'recipient_label', v_recipient,
    'intro_fr', v_list.intro_fr, 'intro_en', v_list.intro_en,
    'template', v_list.template, 'accent', v_list.accent, 'lang', v_list.lang,
    'cover_url', v_list.cover_url,
    'effective_cover_url', COALESCE(v_list.cover_url, v_effective_cover),
    'show_map', v_list.show_map, 'status', v_list.status,
    'filters', v_list.filters, 'filters_url', v_list.filters_url,
    -- §6 (2e revue architecte) : le token est un LIEN-CAPACITÉ (quiconque le
    -- détient accède à la page publique) — jamais rendu à qui n'a que le
    -- droit de LIRE (ex. l'admin qui examine seulement une proposition en
    -- attente) sans le droit d'UTILISER la liste.
    'share_token', CASE WHEN v_can_use THEN v_list.share_token ELSE NULL END,
    'share_enabled', v_list.share_enabled,
    'share_expires_at', v_list.share_expires_at, 'updated_at', v_list.updated_at,
    'resolved_from', CASE WHEN v_list.kind = 'static' THEN 'items' ELSE 'filters' END,
    'created_by', v_list.created_by, 'creator_name', v_creator_name,
    'org_object_id', v_list.org_object_id, 'last_activity_at', v_list.last_activity_at,
    'is_archived', v_is_archived, 'is_featured', v_list.is_featured,
    'feature_requested_at', v_list.feature_requested_at,
    'can_edit', v_can_edit, 'can_manage_feature', v_can_manage_feat,
    'can_propose_feature', v_can_propose, 'can_restore', v_can_restore,
    'can_manage_sharing', v_can_edit,
    'items', v_items
  );
END; $$;
REVOKE ALL ON FUNCTION internal.build_list_detail_json(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION internal.build_list_detail_json(uuid) TO service_role;

-- =====================================================================
-- 8. Détail public (authenticated) — inchangé en surface, corps factorisé
-- =====================================================================
CREATE OR REPLACE FUNCTION api.get_list(p_list_id uuid)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, auth, pg_temp AS $$
BEGIN
  IF NOT COALESCE(api.user_can_read_list(p_list_id), FALSE) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  RETURN internal.build_list_detail_json(p_list_id);
END; $$;
REVOKE ALL ON FUNCTION api.get_list(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.get_list(uuid) TO authenticated, service_role;

-- =====================================================================
-- 9. Création — rouverte à tout membre connecté d'une ORG (règle 1)
-- =====================================================================
-- Révoque la restriction superuser-only de 17l (migration_list_create_superuser_only.sql,
-- arbitrage PO 2026-08-31) : arbitrage PO plus récent, 2026-09-07. Conserve le
-- seul point de 17l qui reste valable : une liste sans ORG serait invisible et
-- inéditable pour tout le monde — le refus reste inconditionnel, superuser
-- compris. Admission published ET du bon corpus de test (§2/§4 revue
-- architecte) : un lecteur ne doit jamais pouvoir faire entrer un objet
-- brouillon, ni une fiche PUBLIÉE de l'AUTRE corpus (test), dans une liste
-- qui pourra ensuite être mise à la une ou partagée publiquement.
CREATE OR REPLACE FUNCTION api.create_list(
  p_kind text,
  p_name text,
  p_from_object_ids text[] DEFAULT NULL::text[],
  p_filters jsonb DEFAULT NULL::jsonb,
  p_filters_url text DEFAULT NULL::text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, pg_temp AS $$
DECLARE
  v_org text := api.current_user_org_id();
  v_id  uuid;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'NO_ORG' USING ERRCODE = '42501';
  END IF;
  IF p_kind NOT IN ('static','dynamic') THEN
    RAISE EXCEPTION 'BAD_KIND';
  END IF;
  IF p_kind = 'dynamic' AND p_filters IS NULL THEN
    RAISE EXCEPTION 'DYNAMIC_REQUIRES_FILTERS';
  END IF;

  INSERT INTO object_list(org_object_id, created_by, kind, name, filters, filters_url)
  VALUES (v_org, (SELECT auth.uid()), p_kind, COALESCE(NULLIF(p_name,''),'Nouvelle liste'),
          CASE WHEN p_kind = 'dynamic' THEN p_filters ELSE NULL END,
          CASE WHEN p_kind = 'dynamic' THEN p_filters_url ELSE NULL END)
  RETURNING id INTO v_id;

  IF p_kind = 'static' AND p_from_object_ids IS NOT NULL THEN
    INSERT INTO object_list_item(list_id, object_id, position)
    SELECT v_id, x.oid, x.ord::int
    FROM unnest(p_from_object_ids) WITH ORDINALITY AS x(oid, ord)
    WHERE EXISTS (
      SELECT 1 FROM object o
      WHERE o.id = x.oid AND o.status = 'published' AND o.is_test = (SELECT api.current_user_test_realm())
    )
    ON CONFLICT (list_id, object_id) DO NOTHING;
  END IF;

  RETURN v_id;
END; $$;
COMMENT ON FUNCTION api.create_list(text, text, text[], jsonb, text) IS
  'Création d''une liste : tout membre connecté d''une ORG (lecteurs compris). '
  'Items statiques admis published ET du bon corpus de test (§2/§4 revue architecte).';
REVOKE ALL ON FUNCTION api.create_list(text, text, text[], jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.create_list(text, text, text[], jsonb, text) TO authenticated, service_role;

-- =====================================================================
-- 10. Mise à jour des métadonnées — verrou + bump SEULEMENT sur diff réel
-- =====================================================================
CREATE OR REPLACE FUNCTION api.update_list(p_list_id uuid, p_patch jsonb)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, auth, pg_temp AS $$
BEGIN
  -- Verrou AVANT toute décision (§5 revue architecte) : un créateur ne peut
  -- plus passer sa garde personnelle juste avant qu'un admin ne mette la
  -- liste à la une, puis écrire quand même sur l'état lu avant le verrou.
  PERFORM 1 FROM object_list WHERE id = p_list_id FOR UPDATE;
  IF NOT COALESCE(api.user_can_write_list(p_list_id), FALSE) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  -- Toutes les expressions du SET voient les valeurs AVANT mise à jour de la
  -- même ligne `l` (Postgres évalue la liste SET d'une seule UPDATE contre
  -- l'ancienne version de la ligne) : la comparaison ancien/nouveau se fait
  -- donc dans la MÊME instruction, sans lecture préalable séparée.
  UPDATE object_list l SET
    name            = COALESCE(p_patch->>'name', l.name),
    name_en         = CASE WHEN p_patch ? 'name_en'         THEN p_patch->>'name_en'         ELSE l.name_en END,
    recipient_label = CASE WHEN p_patch ? 'recipient_label' THEN p_patch->>'recipient_label' ELSE l.recipient_label END,
    intro_fr        = CASE WHEN p_patch ? 'intro_fr'        THEN p_patch->>'intro_fr'        ELSE l.intro_fr END,
    intro_en        = CASE WHEN p_patch ? 'intro_en'        THEN p_patch->>'intro_en'        ELSE l.intro_en END,
    template        = COALESCE(p_patch->>'template', l.template),
    accent          = COALESCE(p_patch->>'accent', l.accent),
    lang            = COALESCE(p_patch->>'lang', l.lang),
    cover_url       = CASE WHEN p_patch ? 'cover_url' THEN p_patch->>'cover_url' ELSE l.cover_url END,
    show_map        = COALESCE((p_patch->>'show_map')::boolean, l.show_map),
    status          = COALESCE(p_patch->>'status', l.status),
    -- Le statut (draft/sent/shared) est un résultat DÉRIVÉ (envoi/partage), pas
    -- du contenu : exclu volontairement de la comparaison ci-dessous.
    last_activity_at = CASE WHEN (
           COALESCE(p_patch->>'name', l.name) IS DISTINCT FROM l.name
        OR (CASE WHEN p_patch ? 'name_en'         THEN p_patch->>'name_en'         ELSE l.name_en END)         IS DISTINCT FROM l.name_en
        OR (CASE WHEN p_patch ? 'recipient_label' THEN p_patch->>'recipient_label' ELSE l.recipient_label END) IS DISTINCT FROM l.recipient_label
        OR (CASE WHEN p_patch ? 'intro_fr'        THEN p_patch->>'intro_fr'        ELSE l.intro_fr END)        IS DISTINCT FROM l.intro_fr
        OR (CASE WHEN p_patch ? 'intro_en'        THEN p_patch->>'intro_en'        ELSE l.intro_en END)        IS DISTINCT FROM l.intro_en
        OR COALESCE(p_patch->>'template', l.template) IS DISTINCT FROM l.template
        OR COALESCE(p_patch->>'accent', l.accent)     IS DISTINCT FROM l.accent
        OR COALESCE(p_patch->>'lang', l.lang)         IS DISTINCT FROM l.lang
        OR (CASE WHEN p_patch ? 'cover_url' THEN p_patch->>'cover_url' ELSE l.cover_url END) IS DISTINCT FROM l.cover_url
        OR COALESCE((p_patch->>'show_map')::boolean, l.show_map) IS DISTINCT FROM l.show_map
      ) THEN now() ELSE l.last_activity_at END
  WHERE l.id = p_list_id;
  RETURN internal.build_list_detail_json(p_list_id);
END; $$;
REVOKE ALL ON FUNCTION api.update_list(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.update_list(uuid, jsonb) TO authenticated, service_role;

-- =====================================================================
-- 11. Items statiques — verrou, reconcile non-destructif, cible normalisée UNIQUE
-- =====================================================================
-- §4 (2e revue architecte) : v_after comparait un payload FILTRÉ tandis que
-- le DELETE comparait le payload BRUT — un id devenu non publié/hors corpus
-- mais toujours présent dans le payload restait alors stocké SANS être
-- retiré ni mis à jour (le DELETE le voyait "encore référencé", l'INSERT le
-- rejetait), pendant que v_after le considérait déjà absent : l'horloge
-- avançait à chaque appel identique sans qu'aucune ligne stockée ne change
-- réellement. Correction : UNE cible normalisée (v_target — DISTINCT ON
-- object_id, published ET bon corpus de test, §2), appliquée À L'IDENTIQUE
-- au DELETE et à l'UPSERT, puis l'état réel FINAL (relu après écriture) est
-- comparé à l'état INITIAL — jamais un état "prévu" qui peut diverger du
-- stockage réel.
CREATE OR REPLACE FUNCTION api.set_list_items(p_list_id uuid, p_items jsonb)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, auth, pg_temp AS $$
DECLARE
  v_before jsonb;
  v_target jsonb;
  v_after  jsonb;
  v_changed boolean;
BEGIN
  PERFORM 1 FROM object_list WHERE id = p_list_id FOR UPDATE;
  IF NOT COALESCE(api.user_can_write_list(p_list_id), FALSE) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM object_list WHERE id = p_list_id AND kind = 'static') THEN
    RAISE EXCEPTION 'ITEMS_ONLY_ON_STATIC';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'object_id', i.object_id, 'position', i.position,
           'note_fr', i.note_fr, 'note_en', i.note_en
         ) ORDER BY i.object_id), '[]'::jsonb)
    INTO v_before
  FROM object_list_item i WHERE i.list_id = p_list_id;

  -- Cible normalisée UNIQUE : published ET bon corpus de test (§2), ET
  -- DÉDOUBLONNÉE par object_id (DISTINCT ON) — un doublon dans le payload
  -- ferait échouer "ON CONFLICT DO UPDATE" sur la même ligne deux fois dans
  -- une seule instruction.
  WITH deduped AS (
    SELECT DISTINCT ON (x->>'object_id')
      x->>'object_id' AS object_id,
      COALESCE((x->>'position')::int, 0) AS position,
      x->>'note_fr' AS note_fr,
      x->>'note_en' AS note_en
    FROM jsonb_array_elements(COALESCE(p_items,'[]'::jsonb)) x
    WHERE x->>'object_id' IS NOT NULL
    ORDER BY x->>'object_id'
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'object_id', d.object_id, 'position', d.position,
           'note_fr', d.note_fr, 'note_en', d.note_en
         ) ORDER BY d.object_id), '[]'::jsonb)
    INTO v_target
  FROM deduped d
  JOIN object o ON o.id = d.object_id
  WHERE o.status = 'published' AND o.is_test = (SELECT api.current_user_test_realm());

  -- Applique EXACTEMENT cette cible : un item devenu non admissible ET
  -- encore présent dans le payload est retiré ici comme n'importe quel item
  -- absent — jamais "conservé silencieusement" en base.
  DELETE FROM object_list_item i
  WHERE i.list_id = p_list_id
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_target) t WHERE t->>'object_id' = i.object_id);

  INSERT INTO object_list_item(list_id, object_id, position, note_fr, note_en)
  SELECT p_list_id, t->>'object_id', (t->>'position')::int, t->>'note_fr', t->>'note_en'
  FROM jsonb_array_elements(v_target) t
  ON CONFLICT (list_id, object_id) DO UPDATE
    SET position = EXCLUDED.position,
        note_fr  = EXCLUDED.note_fr,
        note_en  = EXCLUDED.note_en;

  -- État réel FINAL (relu APRÈS écriture) comparé à l'état INITIAL : garantit
  -- que l'horloge ne bouge que si le contenu réellement STOCKÉ a changé — un
  -- second appel avec le même payload retrouve désormais v_before = v_after.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'object_id', i.object_id, 'position', i.position,
           'note_fr', i.note_fr, 'note_en', i.note_en
         ) ORDER BY i.object_id), '[]'::jsonb)
    INTO v_after
  FROM object_list_item i WHERE i.list_id = p_list_id;

  v_changed := (v_before IS DISTINCT FROM v_after);

  UPDATE object_list
     SET last_activity_at = CASE WHEN v_changed THEN now() ELSE last_activity_at END
   WHERE id = p_list_id;

  RETURN internal.build_list_detail_json(p_list_id);
END; $$;
REVOKE ALL ON FUNCTION api.set_list_items(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.set_list_items(uuid, jsonb) TO authenticated, service_role;

-- =====================================================================
-- 12. Suppression — verrou AVANT décision (§5 revue architecte)
-- =====================================================================
-- Corps inchangé depuis migration_object_list.sql à part le verrou : cette
-- fonction n'avait jamais été touchée avant cette revue, mais son SENS change
-- avec is_featured (user_can_write_list en dépend désormais).
CREATE OR REPLACE FUNCTION api.delete_list(p_list_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, pg_temp AS $$
BEGIN
  PERFORM 1 FROM object_list WHERE id = p_list_id FOR UPDATE;
  IF NOT COALESCE(api.user_can_write_list(p_list_id), FALSE) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  DELETE FROM object_list WHERE id = p_list_id;  -- cascade items
END; $$;
REVOKE ALL ON FUNCTION api.delete_list(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.delete_list(uuid) TO authenticated, service_role;

-- =====================================================================
-- 13. Partage (réglages) — verrou AVANT décision (§5 revue architecte)
-- =====================================================================
-- Corps inchangé depuis migration_object_list.sql à part le verrou, pour la
-- même raison que delete_list ci-dessus.
CREATE OR REPLACE FUNCTION api.share_list(
  p_list_id uuid,
  p_enable boolean DEFAULT true,
  p_expires_at timestamptz DEFAULT NULL
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, pg_temp AS $$
DECLARE v_token text; v_list object_list;
BEGIN
  PERFORM 1 FROM object_list WHERE id = p_list_id FOR UPDATE;
  IF NOT COALESCE(api.user_can_write_list(p_list_id), FALSE) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_list FROM object_list WHERE id = p_list_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  IF p_enable THEN
    v_token := COALESCE(v_list.share_token,
                        replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''));
    UPDATE object_list SET
      share_token = v_token, share_enabled = true,
      share_expires_at = p_expires_at,
      status = CASE WHEN status = 'draft' THEN 'shared' ELSE status END
    WHERE id = p_list_id;
  ELSE
    UPDATE object_list SET share_enabled = false WHERE id = p_list_id;
    v_token := v_list.share_token;
  END IF;

  RETURN json_build_object(
    'share_token', CASE WHEN p_enable THEN v_token ELSE v_list.share_token END,
    'share_url_path', CASE WHEN p_enable THEN '/l/' || v_token ELSE NULL END,
    'share_enabled', p_enable,
    'share_expires_at', p_expires_at
  );
END; $$;
REVOKE ALL ON FUNCTION api.share_list(uuid, boolean, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.share_list(uuid, boolean, timestamptz) TO authenticated, service_role;

-- =====================================================================
-- 14. Grilles : mes listes / à la une de l'ORG / propositions (admin)
-- =====================================================================

-- Mes listes : STRICTEMENT le créateur ACTIF de l'ORG de la liste (§1 revue
-- architecte : ni un ancien membre, ni un compte supprimé ne doit repasser
-- ici), actives ET archivées. AUCUNE exception superuser.
CREATE OR REPLACE FUNCTION api.list_my_lists()
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, auth, pg_temp AS $$
  SELECT COALESCE(json_agg(s ORDER BY s.updated_at DESC), '[]'::json)
  FROM (
    SELECT
      l.id, l.name, l.name_en, l.kind, l.status, l.lang,
      l.recipient_label,   -- toujours le créateur ici : jamais masqué
      l.accent, COALESCE(l.cover_url, g.cover_image) AS cover_url, l.updated_at,
      l.created_by, p.display_name AS creator_name, l.org_object_id,
      l.last_activity_at,
      api.list_is_archived(l.is_featured, l.last_activity_at) AS is_archived,
      l.is_featured, l.feature_requested_at,
      api.user_can_write_list(l.id)                 AS can_edit,
      api.user_can_manage_list_feature_action(l.id) AS can_manage_feature,
      (NOT l.is_featured)                            AS can_propose_feature,
      (api.list_is_archived(l.is_featured, l.last_activity_at) AND api.user_can_write_list(l.id)) AS can_restore,
      api.user_can_write_list(l.id)                 AS can_manage_sharing,
      g.item_count, g.type_breakdown
    FROM object_list l
    LEFT JOIN app_user_profile p ON p.id = l.created_by
    CROSS JOIN LATERAL internal.list_grid_summary(l.id) g
    WHERE l.created_by = (SELECT auth.uid())
      AND l.org_object_id = api.current_user_org_id()
      AND internal.org_membership_active(l.created_by, l.org_object_id)
  ) s;
$$;
REVOKE ALL ON FUNCTION api.list_my_lists() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.list_my_lists() TO authenticated, service_role;

-- À la une de l'organisation active : visible à TOUT membre ACTIF de l'ORG.
CREATE OR REPLACE FUNCTION api.list_featured_lists()
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, auth, pg_temp AS $$
  SELECT COALESCE(json_agg(s ORDER BY s.updated_at DESC), '[]'::json)
  FROM (
    SELECT
      l.id, l.name, l.name_en, l.kind, l.status, l.lang,
      CASE WHEN l.created_by = (SELECT auth.uid()) THEN l.recipient_label ELSE NULL END AS recipient_label,
      l.accent, COALESCE(l.cover_url, g.cover_image) AS cover_url, l.updated_at,
      l.created_by, p.display_name AS creator_name, l.org_object_id,
      l.last_activity_at,
      FALSE AS is_archived,   -- une liste à la une n'est structurellement jamais archivée
      l.is_featured, l.feature_requested_at,
      api.user_can_write_list(l.id)                 AS can_edit,
      api.user_can_manage_list_feature_action(l.id) AS can_manage_feature,
      ((l.created_by = (SELECT auth.uid())) AND NOT l.is_featured) AS can_propose_feature,
      FALSE AS can_restore,
      api.user_can_write_list(l.id)                 AS can_manage_sharing,
      g.item_count, g.type_breakdown
    FROM object_list l
    LEFT JOIN app_user_profile p ON p.id = l.created_by
    CROSS JOIN LATERAL internal.list_grid_summary(l.id) g
    WHERE l.is_featured AND l.org_object_id = api.current_user_org_id()
  ) s;
$$;
REVOKE ALL ON FUNCTION api.list_featured_lists() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.list_featured_lists() TO authenticated, service_role;

-- Propositions en attente de l'organisation active : réservé aux admins DE
-- CETTE ORG PRÉCISE (rang scopé, jamais current_user_admin_rank() global —
-- §2 revue architecte) ou superuser. Un appelant qui ne l'est pas obtient un
-- tableau VIDE (le filtre WHERE porte la garde), jamais une exception.
CREATE OR REPLACE FUNCTION api.list_list_proposals()
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, auth, pg_temp AS $$
  SELECT COALESCE(json_agg(s ORDER BY s.updated_at DESC), '[]'::json)
  FROM (
    SELECT
      l.id, l.name, l.name_en, l.kind, l.status, l.lang,
      CASE WHEN l.created_by = (SELECT auth.uid()) THEN l.recipient_label ELSE NULL END AS recipient_label,
      l.accent, COALESCE(l.cover_url, g.cover_image) AS cover_url, l.updated_at,
      l.created_by, p.display_name AS creator_name, l.org_object_id,
      l.last_activity_at,
      api.list_is_archived(l.is_featured, l.last_activity_at) AS is_archived,
      l.is_featured, l.feature_requested_at,
      api.user_can_write_list(l.id)                 AS can_edit,
      api.user_can_manage_list_feature_action(l.id) AS can_manage_feature,
      ((l.created_by = (SELECT auth.uid())) AND NOT l.is_featured) AS can_propose_feature,
      (api.list_is_archived(l.is_featured, l.last_activity_at) AND api.user_can_write_list(l.id)) AS can_restore,
      api.user_can_write_list(l.id)                 AS can_manage_sharing,
      g.item_count, g.type_breakdown
    FROM object_list l
    LEFT JOIN app_user_profile p ON p.id = l.created_by
    CROSS JOIN LATERAL internal.list_grid_summary(l.id) g
    WHERE l.feature_requested_at IS NOT NULL
      AND NOT l.is_featured
      AND l.org_object_id = api.current_user_org_id()
      AND (internal.org_is_admin((SELECT auth.uid()), l.org_object_id) OR COALESCE(api.is_platform_superuser(), FALSE))
  ) s;
$$;
REVOKE ALL ON FUNCTION api.list_list_proposals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.list_list_proposals() TO authenticated, service_role;

-- =====================================================================
-- 15. Actions de cycle de vie
-- =====================================================================

-- Propose sa propre liste à la une. Gate STRICT (2e revue architecte §3) :
-- le créateur ACTIF de SA personnelle, jamais via user_can_write_list (qui
-- laisserait un admin ayant repris une orpheline la "proposer" à lui-même —
-- un raccourci sans objet, puisqu'il peut déjà la featurer/gérer directement
-- via set_list_featured/review_list_feature). Idempotent si déjà en attente.
-- Ne touche JAMAIS last_activity_at.
CREATE OR REPLACE FUNCTION api.request_list_feature(p_list_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, auth, pg_temp AS $$
BEGIN
  PERFORM 1 FROM object_list WHERE id = p_list_id FOR UPDATE;
  IF NOT COALESCE((
    SELECT l.created_by = (SELECT auth.uid())
       AND NOT l.is_featured
       AND l.org_object_id = api.current_user_org_id()
       AND internal.org_membership_active(l.created_by, l.org_object_id)
    FROM object_list l WHERE l.id = p_list_id
  ), FALSE) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  UPDATE object_list
     SET feature_requested_at = COALESCE(feature_requested_at, now())
   WHERE id = p_list_id AND NOT is_featured;
  RETURN internal.build_list_detail_json(p_list_id);
END; $$;
REVOKE ALL ON FUNCTION api.request_list_feature(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.request_list_feature(uuid) TO authenticated, service_role;

-- Admin DE CETTE ORG : accepte (met à la une) ou refuse (retire la
-- proposition) une proposition. Verrou AVANT décision (§5). Ne touche jamais
-- last_activity_at.
CREATE OR REPLACE FUNCTION api.review_list_feature(p_list_id uuid, p_accept boolean)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, auth, pg_temp AS $$
BEGIN
  PERFORM 1 FROM object_list WHERE id = p_list_id FOR UPDATE;
  IF NOT COALESCE(api.user_is_list_org_admin(p_list_id), FALSE) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM object_list
    WHERE id = p_list_id AND feature_requested_at IS NOT NULL AND NOT is_featured
  ) THEN
    RAISE EXCEPTION 'NOT_PENDING' USING ERRCODE = 'PT409';
  END IF;

  IF p_accept THEN
    UPDATE object_list SET is_featured = TRUE, feature_requested_at = NULL WHERE id = p_list_id;
  ELSE
    UPDATE object_list SET feature_requested_at = NULL WHERE id = p_list_id;
  END IF;

  -- La disparition de l'accès admin après un refus est NORMALE (l'admin
  -- n'était lisible que via le bras « proposition en attente », qui vient
  -- de se fermer) : on rend NULL plutôt que de lever une exception.
  IF COALESCE(api.user_can_read_list(p_list_id), FALSE) THEN
    RETURN internal.build_list_detail_json(p_list_id);
  ELSE
    RETURN NULL;
  END IF;
END; $$;
REVOKE ALL ON FUNCTION api.review_list_feature(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.review_list_feature(uuid, boolean) TO authenticated, service_role;

-- Admin DE CETTE ORG : met directement SA PROPRE liste à la une (AUCUNE
-- exception superuser sur la propriété — 2e revue architecte §3), ou retire
-- une liste à la une de son ORG. Celle d'un collègue passe PAR
-- review_list_feature sur une proposition en attente — JAMAIS ici. Le retrait relance une période
-- active complète MAIS uniquement s'il agit réellement (idempotence : un
-- retrait répété sur une liste déjà non-featured est un NO-OP, ne relance pas
-- la rétention).
CREATE OR REPLACE FUNCTION api.set_list_featured(p_list_id uuid, p_featured boolean)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, auth, pg_temp AS $$
BEGIN
  PERFORM 1 FROM object_list WHERE id = p_list_id FOR UPDATE;
  IF NOT COALESCE(api.user_is_list_org_admin(p_list_id), FALSE) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF p_featured THEN
    -- Mise à la une DIRECTE réservée aux PROPRES listes — TOUS, superuser
    -- compris (2e revue architecte §3 : "tous publient directement LEURS
    -- PROPRES listes" n'admet aucune exception plateforme). Un superuser qui
    -- veut mettre à la une la liste d'un collègue passe PAR
    -- review_list_feature, sur une proposition en attente, exactement comme
    -- un admin ordinaire — user_is_list_org_admin (ci-dessus) l'y autorise déjà.
    IF NOT EXISTS (SELECT 1 FROM object_list WHERE id = p_list_id AND created_by = (SELECT auth.uid())) THEN
      RAISE EXCEPTION 'FEATURE_REQUIRES_OWN_LIST_OR_PROPOSAL' USING ERRCODE = 'PT409';
    END IF;
    UPDATE object_list SET is_featured = TRUE, feature_requested_at = NULL WHERE id = p_list_id;
  ELSE
    UPDATE object_list SET is_featured = FALSE, last_activity_at = now()
     WHERE id = p_list_id AND is_featured;
  END IF;

  IF COALESCE(api.user_can_read_list(p_list_id), FALSE) THEN
    RETURN internal.build_list_detail_json(p_list_id);
  ELSE
    RETURN NULL;
  END IF;
END; $$;
REVOKE ALL ON FUNCTION api.set_list_featured(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.set_list_featured(uuid, boolean) TO authenticated, service_role;

-- Réactivation explicite d'une liste personnelle ARCHIVÉE. NO-OP sur une
-- liste déjà active, et ne s'applique jamais à une liste à la une
-- (structurellement jamais archivée) — §3 revue architecte.
CREATE OR REPLACE FUNCTION api.restore_list(p_list_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, auth, pg_temp AS $$
BEGIN
  PERFORM 1 FROM object_list WHERE id = p_list_id FOR UPDATE;
  IF NOT COALESCE(api.user_can_write_list(p_list_id), FALSE) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  UPDATE object_list
     SET last_activity_at = now()
   WHERE id = p_list_id
     AND NOT is_featured
     AND api.list_is_archived(is_featured, last_activity_at);
  RETURN internal.build_list_detail_json(p_list_id);
END; $$;
REVOKE ALL ON FUNCTION api.restore_list(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.restore_list(uuid) TO authenticated, service_role;

-- Duplication indépendante dans l'ORG active de l'appelant : nouveau
-- propriétaire, active, non proposée, non mise à la une, sans token ni
-- historique d'envoi ni destinataire personnel. Statique → copie items ;
-- dynamique → conserve les filtres (résolution vive, pas de figeage). Les
-- items copiés restent soumis au filtre published-only à la LECTURE (§4) sur
-- la copie comme sur l'original : aucun risque supplémentaire à ne pas
-- filtrer la copie elle-même.
CREATE OR REPLACE FUNCTION api.duplicate_list(p_list_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, pg_temp AS $$
DECLARE
  v_src object_list;
  v_org text := api.current_user_org_id();
  v_new uuid;
BEGIN
  IF NOT COALESCE(api.user_can_use_list(p_list_id), FALSE) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'NO_ORG' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_src FROM object_list WHERE id = p_list_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  INSERT INTO object_list(
    org_object_id, created_by, kind, name, name_en, intro_fr, intro_en,
    template, accent, lang, cover_url, show_map, status, filters, filters_url
  ) VALUES (
    v_org, (SELECT auth.uid()), v_src.kind, v_src.name, v_src.name_en, v_src.intro_fr, v_src.intro_en,
    v_src.template, v_src.accent, v_src.lang, v_src.cover_url, v_src.show_map,
    'draft', v_src.filters, v_src.filters_url
  ) RETURNING id INTO v_new;

  IF v_src.kind = 'static' THEN
    INSERT INTO object_list_item(list_id, object_id, position, note_fr, note_en)
    SELECT v_new, i.object_id, i.position, i.note_fr, i.note_en
    FROM object_list_item i WHERE i.list_id = p_list_id;
  END IF;

  RETURN v_new;
END; $$;
REVOKE ALL ON FUNCTION api.duplicate_list(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.duplicate_list(uuid) TO authenticated, service_role;

-- =====================================================================
-- 16. Lien de partage — verrou AVANT décision, jamais un touch de l'horloge
-- =====================================================================
-- Accessible à tout utilisateur autorisé à UTILISER la liste (pas seulement
-- l'éditeur) : un lecteur d'une liste à la une peut obtenir/copier son lien.
-- Réutilise le lien actif SANS toucher son expiration. Peut générer le
-- PREMIER lien s'il n'en existe encore aucun. Un lien EXISTANT mais
-- désactivé/expiré n'est PAS réactivé ici, pour QUICONQUE : erreur claire
-- SHARE_NOT_AVAILABLE — un éditeur réactive via api.share_list, un geste
-- explicite et distinct. Verrou FOR UPDATE AVANT toute décision (§5 revue
-- architecte) : deux premiers partages concurrents doivent converger sur le
-- MÊME token, jamais sur deux tokens distincts qui s'écrasent l'un l'autre.
CREATE OR REPLACE FUNCTION api.ensure_list_share_link(p_list_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, pg_temp AS $$
DECLARE
  v_list   object_list;
  v_active boolean;
  v_token  text;
BEGIN
  PERFORM 1 FROM object_list WHERE id = p_list_id FOR UPDATE;
  IF NOT COALESCE(api.user_can_use_list(p_list_id), FALSE) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_list FROM object_list WHERE id = p_list_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  v_active := v_list.share_token IS NOT NULL
              AND v_list.share_enabled
              AND (v_list.share_expires_at IS NULL OR v_list.share_expires_at > now());

  IF v_active THEN
    RETURN json_build_object(
      'share_token', v_list.share_token,
      'share_url_path', '/l/' || v_list.share_token,
      'share_enabled', v_list.share_enabled,
      'share_expires_at', v_list.share_expires_at
    );
  END IF;

  IF v_list.share_token IS NULL THEN
    v_token := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
    UPDATE object_list SET
      share_token = v_token, share_enabled = TRUE, share_expires_at = NULL,
      status = CASE WHEN status = 'draft' THEN 'shared' ELSE status END
    WHERE id = p_list_id;
    RETURN json_build_object(
      'share_token', v_token, 'share_url_path', '/l/' || v_token,
      'share_enabled', TRUE, 'share_expires_at', NULL
    );
  END IF;

  RAISE EXCEPTION 'SHARE_NOT_AVAILABLE' USING ERRCODE = 'PT409';
END; $$;
REVOKE ALL ON FUNCTION api.ensure_list_share_link(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.ensure_list_share_link(uuid) TO authenticated, service_role;

-- =====================================================================
-- 17. Marquage « envoyée » — service_role UNIQUEMENT, nouvelle signature
-- =====================================================================
-- L'ANCIENNE signature (uuid) était grantée à `authenticated` : un client
-- pouvait donc se déclarer « envoyé » sans la moindre preuve d'acceptation
-- SMTP. DROP explicite (pas un CREATE OR REPLACE — la signature change, et un
-- simple REPLACE créerait une SURCHARGE co-existante avec l'ancienne forme,
-- ambiguë pour PostgREST).
DROP FUNCTION IF EXISTS api.mark_list_sent(uuid);

-- Vérifie que p_sender_id (fourni par la route serveur, PAS déduit d'un JWT —
-- service_role n'en a pas) est autorisé à UTILISER cette liste. §1 revue
-- architecte : `created_by` ne porte aucune FK et survit à la suppression
-- d'un compte — les bras propriétaire/à-la-une exigent désormais
-- EXPLICITEMENT `internal.org_membership_active(p_user_id, org)` (existence
-- ET adhésion active) AVANT d'être considérés, jamais un simple
-- `created_by = p_user_id`. Le bras orpheline revérifie déjà l'adhésion active
-- du SENDER via internal.org_is_admin (rang scopé §2). Le bras superuser
-- passe par app_user_profile.role (jamais auth.role(), qui vaudrait TRUE pour
-- la clé service_role elle-même).
CREATE OR REPLACE FUNCTION internal.list_sender_authorized(p_list_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, pg_temp AS $$
  SELECT COALESCE(
    p_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM object_list l
      WHERE l.id = p_list_id
        AND (
          (
            internal.org_membership_active(p_user_id, l.org_object_id)
            AND (l.created_by = p_user_id OR l.is_featured)
          )
          OR (
            internal.org_is_admin(p_user_id, l.org_object_id)
            AND NOT internal.org_membership_active(l.created_by, l.org_object_id)
          )
          OR EXISTS (
            SELECT 1 FROM app_user_profile ap
            WHERE ap.id = p_user_id AND ap.role IN ('owner','super_admin')
          )
        )
    ),
    FALSE
  );
$$;
REVOKE ALL ON FUNCTION internal.list_sender_authorized(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION internal.list_sender_authorized(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION api.mark_list_sent(p_list_id uuid, p_sender_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, auth, pg_temp AS $$
BEGIN
  IF NOT COALESCE(internal.list_sender_authorized(p_list_id, p_sender_id), FALSE) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  -- Envoi réussi = activité (règle 3 du cadrage) : reporte l'échéance.
  UPDATE object_list
     SET last_sent_at = now(), status = 'sent', last_activity_at = now()
   WHERE id = p_list_id;
END; $$;
COMMENT ON FUNCTION api.mark_list_sent(uuid, uuid) IS
  'Suivi serveur après acceptation SMTP (route /api/lists/send), service_role '
  'UNIQUEMENT. Remplace api.mark_list_sent(uuid) (grantée à authenticated), '
  'révoquée : un client ne peut plus se déclarer « envoyé » sans preuve. '
  'p_sender_id est vérifié contre internal.list_sender_authorized — existence '
  'du profil ET adhésion active exigées AVANT tout bras propriétaire/featured.';
REVOKE ALL ON FUNCTION api.mark_list_sent(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api.mark_list_sent(uuid, uuid) TO service_role;

-- =====================================================================
-- 18. Purge annuelle — interne, quotidienne, idempotente
-- =====================================================================
-- REVOKE ALL FROM PUBLIC seul suffit : ni anon, ni authenticated, ni
-- service_role n'héritent d'un GRANT PUBLIC explicitement retiré, et aucun
-- GRANT direct n'est posé ailleurs — fonction inaccessible à TOUT client.
-- pg_cron exécute les jobs directement côté serveur (pas par PostgREST) :
-- aucun GRANT n'est requis pour qu'un job planifié l'appelle.
--
-- Concurrence (§5) : un simple DELETE avec le prédicat d'éligibilité dans son
-- WHERE re-vérifie ce prédicat contre la DERNIÈRE version de chaque ligne au
-- moment de l'écriture (EvalPlanQual de PostgreSQL) — si un envoi/une
-- modification concurrente a fait avancer last_activity_at APRÈS le snapshot
-- initial du DELETE mais AVANT son verrou de ligne, cette ligne plus tard
-- éligible est silencieusement exclue, sans code applicatif dédié. C'est le
-- sens de « revérifiées sous verrou » du contrat : le verrou est celui du
-- DELETE lui-même, pas un LOCK explicite supplémentaire. Point préservé tel
-- quel par la revue architecte.
CREATE OR REPLACE FUNCTION internal.purge_expired_lists()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, internal, pg_temp AS $$
DECLARE v_count int;
BEGIN
  DELETE FROM object_list
   WHERE NOT is_featured
     AND last_activity_at <= now() - interval '1 year';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $$;
-- REVOKE explicite des TROIS rôles clients, pas seulement PUBLIC (2e revue
-- architecte §5) : défense en profondeur — un GRANT direct oublié plus tard
-- sur l'un des trois ne suffirait pas à réouvrir l'accès si quelqu'un
-- rejoue cette ligne.
REVOKE ALL ON FUNCTION internal.purge_expired_lists() FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION internal.purge_expired_lists() IS
  'Purge annuelle des listes NON mises à la une, inactives depuis 1 an '
  '(last_activity_at). Cascade object_list_item (FK ON DELETE CASCADE) : les '
  'items disparaissent, jamais les fiches touristiques/media. Inaccessible à '
  'tout client (REVOKE ALL FROM PUBLIC, aucun GRANT posé) ; exécutée par le '
  'cron quotidien purge-expired-lists (voir docs/listes-cycle-vie.md).';

-- Enregistrement idempotent du job, UNIQUEMENT si pg_cron est installé sur la
-- cible (même garde/style que maintenance.sql — contrôle par nom de job).
-- Aucune purge n'est exécutée par cette migration elle-même.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-expired-lists') THEN
      PERFORM cron.schedule(
        'purge-expired-lists',
        '0 4 * * *',
        $cron$SELECT internal.purge_expired_lists()$cron$
      );
    END IF;
  ELSE
    RAISE NOTICE 'pg_cron extension non installee — job purge-expired-lists non planifie (voir docs/listes-cycle-vie.md).';
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'table cron.job indisponible — job purge-expired-lists non planifie.';
END $$;

-- =====================================================================
-- 19. Reload PostgREST
-- =====================================================================
NOTIFY pgrst, 'reload schema';
