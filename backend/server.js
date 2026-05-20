import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import {
  S3Client, PutObjectCommand, DeleteObjectsCommand,
  ListObjectsV2Command, CopyObjectCommand, HeadObjectCommand,
  PutBucketCorsCommand,
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
const WASABI_ACCESS_KEY  = process.env.WASABI_ACCESS_KEY;
const WASABI_SECRET_KEY  = process.env.WASABI_SECRET_KEY;
const WASABI_BUCKET      = process.env.WASABI_BUCKET;
const WASABI_REGION      = process.env.WASABI_REGION;
const WASABI_ENDPOINT    = process.env.WASABI_ENDPOINT;
const PRESIGNED_EXPIRY   = Number(process.env.PRESIGNED_URL_EXPIRY ?? 3600);

// Validate required vars
const REQUIRED = ['RAWSTORIES_EMAIL','RAWSTORIES_PASSWORD','RAWSTORIES_TOKEN','MONGO_URI',
                  'WASABI_ACCESS_KEY','WASABI_SECRET_KEY','WASABI_BUCKET','WASABI_REGION','WASABI_ENDPOINT'];
const MISSING = REQUIRED.filter(k => !process.env[k]);
if (MISSING.length) {
  console.error(`\n❌  Missing env vars: ${MISSING.join(', ')}\n   Set them in backend/.env\n`);
  process.exit(1);
}

// ─── Wasabi S3 Client ─────────────────────────────────────────────────────────
const s3 = new S3Client({
  region: WASABI_REGION,
  endpoint: WASABI_ENDPOINT,
  credentials: { accessKeyId: WASABI_ACCESS_KEY, secretAccessKey: WASABI_SECRET_KEY },
  forcePathStyle: true,
});

const presignGet = (key, expiresIn = PRESIGNED_EXPIRY) =>
  getSignedUrl(s3, new GetObjectCommand({ Bucket: WASABI_BUCKET, Key: key }), { expiresIn });

const presignPut = (key, contentType = 'application/octet-stream', expiresIn = PRESIGNED_EXPIRY) =>
  getSignedUrl(s3, new PutObjectCommand({ Bucket: WASABI_BUCKET, Key: key, ContentType: contentType }), { expiresIn });

// Auto-configure Bucket CORS to allow browser uploads
const configureBucketCors = async () => {
  try {
    // Ensure MongoDB is connected before handling requests that use Mongoose models.
    // `ensureMongoConnected` caches the connection promise so this is cheap after initial connect.
    try {
      await ensureMongoConnected();
    } catch (err) {
      console.error('❌ MongoDB connection failed:', err && err.message ? err.message : err);
      return sendError(res, 500, 'MongoDB connection failed');
    }
    await s3.send(new PutBucketCorsCommand({
      Bucket: WASABI_BUCKET,
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
    console.log('✅ Wasabi bucket CORS policy automatically configured.');
  } catch (err) {
    console.error('⚠️ Could not configure Wasabi CORS (user may lack permissions):', err.message);
  }
};
configureBucketCors();

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

const isAuthed = req => {
  const h = req.headers.authorization || '';
  return h.split(' ')[1] === SESSION_TOKEN;
};

// ─── Server ───────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }

  const url      = new URL(req.url || '/', `http://localhost`);
  const pathname = url.pathname;

  try {

    // ── Health ─────────────────────────────────────────────────────────────
    if (pathname === '/api/health') {
      return sendJson(res, 200, {
        success: true,
        storage: 'wasabi',
        db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        bucket: WASABI_BUCKET,
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
      const list = await s3.send(new ListObjectsV2Command({ Bucket: WASABI_BUCKET, Delimiter: '/' }));
      const topFolders = (list.CommonPrefixes || []).length;
      const allList = await s3.send(new ListObjectsV2Command({ Bucket: WASABI_BUCKET }));
      
      const imageObjects = (allList.Contents || []).filter(o => {
        const key = o.Key || '';
        return /\.(jpg|jpeg|png|gif|webp|bmp|svg|tiff|mp4|mov|avi|mkv|webm|cr2|nef|arw|dng)$/i.test(key);
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
      });
      const recentUploads = imageObjects
        .sort((a, b) => (b.LastModified || 0) - (a.LastModified || 0))
        .slice(0, 10)
        .map(o => ({ name: path.basename(o.Key || ''), uploadedAt: o.LastModified }));
      return sendJson(res, 200, { success: true, stats: { totalFolders: topFolders, totalImages, totalSharedLinks: shareCount, totalStorage, recentUploads } });
    }

    // ── Gallery: list folder contents ──────────────────────────────────────
    if (pathname === '/default/getallimages' && req.method === 'GET') {
      const prefix    = url.searchParams.get('prefix') || '';
      const recursive = url.searchParams.get('recursive') === 'true';

      const listResult = await s3.send(new ListObjectsV2Command({
        Bucket: WASABI_BUCKET,
        Prefix: prefix,
        Delimiter: recursive ? undefined : '/',
      }));

      // Folders
      const folderPrefixes = listResult.CommonPrefixes || [];
      const folders = await Promise.all(folderPrefixes.map(async cp => {
        const folderPrefix = cp.Prefix || '';
        const meta = await FolderMeta.findOne({ path: folderPrefix }).lean();
        const name = meta?.name || folderPrefix.replace(prefix, '').replace(/\/$/, '');
        return { name, path: folderPrefix, description: meta?.description || '', client: meta?.client || '', tags: meta?.tags || [] };
      }));

      // Files
      const objects = (listResult.Contents || []).filter(o => {
        const key = o.Key || '';
        return key !== prefix && /\.(jpg|jpeg|png|gif|webp|bmp|svg|tiff|mp4|mov|avi|mkv|webm|cr2|nef|arw|dng)$/i.test(key);
      });

      const files = await Promise.all(objects.map(async o => {
        const key = o.Key || '';
        const meta = await FileMeta.findOne({ key }).lean();
        const signedUrl = await presignGet(key);
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
        };
      }));

      return sendJson(res, 200, { success: true, files, folders });
    }

    // ── Upload: generate presigned PUT URL ─────────────────────────────────
    if (pathname === '/default/imagesupload' && req.method === 'POST') {
      if (!isAuthed(req)) return sendError(res, 401, 'Unauthorized');
      const body = await readBody(req);
      const key = body?.key;
      const contentType = body?.contentType || 'application/octet-stream';
      if (!key) return sendError(res, 400, 'Missing key');
      const uploadUrl = await presignPut(key, contentType);
      return sendJson(res, 200, { success: true, presigned_url: uploadUrl, url: uploadUrl, object_key: key });
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
              Bucket: WASABI_BUCKET,
              CopySource: `${WASABI_BUCKET}/${srcKey}`,
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
      await s3.send(new PutObjectCommand({ Bucket: WASABI_BUCKET, Key: key }));
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
      const list = await s3.send(new ListObjectsV2Command({ Bucket: WASABI_BUCKET, Prefix: oldKey }));
      const objects = list.Contents || [];
      for (const obj of objects) {
        if (!obj.Key) continue;
        const newObjKey = newKey + obj.Key.slice(oldKey.length);
        await s3.send(new CopyObjectCommand({ Bucket: WASABI_BUCKET, CopySource: `${WASABI_BUCKET}/${obj.Key}`, Key: newObjKey }));
      }
      // Delete old objects
      if (objects.length > 0) {
        await s3.send(new DeleteObjectsCommand({ Bucket: WASABI_BUCKET, Delete: { Objects: objects.map(o => ({ Key: o.Key })) } }));
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
      await s3.send(new CopyObjectCommand({ Bucket: WASABI_BUCKET, CopySource: `${WASABI_BUCKET}/${oldKey}`, Key: newKey }));
      await s3.send(new DeleteObjectsCommand({ Bucket: WASABI_BUCKET, Delete: { Objects: [{ Key: oldKey }] } }));
      await FileMeta.findOneAndUpdate({ key: oldKey }, { key: newKey });
      return sendJson(res, 200, { success: true, message: 'Moved successfully' });
    }

    // ── File/Folder: delete ────────────────────────────────────────────────
    if (pathname === '/default/deleteimage' && req.method === 'POST') {
      if (!isAuthed(req)) return sendError(res, 401, 'Unauthorized');
      const body = await readBody(req);
      const keys = body?.keys || (body?.key ? [body.key] : []);
      const toDelete = [];

      for (const key of keys) {
        if (key.endsWith('/')) {
          // it's a folder — list everything under it
          const list = await s3.send(new ListObjectsV2Command({ Bucket: WASABI_BUCKET, Prefix: key }));
          (list.Contents || []).forEach(o => o.Key && toDelete.push({ Key: o.Key }));
          await FolderMeta.deleteOne({ path: key });
        } else {
          toDelete.push({ Key: key });
          await FileMeta.deleteOne({ key });
        }
      }

      if (toDelete.length > 0) {
        // Delete in batches of 1000 (S3 limit)
        for (let i = 0; i < toDelete.length; i += 1000) {
          await s3.send(new DeleteObjectsCommand({
            Bucket: WASABI_BUCKET,
            Delete: { Objects: toDelete.slice(i, i + 1000) }
          }));
        }
      }
      return sendJson(res, 200, { success: true, deleted: keys, errors: [] });
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
      if (!key) return sendError(res, 400, 'Missing key');
      await FileMeta.findOneAndUpdate({ key }, { $inc: { downloadCount: 1 }, $setOnInsert: { key } }, { upsert: true });
      const signedUrl = await presignGet(key, 300);
      return sendJson(res, 200, { success: true, url: signedUrl });
    }

    // ── Share: create ──────────────────────────────────────────────────────
    if (pathname === '/default/sharelink' && req.method === 'POST') {
      if (!isAuthed(req)) return sendError(res, 401, 'Unauthorized');
      const body = await readBody(req);
      const items         = body?.items || body?.selectedItems || [];
      const sharePin      = body?.sharePin || body?.settings?.pin || '';
      const allowDownload = body?.allowDownload !== false;
      const folderPrefix  = body?.folderPrefix || '';
      const expiresInHours = Number(body?.expiresInHours || 168);
      const shareId  = `share_${randomUUID()}`;
      const expiresAt = new Date(Date.now() + expiresInHours * 3600_000);

      await Share.create({ shareId, folderPrefix, items, sharePin, allowDownload, expiresAt, isActive: true });

      const shareUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/shared-folder-view/${encodeURIComponent(folderPrefix || shareId)}?sid=${shareId}`;
      return sendJson(res, 200, {
        success: true, message: 'Share link created', shareUrl, shareLink: shareUrl, shareId,
        sharePin: sharePin ? '••••' : null, allowDownload, expiresAt,
      });
    }

    // ── Share: list (admin) ────────────────────────────────────────────────
    if (pathname === '/default/listshares' && req.method === 'GET') {
      if (!isAuthed(req)) return sendError(res, 401, 'Unauthorized');
      const shares = await Share.find({}).sort({ createdAt: -1 }).lean();
      return sendJson(res, 200, { success: true, shares });
    }

    // ── Share: revoke ──────────────────────────────────────────────────────
    if (pathname === '/default/revokeshare' && req.method === 'POST') {
      if (!isAuthed(req)) return sendError(res, 401, 'Unauthorized');
      const body = await readBody(req);
      const { shareId } = body || {};
      if (!shareId) return sendError(res, 400, 'Missing shareId');
      await Share.findOneAndUpdate({ shareId }, { isActive: false });
      return sendJson(res, 200, { success: true, message: 'Share revoked' });
    }

    // ── Share: access / PIN verify ─────────────────────────────────────────
    if (pathname === '/default/SharedLinkAccess' && req.method === 'POST') {
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

      if (action === 'get_share_link_status') {
        return sendJson(res, 200, { success: true, shareLink: {
          shareId, isActive: share.isActive, isPinProtected: !!share.sharePin,
          createdAt: share.createdAt, expiresAt: share.expiresAt,
        }});
      }

      if (action === 'verify_pin') {
        if (share.sharePin && inputPin !== share.sharePin)
          return sendError(res, 401, 'Incorrect PIN');
        return sendJson(res, 200, { success: true, message: 'PIN verified',
          folderPrefix: share.folderPrefix,
          shareUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/shared-folder-view/${encodeURIComponent(share.folderPrefix || shareId)}?sid=${shareId}`,
        });
      }

      // Default direct access
      if (share.sharePin) {
        if (!inputPin) return sendJson(res, 401, { success: false, requirePin: true, isPinProtected: true });
        if (inputPin !== share.sharePin) return sendError(res, 401, 'Incorrect PIN');
      }

      await Share.findOneAndUpdate({ shareId }, { $inc: { viewCount: 1 } });

      const resolvedItems = await Promise.all((share.items || []).map(async item => {
        const key = typeof item === 'string' ? item : (item.id || item.key || '');
        const signedUrl = await presignGet(key, 86400);
        return { id: key, title: path.basename(key), imageUrl: signedUrl, presigned_url: signedUrl,
          isVideo: /\.(mp4|mov|avi|mkv|webm)$/i.test(key), allowDownload: share.allowDownload };
      }));

      return sendJson(res, 200, { success: true, shareId, isPinProtected: !!share.sharePin,
        allowDownload: share.allowDownload, folderPrefix: share.folderPrefix, items: resolvedItems });
    }

    // ── Mail stub ──────────────────────────────────────────────────────────
    if (pathname === '/default/mailsend' && req.method === 'POST') {
      const body = await readBody(req);
      console.log('📧 Email stub →', body?.to, '|', body?.subject);
      return sendJson(res, 200, { success: true, message: 'Email sent (stub)' });
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
    console.log(`✅  Backend  →  http://localhost:${_port}\n✅  Bucket   →  ${WASABI_BUCKET} @ ${WASABI_ENDPOINT}`)
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
