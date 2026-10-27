import fs from 'node:fs';
import path from 'node:path';

const targets = [
  'frontend/src',
  'frontend/dist',
  'mobile/www',
  'backend/src',
  'frontend/public',
  'tests'
];

function walk(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    if (fs.statSync(full).isDirectory()) results.push(...walk(full));
    else results.push(full);
  }
  return results;
}

let violations = [];
let scannedFiles = 0;

for (const target of targets) {
  const files = walk(target);
  for (const file of files) {
    if (
      file.endsWith('.png') ||
      file.endsWith('.jpg') ||
      file.endsWith('.ico') ||
      file.endsWith('.p12') ||
      file.endsWith('.dpapi') ||
      file.endsWith('.map')
    ) {
      continue;
    }
    scannedFiles++;
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      // 1. Exclude this check script and test suites explicitly asserting legacy URLs
      if (
        file.endsWith('wide-html-check.mjs') ||
        file.endsWith('clean_urls_and_routing.mjs') ||
        file.endsWith('playwright_real_behavior.mjs') ||
        file.endsWith('security_and_verification.mjs')
      ) return;
      // 2. Exclude vercel.json server redirect source mapping
      if (file.endsWith('vercel.json')) return;
      // 3. Exclude App.tsx legacy alias routes: <Route path="/...html" element={<Navigate to=...
      if (file.endsWith('App.tsx') && line.includes('<Route path="') && line.includes('<Navigate to=')) return;
      if (file.endsWith('App.tsx') && line.includes('isHomePage')) return;
      // 4. In built bundles (dist and www), legacy alias routes compiled: e.g. path:"/dashboard.html",element:
      if ((file.includes('dist') || file.includes('www')) && line.includes('element:') && line.includes('path:')) return;
      if ((file.includes('dist') || file.includes('www')) && line.includes('isHomePage')) return;

      // Match any .html string
      const matches = line.match(/['"`]([^'"`]*\.html(\?[^'"`]*)?)['"`]/gi);
      if (matches) {
        for (const m of matches) {
          const raw = m.slice(1, -1);
          // Allow index.html (the SPA entry point)
          if (raw === '/index.html' || raw === 'index.html' || raw.endsWith('/index.html')) continue;
          // Allow external third-party vendor links (e.g., React runtime error decoder)
          if ((raw.startsWith('http://') || raw.startsWith('https://')) && !raw.includes('aqualicious') && !raw.includes('localhost')) {
            continue;
          }
          // Allow DOCTYPE or HTML tags
          if (raw.toLowerCase().includes('doctype') || raw === 'html') continue;
          violations.push({ file, line: idx + 1, match: raw, text: line.trim().slice(0, 120) });
        }
      }
    });
  }
}

console.log(`Scanned ${scannedFiles} files across:`);
targets.forEach((t) => console.log(`  - ${t}`));

if (violations.length === 0) {
  console.log('\nSUCCESS: 0 illegal .html links found across entire codebase and build outputs!');
  process.exit(0);
} else {
  console.error(`\nFAILURE: Found ${violations.length} illegal .html links:`);
  violations.forEach((v) => {
    console.error(`  ${v.file}:${v.line} -> ${v.match}`);
    console.error(`     Context: ${v.text}`);
  });
  process.exit(1);
}
