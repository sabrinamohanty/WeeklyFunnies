-- Meanwhile core schema: tables, constraints, and invariants enforced for every role.
--
-- Conventions
-- - Storage paths are object names inside their bucket (no bucket prefix):
--     photos, panels: {paper_id}/{user_id}/{uuid}.{ext}
--     avatars, selfies: {user_id}/{uuid}.{ext}   (not paper-scoped: a user can be in several papers)
-- - Text length checks mirror the API limits (counted in characters) as a second line of defense.
-- - Deleting any row that references a storage object enqueues that object in public.storage_deletions,
--   so rows and files are purged together and the purge can be retried idempotently.

create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

-- ---------- Types ----------

create type public.member_role as enum ('owner', 'member');
create type public.edition_status as enum ('draft', 'published');
create type public.generation_status as enum ('pending', 'generating', 'ready', 'failed');

-- ---------- Helpers ----------

create function app.zodiac_sign(d date) returns text
language sql immutable parallel safe
set search_path = ''
as $$
  select case
    when d is null then null
    when md between 321 and 419 then 'aries'
    when md between 420 and 520 then 'taurus'
    when md between 521 and 620 then 'gemini'
    when md between 621 and 722 then 'cancer'
    when md between 723 and 822 then 'leo'
    when md between 823 and 922 then 'virgo'
    when md between 923 and 1022 then 'libra'
    when md between 1023 and 1121 then 'scorpio'
    when md between 1122 and 1221 then 'sagittarius'
    when md between 120 and 218 then 'aquarius'
    when md between 219 and 320 then 'pisces'
    else 'capricorn'
  end
  from (select (extract(month from d) * 100 + extract(day from d))::int as md) s
$$;

create function app.touch_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------- Profiles ----------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text check (char_length(name) between 1 and 60),
  city_name text check (char_length(city_name) between 1 and 200),
  city_admin1 text check (char_length(city_admin1) <= 200),
  city_country text check (char_length(city_country) <= 200),
  city_country_code char(2),
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  timezone text check (char_length(timezone) between 1 and 64),
  birthday date check (birthday >= date '1900-01-01'),
  zodiac_sign text generated always as (app.zodiac_sign(birthday)) stored,
  avatar_path text unique check (avatar_path like id::text || '/%'),
  last_active_at timestamptz not null default now(),
  logged_out_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_city_complete check (
    (city_name is null) = (lat is null)
    and (lat is null) = (lng is null)
    and (lng is null) = (timezone is null)
  )
);

create trigger profiles_touch before update on public.profiles
for each row execute function app.touch_updated_at();

-- Every auth user gets a profile row, so foreign keys and policies can rely on it.
create function app.handle_new_user() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function app.handle_new_user();

-- Avatar generation state. Server-only: the selfie lives here until approval (or expiry).
create table public.avatar_drafts (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  selfie_path text unique check (selfie_path like user_id::text || '/%'),
  draft_path text unique check (draft_path like user_id::text || '/%'),
  status public.generation_status not null default 'pending',
  error text check (error in ('generation_failed', 'content_blocked', 'provider_unavailable')),
  attempts int not null default 0 check (attempts between 0 and 100),
  tweaks jsonb check (tweaks is null or (jsonb_typeof(tweaks) = 'object' and pg_column_size(tweaks) < 2048)),
  selfie_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger avatar_drafts_touch before update on public.avatar_drafts
for each row execute function app.touch_updated_at();

-- ---------- Papers, members, invites ----------

create table public.papers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger papers_touch before update on public.papers
for each row execute function app.touch_updated_at();

create table public.paper_members (
  paper_id uuid not null references public.papers (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (paper_id, user_id)
);

create unique index paper_members_one_owner on public.paper_members (paper_id) where role = 'owner';
create index paper_members_user_idx on public.paper_members (user_id);

create function app.enforce_member_cap() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Serialize joins per paper so concurrent joins can't exceed the cap.
  perform 1 from public.papers where id = new.paper_id for update;
  if (select count(*) from public.paper_members where paper_id = new.paper_id) >= 12 then
    raise exception 'paper_full' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger paper_members_cap before insert on public.paper_members
for each row execute function app.enforce_member_cap();

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references public.papers (id) on delete cascade,
  -- HMAC-SHA256 of the normalized code, hex. The code itself is never stored.
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  use_count int not null default 0 check (use_count >= 0),
  check (expires_at > created_at)
);

create index invites_paper_idx on public.invites (paper_id);

-- ---------- Editions ----------

create table public.editions (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references public.papers (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  week_end date generated always as (week_start + 6) stored,
  status public.edition_status not null default 'draft',
  published_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (paper_id, week_start),
  unique (id, paper_id),
  check ((status = 'published') = (published_at is not null)),
  check (status = 'draft' or expires_at is not null)
);

create trigger editions_touch before update on public.editions
for each row execute function app.touch_updated_at();

create function app.enforce_edition_transitions() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.paper_id, new.week_start) is distinct from (old.paper_id, old.week_start) then
    raise exception 'edition_immutable' using errcode = 'P0001';
  end if;
  if old.status = 'published' and (new.status, new.published_at) is distinct from (old.status, old.published_at) then
    raise exception 'edition_locked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger editions_transitions before update on public.editions
for each row execute function app.enforce_edition_transitions();

-- ---------- Events ----------

create table public.events (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null,
  paper_id uuid not null,
  user_id uuid not null,
  source_text text not null check (char_length(source_text) between 1 and 500),
  headline text not null check (char_length(headline) between 1 and 120),
  article text not null check (char_length(article) between 1 and 600),
  panel_spec jsonb check (
    panel_spec is null or (jsonb_typeof(panel_spec) = 'object' and pg_column_size(panel_spec) < 4096)
  ),
  panel_path text unique check (panel_path like paper_id::text || '/' || user_id::text || '/%'),
  panel_status public.generation_status not null default 'pending',
  panel_error text check (panel_error in ('generation_failed', 'content_blocked', 'provider_unavailable')),
  serious boolean not null default false,
  in_comic boolean not null default true,
  approved boolean not null default false,
  position smallint not null check (position between 0 and 2),
  notices text[] not null default '{}' check (notices <@ array['fallback_used', 'marked_serious']),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The event's paper must be its edition's paper, and the author must be a member of it.
  foreign key (edition_id, paper_id) references public.editions (id, paper_id) on delete cascade,
  foreign key (paper_id, user_id) references public.paper_members (paper_id, user_id) on delete cascade,
  -- Positions 0..2 per person per edition also cap highlights at 3. Deferred so reorders can swap.
  constraint events_position_unique unique (edition_id, user_id, position) deferrable initially deferred,
  unique (id, paper_id, user_id)
);

create index events_edition_idx on public.events (edition_id);
create index events_user_idx on public.events (user_id);
create index events_expires_idx on public.events (expires_at);

create trigger events_touch before update on public.events
for each row execute function app.touch_updated_at();

-- Published editions are read-only, for every role. Only panel generation results and expiry may
-- still change (a panel can finish after publishing). Deletes stay allowed for retention purges;
-- the API blocks user deletes of published events.
create function app.enforce_event_draft() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  st public.edition_status;
begin
  if tg_op = 'UPDATE' and (new.edition_id, new.paper_id, new.user_id) is distinct from (old.edition_id, old.paper_id, old.user_id) then
    raise exception 'event_immutable' using errcode = 'P0001';
  end if;

  select status into st from public.editions where id = new.edition_id for share;
  if st = 'published' then
    if tg_op = 'INSERT' then
      raise exception 'edition_locked' using errcode = 'P0001';
    end if;
    if (new.source_text, new.headline, new.article, new.panel_spec, new.serious, new.in_comic,
        new.approved, new.position, new.notices)
       is distinct from
       (old.source_text, old.headline, old.article, old.panel_spec, old.serious, old.in_comic,
        old.approved, old.position, old.notices) then
      raise exception 'edition_locked' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger events_draft_only before insert or update on public.events
for each row execute function app.enforce_event_draft();

-- ---------- Photos ----------

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  paper_id uuid not null,
  user_id uuid not null,
  storage_path text not null unique check (
    storage_path like paper_id::text || '/' || user_id::text || '/%'
    and storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png)$'
  ),
  width int not null check (width between 1 and 8192),
  height int not null check (height between 1 and 8192),
  byte_size int not null check (byte_size between 1 and 12582912),
  position smallint not null check (position between 0 and 3),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  -- Ties the photo to its event's paper and author.
  foreign key (event_id, paper_id, user_id) references public.events (id, paper_id, user_id) on delete cascade,
  -- Positions 0..3 also cap photos at 4 per event.
  unique (event_id, position)
);

create index photos_event_idx on public.photos (event_id);
create index photos_expires_idx on public.photos (expires_at);

create function app.enforce_photo_draft() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  st public.edition_status;
begin
  select ed.status into st
  from public.events e join public.editions ed on ed.id = e.edition_id
  where e.id = new.event_id
  for share of ed;

  if tg_op = 'INSERT' and st = 'published' then
    raise exception 'edition_locked' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and (
    (new.event_id, new.paper_id, new.user_id, new.storage_path, new.width, new.height, new.byte_size, new.position)
    is distinct from
    (old.event_id, old.paper_id, old.user_id, old.storage_path, old.width, old.height, old.byte_size, old.position)
  ) then
    raise exception 'photo_immutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger photos_draft_only before insert or update on public.photos
for each row execute function app.enforce_photo_draft();

-- ---------- Horoscopes ----------

create table public.horoscopes (
  sign text not null check (sign in (
    'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
    'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'
  )),
  week_start date not null check (extract(isodow from week_start) = 1),
  text text not null check (char_length(text) between 1 and 600),
  created_at timestamptz not null default now(),
  primary key (sign, week_start)
);

-- ---------- Storage deletion outbox ----------

create table public.storage_deletions (
  bucket text not null check (bucket in ('selfies', 'avatars', 'panels', 'photos')),
  path text not null check (char_length(path) between 1 and 300),
  enqueued_at timestamptz not null default now(),
  attempts int not null default 0,
  primary key (bucket, path)
);

create function app.enqueue_storage_deletion(p_bucket text, p_path text) returns void
language sql
set search_path = ''
as $$
  insert into public.storage_deletions (bucket, path)
  select p_bucket, p_path where p_path is not null
  on conflict do nothing;
$$;

create function app.photos_enqueue_delete() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform app.enqueue_storage_deletion('photos', old.storage_path);
  return old;
end;
$$;

create trigger photos_storage_gc after delete on public.photos
for each row execute function app.photos_enqueue_delete();

create function app.events_enqueue_panel() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform app.enqueue_storage_deletion('panels', old.panel_path);
    return old;
  end if;
  if old.panel_path is distinct from new.panel_path then
    perform app.enqueue_storage_deletion('panels', old.panel_path);
  end if;
  return new;
end;
$$;

create trigger events_storage_gc after update of panel_path or delete on public.events
for each row execute function app.events_enqueue_panel();

create function app.profiles_enqueue_avatar() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform app.enqueue_storage_deletion('avatars', old.avatar_path);
    return old;
  end if;
  if old.avatar_path is distinct from new.avatar_path then
    perform app.enqueue_storage_deletion('avatars', old.avatar_path);
  end if;
  return new;
end;
$$;

create trigger profiles_storage_gc after update of avatar_path or delete on public.profiles
for each row execute function app.profiles_enqueue_avatar();

create function app.avatar_drafts_enqueue() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  promoted boolean;
begin
  if tg_op = 'DELETE' or old.selfie_path is distinct from new.selfie_path then
    perform app.enqueue_storage_deletion('selfies', old.selfie_path);
  end if;
  if tg_op = 'DELETE' or old.draft_path is distinct from new.draft_path then
    -- A draft that was approved is now the profile avatar; keep it.
    select exists (select 1 from public.profiles where avatar_path = old.draft_path) into promoted;
    if not promoted then
      perform app.enqueue_storage_deletion('avatars', old.draft_path);
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger avatar_drafts_storage_gc after update or delete on public.avatar_drafts
for each row execute function app.avatar_drafts_enqueue();
