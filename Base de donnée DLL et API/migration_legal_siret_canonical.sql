-- migration_legal_siret_canonical.sql
-- Canonical establishment identity: one active object_legal row of type `siret` per object.
-- SIREN is optional (derivable from SIRET); redundant siren rows are revoked or retyped.
--
-- PREREQUISITE: ref_legal_type + object_legal from schema_unified.sql
-- IDEMPOTENT: safe to re-run

BEGIN;

UPDATE ref_legal_type
SET
  is_required = false,
  description = 'Identifiant entreprise (9 chiffres). Optionnel si SIRET établissement renseigné — dérivable des 9 premiers chiffres du SIRET.'
WHERE code = 'siren';

UPDATE ref_legal_type
SET
  description = 'Identifiant établissement (14 chiffres = SIREN 9 + NIC 5). Une seule ligne object_legal par fiche.'
WHERE code = 'siret';

-- Revoke redundant active siren rows when an active siret row already carries a value.
UPDATE object_legal ol_siren
SET
  status = 'revoked',
  note = COALESCE(NULLIF(TRIM(ol_siren.note), ''), '') || CASE
    WHEN NULLIF(TRIM(ol_siren.note), '') IS NULL THEN 'Auto-revoked: redundant with active siret (canonical identity).'
    ELSE E'\nAuto-revoked: redundant with active siret (canonical identity).'
  END,
  updated_at = NOW()
FROM ref_legal_type rlt_siren,
     object_legal ol_siret
     JOIN ref_legal_type rlt_siret
       ON rlt_siret.id = ol_siret.type_id
      AND rlt_siret.code = 'siret'
WHERE ol_siren.type_id = rlt_siren.id
  AND rlt_siren.code = 'siren'
  AND ol_siren.status = 'active'
  -- ol_siret correlation moved out of FROM: the UPDATE target (ol_siren) may not be
  -- referenced inside a FROM-clause JOIN (Postgres). Same result, valid placement.
  AND ol_siret.object_id = ol_siren.object_id
  AND ol_siret.status = 'active'
  AND NULLIF(
    TRIM(
      COALESCE(
        ol_siret.value ->> 'siret',
        ol_siret.value ->> 'value',
        ol_siret.value ->> 'siren',
        ''
      )
    ),
    ''
  ) IS NOT NULL;

-- Retype lone active siren rows (no active siret) to siret, normalizing JSONB.
UPDATE object_legal ol
SET
  type_id = (SELECT id FROM ref_legal_type WHERE code = 'siret'),
  value = CASE
    WHEN length(regexp_replace(
      COALESCE(ol.value ->> 'siret', ol.value ->> 'siren', ol.value ->> 'value', ''),
      '[^0-9]',
      '',
      'g'
    )) = 14 THEN jsonb_build_object(
      'siret',
      regexp_replace(
        COALESCE(ol.value ->> 'siret', ol.value ->> 'siren', ol.value ->> 'value', ''),
        '[^0-9]',
        '',
        'g'
      )
    )
    WHEN length(regexp_replace(
      COALESCE(ol.value ->> 'siret', ol.value ->> 'siren', ol.value ->> 'value', ''),
      '[^0-9]',
      '',
      'g'
    )) = 9 THEN jsonb_build_object(
      'siren',
      regexp_replace(
        COALESCE(ol.value ->> 'siret', ol.value ->> 'siren', ol.value ->> 'value', ''),
        '[^0-9]',
        '',
        'g'
      ),
      'nic', NULL
    )
    ELSE ol.value
  END,
  validity_mode = 'forever',
  valid_to = NULL,
  updated_at = NOW()
FROM ref_legal_type rlt
WHERE ol.type_id = rlt.id
  AND rlt.code = 'siren'
  AND ol.status = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM object_legal ol2
    JOIN ref_legal_type r2 ON r2.id = ol2.type_id AND r2.code = 'siret'
    WHERE ol2.object_id = ol.object_id
      AND ol2.status = 'active'
  );

COMMIT;
