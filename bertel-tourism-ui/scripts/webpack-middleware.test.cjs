const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const test = require('node:test');

const appRoot = path.resolve(__dirname, '..');
const project = path.resolve(process.env.WEBPACK_MIDDLEWARE_TEST_PROJECT_ROOT || appRoot);
const fromProject = createRequire(path.join(project, 'package.json'));
const builderPath = fromProject.resolve('@storybook/builder-webpack5/package.json');
const fromBuilder = createRequire(builderPath);
const middlewareEntry = fromBuilder.resolve('webpack-dev-middleware');
const middlewareRoot = path.resolve(path.dirname(middlewareEntry), '..');
const fromMiddleware = createRequire(middlewareEntry);
const metadata = JSON.parse(fs.readFileSync(path.join(middlewareRoot, 'package.json'), 'utf8'));

test('the exact scoped override resolves the real Storybook builder to the fixed middleware and memfs4', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(project, 'package.json'), 'utf8'));
  assert.equal(manifest.overrides['@storybook/builder-webpack5@10.6.2']['webpack-dev-middleware'], '7.4.6');
  assert.equal(JSON.parse(fs.readFileSync(builderPath, 'utf8')).version, '10.6.2');
  assert.equal(metadata.version, '7.4.6');
  assert.equal(metadata.peerDependencies.webpack, '^5.0.0');
  assert.match(fromMiddleware('memfs/package.json').version, /^4\./);
});

test('the actual resolver rejects prefix traversal before any outside filesystem lookup', () => {
  // The same witness can read the unchanged old installation without starting
  // an old server. The filesystem below is synthetic; no private file is read.
  const resolver = fromMiddleware(path.join(middlewareRoot, 'dist/utils/getFilenameFromUrl.js'));
  const root = path.resolve(os.tmpdir(), 'bertel-synthetic-middleware');
  const outputPath = path.join(root, 'output');
  const canary = path.join(root, 'canary.txt');
  function inspect(publicPath, url) {
    const lookedUp = [];
    const context = {
      options: { publicPath },
      stats: { compilation: { options: {}, getPath: value => value,
        outputOptions: { path: outputPath, publicPath }, assetsInfo: new Map() } },
      outputFileSystem: { statSync(filename) {
        lookedUp.push(filename);
        if ([path.join(outputPath, 'main.js'), canary].includes(filename)) return { isFile: () => true, isDirectory: () => false };
        const error = new Error('Synthetic missing file'); error.code = 'ENOENT'; throw error;
      } },
    };
    const extra = {};
    return { filename: resolver(context, url, extra), lookedUp, extra };
  }
  for (const url of ['/assets../canary.txt', '/assets%2e%2e/canary.txt', '/assets..%2fcanary.txt', '/assets/../canary.txt']) {
    const result = inspect('/assets', url);
    assert.equal(result.filename, undefined, url);
    assert.equal(result.extra.errorCode, 403, url);
    assert.equal(result.lookedUp.includes(canary), false, url);
  }
  for (const publicPath of ['/assets', '/assets/']) {
    assert.equal(inspect(publicPath, '/assets/main.js').filename, path.join(outputPath, 'main.js'));
    assert.equal(inspect(publicPath, '/assets/main.js?query=1').filename, path.join(outputPath, 'main.js'));
  }
  assert.equal(inspect('', '/main.js').filename, path.join(outputPath, 'main.js'));
  assert.equal(inspect('/assets/', '/assets../canary.txt').filename, undefined);
  assert.equal(inspect('/assets', '/assets/invalid%00.js').extra.errorCode, 400);
});

function bounded(promise, label) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out: ${label}`)), 10_000);
  })]).finally(() => clearTimeout(timer));
}

async function exerciseHandler(writeToDisk) {
  // Fail before instantiating a server if an old/unknown dependency is selected.
  assert.equal(metadata.version, '7.4.6');
  const webpack = fromBuilder('webpack');
  const factory = fromMiddleware(middlewareEntry);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bertel-webpack-middleware-'));
  const output = path.join(root, 'output');
  const entry = path.join(root, 'entry.js');
  const canary = path.join(root, 'canary.txt');
  const marker = 'SYNTHETIC_PRIVATE_CANARY';
  fs.writeFileSync(entry, 'globalThis.__middlewareProbe = "first-version";\n');
  const compiler = webpack({ mode: 'development', devtool: false, cache: false,
    context: root, entry, output: { path: output, filename: 'main.js', publicPath: '/assets' },
    infrastructureLogging: { level: 'none' }, watchOptions: { aggregateTimeout: 20 } });
  // writeToDisk:true and these three options are exactly the builder's call.
  // The second run covers the memfs4 default separately, without pretending the
  // builder's disk-backed mode exercises the new memory implementation.
  const middleware = factory(compiler, { publicPath: '/assets', writeToDisk, stats: 'errors-only' });
  const server = http.createServer((request, response) => {
    Promise.resolve(middleware(request, response, () => {
      response.statusCode = 404; response.end('missing');
    })).catch(error => { response.statusCode = 500; response.end(error.message); });
  });
  function request(rawPath, { method = 'GET', headers = {} } = {}) {
    return bounded(new Promise((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port: server.address().port,
        path: rawPath, method, headers, agent: false }, response => {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => resolve({ status: response.statusCode,
          headers: response.headers, body: Buffer.concat(chunks).toString() }));
      });
      req.setTimeout(8_000, () => req.destroy(new Error(`HTTP socket timed out: ${rawPath}`)));
      req.on('error', reject); req.end();
    }), `HTTP ${rawPath}`);
  }
  try {
    assert.equal(typeof middleware, 'function');
    for (const name of ['waitUntilValid', 'close', 'invalidate', 'getFilenameFromUrl']) assert.equal(typeof middleware[name], 'function');
    const stats = await bounded(new Promise(resolve => middleware.waitUntilValid(resolve)), 'initial compilation');
    assert.equal(stats.hasErrors(), false);
    assert.equal(middleware.context.outputFileSystem, compiler.outputFileSystem);
    assert.equal(fs.existsSync(path.join(output, 'main.js')), writeToDisk);
    assert(compiler.outputFileSystem.readFileSync(path.join(output, 'main.js'), 'utf8').includes('first-version'));
    compiler.outputFileSystem.writeFileSync(canary, marker);
    await bounded(new Promise((resolve, reject) => {
      server.once('error', reject); server.listen(0, '127.0.0.1', resolve);
    }), 'loopback server');
    const first = await request('/assets/main.js');
    assert.equal(first.status, 200); assert(first.body.includes('first-version'));
    assert.match(first.headers['content-type'], /javascript/);
    const head = await request('/assets/main.js', { method: 'HEAD' });
    assert.equal(head.status, 200); assert.equal(head.body, '');
    const range = await request('/assets/main.js', { headers: { range: 'bytes=0-31' } });
    assert.equal(range.status, 206); assert.equal(Buffer.byteLength(range.body), 32);
    assert.equal((await request('/assets/missing.js')).status, 404);
    // Raw node:http paths deliberately avoid a fetch/URL parser normalizing ..
    // before the tested middleware sees it. The canary is disposable fiction.
    for (const rawPath of ['/assets../canary.txt', '/assets%2e%2e/canary.txt', '/assets..%2fcanary.txt', '/assets/../canary.txt']) {
      const response = await request(rawPath);
      assert.equal(response.status, 403, rawPath); assert.equal(response.body.includes(marker), false);
    }
    const changed = new Promise(resolve => compiler.hooks.done.tap('BertelMiddlewareProof', resolve));
    fs.writeFileSync(entry, 'globalThis.__middlewareProbe = "second-version";\n');
    assert.equal((await bounded(changed, 'file watcher rebuild')).hasErrors(), false);
    const second = await request('/assets/main.js');
    assert.equal(second.status, 200); assert(second.body.includes('second-version'));
    assert.equal(second.body.includes('first-version'), false);
    assert.equal((await bounded(new Promise(resolve => middleware.invalidate(resolve)), 'explicit invalidate')).hasErrors(), false);
  } finally {
    try {
      await bounded(new Promise((resolve, reject) => middleware.close(error => error ? reject(error) : resolve())), 'middleware close');
    } finally {
      if (server.listening) await bounded(new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())), 'HTTP close');
      // Verify the generated absolute path before recursively deleting fixtures.
      const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(root));
      assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
      assert(path.basename(root).startsWith('bertel-webpack-middleware-'));
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
}

test('real builder disk mode keeps stats, handler, ranges, rebuild and close while refusing traversal',
  { timeout: 30_000 }, () => exerciseHandler(true));
test('the installed memfs4 mode serves and rebuilds real in-memory output without writing the bundle to disk',
  { timeout: 30_000 }, () => exerciseHandler(false));
