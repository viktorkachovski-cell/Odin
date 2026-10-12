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

async function command(userId, statement) {
  return asAuthenticated(userId, async (sql) => {
    const [row] = await statement(sql);
    return row.response;
  });
}

function createTask(requestId, title) {
  return (sql) => sql`
    select public.create_task(
      ${requestId}::uuid,
      ${ids.list}::uuid,
      ${title}::text,
      null,
      null
    ) as response
  `;
}

function claimTask(requestId) {
  return (sql) => sql`
    select public.claim_task(${requestId}::uuid, ${ids.claimTask}::uuid, 1) as response
  `;
}

function moveTask(taskId, direction) {
  return (sql) => sql`
    select public.move_task(gen_random_uuid(), ${taskId}::uuid, 1, ${direction}) as response
  `;
}

function deleteTask(taskId) {
  return (sql) => sql`
    select public.delete_task(gen_random_uuid(), ${taskId}::uuid, 1) as response
  `;
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

/**
 * Runs two commands as transactions that genuinely overlap. `first` runs and
 * then holds its transaction open; `second` starts, and only once Postgres
 * reports it waiting on a lock inside `blockedIn` does `first` commit.
 *
 * Firing both through Promise.all usually overlaps them as well, but nothing
 * guarantees it, and run back to back they give the same answers, so a green
 * run could not tell a serialised race from no race at all. Here the second
 * command has demonstrably waited for the first, so the winner is known.
 */
async function overlap(first, second, blockedIn) {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let held;
  const holding = new Promise((resolve) => {
    held = resolve;
  });

  const firstDone = asAuthenticated(first.userId, async (sql) => {
    const [row] = await first.statement(sql);
    held();
    await gate;
    return row.response;
  });
  await Promise.race([holding, firstDone]);

  // A thrown SQL error becomes a value, so an assertion prints it.
  const secondDone = command(second.userId, second.statement).catch((error) => ({
    ok: false,
    thrown: error.message,
  }));
  try {
    await waitForLockWaiters(blockedIn);
  } finally {
    release();
  }
  return Promise.all([firstDone, secondDone]);
}

/** The repeat waits on the first request's lock, then replays its receipt. */
async function testDuplicateCreate() {
  const statement = createTask(ids.duplicateRequest, 'Created once');
  const [first, second] = await overlap(
    { userId: ids.userA, statement },
    { userId: ids.userA, statement },
    'create_task',
  );

  assert.equal(first.ok, true, JSON.stringify(first));
  assert.deepEqual(second, first);

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

/** The second claimant waits on the task row, then finds it taken. */
async function testCompetingClaims() {
  const [winner, loser] = await overlap(
    { userId: ids.userA, statement: claimTask(ids.claimRequestA) },
    { userId: ids.userB, statement: claimTask(ids.claimRequestB) },
    'claim_task',
  );

  assert.equal(winner.ok, true, JSON.stringify(winner));
  assert.equal(winner.data.assignee_id, ids.userA);
  assert.ok(['ALREADY_ASSIGNED', 'CONFLICT'].includes(loser.error?.code), JSON.stringify(loser));

  const [task] = await admin`
    select assignee_id as "assigneeId", version
    from public.tasks
    where id = ${ids.claimTask}
  `;
  assert.equal(task.assigneeId, ids.userA);
  assert.equal(Number(task.version), 2);
}

/** The second append waits on the parent list, then lands right after the first. */
async function testParallelAppendOrder() {
  const [first, second] = await overlap(
    { userId: ids.userA, statement: createTask(ids.appendRequestA, 'Parallel A') },
    { userId: ids.userB, statement: createTask(ids.appendRequestB, 'Parallel B') },
    'create_task',
  );

  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(second.ok, true, JSON.stringify(second));
  assert.equal(second.data.sort_order, first.data.sort_order + 1);

  const rows = await admin`
    select id
    from public.tasks
    where id in (${first.data.id}, ${second.data.id})
    order by sort_order
  `;
  assert.deepEqual(
    rows.map((row) => row.id),
    [first.data.id, second.data.id],
  );
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
  const [deleteResponse, moveResponse] = await overlap(
    { userId: ids.userB, statement: deleteTask(first) },
    { userId: ids.userA, statement: moveTask(second, 'up') },
    'move_task',
  );

  assert.equal(deleteResponse.ok, true, JSON.stringify(deleteResponse));
  assert.deepEqual(moveResponse, { ok: true, data: { task_id: second } });

  const positions = await moveTaskPositions();
  assert.deepEqual(
    positions.map((row) => row.id),
    ids.moveTasks.slice(1),
  );
}

/**
 * Two members moving the same adjacent pair from opposite sides: the second
 * waits on the parent list, then finds a newer version and is refused, so no
 * position is lost or duplicated and no stale move gets through.
 */
async function testCompetingAdjacentMoves() {
  const [, second, third] = ids.moveTasks;
  const [winner, loser] = await overlap(
    { userId: ids.userA, statement: moveTask(third, 'up') },
    { userId: ids.userB, statement: moveTask(second, 'down') },
    'move_task',
  );

  assert.deepEqual(winner, { ok: true, data: { task_id: third } });
  assert.equal(loser.error?.code, 'CONFLICT', JSON.stringify(loser));

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
