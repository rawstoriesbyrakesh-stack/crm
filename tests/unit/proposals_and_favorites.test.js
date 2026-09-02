import test from 'node:test';
import assert from 'node:assert/strict';

// Unit Test 1: Proposal Grand Total Calculation Logic
test('Unit Test: Proposal Financial Calculations (Subtotal, Discount, Tax, Grand Total)', () => {
  const items = [
    { id: '1', name: 'Pre-Wedding Shoot', price: 35000 },
    { id: '2', name: 'Candid Photography', price: 65000 },
    { id: '3', name: 'Cinematic 4K Video', price: 50000 },
  ];
  const discountPercent = 10; // 10%
  const taxPercent = 18; // 18% GST

  const calculateSubtotal = (itemsList) => itemsList.reduce((acc, item) => acc + (Number(item.price) || 0), 0);
  const calculateDiscountAmount = (subtotal, discount) => (subtotal * (discount || 0)) / 100;
  const calculateTaxAmount = (taxable, tax) => (taxable * (tax || 0)) / 100;
  const calculateGrandTotal = (itemsList, discount, tax) => {
    const subtotal = calculateSubtotal(itemsList);
    const discountAmt = calculateDiscountAmount(subtotal, discount);
    const taxable = subtotal - discountAmt;
    const taxAmt = calculateTaxAmount(taxable, tax);
    return Math.round(taxable + taxAmt);
  };

  const subtotal = calculateSubtotal(items);
  assert.equal(subtotal, 150000, 'Subtotal should be 150,000');

  const discountAmt = calculateDiscountAmount(subtotal, discountPercent);
  assert.equal(discountAmt, 15000, '10% discount on 150,000 should be 15,000');

  const taxable = subtotal - discountAmt; // 135,000
  const taxAmt = calculateTaxAmount(taxable, taxPercent); // 24,300
  assert.equal(taxAmt, 24300, '18% GST on 135,000 should be 24,300');

  const grandTotal = calculateGrandTotal(items, discountPercent, taxPercent);
  assert.equal(grandTotal, 159300, 'Grand Total should be 159,300');
});

// Unit Test 2: Online Template Validation & Mapping
test('Unit Test: Online Template JSON Validation & Parsing', () => {
  const parseOnlineTemplate = (rawJson) => {
    if (!rawJson || typeof rawJson !== 'object') throw new Error('Invalid JSON');
    const title = rawJson.title || rawJson.name || 'Imported Online Template';
    const eventType = rawJson.eventType || rawJson.type || 'Custom';
    const itemsRaw = Array.isArray(rawJson.items) ? rawJson.items : Array.isArray(rawJson.deliverables) ? rawJson.deliverables : [];
    if (itemsRaw.length === 0) throw new Error('Template must contain items');

    const items = itemsRaw.map((it, idx) => ({
      id: `it_${idx}`,
      name: it.name || it.title || `Service ${idx + 1}`,
      description: it.description || '',
      price: Number(it.price) || 0,
    }));

    const priceEstimate = items.reduce((s, i) => s + i.price, 0);
    return { title, eventType, priceEstimate, items };
  };

  const sampleJson = {
    title: 'Destination Beach Wedding',
    eventType: 'Wedding',
    items: [
      { name: '4K Drone Footage', description: '3-day coverage', price: 50000 },
      { name: 'Traditional Photography', description: 'All ceremonies', price: 60000 }
    ]
  };

  const parsed = parseOnlineTemplate(sampleJson);
  assert.equal(parsed.title, 'Destination Beach Wedding');
  assert.equal(parsed.eventType, 'Wedding');
  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.priceEstimate, 110000);
});

// Unit Test 3: Client Favorites Folder Grouping Logic
test('Unit Test: Client Favorites Grouping by Folder Path', () => {
  const sampleFavs = [
    { key: 'weddings/rahul_sneha/img1.jpg', filename: 'img1.jpg' },
    { key: 'weddings/rahul_sneha/img2.jpg', filename: 'img2.jpg' },
    { key: 'birthdays/aaryav_1st/photo1.jpg', filename: 'photo1.jpg' },
  ];

  const groupFavoritesByFolder = (items) => {
    const groups = new Map();
    items.forEach((item) => {
      const parts = item.key.split('/');
      parts.pop();
      const folderPath = parts.join('/') || 'root';
      const folderName = parts.length > 0 ? parts[parts.length - 1] : 'Main Gallery';

      if (!groups.has(folderPath)) {
        groups.set(folderPath, { folderPath, folderName, items: [] });
      }
      groups.get(folderPath).items.push(item);
    });
    return Array.from(groups.values());
  };

  const grouped = groupFavoritesByFolder(sampleFavs);
  assert.equal(grouped.length, 2, 'Should group into 2 distinct folders');

  const weddingGroup = grouped.find((g) => g.folderPath === 'weddings/rahul_sneha');
  assert.ok(weddingGroup, 'Wedding folder group should exist');
  assert.equal(weddingGroup.items.length, 2, 'Wedding folder should contain 2 favorite photos');
});
