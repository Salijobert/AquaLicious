import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function assertTestDatabase() {
  // If DATABASE_URL is not set, load tests/.env.test ONLY
  if (!process.env.DATABASE_URL) {
    const testEnvPath = path.resolve(__dirname, '.env.test');
    if (fs.existsSync(testEnvPath)) {
      const content = fs.readFileSync(testEnvPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          let val = match[2].trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }

  const dbUrl = process.env.DATABASE_URL || '';
  if (!dbUrl) {
    console.error('FATAL SAFETY GUARD: DATABASE_URL is not set. Tests must explicitly point to a test database.');
    process.exit(1);
  }

  let dbName = '';
  try {
    const parsed = new URL(dbUrl.replace(/^postgresql:\/\//, 'http://'));
    dbName = parsed.pathname.replace(/^\//, '').toLowerCase();
  } catch (e) {
    dbName = dbUrl.toLowerCase();
  }

  if (!dbName.includes('test') && !dbName.includes('qa')) {
    console.error(`FATAL SAFETY GUARD: DATABASE_URL database '${dbName}' is NOT a test or qa database! Refusing to run tests against live/production database.`);
    process.exit(1);
  }
}

// Automatically enforce whenever imported
assertTestDatabase();
