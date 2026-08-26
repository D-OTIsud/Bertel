-- test_explorer_name_relevance.sql
-- Garde permanente du BONUS NOM de la recherche Exploreur (spec 2026-08-26, migration 16v).
--
-- Bloc A — api.get_filtered_object_ids : les étages de `relevance` sont ÉTANCHES et
--   ordonnent correctement. Le témoin `bruit` porte la saisie RÉPÉTÉE 8 fois dans sa
--   description mais PAS dans son nom : c'est exactement le cas qui, avant ce correctif,
--   passait DEVANT la fiche nommée « Le Jardin Créole » en production (2.2395 vs 2.2577,
--   un écart de bruit). Un test qui n'opposerait qu'un nom exact à une fiche sans aucune
--   occurrence serait VACANT — il passerait déjà avant le patch.
--
-- Bloc B — api.list_object_resources_filtered_page : la clé `relevance` est RENDUE par
--   carte. Sans elle l'ORDER BY serveur est invisible au front, qui recolle les pages de
--   plusieurs buckets et retombe sur l'alphabétique : le classement serveur ne sert à rien.
--
-- Bloc C — sans terme de recherche, `relevance` vaut 0 partout (contrat §109 : l'ordre
--   historique alphabétique doit rester identique).
--
-- HARNAIS : témoins en `draft` + p_status = published+draft ⇒ chemin VIF (`object`), car
-- internal.mv_filtered_objects ne voit pas les lignes d'une transaction non commitée — un
-- test en `published` seul interrogerait le MV et n'asserterait que des ensembles VIDES
-- (piège §204). Transactionnel : ROLLBACK, rien ne persiste.
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_exact1 text := 'HLORUN9999999820';  -- nom EXACTEMENT la saisie (homonyme 1)
  v_exact2 text := 'LOIRUN9999999821';  -- nom EXACTEMENT la saisie (homonyme 2, autre type)
  v_prefix text := 'HLORUN9999999822';  -- le nom COMMENCE par la saisie
  v_infix  text := 'HLORUN9999999823';  -- le nom CONTIENT la saisie
  v_noise  text := 'RESRUN9999999824';  -- saisie DENSE dans la description, absente du nom
  v_ids    text[];
  v_rel_exact real; v_rel_prefix real; v_rel_infix real; v_rel_noise real;
BEGIN
  INSERT INTO object (id, object_type, name, status) VALUES
    (v_exact1, 'HLO', 'Le Jardin Creole Test',        'draft'),
    (v_exact2, 'LOI', 'Le Jardin Creole Test',        'draft'),
    (v_prefix, 'HLO', 'Le Jardin Creole Test Annexe', 'draft'),
    (v_infix,  'HLO', 'Kaz Le Jardin Creole Test',    'draft'),
    (v_noise,  'RES', 'Etablissement Temoin Bruit',   'draft');

  -- Hypothèse du test : name_normalized est dérivé par la base. S'il ne l'est pas, tout
  -- le fichier deviendrait vacant en silence (le bonus ne matcherait jamais) — on échoue
  -- bruyamment plutôt que de rendre du vert pour rien.
  PERFORM 1 FROM object WHERE id = v_exact1 AND name_normalized = 'le jardin creole test';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'name_normalized non derive automatiquement — le test serait vacant';
  END IF;

  INSERT INTO object_description (object_id, description)
  VALUES (v_noise, repeat('jardin creole test ', 8));

  SELECT array_agg(f.object_id ORDER BY f.relevance DESC, f.object_id),
         max(f.relevance) FILTER (WHERE f.object_id = v_exact1),
         max(f.relevance) FILTER (WHERE f.object_id = v_prefix),
         max(f.relevance) FILTER (WHERE f.object_id = v_infix),
         max(f.relevance) FILTER (WHERE f.object_id = v_noise)
    INTO v_ids, v_rel_exact, v_rel_prefix, v_rel_infix, v_rel_noise
  FROM api.get_filtered_object_ids(
         '{"search_mode":"global"}'::jsonb, NULL,
         ARRAY['published','draft']::object_status[],
         'Le Jardin Créole Test') f
  WHERE f.object_id IN (v_exact1, v_exact2, v_prefix, v_infix, v_noise);

  ASSERT array_length(v_ids, 1) = 5,
    format('les 5 temoins doivent matcher le plein texte, vu %s', v_ids);
  ASSERT v_ids[1] IN (v_exact1, v_exact2) AND v_ids[2] IN (v_exact1, v_exact2),
    format('les deux homonymes exacts doivent occuper les positions 1-2, vu %s', v_ids);
  ASSERT v_ids[3] = v_prefix, format('le prefixe doit etre 3e, vu %s', v_ids);
  ASSERT v_ids[4] = v_infix,  format('le contenu doit etre 4e, vu %s', v_ids);
  ASSERT v_ids[5] = v_noise,
    format('la fiche DENSE sans le nom doit etre derniere (le cas prod), vu %s', v_ids);

  ASSERT v_rel_exact  >= 5.0 AND v_rel_exact  < 6.0, format('exact hors [5,6): %s',   v_rel_exact);
  ASSERT v_rel_prefix >= 4.0 AND v_rel_prefix < 5.0, format('prefixe hors [4,5): %s',  v_rel_prefix);
  ASSERT v_rel_infix  >= 3.0 AND v_rel_infix  < 4.0, format('contenu hors [3,4): %s',  v_rel_infix);
  ASSERT v_rel_noise  >= 2.0 AND v_rel_noise  < 3.0, format('plein texte hors [2,3): %s', v_rel_noise);

  RAISE NOTICE 'A/ etages de relevance OK (exact=% prefixe=% contenu=% bruit=%)',
    v_rel_exact, v_rel_prefix, v_rel_infix, v_rel_noise;
END $$;

DO $$
DECLARE
  v_hit  text := 'HLORUN9999999830';
  v_page jsonb;
  v_first jsonb;
BEGIN
  -- Le témoin du bloc B est PUBLIÉ, contrairement à ceux du bloc A. Ce n'est pas une
  -- coquetterie : list_object_resources_filtered_page délègue le rendu des cartes à
  -- api.get_object_cards_batch, qui est authorize-once (§36) et borne les ids au
  -- périmètre lisible = publié ∪ étendu. Le périmètre étendu dérive de l'ADHÉSION ORG,
  -- qu'un témoin synthétique n'a pas — vérifié : même en service_role, un draft témoin
  -- ressort avec extended=0. Un témoin draft rendrait donc TOUJOURS une page vide et le
  -- bloc n'asserterait que du vide (test vacant).
  -- p_status reste published+draft pour forcer le chemin VIF de get_filtered_object_ids :
  -- en published seul il lirait internal.mv_filtered_objects, qui ne voit pas les lignes
  -- d'une transaction non commitée (piège §204) — vide des deux côtés, pour l'autre raison.
  INSERT INTO object (id, object_type, name, status)
  VALUES (v_hit, 'HLO', 'Le Jardin Creole Test B', 'published');

  v_page := api.list_object_resources_filtered_page(
              NULL, ARRAY['fr'], 5, '{"search_mode":"global"}'::jsonb, NULL,
              ARRAY['published','draft']::object_status[],
              'Le Jardin Creole Test B', 'none', NULL, NULL, 'card')::jsonb;

  v_first := v_page->'data'->0;
  ASSERT v_first->>'id' = v_hit,
    format('le temoin doit etre en tete de page, vu %s', v_first->>'id');
  ASSERT v_first ? 'relevance',
    'la carte DOIT porter la cle relevance (sans elle le front retombe sur l alphabetique)';
  ASSERT (v_first->>'relevance')::real >= 5.0,
    format('relevance de la carte hors etage nom-exact: %s', v_first->>'relevance');

  RAISE NOTICE 'B/ relevance emise par carte OK (%)', v_first->>'relevance';
END $$;

DO $$
DECLARE
  v_any text := 'HLORUN9999999840';
  v_rel real;
BEGIN
  INSERT INTO object (id, object_type, name, status)
  VALUES (v_any, 'HLO', 'Temoin Sans Recherche', 'draft');

  SELECT f.relevance INTO v_rel
  FROM api.get_filtered_object_ids('{}'::jsonb, NULL,
         ARRAY['published','draft']::object_status[], NULL) f
  WHERE f.object_id = v_any;

  ASSERT v_rel = 0::real,
    format('sans terme, relevance doit valoir 0 (ordre historique preserve), vu %s', v_rel);

  RAISE NOTICE 'C/ neutralite sans terme de recherche OK';
END $$;

ROLLBACK;
