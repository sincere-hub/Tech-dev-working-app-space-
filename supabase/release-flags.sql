begin;

create or replace function public.td_release_is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.employees as e
    where e.id = (select auth.uid()) and e.role = 'admin'
      and (to_jsonb(e)->>'is_banned') is distinct from 'true'
  );
$$;

revoke all on function public.td_release_is_admin() from public, anon, authenticated;
grant execute on function public.td_release_is_admin() to authenticated;

create table if not exists public.td_release_flags (
  key text primary key,
  enabled boolean not null,
  updated_at timestamptz not null default now()
);

insert into public.td_release_flags (key, enabled) values ('testing_workspace', true)
on conflict (key) do nothing;

alter table public.td_release_flags enable row level security;
revoke all on public.td_release_flags from public, anon, authenticated;
grant select, update (enabled) on public.td_release_flags to authenticated;

drop policy if exists td_release_admin_read on public.td_release_flags;
create policy td_release_admin_read on public.td_release_flags for select to authenticated
  using ((select public.td_release_is_admin()));

drop policy if exists td_release_admin_update on public.td_release_flags;
create policy td_release_admin_update on public.td_release_flags for update to authenticated
  using ((select public.td_release_is_admin()))
  with check ((select public.td_release_is_admin()));

create or replace function public.td_release_flag_stamp()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists td_release_flag_stamp on public.td_release_flags;
create trigger td_release_flag_stamp before update of enabled on public.td_release_flags
  for each row when (old.enabled is distinct from new.enabled)
  execute function public.td_release_flag_stamp();

commit;