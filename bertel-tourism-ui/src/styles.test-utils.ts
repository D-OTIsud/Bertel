import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parse } from 'postcss';

/** Read the same ordered local imports as the global CSS entry, including nested rules. */
export function readStylesheet(file: string, ancestors: string[] = []): string {
  const absolute = resolve(file);
  if (ancestors.includes(absolute)) throw new Error(`Import CSS circulaire : ${absolute}`);
  const root = parse(readFileSync(absolute, 'utf8'), { from: absolute });
  return root.nodes.map((node) => {
    if (node.type !== 'atrule' || node.name !== 'import') return node.toString();
    const match = /^(['"])([^'"]+)\1$/.exec(node.params);
    if (!match || !match[2].startsWith('.')) throw new Error(`Import CSS non local : ${node.params}`);
    return readStylesheet(resolve(dirname(absolute), match[2]), [...ancestors, absolute]);
  }).join('\n');
}
