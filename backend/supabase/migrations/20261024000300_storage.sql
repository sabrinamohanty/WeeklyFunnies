-- Private storage buckets and policies that mirror the table rules.
--
-- - All four buckets are private. The app only ever gets short-lived signed URLs from the API.
-- - Uploads, overwrites, and deletes go through the API (service role), which validates content,
--   strips metadata, and keeps rows and files in sync. No write policies exist for users.
-- - Reads mirror table visibility by looking up the row that owns the object:
--     photos, panels: your own, or a co-member's once the edition is published
--     avatars: approved avatars of yourself and people who share a paper with you
--     selfies: nobody but the service role

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('selfies', 'selfies', false, 12582912, array['image/jpeg', 'image/png']),
  ('avatars', 'avatars', false, 5242880, array['image/png', 'image/jpeg', 'image/webp']),
  ('panels', 'panels', false, 5242880, array['image/png', 'image/jpeg', 'image/webp']),
  ('photos', 'photos', false, 12582912, array['image/jpeg', 'image/png'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy photos_objects_read on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and app.can_read_photo_object(name));

create policy panels_objects_read on storage.objects
  for select to authenticated
  using (bucket_id = 'panels' and app.can_read_panel_object(name));

create policy avatars_objects_read on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and app.can_read_avatar_object(name));
