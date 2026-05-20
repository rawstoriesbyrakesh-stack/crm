import 'dotenv/config';
import mongoose from 'mongoose';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

const MONGO_URI = process.env.MONGO_URI;
const WASABI_ACCESS_KEY = process.env.WASABI_ACCESS_KEY;
const WASABI_SECRET_KEY = process.env.WASABI_SECRET_KEY;
const WASABI_BUCKET = process.env.WASABI_BUCKET;
const WASABI_REGION = process.env.WASABI_REGION;
const WASABI_ENDPOINT = process.env.WASABI_ENDPOINT;

const s3 = new S3Client({
  region: WASABI_REGION,
  endpoint: WASABI_ENDPOINT,
  credentials: { accessKeyId: WASABI_ACCESS_KEY, secretAccessKey: WASABI_SECRET_KEY },
  forcePathStyle: true,
});

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to DB');

  const folderMetaSchema = new mongoose.Schema({
    path: String,
    name: String,
  }, { strict: false });
  const FolderMeta = mongoose.model('FolderMeta', folderMetaSchema);

  console.log('\n--- FolderMeta entries ---');
  const dbFolders = await FolderMeta.find({}).lean();
  console.log(dbFolders);

  console.log('\n--- S3 Objects (Wasabi) ---');
  const list = await s3.send(new ListObjectsV2Command({ Bucket: WASABI_BUCKET }));
  console.log('CommonPrefixes with Delimiter /:');
  const listDelim = await s3.send(new ListObjectsV2Command({ Bucket: WASABI_BUCKET, Delimiter: '/' }));
  console.log(listDelim.CommonPrefixes);
  
  console.log('\nAll Contents Keys:');
  console.log((list.Contents || []).map(o => ({ Key: o.Key, Size: o.Size })));

  await mongoose.disconnect();
}

main().catch(console.error);
