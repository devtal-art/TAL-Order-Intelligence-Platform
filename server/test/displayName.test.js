import test from 'node:test';
import assert from 'node:assert/strict';
import { productDisplayName } from '../src/utils/displayName.js';
import { withCatalogDisplayNames } from '../src/services/orderService.js';
import { parseCatalogCsv } from '../src/services/catalogCsv.js';
import { findBestMatch, normalizeForMatch, tokenize } from '../src/services/resolveService.js';

// ── productDisplayName ──

test('productDisplayName: appends the option in parentheses', () => {
  assert.equal(productDisplayName('Humza Burger', 'Box10'), 'Humza Burger (Box10)');
});

test('productDisplayName: no option → plain name', () => {
  assert.equal(productDisplayName('Humza Burger', ''), 'Humza Burger');
  assert.equal(productDisplayName('Humza Burger', null), 'Humza Burger');
  assert.equal(productDisplayName('Humza Burger', undefined), 'Humza Burger');
  assert.equal(productDisplayName('Humza Burger', '   '), 'Humza Burger');
});

// ── catalog CSV: optional "Option" column ──

test('parseCatalogCsv: reads the Option column when present', () => {
  const csv = Buffer.from('item_no,name,Option\n71001,Humza Burger,Box10\n71002,Plain Naan,\n');
  const { products } = parseCatalogCsv(csv);
  assert.equal(products[0].option, 'Box10');
  assert.equal(products[1].option, '');
});

test('parseCatalogCsv: Option column absent → option is empty (backward compatible)', () => {
  const csv = Buffer.from('item_no,name\n71001,Humza Burger\n');
  const { products } = parseCatalogCsv(csv);
  assert.equal(products[0].option, '');
  assert.equal(products[0].name, 'Humza Burger');
});

// ── findBestMatch: scores on the raw name, surfaces the display name ──

const entry = (name, itemNo, option) => {
  const norm = normalizeForMatch(name);
  return {
    name,
    displayName: productDisplayName(name, option),
    item_no: itemNo,
    norm,
    tokens: tokenize(norm),
  };
};

test('findBestMatch: surfaces "Name (Option)" without affecting the match', () => {
  const catalog = [entry('Humza Burger', '71001', 'Box10'), entry('Plain Naan', '71002', '')];
  const best = findBestMatch('humza burger', catalog);
  assert.equal(best.itemNo, '71001');
  assert.equal(best.websiteProductName, 'Humza Burger (Box10)');
});

test('findBestMatch: entries without displayName keep the raw name (legacy shape)', () => {
  const norm = normalizeForMatch('Plain Naan');
  const best = findBestMatch('plain naan', [{ name: 'Plain Naan', item_no: '71002', norm, tokens: tokenize(norm) }]);
  assert.equal(best.websiteProductName, 'Plain Naan');
});

// ── withCatalogDisplayNames: read-time enrichment of stored snapshots ──

const byItemNo = new Map([
  ['71001', { item_no: '71001', name: 'Humza Burger', option: 'Box10' }],
  ['71002', { item_no: '71002', name: 'Plain Naan', option: '' }],
]);

test('withCatalogDisplayNames: rewrites match, suggestion and candidates', () => {
  const snapshot = {
    catalogVersion: 'cat_x',
    results: [
      { lineId: '1', status: 'approved', match: { websiteProductName: 'Humza Burger', itemNo: '71001' }, candidates: [] },
      {
        lineId: '2',
        status: 'needs_review',
        match: null,
        suggestedProduct: { websiteProductName: 'Plain Naan', itemNo: '71002', matchScore: 80 },
        candidates: [{ websiteProductName: 'Plain Naan', itemNo: '71002', matchPercent: 80 }],
      },
    ],
  };
  const out = withCatalogDisplayNames(snapshot, byItemNo);
  assert.equal(out.results[0].match.websiteProductName, 'Humza Burger (Box10)');
  assert.equal(out.results[1].suggestedProduct.websiteProductName, 'Plain Naan'); // empty option → plain
  assert.equal(out.results[1].candidates[0].websiteProductName, 'Plain Naan');
  // Untouched fields survive.
  assert.equal(out.catalogVersion, 'cat_x');
  assert.equal(out.results[1].suggestedProduct.matchScore, 80);
});

test('withCatalogDisplayNames: items missing from the catalog keep their stored name', () => {
  const snapshot = {
    results: [{ lineId: '1', status: 'approved', match: { websiteProductName: 'Old Name', itemNo: '99999' } }],
  };
  const out = withCatalogDisplayNames(snapshot, byItemNo);
  assert.equal(out.results[0].match.websiteProductName, 'Old Name');
});

test('withCatalogDisplayNames: does not mutate the stored snapshot', () => {
  const snapshot = {
    results: [{ lineId: '1', status: 'approved', match: { websiteProductName: 'Humza Burger', itemNo: '71001' } }],
  };
  withCatalogDisplayNames(snapshot, byItemNo);
  assert.equal(snapshot.results[0].match.websiteProductName, 'Humza Burger');
});

test('withCatalogDisplayNames: empty snapshot or empty catalog map → unchanged', () => {
  assert.deepEqual(withCatalogDisplayNames({}, byItemNo), {});
  const snapshot = { results: [{ lineId: '1', match: { websiteProductName: 'X', itemNo: '71001' } }] };
  assert.equal(withCatalogDisplayNames(snapshot, new Map()), snapshot);
});
