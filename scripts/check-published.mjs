#!/usr/bin/env node
// Makes sure nothing readable from private/data.json ended up in docs/ (the published folder).
//   npm run check

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');

function filesIn(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? filesIn(p) : [p];
  });
}

// Values that must never appear in published files.
function secretsOf(data) {
  const out = new Set();
  for (const p of data.people) {
    out.add(p.passport?.number);
    out.add(p.passport?.dateOfBirth);
    out.add(p.visa?.visaNumber);
    out.add(p.visa?.applicationNumber);
    out.add(p.flights?.booking);
    out.add(p.flights?.eTicket);
    out.add(p.train?.booking);
    out.add(p.train?.ticketNumber);
    for (const h of p.hotels || []) out.add(h.booking);
    out.add(p.name);
  }
  return [...out].filter((s) => typeof s === 'string' && s.length >= 6);
}

export function checkPublished(data) {
  const secrets = secretsOf(data);
  const leaks = [];
  for (const file of filesIn(DOCS)) {
    if (file.includes(`${join('docs', 'vendor')}`)) continue;
    const text = readFileSync(file, 'latin1') + readFileSync(file, 'utf8');
    for (const s of secrets) if (text.includes(s)) leaks.push(`${relative(ROOT, file)}: ${s.slice(0, 3)}…`);
  }
  if (leaks.length) {
    console.error('\nSTOP: readable private data found in the published folder:');
    for (const l of leaks) console.error('  ' + l);
    return false;
  }
  console.log(`Checked docs/: none of ${secrets.length} private values (passport numbers, bookings, names…) are readable.`);
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const data = JSON.parse(readFileSync(join(ROOT, 'private', 'data.json'), 'utf8'));
  process.exit(checkPublished(data) ? 0 : 1);
}
