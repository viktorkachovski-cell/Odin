import assert from 'node:assert/strict';

import postgres from 'postgres';

const databaseUrl = process.env.ODIN_TEST_DATABASE_URL;

if (!databaseUrl) {
  throw new Error('ODIN_TEST_DATABASE_URL is required for database concurrency tests');
}

const ids = {
  userA: '40000000-0000-0000-0000-000000000001',
  userB: '40000000-0000-0000-0000-000000000002',
  household: '40000000-0000-0000-0000-000000000003',
  list: '40000000-0000-0000-0000-000000000004',
  claimTask: '40000000-0000-0000-0000-000000000005',
  duplicateRequest: '40000000-0000-0000-0000-000000000006',
  claimRequestA: '40000000-0000-0000-0000-000000000007',
  claimRequestB: '40000000-0000-0000-0000-000000000008',
  appendRequestA: '40000000-0000-0000-0000-000000000009',
  appendRequestB: '40000000-0000-0000-0000-000000000010',
  moveList: '40000000-0000-0000-0000-000000000011',
  moveTasks: [
    '40000000-0000-0000-0000-000000000012',
    '40000000-0000-0000-0000-000000000013',
    '40000000-0000-0000-0000-000000000014',
  ],
};

const admin = postgres(databaseUrl, { max: 6, prepare: false });

async function cleanFixtures() {
  await admin`delete from public.households where id = ${ids.household}`;
  await admin`delete from auth.users where id in (${ids.userA}, ${ids.userB})`;
}

async function setupFixtures() {
  await cleanFixtures();
  await admin.begin(async (sql) => {
    await sql`
      insert into auth.users (
        id, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      ) values
        (${ids.userA}, 'authenticated', 'authenticated', '{}', '{}', now(), now()),
        (${ids.userB}, 'authenticated', 'authenticated', '{}', '{}', now(), now())
    `;
    await sql`
      insert into public.profiles (user_id, display_name, locale) values
        (${ids.userA}, 'Concurrency A', 'en'),
        (${ids.userB}, 'Concurrency B', 'bg')
    `;
    await sql`
      insert into public.households (id, name, seed_locale, created_by)
      values (${ids.household}, 'Concurrency fixture', 'en', ${ids.userA})
    `;
    await sql`
      insert into public.memberships (household_id, user_id) values
        (${ids.household}, ${ids.userA}),
        (${ids.household}, ${ids.userB})
    `;
    await sql`
      insert into public.lists (id, household_id, kind, title, created_by)
      values (${ids.list}, ${ids.household}, 'active', 'Concurrent work', ${ids.userA})
    `;
    await sql`
      insert into public.tasks (id, household_id, list_id, title, sort_order)
      values (${ids.claimTask}, ${ids.household}, ${ids.list}, 'Claim once', 0)
    `;
    await sql`
      insert into public.lists (id, household_id, kind, title, created_by)
      values (${ids.moveList}, ${ids.household}, 'active', 'Concurrent order', ${ids.userA})
    `;
    for (const [position, taskId] of ids.moveTasks.entries()) {
      await sql`
        insert into public.tasks (id, household_id, list_id, title, sort_order)
        values (${taskId}, ${ids.household}, ${ids.moveList}, ${`Move ${position}`}, ${position})
      `;
    }
  });
}

async function asAuthenticated(userId, callback) {
  return admin.begin(async (sql) => {
    await sql.unsafe('set local role authenticated');
    await sql`select set_config('request.jwt.claim.sub', ${userId}, true)`;
    return callback(sql);
  });
}

async function createTask(userId, requestId, title) {
  return asAuthenticated(userId, async (sql) => {
    const [row] = await sql`
      select public.create_task(
        ${requestId}::uuid,
        ${ids.list}::uuid,
        ${title}::text,
        null,
        null
      ) as response
    `;
    return row.response;
  });
}

async function claimTask(userId, requestId) {
  return asAuthenticated(userId, async (sql) => {
    const [row] = await sql`
      select public.claim_task(
        ${requestId}::uuid,
        ${ids.claimTask}::uuid,
        1
      ) as response
    `;
    return row.response;
  });
}

async function testDuplicateCreate() {
  const [first, second] = await Promise.all([
    createTask(ids.userA, ids.duplicateRequest, 'Created once'),
    createTask(ids.userA, ids.duplicateRequest, 'Created once'),
  ]);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.data.id, second.data.id);

  const [{ entityCount, receiptCount }] = await admin`
    select
      (select count(*)::integer from public.tasks
        where list_id = ${ids.list} and title = 'Created once') as "entityCount",
      (select count(*)::integer from private.command_receipts
        where actor_user_id = ${ids.userA}
          and request_id = ${ids.duplicateRequest}) as "receiptCount"
  `;
  assert.equal(entityCount, 1);
  assert.equal(receiptCount, 1);
}

async function testCompetingClaims() {
  const responses = await Promise.all([
    claimTask(ids.userA, ids.claimRequestA),
    claimTask(ids.userB, ids.claimRequestB),
  ]);
  const winners = responses.filter((response) => response.ok === true);
  const losers = responses.filter((response) => response.ok !== true);

  assert.equal(winners.length, 1);
  assert.equal(losers.length, 1);
  assert.ok(['ALREADY_ASSIGNED', 'CONFLICT'].includes(losers[0].error.code));

  const [task] = await admin`
    select assignee_id as "assigneeId", version
    from public.tasks
    where id = ${ids.claimTask}
  `;
  assert.equal(task.assigneeId, winners[0].data.assignee_id);
  assert.equal(Number(task.version), 2);
}

async function testParallelAppendOrder() {
  const responses = await Promise.all([
    createTask(ids.userA, ids.appendRequestA, 'Parallel A'),
    createTask(ids.userB, ids.appendRequestB, 'Parallel B'),
  ]);

  assert.ok(responses.every((response) => response.ok === true));
  assert.notEqual(responses[0].data.sort_order, responses[1].data.sort_order);

  const rows = await admin`
    select sort_order as "sortOrder"
    from public.tasks
    where id in (${responses[0].data.id}, ${responses[1].data.id})
    order by sort_order
  `;
  assert.equal(rows.length, 2);
  assert.equal(rows[1].sortOrder, rows[0].sortOrder + 1);
}

async function command(userId, statement) {
  return asAuthenticated(userId, async (sql) => {
    const [row] = await statement(sql);
    return row.response;
  });
}

/** Resolves once `count` backends are blocked on a lock inside `functionName`. */
async function waitForLockWaiters(functionName, count = 1) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const [{ waiting }] = await admin`
      select count(*)::integer as waiting from pg_stat_activity
      where wait_event_type = 'Lock' and query like ${`%${functionName}%`}
    `;
    if (waiting >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`no backend blocked in ${functionName}`);
}

async function moveTaskPositions() {
  return admin`
    select id, sort_order as "sortOrder" from public.tasks
    where list_id = ${ids.moveList} order by sort_order
  `;
}

/**
 * A move whose neighbour is deleted by another member mid-flight must settle
 * cleanly: task deletion and task moves serialise on the parent list, so the
 * move sees the committed deletion and either moves past it or is a no-op.
 */
async function testMoveWhileNeighbourIsDeleted() {
  const [first, second] = ids.moveTasks;
  let releaseDelete;
  const deleteGate = new Promise((resolve) => {
    releaseDelete = resolve;
  });
  let deleted;
  const deletedSignal = new Promise((resolve) => {
    deleted = resolve;
  });

  const deleting = asAuthenticated(ids.userB, async (sql) => {
    const [row] = await sql`
      select public.delete_task(gen_random_uuid(), ${first}::uuid, 1) as response
    `;
    deleted();
    await deleteGate;
    return row.response;
  });
  await deletedSignal;

  const moving = command(
    ids.userA,
    (sql) => sql`
      select public.move_task(gen_random_uuid(), ${second}::uuid, 1, 'up') as response
    `,
  ).catch((error) => ({ ok: false, thrown: error.message }));
  await waitForLockWaiters('move_task');
  releaseDelete();

  const [deleteResponse, moveResponse] = await Promise.all([deleting, moving]);
  assert.equal(deleteResponse.ok, true);
  assert.deepEqual(moveResponse, { ok: true, data: { task_id: second } });

  const positions = await moveTaskPositions();
  assert.deepEqual(
    positions.map((row) => row.id),
    ids.moveTasks.slice(1),
  );
}

/**
 * Two members moving adjacent tasks at once never deadlock, never lose a
 * position and never let a stale expected version through.
 */
async function testCompetingAdjacentMoves() {
  const [, second, third] = ids.moveTasks;
  const responses = await Promise.all([
    command(
      ids.userA,
      (sql) => sql`
        select public.move_task(gen_random_uuid(), ${third}::uuid, 1, 'up') as response
      `,
    ),
    command(
      ids.userB,
      (sql) => sql`
        select public.move_task(gen_random_uuid(), ${second}::uuid, 1, 'down') as response
      `,
    ),
  ]);

  const winners = responses.filter((response) => response.ok === true);
  const losers = responses.filter((response) => response.ok !== true);
  assert.equal(winners.length, 1);
  assert.equal(losers.length, 1);
  assert.equal(losers[0].error.code, 'CONFLICT');

  const positions = await moveTaskPositions();
  assert.deepEqual(
    positions.map((row) => row.id),
    [third, second],
  );
  assert.equal(new Set(positions.map((row) => row.sortOrder)).size, 2);
}

try {
  await setupFixtures();
  await testDuplicateCreate();
  await testCompetingClaims();
  await testParallelAppendOrder();
  await testMoveWhileNeighbourIsDeleted();
  await testCompetingAdjacentMoves();
  console.info(
    'Database concurrency tests passed: duplicate create, competing claims, append order, ' +
      'move during neighbour delete, competing adjacent moves',
  );
} finally {
  await cleanFixtures();
  await admin.end({ timeout: 5 });
}
