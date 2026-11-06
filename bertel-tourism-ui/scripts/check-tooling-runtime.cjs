const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const minimum = { 'source-map-js': [1, 2, 2], 'baseline-browser-mapping': [2, 11, 0] };
const root = path.resolve(process.argv[2] || process.cwd());
const nextManifest = path.join(root, 'node_modules/next/package.json');
assert.ok(fs.existsSync(nextManifest), 'Expected a standalone Next installation at the inspected root');
const next = JSON.parse(fs.readFileSync(nextManifest, 'utf8'));
assert.equal(next.name, 'next', 'The inspected root is not the standalone Next installation');
const present = [];
const visited = new Set();
function inspectModules(directory) {
  if (!fs.existsSync(directory)) return;
  const real = fs.realpathSync(directory);
  if (visited.has(real)) return;
  visited.add(real);
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    if (item.name.startsWith('.')) continue;
    const location = path.join(directory, item.name);
    if (item.name.startsWith('@')) { inspectModules(location); continue; }
    const metadata = path.join(location, 'package.json');
    assert.ok(!Object.hasOwn(minimum, item.name) || fs.existsSync(metadata), `Unidentified runtime copy: ${item.name}`);
    if (fs.existsSync(metadata)) {
      const pkg = JSON.parse(fs.readFileSync(metadata, 'utf8'));
      if (Object.hasOwn(minimum, pkg.name)) {
        assert.equal(typeof pkg.version, 'string', `Unknown runtime version: ${pkg.name}`);
        const parts = pkg.version.split('.').map(Number);
        const floor = minimum[pkg.name];
        assert.ok(parts.length === 3 && parts.every((value) => Number.isSafeInteger(value) && value >= 0), `Unknown runtime version: ${pkg.name}`);
        const difference = parts.map((value, i) => value - floor[i]).find((value) => value !== 0) || 0;
        assert.ok(difference >= 0, `Vulnerable runtime copy: ${pkg.name}@${pkg.version}`);
        present.push({ name: pkg.name, version: pkg.version, path: path.relative(root, location).split(path.sep).join('/') });
      }
    }
    inspectModules(path.join(location, 'node_modules'));
  }
}
inspectModules(path.join(root, 'node_modules'));
console.log(JSON.stringify({ inspectedRoot: root, nextVersion: next.version, packageInstalledToolingDependencies: present,
  note: 'Only package-installed copies are inventoried. Inlined code and HTTP reachability require separate analysis.' }));
