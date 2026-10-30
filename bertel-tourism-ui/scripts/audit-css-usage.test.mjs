import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requiredClasses, unusedSelectors } from './audit-css-usage.mjs';

const used = (name) => name === 'card' || name === 'active';
test('an absent class inside :not does not make a live rule removable', () => {
  assert.equal(unusedSelectors('.card:not(.retired)', used), null);
  assert.deepEqual(requiredClasses('.card:not(.retired)'), ['card']);
});
test('functional selectors and attribute text are retained unless an outer required class is absent', () => {
  for (const selector of [':is(.retired, .active)', ':where(.retired)', '.card:has(.retired)', '.card[data-label=".retired"]']) {
    assert.equal(unusedSelectors(selector, used), null);
  }
  assert.ok(unusedSelectors('.retired:is(.active, .card)', used));
});
test('a selector list is kept in full if any branch can still match', () => {
  assert.equal(unusedSelectors('.retired, .card', used), null);
  assert.ok(unusedSelectors('.retired, .card .missing', used));
});
test('escaped or malformed selectors never authorize a removal', () => {
  for (const selector of ['.retired\\:hover', '.retired:not(', '.retired[data-x="oops]']) {
    assert.equal(unusedSelectors(selector, used), null);
  }
});
