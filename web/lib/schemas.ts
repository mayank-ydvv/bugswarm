import { z } from 'zod';

export const SCHEDULES = ['off', 'hourly', 'nightly'] as const;
export type Schedule = (typeof SCHEDULES)[number];

const optionalUrl = z
  .string()
  .trim()
  .transform((s) => (s === '' ? null : s))
  .pipe(z.url({ protocol: /^https?$/ }).nullable());

export const WorkspaceInput = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
});

export const ProjectInput = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(80),
    repo_url: optionalUrl,
    branch: z
      .string()
      .trim()
      .min(1)
      .max(200)
      // Git ref rules, simplified: no spaces, no "..", no leading "-".
      .regex(/^(?!-)(?!.*\.\.)[\w./-]+$/, 'Invalid branch name')
      .default('main'),
    live_url: optionalUrl,
    start_cmd: z.string().trim().min(1).max(200).default('npm run dev'),
    port: z.coerce.number().int().min(1).max(65535).default(3000),
    schedule: z.enum(SCHEDULES).default('nightly'),
  })
  .refine((p) => p.repo_url !== null || p.live_url !== null, {
    message: 'Add a repo URL, a live URL, or both',
    path: ['repo_url'],
  });
export type ProjectInput = z.infer<typeof ProjectInput>;

export const RunRequest = z.object({
  projectId: z.uuid(),
  full: z.boolean().optional().default(false),
});

export const EmailAuthInput = z.object({
  email: z.email('Enter a valid email'),
  password: z.string().min(8, 'Use at least 8 characters').max(72),
  mode: z.enum(['signin', 'signup']),
});

/** Only allow same-site relative redirects after sign-in. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/w';
  return next;
}
