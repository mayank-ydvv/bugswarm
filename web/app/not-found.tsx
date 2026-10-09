import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-lg font-semibold">Not found</p>
        <p className="text-sm text-muted-foreground">It doesn&apos;t exist, or you don&apos;t have access.</p>
        <Button asChild variant="outline">
          <Link href="/w">Back to workspaces</Link>
        </Button>
      </div>
    </div>
  );
}
