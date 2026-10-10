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
  select role from public.employees where id = (select auth.uid())
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
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1))
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
  assignee_id uuid not null references public.employees(id) on delete cascade,
  created_by uuid not null default auth.uid() references public.employees(id),
  due_date date,
  priority text not null default 'normal' check (priority in ('normal', 'high')),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  created_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 2000),
  author_id uuid not null default auth.uid() references public.employees(id),
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
  reviewed_by uuid references public.employees(id),
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
  reviewed_by uuid references public.employees(id),
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
  published_at timestamptz not null default now(),
  check (period_end >= period_start),
  unique (employee_id, period_start, period_end)
);

create or replace function public.protect_employee_task_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.assignee_id = (select auth.uid())
     and public.current_employee_role() not in ('manager', 'admin')
     and (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
    raise exception 'Employees may only update their assigned task status';
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
  insert into public.time_entries (employee_id)
  values ((select auth.uid()))
  returning * into entry;
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
begin
  if public.current_employee_role() not in ('manager', 'admin') then
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
begin
  if public.current_employee_role() not in ('manager', 'admin') then
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
  if p_status = 'approved' and request_row.requested_ends_at is not null then
    update public.shifts
    set starts_at = request_row.requested_starts_at, ends_at = request_row.requested_ends_at
    where id = request_row.shift_id and employee_id = request_row.employee_id;
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

drop policy if exists "Employees read their profile; managers read all" on public.employees;
create policy "Employees read their profile; managers read all" on public.employees
  for select to authenticated using (id = (select auth.uid()) or public.current_employee_role() in ('manager', 'admin'));
drop policy if exists "Managers update employee profiles" on public.employees;
create policy "Managers update employee profiles" on public.employees
  for update to authenticated using (public.current_employee_role() in ('manager', 'admin'))
  with check (public.current_employee_role() in ('manager', 'admin'));

drop policy if exists "Employees read assigned tasks; managers read all" on public.tasks;
create policy "Employees read assigned tasks; managers read all" on public.tasks
  for select to authenticated using (assignee_id = (select auth.uid()) or public.current_employee_role() in ('manager', 'admin'));
drop policy if exists "Managers create tasks" on public.tasks;
create policy "Managers create tasks" on public.tasks
  for insert to authenticated with check (public.current_employee_role() in ('manager', 'admin') and created_by = (select auth.uid()));
drop policy if exists "Employees update their task status; managers update tasks" on public.tasks;
create policy "Employees update their task status; managers update tasks" on public.tasks
  for update to authenticated using (assignee_id = (select auth.uid()) or public.current_employee_role() in ('manager', 'admin'))
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

grant usage on schema public to authenticated;
grant select, update on public.employees to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, update, delete on public.announcements to authenticated;
grant select on public.time_entries to authenticated;
grant select, insert, update, delete on public.shifts to authenticated;
grant select on public.leave_requests to authenticated;
grant select, insert on public.shift_change_requests to authenticated;
grant select, insert, update, delete on public.payslips to authenticated;
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
    foreach table_name in array array['tasks', 'announcements', 'time_entries', 'shifts', 'leave_requests', 'shift_change_requests', 'payslips', 'employees']
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
