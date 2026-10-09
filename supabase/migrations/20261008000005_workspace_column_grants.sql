-- Owners may rename a workspace, but gemini_secret_id is only set through set_workspace_gemini_key.
-- Otherwise an owner could point it at another workspace's Vault secret and spend that key.
revoke update on public.workspaces from authenticated;
grant update (name) on public.workspaces to authenticated;
