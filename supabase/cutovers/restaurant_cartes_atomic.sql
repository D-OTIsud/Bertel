-- C cutover ONLY after object-cartes/MenuPdfCartes and all ordinary card writers use
-- the new targeted transaction. Keep partner_enabled=false until its UI and recipe are approved.
-- This script is deliberately outside additive migrations and outside the fresh-install manifest.
BEGIN;
DO $gate$
BEGIN
 IF to_regprocedure('api.finalize_restaurant_carte_mutation(uuid)') IS NULL THEN
  RAISE EXCEPTION 'Restaurant carte contract is not installed';
 END IF;
 IF EXISTS(SELECT 1 FROM public.object_document od JOIN public.ref_code_document_type r ON r.id=od.role_id AND r.code='carte'
   JOIN public.object o ON o.id=od.object_id WHERE o.object_type<>'RES') THEN
  RAISE EXCEPTION 'A non-restaurant uses the carte role: convert that writer before cutover';
 END IF;
END $gate$;
DROP POLICY IF EXISTS restaurant_carte_rpc_insert ON public.object_document;
CREATE POLICY restaurant_carte_rpc_insert ON public.object_document AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(NOT EXISTS(SELECT 1 FROM public.ref_code_document_type r WHERE r.id=object_document.role_id AND r.code='carte'));
DROP POLICY IF EXISTS restaurant_carte_rpc_update ON public.object_document;
CREATE POLICY restaurant_carte_rpc_update ON public.object_document AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(NOT EXISTS(SELECT 1 FROM public.ref_code_document_type r WHERE r.id=object_document.role_id AND r.code='carte'))
 WITH CHECK(NOT EXISTS(SELECT 1 FROM public.ref_code_document_type r WHERE r.id=object_document.role_id AND r.code='carte'));
DROP POLICY IF EXISTS restaurant_carte_rpc_delete ON public.object_document;
CREATE POLICY restaurant_carte_rpc_delete ON public.object_document AS RESTRICTIVE FOR DELETE TO authenticated
 USING(NOT EXISTS(SELECT 1 FROM public.ref_code_document_type r WHERE r.id=object_document.role_id AND r.code='carte'));
-- No SELECT change; brochure/certificate links and public readers keep their current contract.
COMMIT;
NOTIFY pgrst,'reload schema';
