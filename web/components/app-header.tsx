import { LogOutIcon } from 'lucide-react';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';

export function AppHeader({ email }: { email: string | null }) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Logo href="/w" />
        <div className="flex items-center gap-1">
          {email && <span className="hidden text-sm text-muted-foreground sm:inline">{email}</span>}
          <ThemeToggle />
          <form action="/auth/signout" method="post">
            <Button variant="ghost" size="icon" type="submit" aria-label="Sign out">
              <LogOutIcon className="size-4" />
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
