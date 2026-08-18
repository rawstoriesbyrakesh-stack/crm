import test from 'node:test';
import assert from 'node:assert/strict';

// Test 1: S3 Prefix Normalization & Encoding Deduplication logic
test('Unit Test: S3 Folder Prefix Normalization & Deduplication', () => {
  const rawPrefixes = ['R2 Final Test/', 'R2%20Final%20Test/'];
  const seenFolderPrefixes = new Set();
  const folderPrefixes = [];

  for (const p of rawPrefixes) {
    const decodedPrefix = decodeURIComponent(p);
    if (!seenFolderPrefixes.has(decodedPrefix)) {
      seenFolderPrefixes.add(decodedPrefix);
      folderPrefixes.push(decodedPrefix);
    }
  }

  assert.equal(folderPrefixes.length, 1, 'Duplicate folder prefixes should be merged to 1');
  assert.equal(folderPrefixes[0], 'R2 Final Test/', 'Normalized prefix should be raw decoded text');
});

// Test 2: File Key Extension Filtering & Deduplication
test('Unit Test: File Extension & Key Deduplication', () => {
  const rawKeys = [
    'projects/gallery/Sample Photo.jpg',
    'projects/gallery/Sample%20Photo.jpg',
    'projects/gallery/document.pdf' // Non-media file
  ];

  const seenObjectKeys = new Set();
  const validObjects = [];
  const mediaRegex = /\.(jpg|jpeg|png|gif|webp|bmp|svg|tiff|mp4|mov|avi|mkv|webm|cr2|nef|arw|dng)$/i;

  for (const k of rawKeys) {
    const decodedKey = decodeURIComponent(k);
    if (!seenObjectKeys.has(decodedKey)) {
      if (mediaRegex.test(decodedKey)) {
        seenObjectKeys.add(decodedKey);
        validObjects.push(decodedKey);
      }
    }
  }

  assert.equal(validObjects.length, 1, 'Duplicate encoded media keys should be deduplicated to 1 item');
  assert.equal(validObjects[0], 'projects/gallery/Sample Photo.jpg');
});

// Test 3: Path sanitization for S3 key safety
test('Unit Test: Folder Name Sanitization', () => {
  const sanitizeFolderName = (name) => {
    return name
      .trim()
      .replace(/[^a-zA-Z0-9-_\s]/g, '')
      .replace(/\s+/g, '_');
  };

  assert.equal(sanitizeFolderName('  Prabhas & Anushka Wedding! 2026 '), 'Prabhas_Anushka_Wedding_2026');
  assert.equal(sanitizeFolderName('Test@Client#Folder'), 'TestClientFolder');
});
