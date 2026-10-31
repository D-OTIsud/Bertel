import { getSupabaseClient } from '../lib/supabase';
import { readRecordOrNull, readNullableString } from '../lib/json-read';

export interface PortalOffice {
  id: string;
  name: string;
  logoUrl: string | null;
  email: string | null;
  phone: string | null;
}

/** L'office publisher est résolu sur les fiches autorisées, sans créer de membership
 * interne pour un partenaire. La route ne renvoie que son identité publique. */
export async function getPortalOffice(objectId: string | null): Promise<PortalOffice | null> {
  const client = getSupabaseClient();
  const session = client ? await client.auth.getSession() : null;
  const token = session?.data.session?.access_token;
  if (!token) throw new Error('Session indisponible.');
  const query = objectId ? '?' + new URLSearchParams({ objectId }).toString() : '';
  const response = await fetch('/api/portal-office' + query, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!response.ok) throw new Error('L’identité de l’office est indisponible.');
  const payload = readRecordOrNull(await response.json());
  const office = readRecordOrNull(payload?.office);
  const id = readNullableString(office?.id), name = readNullableString(office?.name);
  if (!office || !id || !name) return null;
  return { id, name, logoUrl: readNullableString(office.logoUrl), email: readNullableString(office.email), phone: readNullableString(office.phone) };
}
