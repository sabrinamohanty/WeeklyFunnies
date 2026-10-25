-- Phase 4: one page per person per week, linked to papers. Replaces the per-highlight `events` table.
--
-- A page holds the author's highlights, one story each, and their 4-panel strip. The same page is
-- linked to every paper they pick that week. Edition deadlines stay in the paper owner's timezone;
-- the page locks at the earliest linked deadline (enforced in the API). The database locks a page
-- once any linked edition is published.
--
-- Storage paths for photos and panels are person-scoped (`{user_id}/{uuid}.ext`) because a page is
-- not paper-scoped.

-- ---------- Neutralize helpers that depend on events / photos so those tables can drop ----------

create or replace function app.can_read_photo_object(p_path text) returns boolean
language sql stable security definer
set search_path = ''
as $$ select false; $$;

create or replace function app.can_read_panel_object(p_path text) returns boolean
language sql stable security definer
set search_path = ''
as $$ select false; $$;

drop table public.photos;
drop table public.events;

revoke execute on function app.event_is_published(uuid) from authenticated;
drop function app.event_is_published(uuid);

drop function app.enforce_event_draft();
drop function app.enforce_photo_draft();
drop function app.events_enqueue_panel();
drop function app.photos_enqueue_delete();

-- ---------- Editions: issue number and save-forever ----------

alter table public.editions add column saved_at timestamptz;
alter table public.editions add column issue_number int default 1;

update public.editions e
set issue_number = sub.n
from (
  select id, row_number() over (partition by paper_id order by week_start) as n
  from public.editions
) sub
where e.id = sub.id;

create function app.assign_issue_number() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select coalesce(max(issue_number), 0) + 1 into new.issue_number
  from public.editions
  where paper_id = new.paper_id;
  return new;
end;
$$;

create trigger editions_issue_number before insert on public.editions
for each row execute function app.assign_issue_number();

alter table public.editions alter column issue_number set not null;
alter table public.editions add constraint editions_issue_positive check (issue_number >= 1);
create unique index editions_paper_issue_idx on public.editions (paper_id, issue_number);

do $$
declare
  c name;
begin
  select conname into c
  from pg_constraint
  where conrelid = 'public.editions'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%expires_at%is not null%';
  if c is not null then
    execute format('alter table public.editions drop constraint %I', c);
  end if;
end
$$;

alter table public.editions add constraint editions_expiry_when_published
  check (status = 'draft' or expires_at is not null or saved_at is not null);
alter table public.editions add constraint editions_saved_clears_expiry
  check (saved_at is null or expires_at is null);

revoke select on public.editions from authenticated;
grant select (
  id, paper_id, week_start, week_end, status, published_at, expires_at, saved_at, issue_number,
  created_at, updated_at
) on public.editions to authenticated;

-- ---------- New types ----------

create type public.page_status as enum ('writing', 'generated', 'approved');
create type public.reaction_kind as enum ('ha', 'aww', 'hooray');

-- ---------- Pages ----------

create table public.pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  week_end date generated always as (week_start + 6) stored,
  status public.page_status not null default 'writing',
  style text not null default 'classic' check (style in ('classic', 'manga', 'sketch', 'superhero')),
  notices text[] not null default '{}' check (notices <@ array['fallback_used', 'stale']),
  regenerations_used int not null default 0 check (regenerations_used between 0 and 5),
  rewrites_used int not null default 0 check (rewrites_used between 0 and 10),
  redraws_used int not null default 0 check (redraws_used between 0 and 12),
  generated_at timestamptz,
  approved_at timestamptz,
  comic_title text check (comic_title is null or char_length(comic_title) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start),
  unique (id, user_id),
  check ((generated_at is null) = (status = 'writing')),
  check ((approved_at is not null) = (status = 'approved'))
);

create index pages_user_idx on public.pages (user_id);
create trigger pages_touch before update on public.pages
for each row execute function app.touch_updated_at();

create table public.page_papers (
  page_id uuid not null,
  user_id uuid not null,
  paper_id uuid not null,
  edition_id uuid not null,
  primary key (page_id, paper_id),
  foreign key (page_id, user_id) references public.pages (id, user_id) on delete cascade,
  foreign key (edition_id, paper_id) references public.editions (id, paper_id) on delete cascade,
  foreign key (paper_id, user_id) references public.paper_members (paper_id, user_id) on delete cascade
);

create index page_papers_edition_idx on public.page_papers (edition_id);
create index page_papers_paper_idx on public.page_papers (paper_id);

create table public.highlights (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null,
  user_id uuid not null,
  text text not null check (char_length(text) between 1 and 500),
  serious boolean not null default false,
  in_comic boolean not null default true,
  position smallint not null check (position between 0 and 2),
  notices text[] not null default '{}' check (notices <@ array['marked_serious']),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (page_id, user_id) references public.pages (id, user_id) on delete cascade,
  unique (id, page_id),
  unique (id, user_id),
  unique (page_id, position) deferrable initially deferred,
  check (not serious or not in_comic)
);

create index highlights_page_idx on public.highlights (page_id);
create trigger highlights_touch before update on public.highlights
for each row execute function app.touch_updated_at();

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  highlight_id uuid not null,
  user_id uuid not null,
  storage_path text not null unique check (
    storage_path like user_id::text || '/%'
    and storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png)$'
  ),
  width int not null check (width between 1 and 8192),
  height int not null check (height between 1 and 8192),
  byte_size int not null check (byte_size between 1 and 12582912),
  position smallint not null check (position between 0 and 3),
  created_at timestamptz not null default now(),
  foreign key (highlight_id, user_id) references public.highlights (id, user_id) on delete cascade,
  unique (highlight_id, position)
);

create index photos_highlight_idx on public.photos (highlight_id);

create table public.stories (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null,
  highlight_id uuid not null unique,
  user_id uuid not null,
  section text not null check (section in (
    'news', 'sports', 'pets', 'campus', 'work', 'food', 'travel',
    'arts', 'family', 'home', 'outdoors', 'milestones'
  )),
  headline text not null check (char_length(headline) between 1 and 120),
  body text not null check (char_length(body) between 1 and 600),
  foreign key (page_id, user_id) references public.pages (id, user_id) on delete cascade,
  foreign key (highlight_id, user_id) references public.highlights (id, user_id) on delete cascade,
  unique (id, page_id)
);

create index stories_page_idx on public.stories (page_id);

create table public.panels (
  page_id uuid not null,
  idx smallint not null check (idx between 0 and 3),
  user_id uuid not null,
  highlight_id uuid not null,
  caption text check (caption is null or char_length(caption) between 1 and 120),
  dialogue jsonb not null default '[]'::jsonb check (
    jsonb_typeof(dialogue) = 'array' and pg_column_size(dialogue) < 2048
  ),
  scene text not null check (char_length(scene) between 1 and 2000),
  storage_path text unique check (
    storage_path is null
    or (
      storage_path like user_id::text || '/%'
      and storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$'
    )
  ),
  status public.generation_status not null default 'pending',
  error text check (error in ('generation_failed', 'content_blocked', 'provider_unavailable')),
  updated_at timestamptz not null default now(),
  primary key (page_id, idx),
  foreign key (page_id, user_id) references public.pages (id, user_id) on delete cascade,
  foreign key (highlight_id, user_id) references public.highlights (id, user_id) on delete cascade
);

create index panels_user_idx on public.panels (user_id);
create trigger panels_touch before update on public.panels
for each row execute function app.touch_updated_at();

create table public.reactions (
  edition_id uuid not null references public.editions (id) on delete cascade,
  story_id uuid not null references public.stories (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  reaction public.reaction_kind not null,
  created_at timestamptz not null default now(),
  primary key (edition_id, story_id, user_id)
);

create index reactions_story_idx on public.reactions (story_id);

-- ---------- Published-edition lock (deadline lock is timezone-aware and lives in the API) ----------

create function app.page_has_published_edition(p_page uuid) returns boolean
language sql stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.page_papers pp
    join public.editions ed on ed.id = pp.edition_id
    where pp.page_id = p_page and ed.status = 'published'
  );
$$;

create function app.enforce_page_draft() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.user_id, new.week_start) is distinct from (old.user_id, old.week_start) then
    raise exception 'page_immutable' using errcode = 'P0001';
  end if;
  if app.page_has_published_edition(new.id) then
    raise exception 'edition_locked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger pages_draft_only before update on public.pages
for each row execute function app.enforce_page_draft();

create function app.enforce_page_paper_draft() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  st public.edition_status;
begin
  select status into st from public.editions where id = new.edition_id for share;
  if st = 'published' then
    raise exception 'edition_locked' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and (new.page_id, new.paper_id, new.user_id, new.edition_id)
      is distinct from (old.page_id, old.paper_id, old.user_id, old.edition_id) then
    raise exception 'page_paper_immutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger page_papers_draft_only before insert or update on public.page_papers
for each row execute function app.enforce_page_paper_draft();

create function app.enforce_highlight_draft() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (new.page_id, new.user_id) is distinct from (old.page_id, old.user_id) then
    raise exception 'highlight_immutable' using errcode = 'P0001';
  end if;
  if app.page_has_published_edition(new.page_id) then
    raise exception 'edition_locked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger highlights_draft_only before insert or update on public.highlights
for each row execute function app.enforce_highlight_draft();

create function app.enforce_story_draft() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if app.page_has_published_edition(new.page_id) then
    raise exception 'edition_locked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger stories_draft_only before insert or update on public.stories
for each row execute function app.enforce_story_draft();

create function app.enforce_panel_draft() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and app.page_has_published_edition(new.page_id) then
    raise exception 'edition_locked' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and app.page_has_published_edition(new.page_id) then
    if (new.page_id, new.idx, new.user_id, new.highlight_id, new.caption, new.dialogue, new.scene)
       is distinct from
       (old.page_id, old.idx, old.user_id, old.highlight_id, old.caption, old.dialogue, old.scene) then
      raise exception 'edition_locked' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger panels_draft_only before insert or update on public.panels
for each row execute function app.enforce_panel_draft();

create function app.enforce_photo_draft() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  page uuid;
begin
  if tg_op = 'UPDATE' then
    raise exception 'photo_immutable' using errcode = 'P0001';
  end if;
  select h.page_id into page from public.highlights h where h.id = new.highlight_id;
  if app.page_has_published_edition(page) then
    raise exception 'edition_locked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger photos_draft_only before insert or update on public.photos
for each row execute function app.enforce_photo_draft();

-- ---------- Storage outbox ----------

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

create function app.panels_enqueue() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform app.enqueue_storage_deletion('panels', old.storage_path);
    return old;
  end if;
  if old.storage_path is distinct from new.storage_path then
    perform app.enqueue_storage_deletion('panels', old.storage_path);
  end if;
  return new;
end;
$$;

create trigger panels_storage_gc after update of storage_path or delete on public.panels
for each row execute function app.panels_enqueue();

-- ---------- Read helpers for storage policies ----------

create function app.can_read_page_content(p_page uuid, p_author uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select p_author = (select auth.uid())
    or exists (
      select 1
      from public.pages pg
      join public.page_papers pp on pp.page_id = pg.id
      join public.editions ed on ed.id = pp.edition_id
      where pg.id = p_page
        and pg.status = 'approved'
        and ed.status = 'published'
        and app.is_member(ed.paper_id)
    );
$$;

create or replace function app.can_read_photo_object(p_path text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.photos p
    join public.highlights h on h.id = p.highlight_id
    where p.storage_path = p_path
      and (
        p.user_id = (select auth.uid())
        or app.can_read_page_content(h.page_id, p.user_id)
      )
  );
$$;

create or replace function app.can_read_panel_object(p_path text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.panels p
    where p.storage_path = p_path
      and (
        p.user_id = (select auth.uid())
        or app.can_read_page_content(p.page_id, p.user_id)
      )
  );
$$;

create function public.save_edition(p_edition uuid, p_saved boolean, p_days int)
returns public.editions
language plpgsql
set search_path = ''
as $$
declare
  published timestamptz;
  row public.editions;
begin
  select published_at into published from public.editions where id = p_edition;
  if p_saved then
    update public.editions set saved_at = now(), expires_at = null where id = p_edition returning * into row;
  else
    update public.editions
      set saved_at = null,
          expires_at = published + make_interval(days => p_days)
      where id = p_edition
      returning * into row;
  end if;
  return row;
end;
$$;

revoke all on function public.save_edition(uuid, boolean, int) from public, anon, authenticated;
grant execute on function public.save_edition(uuid, boolean, int) to service_role;

grant execute on function
  app.page_has_published_edition(uuid),
  app.can_read_page_content(uuid, uuid),
  app.can_read_photo_object(text),
  app.can_read_panel_object(text)
to authenticated;

-- ---------- RLS ----------

alter table public.pages enable row level security;
alter table public.page_papers enable row level security;
alter table public.highlights enable row level security;
alter table public.photos enable row level security;
alter table public.stories enable row level security;
alter table public.panels enable row level security;
alter table public.reactions enable row level security;

grant select (
  id, user_id, week_start, week_end, status, style, notices, regenerations_used, rewrites_used,
  redraws_used, generated_at, approved_at, comic_title, created_at, updated_at
) on public.pages to authenticated;
grant select (page_id, user_id, paper_id, edition_id) on public.page_papers to authenticated;
grant select (id, page_id, user_id, serious, in_comic, position, notices, created_at, updated_at)
  on public.highlights to authenticated;
grant select (id, highlight_id, user_id, width, height, position, created_at)
  on public.photos to authenticated;
grant select (id, page_id, highlight_id, user_id, section, headline, body)
  on public.stories to authenticated;
grant select (page_id, idx, user_id, highlight_id, caption, dialogue, status, error)
  on public.panels to authenticated;
grant select (edition_id, story_id, user_id, reaction, created_at) on public.reactions to authenticated;
grant delete on public.photos to authenticated;

create policy pages_select_own on public.pages
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy page_papers_select on public.page_papers
  for select to authenticated
  using (app.is_member(paper_id));

create policy highlights_select_own on public.highlights
  for select to authenticated
  using (user_id = (select auth.uid()));

create function app.photo_highlight_page(p_highlight uuid) returns uuid
language sql stable security definer
set search_path = ''
as $$
  select page_id from public.highlights where id = p_highlight;
$$;

grant execute on function app.photo_highlight_page(uuid) to authenticated;

create policy photos_select on public.photos
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or app.can_read_page_content(app.photo_highlight_page(highlight_id), user_id)
  );

create policy photos_delete_own on public.photos
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy stories_select on public.stories
  for select to authenticated
  using (app.can_read_page_content(page_id, user_id));

create policy panels_select on public.panels
  for select to authenticated
  using (app.can_read_page_content(page_id, user_id));

create policy reactions_select on public.reactions
  for select to authenticated
  using (
    exists (
      select 1 from public.editions ed
      where ed.id = edition_id and app.is_member(ed.paper_id)
    )
  );
