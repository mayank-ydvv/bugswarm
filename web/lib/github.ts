import { createHmac, timingSafeEqual } from 'node:crypto';

/** Verify GitHub's `x-hub-signature-256` header (HMAC-SHA256 of the raw body). */
export function verifySignature(secret: string, rawBody: string, header: string | null): boolean {
  if (!secret || !header?.startsWith('sha256=')) return false;
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`);
  const actual = Buffer.from(header);
  // timingSafeEqual throws on different lengths, so compare lengths first.
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** The repo URL spellings a project might have been saved with. */
export function repoUrlVariants(cloneUrl: string, htmlUrl: string): string[] {
  const base = htmlUrl.replace(/\/+$/, '');
  return [...new Set([cloneUrl, htmlUrl, base, `${base}.git`, `${base}/`])];
}

export function branchFromRef(ref: string): string | null {
  return ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : null;
}
