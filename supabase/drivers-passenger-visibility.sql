-- Narrow who can read the drivers table.
--
-- Before: ANY signed-in account could SELECT every approved driver, including
-- phone, email, licence/ID/police-clearance links, push token and live location.
-- After:  a signed-in passenger can read only the drivers assigned to THEIR OWN
-- bookings, vista_rides or pilgrim_packages. Admins (is_admin) and drivers (own
-- row) are unaffected, and every existing app query keeps working unchanged.
--
-- The check lives in a SECURITY DEFINER function so the drivers policy does not
-- recurse into the RLS policies of the trip tables.
--
-- Rollback (restores the old broad rule):
--   drop policy "Passengers can see their own drivers" on public.drivers;
--   create policy "Authenticated users can see approved drivers" on public.drivers
--     for select to public
--     using (auth.role() = 'authenticated' and status = 'approved');

create or replace function public.is_my_driver(did uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.bookings         b where b.driver_id = did and b.customer_id = auth.uid())
      or exists (select 1 from public.vista_rides      r where r.driver_id = did and r.customer_id = auth.uid())
      or exists (select 1 from public.pilgrim_packages p where p.driver_id = did and p.customer_id = auth.uid());
$$;

revoke all on function public.is_my_driver(uuid) from public, anon;
grant execute on function public.is_my_driver(uuid) to authenticated;

drop policy "Authenticated users can see approved drivers" on public.drivers;

create policy "Passengers can see their own drivers" on public.drivers
  for select to authenticated
  using (public.is_my_driver(id));

-- The customer web app's home screen shows "N drivers online" using a head-count
-- on drivers. That count would now only see the passenger's own drivers, so give
-- it a dedicated function that returns just the number.
create or replace function public.online_driver_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.drivers where is_online and status = 'approved';
$$;

revoke all on function public.online_driver_count() from public;
grant execute on function public.online_driver_count() to anon, authenticated;
