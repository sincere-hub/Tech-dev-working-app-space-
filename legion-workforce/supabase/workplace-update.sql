-- Standalone update for an existing Legion database. New installs use schema.sql,
-- which also includes this update. Safe to run again.
begin;
create table if not exists public.workplace_interactions (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.workplace_records(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  kind text not null check (kind in ('comment', 'rating', 'completion')),
  body text not null default '' check (char_length(body) <= 2000),
  value integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'rating' and value is not null and value between 1 and 5) or (kind <> 'rating' and value is null)),
  check (kind <> 'comment' or char_length(trim(body)) > 0)
);
create index if not exists workplace_interactions_record_idx on public.workplace_interactions(record_id, created_at);
create unique index if not exists workplace_interactions_one_response_idx
  on public.workplace_interactions(record_id, employee_id, kind) where kind <> 'comment';
alter table public.workplace_interactions enable row level security;
drop policy if exists "Visible discussions and personal responses" on public.workplace_interactions;
create policy "Visible discussions and personal responses" on public.workplace_interactions
  for select to authenticated using (
    exists (select 1 from public.workplace_records r where r.id = record_id)
    and (kind = 'comment' or employee_id = (select auth.uid()) or public.current_employee_role() in ('manager', 'admin'))
  );
revoke all on public.workplace_interactions from anon, authenticated;
grant select on public.workplace_interactions to authenticated;

create or replace function public.submit_workplace_interaction(p_record_id uuid, p_kind text, p_body text default '', p_value integer default null)
returns public.workplace_interactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role text := public.current_employee_role();
  target public.workplace_records;
  result public.workplace_interactions;
begin
  if actor_id is null or actor_role is null then raise exception 'Employee sign-in required'; end if;
  select * into target from public.workplace_records where id = p_record_id;
  if target.id is null or not (target.visibility = 'company' or target.created_by = actor_id or actor_role in ('manager', 'admin')) then
    raise exception 'Record unavailable';
  end if;
  if target.status in ('archived', 'done', 'rejected') then raise exception 'This record is closed'; end if;
  if p_kind is null or p_kind not in ('comment', 'rating', 'completion') then raise exception 'Invalid response type'; end if;
  if char_length(coalesce(p_body, '')) > 2000 then raise exception 'Response is too long'; end if;
  if p_kind = 'comment' then
    if char_length(trim(coalesce(p_body, ''))) = 0 then raise exception 'Reply cannot be empty'; end if;
    insert into public.workplace_interactions(record_id, employee_id, kind, body)
      values(p_record_id, actor_id, p_kind, trim(p_body)) returning * into result;
  else
    if p_kind = 'rating' and (target.module_id <> 'culture.surveys' or p_value is null or p_value not between 1 and 5) then
      raise exception 'Select a survey rating from 1 to 5';
    end if;
    if p_kind = 'completion' and target.module_id not in ('people.learning', 'people.onboarding', 'security.training') then
      raise exception 'This record is not a learning or onboarding step';
    end if;
    insert into public.workplace_interactions(record_id, employee_id, kind, body, value)
      values(p_record_id, actor_id, p_kind, coalesce(p_body, ''), case when p_kind = 'rating' then p_value else null end)
      on conflict (record_id, employee_id, kind) where kind <> 'comment'
      do update set body = excluded.body, value = excluded.value, updated_at = now()
      returning * into result;
  end if;
  return result;
end;
$$;
revoke all on function public.submit_workplace_interaction(uuid, text, text, integer) from public;
grant execute on function public.submit_workplace_interaction(uuid, text, text, integer) to authenticated;
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workplace_interactions') then
    alter publication supabase_realtime add table public.workplace_interactions;
  end if;
end;
$$;
-- Included automatically in schema.sql and workplace-update.sql.
create or replace function public.record_native_workplace_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb;
  owner_id uuid;
  event_visibility text;
  source_record public.workplace_records;
begin
  if tg_op = 'DELETE' then row_data := to_jsonb(old); else row_data := to_jsonb(new); end if;
  if tg_table_name = 'workplace_records' then
    if row_data ->> 'module_id' = 'collaboration.activity' then
      if tg_op = 'DELETE' then return old; else return new; end if;
    end if;
    owner_id := (row_data ->> 'created_by')::uuid;
    event_visibility := row_data ->> 'visibility';
  else
    select * into source_record from public.workplace_records where id = (row_data ->> 'record_id')::uuid;
    if source_record.id is null then
      if tg_op = 'DELETE' then return old; else return new; end if;
    end if;
    event_visibility := case when row_data ->> 'kind' = 'comment' then source_record.visibility else 'private' end;
    owner_id := case when row_data ->> 'kind' = 'comment' and source_record.visibility = 'private' then source_record.created_by else (row_data ->> 'employee_id')::uuid end;
  end if;
  if exists(select 1 from public.employees where id = owner_id) then
    insert into public.workplace_records(module_id,title,description,status,visibility,created_by,metadata)
      values('collaboration.activity',
        case when tg_table_name = 'workplace_interactions' then 'Workspace response saved' else 'Workplace record ' || lower(tg_op) end,
        case when tg_table_name = 'workplace_interactions' then row_data ->> 'kind' else row_data ->> 'module_id' end,
        'published',event_visibility,owner_id,
        jsonb_build_object('source_table',tg_table_name,'source_id',row_data ->> 'id','operation',tg_op));
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function public.record_native_workplace_activity() from public;
drop trigger if exists audit_workplace_record on public.workplace_records;
create trigger audit_workplace_record after insert or update or delete on public.workplace_records
  for each row execute function public.record_native_workplace_activity();
drop trigger if exists audit_workplace_interaction on public.workplace_interactions;
create trigger audit_workplace_interaction after insert or update or delete on public.workplace_interactions
  for each row execute function public.record_native_workplace_activity();

drop policy if exists "Employees read shared or own workplace records" on public.workplace_records;
create policy "Employees read shared or own workplace records" on public.workplace_records
  for select to authenticated using (
    public.current_employee_role() in ('manager', 'admin')
    or visibility = 'company'
    or created_by = (select auth.uid())
  );
drop policy if exists "Managers and allowed employees create workplace records" on public.workplace_records;
create policy "Managers and allowed employees create workplace records" on public.workplace_records
  for insert to authenticated with check (
    module_id <> 'collaboration.activity'
    and created_by = (select auth.uid())
    and (
      public.current_employee_role() in ('manager', 'admin')
      or module_id in (
        'collaboration.chat', 'collaboration.docs',
        'people.benefits', 'people.expenses', 'people.feedback',
        'security.access',
        'culture.recognition', 'culture.feedback', 'culture.surveys',
        'culture.wellness', 'culture.social', 'culture.perks'
      )
    )
    and (
      public.current_employee_role() in ('manager', 'admin')
      or module_id not in ('people.expenses', 'security.access')
      or (status = 'pending_approval' and visibility = 'private')
    )
  );
drop policy if exists "Managers and record owners update workplace records" on public.workplace_records;
create policy "Managers and record owners update workplace records" on public.workplace_records
  for update to authenticated using (
    module_id <> 'collaboration.activity' and (public.current_employee_role() in ('manager', 'admin')
    or created_by = (select auth.uid()))
  ) with check (
    module_id <> 'collaboration.activity' and (public.current_employee_role() in ('manager', 'admin')
    or created_by = (select auth.uid()))
  );
drop policy if exists "Managers delete workplace records" on public.workplace_records;
create policy "Managers delete workplace records" on public.workplace_records
  for delete to authenticated using (module_id <> 'collaboration.activity' and public.current_employee_role() in ('manager', 'admin'));


notify pgrst, 'reload schema';
commit;
