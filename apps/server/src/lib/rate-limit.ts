type Window = { timestamps: number[] };

const windows = new Map<string, Window>();

const CREATE_LIMIT = 10;
const CREATE_WINDOW_MS = 60 * 60 * 1000;
const VOTE_LIMIT = 8;
const VOTE_WINDOW_MS = 10_000;

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  let bucket = windows.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    windows.set(key, bucket);
  }
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);
  if (bucket.timestamps.length >= limit) return false;
  bucket.timestamps.push(now);
  return true;
}

export function allowCreate(ip: string): boolean {
  return rateLimit(`create:${ip}`, CREATE_LIMIT, CREATE_WINDOW_MS);
}

export function allowVote(id: string): boolean {
  return rateLimit(`vote:${id}`, VOTE_LIMIT, VOTE_WINDOW_MS);
}
