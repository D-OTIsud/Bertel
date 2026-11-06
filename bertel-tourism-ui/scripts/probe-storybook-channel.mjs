import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const appRoot = fileURLToPath(new URL('../', import.meta.url));
const project = path.resolve(process.argv[2] || appRoot);
const scenario = process.argv[3] || 'preview-dev';
if (!['preview-dev', 'preview-static', 'manager-dev', 'manager-ref', 'manager-unregistered'].includes(scenario)) {
  throw new Error('Unknown channel probe scenario');
}
const page = scenario.startsWith('manager') ? 'manager' : 'preview';
const mode = scenario === 'preview-static' ? 'PRODUCTION' : 'DEVELOPMENT';
const fromProject = createRequire(path.join(project, 'package.json'));
const entry = fromProject.resolve('storybook/internal/channels');
const pkg = JSON.parse(fs.readFileSync(path.resolve(path.dirname(entry), '../../package.json'), 'utf8'));
const frameOrigin = scenario === 'manager-ref' ? 'https://reference.invalid' : 'http://127.0.0.1:6006';
// jsdom does not load iframe resources here. The fixture represents a registered
// preview WindowProxy, whose identity survives navigation to a foreign origin.
const dom = new JSDOM(`<!doctype html><iframe id="storybook-preview-iframe" data-is-storybook data-is-loaded src="${frameOrigin}/iframe.html"></iframe>`, {
  url: page === 'manager' ? 'http://127.0.0.1:6006/' : 'http://127.0.0.1:6006/iframe.html',
});
for (const name of ['window', 'document', 'location', 'parent']) globalThis[name] = dom.window[name];
for (const name of ['addEventListener', 'removeEventListener', 'dispatchEvent']) {
  globalThis[name] = dom.window[name].bind(dom.window);
}
globalThis.CONFIG_TYPE = mode;
dom.window.CONFIG_TYPE = mode;
const errors = [];
const previousError = console.error;
console.error = (...args) => errors.push(args.map(String).join(' '));
try {
  // This is the real installed exported transport, not a copy of its filter.
  // No createBrowserChannel/CLI/server/WebSocket or project file writer runs.
  const { PostMessageTransport } = await import(pathToFileURL(entry).href);
  const transport = new PostMessageTransport({ page });
  const delivered = [];
  const barrier = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Legitimate trailing transport event was not processed')), 2_000);
    transport.setHandler((event) => {
      delivered.push(event.args[0]);
      if (event.args[0] === 'after') { clearTimeout(timer); resolve(); }
    });
  });
  const frame = dom.window.document.querySelector('iframe');
  const source = page === 'manager' ? frame.contentWindow : dom.window;
  const messages = scenario === 'manager-unregistered' ? [[frameOrigin, 'same']]
    : scenario === 'manager-ref'
    ? [[frameOrigin, 'registered-ref'], ['https://attacker.invalid', 'foreign']]
    : [['http://127.0.0.1:6006', 'same'], ['http://localhost:7000', 'local'], ['https://attacker.invalid', 'foreign'], ['null', 'opaque']];
  for (const [origin, marker] of messages) {
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { origin, source, data: JSON.stringify({
      key: 'storybook-channel', event: { type: 'security-probe', args: [marker], from: page === 'manager' ? 'preview' : 'manager' },
    }) }));
  }
  if (scenario === 'manager-unregistered') {
    frame.removeAttribute('data-is-storybook');
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { origin: frameOrigin, source, data: JSON.stringify({
      key: 'storybook-channel', event: { type: 'security-probe', args: ['unregistered'], from: 'preview' },
    }) }));
    frame.setAttribute('data-is-storybook', '');
  }
  // A valid final event proves the installed transport processed the preceding
  // message sequence; rejection is not inferred from a short fixed sleep.
  dom.window.dispatchEvent(new dom.window.MessageEvent('message', { origin: frameOrigin, source, data: JSON.stringify({
    key: 'storybook-channel', event: { type: 'security-probe', args: ['after'], from: page === 'manager' ? 'preview' : 'manager' },
  }) }));
  await barrier;
  console.log(`STORYBOOK_CHANNEL_PROOF ${JSON.stringify({ version: pkg.version,
    entry: path.relative(project, entry).split(path.sep).join('/'), scenario, page, mode, delivered, errors })}`);
} finally {
  console.error = previousError;
  dom.window.close();
}
