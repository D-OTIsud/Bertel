-- =====================================================================
-- migration_classification_scheme_logos.sql
-- Renseigne ref_classification_scheme.icon_url (logos des labels).
--
-- CONTEXTE
-- Les colonnes `icon_url` existaient depuis l'origine sur
-- `ref_classification_scheme` ET `ref_classification_value`, mais etaient
-- vides a 100 % (36 schemas, 0 valeur renseignee) ET aucune voie de lecture
-- ne les emettait. Le meme lot ajoute `scheme_icon_url` aux trois blocs
-- classification de `api.get_object_resource` (classifications /
-- sustainability_labels / accessibility_labels) : sans cela, remplir cette
-- colonne n'afficherait rien.
--
-- HEBERGEMENT
-- Les fichiers vivent dans le bucket public `assets`, dossier `labels/`,
-- en PNG hauteur 128 px (ratio preserve, marges rognees, transparence
-- conservee quand la source en avait). On ne pointe PAS sur les sites des
-- labels : un hotlink casse au premier renommage et fait appeler un tiers
-- depuis chaque page publique.
--
-- PERIMETRE — 19 schemas sur 36. Les absents le sont pour deux raisons
-- DISTINCTES, qu'il ne faut pas confondre :
--
--  (a) PAS DE LOGO PAR NATURE (11) — ce n'est pas un manque a combler.
--      * 8 classements par etoiles (meuble_stars, hot_stars, camp_stars,
--        prl_stars, residence_tourisme_stars, village_vacances_stars,
--        auberge_collective_stars, ot_category) : le grade est rendu par la
--        barre d'etoiles/epis/cles (§174). Y poser un panonceau Atout France
--        identique pour les huit ferait doublon avec cette barre.
--      * 3 typologies internes (retail_category, type_act, type_hot) :
--        `is_distinction = false`, ce ne sont pas des marques.
--
--  (b) LOGO NON ENCORE OBTENU (6) — a completer quand le kit officiel arrive.
--      qualite_tourisme_reunion (25 fiches — le seul qui pese),
--      LBL_QUALITE_TOURISME (1 fiche ; marque supprimee au 31/12/2026),
--      cte (2), LBL_ECO_LABEL_UE (2), jardin_remarquable (0),
--      maison_des_illustres (0).
--
-- `icon_url` NULL est donc une valeur NORMALE et permanente pour le cas (a).
-- Tout consommateur DOIT replier sur le libelle — le logo decore, il ne
-- remplace jamais le nom du label.
--
-- Idempotent : cible par `code` (UNIQUE), rejouable sans effet de bord.
-- =====================================================================

BEGIN;

WITH logos(code, file) AS (
  VALUES
    ('accueil_paysan',             'accueil_paysan.png'),
    ('accueil_velo',               'accueil_velo.png'),
    ('bienvenue_ferme',            'bienvenue_ferme.png'),
    ('clevacances_keys',           'clevacances_keys.png'),
    -- Declinaison « La Reunion » de la marque : tous les porteurs sont reunionnais.
    ('esprit_parc',                'esprit_parc.png'),
    ('gites_epics',                'gites_epics.png'),
    ('logis',                      'logis.png'),
    ('maitre_restaurateur',        'maitre_restaurateur.png'),
    ('monument_historique',        'monument_historique.png'),
    ('musee_de_france',            'musee_de_france.png'),
    ('tables_auberges',            'tables_auberges.png'),
    ('LBL_ATR',                    'LBL_ATR.png'),
    ('LBL_CLEF_VERTE',             'LBL_CLEF_VERTE.png'),
    ('LBL_DESTINATION_EXCELLENCE', 'LBL_DESTINATION_EXCELLENCE.png'),
    ('LBL_FLOCON_VERT',            'LBL_FLOCON_VERT.png'),
    ('LBL_GREEN_DESTINATIONS',     'LBL_GREEN_DESTINATIONS.png'),
    ('LBL_LABEL_BAS_CARBONE',      'LBL_LABEL_BAS_CARBONE.png'),
    ('LBL_PAVILLON_BLEU',          'LBL_PAVILLON_BLEU.png'),
    ('LBL_TOURISME_HANDICAP',      'LBL_TOURISME_HANDICAP.png')
)
UPDATE ref_classification_scheme s
SET icon_url = 'https://ryycrdhlkmzpxwwwwupy.supabase.co/storage/v1/object/public/assets/labels/' || l.file
FROM logos l
WHERE s.code = l.code;

-- Garde fail-closed : si un code disparaissait du catalogue (renommage), le
-- backfill le raterait SILENCIEUSEMENT et le logo ne s'afficherait jamais.
DO $$
DECLARE
  v_missing INTEGER;
BEGIN
  SELECT count(*) INTO v_missing
  FROM (VALUES
    ('accueil_paysan'), ('accueil_velo'), ('bienvenue_ferme'), ('clevacances_keys'),
    ('esprit_parc'), ('gites_epics'), ('logis'), ('maitre_restaurateur'),
    ('monument_historique'), ('musee_de_france'), ('tables_auberges'),
    ('LBL_ATR'), ('LBL_CLEF_VERTE'), ('LBL_DESTINATION_EXCELLENCE'),
    ('LBL_FLOCON_VERT'), ('LBL_GREEN_DESTINATIONS'), ('LBL_LABEL_BAS_CARBONE'),
    ('LBL_PAVILLON_BLEU'), ('LBL_TOURISME_HANDICAP')
  ) AS expected(code)
  WHERE NOT EXISTS (
    SELECT 1 FROM ref_classification_scheme s
    WHERE s.code = expected.code AND s.icon_url IS NOT NULL
  );

  IF v_missing > 0 THEN
    RAISE EXCEPTION 'Backfill logos incomplet : % schema(s) attendu(s) sans icon_url', v_missing;
  END IF;
END $$;

COMMIT;
