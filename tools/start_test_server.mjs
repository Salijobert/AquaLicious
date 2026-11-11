import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testEnvPath = path.resolve(__dirname, '../tests/.env.test');

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
      process.env[key] = val;
    }
  }
}

process.env.PORT = '8090';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/aqualicious_test?schema=public';
process.env.NODE_ENV = 'test';
process.env.ALLOW_LOCAL_AUTH_FALLBACK = 'true';

const { createApp } = await import('../backend/dist/server.js');
const { config } = await import('../backend/dist/config/index.js');
const app = createApp();

app.listen(8090, () => {
  console.log(`AquaLicious Test Server running on port 8090 with test database ${process.env.DATABASE_URL}`);
});
