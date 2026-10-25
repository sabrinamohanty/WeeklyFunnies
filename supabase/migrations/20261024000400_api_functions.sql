-- Server-only functions the API calls through the service role. None are executable by app roles.

-- ---------- Rate limiting ----------
-- Fixed-window counters shared by every serverless instance. Keys are hashed by the API, so no raw
-- IPs or user ids are stored. Unlogged: losing counters on a crash is acceptable.

create unlogged table public.rate_limits (
  key text primary key check (key ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  count int not null
);

alter table public.rate_limits enable row level security;

create function public.rate_limit_hit(p_key text, p_limit int, p_window_seconds int)
returns table (allowed boolean, retry_after_seconds int)
language plpgsql
set search_path = ''
as $$
declare
  v_start timestamptz;
  v_count int;
  v_window interval := make_interval(secs => p_window_seconds);
begin
  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update set
    window_start = case when r.window_start <= now() - v_window then now() else r.window_start end,
    count = case when r.window_start <= now() - v_window then 1 else r.count + 1 end
  returning r.window_start, r.count into v_start, v_count;

  allowed := v_count <= p_limit;
  retry_after_seconds := case
    when allowed then 0
    else greatest(1, ceil(extract(epoch from (v_start + v_window - now())))::int)
  end;
  return next;
end;
$$;

create function public.rate_limit_prune(p_older_than_seconds int default 3600) returns int
language sql
set search_path = ''
as $$
  with d as (
    delete from public.rate_limits
    where window_start < now() - make_interval(secs => p_older_than_seconds)
    returning 1
  )
  select count(*)::int from d;
$$;

-- ---------- Papers ----------

-- Creates a paper and its owner membership in one transaction.
create function public.create_paper(p_user uuid, p_name text) returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_paper uuid;
begin
  insert into public.papers (name, created_by) values (p_name, p_user) returning id into v_paper;
  insert into public.paper_members (paper_id, user_id, role) values (v_paper, p_user, 'owner');
  return v_paper;
end;
$$;

-- Joins a paper by invite code hash. Idempotent for existing members. Unknown, revoked, and expired
-- codes all raise the same error so callers can't tell them apart.
create function public.join_paper(p_code_hash text, p_user uuid) returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_invite uuid;
  v_paper uuid;
begin
  select id, paper_id into v_invite, v_paper
  from public.invites
  where code_hash = p_code_hash and revoked_at is null and expires_at > now()
  for update;

  if v_invite is null then
    raise exception 'invite_not_found' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.paper_members where paper_id = v_paper and user_id = p_user) then
    return v_paper;
  end if;

  insert into public.paper_members (paper_id, user_id, role) values (v_paper, p_user, 'member');
  update public.invites set use_count = use_count + 1 where id = v_invite;
  return v_paper;
end;
$$;

-- ---------- Privileges ----------
-- Functions are executable by PUBLIC by default, which would expose them over the REST API.

revoke all on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;
revoke all on function public.rate_limit_prune(int) from public, anon, authenticated;
revoke all on function public.create_paper(uuid, text) from public, anon, authenticated;
revoke all on function public.join_paper(text, uuid) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, int, int) to service_role;
grant execute on function public.rate_limit_prune(int) to service_role;
grant execute on function public.create_paper(uuid, text) to service_role;
grant execute on function public.join_paper(text, uuid) to service_role;
