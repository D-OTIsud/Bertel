-- test_list_resolver_internal.sql
-- Garde du découpage résolveur (§211, manifest E1).
--
-- NON VACUITÉ : on ne se contente pas de vérifier que les fonctions existent —
-- on crée 205 objets témoins publiés, on résout, et on COMPTE. Sans témoins
-- au-delà de 200, les deux plafonds rendraient le même nombre et le test
-- passerait quel que soit le code.
--
-- Self-contained + transactionnel (ROLLBACK ; rien ne persiste).
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_n int;
  -- FORCER LE CHEMIN VIF — le point délicat de ce test.
  -- api.get_filtered_object_ids lit internal.mv_filtered_objects dès que
  -- `use_mv` est vrai, et `use_mv` exige DEUX conditions : aucune clé de filtre
  -- « vive » ET (p_status IS NULL OR p_status <@ ARRAY['published']).
  -- Passer p_published_only=false donne p_status=NULL, ce qui laisse `use_mv`
  -- VRAI : les témoins insérés dans cette transaction seraient invisibles et le
  -- test passerait sur les données pré-existantes — vacuité parfaite.
  -- La seule façon fiable de basculer sur le chemin vif est une clé vive :
  -- `city_any`, comparée à immutable_unaccent(lower(object_location.city)) de
  -- la localisation principale, des DEUX côtés.
  v_buckets jsonb := '{"buckets":[{"filters":{"city_any":["Zzresolveur"]}}]}'::jsonb;
BEGIN
  -- ---------- Témoins : 205 fiches publiées dans une commune inventée ----------
  INSERT INTO object (id, object_type, name, status, published_at)
  SELECT 'RSLV' || lpad(g::text, 12, '0'), 'HLO', 'Resolveur ' || g, 'published', now()
  FROM generate_series(1, 205) g;

  INSERT INTO object_location (object_id, city, is_main_location)
  SELECT 'RSLV' || lpad(g::text, 12, '0'), 'Zzresolveur', true
  FROM generate_series(1, 205) g;

  -- A. Le MOTEUR interne rend les 205 — EXACTEMENT, pas « plus de 200 » : un
  -- compte exact prouve à la fois que le plafond est levé et que ce sont bien
  -- NOS témoins qui remontent (une commune inventée ⇒ 0 fiche pré-existante).
  SELECT count(*) INTO v_n
  FROM internal.resolve_list_object_ids(v_buckets, true, 2001);
  ASSERT v_n = 205,
    format('le moteur interne doit rendre les 205 témoins (obtenu %s) — si 0, le chemin MV a été pris', v_n);

  -- B. Le CONTRAT PUBLIC reste plafonné à 200, même si on demande 2001.
  SELECT count(*) INTO v_n
  FROM api.resolve_list_object_ids(v_buckets, true, 2001);
  ASSERT v_n = 200,
    format('api.resolve_list_object_ids doit rester plafonné à 200 (obtenu %s)', v_n);

  -- C. Le défaut du contrat public est inchangé.
  SELECT count(*) INTO v_n
  FROM api.resolve_list_object_ids(v_buckets, true);
  ASSERT v_n = 200,
    format('le défaut du contrat public doit rester 200 (obtenu %s)', v_n);
END $$;

-- D. Le moteur interne n'est pas exécutable par authenticated.
DO $$
DECLARE
  v_ok boolean;
BEGIN
  SELECT has_function_privilege('authenticated',
    'internal.resolve_list_object_ids(jsonb, boolean, int)', 'EXECUTE')
  INTO v_ok;
  ASSERT v_ok = FALSE,
    'internal.resolve_list_object_ids ne doit PAS être exécutable par authenticated';

  SELECT has_function_privilege('anon',
    'internal.resolve_list_object_ids(jsonb, boolean, int)', 'EXECUTE')
  INTO v_ok;
  ASSERT v_ok = FALSE,
    'internal.resolve_list_object_ids ne doit PAS être exécutable par anon';

  -- E. Le contrat public, lui, reste ouvert à authenticated (non-régression).
  SELECT has_function_privilege('authenticated',
    'api.resolve_list_object_ids(jsonb, boolean, int)', 'EXECUTE')
  INTO v_ok;
  ASSERT v_ok = TRUE,
    'api.resolve_list_object_ids doit rester exécutable par authenticated';
END $$;

ROLLBACK;
