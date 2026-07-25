-- ============================================================================
-- FLO — Storage buckets + RLS
-- Run after schema.sql. Creates the two buckets the app uses and locks down
-- who can read/write objects in each.
-- ============================================================================

insert into storage.buckets (id, name, public)
values
  ('assignment-submissions', 'assignment-submissions', true),
  ('module-notes', 'module-notes', true)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- assignment-submissions
-- Upload path convention used by the app: {member_id}/{assignment_id}/{file}
-- Members may only write inside their own folder; admins can read everything.
-- ----------------------------------------------------------------------------
drop policy if exists "submissions_bucket_insert" on storage.objects;
create policy "submissions_bucket_insert" on storage.objects for insert
  with check (
    bucket_id = 'assignment-submissions'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "submissions_bucket_select" on storage.objects;
create policy "submissions_bucket_select" on storage.objects for select
  using (
    bucket_id = 'assignment-submissions'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or is_admin()
    )
  );

-- ----------------------------------------------------------------------------
-- module-notes — admin-uploaded PDFs/attachments; any signed-in user can read
-- (fine-grained per-module gating already happens at the `notes` table level;
-- this just controls raw file access once a member has the note's file_url).
-- ----------------------------------------------------------------------------
drop policy if exists "notes_bucket_write" on storage.objects;
create policy "notes_bucket_write" on storage.objects for all
  using (bucket_id = 'module-notes' and is_admin())
  with check (bucket_id = 'module-notes' and is_admin());

drop policy if exists "notes_bucket_select" on storage.objects;
create policy "notes_bucket_select" on storage.objects for select
  using (bucket_id = 'module-notes' and auth.uid() is not null);
