begin;

create or replace function public.td_share_active()
returns boolean
language sql stable security definer set search_path=''
as $$
  select exists(
    select 1
    from public.employees e
    where e.id=auth.uid()
      and (to_jsonb(e)->>'is_banned') is distinct from 'true'
  );
$$;

create or replace function public.td_share_member(p_room uuid)
returns boolean
language sql stable security definer set search_path=''
as $$
  select public.td_share_active()
    and public.td_chat_can_read(p_room)
    and exists(
      select 1 from public.td_chat_members m
      where m.room_id=p_room and m.employee_id=auth.uid()
    )
    and not exists(
      select 1
      from public.td_chat_rooms r
      join public.td_chat_blocks b on b.room_id=r.id
      where r.id=p_room and r.kind='direct'
    );
$$;

create table if not exists public.td_chat_hidden_messages (
  employee_id uuid not null references public.employees(id),
  message_id uuid not null references public.td_chat_messages(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key(employee_id,message_id)
);

create table if not exists public.td_chat_media_uploads (
  id uuid primary key,
  employee_id uuid not null references public.employees(id),
  room_id uuid references public.td_chat_rooms(id),
  for_status boolean not null,
  object_path text not null unique,
  mime text not null,
  bytes bigint not null,
  used boolean not null default false,
  expires_at timestamptz not null default now()+interval '1 hour',
  check(
    (for_status and room_id is null)
    or (not for_status and room_id is not null)
  )
);

create table if not exists public.td_chat_attachments (
  message_id uuid primary key
    references public.td_chat_messages(id) on delete cascade,
  upload_id uuid not null unique
    references public.td_chat_media_uploads(id)
);

create table if not exists public.td_chat_status_posts (
  id uuid primary key,
  employee_id uuid not null references public.employees(id),
  body text not null default '' check(char_length(body)<=700),
  upload_id uuid unique references public.td_chat_media_uploads(id),
  audience uuid[],
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '24 hours',
  deleted_at timestamptz,
  check(body<>'' or upload_id is not null)
);

create index if not exists td_chat_status_expiry
  on public.td_chat_status_posts(expires_at,created_at desc);

create table if not exists public.td_chat_status_views (
  status_id uuid not null
    references public.td_chat_status_posts(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  viewed_at timestamptz not null default now(),
  primary key(status_id,employee_id)
);

create or replace function public.td_status_can_read(p_id uuid)
returns boolean
language sql stable security definer set search_path=''
as $$
  select public.td_share_active() and exists(
    select 1
    from public.td_chat_status_posts s
    join public.employees author on author.id=s.employee_id
    where s.id=p_id
      and s.expires_at>now()
      and s.deleted_at is null
      and (to_jsonb(author)->>'is_banned') is distinct from 'true'
      and (
        s.employee_id=auth.uid()
        or (
          (s.audience is null or auth.uid()=any(s.audience))
          and not exists(
            select 1
            from public.td_chat_rooms r
            join public.td_chat_members a on a.room_id=r.id
            join public.td_chat_members b on b.room_id=r.id
            join public.td_chat_blocks x on x.room_id=r.id
            where r.kind='direct'
              and a.employee_id=auth.uid()
              and b.employee_id=s.employee_id
          )
        )
      )
  );
$$;

alter table public.td_chat_hidden_messages enable row level security;
alter table public.td_chat_media_uploads enable row level security;
alter table public.td_chat_attachments enable row level security;
alter table public.td_chat_status_posts enable row level security;
alter table public.td_chat_status_views enable row level security;

revoke all on
  public.td_chat_hidden_messages,
  public.td_chat_media_uploads,
  public.td_chat_attachments,
  public.td_chat_status_posts,
  public.td_chat_status_views
from public,anon,authenticated;

grant select on
  public.td_chat_hidden_messages,
  public.td_chat_status_views
to authenticated;

grant select(
  id,employee_id,body,upload_id,created_at,expires_at,deleted_at
) on public.td_chat_status_posts to authenticated;

grant all on
  public.td_chat_hidden_messages,
  public.td_chat_media_uploads,
  public.td_chat_attachments,
  public.td_chat_status_posts,
  public.td_chat_status_views
to service_role;

drop policy if exists share_hidden_read
  on public.td_chat_hidden_messages;

create policy share_hidden_read
on public.td_chat_hidden_messages
for select to authenticated
using(employee_id=auth.uid() and public.td_share_active());

drop policy if exists share_status_read
  on public.td_chat_status_posts;

create policy share_status_read
on public.td_chat_status_posts
for select to authenticated
using(public.td_status_can_read(id));

drop policy if exists share_views_read
  on public.td_chat_status_views;

create policy share_views_read
on public.td_chat_status_views
for select to authenticated
using(
  public.td_status_can_read(status_id)
  and (
    employee_id=auth.uid()
    or exists(
      select 1 from public.td_chat_status_posts s
      where s.id=status_id and s.employee_id=auth.uid()
    )
  )
);

insert into storage.buckets(
  id,name,public,file_size_limit,allowed_mime_types
)
values(
  'td-chat-media',
  'td-chat-media',
  false,
  26214400,
  array[
    'image/jpeg','image/png','image/webp',
    'image/gif','video/mp4','video/webm'
  ]
)
on conflict(id) do update
set public=false,
    file_size_limit=26214400,
    allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.td_share_file_write(p_name text)
returns boolean
language sql stable security definer set search_path=''
as $$
  select public.td_share_active() and exists(
    select 1 from public.td_chat_media_uploads u
    where u.object_path=p_name
      and u.employee_id=auth.uid()
      and not u.used
      and u.expires_at>now()
      and (u.for_status or public.td_share_member(u.room_id))
  );
$$;

create or replace function public.td_share_file_read(p_name text)
returns boolean
language sql stable security definer set search_path=''
as $$
  select public.td_share_active() and exists(
    select 1
    from public.td_chat_media_uploads u
    where u.object_path=p_name
      and (
        (
          not u.used
          and u.employee_id=auth.uid()
          and u.expires_at>now()
        )
        or exists(
          select 1
          from public.td_chat_attachments a
          join public.td_chat_messages m on m.id=a.message_id
          where a.upload_id=u.id
            and m.deleted_at is null
            and public.td_chat_can_read(m.room_id)
            and not exists(
              select 1 from public.td_chat_hidden_messages h
              where h.employee_id=auth.uid() and h.message_id=m.id
            )
        )
        or exists(
          select 1 from public.td_chat_status_posts s
          where s.upload_id=u.id and public.td_status_can_read(s.id)
        )
      )
  );
$$;

drop policy if exists share_media_read on storage.objects;
create policy share_media_read
on storage.objects for select to authenticated
using(
  bucket_id='td-chat-media'
  and public.td_share_file_read(name)
);

drop policy if exists share_media_insert on storage.objects;
create policy share_media_insert
on storage.objects for insert to authenticated
with check(
  bucket_id='td-chat-media'
  and public.td_share_file_write(name)
);

drop policy if exists share_media_delete on storage.objects;
create policy share_media_delete
on storage.objects for delete to authenticated
using(
  bucket_id='td-chat-media'
  and public.td_share_file_write(name)
);

drop policy if exists share_media_read_guard on storage.objects;
create policy share_media_read_guard
on storage.objects as restrictive for select to public
using(
  bucket_id<>'td-chat-media'
  or public.td_share_file_read(name)
);

drop policy if exists share_media_insert_guard on storage.objects;
create policy share_media_insert_guard
on storage.objects as restrictive for insert to public
with check(
  bucket_id<>'td-chat-media'
  or public.td_share_file_write(name)
);

drop policy if exists share_media_delete_guard on storage.objects;
create policy share_media_delete_guard
on storage.objects as restrictive for delete to public
using(
  bucket_id<>'td-chat-media'
  or public.td_share_file_write(name)
);

drop policy if exists share_media_update_guard on storage.objects;
create policy share_media_update_guard
on storage.objects as restrictive for update to public
using(bucket_id<>'td-chat-media')
with check(bucket_id<>'td-chat-media');

create or replace function public.td_chat_media_prepare(
  p_id uuid,
  p_room uuid,
  p_status boolean,
  p_mime text,
  p_bytes bigint
)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  ext text;
  old public.td_chat_media_uploads;
begin
  if not public.td_share_active() then
    raise exception 'Employee sign-in required';
  end if;

  if p_id is null or p_status is null
    or p_bytes is null or p_bytes<1 then
    raise exception 'Choose a media file';
  end if;

  ext:=case p_mime
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
    when 'image/webp' then 'webp'
    when 'image/gif' then 'gif'
    when 'video/mp4' then 'mp4'
    when 'video/webm' then 'webm'
    else null
  end;

  if ext is null
    or p_bytes>(
      case when p_mime like 'image/%'
        then 8388608 else 26214400
      end
    )
  then
    raise exception
      'Use JPG, PNG, WebP or GIF up to 8 MB, or MP4/WebM up to 25 MB';
  end if;

  if (p_status and p_room is not null)
    or (
      not p_status
      and (
        p_room is null
        or not public.td_share_member(p_room)
      )
    )
  then
    raise exception 'Conversation access denied';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('chat-upload:'||p_id::text,0)
  );

  select * into old
  from public.td_chat_media_uploads
  where id=p_id;

  if found then
    if old.employee_id<>auth.uid()
      or old.room_id is distinct from p_room
      or old.for_status<>p_status
      or old.mime<>p_mime
      or old.bytes<>p_bytes
    then
      raise exception 'Upload ID already used';
    end if;

    if not old.used and old.expires_at<=now() then
      raise exception 'Upload expired. Choose the file again';
    end if;
  else
    if exists(
      select 1 from public.td_chat_messages
      where sender_id=auth.uid() and client_id=p_id
    ) then
      raise exception 'Upload ID already used';
    end if;

    insert into public.td_chat_media_uploads(
      id,employee_id,room_id,for_status,object_path,mime,bytes
    )
    values(
      p_id,auth.uid(),p_room,p_status,
      auth.uid()::text||'/'||p_id::text||'.'||ext,
      p_mime,p_bytes
    )
    returning * into old;
  end if;

  return jsonb_build_object(
    'path',old.object_path,
    'used',old.used
  );
end;
$$;

create or replace function public.td_chat_media_send(
  p_upload uuid,
  p_caption text
)
returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  u public.td_chat_media_uploads;
  result uuid;
  caption text;
begin
  if not public.td_share_active() then
    raise exception 'Employee sign-in required';
  end if;

  select * into u
  from public.td_chat_media_uploads
  where id=p_upload
  for update;

  if not found
    or u.employee_id<>auth.uid()
    or u.for_status
    or not public.td_share_member(u.room_id)
  then
    raise exception 'Conversation access denied';
  end if;

  if u.used then
    select message_id into result
    from public.td_chat_attachments
    where upload_id=u.id;
    return result;
  end if;

  if u.expires_at<=now()
    or p_caption is null
    or char_length(p_caption)>2000
  then
    raise exception 'Upload expired or caption is too long';
  end if;

  if not exists(
    select 1 from storage.objects o
    where o.bucket_id='td-chat-media'
      and o.name=u.object_path
      and o.metadata->>'mimetype'=u.mime
      and (o.metadata->>'size')::bigint=u.bytes
  ) then
    raise exception 'The upload is incomplete. Try sending again';
  end if;

  caption:=coalesce(
    nullif(btrim(p_caption),''),
    case when u.mime like 'image/%' then 'Photo' else 'Video' end
  );

  result:=public.td_chat_send(u.room_id,caption,u.id);

  insert into public.td_chat_attachments(message_id,upload_id)
  values(result,u.id);

  update public.td_chat_media_uploads
  set used=true where id=u.id;

  return result;
end;
$$;

create or replace function public.td_chat_hide_message(p_message uuid)
returns void
language plpgsql security definer set search_path=''
as $$
declare
  room uuid;
begin
  select room_id into room
  from public.td_chat_messages
  where id=p_message;

  if not public.td_share_active()
    or room is null
    or not public.td_chat_can_read(room)
  then
    raise exception 'Message access denied';
  end if;

  insert into public.td_chat_hidden_messages(employee_id,message_id)
  values(auth.uid(),p_message)
  on conflict do nothing;
end;
$$;

create or replace function public.td_chat_page_v3(
  p_room uuid,
  p_before_in timestamptz default null,
  p_before_id uuid default null,
  p_search text default ''
)
returns setof jsonb
language sql stable security definer set search_path=''
as $$
  select to_jsonb(m)||jsonb_build_object(
    'attachment',
      case
        when u.id is null or m.deleted_at is not null then null
        else jsonb_build_object(
          'path',u.object_path,'mime',u.mime,'bytes',u.bytes
        )
      end,
    'recipients',s.recipients,
    'delivered',s.delivered,
    'seen',s.seen,
    'my_delivered_at',s.my_delivered_at,
    'my_read_at',s.my_read_at
  )
  from (
    select msg.*
    from public.td_chat_messages msg
    where msg.room_id=p_room
      and public.td_share_active()
      and public.td_chat_can_read(p_room)
      and not exists(
        select 1 from public.td_chat_hidden_messages h
        where h.message_id=msg.id and h.employee_id=auth.uid()
      )
      and (
        (p_before_in is null and p_before_id is null)
        or (msg.created_at,msg.id)<(p_before_in,p_before_id)
      )
      and (
        coalesce(btrim(p_search),'')=''
        or strpos(
          lower(msg.body),
          lower(left(btrim(p_search),120))
        )>0
      )
    order by msg.created_at desc,msg.id desc
    limit 51
  ) m
  left join public.td_chat_attachments a on a.message_id=m.id
  left join public.td_chat_media_uploads u on u.id=a.upload_id
  cross join lateral(
    select
      count(*) recipients,
      count(r.delivered_at) delivered,
      count(r.read_at) seen,
      max(r.delivered_at)
        filter(where r.employee_id=auth.uid()) my_delivered_at,
      max(r.read_at)
        filter(where r.employee_id=auth.uid()) my_read_at
    from public.td_chat_receipts r
    where r.message_id=m.id
  ) s
  order by m.created_at desc,m.id desc;
$$;

create or replace function public.td_chat_inbox_v2()
returns setof jsonb
language sql stable security definer set search_path=''
as $$
  select to_jsonb(i)||jsonb_build_object(
    'last_body',m.body,
    'last_at',coalesce(m.created_at,r.created_at),
    'unread',(
      select count(*)
      from public.td_chat_receipts receipt
      join public.td_chat_messages msg on msg.id=receipt.message_id
      where receipt.room_id=i.room_id
        and receipt.employee_id=auth.uid()
        and receipt.read_at is null
        and msg.deleted_at is null
        and not exists(
          select 1 from public.td_chat_hidden_messages h
          where h.employee_id=auth.uid() and h.message_id=msg.id
        )
    )
  )
  from public.td_chat_inbox() i
  join public.td_chat_rooms r on r.id=i.room_id
  left join lateral(
    select msg.*
    from public.td_chat_messages msg
    where msg.room_id=i.room_id
      and not exists(
        select 1 from public.td_chat_hidden_messages h
        where h.employee_id=auth.uid() and h.message_id=msg.id
      )
    order by msg.created_at desc,msg.id desc
    limit 1
  ) m on true
  where public.td_share_active()
  order by coalesce(m.created_at,r.created_at) desc,r.id;
$$;

create or replace function public.td_chat_inbox_signals_v2(
  p_rooms uuid[]
)
returns table(
  room_id uuid,
  blocked_by_other boolean,
  last_message jsonb,
  last_body text,
  last_at timestamptz
)
language sql stable security definer set search_path=''
as $$
  select
    r.id,
    r.kind='direct' and exists(
      select 1 from public.td_chat_blocks b
      where b.room_id=r.id and b.blocker_id<>auth.uid()
    ),
    case when m.id is null then null else jsonb_build_object(
      'id',m.id,
      'client_id',m.client_id,
      'sender_id',m.sender_id,
      'created_at',m.created_at,
      'recipients',case when m.sender_id=auth.uid() then s.total else 0 end,
      'delivered',case when m.sender_id=auth.uid() then s.delivered else 0 end,
      'seen',case when m.sender_id=auth.uid() then s.seen else 0 end
    ) end,
    m.body,
    coalesce(m.created_at,r.created_at)
  from public.td_chat_rooms r
  left join lateral(
    select msg.*
    from public.td_chat_messages msg
    where msg.room_id=r.id
      and not exists(
        select 1 from public.td_chat_hidden_messages h
        where h.employee_id=auth.uid() and h.message_id=msg.id
      )
    order by msg.created_at desc,msg.id desc
    limit 1
  ) m on true
  cross join lateral(
    select
      count(*) total,
      count(rec.delivered_at) delivered,
      count(rec.read_at) seen
    from public.td_chat_receipts rec
    where rec.message_id=m.id
  ) s
  where cardinality(p_rooms)<=500
    and r.id=any(p_rooms)
    and public.td_share_active()
    and public.td_chat_can_read(r.id);
$$;

create or replace function public.td_chat_reply_context_v2(
  p_room uuid,
  p_messages uuid[]
)
returns jsonb
language sql stable security definer set search_path=''
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'message_id',m.id,
      'reply_to',parent.id,
      'reply_sender',parent.sender_id,
      'reply_deleted',parent.id is null or parent.deleted_at is not null,
      'reply_body',
        case
          when parent.id is null or parent.deleted_at is not null
            then 'Original message unavailable'
          when parent.kind='voice' then 'Voice note'
          else left(parent.body,180)
        end
    )),
    '[]'::jsonb
  )
  from public.td_chat_message_replies r
  join public.td_chat_messages m on m.id=r.message_id
  left join public.td_chat_messages parent
    on parent.id=r.reply_to
    and parent.room_id=m.room_id
    and not exists(
      select 1 from public.td_chat_hidden_messages h
      where h.employee_id=auth.uid() and h.message_id=parent.id
    )
  where cardinality(p_messages)<=100
    and m.room_id=p_room
    and m.id=any(p_messages)
    and m.deleted_at is null
    and public.td_share_active()
    and public.td_chat_can_read(p_room);
$$;

create or replace function public.td_chat_status_publish(
  p_id uuid,
  p_body text,
  p_upload uuid default null,
  p_audience uuid[] default null
)
returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  old public.td_chat_status_posts;
  u public.td_chat_media_uploads;
begin
  if not public.td_share_active() then
    raise exception 'Employee sign-in required';
  end if;

  if p_id is null
    or p_body is null
    or char_length(p_body)>700
    or (btrim(p_body)='' and p_upload is null)
  then
    raise exception
      'Add text or a photo/video, with a caption up to 700 characters';
  end if;

  if p_audience is not null and (
    cardinality(p_audience) not between 1 and 200
    or exists(
      select 1 from unnest(p_audience) x
      where x is null or not exists(
        select 1 from public.employees e
        where e.id=x
          and (to_jsonb(e)->>'is_banned') is distinct from 'true'
      )
    )
  ) then
    raise exception 'Choose 1–200 active colleagues or Everyone';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('chat-status:'||p_id::text,0)
  );

  select * into old
  from public.td_chat_status_posts
  where id=p_id;

  if found then
    if old.employee_id=auth.uid()
      and old.body=btrim(p_body)
      and old.upload_id is not distinct from p_upload
      and old.audience is not distinct from p_audience
    then
      return p_id;
    end if;

    raise exception 'Status ID already used';
  end if;

  if p_upload is not null then
    select * into u
    from public.td_chat_media_uploads
    where id=p_upload
    for update;

    if not found
      or u.employee_id<>auth.uid()
      or not u.for_status
      or u.used
      or u.expires_at<=now()
    then
      raise exception 'Status upload unavailable';
    end if;

    if not exists(
      select 1 from storage.objects o
      where o.bucket_id='td-chat-media'
        and o.name=u.object_path
        and o.metadata->>'mimetype'=u.mime
        and (o.metadata->>'size')::bigint=u.bytes
    ) then
      raise exception 'The upload is incomplete. Try again';
    end if;

    update public.td_chat_media_uploads
    set used=true where id=u.id;
  end if;

  insert into public.td_chat_status_posts(
    id,employee_id,body,upload_id,audience
  )
  values(p_id,auth.uid(),btrim(p_body),p_upload,p_audience);

  return p_id;
end;
$$;

create or replace function public.td_chat_status_feed()
returns jsonb
language sql stable security definer set search_path=''
as $$
  select jsonb_build_object(
    'server_now',now(),
    'posts',coalesce((
      select jsonb_agg(to_jsonb(row) order by row.created_at desc)
      from (
        select
          s.id,s.employee_id,s.body,s.created_at,s.expires_at,
          case when u.id is null then null else jsonb_build_object(
            'path',u.object_path,'mime',u.mime,'bytes',u.bytes
          ) end attachment,
          exists(
            select 1 from public.td_chat_status_views v
            where v.status_id=s.id and v.employee_id=auth.uid()
          ) viewed,
          case when s.employee_id=auth.uid() then (
            select count(*) from public.td_chat_status_views v
            where v.status_id=s.id
          ) else null end view_count
        from public.td_chat_status_posts s
        left join public.td_chat_media_uploads u on u.id=s.upload_id
        where public.td_status_can_read(s.id)
        order by s.created_at desc,s.id
        limit 200
      ) row
    ),'[]'::jsonb)
  );
$$;

create or replace function public.td_chat_status_seen(p_id uuid)
returns void
language plpgsql security definer set search_path=''
as $$
begin
  if not public.td_status_can_read(p_id) then
    raise exception 'This status has expired or is unavailable';
  end if;

  if not exists(
    select 1 from public.td_chat_status_posts
    where id=p_id and employee_id=auth.uid()
  ) then
    insert into public.td_chat_status_views(status_id,employee_id)
    values(p_id,auth.uid())
    on conflict do nothing;
  end if;
end;
$$;

create or replace function public.td_chat_status_delete(p_id uuid)
returns void
language plpgsql security definer set search_path=''
as $$
begin
  if not public.td_share_active() or not exists(
    select 1 from public.td_chat_status_posts
    where id=p_id and employee_id=auth.uid()
  ) then
    raise exception 'You can delete only your own status';
  end if;

  update public.td_chat_status_posts
  set deleted_at=coalesce(deleted_at,now())
  where id=p_id and employee_id=auth.uid();
end;
$$;

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure signature
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname=any(array[
        'td_share_active',
        'td_share_member',
        'td_status_can_read',
        'td_share_file_write',
        'td_share_file_read',
        'td_chat_media_prepare',
        'td_chat_media_send',
        'td_chat_hide_message',
        'td_chat_page_v3',
        'td_chat_inbox_v2',
        'td_chat_inbox_signals_v2',
        'td_chat_reply_context_v2',
        'td_chat_status_publish',
        'td_chat_status_feed',
        'td_chat_status_seen',
        'td_chat_status_delete'
      ])
  loop
    execute format(
      'revoke all on function %s from public,anon,authenticated',
      f.signature
    );
    execute format(
      'grant execute on function %s to authenticated,service_role',
      f.signature
    );
  end loop;
end;
$$;

grant execute on function
  public.td_share_file_read(text),
  public.td_share_file_write(text),
  public.td_share_active(),
  public.td_share_member(uuid),
  public.td_status_can_read(uuid)
to anon;

do $$
begin
  if exists(
    select 1 from pg_publication where pubname='supabase_realtime'
  ) and not exists(
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='td_chat_hidden_messages'
  ) then
    alter publication supabase_realtime
      add table public.td_chat_hidden_messages;
  end if;
end;
$$;

notify pgrst,'reload schema';

commit;