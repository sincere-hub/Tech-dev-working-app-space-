begin;

create table if not exists public.td_benefit_allowances (
  id uuid primary key,
  employee_id uuid not null references public.employees(id) on delete cascade,
  benefit_id uuid not null references public.td_benefit_offers(id),
  benefit_title text not null,
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  budget_cents bigint not null check (budget_cents between 1 and 100000000),
  pending_cents bigint not null default 0 check (pending_cents >= 0),
  approved_cents bigint not null default 0 check (approved_cents >= 0),
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  check (pending_cents + approved_cents <= budget_cents)
);

create table if not exists public.td_benefit_support (
  id uuid primary key,
  allowance_id uuid not null references public.td_benefit_allowances(id),
  employee_id uuid not null references public.employees(id) on delete cascade,
  amount_cents bigint not null check (amount_cents between 1 and 100000000),
  reason text not null check (char_length(btrim(reason)) between 1 and 1500),
  status text not null default 'pending' check (
    status in ('pending','approved','declined','cancelled')
  ),
  reply text not null default '' check (char_length(reply) <= 1500),
  reviewed_by uuid references public.employees(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists benefit_allowances_person
  on public.td_benefit_allowances(employee_id,benefit_id,starts_on,ends_on);

create index if not exists benefit_support_person
  on public.td_benefit_support(employee_id,created_at desc);

alter table public.td_benefit_allowances enable row level security;
alter table public.td_benefit_support enable row level security;

revoke all on public.td_benefit_allowances,public.td_benefit_support
  from public,anon,authenticated;

grant select on public.td_benefit_allowances,public.td_benefit_support
  to authenticated;

drop policy if exists allowance_private_read on public.td_benefit_allowances;
create policy allowance_private_read on public.td_benefit_allowances
for select to authenticated using (
  (select public.td_benefits_active())
  and (
    employee_id = (select auth.uid())
    or (select public.td_benefits_manager())
  )
);

drop policy if exists support_private_read on public.td_benefit_support;
create policy support_private_read on public.td_benefit_support
for select to authenticated using (
  (select public.td_benefits_active())
  and (
    employee_id = (select auth.uid())
    or (select public.td_benefits_manager())
  )
);

create or replace function public.td_benefit_allocate(
  p_id uuid,
  p_employee uuid,
  p_benefit uuid,
  p_start date,
  p_end date,
  p_budget numeric
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  title text;
  old public.td_benefit_allowances;
begin
  if not public.td_benefits_manager() then
    raise exception 'Manager or admin required';
  end if;

  if p_id is null or p_employee is null or p_benefit is null
    or p_start is null or p_end is null or p_end < p_start
    or p_budget is null or p_budget not between 0.01 and 1000000
    or p_budget * 100 <> trunc(p_budget * 100)
  then
    raise exception 'Choose dates and a budget from R0.01 to R1,000,000 with at most two decimals';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_employee::text || ':' || p_benefit::text, 0)
  );

  select * into old
  from public.td_benefit_allowances where id = p_id;

  if found then
    if old.created_by = auth.uid()
      and old.employee_id = p_employee
      and old.benefit_id = p_benefit
      and old.starts_on = p_start
      and old.ends_on = p_end
      and old.budget_cents = p_budget * 100
    then
      return p_id;
    end if;
    raise exception 'Allocation ID already used';
  end if;

  if not exists (
    select 1 from public.employees e
    where e.id = p_employee
      and (to_jsonb(e)->>'is_banned') is distinct from 'true'
  ) then
    raise exception 'Employee unavailable';
  end if;

  select o.title into title
  from public.td_benefit_offers o
  where o.id = p_benefit and o.active for share;

  if not found then
    raise exception 'Choose a published benefit';
  end if;

  if exists (
    select 1 from public.td_benefit_allowances
    where employee_id = p_employee and benefit_id = p_benefit
      and starts_on <= p_end and ends_on >= p_start
  ) then
    raise exception 'This benefit already has an overlapping allowance for that employee';
  end if;

  insert into public.td_benefit_allowances(
    id,employee_id,benefit_id,benefit_title,
    starts_on,ends_on,budget_cents,created_by
  )
  values(
    p_id,p_employee,p_benefit,title,
    p_start,p_end,(p_budget * 100)::bigint,auth.uid()
  );

  return p_id;
end;
$$;

create or replace function public.td_benefit_use(
  p_id uuid,
  p_allowance uuid,
  p_amount numeric,
  p_reason text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  allocation public.td_benefit_allowances;
  old public.td_benefit_support;
  amount bigint;
  today date := (now() at time zone 'Africa/Johannesburg')::date;
begin
  if not public.td_benefits_active() then
    raise exception 'Employee sign-in required';
  end if;

  if p_id is null or p_amount is null
    or p_amount not between 0.01 and 1000000
    or p_amount * 100 <> trunc(p_amount * 100)
    or p_reason is null
    or char_length(btrim(p_reason)) not between 1 and 1500
  then
    raise exception 'Enter a valid amount and reason';
  end if;

  amount := (p_amount * 100)::bigint;

  select * into allocation
  from public.td_benefit_allowances
  where id = p_allowance for update;

  if not found or allocation.employee_id <> auth.uid() then
    raise exception 'Allowance unavailable';
  end if;

  select * into old
  from public.td_benefit_support where id = p_id;

  if found then
    if old.employee_id = auth.uid()
      and old.allowance_id = p_allowance
      and old.amount_cents = amount
      and old.reason = btrim(p_reason)
    then
      return p_id;
    end if;
    raise exception 'Request ID already used';
  end if;

  if today not between allocation.starts_on and allocation.ends_on then
    raise exception 'This allowance is outside its request period';
  end if;

  perform 1 from public.td_benefit_offers
  where id = allocation.benefit_id and active for share;

  if not found then
    raise exception 'This benefit is paused';
  end if;

  if amount > allocation.budget_cents
    - allocation.pending_cents - allocation.approved_cents
  then
    raise exception 'Amount exceeds your available allowance';
  end if;

  update public.td_benefit_allowances
  set pending_cents = pending_cents + amount
  where id = p_allowance;

  insert into public.td_benefit_support(
    id,allowance_id,employee_id,amount_cents,reason
  )
  values(p_id,p_allowance,auth.uid(),amount,btrim(p_reason));

  return p_id;
end;
$$;

create or replace function public.td_benefit_decide(
  p_id uuid,
  p_decision text,
  p_reply text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  request public.td_benefit_support;
  key uuid;
begin
  if not public.td_benefits_active() then
    raise exception 'Employee sign-in required';
  end if;

  if p_decision is null
    or p_decision not in ('approved','declined','cancelled')
    or p_reply is null
    or char_length(btrim(p_reply)) not between 1 and 1500
  then
    raise exception 'Choose a decision and add a response';
  end if;

  select allowance_id into key
  from public.td_benefit_support where id = p_id;

  perform 1 from public.td_benefit_allowances
  where id = key for update;

  select * into request
  from public.td_benefit_support where id = p_id for update;

  if not found then
    raise exception 'Request unavailable';
  end if;

  if p_decision = 'cancelled' then
    if request.employee_id <> auth.uid() then
      raise exception 'Only the requester can withdraw';
    end if;
  else
    if not public.td_benefits_manager() then
      raise exception 'Manager or admin required';
    end if;
    if request.employee_id = auth.uid() then
      raise exception 'Another manager must review your request';
    end if;
  end if;

  if request.status = p_decision
    and request.reviewed_by = auth.uid()
    and request.reply = btrim(p_reply)
  then
    return;
  end if;

  if request.status <> 'pending' then
    raise exception 'This request has already been reviewed';
  end if;

  update public.td_benefit_allowances
  set pending_cents = pending_cents - request.amount_cents,
      approved_cents = approved_cents + case
        when p_decision = 'approved' then request.amount_cents
        else 0
      end
  where id = key;

  update public.td_benefit_support
  set status = p_decision,
      reply = btrim(p_reply),
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_id;
end;
$$;

revoke all on function
  public.td_benefit_allocate(uuid,uuid,uuid,date,date,numeric),
  public.td_benefit_use(uuid,uuid,numeric,text),
  public.td_benefit_decide(uuid,text,text)
from public,anon,authenticated;

grant execute on function
  public.td_benefit_allocate(uuid,uuid,uuid,date,date,numeric),
  public.td_benefit_use(uuid,uuid,numeric,text),
  public.td_benefit_decide(uuid,text,text)
to authenticated;

commit;