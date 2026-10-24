-- Row-level security and grants.
--
-- Model
-- - The app talks to Postgres only through our API. The API uses the service role, which bypasses RLS,
--   and checks auth, membership, and ownership in code. These policies are defense in depth: if a user
--   token ever reaches PostgREST or Storage directly, it can read only what the rules allow and can
--   write almost nothing.
-- - Direct writes are not granted to `authenticated`, because every write must pass server-side
--   validation and moderation. The one exception is deleting your own photos, which is allowed at any
--   time (the storage file is removed through the deletion outbox).
-- - `anon` gets nothing.
--
-- Read rules
-- - Profiles: only your own row, and only non-sensitive columns. Others' public fields come
--   through the API.
-- - Papers, members, editions: only papers you belong to.
-- - Invites: owners only, without the code hash.
-- - Events and photos: your own always; other members' only once the edition is published.
--   Drafts are private.
-- - Horoscopes: any signed-in user (no personal data).

-- ---------- Lock down default grants ----------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

revoke all on all functions in schema app from public, anon, authenticated;
-- Used by the generated profiles.zodiac_sign column, so writers need it.
grant execute on function app.zodiac_sign(date) to authenticated, service_role;

-- ---------- Enable RLS everywhere ----------

alter table public.profiles enable row level security;
alter table public.avatar_drafts enable row level security;
alter table public.papers enable row level security;
alter table public.paper_members enable row level security;
alter table public.invites enable row level security;
alter table public.editions enable row level security;
alter table public.events enable row level security;
alter table public.photos enable row level security;
alter table public.horoscopes enable row level security;
alter table public.storage_deletions enable row level security;

-- ---------- Policy helpers ----------
-- SECURITY DEFINER so policies can consult membership without recursive RLS evaluation.

create function app.is_member(p_paper uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.paper_members
    where paper_id = p_paper and user_id = (select auth.uid())
  );
$$;

create function app.is_owner(p_paper uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.paper_members
    where paper_id = p_paper and user_id = (select auth.uid()) and role = 'owner'
  );
$$;

create function app.shares_paper(p_user uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.paper_members mine
    join public.paper_members theirs on theirs.paper_id = mine.paper_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = p_user
  );
$$;

create function app.edition_is_published(p_edition uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.editions where id = p_edition and status = 'published');
$$;

create function app.event_is_published(p_event uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events e join public.editions ed on ed.id = e.edition_id
    where e.id = p_event and ed.status = 'published'
  );
$$;

create function app.can_read_photo_object(p_path text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.photos p
    join public.events e on e.id = p.event_id
    join public.editions ed on ed.id = e.edition_id
    where p.storage_path = p_path
      and (
        p.user_id = (select auth.uid())
        or (ed.status = 'published' and app.is_member(ed.paper_id))
      )
  );
$$;

create function app.can_read_panel_object(p_path text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.events e
    join public.editions ed on ed.id = e.edition_id
    where e.panel_path = p_path
      and (
        e.user_id = (select auth.uid())
        or (ed.status = 'published' and app.is_member(ed.paper_id))
      )
  );
$$;

-- Only approved avatars (on a profile) are readable, by their owner and co-members. Drafts are not.
create function app.can_read_avatar_object(p_path text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles pr
    where pr.avatar_path = p_path
      and (pr.id = (select auth.uid()) or app.shares_paper(pr.id))
  );
$$;

grant execute on function
  app.is_member(uuid),
  app.is_owner(uuid),
  app.shares_paper(uuid),
  app.edition_is_published(uuid),
  app.event_is_published(uuid),
  app.can_read_photo_object(text),
  app.can_read_panel_object(text),
  app.can_read_avatar_object(text)
to authenticated;

-- ---------- Grants for authenticated (reads, plus own photo deletes) ----------
-- Column-level: storage paths, source text, birthdays, coordinates, session state, and invite hashes
-- are never readable by app roles, even on rows they can see.

grant select (id, name, city_name, city_admin1, city_country, timezone, zodiac_sign, created_at, updated_at)
  on public.profiles to authenticated;
grant select (id, name, created_by, created_at, updated_at) on public.papers to authenticated;
grant select (paper_id, user_id, role, joined_at) on public.paper_members to authenticated;
grant select (id, paper_id, week_start, week_end, status, published_at, expires_at, created_at, updated_at)
  on public.editions to authenticated;
grant select (id, edition_id, paper_id, user_id, headline, article, panel_status, panel_error, serious,
  in_comic, approved, position, expires_at, created_at, updated_at)
  on public.events to authenticated;
grant select (id, event_id, paper_id, user_id, width, height, position, expires_at, created_at)
  on public.photos to authenticated;
grant select on public.horoscopes to authenticated;
grant select (id, paper_id, created_by, created_at, expires_at, revoked_at, use_count)
  on public.invites to authenticated;
grant delete on public.photos to authenticated;

-- ---------- Policies ----------

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy papers_select_member on public.papers
  for select to authenticated
  using (app.is_member(id));

create policy paper_members_select_member on public.paper_members
  for select to authenticated
  using (app.is_member(paper_id));

create policy invites_select_owner on public.invites
  for select to authenticated
  using (app.is_owner(paper_id));

create policy editions_select_member on public.editions
  for select to authenticated
  using (app.is_member(paper_id));

create policy events_select on public.events
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (app.is_member(paper_id) and app.edition_is_published(edition_id))
  );

create policy photos_select on public.photos
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (app.is_member(paper_id) and app.event_is_published(event_id))
  );

create policy photos_delete_own on public.photos
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy horoscopes_select_signed_in on public.horoscopes
  for select to authenticated
  using (true);

-- avatar_drafts and storage_deletions have no policies: service role only.
