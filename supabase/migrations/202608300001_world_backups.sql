insert into storage.buckets(id, name, public, file_size_limit)
values ('world-backups', 'world-backups', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists dh_world_backups_owner_select on storage.objects;
create policy dh_world_backups_owner_select on storage.objects for select to authenticated
  using (
    bucket_id = 'world-backups'
    and (storage.foldername(name))[1] = auth.uid()::text
    and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false
  );

drop policy if exists dh_world_backups_owner_insert on storage.objects;
create policy dh_world_backups_owner_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'world-backups'
    and (storage.foldername(name))[1] = auth.uid()::text
    and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false
  );

drop policy if exists dh_world_backups_owner_update on storage.objects;
create policy dh_world_backups_owner_update on storage.objects for update to authenticated
  using (
    bucket_id = 'world-backups'
    and (storage.foldername(name))[1] = auth.uid()::text
    and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false
  )
  with check (
    bucket_id = 'world-backups'
    and (storage.foldername(name))[1] = auth.uid()::text
    and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false
  );

drop policy if exists dh_world_backups_owner_delete on storage.objects;
create policy dh_world_backups_owner_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'world-backups'
    and (storage.foldername(name))[1] = auth.uid()::text
    and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false
  );
