const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// CI uses its own npm-ci installation. Local RED/GREEN probes may name an
// isolated installation; they never alter a shared worktree's node_modules.
const root = path.resolve(process.env.TOOLING_TEST_PROJECT_ROOT || path.join(__dirname, '..'));
const fromProject = createRequire(path.join(root, 'package.json'));
const leafMap = () => ({ version: 3, sources: ['input.scss'], sourcesContent: ['a { color: red }'],
  names: [], mappings: 'AAAA' });
const indexed = (line, column = 0, map = leafMap()) => ({ version: 3, sections: [{ offset: { line, column }, map }] });

test('the actual PostCSS and Next parents resolve the corrected packages', () => {
  const fromPostcss = createRequire(fromProject.resolve('postcss'));
  const fromNext = createRequire(fromProject.resolve('next/dist/compiled/browserslist'));
  assert.equal(fromPostcss.resolve('source-map-js'), fromProject.resolve('source-map-js'));
  assert.equal(fromNext.resolve('baseline-browser-mapping'), fromProject.resolve('baseline-browser-mapping'));
  const sourceVersion = fromProject('source-map-js/package.json').version.split('.').map(Number);
  const baselineVersion = require(path.join(path.dirname(fromProject.resolve('baseline-browser-mapping')), '..', 'package.json')).version.split('.').map(Number);
  assert.ok(sourceVersion[0] > 1 || (sourceVersion[0] === 1 && (sourceVersion[1] > 2 || (sourceVersion[1] === 2 && sourceVersion[2] >= 2))));
  assert.ok(baselineVersion[0] > 2 || (baselineVersion[0] === 2 && baselineVersion[1] >= 11));
});

test('source maps reject malicious indexed offsets before expensive conversion', () => {
  const { SourceMapConsumer } = fromProject('source-map-js');
  // Constructor-only witnesses prove the unsafe values are rejected without
  // asking the vulnerable package to allocate or loop over huge line counts.
  assert.throws(() => new SourceMapConsumer(indexed(10_000_001)), /Section offset line must not exceed 10000000/);
  assert.throws(() => new SourceMapConsumer(indexed(6_000_000, 0, indexed(6_000_000))), /including offsets of nested sections/);
  for (const value of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1', null]) {
    assert.throws(() => new SourceMapConsumer(indexed(value)), undefined, `line=${String(value)}`);
    assert.throws(() => new SourceMapConsumer(indexed(0, value)), undefined, `column=${String(value)}`);
  }
});

test('valid indexed maps and source-node roundtrips retain source positions', () => {
  const { SourceMapConsumer, SourceMapGenerator, SourceNode } = fromProject('source-map-js');
  const consumer = new SourceMapConsumer(indexed(2, 0, indexed(3)));
  assert.deepEqual(consumer.originalPositionFor({ line: 6, column: 1 }),
    { source: 'input.scss', line: 1, column: 0, name: null });
  const node = SourceNode.fromStringWithSourceMap('\n\n\n\n\na { color: red }', consumer);
  const output = node.toStringWithSourceMap({ file: 'output.css' });
  assert.equal(output.code, '\n\n\n\n\na { color: red }');
  assert.equal(new SourceMapConsumer(output.map.toJSON()).originalPositionFor({ line: 6, column: 0 }).source, 'input.scss');
  const generator = new SourceMapGenerator({ file: 'gaps.css' });
  generator.addMapping({ generated: { line: 1, column: 0 } });
  generator.addMapping({ generated: { line: 100_001, column: 0 } });
  assert.equal(generator.toJSON().mappings, `A${';'.repeat(100_000)}A`);
});

test('PostCSS and Autoprefixer still compile CSS with original source content', async () => {
  const postcss = fromProject('postcss');
  const autoprefixer = fromProject('autoprefixer');
  const { SourceMapConsumer } = fromProject('source-map-js');
  const css = 'a { user-select: none; display: flex }';
  const result = await postcss([autoprefixer({ overrideBrowserslist: ['ie 11'] })]).process(css, {
    from: '/fixture/input.css', to: '/fixture/output.css', map: { inline: false, annotation: false },
  });
  assert.equal(result.css, 'a { -ms-user-select: none; user-select: none; display: flex }');
  const map = result.map.toJSON();
  assert.deepEqual(map.sourcesContent, [css]);
  const original = new SourceMapConsumer(map).originalPositionFor({ line: 1, column: result.css.indexOf('user-select') });
  assert.equal(original.source, 'input.css');
  assert.equal(original.line, 1);
  assert.equal(result.warnings().length, 0);
});

test('invalid Baseline configuration throws without terminating its caller', () => {
  // Run the real API in a bounded child: an old process.exit() cannot terminate
  // the test runner. A caught exception and the next event-loop turn must occur.
  const code = `const assert = require('node:assert/strict');
    const { createRequire } = require('node:module');
    const api = createRequire(${JSON.stringify(path.join(root, 'package.json'))})('baseline-browser-mapping');
    assert.throws(() => api.getCompatibleVersions({ targetYear: 2020, widelyAvailableOnDate: '2025-01-01' }));
    assert.throws(() => api.getCompatibleVersions({ includeKaiOS: true, includeDownstreamBrowsers: false }));
    assert.throws(() => api.getAllVersions({ includeKaiOS: true, includeDownstreamBrowsers: false }));
    setImmediate(() => console.log('caller-alive-after-three-exceptions'));`;
  const result = spawnSync(process.execPath, ['--max-old-space-size=128', '-e', code],
    { encoding: 'utf8', timeout: 5_000, maxBuffer: 64 * 1024, windowsHide: true });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout.trim(), 'caller-alive-after-three-exceptions');
});

test('historical Baseline browser versions and the real Next query remain compatible', () => {
  const api = fromProject('baseline-browser-mapping');
  const project = (entries) => entries.map(({ browser, version }) => `${browser} ${version}`);
  assert.deepEqual(project(api.getCompatibleVersions({ targetYear: 2020 })), [
    'chrome 87', 'chrome_android 87', 'edge 87', 'firefox 83', 'firefox_android 83', 'safari 14', 'safari_ios 14',
  ]);
  assert.deepEqual(project(api.getCompatibleVersions({ widelyAvailableOnDate: '2025-01-01' })), [
    'chrome 101', 'chrome_android 101', 'edge 101', 'firefox 102', 'firefox_android 102', 'safari 15.4', 'safari_ios 15.4',
  ]);
  const nextBrowserslist = fromProject('next/dist/compiled/browserslist');
  const resolved = nextBrowserslist('baseline 2020');
  for (const browser of ['chrome 87', 'edge 87', 'firefox 83', 'safari 14']) assert.ok(resolved.includes(browser));
  assert.ok(resolved.length > 7);
});

test('the final-image inventory requires a Next root and rejects vulnerable nested copies', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bertel-tooling-runtime-'));
  const probe = path.join(__dirname, 'check-tooling-runtime.cjs');
  function run() {
    return spawnSync(process.execPath, [probe], { cwd: directory, encoding: 'utf8', timeout: 5_000, windowsHide: true });
  }
  try {
    const wrongRoot = run();
    assert.equal(wrongRoot.status, 1);
    assert.match(wrongRoot.stderr, /Expected a standalone Next installation/);
    const next = path.join(directory, 'node_modules/next');
    fs.mkdirSync(next, { recursive: true });
    fs.writeFileSync(path.join(next, 'package.json'), JSON.stringify({ name: 'next', version: '16.4.5' }));
    const empty = run();
    assert.ifError(empty.error);
    assert.equal(empty.status, 0, empty.stderr);
    assert.deepEqual(JSON.parse(empty.stdout).packageInstalledToolingDependencies, []);
    const nested = path.join(directory, 'node_modules/parent/node_modules/source-map-js');
    fs.mkdirSync(nested, { recursive: true });
    const metadata = path.join(nested, 'package.json');
    fs.writeFileSync(metadata, JSON.stringify({ name: 'source-map-js', version: '1.2.1' }));
    assert.equal(run().status, 1);
    fs.writeFileSync(metadata, JSON.stringify({ name: 'source-map-js', version: '1.2.2' }));
    const safe = run();
    assert.ifError(safe.error);
    assert.equal(safe.status, 0, safe.stderr);
    assert.deepEqual(JSON.parse(safe.stdout).packageInstalledToolingDependencies.map(({ name, version }) => ({ name, version })),
      [{ name: 'source-map-js', version: '1.2.2' }]);
    const baseline = path.join(directory, 'node_modules/parent/node_modules/baseline-browser-mapping');
    fs.mkdirSync(baseline, { recursive: true });
    fs.writeFileSync(path.join(baseline, 'package.json'), JSON.stringify({ name: 'baseline-browser-mapping', version: '2.10.8' }));
    const unsafeBaseline = run();
    assert.equal(unsafeBaseline.status, 1);
    assert.match(unsafeBaseline.stderr, /Vulnerable runtime copy: baseline-browser-mapping/);
    fs.writeFileSync(path.join(baseline, 'package.json'), JSON.stringify({ name: 'baseline-browser-mapping', version: '2.11.0' }));
    assert.equal(run().status, 0);
    fs.unlinkSync(metadata);
    const unidentified = run();
    assert.equal(unidentified.status, 1);
    assert.match(unidentified.stderr, /Unidentified runtime copy/);
  } finally {
    assert.ok(path.resolve(directory).startsWith(path.resolve(path.join(os.tmpdir(), 'bertel-tooling-runtime-'))),
      'Refusing cleanup outside this disposable fixture');
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
