begin;
create extension if not exists pgcrypto;

create table if not exists public.employees (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  job_title text not null default 'Employee',
  role text not null default 'employee' check (role in ('employee', 'manager', 'admin')),
  created_at timestamptz not null default now()
);

create or replace function public.current_employee_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.employees
  where id = (select auth.uid())
  limit 1
$$;

revoke all on function public.current_employee_role() from public;
grant execute on function public.current_employee_role() to authenticated;

create or replace function public.create_employee_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.employees (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(split_part(new.email, '@', 1)), ''),
      'Employee'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_employee on auth.users;
create trigger on_auth_user_created_employee
after insert on auth.users
for each row execute procedure public.create_employee_profile();

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '',
  assignee_id uuid references public.employees(id) on delete cascade,
  created_by uuid not null default auth.uid() references public.employees(id) on delete set null,
  due_date date,
  priority text not null default 'normal' check (priority in ('normal', 'high')),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  created_at timestamptz not null default now()
);
-- Legacy compat: ensure assignee_id is nullable if table already exists from older schema
alter table public.tasks alter column assignee_id drop not null;

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 2000),
  author_id uuid not null default auth.uid() references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null default auth.uid() references public.employees(id) on delete cascade,
  clocked_in_at timestamptz not null default now(),
  clocked_out_at timestamptz,
  check (clocked_out_at is null or clocked_out_at > clocked_in_at)
);
create unique index if not exists one_open_time_entry_per_employee
  on public.time_entries (employee_id) where clocked_out_at is null;

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text not null default 'Workplace',
  check (ends_at > starts_at)
);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null default auth.uid() references public.employees(id) on delete cascade,
  leave_type text not null check (leave_type in ('annual', 'personal', 'sick', 'unpaid')),
  start_date date not null,
  end_date date not null,
  note text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  reviewed_by uuid references public.employees(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create or replace function public.submit_leave_request(
  p_leave_type text,
  p_start_date date,
  p_end_date date,
  p_note text default ''
)
returns public.leave_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.leave_requests;
  weekdays integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign-in is required';
  end if;
  if p_leave_type not in ('annual', 'personal', 'sick', 'unpaid') then
    raise exception 'Invalid leave type';
  end if;
  if p_start_date < current_date or p_end_date < p_start_date then
    raise exception 'Leave dates must be current or future dates in chronological order';
  end if;
  select count(*) into weekdays
  from pg_catalog.generate_series(p_start_date::timestamp, p_end_date::timestamp, interval '1 day') as dates(day_value)
  where extract(isodow from day_value) < 6;
  if weekdays = 0 then
    raise exception 'A leave request must include at least one weekday';
  end if;
  if exists (
    select 1
    from public.leave_requests
    where employee_id = (select auth.uid())
      and status in ('pending', 'approved')
      and start_date <= p_end_date
      and end_date >= p_start_date
  ) then
    raise exception 'These dates overlap an existing pending or approved leave request';
  end if;
  insert into public.leave_requests (employee_id, leave_type, start_date, end_date, note)
  values ((select auth.uid()), p_leave_type, p_start_date, p_end_date, coalesce(p_note, ''))
  returning * into request_row;
  return request_row;
end;
$$;

create table if not exists public.shift_change_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null default auth.uid() references public.employees(id) on delete cascade,
  shift_id uuid not null references public.shifts(id) on delete cascade,
  requested_starts_at timestamptz not null,
  requested_ends_at timestamptz,
  reason text not null check (char_length(reason) between 1 and 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  reviewed_by uuid references public.employees(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (requested_ends_at is null or requested_ends_at > requested_starts_at)
);

create table if not exists public.payslips (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  gross_pay numeric(12, 2) not null check (gross_pay >= 0),
  deductions numeric(12, 2) not null default 0 check (deductions >= 0 and deductions <= gross_pay),
  published_by uuid default auth.uid() references public.employees(id) on delete set null,
  published_at timestamptz not null default now(),
  check (period_end >= period_start),
  unique (employee_id, period_start, period_end)
);

create table if not exists public.workplace_records (
  id uuid primary key default gen_random_uuid(),
  module_id text not null check (module_id in (
    'platform.internal-platform', 'platform.cicd', 'platform.build-systems',
    'platform.code-review', 'platform.testing', 'platform.deployments', 'platform.operations',
    'collaboration.chat', 'collaboration.docs', 'collaboration.activity', 'collaboration.okrs',
    'collaboration.dashboards', 'collaboration.meetings', 'collaboration.design-system',
    'people.onboarding', 'people.benefits', 'people.expenses', 'people.performance',
    'people.feedback', 'people.learning', 'people.recruiting',
    'security.sso', 'security.access', 'security.devices', 'security.network',
    'security.phishing', 'security.compliance', 'security.training',
    'data.bi', 'data.experiments', 'data.catalog', 'data.ml', 'data.analytics',
    'culture.recognition', 'culture.feedback', 'culture.surveys',
    'culture.wellness', 'culture.social', 'culture.perks'
  )),
  title text not null check (char_length(title) between 1 and 180),
  description text not null default '' check (char_length(description) <= 5000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'blocked', 'pending_approval', 'approved', 'rejected', 'done', 'published', 'archived')),
  visibility text not null default 'company' check (visibility in ('company', 'private')),
  due_date date,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_by uuid not null default auth.uid() references public.employees(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.record_workspace_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb;
  actor_id uuid;
  record_id uuid;
  actor_name text;
  action_title text;
begin
  if tg_op = 'DELETE' then
    row_data := to_jsonb(old);
  else
    row_data := to_jsonb(new);
  end if;

  actor_id := coalesce(
    (select auth.uid()),
    nullif(row_data ->> 'employee_id', '')::uuid,
    nullif(row_data ->> 'author_id', '')::uuid,
    nullif(row_data ->> 'created_by', '')::uuid,
    nullif(row_data ->> 'id', '')::uuid
  );
  record_id := nullif(row_data ->> 'id', '')::uuid;

  if actor_id is null or (tg_op = 'DELETE' and (select auth.uid()) is null) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  select display_name into actor_name from public.employees where id = actor_id;
  actor_name := coalesce(actor_name, 'A workspace member');

  action_title := case tg_table_name
    when 'employees' then case tg_op when 'INSERT' then 'Employee account created' when 'UPDATE' then 'Employee profile updated' else 'Employee profile removed' end
    when 'tasks' then case tg_op when 'INSERT' then 'Task assigned' when 'UPDATE' then 'Task updated' else 'Task removed' end
    when 'announcements' then case tg_op when 'INSERT' then 'Company announcement published' when 'UPDATE' then 'Company announcement updated' else 'Company announcement removed' end
    when 'time_entries' then case
      when tg_op = 'INSERT' then 'Employee clocked in'
      when tg_op = 'UPDATE' and (to_jsonb(new) ->> 'clocked_out_at') is distinct from (to_jsonb(old) ->> 'clocked_out_at') and (to_jsonb(new) ->> 'clocked_out_at') is not null then 'Employee clocked out'
      when tg_op = 'UPDATE' then 'Time record updated'
      else 'Time record removed'
    end
    when 'shifts' then case tg_op when 'INSERT' then 'Shift scheduled' when 'UPDATE' then 'Shift schedule updated' else 'Shift removed' end
    when 'leave_requests' then case
      when tg_op = 'INSERT' then 'Leave request submitted'
      when tg_op = 'UPDATE' then 'Leave request ' || coalesce(row_data ->> 'status', 'updated')
      else 'Leave request removed'
    end
    when 'shift_change_requests' then case
      when tg_op = 'INSERT' then 'Shift-change request submitted'
      when tg_op = 'UPDATE' then 'Shift-change request ' || coalesce(row_data ->> 'status', 'updated')
      else 'Shift-change request removed'
    end
    when 'payslips' then case tg_op when 'INSERT' then 'Payslip published' when 'UPDATE' then 'Payslip updated' else 'Payslip removed' end
    else 'Workspace record updated'
  end;

  insert into public.workplace_records (
    module_id, title, description, status, visibility, metadata, created_by
  ) values (
    'collaboration.activity',
    action_title,
    actor_name || ' · ' || tg_table_name,
    'published',
    case when tg_table_name in ('payslips', 'leave_requests', 'shift_change_requests', 'time_entries') then 'private' else 'company' end,
    jsonb_build_object('source_table', tg_table_name, 'source_id', record_id, 'operation', tg_op),
    case when tg_table_name in ('payslips', 'leave_requests', 'shift_change_requests', 'time_entries') then coalesce(nullif(row_data ->> 'employee_id', '')::uuid, actor_id) else actor_id end
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.record_workspace_activity() from public;

create or replace function public.protect_employee_role_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  actor_role text;
begin
  if tg_op = 'UPDATE' and new.role is distinct from old.role then
    -- SQL Editor administrators must be able to bootstrap the first role.
    if current_user in ('postgres', 'supabase_admin') then return new; end if;
    actor_role := public.current_employee_role();
    if actor_role is null or actor_role <> 'admin' then
      raise exception 'Only an administrator can change an employee role';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.protect_employee_role_changes() from public;
drop trigger if exists protect_employee_role_changes on public.employees;
create trigger protect_employee_role_changes
before update on public.employees
for each row execute procedure public.protect_employee_role_changes();

drop trigger if exists audit_employee_activity on public.employees;
create trigger audit_employee_activity after insert or update or delete on public.employees
  for each row execute procedure public.record_workspace_activity();
drop trigger if exists audit_task_activity on public.tasks;
create trigger audit_task_activity after insert or update or delete on public.tasks
  for each row execute procedure public.record_workspace_activity();
drop trigger if exists audit_announcement_activity on public.announcements;
create trigger audit_announcement_activity after insert or update or delete on public.announcements
  for each row execute procedure public.record_workspace_activity();
drop trigger if exists audit_time_entry_activity on public.time_entries;
create trigger audit_time_entry_activity after insert or update or delete on public.time_entries
  for each row execute procedure public.record_workspace_activity();
drop trigger if exists audit_shift_activity on public.shifts;
create trigger audit_shift_activity after insert or update or delete on public.shifts
  for each row execute procedure public.record_workspace_activity();
drop trigger if exists audit_leave_activity on public.leave_requests;
create trigger audit_leave_activity after insert or update or delete on public.leave_requests
  for each row execute procedure public.record_workspace_activity();
drop trigger if exists audit_shift_request_activity on public.shift_change_requests;
create trigger audit_shift_request_activity after insert or update or delete on public.shift_change_requests
  for each row execute procedure public.record_workspace_activity();
drop trigger if exists audit_payslip_activity on public.payslips;
create trigger audit_payslip_activity after insert or update or delete on public.payslips
  for each row execute procedure public.record_workspace_activity();

create or replace function public.protect_reviewable_workspace_records()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.current_employee_role() in ('manager', 'admin') then
    return new;
  end if;
  if new.module_id is distinct from old.module_id then
    raise exception 'Employees cannot reclassify workspace records';
  end if;
  if old.module_id in ('people.expenses', 'security.access') then
    if new.status is distinct from old.status then
      raise exception 'Only managers can review expense or access requests';
    end if;
    if new.visibility <> 'private' then
      raise exception 'Expense and access requests must remain private';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.protect_reviewable_workspace_records() from public;
drop trigger if exists protect_reviewable_workspace_records on public.workplace_records;
create trigger protect_reviewable_workspace_records
before update on public.workplace_records
for each row execute procedure public.protect_reviewable_workspace_records();

create or replace function public.protect_employee_task_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.current_employee_role() in ('manager', 'admin') then
    return new;
  end if;
  if old.assignee_id = (select auth.uid()) then
    if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
      raise exception 'Employees may only update their assigned task status';
    end if;
  elsif old.assignee_id is null
    and new.assignee_id = (select auth.uid())
    and (to_jsonb(new) - 'assignee_id') is not distinct from (to_jsonb(old) - 'assignee_id') then
    return new;
  else
    raise exception 'Employees may only claim an unassigned task';
  end if;
  return new;
end;
$$;
drop trigger if exists protect_employee_task_fields on public.tasks;
create trigger protect_employee_task_fields
before update on public.tasks
for each row execute procedure public.protect_employee_task_fields();

create or replace function public.clock_in()
returns public.time_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry public.time_entries;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign-in is required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended((select auth.uid())::text, 0));
  select * into entry from public.time_entries
  where employee_id = (select auth.uid()) and clocked_out_at is null;
  if found then return entry; end if;
  insert into public.time_entries (employee_id)
  values ((select auth.uid())) returning * into entry;
  return entry;
end;
$$;

create or replace function public.clock_out()
returns public.time_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry public.time_entries;
begin
  update public.time_entries
  set clocked_out_at = now()
  where employee_id = (select auth.uid()) and clocked_out_at is null
  returning * into entry;
  if not found then
    raise exception 'No open time entry was found';
  end if;
  return entry;
end;
$$;

create or replace function public.review_leave_request(p_request_id uuid, p_status text)
returns public.leave_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.leave_requests;
  actor_role text;
begin
  actor_role := public.current_employee_role();
  if actor_role is null or actor_role not in ('manager', 'admin') then
    raise exception 'Manager access is required';
  end if;
  if p_status not in ('approved', 'declined') then
    raise exception 'Invalid leave request decision';
  end if;
  update public.leave_requests
  set status = p_status, reviewed_by = (select auth.uid()), reviewed_at = now()
  where id = p_request_id and status = 'pending'
  returning * into request_row;
  if not found then
    raise exception 'Pending leave request was not found';
  end if;
  return request_row;
end;
$$;

create or replace function public.review_shift_change_request(p_request_id uuid, p_status text)
returns public.shift_change_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.shift_change_requests;
  actor_role text;
begin
  actor_role := public.current_employee_role();
  if actor_role is null or actor_role not in ('manager', 'admin') then
    raise exception 'Manager access is required';
  end if;
  if p_status not in ('approved', 'declined') then
    raise exception 'Invalid shift request decision';
  end if;
  update public.shift_change_requests
  set status = p_status, reviewed_by = (select auth.uid()), reviewed_at = now()
  where id = p_request_id and status = 'pending'
  returning * into request_row;
  if not found then
    raise exception 'Pending shift request was not found';
  end if;
  if p_status = 'approved' then
    update public.shifts
    set starts_at = request_row.requested_starts_at,
        ends_at = coalesce(request_row.requested_ends_at, ends_at)
    where id = request_row.shift_id and employee_id = request_row.employee_id;
    if exists (
      select 1
      from public.shifts
      where id = request_row.shift_id
        and ends_at <= starts_at
    ) then
      raise exception 'A shift must end after it starts';
    end if;
  end if;
  return request_row;
end;
$$;

create index if not exists tasks_assignee_due_idx on public.tasks (assignee_id, due_date);
create index if not exists announcements_created_idx on public.announcements (created_at desc);
create index if not exists time_entries_employee_clocked_idx on public.time_entries (employee_id, clocked_in_at desc);
create index if not exists shifts_employee_starts_idx on public.shifts (employee_id, starts_at);
create index if not exists leave_requests_employee_created_idx on public.leave_requests (employee_id, created_at desc);
create index if not exists shift_change_requests_employee_created_idx on public.shift_change_requests (employee_id, created_at desc);
create index if not exists payslips_employee_period_idx on public.payslips (employee_id, period_start desc);
create index if not exists workplace_records_module_created_idx on public.workplace_records (module_id, created_at desc);
create index if not exists workplace_records_owner_created_idx on public.workplace_records (created_by, created_at desc);
create unique index if not exists one_pending_shift_change_per_shift
  on public.shift_change_requests (shift_id) where status = 'pending';

alter table public.employees enable row level security;
alter table public.tasks enable row level security;
alter table public.announcements enable row level security;
alter table public.time_entries enable row level security;
alter table public.shifts enable row level security;
alter table public.leave_requests enable row level security;
alter table public.shift_change_requests enable row level security;
alter table public.payslips enable row level security;
alter table public.workplace_records enable row level security;

drop policy if exists "Employees read their profile; managers read all" on public.employees;
drop policy if exists "Employees read company directory" on public.employees;
create policy "Employees read company directory" on public.employees
  for select to authenticated using (true);
drop policy if exists "Managers update employee profiles" on public.employees;
create policy "Managers update employee profiles" on public.employees
  for update to authenticated using (public.current_employee_role() in ('manager', 'admin'))
  with check (public.current_employee_role() in ('manager', 'admin'));

drop policy if exists "Employees read assigned tasks; managers read all" on public.tasks;
create policy "Employees read assigned tasks; managers read all" on public.tasks
  for select to authenticated using (assignee_id = (select auth.uid()) or assignee_id is null or public.current_employee_role() in ('manager', 'admin'));
drop policy if exists "Managers create tasks" on public.tasks;
create policy "Managers create tasks" on public.tasks
  for insert to authenticated with check (public.current_employee_role() in ('manager', 'admin') and created_by = (select auth.uid()));
drop policy if exists "Employees update their task status; managers update tasks" on public.tasks;
create policy "Employees update their task status; managers update tasks" on public.tasks
  for update to authenticated using (assignee_id = (select auth.uid()) or assignee_id is null or public.current_employee_role() in ('manager', 'admin'))
  with check (assignee_id = (select auth.uid()) or public.current_employee_role() in ('manager', 'admin'));
drop policy if exists "Managers delete tasks" on public.tasks;
create policy "Managers delete tasks" on public.tasks
  for delete to authenticated using (public.current_employee_role() in ('manager', 'admin'));

drop policy if exists "Employees read announcements" on public.announcements;
create policy "Employees read announcements" on public.announcements
  for select to authenticated using (true);
drop policy if exists "Managers publish announcements" on public.announcements;
create policy "Managers publish announcements" on public.announcements
  for insert to authenticated with check (public.current_employee_role() in ('manager', 'admin') and author_id = (select auth.uid()));
drop policy if exists "Authors and managers update announcements" on public.announcements;
create policy "Authors and managers update announcements" on public.announcements
  for update to authenticated using (author_id = (select auth.uid()) or public.current_employee_role() in ('manager', 'admin'))
  with check (author_id = (select auth.uid()) or public.current_employee_role() in ('manager', 'admin'));
drop policy if exists "Managers delete announcements" on public.announcements;
create policy "Managers delete announcements" on public.announcements
  for delete to authenticated using (public.current_employee_role() in ('manager', 'admin'));

drop policy if exists "Employees read their time; managers read all" on public.time_entries;
create policy "Employees read their time; managers read all" on public.time_entries
  for select to authenticated using (employee_id = (select auth.uid()) or public.current_employee_role() in ('manager', 'admin'));
drop policy if exists "Employees clock in for themselves" on public.time_entries;
create policy "Employees clock in for themselves" on public.time_entries
  for insert to authenticated with check (employee_id = (select auth.uid()) and clocked_out_at is null);
drop policy if exists "Employees clock out their open entry" on public.time_entries;
create policy "Employees clock out their open entry" on public.time_entries
  for update to authenticated using (employee_id = (select auth.uid()) and clocked_out_at is null)
  with check (employee_id = (select auth.uid()));

drop policy if exists "Employees read their shifts; managers read all" on public.shifts;
create policy "Employees read their shifts; managers read all" on public.shifts
  for select to authenticated using (employee_id = (select auth.uid()) or public.current_employee_role() in ('manager', 'admin'));
drop policy if exists "Managers create shifts" on public.shifts;
create policy "Managers create shifts" on public.shifts
  for insert to authenticated with check (public.current_employee_role() in ('manager', 'admin'));
drop policy if exists "Managers update shifts" on public.shifts;
create policy "Managers update shifts" on public.shifts
  for update to authenticated using (public.current_employee_role() in ('manager', 'admin'))
  with check (public.current_employee_role() in ('manager', 'admin'));
drop policy if exists "Managers delete shifts" on public.shifts;
create policy "Managers delete shifts" on public.shifts
  for delete to authenticated using (public.current_employee_role() in ('manager', 'admin'));

drop policy if exists "Employees read leave requests; managers read all" on public.leave_requests;
create policy "Employees read leave requests; managers read all" on public.leave_requests
  for select to authenticated using (employee_id = (select auth.uid()) or public.current_employee_role() in ('manager', 'admin'));
drop policy if exists "Employees submit leave requests" on public.leave_requests;
create policy "Employees submit leave requests" on public.leave_requests
  for insert to authenticated with check (employee_id = (select auth.uid()) and status = 'pending' and reviewed_by is null);
drop policy if exists "Managers review leave requests" on public.leave_requests;
create policy "Managers review leave requests" on public.leave_requests
  for update to authenticated using (public.current_employee_role() in ('manager', 'admin') and status = 'pending')
  with check (public.current_employee_role() in ('manager', 'admin') and status in ('approved', 'declined') and reviewed_by = (select auth.uid()));

drop policy if exists "Employees read shift requests; managers read all" on public.shift_change_requests;
create policy "Employees read shift requests; managers read all" on public.shift_change_requests
  for select to authenticated using (employee_id = (select auth.uid()) or public.current_employee_role() in ('manager', 'admin'));
drop policy if exists "Employees submit their shift requests" on public.shift_change_requests;
create policy "Employees submit their shift requests" on public.shift_change_requests
  for insert to authenticated with check (
    employee_id = (select auth.uid())
    and status = 'pending'
    and reviewed_by is null
    and exists (
      select 1 from public.shifts
      where shifts.id = shift_id and shifts.employee_id = (select auth.uid())
    )
  );
drop policy if exists "Managers review shift requests" on public.shift_change_requests;
create policy "Managers review shift requests" on public.shift_change_requests
  for update to authenticated using (public.current_employee_role() in ('manager', 'admin') and status = 'pending')
  with check (public.current_employee_role() in ('manager', 'admin') and status in ('approved', 'declined') and reviewed_by = (select auth.uid()));

drop policy if exists "Employees read their payslips; managers read all" on public.payslips;
create policy "Employees read their payslips; managers read all" on public.payslips
  for select to authenticated using (employee_id = (select auth.uid()) or public.current_employee_role() in ('manager', 'admin'));
drop policy if exists "Managers create payslips" on public.payslips;
create policy "Managers create payslips" on public.payslips
  for insert to authenticated with check (public.current_employee_role() in ('manager', 'admin'));
drop policy if exists "Managers update payslips" on public.payslips;
create policy "Managers update payslips" on public.payslips
  for update to authenticated using (public.current_employee_role() in ('manager', 'admin'))
  with check (public.current_employee_role() in ('manager', 'admin'));
drop policy if exists "Managers delete payslips" on public.payslips;
create policy "Managers delete payslips" on public.payslips
  for delete to authenticated using (public.current_employee_role() in ('manager', 'admin'));

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

grant usage on schema public to authenticated;
grant select, update on public.employees to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, update, delete on public.announcements to authenticated;
grant select on public.time_entries to authenticated;
grant select, insert, update, delete on public.shifts to authenticated;
grant select on public.leave_requests to authenticated;
grant select, insert on public.shift_change_requests to authenticated;
grant select, insert, update, delete on public.payslips to authenticated;
grant select, insert, update, delete on public.workplace_records to authenticated;
revoke insert, update on public.time_entries from authenticated;
revoke insert, update on public.leave_requests from authenticated;
revoke update on public.shift_change_requests from authenticated;
revoke all on function public.clock_in() from public;
revoke all on function public.clock_out() from public;
revoke all on function public.review_leave_request(uuid, text) from public;
revoke all on function public.review_shift_change_request(uuid, text) from public;
revoke all on function public.submit_leave_request(text, date, date, text) from public;
grant execute on function public.clock_in() to authenticated;
grant execute on function public.clock_out() to authenticated;
grant execute on function public.review_leave_request(uuid, text) to authenticated;
grant execute on function public.review_shift_change_request(uuid, text) to authenticated;
grant execute on function public.submit_leave_request(text, date, date, text) to authenticated;

do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array['tasks', 'announcements', 'time_entries', 'shifts', 'leave_requests', 'shift_change_requests', 'payslips', 'employees', 'workplace_records']
    loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end;
$$;

-- Auth accounts can exist before the schema is first applied.
-- Backfill their employee profiles so existing sign-ins do not stall.
insert into public.employees (id, display_name)
select u.id, coalesce(nullif(trim(u.raw_user_meta_data->>'display_name'), ''), nullif(split_part(u.email, '@', 1), ''), 'Employee')
from auth.users u
on conflict (id) do nothing;
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

notify pgrst, 'reload schema';
commit;
