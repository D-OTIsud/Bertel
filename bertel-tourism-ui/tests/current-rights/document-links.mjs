import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const bucket = 'legal-documents';
const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

export async function testDocumentLinks({ app, local, commit, objectId, documentId, writerId,
  writerAuthorization, foreignAuthorization }) {
  assert.ok(process.platform === 'linux' && process.env.CURRENT_RIGHTS_DISPOSABLE === 'true'
    && /^http:\/\/127\.0\.0\.1:[0-9]+$/.test(local.origin) && objectId === 'HOTRUN999999AR01'
    && documentId === '00000000-0000-4000-a000-00000000ae41'
    && writerId === '00000000-0000-4000-a000-00000000ae11'
    && writerAuthorization !== foreignAuthorization, 'exact disposable document fixture required');
  const key = `objects/${objectId}/${documentId}`;
  const storagePath = `/storage/v1/object/${bucket}/${key}`;
  const metadata = await local.request(`/storage/v1/bucket/${bucket}`, local.service, undefined, 'GET');
  assert.ok(metadata.ok && (await metadata.json()).public === false, 'the real destination fixture bucket must be private');
  const uploaded = await local.request(storagePath, local.service, pdf, 'POST',
    { 'content-type': 'application/pdf', 'x-upsert': 'false' });
  assert.ok(uploaded.ok, 'synthetic private PDF upload must succeed');

  try {
    commit(`DO $fixture$ BEGIN
      UPDATE public.ref_document SET storage_bucket='${bucket}', storage_path='${key}', url='storage://${bucket}/${key}'
      WHERE id='${documentId}' AND storage_bucket='old_legal_media' AND storage_path='synthetic-http.pdf'
        AND extra #>> '{bertel_pj_import,mapped_object_id}'='${objectId}';
      IF NOT FOUND THEN RAISE EXCEPTION 'missing document fixture'; END IF;
      INSERT INTO public.object_legal(object_id,type_id,value,document_id,validity_mode)
        SELECT '${objectId}',id,'{"value":"Synthetic proof"}'::jsonb,'${documentId}','forever'
        FROM public.ref_legal_type WHERE code='kbis';
      IF NOT FOUND THEN RAISE EXCEPTION 'missing legal type fixture'; END IF;
    END; $fixture$`, 'map the synthetic attachment to the post-cutover key');

    async function sign(authorization, accessContext) {
      const response = await fetch(app.origin + '/api/object-document/url', {
        method: 'POST', headers: { authorization, 'content-type': 'application/json' },
        body: JSON.stringify({ objectId, documentId, accessContext }),
        redirect: 'error', signal: AbortSignal.timeout(30_000),
      });
      assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
      return response;
    }
    async function verifyOpened(accessContext) {
      const response = await sign(writerAuthorization, accessContext);
      assert.equal(response.status, 200, `${accessContext} document route must authorize the fixture writer`);
      const body = await response.json().catch(() => null);
      let url;
      try { url = new URL(body?.url); } catch { throw new Error('document signer returned an invalid URL'); }
      assert.ok(url.origin === local.origin && url.pathname === `/storage/v1/object/sign/${bucket}/${key}`
        && !url.username && !url.password && !url.hash
        && [...url.searchParams.keys()].join(',') === 'token' && url.searchParams.get('token'),
      'signed response must identify the exact loopback bucket and key');
      let downloaded;
      try { downloaded = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10_000) }); }
      catch { throw new Error('bearer-free signed download failed'); }
      assert.ok(downloaded.ok && Number(downloaded.headers.get('content-length')) === pdf.length
        && downloaded.headers.get('content-type')?.split(';')[0] === 'application/pdf',
      'the signed URL must return the exact synthetic PDF');
      assert.equal(digest(Buffer.from(await downloaded.arrayBuffer())), digest(pdf));
    }
    async function verifyDenied(authorization, accessContext) {
      const response = await sign(authorization, accessContext);
      assert.equal(response.status, 403, `${accessContext} document route must refuse the current authority`);
      const body = await response.json().catch(() => null);
      assert.ok(body?.error === 'forbidden' && Object.keys(body).length === 1, 'refusal must contain no URL or location');
    }

    await verifyOpened('canonical');
    await verifyDenied(foreignAuthorization, 'canonical');

    commit(`DO $fixture$ BEGIN
      UPDATE public.user_org_business_role SET is_active=false
      WHERE membership_id='00000000-0000-4000-a000-00000000ab11' AND is_active
        AND role_id=(SELECT id FROM public.ref_org_business_role WHERE code='editor');
      IF NOT FOUND THEN RAISE EXCEPTION 'missing editor role fixture'; END IF;
      INSERT INTO public.user_org_business_role(membership_id,role_id,is_active)
        SELECT '00000000-0000-4000-a000-00000000ab11',id,true FROM public.ref_org_business_role WHERE code='viewer';
      IF NOT FOUND THEN RAISE EXCEPTION 'missing viewer role fixture'; END IF;
      INSERT INTO public.user_permission(user_id,permission_id,is_active)
        SELECT '${writerId}',id,true FROM public.ref_permission WHERE code='manage_legal_compliance' AND is_active
        ON CONFLICT ON CONSTRAINT uq_user_permission DO UPDATE SET is_active=true;
      IF NOT FOUND THEN RAISE EXCEPTION 'missing legal permission fixture'; END IF;
    END; $fixture$`, 'change the same authenticated writer to legal-only');
    await verifyOpened('legal');
    await verifyDenied(writerAuthorization, 'canonical');

    commit(`UPDATE public.user_permission SET is_active=false
      WHERE user_id='${writerId}' AND permission_id=(SELECT id FROM public.ref_permission WHERE code='manage_legal_compliance')`,
    'revoke the fixture legal right while retaining the same JWT');
    await verifyDenied(writerAuthorization, 'legal');
  } finally {
    const removed = await local.request(`/storage/v1/object/${bucket}`, local.service, { prefixes: [key] }, 'DELETE');
    assert.ok(removed.ok, 'only the synthetic test object must be cleaned up');
  }
}
