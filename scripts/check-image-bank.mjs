import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { OFFLINE_DAILY_IMAGES } from '../src/lib/offlineDailyContent.ts';
import { OFFLINE_MESSAGES } from '../src/constants/offlineMessages.ts';

// Run with: node --import tsx scripts/check-image-bank.mjs
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'public/images/daily/sources.json'), 'utf8'));
const sources = new Map(manifest.assets.map((item) => [item.file, item]));
assert.equal(sources.size, manifest.assets.length, 'Duplicate source manifest entries');
const hashes = new Map();
const photoIds = new Map();
const periods = {};
let totalBytes = 0;
for (const period of ['morning', 'afternoon', 'night']) {
  const images = OFFLINE_DAILY_IMAGES[period];
  assert.equal(images.length, 50, `${period}: expected 50 photos`);
  let bytes = 0;
  let maxBytes = 0;
  for (const image of images) {
    const file = path.basename(image.src);
    const source = sources.get(file);
    assert.equal(source?.period, period, `${file}: missing or incorrect source metadata`);
    const url = new URL(source.sourceUrl);
    assert.equal(url.hostname, 'images.unsplash.com', `${file}: unexpected source host`);
    assert.ok(!photoIds.has(url.pathname), `${file}: source photo already used by ${photoIds.get(url.pathname)}`);
    photoIds.set(url.pathname, file);
    const data = await fs.readFile(path.join(root, 'public', image.src.slice(1)));
    const hash = createHash('sha256').update(data).digest('hex');
    assert.ok(!hashes.has(hash), `${file}: duplicate bytes of ${hashes.get(hash)}`);
    hashes.set(hash, file);
    const meta = await sharp(data).metadata();
    assert.equal(meta.format, 'jpeg', `${file}: expected JPEG`);
    assert.equal(meta.width, 960, `${file}: expected 960 px width`);
    assert.equal(meta.height, 1200, `${file}: expected 1200 px height`);
    assert.ok(data.length <= 350_000, `${file}: exceeds 350 KB image budget`);
    // Decode the whole JPEG so a valid header cannot hide a truncated download.
    await sharp(data).resize(1, 1).raw().toBuffer();
    bytes += data.length;
    maxBytes = Math.max(maxBytes, data.length);
  }
  const phrases = OFFLINE_MESSAGES[period].length;
  periods[period] = { images: images.length, phrases, combinations: images.length * phrases, bytes, averageBytes: Math.round(bytes / images.length), maxBytes };
  totalBytes += bytes;
}
assert.equal(sources.size, 150, 'Source manifest must cover exactly 150 bundled photos');
assert.ok(totalBytes <= 25_000_000, 'Bundled photo bank exceeds its 25 MB budget');
console.log(JSON.stringify({ periods, totalImages: hashes.size, uniqueSourcePhotos: photoIds.size, totalBytes, totalMB: +(totalBytes / 1_000_000).toFixed(2), averageBytes: Math.round(totalBytes / hashes.size), totalCombinations: Object.values(periods).reduce((sum, period) => sum + period.combinations, 0) }, null, 2));
