begin;

create or replace function public.td_benefits_active()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.employees e
    where e.id = (select auth.uid())
      and (to_jsonb(e)->>'is_banned') is distinct from 'true'
  );
$$;

create or replace function public.td_benefits_manager()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.employees e
    where e.id = (select auth.uid())
      and e.role in ('manager','admin')
      and (to_jsonb(e)->>'is_banned') is distinct from 'true'
  );
$$;

create table if not exists public.td_benefit_offers (
  id uuid primary key,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  category text not null check (
    category in ('health','learning','wellbeing','retirement','other')
  ),
  summary text not null check (char_length(btrim(summary)) between 1 and 400),
  eligibility text not null check (
    char_length(btrim(eligibility)) between 1 and 1500
  ),
  instructions text not null check (
    char_length(btrim(instructions)) between 1 and 2000
  ),
  resource_url text not null default '' check (
    char_length(resource_url) <= 2000 and (
      resource_url = '' or
      resource_url ~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
    )
  ),
  active boolean not null default true,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.td_benefit_requests (
  id uuid primary key,
  benefit_id uuid not null references public.td_benefit_offers(id),
  benefit_title text not null,
  employee_id uuid not null references public.employees(id) on delete cascade,
  kind text not null check (kind in ('question','request')),
  message text not null check (char_length(btrim(message)) between 1 and 2000),
  status text not null default 'open' check (
    status in ('open','reviewing','answered','closed')
  ),
  reply text not null default '' check (char_length(reply) <= 2000),
  reviewed_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists td_benefit_requests_employee
  on public.td_benefit_requests(employee_id,created_at desc);

alter table public.td_benefit_offers enable row level security;
alter table public.td_benefit_requests enable row level security;

revoke all on public.td_benefit_offers, public.td_benefit_requests
  from public, anon, authenticated;

grant select on public.td_benefit_offers, public.td_benefit_requests
  to authenticated;

drop policy if exists benefits_offer_read on public.td_benefit_offers;
create policy benefits_offer_read on public.td_benefit_offers
for select to authenticated using (
  (select public.td_benefits_active())
  and (active or (select public.td_benefits_manager()))
);

drop policy if exists benefits_request_read on public.td_benefit_requests;
create policy benefits_request_read on public.td_benefit_requests
for select to authenticated using (
  (select public.td_benefits_active())
  and (
    employee_id = (select auth.uid())
    or (select public.td_benefits_manager())
  )
);

create or replace function public.td_benefit_save(
  p_id uuid,
  p_values jsonb,
  p_expected timestamptz default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  existing public.td_benefit_offers;
begin
  if not public.td_benefits_manager() then
    raise exception 'Manager or admin access required';
  end if;

  if p_id is null or jsonb_typeof(p_values) is distinct from 'object' then
    raise exception 'Invalid benefit';
  end if;

  select * into existing
  from public.td_benefit_offers
  where id = p_id for update;

  if found then
    if p_expected is null then
      if existing.created_by = auth.uid()
        and existing.title = btrim(p_values->>'title')
        and existing.category = p_values->>'category'
        and existing.summary = btrim(p_values->>'summary')
        and existing.eligibility = btrim(p_values->>'eligibility')
        and existing.instructions = btrim(p_values->>'instructions')
        and existing.resource_url = btrim(coalesce(p_values->>'resource_url',''))
        and existing.active = coalesce((p_values->>'active')::boolean,true)
      then
        return p_id;
      end if;
      raise exception 'Benefit already exists. Refresh before editing';
    end if;

    if existing.updated_at <> p_expected then
      raise exception 'Benefit changed. Refresh before editing';
    end if;

    update public.td_benefit_offers
    set title = btrim(p_values->>'title'),
        category = p_values->>'category',
        summary = btrim(p_values->>'summary'),
        eligibility = btrim(p_values->>'eligibility'),
        instructions = btrim(p_values->>'instructions'),
        resource_url = btrim(coalesce(p_values->>'resource_url','')),
        active = coalesce((p_values->>'active')::boolean,true),
        updated_at = now()
    where id = p_id;
  else
    if p_expected is not null then
      raise exception 'Benefit unavailable';
    end if;

    insert into public.td_benefit_offers(
      id,title,category,summary,eligibility,instructions,
      resource_url,active,created_by
    )
    values(
      p_id,btrim(p_values->>'title'),p_values->>'category',
      btrim(p_values->>'summary'),btrim(p_values->>'eligibility'),
      btrim(p_values->>'instructions'),
      btrim(coalesce(p_values->>'resource_url','')),
      coalesce((p_values->>'active')::boolean,true),auth.uid()
    );
  end if;

  return p_id;
end;
$$;

create or replace function public.td_benefit_request(
  p_id uuid,
  p_benefit uuid,
  p_kind text,
  p_message text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  offer public.td_benefit_offers;
  existing public.td_benefit_requests;
begin
  if not public.td_benefits_active() then
    raise exception 'Employee sign-in required';
  end if;

  if p_id is null then
    raise exception 'Request ID required';
  end if;

  select * into existing
  from public.td_benefit_requests where id = p_id;

  if found then
    if existing.employee_id = auth.uid()
      and existing.benefit_id = p_benefit
      and existing.kind = p_kind
      and existing.message = btrim(p_message)
    then
      return p_id;
    end if;
    raise exception 'Request ID already used';
  end if;

  select * into offer
  from public.td_benefit_offers
  where id = p_benefit and active for share;

  if not found then
    raise exception 'This benefit is not accepting requests';
  end if;

  insert into public.td_benefit_requests(
    id,benefit_id,benefit_title,employee_id,kind,message
  )
  values(
    p_id,p_benefit,offer.title,auth.uid(),p_kind,btrim(p_message)
  );

  return p_id;
end;
$$;

create or replace function public.td_benefit_review(
  p_id uuid,
  p_status text,
  p_reply text,
  p_expected timestamptz
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.td_benefits_manager() then
    raise exception 'Manager or admin access required';
  end if;

  if p_status is null
    or p_status not in ('open','reviewing','answered','closed')
    or p_reply is null
  then
    raise exception 'Invalid review';
  end if;

  if p_status in ('answered','closed')
    and nullif(btrim(p_reply),'') is null
  then
    raise exception 'Add an HR reply before answering or closing';
  end if;

  update public.td_benefit_requests
  set status = p_status,
      reply = btrim(p_reply),
      reviewed_by = auth.uid(),
      updated_at = now()
  where id = p_id and updated_at = p_expected;

  if not found then
    raise exception 'Request changed. Refresh before replying';
  end if;
end;
$$;

revoke all on function
  public.td_benefits_active(),
  public.td_benefits_manager(),
  public.td_benefit_save(uuid,jsonb,timestamptz),
  public.td_benefit_request(uuid,uuid,text,text),
  public.td_benefit_review(uuid,text,text,timestamptz)
from public,anon,authenticated;

grant execute on function
  public.td_benefits_active(),
  public.td_benefits_manager(),
  public.td_benefit_save(uuid,jsonb,timestamptz),
  public.td_benefit_request(uuid,uuid,text,text),
  public.td_benefit_review(uuid,text,text,timestamptz)
to authenticated;

commit;