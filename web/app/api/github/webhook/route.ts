import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { branchFromRef, repoUrlVariants, verifySignature } from '@/lib/github';
import { createAdminClient } from '@/lib/supabase/admin';

const PushEvent = z.object({
  ref: z.string().optional(),
  deleted: z.boolean().optional(),
  repository: z.object({ clone_url: z.string().url(), html_url: z.string().url() }),
});

const unauthorized = () => NextResponse.json({ error: 'invalid signature' }, { status: 401 });

/**
 * GitHub push webhook: re-scan every project that tracks the pushed repo + branch. There is no user
 * session, so the HMAC signature is the authentication. Each project has its own secret; a push
 * starts runs only for the projects whose secret signed it. GH_WEBHOOK_SECRET, when set, is an
 * operator-wide secret that matches every project (kept for webhooks created before per-project ones).
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  const signature = request.headers.get('x-hub-signature-256');
  if (!signature) return unauthorized();

  // The body is untrusted until a signature matches: it is only used to find the candidate projects.
  let payload: z.infer<typeof PushEvent>;
  try {
    payload = PushEvent.parse(JSON.parse(raw));
  } catch {
    return unauthorized();
  }

  const admin = createAdminClient();
  // Served by projects_repo_idx (repo_url, branch).
  const { data: candidates, error } = await admin
    .from('projects')
    .select('id, branch, webhook_secret')
    .in('repo_url', repoUrlVariants(payload.repository.clone_url, payload.repository.html_url));
  if (error) return NextResponse.json({ error: 'lookup failed' }, { status: 500 });

  const global = process.env.GH_WEBHOOK_SECRET ?? '';
  const globalOk = verifySignature(global, raw, signature);
  const signed = candidates.filter((p) => globalOk || verifySignature(p.webhook_secret, raw, signature));
  // Same answer whether the repo is unknown or the secret is wrong, so callers learn nothing.
  if (signed.length === 0 && !globalOk) return unauthorized();

  const event = request.headers.get('x-github-event');
  if (event === 'ping') return NextResponse.json({ ok: true });
  if (event !== 'push') return NextResponse.json({ ignored: event }, { status: 202 });

  const branch = payload.ref ? branchFromRef(payload.ref) : null;
  if (!branch || payload.deleted) return NextResponse.json({ ignored: 'not a branch push' }, { status: 202 });

  const targets = signed.filter((p) => p.branch === branch);
  const runs = await Promise.all(
    targets.map(async (p) => {
      const { data } = await admin.rpc('start_run', { p: p.id, trig: 'push', full: false });
      return data;
    }),
  );
  return NextResponse.json({ projects: targets.length, runs: runs.filter((r) => r !== null) });
}
