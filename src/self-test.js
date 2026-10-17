import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import sharp from 'sharp';

export class VisionSelfTest {
  constructor({ now = Date.now } = {}) { this.challenges = new Map(); this.now = now; }
  async create() {
    for (const [key, value] of this.challenges) if (value.expires <= this.now()) this.challenges.delete(key);
    if (this.challenges.size >= 20) this.challenges.delete(this.challenges.keys().next().value);
    const code = String(randomInt(100000, 1000000));
    const id = randomBytes(12).toString('hex');
    // Convert plain, easily read digits to PNG. No SVG text, filename, or
    // answer is included in the model-visible metadata.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="540" height="190"><rect width="540" height="190" fill="white"/><text x="270" y="130" text-anchor="middle" font-family="DejaVu Sans Mono,monospace" font-weight="bold" font-size="94" letter-spacing="8" fill="#111827">${code}</text></svg>`;
    const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
    this.challenges.set(id, { code, expires: this.now() + 600000, attempts: 0 });
    return { id, image: { buffer, mimeType: 'image/png', width: 540, height: 190 } };
  }
  check(id, answer) {
    const challenge = this.challenges.get(id);
    if (!challenge || challenge.expires <= this.now()) {
      this.challenges.delete(id);
      return { passed: false, message: 'Challenge expired. Call vision_self_test again.' };
    }
    challenge.attempts++;
    const passed = /^\d{6}$/.test(answer) && timingSafeEqual(Buffer.from(answer), Buffer.from(challenge.code));
    if (passed || challenge.attempts >= 3) this.challenges.delete(id);
    return { passed, message: passed
      ? 'Correct: this client could read the pixels in an MCP tool image. This checks image delivery, not perfect visual judgment.'
      : 'Incorrect. If you cannot see the image, say so; do not claim visual verification. Retry or create a fresh test.' };
  }
}
