import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveStatus } from '../src/services/orderService.js';

// deriveStatus is the single source of truth for an order's resolution status.
// It must never require the database (pure function of the resolution results).

test('deriveStatus: no results / empty → needs_review', () => {
  assert.equal(deriveStatus(undefined), 'needs_review');
  assert.equal(deriveStatus({}), 'needs_review');
  assert.equal(deriveStatus({ results: [] }), 'needs_review');
});

test('deriveStatus: none approved → needs_review', () => {
  assert.equal(
    deriveStatus({ results: [{ status: 'needs_review' }, { status: 'needs_review' }] }),
    'needs_review'
  );
});

test('deriveStatus: some (not all) approved → partially_resolved', () => {
  assert.equal(
    deriveStatus({ results: [{ status: 'approved' }, { status: 'needs_review' }] }),
    'partially_resolved'
  );
});

test('deriveStatus: all approved → resolved', () => {
  assert.equal(
    deriveStatus({ results: [{ status: 'approved' }, { status: 'approved' }] }),
    'resolved'
  );
});

test('deriveStatus: single approved product → resolved', () => {
  assert.equal(deriveStatus({ results: [{ status: 'approved' }] }), 'resolved');
});
