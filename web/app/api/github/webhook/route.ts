import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { branchFromRef, repoUrlVariants, verifySignature } from '@/lib/github';
import { createAdminClient } from '@/lib/supabase/admin';

const PushEvent = z.object({
  ref: z.string(),
  deleted: z.boolean().optional(),
  repository: z.object({ clone_url: z.string().url(), html_url: z.string().url() }),
});

/**
 * GitHub push webhook: re-scan every project that tracks the pushed repo + branch. There is no user
 * session here, so the HMAC signature is the authentication and the service-role client starts runs.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verifySignature(process.env.GH_WEBHOOK_SECRET ?? '', raw, request.headers.get('x-hub-signature-256'))) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  const event = request.headers.get('x-github-event');
  if (event === 'ping') return NextResponse.json({ ok: true });
  if (event !== 'push') return NextResponse.json({ ignored: event }, { status: 202 });

  let payload: z.infer<typeof PushEvent>;
  try {
    payload = PushEvent.parse(JSON.parse(raw));
  } catch {
    return NextResponse.json({ error: 'invalid push payload' }, { status: 400 });
  }
  const branch = branchFromRef(payload.ref);
  if (!branch || payload.deleted) return NextResponse.json({ ignored: 'not a branch push' }, { status: 202 });

  const admin = createAdminClient();
  // Served by projects_repo_idx (repo_url, branch).
  const { data: projects, error } = await admin
    .from('projects')
    .select('id')
    .in('repo_url', repoUrlVariants(payload.repository.clone_url, payload.repository.html_url))
    .eq('branch', branch);
  if (error) return NextResponse.json({ error: 'lookup failed' }, { status: 500 });

  const runs = await Promise.all(
    projects.map(async (p) => {
      const { data } = await admin.rpc('start_run', { p: p.id, trig: 'push', full: false });
      return data;
    }),
  );
  return NextResponse.json({ projects: projects.length, runs: runs.filter((r) => r !== null) });
}
