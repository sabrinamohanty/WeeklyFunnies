-- Aligns with the web frontend: each person picks their own art style (it moves from papers to
-- profiles), and invite codes are 6 characters.

alter table public.profiles
  add column style text not null default 'classic'
  check (style in ('classic', 'manga', 'sketch', 'superhero'));

grant select (style) on public.profiles to authenticated;

alter table public.papers drop column style;

drop function public.create_paper(uuid, text, text);

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

revoke all on function public.create_paper(uuid, text) from public, anon, authenticated;
grant execute on function public.create_paper(uuid, text) to service_role;

-- Short codes can repeat an old, expired code, so hashes are no longer unique across all time.
-- The API checks that no active invite shares a hash before inserting one.
alter table public.invites drop constraint invites_code_hash_key;
create index invites_code_hash_idx on public.invites (code_hash);
