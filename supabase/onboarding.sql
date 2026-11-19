begin;

create or replace function public.td_onboarding_active()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.employees e
    where e.id = (select auth.uid())
      and (to_jsonb(e)->>'is_banned') is distinct from 'true'
  );
$$;

create or replace function public.td_onboarding_manager()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.employees e
    where e.id = (select auth.uid())
      and e.role in ('manager','admin')
      and (to_jsonb(e)->>'is_banned') is distinct from 'true'
  );
$$;

create table if not exists public.td_onboarding_plans (
  id uuid primary key,
  employee_id uuid not null references public.employees(id) on delete cascade,
  start_date date not null,
  archived boolean not null default false,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists td_onboarding_one_active
  on public.td_onboarding_plans(employee_id) where not archived;

create table if not exists public.td_onboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.td_onboarding_plans(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  instructions text not null default '' check (char_length(instructions) <= 1000),
  phase text not null check (phase in ('prepare','day1','week1','month1')),
  owner text not null check (owner in ('employee','hr')),
  due_date date not null,
  position integer not null,
  completed_at timestamptz,
  completed_by uuid references public.employees(id) on delete set null
);

create index if not exists td_onboarding_tasks_plan
  on public.td_onboarding_tasks(plan_id);

alter table public.td_onboarding_plans enable row level security;
alter table public.td_onboarding_tasks enable row level security;

revoke all on public.td_onboarding_plans, public.td_onboarding_tasks
  from public, anon, authenticated;

grant select on public.td_onboarding_plans, public.td_onboarding_tasks
  to authenticated;

drop policy if exists onboarding_plans_read on public.td_onboarding_plans;
create policy onboarding_plans_read
on public.td_onboarding_plans for select to authenticated using (
  (select public.td_onboarding_manager())
  or (
    employee_id = (select auth.uid())
    and (select public.td_onboarding_active())
  )
);

drop policy if exists onboarding_tasks_read on public.td_onboarding_tasks;
create policy onboarding_tasks_read
on public.td_onboarding_tasks for select to authenticated using (
  exists (
    select 1 from public.td_onboarding_plans p
    where p.id = plan_id
  )
);

create or replace function public.td_onboarding_create(
  p_id uuid,
  p_employee uuid,
  p_start date,
  p_tasks jsonb
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  item jsonb;
  existing public.td_onboarding_plans;
  n integer := 0;
begin
  if not public.td_onboarding_manager() then
    raise exception 'Manager or admin access required';
  end if;

  if p_id is null or p_employee is null or p_start is null then
    raise exception 'Choose an employee and start date';
  end if;

  select * into existing
  from public.td_onboarding_plans where id = p_id;

  if found then
    if existing.employee_id = p_employee
      and existing.start_date = p_start
      and existing.created_by = auth.uid()
    then
      return existing.id;
    end if;
    raise exception 'This request ID has already been used';
  end if;

  if not exists (
    select 1 from public.employees e
    where e.id = p_employee
      and (to_jsonb(e)->>'is_banned') is distinct from 'true'
  ) then
    raise exception 'Employee unavailable';
  end if;

  if jsonb_typeof(p_tasks) is distinct from 'array' then
    raise exception 'Checklist must be an array';
  end if;

  if jsonb_array_length(p_tasks) not between 1 and 50 then
    raise exception 'Use 1 to 50 checklist tasks';
  end if;

  if exists (
    select 1 from public.td_onboarding_plans
    where employee_id = p_employee and not archived
  ) then
    raise exception 'This employee already has an active onboarding plan';
  end if;

  insert into public.td_onboarding_plans(
    id, employee_id, start_date, created_by
  ) values (
    p_id, p_employee, p_start, auth.uid()
  );

  for item in select value from jsonb_array_elements(p_tasks) loop
    if jsonb_typeof(item) is distinct from 'object'
      or nullif(btrim(item->>'title'),'') is null
      or (item->>'phase') is null
      or (item->>'phase') not in ('prepare','day1','week1','month1')
      or (item->>'owner') is null
      or (item->>'owner') not in ('employee','hr')
      or coalesce(item->>'day','') !~ '^-?[0-9]{1,3}$'
    then
      raise exception 'Check each task title, stage, owner and due offset';
    end if;

    if (item->>'day')::integer not between -30 and 180 then
      raise exception 'Due offset must be between -30 and 180 days';
    end if;

    insert into public.td_onboarding_tasks(
      plan_id, title, instructions, phase, owner, due_date, position
    ) values (
      p_id,
      btrim(item->>'title'),
      coalesce(item->>'instructions',''),
      item->>'phase',
      item->>'owner',
      p_start + (item->>'day')::integer,
      n
    );

    n := n + 1;
  end loop;

  return p_id;
end;
$$;

create or replace function public.td_onboarding_set_task(
  p_task uuid,
  p_done boolean
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  task public.td_onboarding_tasks;
  plan public.td_onboarding_plans;
  plan_key uuid;
begin
  if not public.td_onboarding_active() or p_done is null then
    raise exception 'Employee sign-in required';
  end if;

  select plan_id into plan_key
  from public.td_onboarding_tasks where id = p_task;

  select * into plan
  from public.td_onboarding_plans where id = plan_key for update;

  if not found or plan.archived then
    raise exception 'Active plan unavailable';
  end if;

  select * into task
  from public.td_onboarding_tasks where id = p_task for update;

  if not found then raise exception 'Task unavailable'; end if;

  if task.owner = 'employee' and plan.employee_id <> auth.uid() then
    raise exception 'Only the assigned employee can complete this task';
  end if;

  if task.owner = 'hr' and not public.td_onboarding_manager() then
    raise exception 'HR task: manager or admin required';
  end if;

  if (task.completed_at is not null) = p_done then return; end if;

  update public.td_onboarding_tasks set
    completed_at = case when p_done then now() else null end,
    completed_by = case when p_done then auth.uid() else null end
  where id = p_task;
end;
$$;

create or replace function public.td_onboarding_archive(p_plan uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.td_onboarding_manager() then
    raise exception 'Manager or admin access required';
  end if;

  update public.td_onboarding_plans set archived = true where id = p_plan;
  if not found then raise exception 'Plan unavailable'; end if;
end;
$$;

revoke all on function
  public.td_onboarding_active(),
  public.td_onboarding_manager(),
  public.td_onboarding_create(uuid,uuid,date,jsonb),
  public.td_onboarding_set_task(uuid,boolean),
  public.td_onboarding_archive(uuid)
from public, anon, authenticated;

grant execute on function
  public.td_onboarding_active(),
  public.td_onboarding_manager(),
  public.td_onboarding_create(uuid,uuid,date,jsonb),
  public.td_onboarding_set_task(uuid,boolean),
  public.td_onboarding_archive(uuid)
to authenticated;

commit;