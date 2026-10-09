'use client';

import { PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { createProject } from './actions';
import { ProjectForm } from './project-form';

export function AddProjectDialog({ workspaceId }: { workspaceId: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon className="size-4" />
          Add project
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add project</DialogTitle>
          <DialogDescription>A GitHub repo, a live URL, or both.</DialogDescription>
        </DialogHeader>
        <ProjectForm action={createProject.bind(null, workspaceId)} submitLabel="Add project" />
      </DialogContent>
    </Dialog>
  );
}
