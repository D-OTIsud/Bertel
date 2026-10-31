import { NextResponse, type NextRequest } from 'next/server';
import { authenticated, callerClient } from '../_document-auth';
import { readOfficeIdentity } from '@/lib/portal-office.server';

export const runtime = 'nodejs';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticated(req);
  if (!auth.ok) { auth.response.headers.set('Cache-Control', 'no-store'); return auth.response; }
  const objectId = new URL(req.url).searchParams.get('objectId');
  if (objectId && objectId.length > 100) return json({ error: 'invalid_object' }, 422);
  // Ce RPC exige la persona acteur ET résout ses fiches. Aucun accès privilégié
  // aux tables n'a lieu avant la vérification de cette portée, même pour le logo.
  const scope = await callerClient(auth.jwt).schema('api').rpc('list_my_portal_fiches', {});
  if (scope.error) return json({ error: 'forbidden' }, scope.error.code === '42501' ? 403 : 500);
  const fiches = (Array.isArray(scope.data) ? scope.data : []) as Array<{ id: string; office_email?: string | null; office_phone?: string | null }>;
  if (objectId && !fiches.some((fiche) => fiche.id === objectId)) return json({ error: 'forbidden' }, 403);
  const selected = objectId ? fiches.filter((fiche) => fiche.id === objectId) : fiches;
  if (!selected.length) return json({ office: null });
  const publisher = await auth.server.from('ref_org_role').select('id').eq('code', 'publisher').maybeSingle();
  if (publisher.error || !publisher.data?.id) return json({ error: 'office_read_failed' }, 500);
  const links = await auth.server.from('object_org_link').select('object_id,org_object_id,is_primary')
    .eq('role_id', publisher.data.id).in('object_id', selected.map((fiche) => fiche.id))
    .order('is_primary', { ascending: false, nullsFirst: false }).order('org_object_id');
  if (links.error) return json({ error: 'office_read_failed' }, 500);
  const offices = selected.map((fiche) => links.data?.find((link) => link.object_id === fiche.id)?.org_object_id ?? null);
  // L'accueil multi-office ne prend pas arbitrairement la marque du premier.
  if (offices.some((id) => !id) || new Set(offices).size !== 1) return json({ office: null });
  try {
    const office = await readOfficeIdentity(auth.server, String(offices[0]));
    return json({ office: { id: office.id, name: office.name, logoUrl: office.logoUrl,
      email: office.email,
      phone: office.phone,
    } });
  } catch { return json({ error: 'office_read_failed' }, 500); }
}
