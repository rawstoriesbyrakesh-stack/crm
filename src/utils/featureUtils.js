export const TRASH_RETENTION_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function getTrashDaysLeft(lastModified, now = Date.now(), retentionDays = TRASH_RETENTION_DAYS) {
  if (!lastModified) return retentionDays;
  const deletedAt = new Date(lastModified).getTime();
  if (!Number.isFinite(deletedAt)) return retentionDays;
  const daysGone = Math.floor((now - deletedAt) / MS_PER_DAY);
  return Math.min(retentionDays, Math.max(0, retentionDays - daysGone));
}

export function getExpiryDaysLeft(expiresAt, now = Date.now()) {
  if (!expiresAt) return null;
  const expiry = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiry)) return null;
  const difference = expiry - now;
  return difference <= 0 ? 0 : Math.ceil(difference / MS_PER_DAY);
}

export function sanitizeFolderName(name) {
  return name
    .replace(/[^a-zA-Z0-9-_]/g, '_')
    .replace(/_+/g, '_')
    .toLowerCase()
    .slice(0, 100);
}

export function calculateProposalTotals(items, discountPercent = 0, taxPercent = 0) {
  const subtotal = items.reduce((total, item) => total + (Number(item.price) || 0), 0);
  const discountAmount = (subtotal * (discountPercent || 0)) / 100;
  const taxableAmount = subtotal - discountAmount;
  const taxAmount = (taxableAmount * (taxPercent || 0)) / 100;
  return {
    subtotal,
    discountAmount,
    taxableAmount,
    taxAmount,
    grandTotal: Math.round(taxableAmount + taxAmount),
  };
}

export function toggleSetValue(values, value) {
  const next = new Set(values);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export function buildFavoriteGroups(files, shareFavoriteKeys, apiBaseUrl = '') {
  const favoritesByKey = new Map();
  const sharedFavorites = shareFavoriteKeys instanceof Set
    ? shareFavoriteKeys
    : new Set(shareFavoriteKeys || []);

  for (const file of files || []) {
    const key = file.key || '';
    if (!key || (!file.isFavorite && !sharedFavorites.has(key))) continue;
    if (favoritesByKey.has(key)) continue;

    const parts = key.split('/');
    const filename = parts.pop() || key;
    const folderPath = parts.join('/') || 'root';
    const folderName = (parts.at(-1) || 'Main Gallery').replace(/[_-]/g, ' ');
    favoritesByKey.set(key, {
      id: key,
      key,
      filename,
      imageUrl: file.presigned_url || file.url || `${apiBaseUrl}/uploads/${key}`,
      folderPath,
      folderName,
      isVideo: /\.(mp4|mov|avi|mkv|webm)$/i.test(key),
    });
  }

  const groups = new Map();
  for (const item of favoritesByKey.values()) {
    if (!groups.has(item.folderPath)) {
      groups.set(item.folderPath, {
        folderPath: item.folderPath,
        folderName: item.folderName,
        items: [],
      });
    }
    groups.get(item.folderPath).items.push(item);
  }
  return Array.from(groups.values());
}
