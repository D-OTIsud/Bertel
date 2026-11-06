const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { TextDecoder, TextEncoder } = require('node:util');
const { JSDOM } = require('jsdom');

const projectRoot = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const requireFromProject = createRequire(path.join(projectRoot, 'package.json'));
const entry = requireFromProject.resolve('maplibre-gl');
const packageRoot = path.dirname(requireFromProject.resolve('maplibre-gl/package.json'));
const pkg = requireFromProject('maplibre-gl/package.json');
assert.equal(pkg.version, '5.20.1');
assert.equal(entry, path.join(packageRoot, 'dist/maplibre-gl.js'));

const bundles = ['maplibre-gl.js', 'maplibre-gl-dev.js', 'maplibre-gl-csp.js', 'maplibre-gl-csp-dev.js'];
const payloads = [
  '<details open onload="window.fixture=1" ontoggle="window.fixture=2">Credit</details>',
  '<a href="javascript:window.fixture=1" onclick="window.fixture=2">Credit</a>',
];

try {
  for (const file of bundles) {
    const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' });
    // v5 creates a worker Blob URL at module initialization. This fixture does
    // not instantiate a Map/worker; jsdom only needs this missing host API.
    dom.window.URL.createObjectURL = () => 'blob:unused-attribution-fixture';
    dom.window.TextDecoder = TextDecoder;
    dom.window.TextEncoder = TextEncoder;
    let library;
    if (file === 'maplibre-gl.js') {
      for (const key of ['window', 'document', 'HTMLElement', 'Element', 'DOMParser']) globalThis[key] = dom.window[key];
      globalThis.self = dom.window;
      library = requireFromProject('maplibre-gl'); // the real installed default entry
    } else {
      dom.window.eval(fs.readFileSync(path.join(packageRoot, 'dist', file), 'utf8'));
      library = dom.window.maplibregl;
    }
    assert.equal(library.getVersion(), '5.20.1');
    for (const payload of payloads) {
      const container = dom.window.document.createElement('div');
      const control = new library.AttributionControl({ compact: false, customAttribution:
        `${payload}<a href="https://example.invalid/credit" target="_blank">Provider</a>` });
      const map = { style: { stylesheet: {}, sourceCaches: {} },
        getCanvasContainer: () => container, _getUIString: (key) => key, on() {}, off() {} };
      const element = control.onAdd(map);
      dom.window.document.body.append(element);
      const credit = element.querySelector('.maplibregl-ctrl-attrib-inner');
      assert.ok(credit.textContent.includes('Credit'), `Attribution text lost: ${file}`);
      assert.equal(credit.querySelector('[onload], [ontoggle], [onclick], [href^="javascript:"]'), null,
        `Unsafe attributes survived in ${file}`);
      assert.equal(credit.querySelector('a[href="https://example.invalid/credit"]').textContent, 'Provider');
      control.onRemove();
    }
    dom.window.close();
  }
  console.log(JSON.stringify({ version: pkg.version, entry: path.relative(projectRoot, entry).split(path.sep).join('/'),
    bundles, payloads: payloads.length, status: 'safe attribution' }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
