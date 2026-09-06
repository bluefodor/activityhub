#!/usr/bin/env node
/**
 * One-time: recompress existing Supabase Storage images in chat-images + avatars.
 *
 * Prereqs:
 *   npm install --save-dev sharp
 *   export SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
 *   export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
 *
 * Dry run (default):
 *   node scripts/compress-storage-images.mjs
 *
 * Actually rewrite files (upsert):
 *   node scripts/compress-storage-images.mjs --write
 *
 * Optional:
 *   --bucket=chat-images   (repeatable; default: chat-images, avatars)
 *   --limit=50             (max files per bucket)
 */

import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const WRITE = process.argv.includes('--write');
const BUCKETS = [];
const LIMIT = (() => {
  const arg = process.argv.find((a) => a.startsWith('--limit='));
  return arg ? Math.max(1, parseInt(arg.split('=')[1], 10) || 100) : 500;
})();

for (const arg of process.argv) {
  if (arg.startsWith('--bucket=')) BUCKETS.push(arg.slice('--bucket='.length));
}
if (BUCKETS.length === 0) {
  BUCKETS.push('chat-images', 'avatars');
}

const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PRESETS = {
  avatars: { maxWidth: 512, quality: 75 },
  'chat-images': { maxWidth: 1280, quality: 72 },
};

async function listAllFiles(bucket, prefix = '') {
  const out = [];
  const { data, error } = await supabase.storage.from(bucket).list(prefix, {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' },
  });
  if (error) throw error;
  for (const entry of data ?? []) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id == null) {
      out.push(...(await listAllFiles(bucket, path)));
    } else {
      out.push(path);
    }
  }
  return out;
}

function isImagePath(path) {
  return /\.(jpe?g|png|webp|heic)$/i.test(path);
}

async function compressBuffer(buffer, bucket) {
  const preset = PRESETS[bucket] ?? PRESETS['chat-images'];
  return sharp(buffer)
    .rotate()
    .resize({ width: preset.maxWidth, withoutEnlargement: true })
    .jpeg({ quality: preset.quality, mozjpeg: true })
    .toBuffer();
}

async function processBucket(bucket) {
  console.log(`\n=== ${bucket} ===`);
  const paths = (await listAllFiles(bucket)).filter(isImagePath).slice(0, LIMIT);
  console.log(`Found ${paths.length} image(s) (limit ${LIMIT})`);

  let savedBytes = 0;
  let processed = 0;
  let skipped = 0;

  for (const path of paths) {
    const { data, error } = await supabase.storage.from(bucket).download(path);
    if (error || !data) {
      console.warn(`  skip (download failed): ${path}`, error?.message);
      skipped += 1;
      continue;
    }

    const original = Buffer.from(await data.arrayBuffer());
    const compressed = await compressBuffer(original, bucket);
    const delta = original.length - compressed.length;

    if (compressed.length >= original.length * 0.95) {
      console.log(`  skip (already small): ${path} (${original.length} bytes)`);
      skipped += 1;
      continue;
    }

    processed += 1;
    savedBytes += Math.max(0, delta);
    console.log(
      `  ${WRITE ? 'write' : 'dry-run'} ${path}: ${original.length} → ${compressed.length} bytes (-${Math.round((delta / original.length) * 100)}%)`,
    );

    if (WRITE) {
      const { error: uploadError } = await supabase.storage.from(bucket).upload(path, compressed, {
        contentType: 'image/jpeg',
        upsert: true,
      });
      if (uploadError) {
        console.error(`  upload failed: ${path}`, uploadError.message);
      }
    }
  }

  console.log(
    `Bucket ${bucket}: processed=${processed}, skipped=${skipped}, saved≈${Math.round(savedBytes / 1024)} KB`,
  );
}

console.log(WRITE ? 'MODE: write (will upsert compressed JPEGs)' : 'MODE: dry-run (pass --write to apply)');

for (const bucket of BUCKETS) {
  await processBucket(bucket);
}

console.log('\nDone.');
