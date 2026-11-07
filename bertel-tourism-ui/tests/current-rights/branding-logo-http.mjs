import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, request } from 'node:http';
import sharp from 'sharp';
import { startApp, stopApp, waitForApp } from './editor-races.mjs';

const org = 'ORGRUN999999AR02';
const otherOrg = 'ORGRUN999999AR01';
const actor = '00000000-0000-4000-a000-00000000aa02';
const bucket = '/storage/v1/object/branding-assets';
const logoPath = /^(?:global|org\/ORGRUN999999AR02)\/[0-9TZ-]+\.png$/;

// The relay forwards only to the already-owned Supabase HTTP origin. It lets
// the witness distinguish zero Storage attempts from zero persisted objects.
async function traceLogoRequests(origin, calls, paths) {
  const target = new URL(origin);
  assert.equal(origin, target.origin);
  assert.ok(target.protocol === 'http:' && target.hostname === '127.0.0.1' && target.port);
  const routes = new Map([
    ['GET /auth/v1/user', 'auth'],
    ['POST /rest/v1/rpc/is_platform_admin', 'platform'],
    ['POST /rest/v1/rpc/user_can_manage_org_branding', 'org'],
    ['POST /rest/v1/rpc/get_public_branding', null],
  ]);
  const relay = createServer((req, res) => {
    const label = routes.get(`${req.method} ${req.url}`);
    const path = req.method === 'POST' && req.url.startsWith(bucket + '/') ? req.url.slice(bucket.length + 1) : '';
    if (logoPath.test(path)) {
      calls.push('storage');
      paths.add(path);
    } else if (label === undefined) {
      calls.push('unexpected');
      req.resume();
      return res.writeHead(403).end();
    } else if (label !== null) {
      calls.push(label);
    }
    const upstream = request({ hostname: target.hostname, port: target.port, path: req.url, method: req.method,
      headers: { ...req.headers, host: target.host }, timeout: 10_000 }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400) {
        response.resume();
        return res.writeHead(502).end();
      }
      res.writeHead(response.statusCode, response.headers);
      response.pipe(res);
    });
    upstream.on('timeout', () => upstream.destroy());
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.pipe(upstream);
  });
  relay.listen(0, '127.0.0.1');
  await once(relay, 'listening');
  return relay;
}

export async function testBrandingLogoHttp({ local, commit, signIn, ordinary, admin }) {
  assert.equal(ordinary.id, '00000000-0000-4000-a000-00000000ae12');
  const profile = () => local.sql(`SELECT role::text || ':' || coalesce(actor_id::text, '')
    FROM public.app_user_profile WHERE id='${ordinary.id}'`, 'canonical logo witness profile');
  assert.equal(profile(), 'tourism_agent:');
  const updated = await local.request('/auth/v1/user', ordinary.auth,
    { data: { role: 'super_admin', actor_id: actor } }, 'PUT');
  assert.equal(updated.status, 200);
  await updated.body?.cancel();
  const forged = await signIn(ordinary.id, ordinary.credentials);
  const claims = JSON.parse(Buffer.from(forged.authorization.split('.')[1], 'base64url'));
  assert.equal(claims.user_metadata?.role, 'super_admin', 'GoTrue must mint the actual self-assigned claim');
  assert.equal(claims.user_metadata?.actor_id, actor);
  const platform = await signIn(admin.id, admin.credentials);
  for (const patch of [{ role: 'super_admin' }, { actor_id: actor }]) {
    const refused = await local.request(`/rest/v1/app_user_profile?id=eq.${ordinary.id}`, forged, patch, 'PATCH');
    assert.equal(refused.status, 403);
    assert.equal((await refused.json()).code, '42501');
  }
  assert.equal(profile(), 'tourism_agent:');

  commit(`DO $fixture$ BEGIN
    INSERT INTO public.user_org_admin_role(membership_id,role_id,is_active)
    SELECT m.id,r.id,true FROM public.user_org_membership m CROSS JOIN public.ref_org_admin_role r
    WHERE m.user_id='${ordinary.id}' AND m.org_object_id='${org}' AND m.is_active AND r.code='org_admin' AND r.rank=30;
    IF NOT FOUND THEN RAISE EXCEPTION 'missing scoped branding fixture'; END IF;
  END; $fixture$`, 'assign rank only on the existing disposable organization membership');

  const count = () => local.sql("SELECT count(*) FROM storage.objects WHERE bucket_id='branding-assets'", 'disposable branding storage count');
  assert.equal(count(), '0', 'branding fixture bucket must be empty');
  const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#145a7880' } }).png().toBuffer();
  const calls = [];
  const paths = new Set();
  const relay = await traceLogoRequests(local.origin, calls, paths);
  const relayOrigin = 'http://127.0.0.1:' + relay.address().port;
  let app;
  try {
    app = await startApp({ ...local, origin: relayOrigin }, { signDocuments: true });
    await waitForApp(app);
    const upload = async (auth, organization) => {
      calls.length = 0;
      const body = new FormData();
      body.set('file', new Blob([png], { type: 'image/png' }), 'synthetic-logo.png');
      if (organization) body.set('orgObjectId', organization);
      const response = await fetch(app.origin + '/api/branding/logo/upload', { method: 'POST',
        headers: { authorization: auth.authorization }, body, redirect: 'error', signal: AbortSignal.timeout(45_000) });
      return { status: response.status, body: await response.json() };
    };
    for (const [organization, gate] of [[null, 'platform'], [otherOrg, 'org']]) {
      const refused = await upload(forged, organization);
      assert.equal(refused.status, 403);
      assert.equal(refused.body.error, 'forbidden');
      assert.deepEqual(calls, ['auth', gate], 'denial must precede any Storage request');
      assert.equal(count(), '0');
    }
    for (const [identity, organization, gate] of [[platform, null, 'platform'], [forged, org, 'org']]) {
      const accepted = await upload(identity, organization);
      assert.equal(accepted.status, 201);
      assert.deepEqual(calls, ['auth', gate, 'storage']);
      const { logoStoragePath: path, logoPublicUrl, logoMimeType } = accepted.body;
      assert.ok(paths.has(path) && path.startsWith(organization ? `org/${organization}/` : 'global/'));
      assert.equal(logoMimeType, 'image/png');
      const publicPath = '/storage/v1/object/public/branding-assets/' + path;
      assert.equal(logoPublicUrl, relayOrigin + publicPath);
      const stored = await local.request(publicPath, local.anonymous, undefined, 'GET');
      assert.equal(stored.status, 200);
      assert.match(stored.headers.get('content-type') ?? '', /^image\/png\b/);
      const image = await sharp(Buffer.from(await stored.arrayBuffer())).metadata();
      assert.equal(image.format, 'png');
      assert.equal(image.width, 2);
      assert.equal(image.height, 2);
      assert.equal(image.hasAlpha, true);
    }
    assert.equal(count(), '2');
  } finally {
    try {
      if (app) await stopApp(app);
    } finally {
      const closed = once(relay, 'close');
      relay.close();
      relay.closeAllConnections();
      await closed;
      if (paths.size) {
        const removed = await local.request(bucket, local.service, { prefixes: [...paths] }, 'DELETE');
        assert.ok(removed.ok, 'remove only the fixture logo paths through Storage');
        await removed.body?.cancel();
      }
      assert.equal(count(), '0', 'fixture cleanup must leave the bucket empty');
    }
  }
}
