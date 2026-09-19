-- Genuine two-transaction concurrency tests.
--
-- These require TWO real database backends with overlapping transactions.
-- Running the statements sequentially in one session proves nothing: it is
-- exactly the "sequential calls labelled concurrency" that docs/02-CONTRACT.md
-- rules out. Use supabase/tests/run-concurrency.sh, which drives two psql
-- processes against a disposable LOCAL database.
--
-- Never point this at a hosted project: it creates and deletes fixture users.

-- =============================================================================
-- Fixtures
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function private.test_as(p_user uuid) returns void
language sql set search_path = '' as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

-- =============================================================================
-- SESSION A statements are marked [A]; SESSION B statements are marked [B].
-- The runner interleaves them in the order the step numbers give.
-- =============================================================================

-- CASE 1: simultaneous claims of the same task yield exactly one assignee.
--
-- [A] 1. begin; select private.test_as(:user_a);
-- [A] 2. select public.claim_task(:req_a, :task_id, 1);      -- takes the row lock
-- [B] 3. begin; select private.test_as(:user_b);
-- [B] 4. select public.claim_task(:req_b, :task_id, 1);      -- BLOCKS on the lock
-- [A] 5. commit;                                             -- B unblocks here
-- [B] 6. (result arrives) expect ok=false, ALREADY_ASSIGNED or CONFLICT
-- [B] 7. commit;
--
-- Assert afterwards: exactly one assignee, and the version advanced by one.
--   select assignee_id, version from public.tasks where id = :task_id;

-- CASE 2: two simultaneous identical copy_template requests (same request_id)
-- produce ONE list and ONE receipt.
--
-- [A] 1. begin; select private.test_as(:user_a);
-- [A] 2. select public.copy_template(:same_req, :template_id);
-- [B] 3. begin; select private.test_as(:user_a);             -- same actor
-- [B] 4. select public.copy_template(:same_req, :template_id);  -- BLOCKS on the
--           unique index on (actor_id, request_id)
-- [A] 5. commit;
-- [B] 6. (result arrives) expect the SAME list_id as A returned
-- [B] 7. commit;
--
-- Assert afterwards:
--   select count(*) from private.command_receipts
--    where actor_id = :user_a and request_id = :same_req;   -- exactly 1
--   select count(*) from public.lists where household_id = :household
--     and kind = 'active';                                  -- exactly 1 new list

-- CASE 3: two DIFFERENT request ids legitimately produce two copies.
-- Same interleaving as case 2 with distinct request ids; expect two distinct
-- list ids and two receipts. Copies are never deduplicated by template or title.

-- CASE 4: assignment cannot race with revocation.
--
-- [A] 1. begin; select private.test_as(:user_a);
-- [A] 2. select public.update_task(:req, :task_id, :ver, 'x', :user_b, null);
--           -- locks user_b's membership row via require_assignable
-- [B] 3. begin;
-- [B] 4. update public.memberships set status = 'inactive'
--          where user_id = :user_b;                          -- BLOCKS
-- [A] 5. commit;
-- [B] 6. commit;
--
-- Assert: the assignment succeeded against an active member, and the
-- deactivation applied afterwards -- never an inactive assignee. Then run the
-- reverse order and assert the assignment fails with VALIDATION
-- (validation.assignee_id.not_active_member).

-- CASE 5: concurrent create_household for the same account.
--
-- Both sessions call create_household with DIFFERENT request ids as the same
-- user. One wins; the other must return ALREADY_IN_HOUSEHOLD, enforced by the
-- advisory lock plus the memberships_single_active_household partial unique
-- index. Assert exactly one household and one active membership.

-- CASE 6: concurrent redemption of one invitation by two different accounts.
--
-- Both call redeem_invitation with the same token. Exactly one gets ok=true;
-- the other must get INVITE_USED. Assert one redeemed_by and one new membership.

-- =============================================================================
-- Cleanup
-- =============================================================================
-- drop function if exists private.test_as(uuid);
