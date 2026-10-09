import type { NextConfig } from 'next';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// web and worker share one env file at the repo root.
const rootEnv = resolve(process.cwd(), '../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // `next build`/`next start` run with NODE_ENV=production; a separate dir lets a local build run
  // while `next dev` is up without corrupting its output. Vercel expects the default `.next`.
  distDir: process.env.NODE_ENV === 'production' && !process.env.VERCEL ? '.next-prod' : '.next',
};

export default nextConfig;
