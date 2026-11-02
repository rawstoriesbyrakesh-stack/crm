import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRASH_RETENTION_DAYS,
  calculateProposalTotals,
  buildFavoriteGroups,
  getExpiryDaysLeft,
  getTrashDaysLeft,
  sanitizeFolderName,
  toggleSetValue,
} from '../../src/utils/featureUtils.js';

const DAY = 24 * 60 * 60 * 1000;

test('trash countdown returns the retention period for missing or invalid dates', () => {
  assert.equal(getTrashDaysLeft('', 0), TRASH_RETENTION_DAYS);
  assert.equal(getTrashDaysLeft('not-a-date', 0), TRASH_RETENTION_DAYS);
});

test('trash countdown uses whole elapsed days and clamps to its retention period', () => {
  const now = Date.parse('2026-11-01T12:00:00Z');
  assert.equal(getTrashDaysLeft('2026-10-31T12:00:00Z', now), 29);
  assert.equal(getTrashDaysLeft('2026-10-31T13:00:00Z', now), 30);
  assert.equal(getTrashDaysLeft('2026-10-01T12:00:00Z', now), 0);
  assert.equal(getTrashDaysLeft('2026-11-02T12:00:00Z', now), 30);
});

test('expiry days are null for permanent or invalid expiries, otherwise rounded up', () => {
  const now = Date.parse('2026-11-01T12:00:00Z');
  assert.equal(getExpiryDaysLeft('', now), null);
  assert.equal(getExpiryDaysLeft('invalid', now), null);
  assert.equal(getExpiryDaysLeft('2026-11-01T11:59:59Z', now), 0);
  assert.equal(getExpiryDaysLeft('2026-11-02T11:59:59Z', now), 1);
  assert.equal(getExpiryDaysLeft(new Date(now + DAY + 1).toISOString(), now), 2);
});

test('folder names are normalized, safe, and capped at 100 characters', () => {
  assert.equal(sanitizeFolderName('Wedding ## 2026'), 'wedding_2026');
  assert.equal(sanitizeFolderName(' A---B___C '), '_a---b_c_');
  assert.equal(sanitizeFolderName('X'.repeat(110)), 'x'.repeat(100));
});

test('proposal totals handle numeric strings, discount, tax, and rounding', () => {
  assert.deepEqual(calculateProposalTotals([
    { price: '35000' },
    { price: 65000 },
    { price: 'not-a-price' },
  ], 10, 18), {
    subtotal: 100000,
    discountAmount: 10000,
    taxableAmount: 90000,
    taxAmount: 16200,
    grandTotal: 106200,
  });
  assert.deepEqual(calculateProposalTotals([{ price: 1 }], 0, 18), {
    subtotal: 1,
    discountAmount: 0,
    taxableAmount: 1,
    taxAmount: 0.18,
    grandTotal: 1,
  });
  assert.deepEqual(calculateProposalTotals([], 0, 0), {
    subtotal: 0,
    discountAmount: 0,
    taxableAmount: 0,
    taxAmount: 0,
    grandTotal: 0,
  });
});

test('favorite groups combine link favorites and file favorites, deduplicated by key', () => {
  const groups = buildFavoriteGroups([
    { key: 'weddings/rahul_sneha/one.jpg', presigned_url: 'signed-one' },
    { key: 'weddings/rahul_sneha/two.MP4' },
    { key: 'root-photo.png', isFavorite: true },
    { key: 'weddings/rahul_sneha/ignored.jpg' },
    { key: 'weddings/rahul_sneha/one.jpg', url: 'duplicate' },
  ], new Set(['weddings/rahul_sneha/one.jpg', 'weddings/rahul_sneha/two.MP4']), '/api');

  assert.equal(groups.length, 2);
  const wedding = groups.find(group => group.folderPath === 'weddings/rahul_sneha');
  assert.ok(wedding);
  assert.equal(wedding.folderName, 'rahul sneha');
  assert.deepEqual(wedding.items.map(item => item.key), [
    'weddings/rahul_sneha/one.jpg',
    'weddings/rahul_sneha/two.MP4',
  ]);
  assert.equal(wedding.items[0].imageUrl, 'signed-one');
  assert.equal(wedding.items[1].imageUrl, '/api/uploads/weddings/rahul_sneha/two.MP4');
  assert.equal(wedding.items[1].isVideo, true);

  const root = groups.find(group => group.folderPath === 'root');
  assert.equal(root.folderName, 'Main Gallery');
  assert.equal(root.items[0].filename, 'root-photo.png');
});

test('favorite toggling returns a new set and does not mutate the old set', () => {
  const current = new Set(['a']);
  const added = toggleSetValue(current, 'b');
  assert.deepEqual([...added], ['a', 'b']);
  assert.deepEqual([...current], ['a']);

  const removed = toggleSetValue(added, 'a');
  assert.deepEqual([...removed], ['b']);
  assert.deepEqual([...added], ['a', 'b']);
});
