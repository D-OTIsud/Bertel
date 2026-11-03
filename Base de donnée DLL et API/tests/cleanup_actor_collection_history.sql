-- Isolated CI database ONLY. Do not run against production.
\ir assert_partner_api_ephemeral.sql
BEGIN;
DELETE FROM public.pending_change WHERE id IN('00000000-0000-4000-a000-000000008802','00000000-0000-4000-a000-000000008803');
DELETE FROM public.object WHERE id='HOTRUN9999998801';
DELETE FROM public.app_user_profile WHERE id='00000000-0000-4000-a000-000000008801';
DELETE FROM auth.users WHERE id='00000000-0000-4000-a000-000000008801';
COMMIT;
