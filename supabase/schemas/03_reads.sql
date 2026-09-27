create or replace function private.encode_cursor(value jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select rtrim(translate(encode(convert_to(value::text, 'utf8'), 'base64'), '+/', '-_'), '=');
$$;

create or replace function private.decode_cursor(value text)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  padded text;
begin
  if value is null then return null; end if;
  padded := translate(value, '-_', '+/');
  padded := padded || repeat('=', (4 - length(padded) % 4) % 4);
  return convert_from(decode(padded, 'base64'), 'utf8')::jsonb;
exception when others then
  return null;
end;
$$;

create or replace function public.get_my_household()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    private.ok_response(to_jsonb(h)),
    private.error_response('NOT_FOUND', 'error.household_required')
  )
  from (select private.active_household_id() as id) active
  left join public.households h on h.id = active.id;
$$;

create or replace function private.get_members()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then private.error_response('UNAUTHENTICATED', 'error.unauthenticated')
    when private.active_household_id() is null then private.error_response('NOT_FOUND', 'error.household_required')
    else private.ok_response(coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', m.user_id,
        'display_name', p.display_name,
        'avatar_ref', p.avatar_ref
      ) order by p.display_name, m.user_id)
      from public.memberships m
      join public.profiles p on p.user_id = m.user_id
      where m.household_id = private.active_household_id()
        and m.status = 'active'
    ), '[]'::jsonb))
  end;
$$;

create or replace function public.get_members()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select private.get_members(); $$;

create or replace function private.get_task_templates()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then private.error_response('UNAUTHENTICATED', 'error.unauthenticated')
    when private.active_household_id() is null then private.error_response('NOT_FOUND', 'error.household_required')
    else private.ok_response(jsonb_build_object(
      'items', coalesce((
        select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'notes', notes)
          order by created_at desc, id desc)
        from (
          select id, title, notes, created_at
          from public.task_templates
          where household_id = private.active_household_id()
          order by created_at desc, id desc
          limit 50
        ) templates
      ), '[]'::jsonb),
      'next_cursor', null
    ))
  end;
$$;

create or replace function public.get_task_templates()
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.get_task_templates(); $$;

create or replace function public.get_home(p_cursor text default null, p_limit integer default 50)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_household uuid := private.active_household_id();
  v_cursor jsonb := private.decode_cursor(p_cursor);
  v_after uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 50);
  v_items jsonb;
  v_last uuid;
begin
  if auth.uid() is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if v_household is null then return private.error_response('NOT_FOUND', 'error.household_required'); end if;
  if p_cursor is not null and v_cursor is null then
    return private.error_response('VALIDATION', 'error.cursor_invalid');
  end if;
  v_after := nullif(v_cursor ->> 'id', '')::uuid;

  with page as (
    select l.id, l.kind, l.title, l.subtitle, l.notes, l.status, l.version,
      count(t.id)::integer as total_tasks,
      count(t.id) filter (where t.completed)::integer as completed_tasks
    from public.lists l
    left join public.tasks t on t.list_id = l.id
    where l.household_id = v_household and l.status = 'open'
      and (v_after is null or l.id > v_after)
    group by l.id
    order by l.id
    limit v_limit + 1
  ), visible as (
    select * from page order by id limit v_limit
  )
  select
    coalesce(jsonb_agg(to_jsonb(visible) order by id), '[]'::jsonb),
    (select id from visible order by id desc limit 1)
  into v_items, v_last
  from visible;

  return private.ok_response(jsonb_build_object(
    'items', v_items,
    'next_cursor', case when (
      select count(*) > v_limit from public.lists
      where household_id = v_household and status = 'open'
        and (v_after is null or id > v_after)
    ) then private.encode_cursor(jsonb_build_object('id', v_last)) else null end
  ));
end;
$$;

create or replace function private.get_home_v2(p_cursor text default null, p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_household uuid := private.active_household_id();
  v_cursor jsonb := private.decode_cursor(p_cursor);
  v_kind_order integer;
  v_sort_order integer;
  v_id uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 50);
  v_items jsonb;
  v_last record;
  v_more boolean;
begin
  if auth.uid() is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if v_household is null then return private.error_response('NOT_FOUND', 'error.household_required'); end if;
  if p_cursor is not null and v_cursor is null then
    return private.error_response('VALIDATION', 'error.cursor_invalid');
  end if;
  if v_cursor is not null then
    begin
      v_kind_order := (v_cursor ->> 'kind_order')::integer;
      v_sort_order := (v_cursor ->> 'sort_order')::integer;
      v_id := (v_cursor ->> 'id')::uuid;
      if v_kind_order is null or v_kind_order not in (0, 1)
        or v_sort_order is null or v_sort_order < 0 or v_id is null then
        return private.error_response('VALIDATION', 'error.cursor_invalid');
      end if;
    exception when others then
      return private.error_response('VALIDATION', 'error.cursor_invalid');
    end;
  end if;

  with candidates as (
    select l.id, l.kind, l.title, l.subtitle, l.notes, l.status, l.sort_order, l.version,
      case when l.kind = 'template' then 0 else 1 end as kind_order,
      count(t.id)::integer as total_tasks,
      count(t.id) filter (where t.completed)::integer as completed_tasks
    from public.lists l
    left join public.tasks t on t.list_id = l.id
    where l.household_id = v_household and l.status = 'open'
      and (v_cursor is null or
        (case when l.kind = 'template' then 0 else 1 end, l.sort_order, l.id) >
        (v_kind_order, v_sort_order, v_id))
    group by l.id
  ), page as (
    select * from candidates
    order by kind_order, sort_order, id
    limit v_limit + 1
  ), visible as (
    select * from page order by kind_order, sort_order, id limit v_limit
  )
  select coalesce(jsonb_agg(to_jsonb(visible) - 'kind_order' order by kind_order, sort_order, id), '[]'::jsonb)
  into v_items from visible;

  with candidates as (
    select l.id, l.sort_order, case when l.kind = 'template' then 0 else 1 end as kind_order
    from public.lists l
    where l.household_id = v_household and l.status = 'open'
      and (v_cursor is null or
        (case when l.kind = 'template' then 0 else 1 end, l.sort_order, l.id) >
        (v_kind_order, v_sort_order, v_id))
  )
  select * into v_last from candidates order by kind_order, sort_order, id
    offset greatest(v_limit - 1, 0) limit 1;

  with candidates as (
    select l.id, l.sort_order, case when l.kind = 'template' then 0 else 1 end as kind_order
    from public.lists l
    where l.household_id = v_household and l.status = 'open'
      and (v_cursor is null or
        (case when l.kind = 'template' then 0 else 1 end, l.sort_order, l.id) >
        (v_kind_order, v_sort_order, v_id))
  )
  select exists (select 1 from candidates order by kind_order, sort_order, id offset v_limit limit 1)
  into v_more;

  return private.ok_response(jsonb_build_object(
    'items', v_items,
    'next_cursor', case when v_more then private.encode_cursor(jsonb_build_object(
      'kind_order', v_last.kind_order, 'sort_order', v_last.sort_order, 'id', v_last.id
    )) else null end
  ));
end;
$$;

create or replace function public.get_home_v2(p_cursor text default null, p_limit integer default 50)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.get_home_v2(p_cursor, p_limit); $$;

create or replace function public.get_list(
  p_list_id uuid,
  p_cursor text default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_household uuid := private.active_household_id();
  v_cursor jsonb := private.decode_cursor(p_cursor);
  v_completed boolean;
  v_order integer;
  v_id uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 50);
  v_list jsonb;
  v_items jsonb;
  v_last record;
  v_total integer;
  v_done integer;
  v_more boolean;
begin
  if auth.uid() is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if v_household is null then return private.error_response('NOT_FOUND', 'error.household_required'); end if;
  if p_cursor is not null and v_cursor is null then
    return private.error_response('VALIDATION', 'error.cursor_invalid');
  end if;

  select to_jsonb(l) into v_list from public.lists l
  where id = p_list_id and household_id = v_household and status = 'open';
  if v_list is null then return private.error_response('NOT_FOUND', 'error.not_found'); end if;

  if v_cursor is not null then
    v_completed := (v_cursor ->> 'completed')::boolean;
    v_order := (v_cursor ->> 'sort_order')::integer;
    v_id := (v_cursor ->> 'id')::uuid;
  end if;

  select count(*)::integer, count(*) filter (where completed)::integer
  into v_total, v_done from public.tasks where list_id = p_list_id;

  with page as (
    select t.* from public.tasks t
    where t.list_id = p_list_id
      and (v_cursor is null or (t.completed, t.sort_order, t.id) > (v_completed, v_order, v_id))
    order by t.completed, t.sort_order, t.id
    limit v_limit + 1
  ), visible as (
    select * from page order by completed, sort_order, id limit v_limit
  )
  select coalesce(jsonb_agg(to_jsonb(visible) order by completed, sort_order, id), '[]'::jsonb)
  into v_items from visible;

  select completed, sort_order, id into v_last
  from public.tasks t
  where t.list_id = p_list_id
    and (v_cursor is null or (t.completed, t.sort_order, t.id) > (v_completed, v_order, v_id))
  order by completed, sort_order, id offset greatest(v_limit - 1, 0) limit 1;
  select exists (
    select 1 from public.tasks t
    where t.list_id = p_list_id
      and (v_cursor is null or (t.completed, t.sort_order, t.id) > (v_completed, v_order, v_id))
    offset v_limit limit 1
  ) into v_more;

  return private.ok_response(jsonb_build_object(
    'list', v_list,
    'total_tasks', v_total,
    'completed_tasks', v_done,
    'progress_percent', case when v_total = 0 then 0 else round(v_done * 100.0 / v_total)::integer end,
    'tasks', v_items,
    'next_cursor', case when v_more then private.encode_cursor(jsonb_build_object(
      'completed', v_last.completed, 'sort_order', v_last.sort_order, 'id', v_last.id
    )) else null end
  ));
end;
$$;

create or replace function private.get_cross_list_tasks(
  mode text,
  p_cursor text default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_household uuid := private.active_household_id();
  v_cursor jsonb := private.decode_cursor(p_cursor);
  v_due timestamptz;
  v_has_due boolean;
  v_list_id uuid;
  v_task_id uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 50);
  v_items jsonb;
  v_last record;
  v_more boolean;
begin
  if v_actor is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if v_household is null then return private.error_response('NOT_FOUND', 'error.household_required'); end if;
  if mode not in ('mine', 'unassigned') then
    return private.error_response('VALIDATION', 'error.mode_invalid');
  end if;
  if p_cursor is not null and v_cursor is null then
    return private.error_response('VALIDATION', 'error.cursor_invalid');
  end if;
  if v_cursor is not null then
    v_has_due := (v_cursor ->> 'has_due')::boolean;
    v_due := (v_cursor ->> 'sort_due')::timestamptz;
    v_list_id := (v_cursor ->> 'list_id')::uuid;
    v_task_id := (v_cursor ->> 'task_id')::uuid;
  end if;

  with candidates as (
    select t.id as task_id, t.title, t.due_at, t.version, t.list_id, t.blocked,
      l.title as list_title, (t.due_at is null) as has_no_due,
      coalesce(t.due_at, 'infinity'::timestamptz) as sort_due
    from public.tasks t
    join public.lists l on l.id = t.list_id and l.household_id = t.household_id
    where t.household_id = v_household and not t.completed
      and l.kind = 'active' and l.status = 'open'
      and ((mode = 'mine' and t.assignee_id = v_actor)
        or (mode = 'unassigned' and t.assignee_id is null))
  ), page as (
    select * from candidates c
    where v_cursor is null or
      (c.has_no_due, c.sort_due, c.list_id, c.task_id) >
      (not v_has_due, v_due, v_list_id, v_task_id)
    order by has_no_due, sort_due, list_id, task_id
    limit v_limit + 1
  ), visible as (
    select * from page order by has_no_due, sort_due, list_id, task_id limit v_limit
  )
  select coalesce(jsonb_agg(to_jsonb(visible) - 'sort_due' order by has_no_due, sort_due, list_id, task_id), '[]'::jsonb)
  into v_items from visible;

  with candidates as (
    select t.id as task_id, t.due_at, t.list_id, (t.due_at is null) as has_no_due,
      coalesce(t.due_at, 'infinity'::timestamptz) as sort_due
    from public.tasks t
    join public.lists l on l.id = t.list_id and l.household_id = t.household_id
    where t.household_id = v_household and not t.completed
      and l.kind = 'active' and l.status = 'open'
      and ((mode = 'mine' and t.assignee_id = v_actor)
        or (mode = 'unassigned' and t.assignee_id is null))
  )
  select * into v_last from candidates c
  where v_cursor is null or
    (c.has_no_due, c.sort_due, c.list_id, c.task_id) >
    (not v_has_due, v_due, v_list_id, v_task_id)
  order by has_no_due, sort_due, list_id, task_id offset greatest(v_limit - 1, 0) limit 1;

  with candidates as (
    select t.id as task_id, t.due_at, t.list_id, (t.due_at is null) as has_no_due,
      coalesce(t.due_at, 'infinity'::timestamptz) as sort_due
    from public.tasks t
    join public.lists l on l.id = t.list_id and l.household_id = t.household_id
    where t.household_id = v_household and not t.completed
      and l.kind = 'active' and l.status = 'open'
      and ((mode = 'mine' and t.assignee_id = v_actor)
        or (mode = 'unassigned' and t.assignee_id is null))
  )
  select exists (
    select 1 from candidates c
    where v_cursor is null or
      (c.has_no_due, c.sort_due, c.list_id, c.task_id) >
      (not v_has_due, v_due, v_list_id, v_task_id)
    offset v_limit limit 1
  ) into v_more;

  return private.ok_response(jsonb_build_object(
    'items', v_items,
    'next_cursor', case when v_more then private.encode_cursor(jsonb_build_object(
      'has_due', not v_last.has_no_due,
      'sort_due', v_last.sort_due,
      'list_id', v_last.list_id,
      'task_id', v_last.task_id
    )) else null end
  ));
end;
$$;

create or replace function public.get_unassigned(p_cursor text default null, p_limit integer default 50)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.get_cross_list_tasks('unassigned', p_cursor, p_limit); $$;

create or replace function public.get_my_tasks(p_cursor text default null, p_limit integer default 50)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.get_cross_list_tasks('mine', p_cursor, p_limit); $$;

create or replace function private.get_all_tasks(
  p_due_from timestamptz default null,
  p_due_before timestamptz default null,
  p_undated boolean default false,
  p_incomplete_only boolean default false,
  p_cursor text default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_household uuid := private.active_household_id();
  v_cursor jsonb := private.decode_cursor(p_cursor);
  v_has_due boolean;
  v_due timestamptz;
  v_list_id uuid;
  v_task_id uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 50);
  v_items jsonb;
  v_last record;
  v_more boolean;
begin
  if v_actor is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if v_household is null then return private.error_response('NOT_FOUND', 'error.household_required'); end if;
  if p_undated is null or p_incomplete_only is null
    or (p_due_from is not null and p_due_before is not null and p_due_from >= p_due_before)
    or (p_undated and (p_due_from is not null or p_due_before is not null)) then
    return private.error_response('VALIDATION', 'error.task_filter_invalid');
  end if;
  if p_cursor is not null and v_cursor is null then
    return private.error_response('VALIDATION', 'error.cursor_invalid');
  end if;
  if v_cursor is not null then
    begin
      v_has_due := (v_cursor ->> 'has_due')::boolean;
      v_due := (v_cursor ->> 'sort_due')::timestamptz;
      v_list_id := (v_cursor ->> 'list_id')::uuid;
      v_task_id := (v_cursor ->> 'task_id')::uuid;
      if v_has_due is null or v_due is null or v_list_id is null or v_task_id is null
        or v_cursor -> 'due_from' is distinct from coalesce(to_jsonb(p_due_from), 'null'::jsonb)
        or v_cursor -> 'due_before' is distinct from coalesce(to_jsonb(p_due_before), 'null'::jsonb)
        or v_cursor -> 'undated' is distinct from to_jsonb(p_undated)
        or v_cursor -> 'incomplete_only' is distinct from to_jsonb(p_incomplete_only) then
        return private.error_response('VALIDATION', 'error.cursor_invalid');
      end if;
    exception when others then
      return private.error_response('VALIDATION', 'error.cursor_invalid');
    end;
  end if;

  with candidates as (
    select t.id as task_id, t.due_at, t.list_id,
      (t.due_at is null) as has_no_due,
      coalesce(t.due_at, 'infinity'::timestamptz) as sort_due
    from public.tasks t
    join public.lists l on l.id = t.list_id and l.household_id = t.household_id
    where t.household_id = v_household and l.kind = 'active' and l.status = 'open'
      and (not p_incomplete_only or not t.completed)
      and (
        (p_undated and t.due_at is null)
        or (not p_undated and (
          (p_due_from is null and p_due_before is null)
          or (t.due_at is not null
            and (p_due_from is null or t.due_at >= p_due_from)
            and (p_due_before is null or t.due_at < p_due_before))
        ))
      )
  ), page as (
    select c.* from candidates c
    where v_cursor is null or
      (c.has_no_due, c.sort_due, c.list_id, c.task_id) >
      (not v_has_due, v_due, v_list_id, v_task_id)
    order by has_no_due, sort_due, list_id, task_id
    limit v_limit + 1
  ), visible as (
    select p.* from page p order by has_no_due, sort_due, list_id, task_id limit v_limit
  )
  select coalesce(jsonb_agg(to_jsonb(t) || jsonb_build_object('list_title', l.title)
    order by v.has_no_due, v.sort_due, v.list_id, v.task_id), '[]'::jsonb)
  into v_items
  from visible v
  join public.tasks t on t.id = v.task_id
  join public.lists l on l.id = v.list_id and l.household_id = t.household_id;

  with candidates as (
    select t.id as task_id, t.due_at, t.list_id,
      (t.due_at is null) as has_no_due,
      coalesce(t.due_at, 'infinity'::timestamptz) as sort_due
    from public.tasks t
    join public.lists l on l.id = t.list_id and l.household_id = t.household_id
    where t.household_id = v_household and l.kind = 'active' and l.status = 'open'
      and (not p_incomplete_only or not t.completed)
      and ((p_undated and t.due_at is null) or (not p_undated and (
        (p_due_from is null and p_due_before is null)
        or (t.due_at is not null and (p_due_from is null or t.due_at >= p_due_from)
          and (p_due_before is null or t.due_at < p_due_before))))
  )
  select * into v_last from candidates c
  where v_cursor is null or
    (c.has_no_due, c.sort_due, c.list_id, c.task_id) >
    (not v_has_due, v_due, v_list_id, v_task_id)
  order by has_no_due, sort_due, list_id, task_id
  offset greatest(v_limit - 1, 0) limit 1;

  with candidates as (
    select t.id as task_id, t.due_at, t.list_id,
      (t.due_at is null) as has_no_due,
      coalesce(t.due_at, 'infinity'::timestamptz) as sort_due
    from public.tasks t
    join public.lists l on l.id = t.list_id and l.household_id = t.household_id
    where t.household_id = v_household and l.kind = 'active' and l.status = 'open'
      and (not p_incomplete_only or not t.completed)
      and ((p_undated and t.due_at is null) or (not p_undated and (
        (p_due_from is null and p_due_before is null)
        or (t.due_at is not null and (p_due_from is null or t.due_at >= p_due_from)
          and (p_due_before is null or t.due_at < p_due_before))))
  )
  select exists (
    select 1 from candidates c
    where v_cursor is null or
      (c.has_no_due, c.sort_due, c.list_id, c.task_id) >
      (not v_has_due, v_due, v_list_id, v_task_id)
    offset v_limit limit 1
  ) into v_more;

  return private.ok_response(jsonb_build_object(
    'items', v_items,
    'next_cursor', case when v_more then private.encode_cursor(jsonb_build_object(
      'has_due', not v_last.has_no_due,
      'sort_due', v_last.sort_due,
      'list_id', v_last.list_id,
      'task_id', v_last.task_id,
      'due_from', p_due_from,
      'due_before', p_due_before,
      'undated', p_undated,
      'incomplete_only', p_incomplete_only
    )) else null end
  ));
end;
$$;

create or replace function public.get_all_tasks(
  p_due_from timestamptz default null,
  p_due_before timestamptz default null,
  p_undated boolean default false,
  p_incomplete_only boolean default false,
  p_cursor text default null,
  p_limit integer default 50
)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select private.get_all_tasks(p_due_from, p_due_before, p_undated, p_incomplete_only, p_cursor, p_limit);
$$;
