import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { coerceThemeSettings, type ThemeSettings } from './theme';
import { readOrgSmtpConfig } from './org-smtp.server';
import { MailNotConfiguredError } from './mail.server';
import type { PartnerInvitationEmailData } from '@/emails/PartnerInvitationEmail';

export interface OfficeIdentity {
  id: string;
  name: string;
  logoUrl: string | null;
  email: string | null;
  phone: string | null;
  theme: ThemeSettings;
}

/** Métadonnées publiques seulement. L'appelant doit avoir autorisé l'acteur ou les
 * fiches AVANT d'utiliser cette lecture privilégiée ; aucun secret ne sort d'ici. */
export async function readOfficeIdentity(server: SupabaseClient, orgId: string): Promise<OfficeIdentity> {
  const [office, branding, platform, kinds, channels] = await Promise.all([
    server.from('object').select('id,name').eq('id', orgId).eq('object_type', 'ORG').maybeSingle(),
    server.from('org_branding_settings').select('brand_name,logo_public_url,primary_color,accent_color,text_color,background_color,surface_color').eq('org_object_id', orgId).maybeSingle(),
    server.from('app_branding_settings').select('primary_color,accent_color,text_color,background_color,surface_color').eq('setting_key', 'default').maybeSingle(),
    server.from('ref_code_contact_kind').select('id,code').in('code', ['email', 'phone', 'mobile']),
    server.from('contact_channel').select('value,kind_id').eq('object_id', orgId).eq('is_public', true)
      .order('is_primary', { ascending: false, nullsFirst: false }).order('position', { ascending: true, nullsFirst: false }),
  ]);
  if (office.error || branding.error || platform.error || kinds.error || channels.error || !office.data) throw new Error('office_read_failed');
  const name = String(branding.data?.brand_name ?? '').trim() || String(office.data.name).trim();
  let logoUrl: string | null = null;
  try {
    if (branding.data?.logo_public_url) {
      const url = new URL(branding.data.logo_public_url, process.env.NEXT_PUBLIC_SUPABASE_URL);
      if (url.protocol === 'https:') logoUrl = url.href;
    }
  } catch { /* Un logo absent ou invalide ne remplace pas le nom de l'office. */ }
  const theme = coerceThemeSettings({
    brandName: name, logoUrl,
    primaryColor: branding.data?.primary_color ?? platform.data?.primary_color,
    accentColor: branding.data?.accent_color ?? platform.data?.accent_color,
    textColor: branding.data?.text_color ?? platform.data?.text_color,
    backgroundColor: branding.data?.background_color ?? platform.data?.background_color,
    surfaceColor: branding.data?.surface_color ?? platform.data?.surface_color,
  });
  const contact = (codes: string[]) => {
    const row = (channels.data ?? []).find((channel) => codes.includes((kinds.data ?? []).find((kind) => kind.id === channel.kind_id)?.code ?? '')
      && typeof channel.value === 'string' && channel.value.trim());
    return row ? String(row.value).trim() : null;
  };
  return { id: orgId, name, logoUrl, email: contact(['email']), phone: contact(['phone', 'mobile']), theme };
}

export interface PartnerInvitationContext {
  orgId: string;
  email: Omit<PartnerInvitationEmailData, 'invitationUrl'>;
}

/** L'office expéditeur vient du JWT de l'agent, jamais du corps HTTP. Les noms de
 * fiches sont limités aux liens actifs de cet acteur ET à cet office publisher. */
export async function readPartnerInvitationContext(
  server: SupabaseClient,
  asCaller: SupabaseClient,
  actorId: string,
): Promise<PartnerInvitationContext> {
  const { data: orgId, error } = await asCaller.schema('api').rpc('current_user_org_id');
  if (error) throw new Error('office_read_failed');
  if (typeof orgId !== 'string' || !orgId) throw new MailNotConfiguredError();
  return readPartnerInvitationContextForOffice(server,orgId,actorId);
}

/** Réservé aux routes ayant déjà validé le périmètre (appelant ou claim serveur). */
export async function readPartnerInvitationContextForOffice(
  server: SupabaseClient,orgId:string,actorId:string,
): Promise<PartnerInvitationContext> {
  if (!await readOrgSmtpConfig(orgId)) throw new MailNotConfiguredError(orgId);

  const [office, actor, links, publisher] = await Promise.all([
    readOfficeIdentity(server, orgId),
    server.from('actor').select('first_name').eq('id', actorId).maybeSingle(),
    server.from('actor_object_role').select('object_id,valid_from,valid_to').eq('actor_id', actorId),
    server.from('ref_org_role').select('id').eq('code', 'publisher').maybeSingle(),
  ]);
  if (actor.error || links.error || publisher.error) throw new Error('invitation_context_failed');
  const today = new Date().toISOString().slice(0, 10);
  const ids = [...new Set((links.data ?? []).filter((row) => (!row.valid_from || row.valid_from <= today) && (!row.valid_to || row.valid_to >= today)).map((row) => String(row.object_id)))];
  let ficheNames: string[] = [];
  if (ids.length && publisher.data?.id) {
    const scoped = await server.from('object_org_link').select('object_id').eq('org_object_id', orgId).eq('role_id', publisher.data.id).in('object_id', ids);
    if (scoped.error) throw new Error('invitation_context_failed');
    const scopedIds = [...new Set((scoped.data ?? []).map((row) => String(row.object_id)))];
    if (scopedIds.length) {
      const objects = await server.from('object').select('name').in('id', scopedIds).neq('object_type', 'ORG').order('name');
      if (objects.error) throw new Error('invitation_context_failed');
      ficheNames = (objects.data ?? []).map((row) => String(row.name));
    }
  }
  return { orgId, email: { officeName: office.name, officeLogoUrl: office.logoUrl,
    recipientName: actor.data?.first_name ?? null, ficheNames, theme: office.theme,
  } };
}
