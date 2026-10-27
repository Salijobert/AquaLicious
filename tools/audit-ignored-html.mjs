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

const audit = [];

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
    ) continue;

    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, idx) => {
      // Find any occurrences of .html
      const regex = /['"`]([^'"`]*\.html(\?[^'"`]*)?)['"`]/gi;
      let match;
      while ((match = regex.exec(line)) !== null) {
        const raw = match[1];
        let reason = 'UNKNOWN / UNEXCLUDED (POTENTIAL VIOLATION)';
        let excluded = false;

        if (file.endsWith('wide-html-check.mjs') || file.endsWith('clean_urls_and_routing.mjs') || file.endsWith('playwright_real_behavior.mjs') || file.endsWith('security_and_verification.mjs') || file.endsWith('audit-ignored-html.mjs')) {
          reason = 'Test suite or verification script defining legacy URLs to assert redirection/rejection';
          excluded = true;
        } else if (file.endsWith('vercel.json')) {
          reason = 'vercel.json server-side 301 redirect source mapping (legacy URL -> clean URL)';
          excluded = true;
        } else if (file.endsWith('App.tsx') && line.includes('<Route path="') && line.includes('<Navigate to=')) {
          reason = 'App.tsx client-side fallback alias map (<Route path="/...html" element={<Navigate to=... replace />} />)';
          excluded = true;
        } else if (file.endsWith('App.tsx') && line.includes('isHomePage')) {
          reason = 'App.tsx isHomePage check matching legacy /index.html';
          excluded = true;
        } else if ((file.includes('dist') || file.includes('www')) && line.includes('element:') && line.includes('path:')) {
          reason = 'Built dist/www bundle compiled representation of App.tsx client-side fallback alias map';
          excluded = true;
        } else if ((file.includes('dist') || file.includes('www')) && line.includes('isHomePage')) {
          reason = 'Built dist/www bundle compiled representation of App.tsx isHomePage check';
          excluded = true;
        } else if (raw === '/index.html' || raw === 'index.html' || raw.endsWith('/index.html')) {
          reason = 'Root SPA entry point (index.html allowed by specification)';
          excluded = true;
        } else if ((raw.startsWith('http://') || raw.startsWith('https://')) && !raw.includes('aqualicious') && !raw.includes('localhost')) {
          reason = 'Third-party vendor documentation link (e.g. React runtime error decoder https://reactjs.org/docs/error-decoder.html)';
          excluded = true;
        } else if (raw.toLowerCase().includes('doctype') || raw === 'html') {
          reason = 'HTML doctype / markup tag';
          excluded = true;
        }

        audit.push({
          file: file.replace(/\\/g, '/'),
          line: idx + 1,
          match: raw,
          excluded,
          reason,
          context: line.trim().slice(0, 140)
        });
      }
    });
  }
}

fs.writeFileSync('tools/audit_results.json', JSON.stringify(audit, null, 2), 'utf8');

const unexcluded = audit.filter(a => !a.excluded);
console.log('Total .html matches found:', audit.length);
console.log('Unexcluded (violations):', unexcluded.length);

const byReason = {};
for (const a of audit) {
  byReason[a.reason] = (byReason[a.reason] || 0) + 1;
}
console.log('\nBreakdown by reason:');
console.log(JSON.stringify(byReason, null, 2));

const byFile = {};
for (const a of audit) {
  byFile[a.file] = (byFile[a.file] || 0) + 1;
}
console.log('\nMatches by file:');
console.log(JSON.stringify(byFile, null, 2));
