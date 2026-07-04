import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeForMatch,
  tokenize,
  levenshtein,
  stringSimilarity,
  tokenSimilarity,
  partialSimilarity,
  scoreMatch,
  findBestMatch,
  MATCH_THRESHOLD,
} from '../src/services/resolveService.js';

// Build a scoring entry the way resolveProducts does.
const entry = (name, itemNo) => {
  const norm = normalizeForMatch(name);
  return { name, item_no: itemNo, norm, tokens: tokenize(norm) };
};

test('normalizeForMatch: lowercases, strips punctuation, collapses spaces, trims', () => {
  assert.equal(normalizeForMatch('  Widget, Blue (0.5L)! '), 'widget blue 0 5l');
  assert.equal(normalizeForMatch('Green   Gadget'), 'green gadget');
  assert.equal(normalizeForMatch(null), '');
});

test('tokenize splits normalized string into tokens', () => {
  assert.deepEqual(tokenize('blue widget 500ml'), ['blue', 'widget', '500ml']);
  assert.deepEqual(tokenize(''), []);
});

test('levenshtein basic distances', () => {
  assert.equal(levenshtein('abc', 'abc'), 0);
  assert.equal(levenshtein('abc', 'abd'), 1);
  assert.equal(levenshtein('', 'abc'), 3);
});

test('stringSimilarity is 1 for identical, lower for different', () => {
  assert.equal(stringSimilarity('blue widget', 'blue widget'), 1);
  assert.ok(stringSimilarity('blue widget', 'blue widget 500ml') < 1);
  assert.ok(stringSimilarity('blue widget', 'banana phone') < 0.5);
});

test('tokenSimilarity: identical=1, disjoint=0, partial in between', () => {
  assert.equal(tokenSimilarity(['blue', 'widget'], ['blue', 'widget']), 1);
  assert.equal(tokenSimilarity(['blue', 'widget'], ['banana', 'phone']), 0);
  // 2 common, |A|=2, |B|=3 -> 2*2/(2+3) = 0.8
  assert.equal(tokenSimilarity(['blue', 'widget'], ['blue', 'widget', '500ml']), 0.8);
  assert.equal(tokenSimilarity([], ['x']), 0);
});

test('partialSimilarity: fraction of email tokens found as substrings', () => {
  assert.equal(partialSimilarity(['blue', 'widget'], 'blue widget 500ml'), 1);
  assert.equal(partialSimilarity(['blue', 'gadget'], 'blue widget 500ml'), 0.5);
  assert.equal(partialSimilarity(['banana'], 'blue widget 500ml'), 0);
});

test('scoreMatch: identical normalized names score 100', () => {
  assert.equal(scoreMatch('Blue Widget 500ml', entry('Blue Widget 500ml', 'WB-500')), 100);
  // Punctuation/case differences still normalize to identical -> 100
  assert.equal(scoreMatch('blue widget 500ml', entry('Blue, Widget 500ml', 'WB-500')), 100);
});

test('scoreMatch: strong partial match clears the threshold', () => {
  const s = scoreMatch('Blue Widget', entry('Blue Widget 500ml', 'WB-500'));
  assert.ok(s >= MATCH_THRESHOLD, `expected >= ${MATCH_THRESHOLD}, got ${s}`);
});

test('scoreMatch: unrelated names fall below the threshold', () => {
  const s = scoreMatch('Banana Phone', entry('Blue Widget 500ml', 'WB-500'));
  assert.ok(s < MATCH_THRESHOLD, `expected < ${MATCH_THRESHOLD}, got ${s}`);
});

test('findBestMatch returns the single highest-scoring product', () => {
  const catalog = [
    entry('Red Doohickey', 'RD-9'),
    entry('Blue Widget 500ml', 'WB-500'),
    entry('Green Gadget', 'GG-1'),
  ];
  const best = findBestMatch('blue widget 500 ml', catalog);
  assert.equal(best.itemNo, 'WB-500');
  assert.equal(best.websiteProductName, 'Blue Widget 500ml');
  assert.ok(best.matchScore >= MATCH_THRESHOLD);
  // Single object, not an array
  assert.equal(Array.isArray(best), false);
});

test('findBestMatch on empty catalog returns null', () => {
  assert.equal(findBestMatch('anything', []), null);
});

test('findBestMatch picks the closest among similar candidates', () => {
  const catalog = [
    entry('Widget Blue 250ml', 'WB-250'),
    entry('Widget Blue 500ml', 'WB-500'),
    entry('Widget Red 500ml', 'WR-500'),
  ];
  const best = findBestMatch('Blue Widget 500ml', catalog);
  assert.equal(best.itemNo, 'WB-500');
});
