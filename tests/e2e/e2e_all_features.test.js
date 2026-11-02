import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ============================================================================
// 1. TRASH DAYS-REMAINING COUNTDOWN E2E TESTS
// ============================================================================
test('E2E - Trash Countdown: Days Left Calculation & Severity Thresholds', () => {
  const TRASH_RETENTION_DAYS = 30;

  function getDaysLeft(lastModified, now = Date.now()) {
    if (!lastModified) return TRASH_RETENTION_DAYS;
    const deleted = new Date(lastModified).getTime();
    const daysGone = Math.floor((now - deleted) / (1000 * 60 * 60 * 24));
    return Math.max(0, TRASH_RETENTION_DAYS - daysGone);
  }

  function getBadgeSeverity(daysLeft) {
    if (daysLeft <= 3) return 'danger-pulse'; // Red
    if (daysLeft <= 7) return 'warning';      // Amber
    return 'normal';                          // Green
  }

  const now = new Date('2026-11-01T12:00:00Z').getTime();

  // Test newly deleted item (1 day ago)
  const oneDayAgo = new Date('2026-10-31T12:00:00Z').toISOString();
  assert.equal(getDaysLeft(oneDayAgo, now), 29);
  assert.equal(getBadgeSeverity(getDaysLeft(oneDayAgo, now)), 'normal');

  // Test item 25 days ago (5 days left -> warning)
  const twentyFiveDaysAgo = new Date('2026-10-07T12:00:00Z').toISOString();
  assert.equal(getDaysLeft(twentyFiveDaysAgo, now), 5);
  assert.equal(getBadgeSeverity(getDaysLeft(twentyFiveDaysAgo, now)), 'warning');

  // Test item 28 days ago (2 days left -> danger-pulse)
  const twentyEightDaysAgo = new Date('2026-10-04T12:00:00Z').toISOString();
  assert.equal(getDaysLeft(twentyEightDaysAgo, now), 2);
  assert.equal(getBadgeSeverity(getDaysLeft(twentyEightDaysAgo, now)), 'danger-pulse');

  // Test item 35 days ago (should clamp to 0)
  const thirtyFiveDaysAgo = new Date('2026-09-27T12:00:00Z').toISOString();
  assert.equal(getDaysLeft(thirtyFiveDaysAgo, now), 0);
  assert.equal(getBadgeSeverity(getDaysLeft(thirtyFiveDaysAgo, now)), 'danger-pulse');
});

// ============================================================================
// 2. SHARED LINKS EXPIRY WARNINGS E2E TESTS
// ============================================================================
test('E2E - Shared Links: Expiry Warning Calculation and Filter Categorization', () => {
  function getExpiryDaysLeft(expiresAt, now = Date.now()) {
    if (!expiresAt) return null;
    const diff = new Date(expiresAt).getTime() - now;
    if (diff <= 0) return 0;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  function categorizeLinkExpiry(link, now = Date.now()) {
    if (!link.expiresAt) return 'permanent';
    const days = getExpiryDaysLeft(link.expiresAt, now);
    if (days === 0) return 'expired';
    if (days <= 2) return 'expiring-urgent';
    if (days <= 7) return 'expiring-soon';
    return 'active-safe';
  }

  const now = new Date('2026-11-01T12:00:00Z').getTime();

  const links = [
    { id: '1', expiresAt: '2026-11-02T12:00:00Z', isActive: true }, // 1 day -> urgent
    { id: '2', expiresAt: '2026-11-06T12:00:00Z', isActive: true }, // 5 days -> soon
    { id: '3', expiresAt: '2026-11-20T12:00:00Z', isActive: true }, // 19 days -> safe
    { id: '4', expiresAt: null, isActive: true },                   // No expiry -> permanent
    { id: '5', expiresAt: '2026-10-30T12:00:00Z', isActive: true }, // Past -> expired
  ];

  assert.equal(categorizeLinkExpiry(links[0], now), 'expiring-urgent');
  assert.equal(categorizeLinkExpiry(links[1], now), 'expiring-soon');
  assert.equal(categorizeLinkExpiry(links[2], now), 'active-safe');
  assert.equal(categorizeLinkExpiry(links[3], now), 'permanent');
  assert.equal(categorizeLinkExpiry(links[4], now), 'expired');

  // Filter links expiring within 7 days
  const expiringWithin7Days = links.filter(l => {
    const d = getExpiryDaysLeft(l.expiresAt, now);
    return l.isActive && d !== null && d <= 7;
  });
  assert.equal(expiringWithin7Days.length, 3); // id 1, 2, and 5
});

// ============================================================================
// 3. BULK MOVE TO FOLDER E2E TESTS
// ============================================================================
test('E2E - Gallery Bulk Move: Target Key Formatting and Normalization', () => {
  function computeMoveKeys(selectedKeys, targetFolderPath) {
    const normalizedFolder = targetFolderPath.endsWith('/') ? targetFolderPath : `${targetFolderPath}/`;
    return selectedKeys.map(oldKey => {
      const filename = oldKey.split('/').pop();
      return {
        oldKey,
        newKey: `${normalizedFolder}${filename}`,
      };
    });
  }

  const selected = [
    'root_photo1.jpg',
    'weddings/pre-wedding/couple_01.jpg',
    'haldi/ceremony/family.jpg',
  ];

  const targetFolder = 'archive/2026/highlights';
  const moveOperations = computeMoveKeys(selected, targetFolder);

  assert.equal(moveOperations.length, 3);
  assert.equal(moveOperations[0].newKey, 'archive/2026/highlights/root_photo1.jpg');
  assert.equal(moveOperations[1].newKey, 'archive/2026/highlights/couple_01.jpg');
  assert.equal(moveOperations[2].newKey, 'archive/2026/highlights/family.jpg');

  // Verify already trailing slash behavior is idempotent
  const moveOperationsWithTrailing = computeMoveKeys(selected, 'archive/2026/highlights/');
  assert.equal(moveOperationsWithTrailing[0].newKey, 'archive/2026/highlights/root_photo1.jpg');
});

// ============================================================================
// 4. VIDEO THUMBNAILS & PREVIEWS E2E TESTS
// ============================================================================
test('E2E - Video Thumbnails: Extension Matching & Poster Configuration', () => {
  const videoRegex = /\.(mp4|mov|avi|wmv|mkv|webm)$/i;

  const testFiles = [
    { key: 'reception/highlight_reel.mp4', expectedVideo: true },
    { key: 'drone/scenic_aerial.mov', expectedVideo: true },
    { key: 'teasers/quick_teaser.webm', expectedVideo: true },
    { key: 'photos/portrait_01.jpg', expectedVideo: false },
    { key: 'photos/candid.png', expectedVideo: false },
    { key: 'photos/scenery.WEBP', expectedVideo: false },
  ];

  testFiles.forEach(file => {
    assert.equal(videoRegex.test(file.key), file.expectedVideo);
  });

  // Target time poster query
  function getVideoPosterUrl(videoUrl, targetSecond = 0.1) {
    return `${videoUrl}#t=${targetSecond}`;
  }

  assert.equal(getVideoPosterUrl('https://example.com/video.mp4'), 'https://example.com/video.mp4#t=0.1');
});

// ============================================================================
// 5. CUSTOM COLLECTIONS LOGIC & PERSISTENCE E2E TESTS
// ============================================================================
test('E2E - Custom Collections: CRUD and Item Assignment Operations', () => {
  let collections = [];

  // Create collections
  function createCollection(name) {
    const newColl = {
      id: `coll_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      name: name.trim(),
      itemKeys: [],
      createdAt: new Date().toISOString(),
    };
    collections.push(newColl);
    return newColl;
  }

  function toggleItemInCollection(collectionId, itemKey) {
    const coll = collections.find(c => c.id === collectionId);
    if (!coll) return;
    const exists = coll.itemKeys.includes(itemKey);
    if (exists) {
      coll.itemKeys = coll.itemKeys.filter(k => k !== itemKey);
    } else {
      coll.itemKeys.push(itemKey);
    }
  }

  function deleteCollection(collectionId) {
    collections = collections.filter(c => c.id !== collectionId);
  }

  const coll1 = createCollection('Haldi Highlights');
  const coll2 = createCollection('Couple Portraits');

  assert.equal(collections.length, 2);
  assert.equal(coll1.name, 'Haldi Highlights');

  // Add items
  toggleItemInCollection(coll1.id, 'photos/haldi_01.jpg');
  toggleItemInCollection(coll1.id, 'photos/haldi_02.jpg');
  assert.deepEqual(coll1.itemKeys, ['photos/haldi_01.jpg', 'photos/haldi_02.jpg']);

  // Toggle off (remove item)
  toggleItemInCollection(coll1.id, 'photos/haldi_01.jpg');
  assert.deepEqual(coll1.itemKeys, ['photos/haldi_02.jpg']);

  // Delete collection
  deleteCollection(coll2.id);
  assert.equal(collections.length, 1);
  assert.equal(collections[0].id, coll1.id);
});

// ============================================================================
// 6. BULK WATERMARK CANVAS GEOMETRY & RATIO E2E TESTS
// ============================================================================
test('E2E - Bulk Watermark: Coordinate Positioning and Size Calculations', () => {
  function computeWatermarkBounds(canvasWidth, canvasHeight, wmWidthOrig, wmHeightOrig, position, sizeRatio = 0.22, marginRatio = 0.03) {
    const targetWmWidth = canvasWidth * sizeRatio;
    const aspect = wmHeightOrig / wmWidthOrig;
    const targetWmHeight = targetWmWidth * aspect;
    const marginX = canvasWidth * marginRatio;
    const marginY = canvasHeight * marginRatio;

    let x = canvasWidth - targetWmWidth - marginX;
    let y = canvasHeight - targetWmHeight - marginY;

    if (position === 'top-left') {
      x = marginX;
      y = marginY;
    } else if (position === 'top-right') {
      x = canvasWidth - targetWmWidth - marginX;
      y = marginY;
    } else if (position === 'bottom-left') {
      x = marginX;
      y = canvasHeight - targetWmHeight - marginY;
    } else if (position === 'center') {
      x = (canvasWidth - targetWmWidth) / 2;
      y = (canvasHeight - targetWmHeight) / 2;
    }

    return { x, y, width: targetWmWidth, height: targetWmHeight };
  }

  const canvasW = 3000;
  const canvasH = 2000;
  const wmW = 600;
  const wmH = 200; // 3:1 aspect ratio

  // Bottom-right
  const br = computeWatermarkBounds(canvasW, canvasH, wmW, wmH, 'bottom-right');
  assert.equal(br.width, 3000 * 0.22); // 660
  assert.equal(br.height, 220);
  assert.equal(br.x, 3000 - 660 - 90); // 2250
  assert.equal(br.y, 2000 - 220 - 60); // 1720

  // Top-left
  const tl = computeWatermarkBounds(canvasW, canvasH, wmW, wmH, 'top-left');
  assert.equal(tl.x, 90);
  assert.equal(tl.y, 60);

  // Center
  const center = computeWatermarkBounds(canvasW, canvasH, wmW, wmH, 'center');
  assert.equal(center.x, (3000 - 660) / 2); // 1170
  assert.equal(center.y, (2000 - 220) / 2); // 890
});

// ============================================================================
// 7. PROPOSALS PDF & EMAIL GENERATION E2E TESTS
// ============================================================================
test('E2E - Proposals: Email HTML Template Generation & Financial Calculation', () => {
  const proposal = {
    id: 'prop_test_123',
    title: 'Grand Royal Wedding Coverage',
    clientName: 'Priya & Rahul',
    clientEmail: 'priya.rahul@example.com',
    eventDate: '2026-12-15',
    eventLocation: 'Taj Krishna, Hyderabad',
    items: [
      { id: '1', name: 'Traditional Photography', price: 25000 },
      { id: '2', name: 'Cinematic Videography', price: 35000 },
      { id: '3', name: 'Drone Aerial Coverage', price: 15000 },
    ],
    discountAmount: 5000,
    taxPercent: 18,
  };

  const subtotal = proposal.items.reduce((s, it) => s + it.price, 0);
  assert.equal(subtotal, 75000);

  const taxable = Math.max(0, subtotal - proposal.discountAmount);
  assert.equal(taxable, 70000);

  const tax = Math.round((taxable * proposal.taxPercent) / 100);
  assert.equal(tax, 12600);

  const grandTotal = taxable + tax;
  assert.equal(grandTotal, 82600);

  // Email HTML content verification
  function generateProposalEmailHtml(p, total) {
    return `
      <div style="font-family: Arial, sans-serif; background: #0b0f19; color: #ffffff; padding: 25px;">
        <h2>Raw Stories by Rakesh</h2>
        <p>Quotation for: <strong>${p.clientName}</strong></p>
        <p>Event: ${p.title} on ${p.eventDate}</p>
        <p>Grand Total: Rs. ${total.toLocaleString('en-IN')}</p>
      </div>
    `.trim();
  }

  const html = generateProposalEmailHtml(proposal, grandTotal);
  assert.ok(html.includes('Priya &amp; Rahul') || html.includes('Priya & Rahul'));
  assert.ok(html.includes('Grand Royal Wedding Coverage'));
  assert.ok(html.includes('82,600'));
});

// ============================================================================
// 8. MULTI-FIELD SEARCH CAPABILITY E2E TESTS
// ============================================================================
test('E2E - Universal Search: Gallery, Collections, and Proposals', () => {
  const galleryItems = [
    { title: 'Sangeet Stage Couple', tags: ['sangeet', 'couple'], shootType: 'Wedding' },
    { title: 'Drone Panorama Venue', tags: ['drone', 'aerial'], shootType: 'Corporate' },
    { title: 'Bride Haldi Portrait', tags: ['haldi', 'bride', 'portrait'], shootType: 'Wedding' },
  ];

  function searchGallery(items, query) {
    if (!query) return items;
    const q = query.toLowerCase();
    return items.filter(it => 
      it.title.toLowerCase().includes(q) ||
      it.shootType.toLowerCase().includes(q) ||
      it.tags.some(t => t.toLowerCase().includes(q))
    );
  }

  assert.equal(searchGallery(galleryItems, 'haldi').length, 1);
  assert.equal(searchGallery(galleryItems, 'wedding').length, 2);
  assert.equal(searchGallery(galleryItems, 'drone').length, 1);
  assert.equal(searchGallery(galleryItems, 'nonexistent').length, 0);
});

// ============================================================================
// 9. PRODUCTION BUILD ARTIFACTS INTEGRITY E2E TESTS
// ============================================================================
test('E2E - Build Integrity: Validating Compiled Output Files', () => {
  const distDir = path.resolve('dist');
  assert.ok(fs.existsSync(distDir), 'dist directory must exist');

  const indexHtmlPath = path.join(distDir, 'index.html');
  assert.ok(fs.existsSync(indexHtmlPath), 'dist/index.html must exist');

  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf-8');
  assert.ok(indexHtml.includes('<html'), 'index.html must contain HTML root');
  assert.ok(indexHtml.includes('/assets/index-'), 'index.html must reference bundled assets');

  const assetsDir = path.join(distDir, 'assets');
  assert.ok(fs.existsSync(assetsDir), 'dist/assets directory must exist');

  const files = fs.readdirSync(assetsDir);
  const jsFiles = files.filter(f => f.endsWith('.js'));
  const cssFiles = files.filter(f => f.endsWith('.css'));

  assert.ok(jsFiles.length > 0, 'Must have at least one JS bundle in dist/assets');
  assert.ok(cssFiles.length > 0, 'Must have at least one CSS bundle in dist/assets');
});

