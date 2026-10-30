import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import postcss from 'postcss';
import ts from 'typescript';

/** Only classes required outside functional pseudo-classes can prove a selector impossible. */
export function requiredClasses(selector) {
  if (selector.includes('\\')) return null;
  const classes = [];
  let parentheses = 0;
  let brackets = 0;
  let quote = '';
  for (let index = 0; index < selector.length; index += 1) {
    const character = selector[index];
    if (quote) { if (character === quote) quote = ''; continue; }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (character === '[') { brackets += 1; continue; }
    if (character === ']') { brackets -= 1; if (brackets < 0) return null; continue; }
    if (brackets) continue;
    if (character === '(') { parentheses += 1; continue; }
    if (character === ')') { parentheses -= 1; if (parentheses < 0) return null; continue; }
    if (character === '.' && parentheses === 0) {
      const match = /^[-_A-Za-z][-_A-Za-z0-9]*/.exec(selector.slice(index + 1));
      if (!match) return null;
      classes.push(match[0]);
      index += match[0].length;
    }
  }
  return quote || parentheses || brackets ? null : classes;
}

export function unusedSelectors(selector, mayBeUsed) {
  const selectors = postcss.list.comma(selector);
  if (!selectors.length) return null;
  const missing = selectors.map((item) => {
    const classes = requiredClasses(item);
    return { selector: item, missing: classes?.filter((name) => !mayBeUsed(name)) ?? [] };
  });
  return missing.every((item) => item.missing.length > 0) ? missing : null;
}

function sourceUsage(project) {
  const repo = path.resolve(project, '..');
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    cwd: repo, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024,
  }).split(/\r?\n/).filter((file) => /\.(?:ts|tsx|js|jsx|mjs|cjs|html|sql)$/.test(file));
  const words = new Set();
  const prefixes = new Set();
  const suffixes = new Set();
  const prefix = (value) => {
    const token = /[-_A-Za-z0-9]+$/.exec(value)?.[0];
    if (token?.length >= 2) prefixes.add(token);
  };
  for (const relative of files) {
    const file = path.join(repo, relative);
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const word of text.match(/[-_A-Za-z0-9]+/g) ?? []) words.add(word);
    if (!relative.startsWith('bertel-tourism-ui/src/') || !/\.[jt]sx?$/.test(file)) continue;
    const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const visit = (node) => {
      if (ts.isTemplateExpression(node)) {
        prefix(node.head.text);
        for (const span of node.templateSpans) {
          const suffix = /^[-_][-_A-Za-z0-9]+/.exec(span.literal.text)?.[0];
          if (suffix && suffix.length >= 3) suffixes.add(suffix);
          prefix(span.literal.text);
        }
      }
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken && ts.isStringLiteral(node.left)) prefix(node.left.text);
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'join') {
        let array = node.expression.expression;
        if (ts.isCallExpression(array) && ts.isPropertyAccessExpression(array.expression)) array = array.expression.expression;
        if (ts.isArrayLiteralExpression(array)) {
          const first = array.elements.find(ts.isStringLiteral);
          if (first) prefix(first.text);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
  const library = /^(?:maplibregl-|mapboxgl-|ProseMirror|sonner|lucide|tiptap|radix-)/;
  const mayBeUsed = (name) => words.has(name) || library.test(name)
    || [...prefixes].some((value) => name.startsWith(value))
    || [...suffixes].some((value) => name.endsWith(value));
  return { mayBeUsed, files: files.length, prefixes: [...prefixes], suffixes: [...suffixes] };
}

export function auditStyles(project, files) {
  const usage = sourceUsage(project);
  const candidates = [];
  for (const relative of files) {
    const source = fs.readFileSync(path.join(project, relative), 'utf8');
    postcss.parse(source, { from: relative }).walkRules((rule) => {
      for (let parent = rule.parent; parent; parent = parent.parent) if (parent.type === 'atrule' && /keyframes$/i.test(parent.name)) return;
      const selectors = unusedSelectors(rule.selector, usage.mayBeUsed);
      if (!selectors) return;
      candidates.push({ file: relative, line: rule.source.start.line, endLine: rule.source.end.line,
        selector: rule.selector, missing: [...new Set(selectors.flatMap((item) => item.missing))] });
    });
  }
  return { scannedSourceFiles: usage.files, candidates, dynamicPrefixes: usage.prefixes, dynamicSuffixes: usage.suffixes };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = auditStyles(project, ['src/styles.css', 'src/features/object-editor/object-editor.css']);
  const output = process.argv[2];
  if (output) fs.writeFileSync(path.resolve(output), JSON.stringify(result, null, 2) + '\n');
  const summary = Object.groupBy(result.candidates, (item) => item.file);
  console.log(JSON.stringify({ scannedSourceFiles: result.scannedSourceFiles,
    candidates: Object.fromEntries(Object.entries(summary).map(([file, rules]) => [file, { rules: rules.length, lines: rules.reduce((sum, rule) => sum + rule.endLine - rule.line + 1, 0) }])) }, null, 2));
}
