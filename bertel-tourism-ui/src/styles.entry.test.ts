import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'postcss';
import { readStylesheet } from './styles.test-utils';

it('loads every global stylesheet once, in the explicit cascade order', () => {
  const root = parse(readFileSync(join(__dirname, 'styles.css'), 'utf8'));
  const imported = root.nodes.flatMap((node) => node.type === 'atrule' && node.name === 'import'
    ? [node.params.replace(/^['"]\.\/styles\//, '').replace(/['"]$/, '')] : []);
  const files = readdirSync(join(__dirname, 'styles')).filter((file) => file.endsWith('.css')).sort();
  expect(imported).toEqual(files);
  expect(new Set(imported).size).toBe(imported.length);
  const css = readStylesheet(join(__dirname, 'styles.css'));
  expect(css).toContain('@tailwind base');
  expect(css).toContain('@tailwind utilities');
  expect(css).toContain(".portal-fiche-page[data-view='rubric']");
  expect(css).toContain('.app-modal');
  expect(css).toContain('.crm-app .crm-modal');
});
