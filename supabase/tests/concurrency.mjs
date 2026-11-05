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
  // Multiple-assignee fixtures: two more members and one task per scenario.
  userC: '40000000-0000-0000-0000-000000000020',
  userD: '40000000-0000-0000-0000-000000000021',
  assignTasks: Array.from(
    { length: 8 },
    (_, index) => `40000000-0000-0000-0000-0000000001${String(index).padStart(2, '0')}`,
  ),
};

const admin = postgres(databaseUrl, { max: 6, prepare: false });

async function cleanFixtures() {
  await admin`delete from public.households where id = ${ids.household}`;
  await admin`
    delete from auth.users
    where id in (${ids.userA}, ${ids.userB}, ${ids.userC}, ${ids.userD})
  `;
}

async function setupFixtures() {
  await cleanFixtures();
  await admin.begin(async (sql) => {
    await sql`
      insert into auth.users (
        id, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      ) values
        (${ids.userA}, 'authenticated', 'authenticated', '{}', '{}', now(), now()),
        (${ids.userB}, 'authenticated', 'authenticated', '{}', '{}', now(), now()),
        (${ids.userC}, 'authenticated', 'authenticated', '{}', '{}', now(), now()),
        (${ids.userD}, 'authenticated', 'authenticated', '{}', '{}', now(), now())
    `;
    await sql`
      insert into public.profiles (user_id, display_name, locale) values
        (${ids.userA}, 'Concurrency A', 'en'),
        (${ids.userB}, 'Concurrency B', 'bg'),
        (${ids.userC}, 'Concurrency C', 'en'),
        (${ids.userD}, 'Concurrency D', 'en')
    `;
    await sql`
      insert into public.households (id, name, seed_locale, created_by)
      values (${ids.household}, 'Concurrency fixture', 'en', ${ids.userA})
    `;
    await sql`
      insert into public.memberships (household_id, user_id) values
        (${ids.household}, ${ids.userA}),
        (${ids.household}, ${ids.userB}),
        (${ids.household}, ${ids.userC}),
        (${ids.household}, ${ids.userD})
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
    for (const [position, taskId] of ids.assignTasks.entries()) {
      await sql`
        insert into public.tasks (id, household_id, list_id, title, sort_order)
        values (${taskId}, ${ids.household}, ${ids.list}, ${`Assign ${position}`}, ${100 + position})
      `;
    }
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

const requestId = () => crypto.randomUUID();

async function assignmentCommand(userId, statement) {
  return asAuthenticated(userId, async (sql) => {
    const [row] = await statement(sql);
    return row.response;
  });
}

const addAssignee = (actor, taskId, userId, request = requestId()) =>
  assignmentCommand(
    actor,
    (sql) => sql`
      select public.add_task_assignee(${request}::uuid, ${taskId}::uuid, ${userId}::uuid) as response
    `,
  );

const removeAssignee = (actor, taskId, userId, request = requestId()) =>
  assignmentCommand(
    actor,
    (sql) => sql`
      select public.remove_task_assignee(${request}::uuid, ${taskId}::uuid, ${userId}::uuid) as response
    `,
  );

const replaceAssignees = (actor, taskId, version, userIds, request = requestId()) =>
  assignmentCommand(
    actor,
    (sql) => sql`
      select public.set_task_assignees(
        ${request}::uuid, ${taskId}::uuid, ${version}::bigint, ${userIds}::uuid[]
      ) as response
    `,
  );

async function taskState(taskId) {
  const [row] = await admin`
    select version, assignee_id as "projection",
      array(select user_id::text from public.task_assignees where task_id = ${taskId}
        order by user_id) as assignees
    from public.tasks where id = ${taskId}
  `;
  return { version: Number(row.version), projection: row.projection, assignees: row.assignees };
}

/** Every assignment row is mirrored by tasks.assignee_id and belongs to a member. */
async function assertAssignmentInvariants() {
  const [{ drift }] = await admin`
    select count(*)::integer as drift from public.tasks t
    where t.assignee_id is distinct from
      (select min(ta.user_id::text)::uuid from public.task_assignees ta where ta.task_id = t.id)
  `;
  assert.equal(drift, 0, 'tasks.assignee_id must project the assignment set');
}

/** Different members adding different people at once: nobody's addition is lost. */
async function testConcurrentAdditions() {
  const task = ids.assignTasks[0];
  const responses = await Promise.all([
    addAssignee(ids.userA, task, ids.userA),
    addAssignee(ids.userB, task, ids.userB),
    addAssignee(ids.userC, task, ids.userC),
    addAssignee(ids.userD, task, ids.userD),
  ]);
  assert.ok(
    responses.every((response) => response.ok === true),
    JSON.stringify(responses),
  );
  const state = await taskState(task);
  assert.deepEqual(state.assignees, [ids.userA, ids.userB, ids.userC, ids.userD].sort());
  assert.equal(state.version, 5, 'each of four distinct additions advances the version once');
  assert.equal(state.projection, state.assignees[0]);
}

/** The same member added by two people, and by a retry, is one assignment. */
async function testDuplicateAssignment() {
  const task = ids.assignTasks[1];
  const shared = requestId();
  const responses = await Promise.all([
    addAssignee(ids.userA, task, ids.userC, shared),
    addAssignee(ids.userA, task, ids.userC, shared),
    addAssignee(ids.userB, task, ids.userC),
  ]);
  assert.ok(responses.every((response) => response.ok === true));
  const state = await taskState(task);
  assert.deepEqual(state.assignees, [ids.userC]);
  assert.equal(state.version, 2, 'three submissions of one assignment change the task once');

  const [{ receipts }] = await admin`
    select count(*)::integer as receipts from private.command_receipts
    where actor_user_id = ${ids.userA} and request_id = ${shared}
  `;
  assert.equal(receipts, 1);

  const mismatch = await addAssignee(ids.userA, task, ids.userD, shared);
  assert.equal(mismatch.error.code, 'IDEMPOTENCY_MISMATCH');
}

/** An addition and a removal of different members both take effect. */
async function testAddAndRemoveTogether() {
  const task = ids.assignTasks[2];
  assert.equal((await addAssignee(ids.userA, task, ids.userA)).ok, true);
  assert.equal((await addAssignee(ids.userA, task, ids.userB)).ok, true);
  const responses = await Promise.all([
    addAssignee(ids.userC, task, ids.userC),
    removeAssignee(ids.userD, task, ids.userA),
  ]);
  assert.ok(responses.every((response) => response.ok === true));
  const state = await taskState(task);
  assert.deepEqual(state.assignees, [ids.userB, ids.userC].sort());
  assert.equal(state.version, 5);
  assert.equal(state.projection, state.assignees[0]);
}

/** Two editors replacing the set from the same version: one wins, one conflicts. */
async function testEditorReplacementRace() {
  const task = ids.assignTasks[3];
  const responses = await Promise.all([
    replaceAssignees(ids.userA, task, 1, [ids.userA, ids.userB]),
    replaceAssignees(ids.userB, task, 1, [ids.userC]),
  ]);
  const winners = responses.filter((response) => response.ok === true);
  const losers = responses.filter((response) => response.ok !== true);
  assert.equal(winners.length, 1);
  assert.equal(losers.length, 1);
  assert.equal(losers[0].error.code, 'CONFLICT');
  assert.equal(losers[0].error.current_version, 2);

  const state = await taskState(task);
  const expected = responses[0].ok === true ? [ids.userA, ids.userB].sort() : [ids.userC];
  assert.deepEqual(state.assignees, expected, 'the loser did not overwrite the winner');
}

/** A member added in between makes a stale "clear everyone" conflict, not erase. */
async function testStaleClearDoesNotEraseAddition() {
  const task = ids.assignTasks[4];
  assert.equal((await addAssignee(ids.userA, task, ids.userA)).ok, true);
  const responses = await Promise.all([
    addAssignee(ids.userB, task, ids.userB),
    replaceAssignees(ids.userC, task, 2, []),
  ]);
  const [added, cleared] = responses;
  assert.equal(added.ok, true);
  const state = await taskState(task);
  if (cleared.ok === true) {
    // The clear ran first against the version it saw; the addition then landed.
    assert.deepEqual(state.assignees, [ids.userB]);
  } else {
    assert.equal(cleared.error.code, 'CONFLICT');
    assert.deepEqual(state.assignees, [ids.userA, ids.userB].sort());
  }
}

/**
 * Assignment racing membership revocation, both orders. The revocation here
 * stands in for the future approved operation: it deactivates the membership,
 * clears that member's assignments and advances the affected task versions.
 */
async function revokeMember(sql, userId) {
  await sql`
    select 1 from public.memberships
    where household_id = ${ids.household} and user_id = ${userId} for update
  `;
  await sql`
    update public.memberships set status = 'inactive'
    where household_id = ${ids.household} and user_id = ${userId}
  `;
  await sql`
    update public.tasks set assignee_id = null
    where id in (select task_id from public.task_assignees where user_id = ${userId})
      and not exists (
        select 1 from public.task_assignees o
        where o.task_id = tasks.id and o.user_id <> ${userId}
      )
  `;
  await sql`delete from public.task_assignees where user_id = ${userId}`;
}

async function testAssignmentAfterRevocationIsRejected() {
  const task = ids.assignTasks[5];
  let revoked;
  const revokedSignal = new Promise((resolve) => {
    revoked = resolve;
  });
  let releaseRevoke;
  const revokeGate = new Promise((resolve) => {
    releaseRevoke = resolve;
  });

  const revoking = admin.begin(async (sql) => {
    await revokeMember(sql, ids.userD);
    revoked();
    await revokeGate;
  });
  await revokedSignal;

  const adding = addAssignee(ids.userA, task, ids.userD);
  await waitForLockWaiters('add_task_assignee');
  releaseRevoke();
  await revoking;

  const response = await adding;
  assert.equal(response.ok, false);
  assert.equal(response.error.code, 'VALIDATION');
  assert.deepEqual((await taskState(task)).assignees, []);
}

async function testAssignmentBeforeRevocationIsCleared() {
  const task = ids.assignTasks[6];
  assert.equal((await addAssignee(ids.userA, task, ids.userA)).ok, true);

  let added;
  const addedSignal = new Promise((resolve) => {
    added = resolve;
  });
  let releaseAdd;
  const addGate = new Promise((resolve) => {
    releaseAdd = resolve;
  });
  const adding = asAuthenticated(ids.userA, async (sql) => {
    const [row] = await sql`
      select public.add_task_assignee(${requestId()}::uuid, ${task}::uuid, ${ids.userC}::uuid) as response
    `;
    added();
    await addGate;
    return row.response;
  });
  await addedSignal;

  // Stands behind the open assignment on the member's membership row.
  const revoking = admin.begin((sql) => revokeMember(sql, ids.userC));
  await waitForLockWaiters('memberships');
  releaseAdd();

  const [addResponse] = await Promise.all([adding, revoking]);
  assert.equal(addResponse.ok, true);

  // The revocation ran second, so it saw and cleared the new assignment.
  const state = await taskState(task);
  assert.deepEqual(state.assignees, [ids.userA]);
  assert.equal(state.projection, ids.userA);
  const [{ stranded }] = await admin`
    select count(*)::integer as stranded from public.task_assignees ta
    join public.memberships m on m.household_id = ta.household_id and m.user_id = ta.user_id
    where m.status <> 'active'
  `;
  assert.equal(stranded, 0, 'no assignment may outlive the access of its member');
}

try {
  await setupFixtures();
  await testDuplicateCreate();
  await testCompetingClaims();
  await testParallelAppendOrder();
  await testMoveWhileNeighbourIsDeleted();
  await testCompetingAdjacentMoves();
  await testConcurrentAdditions();
  await testDuplicateAssignment();
  await testAddAndRemoveTogether();
  await testEditorReplacementRace();
  await testStaleClearDoesNotEraseAddition();
  await testAssignmentAfterRevocationIsRejected();
  await testAssignmentBeforeRevocationIsCleared();
  await assertAssignmentInvariants();
  console.info(
    'Database concurrency tests passed: duplicate create, competing claims, append order, ' +
      'move during neighbour delete, competing adjacent moves, concurrent assignee additions, ' +
      'duplicate assignment, add with remove, editor replacement race, stale clear, ' +
      'assignment racing revocation (both orders)',
  );
} finally {
  await cleanFixtures();
  await admin.end({ timeout: 5 });
}
