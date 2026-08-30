import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

const API_BASE = process.env.API_BASE || 'https://rawstoriesbyrakesh.vercel.app/_/backend';

// Functional Test 1: Health Check Endpoint & Storage status
test('Functional Test: Backend GET /api/health', async () => {
  const res = await fetch(`${API_BASE}/api/health`);
  assert.equal(res.status, 200, 'Health check status should be HTTP 200');
  
  const data = await res.json();
  assert.equal(data.success, true, 'Health check response success should be true');
  assert.equal(data.storage, 's3', 'Storage engine should be s3');
  assert.equal(data.bucket, 'raw', 'Target S3 bucket should be "raw"');
});

// Functional Test 2: Gallery listing endpoint & deduplication
test('Functional Test: Backend GET /default/getallimages', async () => {
  const res = await fetch(`${API_BASE}/default/getallimages?prefix=`);
  assert.equal(res.status, 200, 'Get all images status should be HTTP 200');
  
  const data = await res.json();
  assert.equal(data.success, true, 'API response success flag should be true');
  assert.ok(Array.isArray(data.files), 'Response should contain files array');
  assert.ok(Array.isArray(data.folders), 'Response should contain folders array');

  // Verify folder paths are unique (no duplicate raw vs %20 encoded paths)
  const folderPaths = data.folders.map(f => f.path);
  const uniquePaths = new Set(folderPaths);
  assert.equal(folderPaths.length, uniquePaths.size, 'No duplicate folder paths should be returned in gallery listing');
});

// Functional Test 3: Shared Folder Link Permissions endpoint
test('Functional Test: Backend POST /default/SharedLinkAccess', async () => {
  const res = await fetch(`${API_BASE}/default/SharedLinkAccess`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'get_share_link_status',
      sharedId: 'invalid-test-id'
    })
  });
  
  // Invalid share link should return HTTP 404 Not Found
  assert.equal(res.status, 404, 'Non-existent share link should return HTTP 404');
  const data = await res.json();
  assert.equal(data.success, false, 'Invalid share ID returns success: false');
});

// Functional Test 4: Static Asset & Build Artifact Verification
test('Functional Test: Frontend Public Logo & Build Artifacts', () => {
  const logoPath = path.resolve('public/rawstories-logo.png');
  const distHtmlPath = path.resolve('dist/index.html');
  
  assert.ok(fs.existsSync(logoPath), 'Brand logo (public/rawstories-logo.png) must exist');
  const logoStat = fs.statSync(logoPath);
  assert.ok(logoStat.size > 0, 'Logo file size must be non-zero');

  assert.ok(fs.existsSync(distHtmlPath), 'Production build (dist/index.html) must exist');
  const htmlContent = fs.readFileSync(distHtmlPath, 'utf8');
  assert.ok(htmlContent.includes('viewport'), 'dist/index.html must contain proper viewport meta tag');
});
