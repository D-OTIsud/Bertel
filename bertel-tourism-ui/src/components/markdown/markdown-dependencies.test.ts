/** @jest-environment node */
import { execFileSync } from 'node:child_process';

// Keep pathological dependency parsing outside Jest's event loop. A regression
// must terminate with a bounded child timeout rather than freeze the whole suite.
function parseInChild(source: string): void {
  expect(execFileSync(process.execPath, ['-e', source], {
    cwd: process.cwd(), timeout: 4000, encoding: 'utf8', windowsHide: true,
  }).trim()).toBe('parsed');
}

test('installed Tiptap bounds crafted block and inline Markdown attributes', () => {
  parseInChild(`
    const assert = require('node:assert/strict');
    const core = require('@tiptap/core');
    const block = core.createAtomBlockMarkdownSpec({ nodeName: 'probe' }).markdownTokenizer;
    const inline = core.createInlineMarkdownSpec({ nodeName: 'probe', selfClosing: true }).markdownTokenizer;
    assert.ok(block.tokenize(':::probe {' + '__QUOTED_0'.repeat(8192) + '__QUOTED_0__} :::\\n', [], {}));
    assert.ok(inline.tokenize('[probe ' + '0'.repeat(65536) + ']', [], {}));
    console.log('parsed');
  `);
});

test('installed markdown-it bounds unclosed multiline reference input', () => {
  parseInChild(`
    const assert = require('node:assert/strict');
    const md = require('markdown-it')({ html: false, linkify: false });
    assert.equal(typeof md.render('[a]: /tourisme "' + 'suite\\n'.repeat(100000)), 'string');
    assert.equal(typeof md.render('[' + 'suite\\n'.repeat(100000)), 'string');
    console.log('parsed');
  `);
});
