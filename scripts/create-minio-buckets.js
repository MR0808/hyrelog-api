/**
 * Create MinIO buckets for archival
 * 
 * This script creates the required S3 buckets in MinIO for each region.
 * Run this after starting Docker Compose.
 */

import { S3Client, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { config as loadDotenv } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);
const rootDir = resolve(currentDir, '..');
loadDotenv({ path: resolve(rootDir, '.env') });

const buckets = [
  process.env.S3_BUCKET_US || 'hyrelog-archive-us',
  process.env.S3_BUCKET_EU || 'hyrelog-archive-eu',
  process.env.S3_BUCKET_UK || 'hyrelog-archive-uk',
  process.env.S3_BUCKET_AU || 'hyrelog-archive-au',
];

const s3Endpoint = process.env.S3_ENDPOINT || 'http://localhost:9000';
const s3AccessKeyId = process.env.S3_ACCESS_KEY_ID || 'minioadmin';
const s3SecretAccessKey = process.env.S3_SECRET_ACCESS_KEY || 'minioadmin';
const s3Region = process.env.S3_REGION || 'us-east-1';
const s3ForcePathStyle = process.env.S3_FORCE_PATH_STYLE === 'true' || true; // MinIO requires path style

const s3Client = new S3Client({
  region: s3Region,
  endpoint: s3Endpoint,
  credentials: {
    accessKeyId: s3AccessKeyId,
    secretAccessKey: s3SecretAccessKey,
  },
  forcePathStyle: s3ForcePathStyle,
});

async function bucketExists(bucketName) {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
    return true;
  } catch (error) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

async function createBucket(bucketName) {
  try {
    const exists = await bucketExists(bucketName);
    if (exists) {
      console.log(`✅ Bucket "${bucketName}" already exists`);
      return;
    }

    await s3Client.send(
      new CreateBucketCommand({
        Bucket: bucketName,
      })
    );
    console.log(`✅ Created bucket: ${bucketName}`);
  } catch (error) {
    console.error(`❌ Failed to create bucket "${bucketName}":`, error.message);
    throw error;
  }
}

async function main() {
  console.log('🚀 Creating MinIO buckets...\n');
  console.log(`Endpoint: ${s3Endpoint}`);
  console.log(`Region: ${s3Region}\n`);

  for (const bucket of buckets) {
    await createBucket(bucket);
  }

  console.log('\n✅ All buckets created successfully!');
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
