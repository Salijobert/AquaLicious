import fs from 'node:fs';
import path from 'node:path';

console.log('=== AQUALICIOUS CI REPO-WIDE STAFF OCCURRENCE AUDIT ===\n');

const dirsToScan = ['backend/src', 'backend/prisma', 'frontend/src', 'docs', 'tests'];

// Explicitly defined exclusions with justification
const exclusions = [
  {
    pattern: /backend[\\\/]prisma[\\\/]migrations/,
    reason: 'Database migration history and safe pre-check abort triggers'
  },
  {
    pattern: /tools[\\\/]/,
    reason: 'Audit, inspection, and migration verification tools'
  },
  {
    pattern: /tests[\\\/]integration\.mjs$/,
    reason: 'Negative test asserting role "Staff" is strictly rejected with 422'
  },
  {
    pattern: /tests[\\\/]clean_urls_and_routing\.mjs$/,
    reason: 'Negative test asserting obsolete "Admin & Staff Portal" is absent'
  }
];

function isExcluded(filePath) {
  for (const ex of exclusions) {
    if (ex.pattern.test(filePath)) return ex.reason;
  }
  return null;
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git' || e.name === '.vite' || e.name === 'screenshots') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

let violations = [];
let excludedFiles = new Map();

for (const d of dirsToScan) {
  const files = walk(d);
  for (const f of files) {
    if (f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.ico') || f.endsWith('.p12') || f.endsWith('.map') || f.endsWith('.toml')) continue;

    const reason = isExcluded(f);
    if (reason) {
      excludedFiles.set(f, reason);
      continue;
    }

    const content = fs.readFileSync(f, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      // Match word "staff" case-insensitively
      if (/\bstaff\b/i.test(line)) {
        violations.push({
          file: f.replace(/\\/g, '/'),
          line: idx + 1,
          text: line.trim()
        });
      }
    });
  }
}

console.log('--- EXCLUDED FILES & REASONS ---');
for (const [f, r] of excludedFiles.entries()) {
  console.log(`[EXCLUDED] ${f.replace(/\\/g, '/')}: ${r}`);
}

console.log('\n--- SCAN RESULTS ---');
if (violations.length === 0) {
  console.log('SUCCESS: 0 unexpected occurrences of "Staff"/"STAFF" in source code!');
} else {
  console.error(`FAILURE: Found ${violations.length} unexpected occurrence(s) of "Staff"/"STAFF":`);
  violations.forEach(v => {
    console.error(`  ${v.file}:${v.line} -> ${v.text}`);
  });
  process.exit(1);
}
