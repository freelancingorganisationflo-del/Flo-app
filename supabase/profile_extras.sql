-- ============================================================================
-- FLO — Profile extras migration
-- Run this in Supabase SQL Editor to enable bio, social links, and avatars.
-- Safe to re-run (all statements are idempotent).
-- ============================================================================

-- Extended profile columns
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio       text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS instagram text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS linkedin  text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS github    text;

-- ============================================================================
-- Avatars storage bucket
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Members can upload their own avatar (any path — simpler than folder-scoping)
DROP POLICY IF EXISTS "avatars_insert" ON storage.objects;
CREATE POLICY "avatars_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid() IS NOT NULL);

-- Any signed-in user can read avatars (they're public profile pictures)
DROP POLICY IF EXISTS "avatars_select" ON storage.objects;
CREATE POLICY "avatars_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars' AND auth.uid() IS NOT NULL);

-- Members can overwrite / delete their own avatar
DROP POLICY IF EXISTS "avatars_update" ON storage.objects;
CREATE POLICY "avatars_update" ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars_delete" ON storage.objects;
CREATE POLICY "avatars_delete" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
