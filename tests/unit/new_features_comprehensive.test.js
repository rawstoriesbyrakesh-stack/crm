import test from 'node:test';
import assert from 'node:assert/strict';

// ── 1. DOWNLOAD ALL ZIP FEATURE UNIT TESTS ───────────────────────────────────
test('Unit Test (Download All): ZIP filename & key sanitization', () => {
  const formatZipFilename = (folderPath) => {
    const cleanFolderName = folderPath
      ? decodeURIComponent(folderPath).replace(/[\\/:*?"<>|\s]+/g, '_')
      : 'shared_gallery';
    return `download_all_${cleanFolderName}.zip`;
  };

  assert.equal(formatZipFilename('weddings/Prabhas & Anushka 2026/'), 'download_all_weddings_Prabhas_&_Anushka_2026_.zip');
  assert.equal(formatZipFilename(''), 'download_all_shared_gallery.zip');
  assert.equal(formatZipFilename(null), 'download_all_shared_gallery.zip');
});

test('Unit Test (Download All): File extraction from S3 key', () => {
  const getSafeFilenameFromKey = (key, fallbackIndex) => {
    let rawKey;
    try { rawKey = decodeURIComponent(key); } catch { rawKey = key; }
    const keyParts = rawKey.split('/');
    return (keyParts[keyParts.length - 1] || `photo_${fallbackIndex + 1}.jpg`).replace(/[\\/:*?"<>|]/g, '_');
  };

  assert.equal(getSafeFilenameFromKey('gallery/wedding/Reception%20Photo%201.jpg', 0), 'Reception Photo 1.jpg');
  assert.equal(getSafeFilenameFromKey('raw/folder/invalid*name?.png', 1), 'invalid_name_.png');
});

// ── 2. PROPOSALS & ONLINE TEMPLATE IMPORT UNIT TESTS ─────────────────────────
test('Unit Test (Proposals): WhatsApp quotation message formatter', () => {
  const formatWhatsAppMessage = (proposal) => {
    const grandTotal = proposal.items.reduce((sum, item) => sum + item.price, 0);
    return `*Quotation from Raw Stories by Rakesh*\n\n` +
      `*Client:* ${proposal.clientName || 'Valued Client'}\n` +
      `*Event:* ${proposal.title}\n` +
      `*Date:* ${proposal.eventDate}\n\n` +
      `*Services & Scope:*\n` +
      proposal.items.map((it) => `• ${it.name}: ₹${Number(it.price).toLocaleString('en-IN')}`).join('\n') +
      `\n\n*Grand Total:* ₹${grandTotal.toLocaleString('en-IN')}\n\n` +
      `*Payment Schedule:* ${proposal.paymentTerms}`;
  };

  const sampleProposal = {
    clientName: 'Sneha Reddy',
    title: 'Grand Wedding Package',
    eventDate: '2026-11-15',
    items: [
      { name: 'Candid Photography', price: 60000 },
      { name: '4K Cinematic Film', price: 50000 },
    ],
    paymentTerms: '50% Booking | 50% Delivery',
  };

  const formatted = formatWhatsAppMessage(sampleProposal);
  assert.ok(formatted.includes('*Client:* Sneha Reddy'), 'Message must contain client name');
  assert.ok(formatted.includes('₹1,10,000'), 'Message must contain formatted grand total');
  assert.ok(formatted.includes('• Candid Photography: ₹60,000'), 'Message must contain service bullet points');
});

test('Unit Test (Online Template Import): Edge case JSON validation', () => {
  const validateAndNormalizeTemplate = (data) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid JSON format');
    const title = data.title || data.name || 'Imported Online Template';
    const eventType = data.eventType || data.type || 'Custom';
    const itemsRaw = Array.isArray(data.items) ? data.items : Array.isArray(data.deliverables) ? data.deliverables : [];
    
    if (itemsRaw.length === 0) throw new Error('Template must contain an items or deliverables array');

    const items = itemsRaw.map((it, idx) => ({
      id: `it_${idx}`,
      name: it.name || it.title || `Service ${idx + 1}`,
      description: it.description || it.details || '',
      price: Number(it.price) || 0,
    }));

    const priceEstimate = items.reduce((acc, it) => acc + it.price, 0);
    return { title, eventType, priceEstimate, items };
  };

  // Test valid custom JSON with "deliverables" instead of "items"
  const templateWithDeliverables = {
    name: 'Haldi Ceremony Special',
    type: 'Haldi',
    deliverables: [
      { title: 'Traditional Video', details: 'Full coverage', price: '25000' }
    ]
  };

  const parsed = validateAndNormalizeTemplate(templateWithDeliverables);
  assert.equal(parsed.title, 'Haldi Ceremony Special');
  assert.equal(parsed.eventType, 'Haldi');
  assert.equal(parsed.items[0].name, 'Traditional Video');
  assert.equal(parsed.items[0].price, 25000);
  assert.equal(parsed.priceEstimate, 25000);

  // Test invalid empty object throws error
  assert.throws(() => validateAndNormalizeTemplate({}), /items or deliverables array/);
});

// ── 3. CLIENT FAVORITES MODULE UNIT TESTS ────────────────────────────────────
test('Unit Test (Client Favorites): Aggregating shares and DB favorites', () => {
  const shareFavoritesList = [
    ['folderA/img1.jpg', 'folderA/img2.jpg'],
    ['folderB/photo1.jpg', 'folderA/img1.jpg'] // Duplicate favorite across links
  ];

  const aggregateFavorites = (shares) => {
    const set = new Set();
    shares.forEach((favArr) => {
      if (Array.isArray(favArr)) {
        favArr.forEach((k) => set.add(k));
      }
    });
    return Array.from(set);
  };

  const allFavs = aggregateFavorites(shareFavoritesList);
  assert.equal(allFavs.length, 3, 'Unique favorites set should deduplicate keys across shares');
  assert.ok(allFavs.includes('folderA/img1.jpg'));
  assert.ok(allFavs.includes('folderB/photo1.jpg'));
});
