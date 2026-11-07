import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { startApp, stopApp, waitForApp } from './editor-races.mjs';

const bucket = 'legal-documents';
const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

export async function testDocumentLinks({ local, commit, objectId, documentId, writerId,
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

  let app;
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

    // The generated local service key is passed only to this server process.
    // This HTTP witness has no Chromium context.
    app = await startApp(local, { signDocuments: true });
    await waitForApp(app);

    // ACC-12: the same published object and opaque key after committed revocation.
    const label = `Synthetic ACC-12 ${randomUUID()}`;
    const publicObjectId = 'HOTRUN999999AR03';
    const partnerUrl = `${app.origin}/api/public/objects/${publicObjectId}`;
    const partnerRpc = (name, body) => local.request(`/rest/v1/rpc/${name}`, local.service, body, 'POST',
      { 'content-profile': 'api', 'accept-profile': 'api' });
    try {
      const issued = await partnerRpc('rpc_issue_partner_key', {
        p_label: label, p_scopes: ['read'], p_expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      });
      assert.equal(issued.status, 200, 'issue the synthetic partner key');
      const { id: partnerKeyId, api_key: rawKey } = await issued.json();
      assert.ok(typeof partnerKeyId === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(partnerKeyId)
        && typeof rawKey === 'string' && /^bk_live_[a-f0-9]{48}$/.test(rawKey), 'expected the generated key shape');
      const authorization = `Bearer ${rawKey}`;
      const readObject = (etag) => fetch(partnerUrl, {
        headers: { authorization, ...(etag ? { 'if-none-match': etag } : {}) },
        redirect: 'error', signal: AbortSignal.timeout(30_000),
      });
      const warm = await readObject();
      assert.equal(warm.status, 200, 'active partner key must read the published synthetic object');
      const published = (await warm.json()).data;
      assert.ok(published?.id === publicObjectId && published.status === 'published', 'expected the exact published fixture');

      const revoke = await partnerRpc('rpc_revoke_partner_key', { p_id: partnerKeyId });
      assert.ok(revoke.ok && (await revoke.json()).revoked === true, 'partner revocation RPC must succeed');
      assert.equal(local.sql(`SELECT count(*) FROM internal.partner_api_key
        WHERE id='${partnerKeyId}' AND label='${label}' AND NOT is_active AND revoked_at IS NOT NULL`,
      'verify committed synthetic key revocation'), '1');
      const refused = await readObject(warm.headers.get('etag'));
      assert.equal(refused.status, 401, 'the same key must be refused on the same object after revocation');
      const denial = await refused.json();
      assert.ok(denial?.error === 'unauthorized' && Object.keys(denial).length === 1, 'refusal must contain no object data');
    } finally {
      commit(`DELETE FROM internal.partner_api_key WHERE label='${label}'`, 'remove only the synthetic partner key');
    }

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
    try { if (app) await stopApp(app); }
    finally {
      const removed = await local.request(`/storage/v1/object/${bucket}`, local.service, { prefixes: [key] }, 'DELETE');
      assert.ok(removed.ok, 'only the synthetic test object must be cleaned up');
    }
  }
}
