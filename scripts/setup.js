import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const content = `# Keep this file private. Do not upload it to GitHub.\nMCP_SECRET=${randomBytes(48).toString('base64url')}\nSEARCH_PROVIDER=wikimedia\nBRAVE_API_KEY=\nPORT=9000\nPUBLIC_BASE_URL=\n`;
try {
  await writeFile(new URL('../.env', import.meta.url), content, { flag: 'wx', mode: 0o600 });
  console.log('Created .env with a random server secret.');
  console.log('Ready for key-free Wikimedia Commons search. For broad web image search, set SEARCH_PROVIDER=brave and add BRAVE_API_KEY in .env.');
  console.log('Run npm start, then open http://localhost:9000.');
} catch (error) {
  if (error.code === 'EEXIST') console.log('.env already exists; it was left unchanged.');
  else throw error;
}
