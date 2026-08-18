import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
// sharp is loaded lazily so a missing native binary never crashes the server
let _sharp = null;
const getSharp = async () => {
  if (_sharp) return _sharp;
  try {
    const mod = await import('sharp');
    _sharp = mod.default;
    return _sharp;
  } catch (err) {
    console.warn('sharp not available (thumbnail resize disabled):', err.message);
    return null;
  }
};
import {
  S3Client, PutObjectCommand, DeleteObjectsCommand,
  ListObjectsV2Command, CopyObjectCommand, HeadObjectCommand,
  PutBucketCorsCommand, PutBucketLifecycleConfigurationCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ─── Config (100% from .env, no hardcoded fallbacks) ─────────────────────────
const PORT               = Number(process.env.PORT ?? 8787);
const CORS_ORIGIN        = process.env.CORS_ORIGIN ?? '*';
const ADMIN_EMAIL        = process.env.RAWSTORIES_EMAIL;
const ADMIN_PASSWORD     = process.env.RAWSTORIES_PASSWORD;
const SESSION_TOKEN      = process.env.RAWSTORIES_TOKEN;
const MONGO_URI          = process.env.MONGO_URI;

// Load generic S3 or fallback to WASABI
const S3_ACCESS_KEY      = process.env.S3_ACCESS_KEY ?? process.env.WASABI_ACCESS_KEY;
const S3_SECRET_KEY      = process.env.S3_SECRET_KEY ?? process.env.WASABI_SECRET_KEY;
const S3_BUCKET      = process.env.S3_BUCKET ?? process.env.S3_BUCKET;
const S3_REGION          = process.env.S3_REGION ?? process.env.WASABI_REGION ?? 'auto';
const S3_ENDPOINT        = process.env.S3_ENDPOINT ?? process.env.WASABI_ENDPOINT;
const PRESIGNED_EXPIRY   = Number(process.env.PRESIGNED_URL_EXPIRY ?? 3600);

// Validate required vars
const REQUIRED = ['RAWSTORIES_EMAIL','RAWSTORIES_PASSWORD','RAWSTORIES_TOKEN','MONGO_URI'];
const MISSING = REQUIRED.filter(k => !process.env[k]);
if (MISSING.length) {
  console.error(`\n❌  Missing env vars: ${MISSING.join(', ')}\n   Set them in backend/.env\n`);
  process.exit(1);
}

if (!S3_ACCESS_KEY || !S3_SECRET_KEY || !S3_BUCKET || !S3_ENDPOINT) {
  console.error(`\n❌  Missing S3 Storage configuration. Please set either generic S3_* variables or WASABI_* variables in backend/.env\n`);
  process.exit(1);
}

// Determine if path style is forced (true for local development or Wasabi, false for Cloudflare R2)
const S3_FORCE_PATH_STYLE = process.env.S3_FORCE_PATH_STYLE !== undefined
  ? process.env.S3_FORCE_PATH_STYLE === 'true'
  : (S3_ENDPOINT.includes('wasabisys.com') || S3_ENDPOINT.includes('localhost') || S3_ENDPOINT.includes('127.0.0.1'));

// ─── S3 Storage Client ────────────────────────────────────────────────────────
const s3 = new S3Client({
  region: S3_REGION,
  endpoint: S3_ENDPOINT,
  credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY },
  forcePathStyle: S3_FORCE_PATH_STYLE,
});

const presignGet = (key, expiresIn = PRESIGNED_EXPIRY) =>
  getSignedUrl(s3, new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }), { expiresIn });

// ─── Thumbnail In-Memory Cache ─────────────────────────────────────────────────
// Caches resized WebP thumbnails so repeated page loads are instant.
// Max 500 entries, each with a 24-hour TTL.
const THUMB_CACHE = new Map(); // key -> { buf: Buffer, ts: number }
const THUMB_CACHE_MAX = 500;
const THUMB_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

const getThumbCached = (key) => {
  const entry = THUMB_CACHE.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > THUMB_CACHE_TTL) { THUMB_CACHE.delete(key); return null; }
  return entry.buf;
};

const setThumbCached = (key, buf) => {
  // Evict oldest entries when cache is full
  if (THUMB_CACHE.size >= THUMB_CACHE_MAX) {
    const oldest = THUMB_CACHE.keys().next().value;
    THUMB_CACHE.delete(oldest);
  }
  THUMB_CACHE.set(key, { buf, ts: Date.now() });
};

const presignPut = (key, contentType = 'application/octet-stream', expiresIn = PRESIGNED_EXPIRY) =>
  getSignedUrl(s3, new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, ContentType: contentType, CacheControl: 'public, max-age=31536000, immutable' }), { expiresIn });

const encodeCopySource = (bucket, key) =>
  `${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;

// Auto-configure Bucket CORS to allow browser uploads
const configureBucketCors = async () => {
  try {
    await s3.send(new PutBucketCorsCommand({
      Bucket: S3_BUCKET,
      CORSConfiguration: {
        CORSRules: [{
          AllowedHeaders: ['*'],
          AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
          AllowedOrigins: ['*'],
          ExposeHeaders: ['ETag'],
          MaxAgeSeconds: 3600,
        }]
      }
    }));
    console.log('✅ S3 bucket CORS policy automatically configured.');
  } catch (err) {
    console.error('⚠️ Could not configure S3 CORS (user may lack permissions):', err.message);
  }
};
configureBucketCors();

// Auto-configure Bucket Lifecycle (Trash expiration)
const configureBucketLifecycle = async () => {
  try {
    await s3.send(new PutBucketLifecycleConfigurationCommand({
      Bucket: S3_BUCKET,
      LifecycleConfiguration: {
        Rules: [{
          ID: "EmptyTrashAfter30Days",
          Filter: { Prefix: "trash/" },
          Status: "Enabled",
          Expiration: { Days: 30 }
        }]
      }
    }));
    console.log('✅ S3 bucket Lifecycle policy configured (Trash 30 days).');
  } catch (err) {
    console.error('⚠️ Could not configure Wasabi Lifecycle (user may lack permissions):', err.message);
  }
};
configureBucketLifecycle();

// ─── MongoDB Models ───────────────────────────────────────────────────────────
const shareSchema = new mongoose.Schema({
  shareId:      { type: String, required: true, unique: true, index: true },
  folderPrefix: String,
  items:        { type: mongoose.Schema.Types.Mixed, default: [] },
  sharePin:     { type: String, default: '' },
  allowDownload:{ type: Boolean, default: true },
  isActive:     { type: Boolean, default: true },
  expiresAt:    { type: Date, default: null },
  viewCount:    { type: Number, default: 0 },
  ips:          { type: [String], default: [] },
  lastAccess:   { type: Date, default: null },
  downloadCount:{ type: Number, default: 0 },
  favorites:    { type: [String], default: [] },
}, { timestamps: true });

const fileMetaSchema = new mongoose.Schema({
  key:          { type: String, required: true, unique: true, index: true },
  isFavorite:   { type: Boolean, default: false },
  isWatermarked:{ type: Boolean, default: false },
  tags:         [String],
  shootType:    String,
  downloadCount:{ type: Number, default: 0 },
  comments:     [{ text: String, author: String, createdAt: { type: Date, default: Date.now } }],
}, { timestamps: true });

const folderMetaSchema = new mongoose.Schema({
  path:        { type: String, required: true, unique: true, index: true },
  name:        String,
  description: String,
  coverImage:  String,
  client:      String,
  tags:        [String],
  logoUrl:     String,
  brandColor:  String,
}, { timestamps: true });

const Share      = mongoose.model('Share', shareSchema);
const FileMeta   = mongoose.model('FileMeta', fileMetaSchema);
const FolderMeta = mongoose.model('FolderMeta', folderMetaSchema);

mongoose.set('bufferCommands', false);
let mongoConnectionPromise = null;
let hasStartedHttpServer = false;

const ensureMongoConnected = async () => {
  if (mongoose.connection.readyState === 1) return;
  if (!mongoConnectionPromise) {
    mongoConnectionPromise = mongoose.connect(MONGO_URI);
  }
  await mongoConnectionPromise;
};

const ensureMongoReadyOrFail = async (res) => {
  try {
    await ensureMongoConnected();
    return true;
  } catch (err) {
    console.error('MongoDB not ready:', err.message);
    sendError(res, 503, 'Database connection is not ready. Please try again.');
    return false;
  }
};

// ─── HTTP Helpers ─────────────────────────────────────────────────────────────
const cors = {
  'Access-Control-Allow-Origin': CORS_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
};

const sendJson = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json', ...cors });
  res.end(JSON.stringify(body));
};
const sendError = (res, status, message) => sendJson(res, status, { success: false, message });

const readBody = async req => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return raw; }
};

const getFrontendBaseUrl = req => {
  const hOrigin = req.headers.origin;
  if (hOrigin && hOrigin.startsWith('http')) return hOrigin;
  const hRef = req.headers.referer;
  if (hRef && hRef.startsWith('http')) {
    try { return new URL(hRef).origin; } catch {}
  }
  return process.env.FRONTEND_URL || 'https://rawstoriesbyrakesh.vercel.app';
};

const isAuthed = req => {
  const h = req.headers.authorization || '';
  return h.split(' ')[1] === SESSION_TOKEN;
};

// Simple in-memory rate limiter
const rateLimits = new Map();
const checkRateLimit = (req, res) => {
  const ip = req.socket.remoteAddress;
  const now = Date.now();
  if (!rateLimits.has(ip)) {
    rateLimits.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
  } else {
    const data = rateLimits.get(ip);
    if (now > data.resetAt) {
      data.count = 1;
      data.resetAt = now + 15 * 60 * 1000;
    } else {
      data.count++;
      if (data.count > 100) {
        sendError(res, 429, 'Too many requests, please try again later.');
        return false;
      }
    }
  }
  return true;
};

// ─── Server ───────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    res.end();
    return;
  }

  if (!checkRateLimit(req, res)) return;

  const url      = new URL(req.url || '/', `http://${req.headers.host}`);
  let pathname   = url.pathname;
  if (pathname.startsWith('/_/backend')) {
    pathname = pathname.slice('/_/backend'.length);
  }

  try {
    // Ensure MongoDB is connected (non-fatal if it fails, but attempts to connect)
    await ensureMongoConnected().catch(err => {
      console.warn('MongoDB connection warning:', err.message);
    });

    // ── Health ─────────────────────────────────────────────────────────────
    if (pathname === '/api/health') {
      return sendJson(res, 200, {
        success: true,
        storage: 's3',
        db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        bucket: S3_BUCKET,
      });
    }

    // ── Auth: login ────────────────────────────────────────────────────────
    if (pathname === '/api/login' && req.method === 'POST') {
      const body = await readBody(req);
      if (body?.email === ADMIN_EMAIL && body?.password === ADMIN_PASSWORD)
        return sendJson(res, 200, { success: true, token: SESSION_TOKEN });
      return sendError(res, 401, 'Invalid email or password');
    }

    // ── Auth: session ──────────────────────────────────────────────────────
    if (pathname === '/api/session' && req.method === 'GET') {
      if (!isAuthed(req)) return sendError(res, 401, 'Unauthorized');
      return sendJson(res, 200, { success: true, user: { email: ADMIN_EMAIL, role: 'admin' } });
    }

    // ── Stats ──────────────────────────────────────────────────────────────
    if (pathname === '/api/stats' && req.method === 'GET') {
      if (!isAuthed(req)) return sendError(res, 401, 'Unauthorized');
      try {
        const list = await s3.send(new ListObjectsV2Command({ Bucket: S3_BUCKET, Delimiter: '/' }));
        const topFolders = (list.CommonPrefixes || []).filter(cp => cp.Prefix !== '_thumbnails/').length;
        const allList = await s3.send(new ListObjectsV2Command({ Bucket: S3_BUCKET }));

        const imageObjects = (allList.Contents || []).filter(o => {
          const key = o.Key || '';
          return !key.startsWith('_thumbnails/') && /\.(jpg|jpeg|png|gif|webp|bmp|svg|tiff|mp4|mov|avi|mkv|webm|cr2|nef|arw|dng)$/i.test(key);
        });

        const totalImages = imageObjects.length;
        let totalStorage = 0;
        (allList.Contents || []).forEach(o => { totalStorage += o.Size || 0; });
        const shareCount = await Share.countDocuments({
          isActive: true,
          $or: [
            { expiresAt: null },
            { expiresAt: { $gt: new Date() } }
          ]
        }).catch(() => 0);
        const recentUploads = imageObjects
          .sort((a, b) => (b.LastModified || 0) - (a.LastModified || 0))
          .slice(0, 10)
          .map(o => ({ name: path.basename(o.Key || ''), uploadedAt: o.LastModified }));
        return sendJson(res, 200, { success: true, stats: { totalFolders: topFolders, totalImages, totalSharedLinks: shareCount, totalStorage, recentUploads } });
      } catch (err) {
        console.error('Stats endpoint failed, returning fallback payload:', err.message);
        return sendJson(res, 200, {
          success: true,
          stats: { totalFolders: 0, totalImages: 0, totalSharedLinks: 0, totalStorage: 0, recentUploads: [] },
          message: 'Stats are temporarily unavailable',
        });
      }
    }

    // ── Thumbnail: resize + cache image from S3 ─────────────────────────────
    // Returns a compressed WebP thumbnail (~10-50 KB) instead of full-res (5-20 MB).
    // Falls back to a presigned URL redirect if sharp is unavailable.
    if (pathname === '/default/thumbnail' && req.method === 'GET') {
      const key = url.searchParams.get('key');
      const size = Math.min(Number(url.searchParams.get('size') || 400), 800);
      if (!key) return sendError(res, 400, 'key is required');

      // Skip non-processable image formats (like video, raw formats, or unknown extensions)
      const isProcessable = /\.(jpg|jpeg|png|webp|gif|tiff|bmp)$/i.test(key);
      if (!isProcessable) {
        try {
          const signedUrl = await presignGet(key, 300);
          res.writeHead(302, { Location: signedUrl, ...cors });
          res.end();
          return;
        } catch {
          return sendError(res, 500, 'Invalid key or S3 error');
        }
      }

      const cacheKey = `${key}::${size}`;
      const thumbKey = `_thumbnails/${size}/${key}.webp`;

      try {
        // 1. Try to serve from local in-memory cache first (for speed on repeated local requests)
        const cached = getThumbCached(cacheKey);
        if (cached) {
          res.writeHead(200, {
            'Content-Type': 'image/webp',
            'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600',
            'Content-Length': cached.length,
            ...cors,
          });
          res.end(cached);
          return;
        }

        // 2. Check if the thumbnail already exists in S3 (persistent cache)
        let exists = false;
        try {
          await s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: thumbKey }));
          exists = true;
        } catch (headErr) {
          if (headErr.name !== 'NotFound' && headErr.$metadata?.httpStatusCode !== 404) {
            console.error('S3 HeadObject check failed for thumbnail:', headErr.message);
          }
        }

        if (exists) {
          // Redirect to S3 persistent thumbnail directly
          const signedUrl = await presignGet(thumbKey, 3600);
          res.writeHead(302, { Location: signedUrl, ...cors });
          res.end();
          return;
        }

        // 3. Load sharp loader
        const sharpFn = await getSharp();
        if (!sharpFn) {
          // Fall back to original image redirect if sharp is missing
          const signedUrl = await presignGet(key, 300);
          res.writeHead(302, { Location: signedUrl, ...cors });
          res.end();
          return;
        }

        // 4. Fetch the original image from S3 (first time generation)
        const s3Res = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
        const chunks = [];
        for await (const chunk of s3Res.Body) chunks.push(chunk);
        const rawBuf = Buffer.concat(chunks);

        // 5. Resize and convert to WebP
        const webpBuf = await sharpFn(rawBuf)
          .resize(size, size, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 72 })
          .toBuffer();

        // 6. Try to save back to S3 persistent cache, but don't fail the request if it fails (e.g., due to billing limits)
        let savedToS3 = false;
        try {
          await s3.send(new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: thumbKey,
            Body: webpBuf,
            ContentType: 'image/webp',
            CacheControl: 'public, max-age=31536000, immutable'
          }));
          savedToS3 = true;
        } catch (s3UploadErr) {
          console.warn('⚠️ S3 persistent thumbnail upload failed (proceeding with direct buffer delivery):', s3UploadErr.message);
        }

        // 7. Also write to local memory cache for this runtime instance
        setThumbCached(cacheKey, webpBuf);

        // 8. Deliver thumbnail. If saved to S3, redirecting is preferred to save server bandwidth.
        // If S3 upload failed, serve the buffer directly to the client.
        if (savedToS3) {
          const signedUrl = await presignGet(thumbKey, 3600);
          res.writeHead(302, { Location: signedUrl, ...cors });
          res.end();
        } else {
          res.writeHead(200, {
            'Content-Type': 'image/webp',
            'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600',
            'Content-Length': webpBuf.length,
            ...cors,
          });
          res.end(webpBuf);
        }
      } catch (err) {
        console.error('Thumbnail generation/cache failed:', err.message);
        // Fallback: redirect to original image so image still loads
        try {
          const signedUrl = await presignGet(key, 300);
          res.writeHead(302, { Location: signedUrl, ...cors });
          res.end();
        } catch {
          return sendError(res, 500, 'Thumbnail generation failed');
        }
      }
      return;
    }

    // ── Gallery: list folder contents ──────────────────────────────────────
    if (pathname === '/default/getallimages' && req.method === 'GET') {
      const prefix    = url.searchParams.get('prefix') || '';
      const recursive = url.searchParams.get('recursive') === 'true';
      try {
        const prefixes = [prefix];
        if (prefix.includes(' ')) {
          prefixes.push(prefix.replace(/ /g, '%20'));
        } else if (prefix.includes('%20')) {
          prefixes.push(prefix.replace(/%20/g, ' '));
        }

        const results = await Promise.all(prefixes.map(p =>
          s3.send(new ListObjectsV2Command({
            Bucket: S3_BUCKET,
            Prefix: p,
            Delimiter: recursive ? undefined : '/',
          })).catch(err => {
            console.error(`S3 list failed for prefix ${p}:`, err.message);
            return null;
          })
        ));

        // Merge CommonPrefixes and Contents from all list results
        const folderPrefixes = [];
        const objects = [];
        const seenFolderPrefixes = new Set();
        const seenObjectKeys = new Set();
        const decodedPrefixes = prefixes.map(p => decodeURIComponent(p));

        for (const listResult of results) {
          if (!listResult) continue;

          // Folders
          for (const cp of (listResult.CommonPrefixes || [])) {
            if (cp.Prefix && cp.Prefix !== '_thumbnails/') {
              const decodedPrefix = decodeURIComponent(cp.Prefix);
              if (!seenFolderPrefixes.has(decodedPrefix)) {
                seenFolderPrefixes.add(decodedPrefix);
                cp.Prefix = decodedPrefix;
                folderPrefixes.push(cp);
              }
            }
          }

          // Files
          for (const o of (listResult.Contents || [])) {
            if (o.Key) {
              const decodedKey = decodeURIComponent(o.Key);
              if (!seenObjectKeys.has(decodedKey)) {
                const isFolderPlaceholder = decodedKey.endsWith('/') && (o.Size === 0 || !o.Size);
                const isExactPrefix = decodedPrefixes.includes(decodedKey);
                if (!isExactPrefix && !isFolderPlaceholder && /\.(jpg|jpeg|png|gif|webp|bmp|svg|tiff|mp4|mov|avi|mkv|webm|cr2|nef|arw|dng)$/i.test(decodedKey)) {
                  seenObjectKeys.add(decodedKey);
                  o.Key = decodedKey;
                  objects.push(o);
                }
              }
            }
          }
        }

        // Folders
        const folders = (await Promise.allSettled(folderPrefixes.map(async cp => {
          const folderPrefix = cp.Prefix || '';
          const meta = await FolderMeta.findOne({ path: folderPrefix }).lean().catch(() => null);
          let name = meta?.name;
          if (!name) {
            const segments = folderPrefix.split('/').filter(Boolean);
            const lastSegment = segments[segments.length - 1] || '';
            name = decodeURIComponent(lastSegment);
          }
          return { name, path: folderPrefix, description: meta?.description || '', client: meta?.client || '', tags: meta?.tags || [] };
        }))).flatMap(result => (result.status === 'fulfilled' ? [result.value] : []));

        // Files
        const files = (await Promise.allSettled(objects.map(async o => {
          const key = o.Key || '';
          const [meta, signedUrl] = await Promise.all([
            FileMeta.findOne({ key }).lean().catch(() => null),
            presignGet(key).catch(() => ''),
          ]);
          return {
            key,
            filename: path.basename(key),
            size: o.Size,
            last_modified: o.LastModified,
            presigned_url: signedUrl,
            url: signedUrl,
            isFavorite: meta?.isFavorite || false,
            isWatermarked: meta?.isWatermarked || false,
            tags: meta?.tags || [],
            shootType: meta?.shootType || 'Unknown',
            downloadCount: meta?.downloadCount || 0,
            comments: meta?.comments || [],
          };
        }))).flatMap(result => (result.status === 'fulfilled' ? [result.value] : []));

        return sendJson(res, 200, { success: true, files, folders });
      } catch (err) {
        console.error('getallimages failed, returning fallback payload:', err.message);
        return sendJson(res, 200, { success: true, files: [], folders: [], message: 'Gallery items are temporarily unavailable' });
      }
    }

    // ── Upload: generate presigned PUT URL ─────────────────────────────────
    if (pathname === '/default/imagesupload' && req.method === 'POST') {
      if (!isAuthed(req)) return sendError(res, 401, 'Unauthorized');
      const body = await readBody(req);
      
      if (body?.uploadConfig) {
        // Bulk Upload Flow (GalleryUpload.tsx)
        const { files, fileTypes, fileTags, folder, settings } = body.uploadConfig;
        if (!files || !Array.isArray(files)) return sendError(res, 400, 'Invalid files array');
        
        const presignedUrls = [];
        for (let i = 0; i < files.length; i++) {
          const filename = files[i];
          const type = fileTypes && fileTypes[i] ? fileTypes[i] : 'image/webp';
          const key = folder ? `${folder}/${filename}` : filename;
          const url = await presignPut(key, type);
          presignedUrls.push(url);
          
          // Save file meta
          const tags = fileTags && fileTags[i] ? fileTags[i] : [];
          const isFavorite = tags.includes('Favorite');
          await FileMeta.findOneAndUpdate(
            { key },
            { 
              key, 
              tags, 
              isFavorite,
              clientName: body.client_name,
              shootType: body.event_type,
              eventDate: body.event_date
            },
            { upsert: true }
          );
        }
        return sendJson(res, 200, { success: true, presignedUrls });
      } else {
        // Legacy single upload flow
        const key = body?.key;
        const contentType = body?.contentType || 'application/octet-stream';
        if (!key) return sendError(res, 400, 'Missing key');
        const uploadUrl = await presignPut(key, contentType);
        return sendJson(res, 200, { success: true, presigned_url: uploadUrl, url: uploadUrl, object_key: key });
      }
    }

    // ── Upload: bulk presigned PUT URLs / Server-side Copy ──────────────────
    if (pathname === '/default/bulkupload' && req.method === 'POST') {
      const body = await readBody(req);
      const files  = body?.files || [];
      const folderStr = (body?.folder || '').replace(/^\//, '');
      const folder = folderStr.endsWith('/') ? folderStr.slice(0, -1) : folderStr;
      
      const isClientPath = folderStr.startsWith('projects/') || folderStr.startsWith('favorites/');
      if (!isClientPath && !isAuthed(req)) return sendError(res, 401, 'Unauthorized');

      const isCopy = files.length > 0 && typeof files[0] === 'string';

      if (isCopy) {
        // Server-side copy (e.g. client favorites selection)
        const uploads = [];
        for (const srcKey of files) {
          const filename = srcKey.split('/').pop() || srcKey;
          const key = folder ? `${folder}/${filename}` : filename;
          
          try {
            await s3.send(new CopyObjectCommand({
              Bucket: S3_BUCKET,
              CopySource: encodeCopySource(S3_BUCKET, srcKey),
              Key: key,
            }));

            // Also copy FileMeta
            const srcMeta = await FileMeta.findOne({ key: srcKey }).lean();
            if (srcMeta) {
              const { _id, ...metaData } = srcMeta;
              await FileMeta.findOneAndUpdate(
                { key },
                { ...metaData, key },
                { upsert: true }
              );
            }
            uploads.push({ key, success: true });
          } catch (err) {
            console.error(`Failed to copy ${srcKey} to ${key}:`, err);
            uploads.push({ key, success: false, error: err.message });
          }
        }
        return sendJson(res, 200, { success: true, uploads, folderPath: folderStr });
      } else {
        // Normal bulk upload: generate presigned PUT URLs
        const uploads = await Promise.all(files.map(async (f) => {
          const rawFilename = typeof f === 'string' ? f : f.name;
          const filename = rawFilename.split('/').pop() || rawFilename;
          const type = typeof f === 'object' && f.type ? f.type : 'application/octet-stream';
          const key = folder ? `${folder}/${filename}` : filename;
          const url = await presignPut(key, type);
          return { key, url };
        }));
        return sendJson(res, 200, { success: true, uploads });
      }
    }

    // ── Folder: create (puts a placeholder object with trailing slash) ─────
    if (pathname === '/default/createfolder' && req.method === 'POST') {
      const body = await readBody(req);
      let key = (body?.key || '').replace(/^\//, '');
      if (!key) return sendError(res, 400, 'Missing key');

      const isClientPath = key.startsWith('projects/') || key.startsWith('favorites/');
      if (!isClientPath && !isAuthed(req)) return sendError(res, 401, 'Unauthorized');

      if (!key.endsWith('/')) key += '/';
      // Create placeholder object in Wasabi
      await s3.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: key }));
      const name = key.replace(/\/$/, '').split('/').pop() || key;
      await FolderMeta.findOneAndUpdate({ path: key }, { path: key, name }, { upsert: true, new: true });
      return sendJson(res, 200, { success: true, message: 'Folder created', folderPath: key });
    }

    // ── Folder: rename ─────────────────────────────────────────────────────
    if (pathname === '/default/renamefolder' && req.method === 'POST') {
      if (!isAuthed(req)) return sendError(res, 401, 'Unauthorized');
      const body = await readBody(req);
      let { oldKey, newKey } = body || {};
      if (!oldKey || !newKey) return sendError(res, 400, 'Missing oldKey or newKey');
      if (!oldKey.endsWith('/')) oldKey += '/';
      if (!newKey.endsWith('/')) newKey += '/';

      // List all objects under oldKey and copy them to newKey
      const list = await s3.send(new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix: oldKey }));
      const objects = list.Contents || [];
      for (const obj of objects) {
        if (!obj.Key) continue;
        const newObjKey = newKey + obj.Key.slice(oldKey.length);
        await s3.send(new CopyObjectCommand({ Bucket: S3_BUCKET, CopySource: encodeCopySource(S3_BUCKET, obj.Key), Key: newObjKey }));
      }
      // Delete old objects
      if (objects.length > 0) {
        await s3.send(new DeleteObjectsCommand({ Bucket: S3_BUCKET, Delete: { Objects: objects.map(o => ({ Key: o.Key })) } }));
      }
      const newName = newKey.replace(/\/$/, '').split('/').pop() || newKey;
      await FolderMeta.findOneAndUpdate({ path: oldKey }, { path: newKey, name: newName }, { upsert: true });
      return sendJson(res, 200, { success: true, message: 'Renamed successfully' });
    }

    // ── File: move ─────────────────────────────────────────────────────────
    if (pathname === '/default/moveimage' && req.method === 'POST') {
      if (!isAuthed(req)) return sendError(res, 401, 'Unauthorized');
      const body = await readBody(req);
      const { oldKey, newKey } = body || {};
      if (!oldKey || !newKey) return sendError(res, 400, 'Missing oldKey or newKey');
      await s3.send(new CopyObjectCommand({ Bucket: S3_BUCKET, CopySource: encodeCopySource(S3_BUCKET, oldKey), Key: newKey }));
      await s3.send(new DeleteObjectsCommand({ Bucket: S3_BUCKET, Delete: { Objects: [{ Key: oldKey }] } }));
      await FileMeta.findOneAndUpdate({ key: oldKey }, { key: newKey });
      return sendJson(res, 200, { success: true, message: 'Moved successfully' });
    }

    // ── File/Folder: delete (move to trash) ────────────────────────────────
    if (pathname === '/default/deleteimage' && req.method === 'POST') {
      if (!isAuthed(req)) return sendError(res, 401, 'Unauthorized');
      const body = await readBody(req);
      const keys = body?.keys || (body?.key ? [body.key] : []);
      const toDeleteOriginal = [];

      for (const key of keys) {
        if (key.endsWith('/')) {
          // it's a folder — list everything under it
          const list = await s3.send(new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix: key }));
          const objects = list.Contents || [];
          for (const obj of objects) {
            if (!obj.Key) continue;
            const newObjKey = `trash/${obj.Key}`;
            await s3.send(new CopyObjectCommand({ Bucket: S3_BUCKET, CopySource: encodeCopySource(S3_BUCKET, obj.Key), Key: newObjKey }));
            toDeleteOriginal.push({ Key: obj.Key });
          }
          await FolderMeta.findOneAndUpdate({ path: key }, { path: `trash/${key}` });
        } else {
          await s3.send(new CopyObjectCommand({ Bucket: S3_BUCKET, CopySource: encodeCopySource(S3_BUCKET, key), Key: `trash/${key}` }));
          toDeleteOriginal.push({ Key: key });
          await FileMeta.findOneAndUpdate({ key }, { key: `trash/${key}` });
        }
      }

      if (toDeleteOriginal.length > 0) {
        // Delete original objects in batches of 1000
        for (let i = 0; i < toDeleteOriginal.length; i += 1000) {
          await s3.send(new DeleteObjectsCommand({
            Bucket: S3_BUCKET,
            Delete: { Objects: toDeleteOriginal.slice(i, i + 1000) }
          }));
        }
      }
      return sendJson(res, 200, { success: true, deleted: keys, message: 'Moved to trash' });
    }

    // ── File/Folder: restore from trash ────────────────────────────────────
    if (pathname === '/default/restoreimage' && req.method === 'POST') {
      if (!isAuthed(req)) return sendError(res, 401, 'Unauthorized');
      const body = await readBody(req);
      const keys = body?.keys || (body?.key ? [body.key] : []);
      const toDeleteTrash = [];

      for (const key of keys) {
        const trashKey = key.startsWith('trash/') ? key : `trash/${key}`;
        const originalKey = trashKey.replace(/^trash\//, '');
        
        if (trashKey.endsWith('/')) {
          const list = await s3.send(new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix: trashKey }));
          const objects = list.Contents || [];
          for (const obj of objects) {
            if (!obj.Key) continue;
            const newObjKey = obj.Key.replace(/^trash\//, '');
            await s3.send(new CopyObjectCommand({ Bucket: S3_BUCKET, CopySource: encodeCopySource(S3_BUCKET, obj.Key), Key: newObjKey }));
            toDeleteTrash.push({ Key: obj.Key });
          }
          await FolderMeta.findOneAndUpdate({ path: trashKey }, { path: originalKey });
        } else {
          await s3.send(new CopyObjectCommand({ Bucket: S3_BUCKET, CopySource: encodeCopySource(S3_BUCKET, trashKey), Key: originalKey }));
          toDeleteTrash.push({ Key: trashKey });
          await FileMeta.findOneAndUpdate({ key: trashKey }, { key: originalKey });
        }
      }

      if (toDeleteTrash.length > 0) {
        for (let i = 0; i < toDeleteTrash.length; i += 1000) {
          await s3.send(new DeleteObjectsCommand({
            Bucket: S3_BUCKET,
            Delete: { Objects: toDeleteTrash.slice(i, i + 1000) }
          }));
        }
      }
      return sendJson(res, 200, { success: true, restored: keys, message: 'Restored successfully' });
    }
    
    // ── File/Folder: empty trash (hard delete) ─────────────────────────────
    if (pathname === '/default/emptytrash' && req.method === 'POST') {
      if (!isAuthed(req)) return sendError(res, 401, 'Unauthorized');
      const list = await s3.send(new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix: 'trash/' }));
      const objects = list.Contents || [];
      const toDelete = objects.map(o => ({ Key: o.Key }));
      
      if (toDelete.length > 0) {
        for (let i = 0; i < toDelete.length; i += 1000) {
          await s3.send(new DeleteObjectsCommand({
            Bucket: S3_BUCKET,
            Delete: { Objects: toDelete.slice(i, i + 1000) }
          }));
        }
      }
      // Clean up metadata
      await FileMeta.deleteMany({ key: /^trash\// });
      await FolderMeta.deleteMany({ path: /^trash\// });
      
      return sendJson(res, 200, { success: true, message: 'Trash emptied' });
    }

    // ── File: update metadata ──────────────────────────────────────────────
    if (pathname === '/default/updatefilemeta' && req.method === 'POST') {
      if (!isAuthed(req)) return sendError(res, 401, 'Unauthorized');
      const body = await readBody(req);
      const { key, ...updates } = body || {};
      if (!key) return sendError(res, 400, 'Missing key');
      const meta = await FileMeta.findOneAndUpdate({ key }, { key, ...updates }, { upsert: true, new: true });
      return sendJson(res, 200, { success: true, meta });
    }

    // ── Folder: update metadata ──────────────────────────────────────────────
    if (pathname === '/default/updatefoldermeta' && req.method === 'POST') {
      if (!isAuthed(req)) return sendError(res, 401, 'Unauthorized');
      const body = await readBody(req);
      const { path: folderPath, ...updates } = body || {};
      if (!folderPath) return sendError(res, 400, 'Missing path');
      const meta = await FolderMeta.findOneAndUpdate({ path: folderPath }, { path: folderPath, ...updates }, { upsert: true, new: true });
      return sendJson(res, 200, { success: true, meta });
    }

    // ── File: add comment ──────────────────────────────────────────────────
    if (pathname === '/default/addcomment' && req.method === 'POST') {
      const body = await readBody(req);
      const { key, text, author } = body || {};
      if (!key || !text) return sendError(res, 400, 'Missing key or text');
      const meta = await FileMeta.findOneAndUpdate(
        { key },
        { $push: { comments: { text, author: author || 'Client', createdAt: new Date() } }, $setOnInsert: { key } },
        { upsert: true, new: true }
      );
      return sendJson(res, 200, { success: true, comments: meta.comments });
    }

    // ── Download: presigned GET URL ────────────────────────────────────────
    if (pathname === '/default/downloadimage' && req.method === 'GET') {
      const key = url.searchParams.get('key') || '';
      const shareId = url.searchParams.get('shareId') || '';
      if (!key) return sendError(res, 400, 'Missing key');
      try {
        await FileMeta.findOneAndUpdate({ key }, { $inc: { downloadCount: 1 }, $setOnInsert: { key } }, { upsert: true });
        if (shareId) {
          await Share.findOneAndUpdate({ shareId }, { $inc: { downloadCount: 1 } });
        }
      } catch (dbErr) {
        console.warn('MongoDB tracking failed for downloadimage:', dbErr.message);
      }
      const signedUrl = await presignGet(key, 300);
      return sendJson(res, 200, { success: true, url: signedUrl });
    }

    // ── Download Proxy: stream file with Content-Disposition: attachment ───
    // Forces a file save on ALL browsers/devices (desktop + iOS + Android).
    // Same-origin URL means the 'download' attribute is respected everywhere.
    if (pathname === '/default/download-proxy' && req.method === 'GET') {
      const key = url.searchParams.get('key') || '';
      const shareId = url.searchParams.get('shareId') || '';
      if (!key) return sendError(res, 400, 'Missing key');

      try {
        // Track download count (non-blocking, don't fail if DB is slow or disconnected)
        if (mongoose.connection.readyState === 1) {
          try {
            FileMeta.findOneAndUpdate({ key }, { $inc: { downloadCount: 1 }, $setOnInsert: { key } }, { upsert: true }).catch(() => {});
            if (shareId) {
              Share.findOneAndUpdate({ shareId }, { $inc: { downloadCount: 1 } }).catch(() => {});
            }
          } catch (dbErr) {
            console.warn('Mongoose sync query error in download-proxy:', dbErr.message);
          }
        }

        // Fetch metadata + stream from S3
        const s3Res = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));

        // Clean filename from the S3 key
        const rawFilename = key.split('/').pop() || 'download';
        // Keep original chars that are safe; replace the rest with underscore
        const safeFilename = decodeURIComponent(rawFilename).replace(/[^\w.\- ]/g, '_');
        const contentType = s3Res.ContentType || 'application/octet-stream';

        // Write response headers ONCE before streaming starts.
        // We force 'application/octet-stream' Content-Type to prevent mobile
        // Safari/Chrome from opening the image inline instead of triggering the download.
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`,
          'Cache-Control': 'no-store',
          ...(s3Res.ContentLength ? { 'Content-Length': String(s3Res.ContentLength) } : {}),
          ...cors,
        });

        // Stream S3 body directly — avoids loading entire file into memory
        try {
          for await (const chunk of s3Res.Body) {
            if (!res.writableEnded) res.write(chunk);
          }
          if (!res.writableEnded) res.end();
        } catch (streamErr) {
          console.error('Download proxy stream error:', streamErr.message);
          // Headers already sent — cannot send a new error response.
          // Destroy the socket to signal failure to the client.
          if (!res.writableEnded) res.destroy(streamErr);
        }
      } catch (err) {
        console.error('Download proxy failed:', err.message);
        // Headers NOT yet sent (failed before writeHead) — safe to send error
        if (!res.headersSent) {
          return sendError(res, 500, 'Download failed');
        }
        if (!res.writableEnded) res.destroy(err);
      }
      return;
    }

    // ── Share: create ──────────────────────────────────────────────────────
    if (pathname === '/default/sharelink' && req.method === 'POST') {
      if (!isAuthed(req)) return sendError(res, 401, 'Unauthorized');
      if (!(await ensureMongoReadyOrFail(res))) return;
      const body = await readBody(req);
      const items         = body?.items || body?.selectedItems || [];
      const sharePin      = body?.sharePin || body?.settings?.pin || '';
      const allowDownload = body?.allowDownload !== false;
      const folderPrefix  = body?.folderPrefix || '';
      const expiresInHours = Number(body?.expiresInHours || 168);
      const shareId  = `share_${randomUUID()}`;
      const expiresAt = new Date(Date.now() + expiresInHours * 3600_000);

      await Share.create({ shareId, folderPrefix, items, sharePin, allowDownload, expiresAt, isActive: true });

      const baseUrl = getFrontendBaseUrl(req);
      const shareUrl = `${baseUrl}/shared-folder-view/${encodeURIComponent(folderPrefix || shareId)}?sid=${shareId}`;
      return sendJson(res, 200, {
        success: true, message: 'Share link created', shareUrl, shareLink: shareUrl, shareId,
        sharePin: sharePin ? '••••' : null, allowDownload, expiresAt,
      });
    }

    // ── Share: list (admin) ────────────────────────────────────────────────
    if (pathname === '/default/listshares' && req.method === 'GET') {
      if (!isAuthed(req)) return sendError(res, 401, 'Unauthorized');
      if (!(await ensureMongoReadyOrFail(res))) return;
      const shares = await Share.find({}).sort({ createdAt: -1 }).lean();
      return sendJson(res, 200, { success: true, shares });
    }

    // ── Share: revoke ──────────────────────────────────────────────────────
    if (pathname === '/default/revokeshare' && req.method === 'POST') {
      if (!isAuthed(req)) return sendError(res, 401, 'Unauthorized');
      if (!(await ensureMongoReadyOrFail(res))) return;
      const body = await readBody(req);
      const { shareId } = body || {};
      if (!shareId) return sendError(res, 400, 'Missing shareId');
      await Share.findOneAndUpdate({ shareId }, { isActive: false });
      return sendJson(res, 200, { success: true, message: 'Share revoked' });
    }

    // ── Share: delete (remove share record) ─────────────────────────────────
    if (pathname === '/default/deleteshare' && req.method === 'POST') {
      if (!isAuthed(req)) return sendError(res, 401, 'Unauthorized');
      if (!(await ensureMongoReadyOrFail(res))) return;
      const body = await readBody(req);
      const { shareId } = body || {};
      if (!shareId) return sendError(res, 400, 'Missing shareId');
      try {
        await Share.findOneAndDelete({ shareId });
        return sendJson(res, 200, { success: true, message: 'Share deleted' });
      } catch (err) {
        console.error('deleteshare failed:', err.message || err);
        return sendError(res, 500, 'Failed to delete share');
      }
    }

    // ── Share: access / PIN verify ─────────────────────────────────────────
    if (pathname === '/default/SharedLinkAccess' && req.method === 'POST') {
      if (!(await ensureMongoReadyOrFail(res))) return;
      const body   = await readBody(req);
      const action  = body?.action || '';
      const shareId = body?.shareId || body?.sharedId || '';
      const inputPin = body?.pin || body?.sharePin || '';
      if (!shareId) return sendError(res, 400, 'Missing shareId');

      const share = await Share.findOne({ shareId });
      if (!share)          return sendError(res, 404, 'Share link not found or expired');
      if (!share.isActive) return sendError(res, 403, 'This share link has been revoked');
      if (share.expiresAt && new Date() > share.expiresAt) {
        await Share.findOneAndUpdate({ shareId }, { isActive: false });
        return sendError(res, 410, 'This share link has expired');
      }

      let branding = {};
      if (share.folderPrefix) {
        const meta = await FolderMeta.findOne({ path: share.folderPrefix }).lean().catch(() => null);
        if (meta) {
          branding = { logoUrl: meta.logoUrl, brandColor: meta.brandColor, client: meta.client };
        }
      }

      if (action === 'get_share_link_status') {
        if (!share.sharePin) {
          const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
          await Share.findOneAndUpdate(
            { shareId },
            {
              $inc: { viewCount: 1 },
              $set: { lastAccess: new Date() },
              $addToSet: { ips: ip }
            }
          );
        }
        return sendJson(res, 200, { success: true, shareLink: {
          shareId, isActive: share.isActive, isPinProtected: !!share.sharePin,
          createdAt: share.createdAt, expiresAt: share.expiresAt,
          items: share.items,
          allowDownload: share.allowDownload,
        }, branding, favorites: share.favorites || [] });
      }

      if (action === 'submit_favorites') {
        const favs = body?.favorites || [];
        await Share.findOneAndUpdate({ shareId }, { favorites: favs });
        return sendJson(res, 200, { success: true, message: 'Favorites saved successfully' });
      }

      if (action === 'verify_pin') {
        if (share.sharePin && inputPin !== share.sharePin)
          return sendError(res, 401, 'Incorrect PIN');
        
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
        await Share.findOneAndUpdate(
          { shareId },
          {
            $inc: { viewCount: 1 },
            $set: { lastAccess: new Date() },
            $addToSet: { ips: ip }
          }
        );

        const baseUrl = getFrontendBaseUrl(req);
        return sendJson(res, 200, { success: true, message: 'PIN verified',
          folderPrefix: share.folderPrefix,
          shareUrl: `${baseUrl}/shared-folder-view/${encodeURIComponent(share.folderPrefix || shareId)}?sid=${shareId}`,
          shareLink: {
            shareId, isActive: share.isActive, isPinProtected: !!share.sharePin,
            createdAt: share.createdAt, expiresAt: share.expiresAt,
            items: share.items,
            allowDownload: share.allowDownload,
          },
          branding,
          favorites: share.favorites || [],
        });
      }

      // Default direct access
      if (share.sharePin) {
        if (!inputPin) return sendJson(res, 401, { success: false, requirePin: true, isPinProtected: true });
        if (inputPin !== share.sharePin) return sendError(res, 401, 'Incorrect PIN');
      }

      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
      await Share.findOneAndUpdate(
        { shareId }, 
        { 
          $inc: { viewCount: 1 },
          $set: { lastAccess: new Date() },
          $addToSet: { ips: ip }
        }
      );

      const resolvedItems = await Promise.all((share.items || []).map(async item => {
        const key = typeof item === 'string' ? item : (item.id || item.key || '');
        const signedUrl = await presignGet(key, 86400);
        const meta = await FileMeta.findOne({ key }).lean();
        return { id: key, title: path.basename(key), imageUrl: signedUrl, presigned_url: signedUrl,
          isVideo: /\.(mp4|mov|avi|mkv|webm)$/i.test(key), allowDownload: share.allowDownload, comments: meta?.comments || [] };
      }));

      return sendJson(res, 200, { success: true, shareId, isPinProtected: !!share.sharePin,
        allowDownload: share.allowDownload, folderPrefix: share.folderPrefix, items: resolvedItems, branding, favorites: share.favorites || [] });
    }

    // ── Mail stub ──────────────────────────────────────────────────────────
    if (pathname === '/default/mailsend' && req.method === 'POST') {
      const body = await readBody(req);
      console.log('📧 Email stub →', body?.to, '|', body?.subject);
      return sendJson(res, 200, { success: true, message: 'Email sent (stub)' });
    }

    // --- Simulated Background Jobs ---
    let jobsQueue = [];
    let jobIdCounter = 1;

    if (pathname === '/default/simulate-job' && req.method === 'POST') {
      if (!isAuthed(req)) return sendError(res, 401, 'Unauthorized');
      const body = await readBody(req);
      const { type } = body || {};
      const job = { id: jobIdCounter++, type: type || 'Metadata Extraction', status: 'processing', progress: 0 };
      jobsQueue.push(job);
      
      // Simulate background work
      let progress = 0;
      const interval = setInterval(() => {
        progress += 20;
        const j = jobsQueue.find(x => x.id === job.id);
        if (j) j.progress = progress;
        if (progress >= 100) {
          if (j) j.status = 'completed';
          clearInterval(interval);
        }
      }, 1000);
      
      return sendJson(res, 200, { success: true, job });
    }

    if (pathname === '/default/jobs' && req.method === 'GET') {
      if (!isAuthed(req)) return sendError(res, 401, 'Unauthorized');
      // Return last 5 jobs
      return sendJson(res, 200, { success: true, jobs: jobsQueue.slice(-5).reverse() });
    }

    sendError(res, 404, 'Route not found');

  } catch (err) {
    console.error('Unhandled error:', err);
    sendError(res, 500, err.message || 'Internal server error');
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
let _port = PORT;
const startHttp = () => {
  if (hasStartedHttpServer || server.listening) return;
  hasStartedHttpServer = true;
  server.listen(_port, () =>
    console.log(`✅  Backend  →  http://localhost:${_port}\n✅  Bucket   →  ${S3_BUCKET} @ ${S3_ENDPOINT}`)
  );
};
server.on('error', err => {
  if (err?.code === 'EADDRINUSE') { _port++; setTimeout(startHttp, 200); }
  else { console.error(err); process.exit(1); }
});

ensureMongoConnected()
  .then(() => {
    console.log('🍃  MongoDB connected');
    startHttp();
  })
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });

// Export the server for hosting platforms (Vercel) that expect an exported
// function or server object. This allows Vercel to detect and use the server
// instead of requiring a separate serverless handler file.
export default server;
