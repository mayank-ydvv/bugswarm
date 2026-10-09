'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { acceptInvite } from './actions';

export function AcceptButton({ token }: { token: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await acceptInvite(token);
          if (res?.error) toast.error(res.error);
        })
      }
    >
      Join workspace
    </Button>
  );
}
