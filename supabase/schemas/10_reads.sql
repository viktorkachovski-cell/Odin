-- Read API. These are SECURITY INVOKER so RLS applies, except get_members, which is
-- a deliberately narrow identity projection over other members' profiles.

create or replace function private.encode_cursor(p_value jsonb)
returns text language sql immutable set search_path = ''
as $$ select encode(convert_to(p_value::text, 'UTF8'), 'hex') $$;

create or replace function private.decode_cursor(p_cursor text)
returns jsonb language plpgsql immutable set search_path = ''
as $$
begin
  if private.norm_text(p_cursor) is null then return null; end if;
  return convert_from(decode(p_cursor, 'hex'), 'UTF8')::jsonb;
exception when others then
  perform private.fail('VALIDATION', 'validation.cursor.invalid');
  return null;
end;
$$;

create or replace function private.page_size(p_limit integer)
returns integer language sql immutable set search_path = ''
as $$ select least(greatest(coalesce(p_limit, 50), 1), 50) $$;

-- Identity only: no email, no locale, no other private preference.
create or replace function public.get_members()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_actor uuid := private.require_actor(); v_household uuid;
begin
  v_household := private.require_active_household(v_actor);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', m.user_id,
      'display_name', coalesce(p.display_name, ''),
      'avatar_ref', p.avatar_ref
    ) order by coalesce(p.display_name, ''), m.user_id)
    from public.memberships m
    left join public.profiles p on p.user_id = m.user_id
    where m.household_id = v_household and m.status = 'active'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.get_my_household()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_household public.households;
  v_profile public.profiles;
begin
  select h.* into v_household from public.households h
  join public.memberships m on m.household_id = h.id
  where m.user_id = v_actor and m.status = 'active';

  select p.* into v_profile from public.profiles p where p.user_id = v_actor;

  return jsonb_build_object(
    'household', case when v_household.id is null then null else jsonb_build_object(
      'id', v_household.id, 'name', v_household.name,
      'seed_locale', v_household.seed_locale, 'created_at', v_household.created_at) end,
    'profile', case when v_profile.user_id is null then null else jsonb_build_object(
      'user_id', v_profile.user_id, 'display_name', v_profile.display_name,
      'avatar_ref', v_profile.avatar_ref, 'locale', v_profile.locale) end);
end;
$$;

-- Counts come from a lateral aggregate, not one query per list.
create or replace function public.get_home()
returns jsonb language sql stable security invoker set search_path = ''
as $$
  with summaries as (
    select l.id, l.kind, l.title, l.subtitle, l.status, l.seed_key,
           l.version, l.created_at, l.updated_at,
           c.total, c.completed
    from public.lists l
    left join lateral (
      select count(*)::int as total,
             count(*) filter (where t.completed)::int as completed
      from public.tasks t
      where t.household_id = l.household_id and t.list_id = l.id
    ) c on true
    where l.status = 'open'
  )
  select jsonb_build_object(
    'templates', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.created_at, s.id)
      from summaries s where s.kind = 'template'), '[]'::jsonb),
    'active', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.created_at, s.id)
      from summaries s where s.kind = 'active'), '[]'::jsonb));
$$;

-- Tasks page ordered (completed ASC, sort_order ASC, id ASC). Totals cover the whole
-- list, never just the loaded page.
create or replace function public.get_list(
  p_list_id uuid, p_cursor text default null, p_limit integer default 50
) returns jsonb language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_list public.lists;
  v_cursor jsonb := private.decode_cursor(p_cursor);
  v_limit integer := private.page_size(p_limit);
  v_tasks jsonb;
  v_last jsonb;
  v_total integer;
  v_completed integer;
begin
  select * into v_list from public.lists l where l.id = p_list_id;
  if not found then perform private.fail('NOT_FOUND'); end if;

  select count(*)::int, count(*) filter (where t.completed)::int
  into v_total, v_completed
  from public.tasks t where t.list_id = p_list_id;

  with page as (
    select t.* from public.tasks t
    where t.list_id = p_list_id
      and (v_cursor is null or (t.completed, t.sort_order, t.id) > (
        (v_cursor ->> 'completed')::boolean,
        (v_cursor ->> 'sort_order')::integer,
        (v_cursor ->> 'id')::uuid))
    order by t.completed, t.sort_order, t.id
    limit v_limit
  )
  select coalesce(jsonb_agg(private.task_dto(page.*) order by page.completed, page.sort_order, page.id), '[]'::jsonb),
         to_jsonb((select jsonb_build_object(
           'completed', p2.completed, 'sort_order', p2.sort_order, 'id', p2.id)
           from page p2 order by p2.completed desc, p2.sort_order desc, p2.id desc limit 1))
  into v_tasks, v_last
  from page;

  return jsonb_build_object(
    'list', private.list_dto(v_list),
    'tasks', v_tasks,
    'total', v_total,
    'completed', v_completed,
    'next_cursor', case
      when jsonb_array_length(v_tasks) < v_limit or v_last is null then null
      else private.encode_cursor(v_last) end);
end;
$$;
