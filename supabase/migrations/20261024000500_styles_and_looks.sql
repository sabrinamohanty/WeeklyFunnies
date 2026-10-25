-- Aligns with the comic pipeline handoff: an art style per paper, a fixed look per person, and at
-- most 8 people per paper (the story prompt's limit).

alter table public.papers
  add column style text not null default 'classic'
  check (style in ('classic', 'manga', 'sketch', 'superhero'));

grant select (style) on public.papers to authenticated;

-- Built server-side from the trait form; reused word for word in every panel prompt.
alter table public.profiles
  add column look text check (look is null or char_length(look) between 1 and 200),
  add column avatar_traits jsonb check (avatar_traits is null or jsonb_typeof(avatar_traits) = 'object');

grant select (look) on public.profiles to authenticated;

create or replace function app.enforce_member_cap() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Serialize joins per paper so concurrent joins can't exceed the cap.
  perform 1 from public.papers where id = new.paper_id for update;
  if (select count(*) from public.paper_members where paper_id = new.paper_id) >= 8 then
    raise exception 'paper_full' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop function public.create_paper(uuid, text);

create function public.create_paper(p_user uuid, p_name text, p_style text default 'classic') returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_paper uuid;
begin
  insert into public.papers (name, style, created_by) values (p_name, p_style, p_user) returning id into v_paper;
  insert into public.paper_members (paper_id, user_id, role) values (v_paper, p_user, 'owner');
  return v_paper;
end;
$$;

revoke all on function public.create_paper(uuid, text, text) from public, anon, authenticated;
grant execute on function public.create_paper(uuid, text, text) to service_role;
