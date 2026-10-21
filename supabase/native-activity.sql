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
