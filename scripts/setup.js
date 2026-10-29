import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const content = `# Keep this file private. Do not upload it to GitHub.\nMCP_SECRET=${randomBytes(48).toString('base64url')}\nSEARCH_PROVIDER=serper\nSERPER_API_KEY=\nGOOGLE_MODE=html\nGOOGLE_API_KEY=\nGOOGLE_CSE_ID=\nBRAVE_API_KEY=\nPORT=9000\nPUBLIC_BASE_URL=\n`;
try {
  await writeFile(new URL('../.env', import.meta.url), content, { flag: 'wx', mode: 0o600 });
  console.log('Created .env with a random server secret.');
  console.log('Add your SERPER_API_KEY to .env for Google Images without direct Google CAPTCHA handling.');
  console.log('Run npm start, then open http://localhost:9000.');
} catch (error) {
  if (error.code === 'EEXIST') console.log('.env already exists; it was left unchanged.');
  else throw error;
}
