import { cp, rm, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'frontend/dist');
const dest = path.join(root, 'mobile/www');

// Clean and sync dist into mobile/www (excluding heavy downloadable artifacts)
await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });
await cp(src, dest, {
  recursive: true,
  filter: (source) => {
    const base = path.basename(source);
    return base !== 'deliverables' && base !== 'updates' && base !== 'update-manifest.json';
  }
});

console.log('Synchronized React production bundle to mobile/www for Capacitor packaging.');
