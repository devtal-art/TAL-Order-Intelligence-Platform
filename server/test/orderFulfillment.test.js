import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFulfillmentPatch, DELIVERY_STATUSES } from '../src/services/orderService.js';

// ── pendingQty bounds: integer, 0 ≤ n ≤ orderedQty ──

test('pendingQty: every value from 0 to the ordered quantity is accepted', () => {
  for (let n = 0; n <= 20; n += 1) {
    assert.deepEqual(validateFulfillmentPatch({ pendingQty: n }, 20).set, { pendingQty: n });
  }
});

test('pendingQty: numeric strings are coerced', () => {
  assert.deepEqual(validateFulfillmentPatch({ pendingQty: '5' }, 20).set, { pendingQty: 5 });
});

test('pendingQty: above the ordered quantity is rejected', () => {
  assert.throws(() => validateFulfillmentPatch({ pendingQty: 21 }, 20), /cannot exceed/);
});

test('pendingQty: negative is rejected', () => {
  assert.throws(() => validateFulfillmentPatch({ pendingQty: -1 }, 20), /integer of 0 or more/);
});

test('pendingQty: non-integers are rejected', () => {
  assert.throws(() => validateFulfillmentPatch({ pendingQty: 2.5 }, 20), /integer/);
  assert.throws(() => validateFulfillmentPatch({ pendingQty: 'abc' }, 20), /integer/);
});

test('pendingQty: no upper bound when the ordered quantity is unknown', () => {
  assert.deepEqual(validateFulfillmentPatch({ pendingQty: 999 }, NaN).set, { pendingQty: 999 });
});

test('pendingQty: null or empty string clears the field', () => {
  assert.deepEqual(validateFulfillmentPatch({ pendingQty: null }, 20).unset, ['pendingQty']);
  assert.deepEqual(validateFulfillmentPatch({ pendingQty: '' }, 20).unset, ['pendingQty']);
});

// ── status: enum only ──

test('status: all delivery statuses are accepted', () => {
  for (const s of DELIVERY_STATUSES) {
    assert.deepEqual(validateFulfillmentPatch({ status: s }, 20).set, { status: s });
  }
});

test('status: unknown values are rejected', () => {
  assert.throws(() => validateFulfillmentPatch({ status: 'shipped' }, 20), /must be one of/);
  assert.throws(() => validateFulfillmentPatch({ status: 'Delivered' }, 20), /must be one of/); // display label, not stored value
});

test('status: null or empty string clears the field', () => {
  assert.deepEqual(validateFulfillmentPatch({ status: null }, 20).unset, ['status']);
  assert.deepEqual(validateFulfillmentPatch({ status: '' }, 20).unset, ['status']);
});

// ── patch shape ──

test('both fields validate together', () => {
  const v = validateFulfillmentPatch({ pendingQty: 5, status: 'half_delivered' }, 20);
  assert.deepEqual(v.set, { pendingQty: 5, status: 'half_delivered' });
  assert.deepEqual(v.unset, []);
});

test('untouched fields are left out entirely', () => {
  const v = validateFulfillmentPatch({ pendingQty: 0 }, 20);
  assert.deepEqual(v.set, { pendingQty: 0 });
  assert.deepEqual(v.unset, []);
});

test('non-object patches are rejected', () => {
  assert.throws(() => validateFulfillmentPatch('delivered', 20), /must be an object/);
  assert.throws(() => validateFulfillmentPatch(['delivered'], 20), /must be an object/);
});
