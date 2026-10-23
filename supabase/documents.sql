begin;

-- Private storage for company documents.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'legion-documents',
  'legion-documents',
  false,
  10485760,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;


-- Check that the employee still belongs to an active workspace.
create or replace function public.legion_documents_active()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  resetting boolean := false;
begin
  if not exists (
    select 1
    from public.employees
    where id = auth.uid()
  ) then
    return false;
  end if;

  if to_regclass('public.legion_reset_control') is not null then
    execute
      'select active
       from public.legion_reset_control
       where id = true'
    into resetting;
  end if;

  return not coalesce(resetting, false);
end;
$$;

revoke all
on function public.legion_documents_active()
from public, anon;

grant execute
on function public.legion_documents_active()
to authenticated;


-- Validate document records and protect their file identity.
create or replace function public.legion_document_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  was_file boolean := false;
  file_path text;
  file_name text;
  file_state text;
  extension text;
  mime text;
  object_metadata jsonb;
  expected_mime text;
begin
  if tg_op <> 'INSERT' then
    was_file :=
      old.module_id = 'collaboration.docs'
      and old.metadata->>'kind' = 'document';
  end if;

  if tg_op = 'DELETE' then
    if was_file and exists (
      select 1
      from storage.objects
      where bucket_id = 'legion-documents'
        and name = old.metadata->>'storage_path'
    ) then
      raise exception
        'Remove the document file through Legion before deleting its record.';
    end if;

    return old;
  end if;

  if was_file and (
    new.module_id <> old.module_id
    or new.created_by <> old.created_by
    or new.metadata->>'kind' is distinct from 'document'
    or new.metadata->>'storage_path'
      is distinct from old.metadata->>'storage_path'
    or new.metadata->>'file_name'
      is distinct from old.metadata->>'file_name'
  ) then
    raise exception
      'Document ownership and file identity cannot be changed.';
  end if;

  if new.module_id <> 'collaboration.docs'
    or coalesce(new.metadata->>'kind', '') <> 'document'
  then
    return new;
  end if;

  if auth.role() = 'authenticated'
    and not public.legion_documents_active()
  then
    raise exception
      'Sign in to an active workspace before changing documents.';
  end if;

  file_path := new.metadata->>'storage_path';
  file_name := new.metadata->>'file_name';
  file_state := new.metadata->>'file_state';

  if file_path is null or file_path !~ (
    '^' || new.created_by::text ||
    '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|docx|xlsx|pptx|txt|csv|jpg|jpeg|png|webp)$'
  ) then
    raise exception 'Invalid document path or owner.';
  end if;

  if file_name is null
    or char_length(file_name) not between 1 and 200
    or file_name ~ '[/\\[:cntrl:]]'
  then
    raise exception 'Invalid document filename.';
  end if;

  extension := lower(
    substring(file_path from '\.([a-z0-9]+)$')
  );

  if lower(file_name) not like '%.' || extension then
    raise exception
      'Document filename does not match its type.';
  end if;

  expected_mime := case extension
    when 'pdf' then
      'application/pdf'
    when 'docx' then
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    when 'xlsx' then
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    when 'pptx' then
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    when 'txt' then 'text/plain'
    when 'csv' then 'text/csv'
    when 'jpg' then 'image/jpeg'
    when 'jpeg' then 'image/jpeg'
    when 'png' then 'image/png'
    when 'webp' then 'image/webp'
  end;

  if file_state is null
    or file_state not in ('pending', 'ready', 'deleting')
  then
    raise exception 'Invalid document state.';
  end if;

  if tg_op = 'INSERT' and file_state <> 'pending' then
    raise exception 'Create a pending upload first.';
  end if;

  if was_file
    and old.metadata->>'file_state' = 'deleting'
    and file_state <> 'deleting'
  then
    raise exception 'This document is being deleted.';
  end if;

  if was_file
    and old.metadata->>'file_state' = 'ready'
    and file_state = 'pending'
  then
    raise exception 'A completed upload cannot be reset.';
  end if;

  if file_state = 'ready' then
    select metadata
    into object_metadata
    from storage.objects
    where bucket_id = 'legion-documents'
      and name = file_path;

    mime := split_part(
      object_metadata->>'mimetype',
      ';',
      1
    );

    if object_metadata is null
      or mime is distinct from expected_mime
      or coalesce(
        (object_metadata->>'size')::bigint,
        0
      ) not between 1 and 10485760
    then
      raise exception
        'Upload is missing, oversized, or has the wrong content type.';
    end if;

    new.metadata := new.metadata || jsonb_build_object(
      'content_type', mime,
      'file_size', (object_metadata->>'size')::bigint
    );
  else
    -- Incomplete uploads and pending deletions stay private.
    new.visibility := 'private';

    new.metadata := new.metadata || jsonb_build_object(
      'content_type', expected_mime
    );
  end if;

  return new;
end;
$$;

revoke all
on function public.legion_document_guard()
from public, anon, authenticated;

drop trigger if exists legion_document_guard
on public.workplace_records;

create trigger legion_document_guard
before insert or update or delete
on public.workplace_records
for each row
execute function public.legion_document_guard();


-- A stored file can belong to only one document record.
create unique index if not exists legion_document_path_unique
on public.workplace_records (
  (metadata->>'storage_path')
)
where
  module_id = 'collaboration.docs'
  and metadata->>'kind' = 'document';


-- Uploaders can delete their own document records.
-- Existing manager permissions remain available.
drop policy if exists "Document owners delete their documents"
on public.workplace_records;

create policy "Document owners delete their documents"
on public.workplace_records
for delete
to authenticated
using (
  module_id = 'collaboration.docs'
  and metadata->>'kind' = 'document'
  and created_by = auth.uid()
  and public.legion_documents_active()
);


drop policy if exists "Document operations require active workspace"
on public.workplace_records;

create policy "Document operations require active workspace"
on public.workplace_records
as restrictive
for all
to authenticated
using (
  module_id <> 'collaboration.docs'
  or coalesce(metadata->>'kind', '') <> 'document'
  or public.legion_documents_active()
)
with check (
  module_id <> 'collaboration.docs'
  or coalesce(metadata->>'kind', '') <> 'document'
  or public.legion_documents_active()
);


-- Apply document permissions to the actual stored files.
create or replace function public.legion_document_access(
  p_path text,
  p_action text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  role_name text;
  document public.workplace_records%rowtype;
begin
  if not public.legion_documents_active() then
    return false;
  end if;

  select role
  into role_name
  from public.employees
  where id = actor;

  if p_action = 'upload' then
    select *
    into document
    from public.workplace_records
    where module_id = 'collaboration.docs'
      and metadata->>'kind' = 'document'
      and metadata->>'storage_path' = p_path
      and created_by = actor
      and metadata->>'file_state' = 'pending'
    for share;

    return found;
  end if;

  select *
  into document
  from public.workplace_records
  where module_id = 'collaboration.docs'
    and metadata->>'kind' = 'document'
    and metadata->>'storage_path' = p_path;

  if p_action = 'read' then
    return (
      document.id is not null
      and (
        document.created_by = actor
        or role_name in ('manager', 'admin')
        or (
          document.visibility = 'company'
          and document.metadata->>'file_state' = 'ready'
        )
      )
    );
  end if;

  if p_action = 'delete' then
    return (
      document.id is not null
      and document.metadata->>'file_state' = 'deleting'
      and (
        document.created_by = actor
        or role_name in ('manager', 'admin')
      )
    );
  end if;

  return false;
end;
$$;

revoke all
on function public.legion_document_access(text, text)
from public, anon;

grant execute
on function public.legion_document_access(text, text)
to authenticated;


-- Add scoped Storage policies.
do $$
declare
  operation text;
  check_sql text;
  permission text;
begin
  foreach operation in array array[
    'select',
    'insert',
    'delete'
  ] loop
    permission := case operation
      when 'select' then 'read'
      when 'insert' then 'upload'
      else 'delete'
    end;

    check_sql := format(
      'bucket_id = %L and public.legion_document_access(name, %L)',
      'legion-documents',
      permission
    );

    execute format(
      'drop policy if exists %I on storage.objects',
      'Legion documents ' || operation
    );

    execute format(
      'create policy %I on storage.objects for %s to authenticated %s (%s)',
      'Legion documents ' || operation,
      operation,
      case
        when operation = 'insert' then 'with check'
        else 'using'
      end,
      check_sql
    );

    execute format(
      'drop policy if exists %I on storage.objects',
      'Legion documents restrict ' || operation
    );

    execute format(
      'create policy %I on storage.objects as restrictive for %s to authenticated %s (bucket_id <> %L or (%s))',
      'Legion documents restrict ' || operation,
      operation,
      case
        when operation = 'insert' then 'with check'
        else 'using'
      end,
      'legion-documents',
      check_sql
    );
  end loop;
end;
$$;


-- Files are uploaded once rather than overwritten.
drop policy if exists "Legion documents prevent overwrite"
on storage.objects;

create policy "Legion documents prevent overwrite"
on storage.objects
as restrictive
for update
to authenticated
using (
  bucket_id <> 'legion-documents'
)
with check (
  bucket_id <> 'legion-documents'
);


-- Signed-out visitors cannot access document files.
drop policy if exists "Legion documents deny anonymous access"
on storage.objects;

create policy "Legion documents deny anonymous access"
on storage.objects
as restrictive
for all
to anon
using (
  bucket_id <> 'legion-documents'
)
with check (
  bucket_id <> 'legion-documents'
);

commit;