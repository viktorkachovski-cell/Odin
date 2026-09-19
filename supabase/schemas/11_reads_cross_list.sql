-- My Tasks and Unassigned share one deterministic ordering:
-- due timestamp ascending with undated last, then list ID, then task ID.
-- coalesce(due_at, 'infinity') makes "nulls last" directly comparable, which keeps
-- the keyset cursor a simple row comparison.

create or replace function private.cross_list_tasks(
  p_mode text, p_cursor text, p_limit integer
) returns jsonb language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_cursor jsonb := private.decode_cursor(p_cursor);
  v_limit integer := private.page_size(p_limit);
  v_items jsonb;
  v_last jsonb;
begin
  with page as (
    select t.id, t.household_id, t.list_id, t.title, t.sort_order, t.completed,
           t.assignee_id, t.due_at, t.created_by, t.created_at, t.updated_at, t.version,
           l.title as list_title,
           coalesce(t.due_at, 'infinity'::timestamptz) as due_key
    from public.tasks t
    join public.lists l on l.id = t.list_id and l.household_id = t.household_id
    where l.kind = 'active'
      and l.status = 'open'
      and t.completed = false
      and ((p_mode = 'mine' and t.assignee_id = v_actor)
        or (p_mode = 'unassigned' and t.assignee_id is null))
      and (v_cursor is null
        or (coalesce(t.due_at, 'infinity'::timestamptz), t.list_id, t.id) > (
          (v_cursor ->> 'due_key')::timestamptz,
          (v_cursor ->> 'list_id')::uuid,
          (v_cursor ->> 'id')::uuid))
    order by due_key, t.list_id, t.id
    limit v_limit
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'household_id', p.household_id, 'list_id', p.list_id,
      'list_title', p.list_title, 'title', p.title, 'sort_order', p.sort_order,
      'completed', p.completed, 'assignee_id', p.assignee_id, 'due_at', p.due_at,
      'created_by', p.created_by, 'created_at', p.created_at,
      'updated_at', p.updated_at, 'version', p.version
    ) order by p.due_key, p.list_id, p.id), '[]'::jsonb),
    (select jsonb_build_object('due_key', q.due_key, 'list_id', q.list_id, 'id', q.id)
     from page q order by q.due_key desc, q.list_id desc, q.id desc limit 1)
  into v_items, v_last
  from page p;

  return jsonb_build_object(
    'tasks', v_items,
    'next_cursor', case
      when jsonb_array_length(v_items) < v_limit or v_last is null then null
      else private.encode_cursor(v_last) end);
end;
$$;

create or replace function public.get_my_tasks(
  p_cursor text default null, p_limit integer default 50
) returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.cross_list_tasks('mine', p_cursor, p_limit) $$;

create or replace function public.get_unassigned(
  p_cursor text default null, p_limit integer default 50
) returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.cross_list_tasks('unassigned', p_cursor, p_limit) $$;
