-- Owners could delete their own membership row, leaving a workspace without an owner.
-- Owners may remove other members only; the owner row goes away only with the workspace itself.
drop policy members_delete on public.workspace_members;
create policy members_delete on public.workspace_members for delete to authenticated
  using (private.is_owner(workspace_id) and role <> 'owner');
