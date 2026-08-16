-- Inside the dh_worlds subquery, an unqualified `name` resolves to the world
-- title instead of the outer storage object path. Qualify the outer column so
-- owners can upload assets belonging to an existing world.
drop policy if exists dh_assets_owner_insert on storage.objects;
create policy dh_assets_owner_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'world-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
    and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false
    and exists (
      select 1 from public.dh_worlds world
      where world.owner_id = auth.uid()
        and world.id = (storage.foldername(storage.objects.name))[2]
    )
  );

drop policy if exists dh_assets_owner_update on storage.objects;
create policy dh_assets_owner_update on storage.objects for update to authenticated
  using (
    bucket_id = 'world-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
    and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false
  )
  with check (
    bucket_id = 'world-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
    and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false
    and exists (
      select 1 from public.dh_worlds world
      where world.owner_id = auth.uid()
        and world.id = (storage.foldername(storage.objects.name))[2]
    )
  );
