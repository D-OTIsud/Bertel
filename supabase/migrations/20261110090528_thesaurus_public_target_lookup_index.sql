-- Match the immutable-release scope guard's existing UUID-to-text lookup.
-- INCLUDE permits an index-only target probe without changing activate/auth.
CREATE INDEX thesaurus_public_target_lookup_idx
ON thesaurus.release_concept (release_id, (concept_id::text))
INCLUDE (concept_id)
WHERE is_public;

COMMENT ON INDEX thesaurus.thesaurus_public_target_lookup_idx IS
  'Cover the unchanged public semantic-target scope guard by release and canonical UUID text; no publication or authorization behavior changes.';
