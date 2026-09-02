-- test_actor_portal.sql
-- Prouve migration_actor_portal.sql (manifeste 18a, spec 2026-09-01-portail-acteur-design.md) :
--   (A) PERSONA — le CHECK app_user_profile.role accepte 'actor' (et garde NULL + les 3 valeurs
--       historiques) ; api.is_actor_persona() rend TRUE pour un profil 'actor', FALSE pour un
--       tourism_agent, FALSE hors contexte HTTP (COALESCE §204) ; api.current_user_actor_id()
--       rend l'actor_id du profil, NULL sinon.
--   (B) PORTÉE — api.current_user_portal_object_ids() : lien valide ⇒ objet présent ; lien
--       expiré (valid_to hier) ⇒ absent ; lien futur (valid_from demain) ⇒ absent ; objet ORG
--       ⇒ absent ; et SURTOUT le pont e-mail ne joue PAS (un acteur persona dont l'e-mail
--       matche un AUTRE acteur ne voit pas les objets de cet autre acteur). Pour la persona
--       acteur, current_user_extended_object_ids() ≡ portal_object_ids (bras 1b fermé : le
--       rôle d'acteur sur une ORG ne donne PLUS les fiches de l'ORG). Pour un tourism_agent,
--       les 5 bras historiques sont inchangés (régression bloc I, Task 8).
--   (C) D7 — api.is_object_owner(p_object_id) : un lien actor_object_role.is_primary=TRUE ne
--       donne JAMAIS l'écriture canonique à une persona acteur (ni user_can_write_object_canonical,
--       qui en dérive) ; le chemin owner HISTORIQUE reste ouvert pour un non-acteur (tourism_agent)
--       dont l'e-mail matche un lien primaire — D7 ferme seulement la persona acteur, pas le reste.
--   (D1) DDL — fiche_submission, pending_change.submission_id et org_actor_module_visibility
--       existent ; chk_app_notification_kind admet 'fiche_submission_reviewed' ; l'index unique
--       partiel anti-doublon (uq_fiche_submission_open) existe ; et la RLS/REVOKE ferme les DEUX
--       tables sensibles à TOUT authenticated, en lecture ET en écriture, persona acteur comme
--       persona éditeur — pas seulement « la table existe ».
--   (E) VÉRIFICATEURS — api.list_object_verifier_ids(p_object_id) : les membres actifs d'une
--       ORG publisher de l'objet dont le rôle métier confère validate_changes (matrice 17i) OU
--       qui tiennent le grant individuel sont vérificateurs ; un viewer sans droit ne l'est PAS ;
--       un rang admin (user_org_admin_role) N'EST JAMAIS vérificateur, même en repli — FAIT
--       vérifié en base : user_has_permission (donc user_can_moderate_object) ignore cette
--       table ; repli = superutilisateurs plateforme UNIQUEMENT, sinon liste VIDE. Invariant
--       sondé en boucle : tout id rendu doit satisfaire user_can_moderate_object (nominal ET
--       repli) — c'est cette boucle qui aurait attrapé le défaut du repli par rang admin.
--   (H) VISIBILITÉ — api.get_portal_section_visibility / api.get_actor_section_visibility : le
--       plancher dur (legal…) est toujours annoncé ; sans ligne en base, un module est visible
--       par défaut (jamais NULL) ; hors portée ⇒ 42501 ; get_actor_section_visibility refuse un
--       non-membre de l'ORG même s'il est légitimement scopé côté portail ; l'écriture
--       (rpc_set_actor_section_visibility) exige un rang admin >= 30 sur l'ORG et refuse
--       TOUJOURS le plancher dur — dans les DEUX sens (ouvrir ET fermer), sans jamais y laisser
--       de ligne ; le masquage configuré par l'ORG remonte bien côté vue portail.
--   (D2) SUBMIT_ACTOR_FICHE — api.submit_actor_fiche(p_object_id, p_changes, p_note) : le geste
--       transactionnel « Soumettre pour vérification » (soumission + N pending_change + tâche
--       multi-assignée + notifications, en UNE transaction). Refus prouvés un par un : persona
--       non-acteur, fiche hors portée, tableau de changements vide, plafond de 40 changements
--       dépassé, module du plancher dur, module masqué par la matrice (H), writer hors whitelist
--       §120 (cas générique ET cas ÉPINGLÉ save_object_rooms — CORRECTION CONTRÔLEUR : la
--       whitelist vive de approve_pending_change, re-vérifiée en base avant écriture, n'a que
--       SEPT entrées, SANS save_object_rooms — une asymétrie aurait laissé entrer un changement
--       ensuite impossible à approuver, fiche bloquée à vie). TRANSACTIONNALITÉ prouvée : un
--       writer interdit sur le 3e changement d'un tableau de 3 ne laisse NI fiche_submission, NI
--       pending_change, NI crm_task, NI crm_task_assignee, NI notification — même si les 2
--       premiers changements étaient valides pris isolément. Nominal : 2 changements ⇒
--       submission pending + 2 pending_change liés (submission_id) + 1 crm_task typée
--       (extra.kind='fiche_verification') multi-assignée (editor + granted, ≥2) + notification
--       crm_task_assigned + trigger is_editing. COURSE (revue post-Task 5) : le pré-check
--       EXISTS est un check-then-act — un trigger BEFORE INSERT éphémère injecte la ligne
--       « concurrente » entre le pré-check et l'INSERT réel de submit_actor_fiche (le
--       pré-check ne peut PAS la voir), prouvant que l'écriture elle-même est blindée
--       (BEGIN…EXCEPTION WHEN unique_violation…) et remonte PT409, jamais un 23505 nu — et
--       qu'aucune ligne (ni la vraie, ni l'injectée) ne survit à l'échec. Anti-spam : une
--       soumission déjà ouverte refuse la suivante en PT409 SPÉCIFIQUEMENT (jamais le 23505
--       nu de l'index unique partiel — piège nommé par le PO : db-error-message.ts
--       afficherait « doublon » au lieu de « vérification déjà en cours »).
--   (G) LECTURES ACTEUR — api.list_my_portal_fiches / api.list_my_submissions /
--       api.get_my_actor_profile : RPCs auto-scopées (jamais de paramètre destinataire — le
--       compte appelant EST le périmètre, doctrine notifications). ISOLEMENT prouvé dans les
--       DEUX sens : v_actor1 ne voit ni la fiche de l'acteur piège v_actor2 (v_objD) ni celle de
--       v_actor3 (v_objE, bloc C) ; symétriquement v_actor3 ne voit QUE v_objE. Lien expiré/futur
--       et objet ORG absents du RPC FINAL (pas seulement de la fonction ensembliste, bloc B) ;
--       portée de v_actor1 close à EXACTEMENT 2 fiches (v_objA + v_objF), ni plus ni moins.
--       DOUBLON DE RÔLES (constat de revue Task 1, ordonné ici) : api.current_user_portal_
--       object_ids() n'avait pas de DISTINCT — un acteur tenant DEUX rôles actor_object_role
--       valides sur la MÊME fiche la faisait sortir deux fois ; corrigé à la source (§1), prouvé
--       en DEUX endroits (la fonction ensembliste ET le RPC json final) pour isoler la cause de
--       sa conséquence visible. CANAUX PUBLICS DE L'OFFICE (D11, office_email/office_phone) : un
--       canal is_public=FALSE ne sort JAMAIS, même mieux placé sur tout autre critère (fuite de
--       PII sinon — piège posé exprès dans la fixture) ; primaire avant secondaire ; 'phone'
--       avant 'mobile' MÊME à position d'insertion défavorable (le tri par position seul
--       mordrait le mauvais côté) ; cas NULL EXPLICITE (clé jsonb présente, valeur JSON null)
--       quand l'ORG publisher ne porte aucun canal — le cas réellement constaté en production le
--       2026-09-02, pas un cas de bord théorique. list_my_submissions : 'section' = le module id
--       STABLE (metadata->>'section'), jamais 'field' (le libellé lisible, D12) — vérifié en
--       comparant les DEUX valeurs, pas en supposant que la bonne colonne a été lue ; p_object_id
--       filtre STRICTEMENT (la soumission de v_objA n'apparaît pas sous v_objB, même acteur —
--       sans quoi une rubrique « en vérification » resterait affichée sur la mauvaise fiche d'un
--       prestataire multi-fiches). Les invariants PII du bloc D restent vrais pour la persona
--       acteur : aucun gate interne (edit/contacts/search_actors) ne s'ouvre. Les TROIS RPCs
--       refusent identiquement un non-acteur (42501, périmètre jamais élargi par défaut).
--   (F2) D9 — VALIDER TOUT OU PARTIE. Le comportement VIF d'api.approve_pending_change sur une
--       ligne `rpc: null` est d'abord ÉTABLI, pas supposé : refus inconditionnel en 22023, sans
--       aucune écriture — la ligne ne sortait donc JAMAIS de « pending », et comme 5 des 7
--       rubriques du portail sont manual_apply, la soumission ne pouvait jamais se résoudre et
--       uq_fiche_submission_open bloquait la fiche à vie. §7 ouvre une
--       branche ATTESTÉE : rpc NULL + p_applied_manually ⇒ 'approved' (jamais 'applied'),
--       applied_at NULL, AUCUN re-dispatch (prouvé : rien n'est écrit dans object_description),
--       et une TRACE EXPLICITE metadata.applied_manually/attested_by/attested_at — parce que
--       « la machine a écrit » et « un humain déclare avoir écrit » ne doivent pas se confondre
--       dans l'audit, et parce qu'un fait dérivé (status+applied_at) s'efface au premier
--       remaniement. Anti-escalade : l'attestation NE contourne ni la garde de modération
--       (v_viewer et v_orgadm — rang admin >= 30, §227 — refusés en 42501 sur les CINQ gestes)
--       ni la whitelist (un writer réel hors liste reste refusé même « attesté »). Les QUATRE
--       issues d'une soumission sont prouvées sur leur composition de lignes — l'entrée exacte
--       du trigger de résolution (Task 8, qui seul pose le statut agrégé) : partielle
--       (1 approuvé + 1 rejeté, avec le détail PAR SECTION relu côté prestataire via
--       list_my_submissions), tout approuvé (2 applied), tout rejeté (2 rejected, ligne
--       manual_apply comprise — un refus n'a jamais eu besoin de writer), et surtout PARTIEL
--       INACHEVÉ : p_include_manual=FALSE saute la ligne manuelle, il reste 1 pending, la
--       soumission NE se résout PAS et le verrou « une seule vérification ouverte » TIENT
--       (PT409 sur une nouvelle soumission) — sinon l'acteur rouvrirait pendant que l'office
--       travaille. Motif de refus OBLIGATOIRE (NULL et blancs refusés, sondés avec les droits et
--       sur une soumission valide). Gardes des RPC groupés isolées sur une soumission SANS ligne
--       pending — sans leur garde propre, une boucle vide rendrait un succès à qui n'a aucun
--       droit. NON-RÉGRESSION §120/§122 : l'appel historique à DEUX arguments sur une ligne sans
--       submission_id rend toujours 'applied' + applied_at, sans estampille d'attestation ; et
--       une telle ligne reste listée par list_pending_changes (jointure soumission LEFT, jamais
--       INNER — un INNER effacerait la file de modération existante en silence).
--       Revue 2026-09-02 : la colonne manual_apply de list_pending_changes projette désormais
--       le prédicat de la MACHINE (metadata->>'rpc' IS NULL) et non la DÉCLARATION du
--       soumetteur — deux lignes pièges le prouvent : une sans writer déclarée
--       manual_apply=false (que la file annonçait « automatique », rouvrant la panne que D9
--       ferme) et une à valeur aberrante ('oui') qui, sous un cast nu, abattrait la LECTURE
--       ENTIÈRE de la file en 22P02 (classe §17m) ; submit_actor_fiche retire les trois clés
--       d'attestation de l'enveloppe de l'acteur, sondé sur une fixture qui les FORGE au nom
--       d'un modérateur ; le CONTENU de la whitelist est épinglé côté approve
--       (save_object_rooms refusé, miroir exact de D2) ; la garde de modération est
--       fail-closed sur une ligne à object_id NULL (user_can_moderate_object y rend NULL,
--       pas FALSE) ; et le motif de refus reste obligatoire sur une boucle VIDE, seul endroit
--       où le contrôle propre à reject_fiche_submission peut mordre.
-- Blocs suivants ajoutés par les tasks suivantes du même chantier.
-- Contre une base sans la migration : échec immédiat (fonctions absentes) — rouge attendu (TDD).
-- Auto-contenu + transactionnel (ROLLBACK ; rien ne persiste). Plage de fixtures dédiée 13xx
-- (+ 1410-1419 pour le bloc G, task 6 ; + 1420-1429 pour le bloc F2, task 7).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_orgA    text := 'ORGRUN9999991301';
  v_objA    text := 'HOTRUN9999991311'; -- lien acteur valide
  v_objB    text := 'HOTRUN9999991312'; -- lien expiré
  v_objC    text := 'HOTRUN9999991313'; -- lien futur
  v_objD    text := 'HOTRUN9999991314'; -- fiche de l'ORG (bras 1b) — ne doit PAS être visible
  v_actor1  uuid := '00000000-0000-4000-a000-000000001321'; -- l'acteur du portail
  v_actor2  uuid := '00000000-0000-4000-a000-000000001322'; -- un AUTRE acteur (piège e-mail)
  v_user    uuid := '00000000-0000-4000-a000-000000001301'; -- compte portail (role actor)
  v_agent   uuid := '00000000-0000-4000-a000-000000001302'; -- témoin tourism_agent
  v_objE    text := 'HOTRUN9999991391'; -- (C) objet DÉDIÉ D7, hors piège e-mail du bloc B
  v_actor3  uuid := '00000000-0000-4000-a000-000000001392'; -- (C) acteur DÉDIÉ D7, détient v_objE
  v_user2   uuid := '00000000-0000-4000-a000-000000001393'; -- (C) compte portail DÉDIÉ D7 (persona actor)
  v_role_op uuid;
  v_pub     uuid;
  v_email_kind uuid;
  v_denied  boolean; -- (D1) sonde REVOKE/RLS : TRUE si insufficient_privilege a bien été levée.
  -- (E/H) comptes DÉDIÉS Task 4 — sous-plage …001303-…001307, disjointe de 1301-1302 (A) et
  -- 1391-1393 (C). Aucun nouvel objet/acteur : E et H réutilisent v_orgA/v_objA/v_objD (B).
  v_editor  uuid := '00000000-0000-4000-a000-000000001303'; -- rôle métier editor (matrice)
  v_viewer  uuid := '00000000-0000-4000-a000-000000001304'; -- viewer sans permission
  v_granted uuid := '00000000-0000-4000-a000-000000001305'; -- grant individuel validate_changes
  v_orgadm  uuid := '00000000-0000-4000-a000-000000001306'; -- rang admin SANS validate_changes — n'est JAMAIS vérificateur (ruling post-revue)
  v_super   uuid := '00000000-0000-4000-a000-000000001307'; -- superuser plateforme — SEULE population de repli retenue
  v_role_editor uuid;
  v_role_viewer uuid;
  v_perm_validate uuid;
  v_adm_role uuid;
  v_m1 uuid; v_m2 uuid; v_m3 uuid; v_m4 uuid;
  v_vis jsonb;
  v_verifier_id    uuid;    -- (E) itérateur de l'invariant user_can_moderate_object
  v_verifier_count integer; -- (E) cardinalité exacte attendue à chaque étape (discriminant)
  v_floor_mod      text;    -- (H) itérateur sur les 9 modules du plancher dur
  v_real_super_count integer; -- (E) superusers RÉELS déjà en base (repli non scopé — jamais 0 en prod)
  -- (D2) submit_actor_fiche — DECLARE additionnels (task-5). Aucun nouvel id de fixture réservé :
  -- D2 réutilise EXCLUSIVEMENT v_user/v_agent/v_objA/v_objD (A/B) et v_editor/v_granted (E), plus
  -- le masquage 'descriptions' posé sur v_orgA/'HOT' par H (dont v_objA dépend) — la sous-plage
  -- 13xx n'est donc PAS étendue par ce bloc.
  v_sub     jsonb; -- retour de submit_actor_fiche (nominal)
  v_changes jsonb; -- le tableau de changements nominal (2 entrées), réutilisé par l'anti-spam
  v_task    uuid;  -- task_id retourné
  v_subid   uuid;  -- submission_id retourné
  -- (D2, revue post-Task 5) preuve anti-course : compteur IMMUNISÉ au ROLLBACK TO SAVEPOINT
  -- (propriété documentée des séquences Postgres), contrairement au GUC bertel_test.race_armed
  -- que le blindage EXCEPTION WHEN unique_violation annule LUI-MÊME en réussissant (voir
  -- commentaire au point d'usage).
  v_seq_before bigint;
  v_seq_after  bigint;
  -- (G) lectures acteur — DECLARE additionnels (task-6). Sous-plage de fixtures RÉSERVÉE :
  -- 1410-1419, disjointe de 1301-1307 (A/E/H) / 1311-1314 (B) / 1321-1322 (B) / 1391-1393 (C).
  -- Le reste du bloc G réutilise EXCLUSIVEMENT v_user/v_actor1/v_objA/v_objB/v_objC/v_objD (A/B),
  -- v_user2/v_actor3/v_objE (C), v_subid/v_task (D2, la soumission nominale à 2 changements) et
  -- les réf. déjà résolues (v_role_op, v_pub, v_email_kind) — aucun autre id n'est réservé.
  v_orgB        text := 'ORGRUN9999991411'; -- (G) ORG SANS canal — cas NULL office_email/phone
  v_objF        text := 'HOTRUN9999991412'; -- (G) fiche liée à v_orgB, dans la portée de v_actor1
  v_role_sales  uuid; -- (G) SECOND rôle valide sur v_objA — fixture du doublon de rôles (Task 1)
  v_phone_kind  uuid; -- (G) ref_code_contact_kind['phone']
  v_mobile_kind uuid; -- (G) ref_code_contact_kind['mobile']
  v_fiches      jsonb; -- (G) retour list_my_portal_fiches, capturé une fois par persona
  v_f           jsonb; -- (G) élément unique extrait de v_fiches (une fiche)
  v_dup_count   integer; -- (G) cardinalité brute de current_user_portal_object_ids() pour v_objA
  -- (F2) D9 — DECLARE additionnels (task-7). Sous-plage de fixtures RÉSERVÉE : 1420-1429,
  -- disjointe de 1301-1307 (A/E/H) / 1311-1314 (B) / 1321-1322 (B) / 1391-1393 (C) /
  -- 1410-1419 (G). TROIS fiches neuves sont ici structurellement nécessaires, pas un confort :
  -- uq_fiche_submission_open n'autorise QU'UNE soumission ouverte par fiche, et ce qui libère
  -- ce verrou — fiche_submission.status ≠ 'pending' — est posé par le TRIGGER de résolution de
  -- la Task 8, qui n'existe pas encore. Deux soumissions successives sur la MÊME fiche
  -- partiraient donc en PT409 : chaque issue à prouver exige SA fiche.
  v_objG    text := 'HOTRUN9999991421'; -- (F2) issue « tout approuvé »    — 2 changements auto
  v_objH    text := 'HOTRUN9999991422'; -- (F2) issue « tout rejeté »      — 1 auto + 1 manuel
  v_objI    text := 'HOTRUN9999991423'; -- (F2) issue « partiel INACHEVÉ » — le verrou doit TENIR
  v_pc_manual uuid; -- (F2) la ligne manual_apply (rpc NULL) de la soumission nominale D2
  v_pc_auto   uuid; -- (F2) la ligne auto (save_object_openings) de la même soumission
  v_pc_escal  uuid; -- (F2) ligne PIÈGE : writer réel hors whitelist — l'attestation ne l'ouvre PAS
  v_pc_legacy uuid; -- (F2) ligne §120/§122 SANS submission_id — preuve de non-régression
  v_subG      uuid; -- (F2) soumission de v_objG
  v_subH      uuid; -- (F2) soumission de v_objH
  v_subI      uuid; -- (F2) soumission de v_objI
  v_res2      jsonb;   -- (F2) retours des RPC D9
  v_msg       text;    -- (F2) SQLERRM capturé — preuve des accents restaurés dans les messages
  v_persona   uuid;    -- (F2) itérateur des personas SANS droit de modération
  v_detail    jsonb;   -- (F2) le détail PAR SECTION relu côté prestataire (list_my_submissions)
  v_pc_poison uuid;    -- (F2) ligne à metadata.manual_apply ABERRANT — la file doit rester lisible
  v_pc_decl   uuid;    -- (F2) ligne SANS writer mais déclarée manual_apply=false (les deux se contredisent)
  v_pc_rooms  uuid;    -- (F2) épinglage du CONTENU de la whitelist côté approve (save_object_rooms)
  v_lp_count  integer; -- (F2) cardinalité de la file — sonde de LISIBILITÉ totale (anti-22P02)
  v_pc_orphan uuid;    -- (F2) ligne à object_id NULL — la garde doit être fail-closed
  v_pending_left integer; -- (F2) lignes encore en attente — ce qui EMPÊCHE la résolution
BEGIN
  -- ---------- (A) CHECK + helpers ----------
  INSERT INTO auth.users (id, email) VALUES
    (v_user, 'portal_actor_1301@test.local'), (v_agent, 'portal_agent_1302@test.local')
    ON CONFLICT (id) DO NOTHING;
  -- Le CHECK doit accepter 'actor' — c'est le cœur de la migration : rouge avant elle.
  INSERT INTO app_user_profile (id, role) VALUES (v_user, 'actor')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO app_user_profile (id, role) VALUES (v_agent, 'tourism_agent')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

  -- ---------- Fixture objets / acteurs / liens (owner, RLS bypass) ----------
  SELECT id INTO v_pub FROM ref_org_role WHERE code = 'publisher' LIMIT 1;
  IF v_pub IS NULL THEN RAISE EXCEPTION 'fixture: ref_org_role[publisher] manquant'; END IF;
  SELECT id INTO v_role_op FROM ref_actor_role WHERE code = 'operator' LIMIT 1;
  IF v_role_op IS NULL THEN RAISE EXCEPTION 'fixture: ref_actor_role[operator] manquant'; END IF;
  SELECT id INTO v_email_kind FROM ref_code_contact_kind WHERE code = 'email' LIMIT 1;
  IF v_email_kind IS NULL THEN RAISE EXCEPTION 'fixture: ref_code_contact_kind[email] manquant'; END IF;

  INSERT INTO object (id, object_type, name, status) VALUES
    (v_orgA, 'ORG', 'ORG portail test', 'published'),
    (v_objA, 'HOT', 'Hôtel lien valide', 'draft'),
    (v_objB, 'HOT', 'Hôtel lien expiré', 'published'),
    (v_objC, 'HOT', 'Hôtel lien futur', 'published'),
    (v_objD, 'HOT', 'Hôtel de l''ORG', 'draft')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO object_org_link (object_id, org_object_id, role_id) VALUES
    (v_objA, v_orgA, v_pub), (v_objB, v_orgA, v_pub), (v_objC, v_orgA, v_pub), (v_objD, v_orgA, v_pub)
    ON CONFLICT DO NOTHING;

  INSERT INTO actor (id, display_name) VALUES
    (v_actor1, 'Acteur Portail 1301'), (v_actor2, 'Acteur Piège 1302')
    ON CONFLICT (id) DO NOTHING;
  -- Piège du pont e-mail : l'e-mail du COMPTE portail est enregistré comme canal de
  -- l'AUTRE acteur. Sous le pont historique (user_actor_ids), ce compte verrait les
  -- objets de v_actor2 ; sous la portée portail (actor_id explicite), il ne doit PAS.
  INSERT INTO actor_channel (actor_id, kind_id, value) VALUES
    (v_actor2, v_email_kind, 'portal_actor_1301@test.local')
    ON CONFLICT DO NOTHING;

  -- Le lien explicite compte↔acteur (la source de vérité du portail).
  UPDATE app_user_profile SET actor_id = v_actor1 WHERE id = v_user;

  INSERT INTO actor_object_role (actor_id, object_id, role_id, is_primary, valid_from, valid_to) VALUES
    (v_actor1, v_objA, v_role_op, TRUE,  NULL,                        NULL),
    (v_actor1, v_objB, v_role_op, FALSE, NULL,                        CURRENT_DATE - 1),
    (v_actor1, v_objC, v_role_op, FALSE, CURRENT_DATE + 1,            NULL),
    (v_actor1, v_orgA, v_role_op, FALSE, NULL,                        NULL), -- rôle sur l'ORG (bras 1b)
    (v_actor2, v_objD, v_role_op, TRUE,  NULL,                        NULL)  -- objet de l'acteur piège
    ON CONFLICT DO NOTHING;

  -- ---------- (A) suite : helpers sous la persona acteur ----------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated', 'email', 'portal_actor_1301@test.local')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT api.is_actor_persona() = TRUE,  'A: is_actor_persona doit être TRUE pour role=actor';
    ASSERT api.current_user_actor_id() = v_actor1, 'A: current_user_actor_id doit rendre l''actor_id du profil';
  RESET ROLE;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_agent, 'role', 'authenticated', 'email', 'portal_agent_1302@test.local')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT api.is_actor_persona() = FALSE, 'A: is_actor_persona doit être FALSE pour un tourism_agent';
    ASSERT api.current_user_actor_id() IS NULL, 'A: current_user_actor_id NULL sans lien';
  RESET ROLE;

  -- Hors contexte HTTP : fail-closed, jamais NULL (§204).
  PERFORM set_config('request.jwt.claims', NULL, true);
  ASSERT api.is_actor_persona() = FALSE, 'A: is_actor_persona hors HTTP doit être FALSE (COALESCE)';

  -- ---------- (B) portée portail ----------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated', 'email', 'portal_actor_1301@test.local')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT EXISTS (SELECT 1 FROM api.current_user_portal_object_ids() s WHERE s = v_objA),
           'B: lien valide ⇒ objet dans la portée';
    ASSERT NOT EXISTS (SELECT 1 FROM api.current_user_portal_object_ids() s WHERE s = v_objB),
           'B: lien EXPIRÉ ⇒ hors portée';
    ASSERT NOT EXISTS (SELECT 1 FROM api.current_user_portal_object_ids() s WHERE s = v_objC),
           'B: lien FUTUR ⇒ hors portée';
    ASSERT NOT EXISTS (SELECT 1 FROM api.current_user_portal_object_ids() s WHERE s = v_orgA),
           'B: un objet ORG n''entre jamais dans la portée portail';
    ASSERT NOT EXISTS (SELECT 1 FROM api.current_user_portal_object_ids() s WHERE s = v_objD),
           'B: le pont e-mail ne joue PAS — l''objet de l''acteur homonyme d''e-mail est hors portée';
    -- Le branchement : pour la persona acteur, la fonction ÉTENDUE ≡ la portée portail.
    ASSERT NOT EXISTS (SELECT 1 FROM api.current_user_extended_object_ids() s WHERE s = v_objD),
           'B: extended (persona acteur) ne doit PAS emprunter le pont e-mail';
    ASSERT NOT EXISTS (SELECT 1 FROM api.current_user_extended_object_ids() s WHERE s = v_objB),
           'B: extended (persona acteur) exclut les liens expirés';
    ASSERT EXISTS (SELECT 1 FROM api.current_user_extended_object_ids() s WHERE s = v_objA),
           'B: extended (persona acteur) contient la fiche liée — y compris en DRAFT';
    -- La lecture RLS suit : la fiche draft liée est lisible, celle du piège non.
    ASSERT (SELECT count(*) FROM object WHERE id = v_objA) = 1,
           'B: la policy object laisse lire la fiche draft liée';
    ASSERT (SELECT count(*) FROM object WHERE id = v_objD) = 0,
           'B: la policy object ne fuit pas la fiche draft de l''acteur piège';
  RESET ROLE;

  -- ---------- (C) D7 : lien primaire + persona acteur ⇒ AUCUNE écriture canonique ----------
  -- Fixture DÉDIÉE au bloc C (v_objE/v_actor3/v_user2, 1391-1393) — AUCUNE ligne des blocs A/B
  -- n'est modifiée (les blocs D..I s'appuient dessus, et le piège e-mail du bloc B est
  -- lui-même une assertion qui doit perdurer). Nécessaire : sous le fixture du bloc B, le pont
  -- e-mail (api.user_actor_ids) fait résoudre v_user vers v_actor2, PAS vers v_actor1 — donc
  -- is_object_owner(v_objA) pour v_user est déjà FALSE AVANT la §2, pour une raison étrangère
  -- à D7 (l'assertion ne « mordrait » pas — constaté empiriquement lors de la revue, corrigé
  -- ici ; cf. task-2-report.md § « Correction post-revue »). Ici l'e-mail du compte v_user2 est
  -- le canal DIRECT de SON PROPRE acteur v_actor3 (pas de piège) : le scénario réel que D7 doit
  -- fermer — persona acteur + is_primary=TRUE ⇒ TRUE avant la §2, FALSE après.
  -- RESET ROLE (bloc B) restaure le rôle Postgres mais PAS le GUC request.jwt.claims : sans ce
  -- nettoyage, le trigger enforce_app_user_profile_role_change confond ces INSERT (rôle
  -- privilégié) avec une session 'authenticated' résiduelle du dernier persona testé. Même
  -- geste que le cas « hors HTTP » du bloc A ci-dessus.
  PERFORM set_config('request.jwt.claims', NULL, true);
  INSERT INTO auth.users (id, email) VALUES (v_user2, 'portal_actor_1393@test.local')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role) VALUES (v_user2, 'actor')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO object (id, object_type, name, status) VALUES (v_objE, 'HOT', 'Hôtel D7 (bloc C)', 'draft')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO actor (id, display_name) VALUES (v_actor3, 'Acteur D7 (bloc C)')
    ON CONFLICT (id) DO NOTHING;
  -- L'UPDATE référence v_actor3 (FK app_user_profile_actor_id_fkey) : DOIT suivre l'INSERT actor.
  UPDATE app_user_profile SET actor_id = v_actor3 WHERE id = v_user2;
  INSERT INTO actor_channel (actor_id, kind_id, value) VALUES
    (v_actor3, v_email_kind, 'portal_actor_1393@test.local')
    ON CONFLICT DO NOTHING;
  INSERT INTO actor_object_role (actor_id, object_id, role_id, is_primary) VALUES
    (v_actor3, v_objE, v_role_op, TRUE)
    ON CONFLICT DO NOTHING;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user2, 'role', 'authenticated', 'email', 'portal_actor_1393@test.local')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT api.is_object_owner(v_objE) = FALSE,
           'C: is_object_owner doit être FALSE pour une persona acteur titulaire d''un lien primaire (D7)';
    ASSERT api.user_can_write_object_canonical(v_objE) = FALSE,
           'C: user_can_write_object_canonical doit suivre (aucun autre bras ne s''ouvre)';
  RESET ROLE;

  -- Témoin de non-régression (renforcé, 2 objets, MÊME compte v_agent) : un tourism_agent
  -- dont l'e-mail de session bridge vers un acteur titulaire d'un lien primaire GARDE le
  -- chemin historique — D7 ne ferme QUE la persona acteur, jamais le mécanisme lui-même.
  -- Deux e-mails de session DISTINCTS pour le MÊME v_agent (le trigger
  -- prevent_duplicate_actor_email interdit qu'un seul e-mail bridge vers deux acteurs
  -- différents — constaté empiriquement) : le premier prouve sur v_objE, le MÊME objet que
  -- le refus ci-dessus (une fonction qui refuserait tout le monde échouerait ici) ; le second,
  -- l'e-mail RÉEL de v_agent (auth.users), prouve sur v_objA (bloc B) comme témoin historique.
  INSERT INTO actor_channel (actor_id, kind_id, value) VALUES
    (v_actor3, v_email_kind, 'portal_agent_1302_objE@test.local')
    ON CONFLICT DO NOTHING;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_agent, 'role', 'authenticated', 'email', 'portal_agent_1302_objE@test.local')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT api.is_object_owner(v_objE) = TRUE,
           'C: le chemin owner HISTORIQUE reste ouvert pour un non-acteur, même objet que le refus D7';
  RESET ROLE;

  INSERT INTO actor_channel (actor_id, kind_id, value) VALUES
    (v_actor1, v_email_kind, 'portal_agent_1302@test.local')
    ON CONFLICT DO NOTHING;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_agent, 'role', 'authenticated', 'email', 'portal_agent_1302@test.local')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT api.is_object_owner(v_objA) = TRUE,
           'C: le chemin owner HISTORIQUE reste ouvert pour un non-acteur (équipes internes)';
  RESET ROLE;

  -- ---------- (D1) DDL : tables + contraintes clés ----------
  -- Aucune fixture nouvelle : réutilise v_agent/v_user (1301/1302) déjà déclarés — ce bloc
  -- teste la structure DDL/RLS, pas un contenu métier. Les valeurs 'zz-noop-d1' ci-dessous
  -- ne sont JAMAIS insérées (le REVOKE frappe avant toute vérification de contrainte FK/PK) :
  -- hors registre de fixtures, aucune réservation d'id n'est nécessaire.
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='fiche_submission'),
         'D1: la table fiche_submission doit exister';
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='pending_change' AND column_name='submission_id'),
         'D1: pending_change.submission_id doit exister';
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='org_actor_module_visibility'),
         'D1: la table org_actor_module_visibility doit exister';
  -- Le CHECK des notifications accepte la nouvelle espèce (fail-closed avant migration).
  ASSERT (SELECT pg_get_constraintdef(oid) FROM pg_constraint
           WHERE conname='chk_app_notification_kind') LIKE '%fiche_submission_reviewed%',
         'D1: chk_app_notification_kind doit inclure fiche_submission_reviewed';
  -- Une seule soumission ouverte par fiche (index partiel unique).
  ASSERT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='uq_fiche_submission_open'),
         'D1: index unique partiel uq_fiche_submission_open manquant';
  -- RLS + REVOKE : un authenticated n'a même pas le SELECT sur la table (permission
  -- denied attendu, PAS « zéro ligne » — le REVOKE frappe avant la policy).
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_agent, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_denied := false;
    BEGIN PERFORM count(*) FROM fiche_submission;
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
    ASSERT v_denied, 'D1: fiche_submission doit être inaccessible en PostgREST direct (REVOKE)';
  RESET ROLE;

  -- ---------- (D1 suite) fermeture RLS EXHAUSTIVE ----------
  -- Le SELECT ci-dessus ne prouve qu'UNE table, EN LECTURE, pour LA persona éditeur : ça ne
  -- suffit pas à exclure une RLS ouverte en écriture, sur org_actor_module_visibility, ou
  -- pour la persona acteur. On répète les 4 sondes (2 tables × lecture/écriture) pour les
  -- 2 personas — un test qui ne vérifierait que la création des tables laisserait passer
  -- une RLS ouverte.
  -- Persona ÉDITEUR (v_agent, tourism_agent).
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_agent, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_denied := false;
    BEGIN INSERT INTO fiche_submission (object_id) VALUES ('zz-noop-d1');
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
    ASSERT v_denied, 'D1: fiche_submission non-inscriptible en direct (éditeur, REVOKE)';

    v_denied := false;
    BEGIN PERFORM count(*) FROM org_actor_module_visibility;
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
    ASSERT v_denied, 'D1: org_actor_module_visibility illisible en direct (éditeur, REVOKE)';

    v_denied := false;
    BEGIN INSERT INTO org_actor_module_visibility (org_object_id, object_type, module_id)
      VALUES ('zz-noop-d1', 'HOT', 'descriptions');
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
    ASSERT v_denied, 'D1: org_actor_module_visibility non-inscriptible en direct (éditeur, REVOKE)';
  RESET ROLE;

  -- Persona ACTEUR (v_user, role='actor') — les 4 mêmes sondes. La fermeture RLS/REVOKE ne
  -- dépend pas de la persona métier : ni l'acteur ni l'éditeur n'ont de voie directe.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated', 'email', 'portal_actor_1301@test.local')::text, true);
  SET LOCAL ROLE authenticated;
    v_denied := false;
    BEGIN PERFORM count(*) FROM fiche_submission;
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
    ASSERT v_denied, 'D1: fiche_submission illisible en direct (acteur, REVOKE)';

    v_denied := false;
    BEGIN INSERT INTO fiche_submission (object_id) VALUES ('zz-noop-d1');
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
    ASSERT v_denied, 'D1: fiche_submission non-inscriptible en direct (acteur, REVOKE)';

    v_denied := false;
    BEGIN PERFORM count(*) FROM org_actor_module_visibility;
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
    ASSERT v_denied, 'D1: org_actor_module_visibility illisible en direct (acteur, REVOKE)';

    v_denied := false;
    BEGIN INSERT INTO org_actor_module_visibility (org_object_id, object_type, module_id)
      VALUES ('zz-noop-d1', 'HOT', 'descriptions');
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
    ASSERT v_denied, 'D1: org_actor_module_visibility non-inscriptible en direct (acteur, REVOKE)';
  RESET ROLE;

  -- ---------- Fixture équipe éditrice (owner, RLS bypass) ----------
  -- RESET ROLE (D1) restaure le rôle Postgres mais PAS le GUC request.jwt.claims (résidu
  -- 'authenticated' de la dernière sonde v_user) : sans ce nettoyage,
  -- enforce_app_user_profile_role_change rejette les INSERT INTO auth.users qui suivent
  -- (le trigger handle_auth_user_profile_created qu'ils déclenchent confondrait le contexte
  -- privilégié courant avec une session authenticated résiduelle). Même geste que (A) et (C).
  PERFORM set_config('request.jwt.claims', NULL, true);
  SELECT id INTO v_perm_validate FROM ref_permission WHERE code='validate_changes' LIMIT 1;
  IF v_perm_validate IS NULL THEN RAISE EXCEPTION 'fixture: ref_permission[validate_changes] manquant'; END IF;
  SELECT id INTO v_role_editor FROM ref_org_business_role WHERE code='editor' LIMIT 1;
  SELECT id INTO v_role_viewer FROM ref_org_business_role WHERE code='viewer' LIMIT 1;
  IF v_role_editor IS NULL OR v_role_viewer IS NULL THEN RAISE EXCEPTION 'fixture: ref_org_business_role manquant'; END IF;
  SELECT id INTO v_adm_role FROM ref_org_admin_role WHERE rank >= 30 LIMIT 1;
  IF v_adm_role IS NULL THEN RAISE EXCEPTION 'fixture: ref_org_admin_role rang>=30 manquant'; END IF;

  INSERT INTO auth.users (id, email) VALUES
    (v_editor, 'portal_editor_1303@test.local'), (v_viewer, 'portal_viewer_1304@test.local'),
    (v_granted, 'portal_granted_1305@test.local'), (v_orgadm, 'portal_orgadm_1306@test.local')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role) VALUES
    (v_editor, 'tourism_agent'), (v_viewer, 'tourism_agent'),
    (v_granted, 'tourism_agent'), (v_orgadm, 'tourism_agent')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO user_org_membership (id, user_id, org_object_id, is_active) VALUES
    (gen_random_uuid(), v_editor, v_orgA, TRUE),
    (gen_random_uuid(), v_viewer, v_orgA, TRUE),
    (gen_random_uuid(), v_granted, v_orgA, TRUE),
    (gen_random_uuid(), v_orgadm, v_orgA, TRUE)
    ON CONFLICT DO NOTHING;
  SELECT id INTO v_m1 FROM user_org_membership WHERE user_id=v_editor AND org_object_id=v_orgA;
  SELECT id INTO v_m2 FROM user_org_membership WHERE user_id=v_viewer AND org_object_id=v_orgA;
  SELECT id INTO v_m3 FROM user_org_membership WHERE user_id=v_granted AND org_object_id=v_orgA;
  SELECT id INTO v_m4 FROM user_org_membership WHERE user_id=v_orgadm AND org_object_id=v_orgA;
  INSERT INTO user_org_business_role (membership_id, role_id, is_active) VALUES
    (v_m1, v_role_editor, TRUE), (v_m2, v_role_viewer, TRUE), (v_m3, v_role_viewer, TRUE)
    ON CONFLICT DO NOTHING;
  INSERT INTO user_org_admin_role (membership_id, role_id, is_active) VALUES (v_m4, v_adm_role, TRUE)
    ON CONFLICT DO NOTHING;
  -- La matrice 17i : le rôle editor de CETTE ORG confère validate_changes.
  INSERT INTO org_role_permission (org_object_id, role_id, permission_id, is_active) VALUES
    (v_orgA, v_role_editor, v_perm_validate, TRUE)
    ON CONFLICT (org_object_id, role_id, permission_id) DO UPDATE SET is_active = TRUE;
  -- Le grant individuel (exception).
  INSERT INTO user_permission (user_id, permission_id, is_active) VALUES
    (v_granted, v_perm_validate, TRUE)
    ON CONFLICT (user_id, permission_id) DO UPDATE SET is_active = TRUE;

  -- ---------- (E) list_object_verifier_ids ----------
  ASSERT EXISTS (SELECT 1 FROM api.list_object_verifier_ids(v_objA) s WHERE s = v_editor),
         'E: le rôle métier editor (matrice 17i) est vérificateur';
  ASSERT EXISTS (SELECT 1 FROM api.list_object_verifier_ids(v_objA) s WHERE s = v_granted),
         'E: le grant individuel validate_changes est vérificateur';
  ASSERT NOT EXISTS (SELECT 1 FROM api.list_object_verifier_ids(v_objA) s WHERE s = v_viewer),
         'E: un viewer sans permission n''est PAS vérificateur';
  ASSERT NOT EXISTS (SELECT 1 FROM api.list_object_verifier_ids(v_objA) s WHERE s = v_orgadm),
         'E: un rang admin SANS validate_changes n''est jamais vérificateur (user_has_permission ignore user_org_admin_role)';
  SELECT count(*) INTO v_verifier_count FROM api.list_object_verifier_ids(v_objA);
  ASSERT v_verifier_count = 2, 'E: branche primaire — exactement editor + granted, aucun tiers';

  -- Invariant réel de la fonction (constat contrôleur, post-revue Task 4) : TOUT id rendu
  -- par list_object_verifier_ids DOIT satisfaire user_can_moderate_object sur CET objet —
  -- sinon la tâche « Vérifier » assignée mène à un 42501 au clic « Approuver », fiche
  -- bloquée à vie (uq_fiche_submission_open n'autorise qu'une soumission ouverte). Sondé
  -- EN BOUCLE sur ce que la fonction rend réellement, pas sur une liste anticipée à la
  -- main : une population plausible mais fausse (ex. les rangs admin seuls, l'ancien
  -- repli) doit mordre ici.
  FOR v_verifier_id IN SELECT s FROM api.list_object_verifier_ids(v_objA) s LOOP
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_verifier_id, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
      ASSERT api.user_can_moderate_object(v_objA) = TRUE,
             format('E: invariant — %s (rendu par list_object_verifier_ids) doit satisfaire user_can_moderate_object', v_verifier_id);
    RESET ROLE;
  END LOOP;

  -- Repli : on éteint la matrice et le grant. FAIT vérifié en base par le contrôleur —
  -- api.user_has_permission() (donc user_can_moderate_object, donc le bouton Approuver)
  -- ne regarde QUE user_permission et user_org_business_role × org_role_permission ;
  -- user_org_admin_role n'y intervient JAMAIS. Le repli rend donc les superutilisateurs
  -- plateforme UNIQUEMENT (jamais les rangs admin) — la soumission n'échoue pas pour
  -- autant si ce groupe est vide (spec §7), juste assignee_count=0 côté appelant.
  -- Non scopé par construction (le ruling le veut ainsi) : n'assume PAS 0 superuser —
  -- une base réelle porte quasi toujours au moins le compte owner/super_admin fondateur.
  -- On capture donc le baseline RÉEL et on compare la fonction à CE baseline, jamais à
  -- une constante — sans jamais toucher aux comptes superuser existants.
  PERFORM set_config('request.jwt.claims', NULL, true);
  UPDATE org_role_permission SET is_active = FALSE
   WHERE org_object_id = v_orgA AND permission_id = v_perm_validate;
  UPDATE user_permission SET is_active = FALSE
   WHERE user_id = v_granted AND permission_id = v_perm_validate;
  SELECT count(*) INTO v_real_super_count FROM app_user_profile WHERE role IN ('owner','super_admin');

  -- L'invariant D'ABORD, avant toute assertion de forme (count/EXISTS) : c'est LUI qui
  -- doit mordre contre l'ANCIEN repli par rang admin (v_orgadm y satisferait FALSE, pas
  -- TRUE, sur user_can_moderate_object) — rejoué ici contre le NOUVEAU repli (baseline
  -- réel, superusers existants inclus, mais jamais v_orgadm).
  FOR v_verifier_id IN SELECT s FROM api.list_object_verifier_ids(v_objA) s LOOP
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_verifier_id, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
      ASSERT api.user_can_moderate_object(v_objA) = TRUE,
             format('E: invariant (repli, avant v_super) — %s doit satisfaire user_can_moderate_object', v_verifier_id);
    RESET ROLE;
  END LOOP;

  SELECT count(*) INTO v_verifier_count FROM api.list_object_verifier_ids(v_objA);
  ASSERT v_verifier_count = v_real_super_count,
         'E: sans validate_changes actif, le repli rend EXACTEMENT les superusers réels — rien de plus (jamais les rangs admin)';
  -- Sous-ensemble STRICT : tout id rendu par le repli EST un superuser réel — la sonde la
  -- plus directe contre une population « plausible mais fausse » (ex. l'ancien admin-rang) :
  -- si un SEUL id étranger s'y glissait, ce EXCEPT ne serait pas vide.
  ASSERT NOT EXISTS (
    SELECT s FROM api.list_object_verifier_ids(v_objA) s
    EXCEPT
    SELECT id FROM app_user_profile WHERE role IN ('owner','super_admin')
  ), 'E: repli — chaque id rendu est un superuser réel, aucun intrus (ex. rang admin)';
  ASSERT NOT EXISTS (SELECT 1 FROM api.list_object_verifier_ids(v_objA) s WHERE s = v_orgadm),
         'E: le rang admin reste exclu même en repli';

  -- Le superutilisateur plateforme : SEULE population de repli retenue par le ruling — il
  -- satisfait user_can_moderate_object ET is_object_owner inconditionnellement, via leur
  -- bras commun is_platform_superuser(), aucun autre bras ne peut donc échouer derrière.
  -- v_super s'AJOUTE au baseline réel — jamais de mutation d'un compte existant.
  PERFORM set_config('request.jwt.claims', NULL, true);
  INSERT INTO auth.users (id, email) VALUES (v_super, 'portal_super_1307@test.local')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role) VALUES (v_super, 'super_admin')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

  -- Invariant à nouveau, cas repli PEUPLÉ cette fois : le superuser rendu doit lui aussi
  -- satisfaire user_can_moderate_object.
  FOR v_verifier_id IN SELECT s FROM api.list_object_verifier_ids(v_objA) s LOOP
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_verifier_id, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
      ASSERT api.user_can_moderate_object(v_objA) = TRUE,
             format('E: invariant (repli, avec v_super) — %s doit satisfaire user_can_moderate_object', v_verifier_id);
    RESET ROLE;
  END LOOP;

  SELECT count(*) INTO v_verifier_count FROM api.list_object_verifier_ids(v_objA);
  ASSERT v_verifier_count = v_real_super_count + 1,
         'E: repli — le baseline réel PLUS v_super, rien d''autre';
  ASSERT EXISTS (SELECT 1 FROM api.list_object_verifier_ids(v_objA) s WHERE s = v_super),
         'E: repli — un superutilisateur plateforme actif EST vérificateur';
  ASSERT NOT EXISTS (SELECT 1 FROM api.list_object_verifier_ids(v_objA) s WHERE s = v_orgadm),
         'E: repli actif — le rang admin reste exclu (le superuser seul qualifie)';

  -- Restauration pour les blocs suivants : la branche primaire reprend la main et reste
  -- PRIORITAIRE — elle ne fusionne PAS avec le repli : le superuser, bien que toujours
  -- superuser, disparaît de la liste dès qu'un vérificateur primaire existe.
  UPDATE org_role_permission SET is_active = TRUE
   WHERE org_object_id = v_orgA AND permission_id = v_perm_validate;
  UPDATE user_permission SET is_active = TRUE
   WHERE user_id = v_granted AND permission_id = v_perm_validate;
  SELECT count(*) INTO v_verifier_count FROM api.list_object_verifier_ids(v_objA);
  ASSERT v_verifier_count = 2,
         'E: la branche primaire restaurée reste prioritaire — exactement editor + granted';
  ASSERT NOT EXISTS (SELECT 1 FROM api.list_object_verifier_ids(v_objA) s WHERE s = v_super),
         'E: le superuser ne s''ajoute PAS à une branche primaire non vide (pas de fusion)';

  -- ---------- (H) visibilité : défauts, plancher, écriture gated ----------
  -- Défaut ouvert : sans ligne, seul le plancher masque.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_vis := api.get_portal_section_visibility(v_objA);
    ASSERT (v_vis->'floor_modules') ? 'legal',
           'H: le plancher dur contient legal (§18)';
    ASSERT NOT ((v_vis->'masked_modules') ? 'descriptions'),
           'H: sans config, descriptions est visible (défaut ouvert)';
    -- Hors portée ⇒ refus.
    v_denied := false;
    BEGIN PERFORM api.get_portal_section_visibility(v_objD);
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
    ASSERT v_denied, 'H: get_portal_section_visibility hors portée doit lever 42501';
    -- Extension (au-delà du verbatim brief) : get_actor_section_visibility (écran /settings)
    -- est une SECONDE fonction, avec sa PROPRE garde d'appartenance — jamais exercée si l'on ne
    -- teste que la variante portail. Une persona acteur scopée sur v_objA mais SANS membership
    -- dans v_orgA doit être refusée ici aussi : les deux gardes sont indépendantes.
    v_denied := false;
    BEGIN PERFORM api.get_actor_section_visibility(v_orgA, 'HOT');
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
    ASSERT v_denied, 'H: get_actor_section_visibility refuse un non-membre de l''ORG (même persona acteur scopée)';
  RESET ROLE;
  -- La variante /settings s'ouvre à un membre ACTIF de l'ORG (ici v_editor) — même plancher,
  -- même défaut ouvert, vérifiés AVANT toute config (symétrique à la vérification portail).
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_editor, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_vis := api.get_actor_section_visibility(v_orgA, 'HOT');
    ASSERT (v_vis->'floor_modules') ? 'legal',
           'H: get_actor_section_visibility porte aussi le plancher dur';
    ASSERT NOT ((v_vis->'masked_modules') ? 'descriptions'),
           'H: get_actor_section_visibility — défaut ouvert avant toute config';
  RESET ROLE;
  -- Écriture : rang ≥ 30 requis ; plancher refusé.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_editor, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_denied := false;
    BEGIN PERFORM api.rpc_set_actor_section_visibility(v_orgA, 'HOT', 'descriptions', FALSE);
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
    ASSERT v_denied, 'H: un éditeur sans rang >= 30 ne règle pas la matrice';
  RESET ROLE;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_orgadm, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    PERFORM api.rpc_set_actor_section_visibility(v_orgA, 'HOT', 'descriptions', FALSE);
    -- Le plancher dur est INTÉGRALEMENT non paramétrable — boucle sur les 9 entrées de
    -- api.actor_portal_floor_modules(), dans les DEUX sens, pas seulement 'legal' : un
    -- sondage à un seul module ne mordrait pas si un AUTRE module du tableau littéral
    -- perdait sa garde. SQLSTATE 22023 explicite (pas WHEN others) : un plantage pour
    -- une tout autre raison ne doit pas passer pour une preuve du plancher.
    FOR v_floor_mod IN SELECT unnest(api.actor_portal_floor_modules()) LOOP
      v_denied := false;
      BEGIN PERFORM api.rpc_set_actor_section_visibility(v_orgA, 'HOT', v_floor_mod, TRUE);
      EXCEPTION WHEN SQLSTATE '22023' THEN v_denied := true; END;
      ASSERT v_denied, format('H: plancher %s refuse l''ouverture (22023)', v_floor_mod);

      v_denied := false;
      BEGIN PERFORM api.rpc_set_actor_section_visibility(v_orgA, 'HOT', v_floor_mod, FALSE);
      EXCEPTION WHEN SQLSTATE '22023' THEN v_denied := true; END;
      ASSERT v_denied, format('H: plancher %s refuse la fermeture explicite (22023)', v_floor_mod);
    END LOOP;
  RESET ROLE;
  -- Aucune des tentatives n'a laissé de ligne résiduelle, pour AUCUN des 9 modules du
  -- plancher — l'exclusion vient uniquement de la fonction (4.1), jamais de la table.
  FOR v_floor_mod IN SELECT unnest(api.actor_portal_floor_modules()) LOOP
    ASSERT NOT EXISTS (
      SELECT 1 FROM org_actor_module_visibility
      WHERE org_object_id = v_orgA AND object_type = 'HOT' AND module_id = v_floor_mod
    ), format('H: aucune ligne matrice pour le module plancher %s', v_floor_mod);
  END LOOP;
  -- Le masquage configuré remonte côté portail.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_vis := api.get_portal_section_visibility(v_objA);
    ASSERT (v_vis->'masked_modules') ? 'descriptions',
           'H: le masquage org×type configuré remonte dans la vue portail';
  RESET ROLE;

  -- ---------- (D2) submit_actor_fiche — LE geste « Soumettre pour vérification » ----------
  v_changes := jsonb_build_array(
    jsonb_build_object(
      'target_table', 'object_description', 'target_pk', NULL, 'action', 'update',
      'payload', jsonb_build_object('chapo', 'Nouveau chapo'),
      -- (C2) L'enveloppe porte DELIBÉRÉMENT les trois clés d'attestation, au nom de v_editor :
      -- c'est ce qu'un prestataire peut mettre dans son corps de requête, rien ne l'en empêche
      -- côté client. submit_actor_fiche DOIT les retirer — sinon la ligne finirait par affirmer
      -- « v_editor déclare l'avoir reportée à la main » sur les deux issues que §7 ne réécrit pas
      -- (un REFUS, et la voie AUTO). Sans cette clé dans la fixture, l'assertion de F2.3 ne
      -- prouvait rien : elle testait une ligne qu'elle avait elle-même construite sans la clé.
      'metadata', jsonb_build_object('rpc', NULL, 'section', 'contacts', 'manual_apply', true,
                                     'field', 'Contacts', 'before', 'a', 'after', 'b',
                                     'applied_manually', true,
                                     'attested_by', '00000000-0000-4000-a000-000000001303',
                                     'attested_at', '2020-01-01T00:00:00Z')),
    jsonb_build_object(
      'target_table', 'opening_period', 'target_pk', NULL, 'action', 'update',
      'payload', jsonb_build_object('periods', '[]'::jsonb),
      'metadata', jsonb_build_object('rpc', 'save_object_openings', 'section', 'openings',
                                     'manual_apply', false, 'field', 'Horaires', 'before', 'x', 'after', 'y',
                                     'applied_manually', true,
                                     'attested_by', '00000000-0000-4000-a000-000000001303')));

  -- Refus : non-acteur (1er garde-fou du corps, avant même la lecture de p_changes).
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_agent, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_denied := false;
  BEGIN PERFORM api.submit_actor_fiche(v_objA, v_changes, NULL);
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  ASSERT v_denied, 'D2: submit refuse un non-acteur';
  RESET ROLE;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  -- Refus : hors portée.
  v_denied := false;
  BEGIN PERFORM api.submit_actor_fiche(v_objD, v_changes, NULL);
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  ASSERT v_denied, 'D2: submit refuse une fiche hors portée';

  -- Refus : tableau de changements vide — le geste « Soumettre » exige AU MOINS un changement ;
  -- un tableau vide n'a mécaniquement rien à valider ni à écrire.
  v_denied := false;
  BEGIN PERFORM api.submit_actor_fiche(v_objA, '[]'::jsonb, NULL);
  EXCEPTION WHEN SQLSTATE '22023' THEN v_denied := true; END;
  ASSERT v_denied, 'D2: submit refuse un tableau de changements vide (zéro modification)';

  -- Refus : plafond de 40 changements DÉPASSÉ (41 entrées, contenu par ailleurs valide et
  -- IDENTIQUE — seule la CARDINALITÉ doit border, pas le contenu). generate_series fabrique les
  -- 41 doublons : jsonb_build_array ne prend pas un nombre variable d'arguments.
  v_denied := false;
  BEGIN
    PERFORM api.submit_actor_fiche(v_objA,
      (SELECT jsonb_agg(jsonb_build_object(
         'target_table', 'object_description', 'target_pk', NULL, 'action', 'update',
         'payload', jsonb_build_object('chapo', 'x'),
         'metadata', jsonb_build_object('rpc', NULL, 'section', 'contacts', 'manual_apply', true,
                                        'field', 'Contacts', 'before', 'a', 'after', 'b')))
       FROM generate_series(1, 41)),
      NULL);
  EXCEPTION WHEN SQLSTATE '22023' THEN v_denied := true; END;
  ASSERT v_denied, 'D2: submit refuse un tableau de plus de 40 changements (plafond)';

  -- Refus : module du plancher dur.
  v_denied := false;
  BEGIN PERFORM api.submit_actor_fiche(v_objA, jsonb_build_array(
    jsonb_build_object('target_table','object_legal','target_pk',NULL,'action','update',
      'payload','{}'::jsonb,
      'metadata', jsonb_build_object('rpc',NULL,'section','legal','manual_apply',true,
                                     'field','Juridique','before','','after',''))), NULL);
  EXCEPTION WHEN SQLSTATE '22023' THEN v_denied := true; END;
  ASSERT v_denied, 'D2: submit refuse un module du plancher dur';

  -- Refus : module masqué par la matrice (descriptions masqué au bloc H).
  v_denied := false;
  BEGIN PERFORM api.submit_actor_fiche(v_objA, jsonb_build_array(
    jsonb_build_object('target_table','object_description','target_pk',NULL,'action','update',
      'payload','{}'::jsonb,
      'metadata', jsonb_build_object('rpc',NULL,'section','descriptions','manual_apply',true,
                                     'field','Descriptions','before','','after',''))), NULL);
  EXCEPTION WHEN SQLSTATE '22023' THEN v_denied := true; END;
  ASSERT v_denied, 'D2: submit refuse un module masqué par la matrice';

  -- Refus : writer hors whitelist §120 (cas générique).
  v_denied := false;
  BEGIN PERFORM api.submit_actor_fiche(v_objA, jsonb_build_array(
    jsonb_build_object('target_table','object','target_pk',NULL,'action','update',
      'payload','{}'::jsonb,
      'metadata', jsonb_build_object('rpc','rpc_delete_object','section','contacts','manual_apply',false,
                                     'field','x','before','','after',''))), NULL);
  EXCEPTION WHEN SQLSTATE '22023' THEN v_denied := true; END;
  ASSERT v_denied, 'D2: submit refuse un writer hors whitelist (anti-escalade dès l''entrée)';

  -- Refus : writer hors whitelist — cas ÉPINGLÉ save_object_rooms (CORRECTION CONTRÔLEUR).
  -- Le brief listait HUIT writers (avec save_object_rooms) ; le prosrc VIF de
  -- api.approve_pending_change (md5=3cf2a45631df18e22e0b4c5cd81d9e2e, re-vérifié en base juste
  -- avant l'écriture de la §5, IDENTIQUE) n'en porte que SEPT — SANS save_object_rooms. Si
  -- submit_actor_fiche était PLUS permissif qu'approve_pending_change, un changement
  -- save_object_rooms entrerait en base à la soumission puis ne pourrait JAMAIS être approuvé
  -- (approve_pending_change le rejette en 22023) : uq_fiche_submission_open n'autorisant qu'UNE
  -- vérification ouverte par fiche, celle-ci resterait bloquée POUR TOUJOURS — même classe de
  -- bug que celle fermée en Task 4, par un autre chemin. Cette assertion est LA garde qui doit
  -- mordre si quelqu'un « complète » un jour la whitelist en croyant réparer un oubli : sans
  -- elle, les deux listes peuvent redivergerger en silence. section='contacts' choisi exprès
  -- (ni plancher ni masqué) : seul le bras whitelist peut ici lever 22023.
  v_denied := false;
  BEGIN PERFORM api.submit_actor_fiche(v_objA, jsonb_build_array(
    jsonb_build_object('target_table','object_room','target_pk',NULL,'action','update',
      'payload','{}'::jsonb,
      'metadata', jsonb_build_object('rpc','save_object_rooms','section','contacts','manual_apply',false,
                                     'field','x','before','','after',''))), NULL);
  EXCEPTION WHEN SQLSTATE '22023' THEN v_denied := true; END;
  ASSERT v_denied,
    'D2: submit refuse save_object_rooms — miroir du refus vif de approve_pending_change (asymétrie ⇒ fiche bloquée pour toujours)';

  -- Preuve de TRANSACTIONNALITÉ (le cœur de cette task) : 2 changements valides PRIS ISOLÉMENT
  -- (mêmes formes que le nominal ci-dessous) suivis d'un 3e portant un writer hors whitelist. Le
  -- corps de submit_actor_fiche valide CHAQUE enveloppe en un seul passage AVANT la moindre
  -- écriture : si cette boucle de validation était un jour fusionnée avec la boucle d'écriture
  -- (valider PUIS écrire À CHAQUE itération), les 2 premiers changements auraient déjà inséré
  -- leur pending_change avant que le 3e ne fasse échouer l'appel — une soumission à moitié
  -- écrite, pire qu'un refus (brief). v_objA ne porte ENCORE aucune fiche_submission à ce point
  -- de la transaction (aucun bloc précédent n'y touche, et le Nominal n'a pas encore tourné) :
  -- 0 est donc la valeur attendue avant ET après cet appel, pas une estimation optimiste.
  v_denied := false;
  BEGIN
    PERFORM api.submit_actor_fiche(v_objA, jsonb_build_array(
      jsonb_build_object('target_table', 'object_description', 'target_pk', NULL, 'action', 'update',
        'payload', jsonb_build_object('chapo', 'Transactionnalité #1'),
        'metadata', jsonb_build_object('rpc', NULL, 'section', 'contacts', 'manual_apply', true,
                                       'field', 'Contacts', 'before', 'a', 'after', 'b')),
      jsonb_build_object('target_table', 'opening_period', 'target_pk', NULL, 'action', 'update',
        'payload', jsonb_build_object('periods', '[]'::jsonb),
        'metadata', jsonb_build_object('rpc', 'save_object_openings', 'section', 'openings',
                                       'manual_apply', false, 'field', 'Horaires', 'before', 'x', 'after', 'y')),
      jsonb_build_object('target_table', 'object_room', 'target_pk', NULL, 'action', 'update',
        'payload', '{}'::jsonb,
        'metadata', jsonb_build_object('rpc', 'save_object_rooms', 'section', 'contacts',
                                       'manual_apply', false, 'field', 'x', 'before', '', 'after', ''))
    ), 'Note qui ne doit JAMAIS atterrir en base');
  EXCEPTION WHEN SQLSTATE '22023' THEN v_denied := true; END;
  ASSERT v_denied, 'D2: le 3e changement (writer interdit) fait échouer tout l''appel avant toute écriture';
  RESET ROLE;

  -- Rien n'a été écrit : les 5 tables concernées par le geste, comptées sous bypass RLS.
  ASSERT (SELECT count(*) FROM fiche_submission WHERE object_id = v_objA) = 0,
         'D2: transactionnalité — aucune fiche_submission créée malgré 2 changements valides en tête';
  ASSERT (SELECT count(*) FROM pending_change WHERE object_id = v_objA) = 0,
         'D2: transactionnalité — aucun pending_change créé (ni le 1er ni le 2e, valides pourtant)';
  ASSERT (SELECT count(*) FROM crm_task WHERE object_id = v_objA) = 0,
         'D2: transactionnalité — aucune crm_task créée';
  ASSERT (SELECT count(*) FROM crm_task_assignee
           WHERE task_id IN (SELECT id FROM crm_task WHERE object_id = v_objA)) = 0,
         'D2: transactionnalité — aucune crm_task_assignee créée';
  ASSERT (SELECT count(*) FROM app_notification
           WHERE task_id IN (SELECT id FROM crm_task WHERE object_id = v_objA)) = 0,
         'D2: transactionnalité — aucune notification créée';
  ASSERT NOT EXISTS (SELECT 1 FROM fiche_submission WHERE note = 'Note qui ne doit JAMAIS atterrir en base'),
         'D2: transactionnalité — la note du prestataire n''a fuité dans aucune ligne résiduelle';

  -- ---------- Preuve du blindage anti-course PT409 (revue contrôleur post-Task 5) ----------
  -- Le pré-check EXISTS de submit_actor_fiche est un check-then-act : entre lui et
  -- l'INSERT réel, rien n'empêche deux appels quasi simultanés (double-clic, deux
  -- onglets) de le franchir tous les deux avant que l'un des deux n'écrive —
  -- uq_fiche_submission_open départage alors les deux à l'ÉCRITURE, pas au pré-check.
  -- Impossible de simuler deux VRAIES transactions concurrentes depuis une session
  -- SQL unique — on reproduit donc la MÊME structure de course par injection
  -- déterministe : un trigger BEFORE INSERT ÉPHÉMÈRE sur fiche_submission (DDL
  -- transactionnelle, effacée par le ROLLBACK final comme tout le reste) insère la
  -- ligne « concurrente » exactement entre l'instant où le pré-check a déjà rendu
  -- FALSE et l'instant où l'INSERT de submit_actor_fiche tente d'écrire — le
  -- pré-check ne PEUT PAS voir cette ligne, elle n'existe pas encore quand il lit —
  -- et l'INSERT réel se heurte alors à l'index unique, exactement comme le ferait un
  -- vrai second appel concurrent. Armé pour UN seul tir via un GUC de test
  -- (`bertel_test.race_armed`, jamais lu par le code de production).
  -- Séquence-preuve : PAS un GUC. Le blindage (submit_actor_fiche) enveloppe l'INSERT dans
  -- son PROPRE BEGIN/EXCEPTION WHEN unique_violation, ce qui pose un SAVEPOINT juste avant
  -- l'INSERT ; quand ce blindage réussit (attrape le 23505, relève PT409), Postgres fait
  -- ROLLBACK TO SAVEPOINT — qui annule TOUT ce qui s'est passé depuis, y compris un GUC
  -- set_config(...,true) posé par le trigger (constaté empiriquement : un premier essai
  -- avec un GUC-désarmoir échouait TOUJOURS, même migration corrigée, car le blindage qui
  -- doit réussir efface lui-même sa propre preuve). Une séquence, elle, est documentée
  -- IMMUNISÉE au ROLLBACK (y compris TO SAVEPOINT) : nextval() n'est jamais « annulé ».
  -- C'est le seul signal fiable ici.
  CREATE TEMP SEQUENCE IF NOT EXISTS race_probe_fired_seq;
  -- Amorçage : last_value d'une séquence FRAÎCHE lit DÉJÀ sa valeur de départ (1) avant
  -- tout nextval() — is_called seul distingue « jamais tirée » de « tirée une fois »,
  -- mais last_value seul seul ne bouge PAS entre les deux (constaté empiriquement : la
  -- comparaison avant/après échouait TOUJOURS, migration corrigée y compris, 1 = 1). Un
  -- nextval() de rodage AVANT la capture du baseline lève cette ambiguïté une fois pour
  -- toutes : toute comparaison ultérieure « après > avant » redevient sans piège.
  PERFORM nextval('race_probe_fired_seq');
  SELECT last_value INTO v_seq_before FROM race_probe_fired_seq;

  CREATE OR REPLACE FUNCTION public.race_inject_competing_submission()
  RETURNS trigger LANGUAGE plpgsql AS $trg$
  BEGIN
    IF current_setting('bertel_test.race_armed', true) = '1' THEN
      PERFORM set_config('bertel_test.race_armed', '0', true); -- désarme AVANT l'INSERT niché,
        -- pour éviter que ce même INSERT ne redéclenche CE trigger (récursion) — ce GUC n'a
        -- besoin de survivre QUE jusqu'à l'INSERT niché suivant, pas au-delà (voir plus haut).
      PERFORM nextval('race_probe_fired_seq'); -- preuve immunisée que CE tir a eu lieu.
      INSERT INTO public.fiche_submission (object_id, status) VALUES (NEW.object_id, 'pending');
    END IF;
    RETURN NEW;
  END;
  $trg$;
  DROP TRIGGER IF EXISTS race_inject ON public.fiche_submission;
  CREATE TRIGGER race_inject BEFORE INSERT ON public.fiche_submission
    FOR EACH ROW EXECUTE FUNCTION public.race_inject_competing_submission();

  PERFORM set_config('bertel_test.race_armed', '1', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_denied := false;
  BEGIN
    PERFORM api.submit_actor_fiche(v_objA, v_changes, NULL);
  EXCEPTION
    WHEN SQLSTATE 'PT409' THEN v_denied := true;
    WHEN unique_violation THEN
      ASSERT FALSE,
        'D2: PIÈGE — la course laisse fuir un 23505 nu au lieu du PT409 intercepté (blindage EXCEPTION WHEN unique_violation absent ou retiré)';
  END;
  ASSERT v_denied, 'D2: la course pré-check/écriture est rattrapée en PT409, jamais en 23505 nu';
  RESET ROLE;

  -- Le tir a bien eu lieu : sans cette sonde, l'assertion précédente passerait AUSSI si le
  -- trigger n'avait JAMAIS injecté quoi que ce soit (elle prouverait alors seulement le cas
  -- déjà couvert par le pré-check EXISTS, pas la course). last_value de la séquence
  -- (immunisée au ROLLBACK TO SAVEPOINT, cf. commentaire plus haut) doit avoir avancé.
  SELECT last_value INTO v_seq_after FROM race_probe_fired_seq;
  ASSERT v_seq_after > v_seq_before,
         'D2: le trigger d''injection de course doit avoir tiré (séquence-preuve avancée)';
  -- Rien n'a survécu à la course CÔTÉ TABLE : le ROLLBACK TO SAVEPOINT implicite du
  -- BEGIN/EXCEPTION de submit_actor_fiche efface À LA FOIS l'INSERT raté et la ligne
  -- injectée par le trigger (les deux appartiennent au même savepoint, ouvert juste avant
  -- l'INSERT) — seule la séquence, non transactionnelle par construction, garde la trace.
  ASSERT (SELECT count(*) FROM fiche_submission WHERE object_id = v_objA) = 0,
         'D2: course — aucune ligne (ni la vraie ni l''injectée) ne survit à l''échec';
  DROP TRIGGER IF EXISTS race_inject ON public.fiche_submission;

  -- Reprise de la session acteur pour le nominal.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- Nominal.
  v_sub := api.submit_actor_fiche(v_objA, v_changes, 'Tarifs de saison mis à jour');
  v_subid := (v_sub->>'submission_id')::uuid;
  v_task  := (v_sub->>'task_id')::uuid;
  ASSERT (v_sub->>'change_count')::int = 2, 'D2: 2 changements enregistrés';
  ASSERT (v_sub->>'assignee_count')::int >= 2, 'D2: editor + granted assignés (>= 2)';
  RESET ROLE;
  -- État en base (owner, RLS bypass).
  ASSERT (SELECT status FROM fiche_submission WHERE id = v_subid) = 'pending',
         'D2: la soumission est pending';
  ASSERT (SELECT note FROM fiche_submission WHERE id = v_subid) = 'Tarifs de saison mis à jour',
         'D2: la note de l''acteur est portée';
  ASSERT (SELECT count(*) FROM pending_change WHERE submission_id = v_subid AND status='pending') = 2,
         'D2: les pending_change portent submission_id';
  ASSERT (SELECT is_editing FROM object WHERE id = v_objA) = TRUE,
         'D2: le trigger is_editing a tourné';
  ASSERT (SELECT count(*) FROM crm_task WHERE id = v_task) = 1, 'D2: la tâche existe';
  ASSERT (SELECT title FROM crm_task WHERE id = v_task) LIKE 'Vérifier la fiche%',
         'D2: titre de tâche auto-porteur';
  ASSERT (SELECT (extra->>'kind') FROM crm_task WHERE id = v_task) = 'fiche_verification',
         'D2: la tâche est typée via extra.kind';
  ASSERT (SELECT (extra->>'submission_id')::uuid FROM crm_task WHERE id = v_task) = v_subid,
         'D2: la tâche pointe la soumission';
  ASSERT EXISTS (SELECT 1 FROM crm_task_assignee WHERE task_id = v_task AND user_id = v_editor),
         'D2: l''éditeur est assigné';
  ASSERT EXISTS (SELECT 1 FROM app_notification WHERE task_id = v_task AND recipient_id = v_editor
                   AND kind = 'crm_task_assigned'),
         'D2: la notification crm_task_assigned est créée (rail e-mail existant)';

  -- Anti-spam : une soumission ouverte ⇒ refus de la suivante, en PT409 SPÉCIFIQUEMENT (piège
  -- nommé par le PO). L'index unique partiel uq_fiche_submission_open lève un 23505 NU que le
  -- RPC DOIT intercepter et re-lever en PT409 — un 23505 qui fuit remonterait au front comme
  -- « Cette valeur existe déjà (doublon). » (db-error-message.ts) au lieu de « L'office est déjà
  -- en train de vérifier cette fiche. ». `WHEN others` ne discriminerait PAS ce cas précis : un
  -- 23505 fuité passerait le test à tort — d'où les DEUX branches ci-dessous, celle qui fait
  -- mordre le test si le mauvais code fuit.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_denied := false;
  BEGIN
    PERFORM api.submit_actor_fiche(v_objA, v_changes, NULL);
  EXCEPTION
    WHEN SQLSTATE 'PT409' THEN v_denied := true;
    WHEN unique_violation THEN
      ASSERT FALSE, 'D2: PIÈGE — un 23505 nu a fuité au lieu du PT409 intercepté (db-error-message.ts afficherait « doublon »)';
  END;
  ASSERT v_denied, 'D2: une vérification déjà en cours refuse une nouvelle soumission (PT409)';
  RESET ROLE;

  -- ---------- Fixture (G) : canaux publics de l'office + doublon de rôles ----------
  -- RESET ROLE (D2) restaure le rôle Postgres mais pas le GUC — même geste que (A)/(C)/(D1).
  PERFORM set_config('request.jwt.claims', NULL, true);

  SELECT id INTO v_phone_kind  FROM ref_code_contact_kind WHERE code = 'phone'  LIMIT 1;
  SELECT id INTO v_mobile_kind FROM ref_code_contact_kind WHERE code = 'mobile' LIMIT 1;
  IF v_phone_kind IS NULL OR v_mobile_kind IS NULL THEN
    RAISE EXCEPTION 'fixture: ref_code_contact_kind[phone|mobile] manquant';
  END IF;
  SELECT id INTO v_role_sales FROM ref_actor_role WHERE code = 'sales_manager' LIMIT 1;
  IF v_role_sales IS NULL THEN RAISE EXCEPTION 'fixture: ref_actor_role[sales_manager] manquant'; END IF;

  -- v_orgB : une SECONDE org, sans AUCUN canal — le cas NULL/NULL de office_email/office_phone
  -- doit être un résultat NORMAL, pas confondu avec un bug (D11 : la prod du 2026-09-02 n'a déjà
  -- AUCUNE ORG avec un canal e-mail public — ce n'est pas un cas de bord théorique).
  INSERT INTO object (id, object_type, name, status) VALUES
    (v_orgB, 'ORG', 'ORG portail test (sans canal)', 'published'),
    (v_objF, 'HOT', 'Hôtel sans canal office', 'draft')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO object_org_link (object_id, org_object_id, role_id) VALUES (v_objF, v_orgB, v_pub)
    ON CONFLICT DO NOTHING;
  INSERT INTO actor_object_role (actor_id, object_id, role_id, is_primary, valid_from, valid_to) VALUES
    (v_actor1, v_objF, v_role_op, TRUE, NULL, NULL)
    ON CONFLICT DO NOTHING;

  -- Canaux de v_orgA (déjà publisher de v_objA) : mélange volontairement PIÉGEUX. Un canal
  -- PRIVÉ (is_public=FALSE) ne doit JAMAIS sortir — même s'il « gagnerait » sur tout autre
  -- critère (ici : sans le filtre is_public, l'ordre naturel du tri le placerait en tête, cf.
  -- le phone privé posé is_primary=TRUE ci-dessous). Fuite de PII si c'est faux.
  INSERT INTO contact_channel (object_id, kind_id, value, is_public, is_primary, position) VALUES
    (v_orgA, v_email_kind,  'office-prive@test.local',             FALSE, FALSE, 0),
    (v_orgA, v_email_kind,  'office-public-secondaire@test.local', TRUE,  FALSE, 1),
    (v_orgA, v_email_kind,  'office-public-primaire@test.local',   TRUE,  TRUE,  2),
    (v_orgA, v_mobile_kind, '0692000001',                          TRUE,  FALSE, 0),
    (v_orgA, v_phone_kind,  '0262000001',                          TRUE,  FALSE, 5),
    (v_orgA, v_phone_kind,  '0262-prive-primaire',                 FALSE, TRUE,  9)
    ON CONFLICT DO NOTHING;

  -- Doublon de rôles (constat Task 1, corrigé et prouvé ici, Task 6) : v_actor1 tient désormais
  -- DEUX rôles valides sur LA MÊME fiche v_objA (operator posé en (B), + sales_manager ici).
  -- actor_object_role n'a PAS de contrainte d'unicité par (actor_id, object_id) — sa PK inclut
  -- role_id — un JOIN direct sur current_user_portal_object_ids() (comme list_my_portal_fiches)
  -- ferait sortir v_objA deux fois sans le DISTINCT ajouté en §1.
  INSERT INTO actor_object_role (actor_id, object_id, role_id, is_primary, valid_from, valid_to) VALUES
    (v_actor1, v_objA, v_role_sales, FALSE, NULL, NULL)
    ON CONFLICT DO NOTHING;

  -- ---------- (G) lectures acteur + invariants PII ----------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated', 'email', 'portal_actor_1301@test.local')::text, true);
  SET LOCAL ROLE authenticated;
    -- Doublon de rôles, sondé sur la fonction ENSEMBLISTE elle-même (avant tout RPC json) —
    -- isole la correction §1 de sa consommation §6 : si ce compte échouait, le RPC échouerait
    -- forcément aussi, mais l'inverse n'est pas vrai (un DISTINCT posé seulement côté §6
    -- masquerait un doublon qui resterait actif pour tout AUTRE futur consommateur direct).
    SELECT count(*) INTO v_dup_count FROM api.current_user_portal_object_ids() s WHERE s = v_objA;
    ASSERT v_dup_count = 1,
      'G: current_user_portal_object_ids ne rend v_objA qu''UNE fois malgré 2 rôles valides (DISTINCT §1)';

    v_fiches := api.list_my_portal_fiches();

    ASSERT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_fiches) f
      WHERE f->>'id' = v_objA AND (f->'open_submission'->>'id')::uuid = v_subid),
      'G: list_my_portal_fiches émet la fiche et sa soumission ouverte';
    -- Doublon de rôles vu depuis le RPC FINAL (pas seulement la fonction ensembliste ci-dessus) :
    -- UNE seule entrée jsonb pour v_objA malgré les 2 rôles actor_object_role valides.
    ASSERT (SELECT count(*) FROM jsonb_array_elements(v_fiches) f WHERE f->>'id' = v_objA) = 1,
      'G: list_my_portal_fiches — une seule ligne pour v_objA malgré 2 rôles actor_object_role valides';
    ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_fiches) f WHERE f->>'id' = v_objD),
      'G: list_my_portal_fiches ne fuit pas hors portée (fiche de l''acteur piège)';
    -- Isolement : lien EXPIRÉ / FUTUR absents du RPC FINAL (pas seulement de la fonction
    -- ensembliste sondée au bloc B) — c'est CE RPC que consomme le front du portail.
    ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_fiches) f WHERE f->>'id' = v_objB),
      'G: list_my_portal_fiches — lien expiré absent du RPC final';
    ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_fiches) f WHERE f->>'id' = v_objC),
      'G: list_my_portal_fiches — lien futur absent du RPC final';
    -- Isolement inter-acteurs : la fiche de v_actor3 (bloc C, compte v_user2) n'apparaît jamais
    -- pour v_actor1.
    ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_fiches) f WHERE f->>'id' = v_objE),
      'G: list_my_portal_fiches n''expose pas la fiche d''un AUTRE acteur (isolement)';
    -- Un objet ORG n'apparaît jamais, même le sien (v_actor1 tient un rôle SUR v_orgA, bras 1b).
    ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_fiches) f WHERE f->>'id' = v_orgA),
      'G: list_my_portal_fiches n''émet jamais un objet ORG';
    -- Portée close : EXACTEMENT 2 fiches (v_objA + v_objF) — ni le doublon de rôle n'ajoute une
    -- ligne, ni aucune autre fuite n'en ajoute une troisième.
    ASSERT (SELECT jsonb_array_length(v_fiches)) = 2,
      'G: la portée de v_actor1 contient EXACTEMENT 2 fiches (v_objA + v_objF)';

    -- Canaux publics de l'office (D11) : le PRIVÉ n'apparaît JAMAIS, le PUBLIC PRIMAIRE gagne
    -- sur le PUBLIC secondaire, et 'phone' gagne sur 'mobile' — les DEUX ressortent d'UNE MÊME
    -- entrée (v_objA), aucun risque de confondre le champ testé avec un autre.
    SELECT f INTO v_f FROM jsonb_array_elements(v_fiches) f WHERE f->>'id' = v_objA;
    ASSERT v_f->>'office_email' = 'office-public-primaire@test.local',
      'G: office_email — public + primaire gagne (jamais le privé, même mieux placé)';
    ASSERT v_f->>'office_phone' = '0262000001',
      'G: office_phone — public ''phone'' gagne sur ''mobile'' public ET sur le privé primaire';

    -- Cas NULL (D11, cas réel en prod le 2026-09-02) : v_objF est lié à v_orgB, qui ne porte
    -- AUCUN canal — NULL est le résultat ATTENDU, pas un bug. Distingué explicitement du cas
    -- « clé absente » : la clé EXISTE dans le jsonb, sa VALEUR est JSON null.
    SELECT f INTO v_f FROM jsonb_array_elements(v_fiches) f WHERE f->>'id' = v_objF;
    ASSERT v_f ? 'office_email' AND jsonb_typeof(v_f->'office_email') = 'null',
      'G: office_email — NULL explicite quand l''ORG ne porte aucun canal (pas une absence de clé)';
    ASSERT v_f ? 'office_phone' AND jsonb_typeof(v_f->'office_phone') = 'null',
      'G: office_phone — même invariant NULL';

    -- list_my_submissions : la soumission du bloc D2, avec ses 2 changements.
    ASSERT (SELECT jsonb_array_length((SELECT jsonb_agg(s) FROM jsonb_array_elements(api.list_my_submissions(20)) s
             WHERE (s->>'id')::uuid = v_subid))) = 1,
      'G: list_my_submissions rend ma soumission';
    ASSERT (SELECT jsonb_array_length(s->'changes') FROM jsonb_array_elements(api.list_my_submissions(20)) s
             WHERE (s->>'id')::uuid = v_subid) = 2,
      'G: la soumission liste ses 2 changements';
    -- 'section' = le module id STABLE (metadata->>'section' posé par D2 : 'contacts'/'openings'),
    -- PAS 'field' (le libellé lisible 'Contacts'/'Horaires') — la clé qui ancre l'état d'une
    -- rubrique côté portail (D12). Une implémentation qui confondrait les deux colonnes (même
    -- type text, même origine metadata) ne mordrait sur AUCUNE autre assertion de ce bloc.
    ASSERT (SELECT array_agg(c->>'section' ORDER BY c->>'section')
             FROM jsonb_array_elements(
               (SELECT s->'changes' FROM jsonb_array_elements(api.list_my_submissions(20)) s
                WHERE (s->>'id')::uuid = v_subid)) c)
           = ARRAY['contacts','openings'],
      'G: section = le module id stable (metadata.section), jamais le libellé field';
    ASSERT NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(
        (SELECT s->'changes' FROM jsonb_array_elements(api.list_my_submissions(20)) s
         WHERE (s->>'id')::uuid = v_subid)) c
      WHERE c->>'reviewer_label' IS NOT NULL),
      'G: reviewer_label NULL — rien n''a encore été revu (Task 7)';
    -- p_object_id : filtre STRICT — passé sur v_objB (un AUTRE objet du même acteur, sans
    -- aucune soumission), ma soumission de v_objA doit disparaître. Sans ce filtre, une
    -- rubrique « en vérification » resterait affichée sur la MAUVAISE fiche d'un prestataire
    -- multi-fiches — le risque nommé par la révision, pas une simple absence de paramètre.
    ASSERT NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(api.list_my_submissions(20, v_objB)) s
      WHERE (s->>'id')::uuid = v_subid),
      'G: list_my_submissions(p_object_id) filtre STRICTEMENT — la soumission de v_objA n''apparaît pas sous v_objB';
    ASSERT EXISTS (
      SELECT 1 FROM jsonb_array_elements(api.list_my_submissions(20, v_objA)) s
      WHERE (s->>'id')::uuid = v_subid),
      'G: list_my_submissions(p_object_id) rend la soumission quand l''id correspond';

    -- get_my_actor_profile : mon acteur, PAS l'homonyme d'e-mail, et SES canaux uniquement (pas
    -- ceux de l'acteur piège v_actor2, ni de v_actor3).
    ASSERT (api.get_my_actor_profile()->>'id')::uuid = v_actor1,
      'G: get_my_actor_profile rend l''acteur du lien explicite';
    ASSERT (api.get_my_actor_profile()->>'display_name') = 'Acteur Portail 1301',
      'G: get_my_actor_profile rend le display_name de MON acteur';
    ASSERT (SELECT jsonb_array_length(api.get_my_actor_profile()->'channels')) = 1,
      'G: get_my_actor_profile — exactement 1 canal (celui de v_actor1, pas ceux des autres acteurs)';
    ASSERT (api.get_my_actor_profile()->'channels'->0->>'value') = 'portal_agent_1302@test.local',
      'G: get_my_actor_profile — le canal rendu est bien celui de v_actor1, pas de l''acteur piège';

    -- Invariants PII (spec §6) : la persona acteur ne passe AUCUN gate interne.
    ASSERT COALESCE(api.current_user_can_edit_objects(), FALSE) = FALSE,
      'G: current_user_can_edit_objects FALSE pour un acteur';
    ASSERT api.can_read_actor_contacts(v_objA) = FALSE,
      'G: can_read_actor_contacts FALSE pour un acteur (aucune 5e formulation PII)';
    v_denied := false;
    BEGIN PERFORM api.search_actors('mar');
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
    ASSERT v_denied, 'G: search_actors refuse un acteur (42501)';
  RESET ROLE;

  -- ---------- (G suite) isolement — l'AUTRE acteur (v_actor3, compte v_user2, bloc C) ----------
  -- Symétrique du bloc précédent : v_user2 voit SA fiche (v_objE) et RIEN d'autre — preuve
  -- d'isolement dans les DEUX sens, pas un seul.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user2, 'role', 'authenticated', 'email', 'portal_actor_1393@test.local')::text, true);
  SET LOCAL ROLE authenticated;
    v_fiches := api.list_my_portal_fiches();
    ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(v_fiches) f WHERE f->>'id' = v_objE),
      'G: isolement (retour) — v_actor3 voit bien SA fiche';
    ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_fiches) f WHERE f->>'id' = v_objA),
      'G: isolement (retour) — v_actor3 ne voit PAS la fiche de v_actor1';
    ASSERT (SELECT jsonb_array_length(v_fiches)) = 1,
      'G: isolement — la portée de v_actor3 se limite STRICTEMENT à v_objE (pas de fuite additive)';
  RESET ROLE;

  -- Un non-acteur ne lit rien via les RPCs « my » (auto-scopées, jamais de paramètre destinataire) :
  -- les TROIS RPCs refusent identiquement, 42501, symétriques les uns aux autres.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_agent, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_denied := false;
  BEGIN PERFORM api.list_my_portal_fiches();
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  ASSERT v_denied, 'G: list_my_portal_fiches refuse un non-acteur';

  v_denied := false;
  BEGIN PERFORM api.list_my_submissions(20);
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  ASSERT v_denied, 'G: list_my_submissions refuse un non-acteur';

  v_denied := false;
  BEGIN PERFORM api.get_my_actor_profile();
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  ASSERT v_denied, 'G: get_my_actor_profile refuse un non-acteur';
  RESET ROLE;

  -- ---------- Fixture (F2) : fiches dédiées + écriture canonique de l'office ----------
  -- RESET ROLE restaure le rôle Postgres mais pas le GUC — même geste que (A)/(C)/(D1)/(G).
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- Le re-dispatch d'un writer whitelisté tourne AS THE CALLER : save_object_openings appelle
  -- internal.workspace_assert_can_write_object → api.user_can_write_object_canonical. Sans ce
  -- grant, toute approbation d'un changement AUTO échouerait en 42501 levé par le WRITER et non
  -- par la garde de modération — le test « ça refuse » passerait alors en prouvant tout autre
  -- chose. Grant posé ICI et non dans la fixture équipe (bloc E) : aucun bloc antérieur ne doit
  -- voir ses droits changer sous lui.
  INSERT INTO user_permission (user_id, permission_id, is_active)
  SELECT v_editor, id, TRUE FROM ref_permission WHERE code = 'edit_canonical_when_publisher'
  ON CONFLICT (user_id, permission_id) DO UPDATE SET is_active = TRUE;

  INSERT INTO object (id, object_type, name, status) VALUES
    (v_objG, 'HOT', 'Hôtel D9 — tout approuvé',    'draft'),
    (v_objH, 'HOT', 'Hôtel D9 — tout rejeté',      'draft'),
    (v_objI, 'HOT', 'Hôtel D9 — partiel inachevé', 'draft')
    ON CONFLICT (id) DO NOTHING;
  -- Publiées par v_orgA : c'est CE lien publisher qui met ces fiches à la fois dans
  -- api.current_user_crm_object_ids() de v_editor (donc dans user_can_moderate_object) et dans
  -- api.list_object_verifier_ids — les deux moitiés du geste D9.
  INSERT INTO object_org_link (object_id, org_object_id, role_id) VALUES
    (v_objG, v_orgA, v_pub), (v_objH, v_orgA, v_pub), (v_objI, v_orgA, v_pub)
    ON CONFLICT DO NOTHING;
  -- Insérés APRÈS les assertions de cardinalité du bloc G (« portée close à EXACTEMENT 2
  -- fiches ») : ce bloc est additif, il ne doit rien déplacer en amont.
  INSERT INTO actor_object_role (actor_id, object_id, role_id, is_primary, valid_from, valid_to) VALUES
    (v_actor1, v_objG, v_role_op, TRUE, NULL, NULL),
    (v_actor1, v_objH, v_role_op, TRUE, NULL, NULL),
    (v_actor1, v_objI, v_role_op, TRUE, NULL, NULL)
    ON CONFLICT DO NOTHING;

  -- ---------- (F2) D9 : validation TOTALE ou PARTIELLE + attestation manual_apply ----------
  -- Les DEUX lignes de la soumission nominale (D2) : une manual_apply (rpc NULL), une auto.
  -- (C1) Sélection par le prédicat de la MACHINE (`rpc` absent), pas par la clé DÉCLARÉE par le
  -- soumetteur : c'est le critère sur lequel approve_pending_change et approve_fiche_submission
  -- branchent réellement. Sélectionner par metadata.manual_apply reviendrait à faire reposer le
  -- test sur la source de vérité dont on vient justement de prouver qu'elle peut mentir.
  SELECT id INTO v_pc_manual FROM pending_change
   WHERE submission_id = v_subid AND metadata->>'rpc' IS NULL;
  SELECT id INTO v_pc_auto FROM pending_change
   WHERE submission_id = v_subid AND metadata->>'rpc' = 'save_object_openings';
  -- (C2) Les trois clés d'attestation FORGÉES par l'acteur (fixture D2) n'ont pas survécu à
  -- l'écriture — sur AUCUNE des deux lignes, ni la manuelle ni l'auto. Une attestation ne peut
  -- venir que d'api.approve_pending_change ; toute autre provenance est une signature usurpée.
  ASSERT NOT EXISTS (
    SELECT 1 FROM pending_change WHERE submission_id = v_subid
      AND (metadata ? 'attested_by' OR metadata ? 'attested_at' OR metadata ? 'applied_manually')),
    'F2: submit_actor_fiche retire les clés d''attestation de l''enveloppe de l''acteur (signature non usurpable)';
  -- ... sans avoir emporté les clés DÉCLARATIVES au passage (le filtre doit être chirurgical).
  ASSERT (SELECT metadata->>'section' FROM pending_change WHERE id = v_pc_manual) = 'contacts'
     AND (SELECT metadata->>'field'   FROM pending_change WHERE id = v_pc_manual) = 'Contacts',
     'F2: le filtre des clés d''attestation ne touche pas les clés déclaratives';
  ASSERT v_pc_manual IS NOT NULL AND v_pc_auto IS NOT NULL AND v_pc_manual <> v_pc_auto,
         'F2: fixture — la soumission D2 porte bien UNE ligne manuelle et UNE ligne auto';
  -- LE fait que D9 doit trancher, et qui n'était établi nulle part avant cette task : cette
  -- ligne n'a AUCUN writer. Le prosrc VIF de api.approve_pending_change (relevé le 2026-09-02,
  -- md5=3cf2a45631df18e22e0b4c5cd81d9e2e) refuse rpc NULL INCONDITIONNELLEMENT — « IF v_rpc IS
  -- NULL OR NOT (v_rpc = ANY(v_allowed)) THEN RAISE … ERRCODE 22023 » — SANS RIEN ÉCRIRE, donc
  -- sans jamais faire sortir la ligne de « pending ». Comme 5 des 7 rubriques du portail sont
  -- manual_apply (intersection avec les routes auto = {openings, characteristics} seulement),
  -- la soumission ne pouvait JAMAIS se résoudre et uq_fiche_submission_open bloquait la fiche
  -- POUR TOUJOURS. Le seul geste possible restait le refus. C'est ce trou que §7 ferme.
  ASSERT (SELECT metadata->>'rpc' FROM pending_change WHERE id = v_pc_manual) IS NULL,
         'F2: fixture — la ligne manual_apply ne porte AUCUN writer (rpc NULL)';

  -- (F2.1) AUTORISATION — l'attestation n'est pas une porte dérobée.
  -- v_viewer est membre actif de l'ORG mais ne tient AUCUN validate_changes ; v_orgadm tient un
  -- rang admin >= 30 et rien d'autre — or api.user_has_permission ignore TOTALEMENT
  -- user_org_admin_role (§227, re-vérifié en base). Les deux doivent être refusés à
  -- l'IDENTIQUE, et en 42501 PRÉCISÉMENT : un 22023 (« déjà résolue », « rpc absent ») passerait
  -- un WHEN others à tort en prouvant tout autre chose. Si la garde d'autorisation manquait, la
  -- sonde attestée ci-dessous RÉUSSIRAIT (aucune exception) et l'assertion mordrait.
  FOREACH v_persona IN ARRAY ARRAY[v_viewer, v_orgadm] LOOP
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_persona, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
      v_denied := false;
      BEGIN PERFORM api.approve_pending_change(v_pc_auto, 'sans droit');
      EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
      ASSERT v_denied, 'F2: approve unitaire refusé sans droit de modération (42501)';

      v_denied := false;
      BEGIN PERFORM api.approve_pending_change(v_pc_manual, 'je l''ai reporté', TRUE);
      EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
      ASSERT v_denied,
        'F2: l''ATTESTATION ne contourne PAS la garde de modération (sinon n''importe quel membre déclare une fiche « validée »)';

      v_denied := false;
      BEGIN PERFORM api.reject_pending_change(v_pc_auto, 'motif');
      EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
      ASSERT v_denied, 'F2: reject unitaire refusé sans droit de modération';

      v_denied := false;
      BEGIN PERFORM api.approve_fiche_submission(v_subid, 'sans droit', TRUE);
      EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
      ASSERT v_denied, 'F2: approbation GROUPÉE refusée sans droit de modération';

      v_denied := false;
      BEGIN PERFORM api.reject_fiche_submission(v_subid, 'motif');
      EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
      ASSERT v_denied, 'F2: rejet GROUPÉ refusé sans droit de modération';
    RESET ROLE;
  END LOOP;
  -- Rien n'a bougé sous ces cinq refus (une garde qui lève APRÈS avoir écrit resterait invisible
  -- au seul comptage d'exceptions dans un test qui ne relit pas l'état).
  ASSERT (SELECT count(*) FROM pending_change
           WHERE submission_id = v_subid AND status = 'pending') = 2,
         'F2: les refus d''autorisation ne laissent AUCUNE écriture derrière eux';

  -- (F2.2) L'attestation n'ouvre PAS la whitelist. Ligne PIÈGE portant un writer RÉEL mais non
  -- whitelisté : une implémentation écrite « IF v_rpc IS NULL OR p_applied_manually THEN
  -- <branche attestée> » passerait TOUS les autres tests de ce bloc et transformerait
  -- p_applied_manually en interrupteur d'approbation universel — un modérateur pourrait
  -- « attester » n'importe quelle enveloppe, y compris un writer destructeur. Insérée
  -- directement sous owner : submit_actor_fiche la refuse à l'entrée (bloc D2), c'est justement
  -- le point — une telle ligne ne peut venir que d'un AUTRE chemin (contributeur interne §122,
  -- correctif service_role, ligne historique).
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
  INSERT INTO pending_change (object_id, target_table, target_pk, action, payload,
                              submitted_by, status, metadata)
  VALUES (v_objA, 'object', NULL, 'update', '{}'::jsonb, v_user, 'pending',
          jsonb_build_object('rpc', 'rpc_delete_object', 'section', 'contacts', 'field', 'x'))
  RETURNING id INTO v_pc_escal;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_editor, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_denied := false;
    BEGIN PERFORM api.approve_pending_change(v_pc_escal, 'j''atteste', TRUE);
    EXCEPTION WHEN SQLSTATE '22023' THEN v_denied := true; END;
    ASSERT v_denied,
      'F2: l''attestation ne rend PAS approuvable un writer hors whitelist (anti-escalade)';
    -- Refermée tout de suite : elle porte sur v_objA et retiendrait sinon object.is_editing à
    -- TRUE, ce que le bloc F (Task 8) vérifie retomber une fois tout résolu.
    PERFORM api.reject_pending_change(v_pc_escal, 'ligne de fixture — refermée');
  RESET ROLE;
  ASSERT (SELECT status FROM pending_change WHERE id = v_pc_escal) = 'rejected',
         'F2: la ligne piège est bien refermée (rejected), pas laissée pending';

  -- (F2.2 bis) ÉPINGLAGE DU CONTENU DE LA WHITELIST, côté approve. La décision (A) — SEPT
  -- writers, sans save_object_rooms, alignés sur le prosrc vif et sur submit_actor_fiche —
  -- n'était testée que du côté submit (bloc D2). Ajouter save_object_rooms à v_allowed, ce
  -- que produit mécaniquement une recopie de migration_moderation_rpcs.sql qui en liste HUIT,
  -- laissait passer toutes les autres assertions : l'anti-escalade ci-dessus utilise
  -- rpc_delete_object, un nom qui ne dérivera jamais. Les deux listes DOIVENT rester
  -- identiques — si submit accepte ce qu'approve refuse, le changement entre en base et ne
  -- peut plus jamais être approuvé, et uq_fiche_submission_open bloque la fiche à vie.
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
  INSERT INTO pending_change (object_id, target_table, target_pk, action, payload,
                              submitted_by, status, metadata)
  VALUES (v_objA, 'object_room_type', NULL, 'update', '{}'::jsonb, v_user, 'pending',
          jsonb_build_object('rpc', 'save_object_rooms', 'section', 'contacts', 'field', 'Chambres'))
  RETURNING id INTO v_pc_rooms;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_editor, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_denied := false;
    BEGIN PERFORM api.approve_pending_change(v_pc_rooms, 'j''atteste', TRUE);
    EXCEPTION WHEN SQLSTATE '22023' THEN v_denied := true; END;
    ASSERT v_denied,
      'F2: save_object_rooms reste HORS de la whitelist d''approve — miroir exact de submit_actor_fiche (bloc D2)';
    -- Refermée comme la précédente : elle porte sur v_objA, que le bloc F (Task 8) attend à
    -- zéro ligne pending pour voir is_editing retomber.
    PERFORM api.reject_pending_change(v_pc_rooms, 'ligne de fixture — refermée');
  RESET ROLE;
  ASSERT (SELECT status FROM pending_change WHERE id = v_pc_rooms) = 'rejected',
         'F2: la ligne save_object_rooms est refermée (rejected), pas laissée pending';

  -- (F2.3) NON-RÉGRESSION §120/§122 : le 3e paramètre a un DÉFAUT, donc l'appel historique à
  -- DEUX arguments — celui que le front émet toujours, sur des lignes SANS submission_id —
  -- doit se comporter EXACTEMENT comme avant : re-dispatch, status 'applied', applied_at posé.
  -- Aucune clé manual_apply dans metadata : c'est la forme réelle d'une ligne §120, et elle
  -- exerce au passage le repli de la colonne manual_apply de list_pending_changes.
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
  INSERT INTO pending_change (object_id, target_table, target_pk, action, payload,
                              submitted_by, status, metadata)
  VALUES (v_objA, 'opening_period', NULL, 'update', jsonb_build_object('periods', '[]'::jsonb),
          v_user, 'pending',
          jsonb_build_object('rpc', 'save_object_openings', 'section', 'openings', 'field', 'Horaires'))
  RETURNING id INTO v_pc_legacy;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_editor, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_res2 := api.approve_pending_change(v_pc_legacy, 'Approbation historique');
    ASSERT v_res2->>'status' = 'applied',
           'F2: non-régression — l''appel à 2 arguments rend toujours applied';
  RESET ROLE;
  ASSERT (SELECT status FROM pending_change WHERE id = v_pc_legacy) = 'applied',
         'F2: non-régression — la ligne §120 est appliquée par re-dispatch';
  ASSERT (SELECT applied_at FROM pending_change WHERE id = v_pc_legacy) IS NOT NULL,
         'F2: non-régression — applied_at reste posé sur une application MACHINE';
  ASSERT (SELECT reviewed_by FROM pending_change WHERE id = v_pc_legacy) = v_editor,
         'F2: non-régression — reviewed_by porte bien l''appelant, pas le propriétaire DEFINER';
  -- La trace d'attestation ne doit JAMAIS être apposée sur une application machine : sinon la
  -- piste d'audit ment dans l'autre sens (« quelqu'un a attesté » alors que la machine a écrit).
  ASSERT NOT (SELECT metadata ? 'applied_manually' FROM pending_change WHERE id = v_pc_legacy),
         'F2: non-régression — aucune trace d''attestation n''est apposée sur une application machine';

  -- (F2.4) Le cœur de D9 : rpc NULL, sans puis avec attestation.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_editor, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    -- Sans attestation, le refus §120 est PRÉSERVÉ : approuver une rubrique manual_apply sans
    -- déclarer l'avoir reportée à la main ferait lire « validée » au prestataire alors que sa
    -- fiche publique n'a pas bougé — et rien, d'aucun côté, ne le lui dirait. C'est la panne la
    -- plus grave que ce chantier puisse produire, parce qu'elle est silencieuse des DEUX côtés.
    v_denied := false;
    BEGIN PERFORM api.approve_pending_change(v_pc_manual, NULL);
    EXCEPTION WHEN SQLSTATE '22023' THEN v_denied := true; END;
    ASSERT v_denied, 'F2: approuver un manual_apply SANS attestation reste refusé (22023)';

    -- Avec attestation : la ligne passe 'approved' — et surtout PAS 'applied'.
    v_res2 := api.approve_pending_change(v_pc_manual, 'Reporté à la main dans l''éditeur', TRUE);
    ASSERT v_res2->>'status' = 'approved', 'F2: l''attestation rend « approved »';
  RESET ROLE;
  ASSERT (SELECT status FROM pending_change WHERE id = v_pc_manual) = 'approved',
         'F2: manual_apply attesté ⇒ approved (jamais applied)';
  -- applied_at NULL est le SECOND discriminant, indépendant du statut : « la machine a écrit »
  -- et « un humain a attesté avoir écrit » ne doivent jamais être confondus dans l'audit.
  ASSERT (SELECT applied_at FROM pending_change WHERE id = v_pc_manual) IS NULL,
         'F2: pas d''applied_at sur une approbation attestée (approved ≠ applied)';
  -- La TRACE ATTESTABLE, explicite et non dérivée : qui a attesté, et quand. Un simple
  -- reviewed_by ne suffit pas — un rejet en pose un aussi ; et « status=approved AND applied_at
  -- IS NULL » est un fait DÉRIVÉ qu'un futur remaniement du statut effacerait sans bruit.
  ASSERT (SELECT metadata->>'applied_manually' FROM pending_change WHERE id = v_pc_manual) = 'true',
         'F2: la ligne porte la marque explicite d''une application MANUELLE';
  ASSERT (SELECT (metadata->>'attested_by')::uuid FROM pending_change WHERE id = v_pc_manual) = v_editor,
         'F2: la trace nomme QUI a attesté (responsabilité opposable, pas un statut anonyme)';
  ASSERT (SELECT metadata->>'attested_at' FROM pending_change WHERE id = v_pc_manual) IS NOT NULL,
         'F2: la trace date l''attestation';
  -- L'enveloppe d'origine survit à l'estampille (le || jsonb ne doit rien écraser).
  ASSERT (SELECT metadata->>'section' FROM pending_change WHERE id = v_pc_manual) = 'contacts',
         'F2: l''estampille d''attestation n''écrase pas l''enveloppe d''origine';
  -- AUCUN re-dispatch : c'est la contrepartie de l'attestation. La fiche n'a pas bougé par la
  -- machine — le payload (chapo « Nouveau chapo ») n'a été écrit nulle part.
  ASSERT NOT EXISTS (SELECT 1 FROM object_description d WHERE d.object_id = v_objA),
         'F2: approbation attestée ⇒ AUCUN re-dispatch, la machine n''a rien écrit dans la fiche';

  -- (F2.5) Idempotence + accents restaurés (décision contrôleur B : les messages vifs étaient
  -- translittérés — « deja resolue » — trace d'un déploiement historique ; ils remontent
  -- jusqu'à l'écran du modérateur).
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_editor, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_denied := false; v_msg := NULL;
    BEGIN PERFORM api.approve_pending_change(v_pc_manual, 'deux fois', TRUE);
    EXCEPTION WHEN SQLSTATE '22023' THEN v_denied := true; v_msg := SQLERRM; END;
    ASSERT v_denied, 'F2: une ligne déjà traitée ne se ré-approuve pas';
    ASSERT v_msg LIKE '%déjà résolue%',
           'F2: le message porte ses accents (le chemin de déploiement ne les translittère pas)';
  RESET ROLE;

  -- (F2.6) list_pending_changes émet les colonnes de soumission.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_editor, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT EXISTS (
      SELECT 1 FROM api.list_pending_changes('pending', v_objA, 50, 0) lp
      WHERE lp.id = v_pc_auto AND lp.submission_id = v_subid AND lp.manual_apply = FALSE
        AND lp.submission_note = 'Tarifs de saison mis à jour'),
      'F2: list_pending_changes émet submission_id / submission_note / manual_apply';
    ASSERT EXISTS (
      SELECT 1 FROM api.list_pending_changes('approved', v_objA, 50, 0) lp
      WHERE lp.id = v_pc_manual AND lp.manual_apply = TRUE AND lp.actor_label IS NOT NULL),
      'F2: la ligne attestée sort manual_apply=TRUE et nomme l''acteur';
    -- La jointure sur la soumission doit être LEFT : une ligne §120/§122 sans submission_id
    -- disparaîtrait de la file de modération avec un INNER JOIN — régression silencieuse et
    -- totale du module existant, invisible à toute assertion qui ne regarde que le portail.
    ASSERT EXISTS (
      SELECT 1 FROM api.list_pending_changes('applied', v_objA, 50, 0) lp
      WHERE lp.id = v_pc_legacy AND lp.submission_id IS NULL AND lp.manual_apply = FALSE),
      'F2: une ligne SANS soumission reste listée (jointure LEFT, pas INNER)';
  RESET ROLE;

  -- (F2.6 bis) La colonne manual_apply projette le prédicat de la MACHINE, jamais la
  -- DÉCLARATION du soumetteur. Deux lignes pièges, insérées sous owner :
  --  • v_pc_decl : AUCUN writer mais `manual_apply: false` déclaré. Si la colonne suivait la
  --    déclaration, la file annoncerait « application automatique » sur une rubrique que la
  --    machine ne sait pas appliquer : le conseiller cliquerait Approuver, prendrait un refus,
  --    et il ne lui resterait que le rejet — la panne que D9 existe pour fermer, réintroduite
  --    par la colonne d'affichage.
  --  • v_pc_poison : `manual_apply` à une valeur ABERRANTE ('oui'). metadata est un jsonb LIBRE
  --    alimenté par plusieurs producteurs : un cast nu ((metadata->>'manual_apply')::boolean,
  --    littéralement la ligne du brief) n'abattrait pas la ligne fautive mais la LECTURE
  --    ENTIÈRE, en 22P02, pour tout le monde (classe §17m). C'est cette assertion-là qui
  --    protège l'écart, et non plus un commentaire.
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
  INSERT INTO pending_change (object_id, target_table, target_pk, action, payload,
                              submitted_by, status, metadata)
  VALUES (v_objA, 'contact_channel', NULL, 'update', '{}'::jsonb, v_user, 'pending',
          jsonb_build_object('rpc', NULL, 'manual_apply', false, 'section', 'contacts', 'field', 'Déclaration mensongère'))
  RETURNING id INTO v_pc_decl;
  INSERT INTO pending_change (object_id, target_table, target_pk, action, payload,
                              submitted_by, status, metadata)
  VALUES (v_objA, 'contact_channel', NULL, 'update', '{}'::jsonb, v_user, 'pending',
          jsonb_build_object('rpc', NULL, 'manual_apply', 'oui', 'section', 'contacts', 'field', 'Valeur aberrante'))
  RETURNING id INTO v_pc_poison;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_editor, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT EXISTS (
      SELECT 1 FROM api.list_pending_changes('pending', v_objA, 50, 0) lp
      WHERE lp.id = v_pc_decl AND lp.manual_apply = TRUE),
      'F2: manual_apply suit l''ABSENCE DE WRITER, pas la déclaration du soumetteur';
    -- La file ENTIÈRE reste lisible malgré la valeur aberrante, et la ligne empoisonnée y est.
    SELECT count(*) INTO v_lp_count FROM api.list_pending_changes('pending', v_objA, 50, 0);
    ASSERT v_lp_count >= 2,
      'F2: une valeur aberrante dans metadata n''abat pas la LECTURE de la file (aucun cast nu)';
    ASSERT EXISTS (
      SELECT 1 FROM api.list_pending_changes('pending', v_objA, 50, 0) lp
      WHERE lp.id = v_pc_poison AND lp.manual_apply = TRUE),
      'F2: la ligne à valeur aberrante est listée, et étiquetée sur l''absence de writer';
    -- Refermées : v_objA doit finir à zéro ligne pending (bloc F, Task 8).
    PERFORM api.reject_pending_change(v_pc_decl, 'ligne de fixture — refermée');
    PERFORM api.reject_pending_change(v_pc_poison, 'ligne de fixture — refermée');
  RESET ROLE;
  ASSERT (SELECT count(*) FROM pending_change
           WHERE id IN (v_pc_decl, v_pc_poison) AND status = 'rejected') = 2,
         'F2: les deux lignes pièges de la colonne manual_apply sont refermées';

  -- (F2.7) Rejet groupé — motif OBLIGATOIRE, et ne touche que ce qui reste « pending ».
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_editor, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    -- Motif absent puis vide : sondés sur une soumission VALIDE et avec les droits, sinon
    -- l'exception prouverait le mauvais garde-fou. Le prestataire doit TOUJOURS savoir pourquoi.
    v_denied := false;
    BEGIN PERFORM api.reject_fiche_submission(v_subid, NULL);
    EXCEPTION WHEN SQLSTATE '22023' THEN v_denied := true; END;
    ASSERT v_denied, 'F2: un rejet groupé SANS motif est refusé';
    v_denied := false;
    BEGIN PERFORM api.reject_fiche_submission(v_subid, '   ');
    EXCEPTION WHEN SQLSTATE '22023' THEN v_denied := true; END;
    ASSERT v_denied, 'F2: un motif fait uniquement d''espaces est refusé aussi';

    v_res2 := api.reject_fiche_submission(v_subid, 'Le reste est à revoir');
    ASSERT (v_res2->>'rejected_count')::int = 1,
           'F2: seule la ligne encore pending est rejetée (l''attestée n''est pas retouchée)';
  RESET ROLE;
  ASSERT (SELECT count(*) FROM pending_change WHERE submission_id = v_subid AND status = 'pending') = 0,
         'F2: aucun motif refusé n''a rejeté quoi que ce soit au passage';
  ASSERT (SELECT status FROM pending_change WHERE id = v_pc_auto) = 'rejected',
         'F2: reject_fiche_submission rejette les pending restants';
  ASSERT (SELECT status FROM pending_change WHERE id = v_pc_manual) = 'approved',
         'F2: le rejet groupé ne touche PAS les lignes déjà traitées';

  -- ISSUE nº1 « PARTIEL » : la soumission est entièrement traitée, mais mélangée. C'est
  -- exactement l'entrée que la résolution (trigger, Task 8) traduira en statut 'partial' — le
  -- statut agrégé lui-même est prouvé au bloc F, cette task ne le pose pas (le brief l'interdit
  -- explicitement : « ne pas dupliquer la logique ici »).
  ASSERT (SELECT count(*) FROM pending_change WHERE submission_id = v_subid AND status = 'approved') = 1
     AND (SELECT count(*) FROM pending_change WHERE submission_id = v_subid AND status = 'rejected') = 1,
         'F2: issue PARTIELLE — 1 approuvé + 1 rejeté, plus rien en attente';
  -- Le DÉTAIL PAR SECTION, relu là où le prestataire le lit vraiment : « validée » n'est jamais
  -- une affirmation globale, c'est un état PAR rubrique, avec son motif.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    SELECT c INTO v_detail
      FROM jsonb_array_elements(api.list_my_submissions(20, v_objA)) s,
           jsonb_array_elements(s->'changes') c
     WHERE s->>'id' = v_subid::text AND c->>'section' = 'contacts';
    ASSERT v_detail->>'status' = 'approved',
           'F2: côté prestataire, la rubrique « contacts » est validée';
    SELECT c INTO v_detail
      FROM jsonb_array_elements(api.list_my_submissions(20, v_objA)) s,
           jsonb_array_elements(s->'changes') c
     WHERE s->>'id' = v_subid::text AND c->>'section' = 'openings';
    ASSERT v_detail->>'status' = 'rejected' AND v_detail->>'review_note' = 'Le reste est à revoir',
           'F2: côté prestataire, la rubrique « openings » est refusée AVEC son motif';
  RESET ROLE;

  -- (F2.8) La garde d'autorisation des RPC GROUPÉS, isolée. Sondée maintenant que v_subid n'a
  -- plus AUCUNE ligne pending : sans sa propre garde, chaque RPC groupé parcourrait une boucle
  -- vide et RENDRAIT UN SUCCÈS à un utilisateur sans droit. Plus tôt dans le bloc, la garde de
  -- approve_pending_change/reject_pending_change aurait masqué l'absence de celle-ci.
  FOREACH v_persona IN ARRAY ARRAY[v_viewer, v_orgadm] LOOP
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_persona, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
      v_denied := false;
      BEGIN PERFORM api.approve_fiche_submission(v_subid, 'boucle vide', TRUE);
      EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
      ASSERT v_denied,
        'F2: approve_fiche_submission porte SA garde (une boucle vide ne doit pas rendre succès)';
      v_denied := false;
      BEGIN PERFORM api.reject_fiche_submission(v_subid, 'boucle vide');
      EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
      ASSERT v_denied,
        'F2: reject_fiche_submission porte SA garde (le contrôle du motif ne la remplace pas)';
    RESET ROLE;
  END LOOP;

  -- (F2.8 bis) Le contrôle du motif de reject_fiche_submission, sondé là où il est SEUL à
  -- pouvoir mordre : boucle VIDE (v_subid n'a plus aucune ligne pending) et sous les droits de
  -- v_editor (pour que 42501 ne se substitue pas à 22023). Ailleurs, la garde jumelle de
  -- api.reject_pending_change lève le MÊME message avec le MÊME SQLSTATE : les deux sondes de
  -- F2.7 passent à l'identique si l'on supprime le contrôle propre. Sans lui, cet appel
  -- rendrait {"rejected_count": 0} — un refus SILENCIEUX ET SANS MOTIF.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_editor, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_denied := false;
    BEGIN PERFORM api.reject_fiche_submission(v_subid, NULL);
    EXCEPTION WHEN SQLSTATE '22023' THEN v_denied := true; END;
    ASSERT v_denied,
      'F2: le motif reste obligatoire MÊME sur une soumission sans ligne à traiter (pas de refus silencieux)';
  RESET ROLE;

  -- (F2.8 ter) La garde de modération est FAIL-CLOSED sur une ligne orpheline. Une ligne
  -- pending_change à object_id NULL est fabricable par tout `authenticated`
  -- (api.submit_pending_change accepte p_object_id NULL en sautant son propre contrôle) ; or
  -- api.user_can_moderate_object rend NULL — et non FALSE — sur un object_id NULL, donc
  -- `IF NOT ...` ne lève pas. Tant que rpc NULL était refusé avant toute écriture le trou
  -- était inerte ; la branche attestée est la première écriture atteignable derrière cette
  -- garde. v_editor a de vrais droits de modération — mais sur v_objA, PAS sur une ligne qui
  -- n'appartient à aucun objet : c'est bien la garde, et non l'absence de permission, que
  -- cette sonde interroge.
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
  INSERT INTO pending_change (object_id, target_table, target_pk, action, payload,
                              submitted_by, status, metadata)
  VALUES (NULL, 'contact_channel', NULL, 'update', '{}'::jsonb, v_user, 'pending',
          jsonb_build_object('rpc', NULL, 'section', 'contacts', 'field', 'Orpheline'))
  RETURNING id INTO v_pc_orphan;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_editor, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_denied := false;
    BEGIN PERFORM api.approve_pending_change(v_pc_orphan, 'j''atteste', TRUE);
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
    ASSERT v_denied,
      'F2: une ligne sans objet n''est approuvable par PERSONNE (garde fail-closed, 42501)';
  RESET ROLE;
  ASSERT (SELECT status FROM pending_change WHERE id = v_pc_orphan) = 'pending'
     AND (SELECT metadata ? 'attested_by' FROM pending_change WHERE id = v_pc_orphan) = FALSE,
         'F2: la ligne orpheline n''a reçu aucune attestation';

  -- (F2.9) ISSUE nº2 « TOUT APPROUVÉ » — v_objG, deux changements auto, approbation groupée.
  -- Deux changements de la MÊME section : ce qui est prouvé ici est la BOUCLE (deux
  -- re-dispatches successifs comptés), pas la variété des rubriques.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_sub := api.submit_actor_fiche(v_objG, jsonb_build_array(
      jsonb_build_object('target_table','opening_period','target_pk',NULL,'action','update',
        'payload', jsonb_build_object('periods', '[]'::jsonb),
        'metadata', jsonb_build_object('rpc','save_object_openings','section','openings',
                                       'manual_apply',false,'field','Horaires été','before','x','after','z')),
      jsonb_build_object('target_table','opening_period','target_pk',NULL,'action','update',
        'payload', jsonb_build_object('periods', '[]'::jsonb),
        'metadata', jsonb_build_object('rpc','save_object_openings','section','openings',
                                       'manual_apply',false,'field','Horaires hiver','before','y','after','w'))),
      'Tout est bon');
  RESET ROLE;
  v_subG := (v_sub->>'submission_id')::uuid;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_editor, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_res2 := api.approve_fiche_submission(v_subG, 'OK', FALSE);
    ASSERT (v_res2->>'applied_count')::int = 2,
           'F2: l''approbation groupée applique CHAQUE changement auto (boucle, pas le premier seul)';
    ASSERT (v_res2->>'approved_manual_count')::int = 0
       AND (v_res2->>'skipped_manual_count')::int = 0,
           'F2: aucune ligne manuelle dans cette soumission — les deux compteurs restent à zéro';
  RESET ROLE;
  ASSERT (SELECT count(*) FROM pending_change WHERE submission_id = v_subG AND status = 'applied') = 2
     AND (SELECT count(*) FROM pending_change WHERE submission_id = v_subG AND status <> 'applied') = 0,
         'F2: issue TOUT APPROUVÉ — les 2 changements sont applied, plus rien en attente';

  -- (F2.10) ISSUE nº3 « TOUT REJETÉ » — v_objH, 1 auto + 1 manuel. Le rejet groupé doit
  -- emporter AUSSI la ligne manual_apply : elle n'a pas de writer, mais un refus n'en demande
  -- aucun — c'était d'ailleurs le SEUL geste possible sur ces lignes avant D9.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_subH := (api.submit_actor_fiche(v_objH, jsonb_build_array(
      jsonb_build_object('target_table','opening_period','target_pk',NULL,'action','update',
        'payload', jsonb_build_object('periods', '[]'::jsonb),
        'metadata', jsonb_build_object('rpc','save_object_openings','section','openings',
                                       'manual_apply',false,'field','Horaires','before','x','after','z')),
      jsonb_build_object('target_table','contact_channel','target_pk',NULL,'action','update',
        'payload', jsonb_build_object('value','0262000099'),
        'metadata', jsonb_build_object('rpc',NULL,'section','contacts',
                                       'manual_apply',true,'field','Contacts','before','a','after','b'))),
      'À revoir')->>'submission_id')::uuid;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_editor, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_res2 := api.reject_fiche_submission(v_subH, 'Informations non conformes');
    ASSERT (v_res2->>'rejected_count')::int = 2,
           'F2: le rejet groupé emporte AUSSI la ligne manual_apply (un refus n''a pas besoin de writer)';
  RESET ROLE;
  ASSERT (SELECT count(*) FROM pending_change WHERE submission_id = v_subH AND status = 'rejected') = 2
     AND (SELECT count(*) FROM pending_change WHERE submission_id = v_subH AND status <> 'rejected') = 0,
         'F2: issue TOUT REJETÉ — les 2 changements sont rejected, plus rien en attente';

  -- (F2.11) ISSUE nº4 « PARTIEL INACHEVÉ » — v_objI, 1 auto + 1 manuel, approuvés SANS
  -- p_include_manual. C'est le cas qui ne doit surtout PAS se résoudre : la ligne manuelle reste
  -- pending, donc l'office n'a pas fini, donc le verrou uq_fiche_submission_open doit TENIR.
  -- S'il lâchait ici, l'acteur rouvrirait une soumission pendant que l'office travaille encore.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_subI := (api.submit_actor_fiche(v_objI, jsonb_build_array(
      jsonb_build_object('target_table','opening_period','target_pk',NULL,'action','update',
        'payload', jsonb_build_object('periods', '[]'::jsonb),
        'metadata', jsonb_build_object('rpc','save_object_openings','section','openings',
                                       'manual_apply',false,'field','Horaires','before','x','after','z')),
      jsonb_build_object('target_table','contact_channel','target_pk',NULL,'action','update',
        'payload', jsonb_build_object('value','0262000098'),
        'metadata', jsonb_build_object('rpc',NULL,'section','contacts',
                                       'manual_apply',true,'field','Contacts','before','a','after','b'))),
      'Mélange auto + manuel')->>'submission_id')::uuid;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_editor, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_res2 := api.approve_fiche_submission(v_subI, 'Horaires OK, le reste à reporter', FALSE);
    ASSERT (v_res2->>'applied_count')::int = 1,
           'F2: partiel — le changement auto est appliqué';
    ASSERT (v_res2->>'skipped_manual_count')::int = 1,
           'F2: partiel — la ligne manuelle est SAUTÉE, pas approuvée en douce';
    ASSERT (v_res2->>'approved_manual_count')::int = 0,
           'F2: partiel — sans p_include_manual, aucune attestation n''est posée à l''insu du modérateur';
  RESET ROLE;
  SELECT count(*) INTO v_pending_left
    FROM pending_change WHERE submission_id = v_subI AND status = 'pending';
  ASSERT v_pending_left = 1,
         'F2: partiel INACHEVÉ — il reste une ligne à traiter, la soumission ne PEUT pas se résoudre';
  ASSERT (SELECT status FROM fiche_submission WHERE id = v_subI) = 'pending'
     AND (SELECT resolved_at FROM fiche_submission WHERE id = v_subI) IS NULL,
         'F2: partiel INACHEVÉ — la soumission reste ouverte tant qu''une ligne est en attente';
  -- Et le verrou TIENT : la conséquence opérationnelle de « non résolue ».
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_denied := false;
    BEGIN PERFORM api.submit_actor_fiche(v_objI, jsonb_build_array(
      jsonb_build_object('target_table','opening_period','target_pk',NULL,'action','update',
        'payload', jsonb_build_object('periods', '[]'::jsonb),
        'metadata', jsonb_build_object('rpc','save_object_openings','section','openings',
                                       'manual_apply',false,'field','Horaires','before','x','after','z'))), NULL);
    EXCEPTION WHEN SQLSTATE 'PT409' THEN v_denied := true; END;
    ASSERT v_denied,
      'F2: partiel INACHEVÉ — le verrou « une seule vérification ouverte » tient tant que l''office n''a pas fini';
  RESET ROLE;
  -- Achèvement : le modérateur revient et atteste. La ligne sort enfin de « pending ».
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_editor, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_res2 := api.approve_fiche_submission(v_subI, 'Contacts reportés à la main', TRUE);
    ASSERT (v_res2->>'approved_manual_count')::int = 1
       AND (v_res2->>'applied_count')::int = 0
       AND (v_res2->>'skipped_manual_count')::int = 0,
           'F2: l''achèvement ne retraite QUE ce qui restait pending';
  RESET ROLE;
  ASSERT (SELECT count(*) FROM pending_change WHERE submission_id = v_subI AND status = 'pending') = 0,
         'F2: après achèvement, plus aucune ligne en attente — la résolution (Task 8) peut opérer';
  -- Le chemin GROUPÉ laisse la MÊME trace attestable que le chemin unitaire : sans cela, une
  -- attestation de masse serait anonyme, et « qui a dit que c'était reporté ? » resterait sans
  -- réponse exactement là où le volume la rend le plus nécessaire.
  ASSERT (SELECT (metadata->>'attested_by')::uuid FROM pending_change
           WHERE submission_id = v_subI AND metadata->>'rpc' IS NULL) = v_editor,
         'F2: l''attestation GROUPÉE nomme elle aussi son auteur';

  -- Verrou de sortie du bloc : le bloc F (Task 8) exige que object.is_editing(v_objA) soit
  -- retombé, ce qui n'arrive que si PLUS AUCUNE ligne n'y est pending. F2 a déposé cinq
  -- fixtures sur v_objA (escalade, save_object_rooms, §120, déclaration mensongère, valeur
  -- aberrante) : cette assertion est la garde qui mordra si l'une d'elles est un jour ajoutée
  -- sans être refermée, plutôt que de laisser la Task 8 échouer loin de la cause.
  ASSERT (SELECT count(*) FROM pending_change WHERE object_id = v_objA AND status = 'pending') = 0,
         'F2: v_objA finit à ZÉRO ligne pending (prérequis du bloc F, Task 8)';
  RAISE NOTICE 'test_actor_portal blocs A-D1, E, H, D2, G, F2 OK';
END$$;
ROLLBACK;
