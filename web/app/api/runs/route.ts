import { NextResponse, type NextRequest } from 'next/server';
import { RunRequest } from '@/lib/schemas';
import { createClient } from '@/lib/supabase/server';

/** Queue a manual run as the signed-in user. start_run enforces membership and dedupes active runs. */
export async function POST(request: NextRequest) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 });
  }
  const parsed = RunRequest.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });

  const { data: runId, error } = await supabase.rpc('start_run', {
    p: parsed.data.projectId,
    trig: 'manual',
    full: parsed.data.full,
  });
  if (error) {
    if (error.code === '42501') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (error.code === 'P0002') return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    return NextResponse.json({ error: 'Could not start a run' }, { status: 500 });
  }
  return NextResponse.json({ runId });
}
