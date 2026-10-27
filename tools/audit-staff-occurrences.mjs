import fs from 'node:fs';
import path from 'node:path';

const dirs = ['backend/src', 'backend/prisma', 'frontend/src', 'tests', 'docs', 'tools'];
const results = {};

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

for (const d of dirs) {
  const files = walk(d);
  for (const f of files) {
    if (
      f.endsWith('.png') ||
      f.endsWith('.jpg') ||
      f.endsWith('.ico') ||
      f.endsWith('.p12') ||
      f.endsWith('.map') ||
      f.endsWith('audit-staff-occurrences.mjs')
    ) continue;
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    lines.forEach((l, idx) => {
      if (/\bstaff\b/i.test(l)) {
        const normalized = f.replace(/\\/g, '/');
        if (!results[normalized]) results[normalized] = [];
        results[normalized].push({ line: idx + 1, text: l.trim() });
      }
    });
  }
}

fs.writeFileSync('tools/staff_occurrences.json', JSON.stringify(results, null, 2));

console.log('Total files containing Staff/STAFF:', Object.keys(results).length);
for (const [f, matches] of Object.entries(results)) {
  console.log(`\nFile: ${f} (${matches.length} matches)`);
  matches.forEach(m => console.log(`  L${m.line}: ${m.text}`));
}
