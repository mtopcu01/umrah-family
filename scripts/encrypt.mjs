#!/usr/bin/env node
// Encrypts private/data.json, private/data.tr.json and private/photos/* into docs/data.enc.json.
//
//   npm run encrypt            asks for the password (typing is hidden)
//
// PBKDF2-SHA256 (600,000 iterations, random 16-byte salt) -> AES-256-GCM (random 12-byte IV).
// The browser does the same derivation with Web Crypto to decrypt.

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, pbkdf2Sync, createCipheriv } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { checkPublished } from './check-published.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PRIVATE = join(ROOT, 'private');
const OUT = join(ROOT, 'docs', 'data.enc.json');
const ITERATIONS = 600000;
const PHOTO_SIZE = 400;

// Data fields whose text is shown translated in Turkish (see tx() in docs/app.js).
const TRANSLATED_KEYS = new Set([
  'from', 'to', 'city', 'flight', 'seat', 'booking', 'checked', 'carryOn', 'underSeat', 'meal',
  'layover', 'wheelchair', 'seatNote', 'class', 'type', 'notes', 'checkIn', 'checkOut', 'room',
  'roomType', 'breakfast', 'note', 'nationality', 'placeOfBirth', 'entries', 'stayAllowed',
  'nationalityOnVisa', 'correctNationality', 'pieces', 'weight', 'largestBag', 'extra', 'headline', 'text',
]);

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    console.error(`\nCouldn't read ${path}:\n  ${e.message}\n`);
    process.exit(1);
  }
}

function missingTranslations(data, tr) {
  const missing = new Set();
  const visit = (v, key) => {
    if (Array.isArray(v)) return v.forEach((x) => visit(x, key));
    if (v && typeof v === 'object') return Object.entries(v).forEach(([k, x]) => visit(x, k));
    // Codes, times and numbers (no lowercase letters) are shown as they are.
    if (typeof v === 'string' && TRANSLATED_KEYS.has(key) && /\p{Ll}/u.test(v) && !(v in tr)) {
      // Durations like "Doha · 8h 10m" are converted automatically.
      if (!/^[^()]*· \d+h \d+m$/.test(v)) missing.add(v);
    }
  };
  visit(data);
  return [...missing];
}

function loadPhotos() {
  const dir = join(PRIVATE, 'photos');
  if (!existsSync(dir)) return {};
  const types = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
  const photos = {};
  const tmp = mkdtempSync(join(tmpdir(), 'umrah-photos-'));
  try {
    for (const file of readdirSync(dir)) {
      const ext = extname(file).toLowerCase();
      if (!types[ext]) continue;
      const id = basename(file, extname(file)).toLowerCase();
      let bytes, type = types[ext];
      try {
        // macOS: shrink to 400px and re-save as JPEG so the encrypted file stays small.
        const out = join(tmp, `${id}.jpg`);
        execFileSync('sips', ['-Z', String(PHOTO_SIZE), '-s', 'format', 'jpeg', '-s', 'formatOptions', '80', join(dir, file), '--out', out], { stdio: 'ignore' });
        bytes = readFileSync(out);
        type = 'image/jpeg';
      } catch {
        bytes = readFileSync(join(dir, file));
      }
      photos[id] = `data:${type};base64,${bytes.toString('base64')}`;
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return photos;
}

function askHidden(question) {
  return new Promise((resolve) => {
    const { stdin, stdout } = process;
    if (!stdin.isTTY) {
      console.error('\nRun this in a terminal so it can ask for the password.\n');
      process.exit(1);
    }
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (ch) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          stdout.write('\n');
          return resolve(value);
        }
        if (c === '\u0003') { stdout.write('\n'); process.exit(130); }
        if (c === '\u007f' || c === '\b') { value = value.slice(0, -1); continue; }
        value += c;
      }
    };
    stdin.on('data', onData);
  });
}

async function getPassword() {
  // For automated tests only. Normal use: type it at the prompt.
  if (process.env.UMRAH_PASSWORD) return process.env.UMRAH_PASSWORD;
  const pw = await askHidden('Site password: ');
  if (pw.length < 12) {
    console.error('\nPlease use at least 12 characters. A few random words works well, e.g. olive-minaret-copper-sunrise\n');
    process.exit(1);
  }
  const again = await askHidden('Type it again: ');
  if (pw !== again) {
    console.error('\nThe two passwords did not match. Nothing was changed.\n');
    process.exit(1);
  }
  return pw;
}

const data = readJson(join(PRIVATE, 'data.json'));
const tr = existsSync(join(PRIVATE, 'data.tr.json')) ? readJson(join(PRIVATE, 'data.tr.json')) : {};
delete tr._about;
const photos = loadPhotos();

const missing = missingTranslations(data, tr);
if (missing.length) {
  console.log(`\nNote: ${missing.length} text(s) have no Turkish yet and will show in English.`);
  console.log('Add them to private/data.tr.json if you want them translated:');
  for (const m of missing) console.log(`  "${m}": "",`);
}

const password = await getPassword();
const salt = randomBytes(16);
const iv = randomBytes(12);
const key = pbkdf2Sync(password.normalize('NFC'), salt, ITERATIONS, 32, 'sha256');
const cipher = createCipheriv('aes-256-gcm', key, iv);
const plaintext = Buffer.from(JSON.stringify({ data, tr, photos }), 'utf8');
// Web Crypto expects the 16-byte GCM tag appended to the ciphertext.
const ct = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);

writeFileSync(OUT, JSON.stringify({
  v: 1,
  kdf: 'PBKDF2-SHA256',
  iterations: ITERATIONS,
  cipher: 'AES-256-GCM',
  salt: salt.toString('base64'),
  iv: iv.toString('base64'),
  data: ct.toString('base64'),
}) + '\n');

const photoCount = Object.keys(photos).length;
console.log(`\nEncrypted ${data.people.length} people${photoCount ? ` and ${photoCount} photo(s)` : ''} into docs/data.enc.json`);

if (!checkPublished(data)) process.exit(1);
