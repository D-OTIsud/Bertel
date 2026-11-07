-- =====================================================================================
-- migration_actor_address_kind.sql  (manifest step 14b)
-- =====================================================================================
-- Adds an 'address' contact_kind so a prestataire (actor) can carry one or more POSTAL
-- ADDRESSES as actor_channel rows — authored from the §19 "Suivi prestataire" fiche
-- (CrmActorEditModal "Adresses" section) through the existing api.save_actor_channel /
-- api.delete_actor_channel RPCs. No new table: addresses reuse the channel CRUD + RLS.
--
-- ref_code_contact_kind is a PARTITION OF ref_code FOR VALUES IN ('contact_kind'), so this
-- INSERT into ref_code routes to the partition and satisfies actor_channel.kind_id's FK.
--
-- Idempotent. EN/ES i18n deferred (consistent with the open i18n backlog); listContactKinds
-- reads ref_code (code, name) only, so the FR name is sufficient for the UI.
-- =====================================================================================

INSERT INTO public.ref_code (domain, code, name, description) VALUES
  ('contact_kind', 'address', 'Adresse', 'Adresse postale du prestataire / de l''acteur')
ON CONFLICT DO NOTHING;
