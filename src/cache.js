import { randomBytes } from 'node:crypto';

export class CandidateCache {
  constructor({ maxEntries = 160, maxBytes = 32 * 1024 * 1024, ttlMs = 1800000, now = Date.now } = {}) {
    this.entries = new Map();
    this.maxEntries = maxEntries;
    this.maxBytes = maxBytes;
    this.ttlMs = ttlMs;
    this.now = now;
    this.bytes = 0;
  }
  remove(id) {
    const entry = this.entries.get(id);
    if (entry) { this.bytes -= entry.preview.buffer.length; this.entries.delete(id); }
  }
  prune() {
    for (const [id, entry] of this.entries) if (entry.expires <= this.now()) this.remove(id);
  }
  add(candidate) {
    this.prune();
    const size = candidate.preview.buffer.length;
    if (size > this.maxBytes) throw new Error('Image exceeds cache capacity.');
    while (this.entries.size >= this.maxEntries || this.bytes + size > this.maxBytes) this.remove(this.entries.keys().next().value);
    const id = randomBytes(12).toString('hex');
    this.entries.set(id, { ...candidate, expires: this.now() + this.ttlMs });
    this.bytes += size;
    return id;
  }
  get(id) {
    this.prune();
    const candidate = this.entries.get(id);
    if (!candidate) throw new Error('Candidate expired or is unknown. Search again; candidates last up to 30 minutes and are cleared on restart.');
    return candidate;
  }
}
