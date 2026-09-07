// Vercel serverless function entrypoint
// All dependencies must be in root package.json (not backend/package.json)
// This file delegates to backend/server.js requestHandler

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Ensure NODE_PATH includes both root and backend node_modules
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Pre-load env vars from backend/.env if they aren't already set
// (Vercel sets them via dashboard; this is only for local dev)
try {
  const dotenv = await import('dotenv');
  dotenv.config({ path: path.join(projectRoot, 'backend', '.env') });
} catch (e) {
  // dotenv not critical in production
}

// Lazy-import the requestHandler to allow env vars to load first
const { requestHandler } = await import('../backend/server.js');

export default async function handler(req, res) {
  return requestHandler(req, res);
}
