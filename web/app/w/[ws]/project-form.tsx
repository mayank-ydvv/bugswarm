'use client';

import { useActionState, useState } from 'react';
import { toast } from 'sonner';
import { AiNotice } from '@/components/ai-notice';
import { NextRun } from '@/components/next-run';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SCHEDULE_LABEL } from '@/lib/format';
import { SCHEDULES, type Schedule } from '@/lib/schemas';
import type { ProjectFormState } from './actions';

export type ProjectValues = {
  name: string;
  repo_url: string | null;
  branch: string;
  live_url: string | null;
  start_cmd: string;
  port: number;
  schedule: Schedule;
};

const DEFAULTS: ProjectValues = {
  name: '',
  repo_url: null,
  branch: 'main',
  live_url: null,
  start_cmd: 'npm run dev',
  port: 3000,
  schedule: 'nightly',
};

export function ProjectForm({
  action,
  initial = DEFAULTS,
  submitLabel,
}: {
  action: (prev: ProjectFormState, form: FormData) => Promise<ProjectFormState>;
  initial?: ProjectValues;
  submitLabel: string;
}) {
  // Toast from the action itself: a successful save remounts the settings form (see its key).
  const [state, formAction, pending] = useActionState(
    async (prev: ProjectFormState, form: FormData) => {
      const result = await action(prev, form);
      if (result.ok) toast.success('Project saved');
      return result;
    },
    {},
  );
  const [schedule, setSchedule] = useState<Schedule>(initial.schedule);

  return (
    <form action={formAction} className="grid gap-4">
      <Field id="name" label="Name">
        <Input id="name" name="name" defaultValue={initial.name} maxLength={80} required placeholder="My app" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
        <Field id="repo_url" label="GitHub repo URL" hint="Public HTTPS clone URL">
          <Input
            id="repo_url"
            name="repo_url"
            type="url"
            defaultValue={initial.repo_url ?? ''}
            placeholder="https://github.com/acme/app"
          />
        </Field>
        <Field id="branch" label="Branch">
          <Input id="branch" name="branch" defaultValue={initial.branch} />
        </Field>
      </div>
      <Field id="live_url" label="Live URL" hint="Optional. Tested instead of starting the app in a sandbox.">
        <Input
          id="live_url"
          name="live_url"
          type="url"
          defaultValue={initial.live_url ?? ''}
          placeholder="https://staging.acme.com"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <Field id="start_cmd" label="Start command">
          <Input id="start_cmd" name="start_cmd" defaultValue={initial.start_cmd} className="font-mono" />
        </Field>
        <Field id="port" label="Port">
          <Input id="port" name="port" type="number" min={1} max={65535} defaultValue={initial.port} />
        </Field>
      </div>
      <Field id="schedule" label="Schedule">
        <Select name="schedule" value={schedule} onValueChange={(v) => setSchedule(v as Schedule)}>
          <SelectTrigger id="schedule" className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SCHEDULES.map((s) => (
              <SelectItem key={s} value={s}>
                {SCHEDULE_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          <NextRun schedule={schedule} />
          {schedule === 'nightly' && ' · full scan'}
          {schedule === 'hourly' && ' · changed files only'}
        </p>
      </Field>
      <AiNotice />
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <div>
        <Button type="submit" disabled={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
