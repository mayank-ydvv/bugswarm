import { AppHeader } from '@/components/app-header';
import { requireUser } from '@/lib/server/auth';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { email } = await requireUser();
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader email={email} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
