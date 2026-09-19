# Code standards and executable quality checks

## Delivered now

The repository includes a real ESLint flat config, pinned dependencies/root lockfile, Prettier config, strict TypeScript base, linter regression test and GitHub Actions quality workflow. There is no app scaffold yet. Run `npm ci --ignore-scripts` then `npm run check`. Use `npm run lint:fix` or `npm run format` locally, inspect their diff, and rerun checks.

ESLint is configured for JavaScript tooling and typed TypeScript under `apps/` and `packages/`. Once an app/package is created, its own `tsconfig.json` must include its source files and extend/adopt the strict base. The type-aware parser deliberately fails on source outside a configured project. Edge Functions use their supported Deno lint/typecheck workflow and are not falsely counted as checked by this config.

## Enforced rules

- No explicit `any`, floating promises, non-null assertions or misused async callbacks.
- Type-only imports are consistent; hooks obey React ordering and dependency rules.
- Web JSX receives accessibility lint; native JSX does not receive inappropriate DOM rules.
- Domain/contracts cannot import React, Expo, Supabase or the data layer. Applications cannot import Supabase directly; use the public `@odin/data` API.
- Complexity limit 15, nesting limit 4, source-file limit 400 nonblank/noncomment lines. Split by responsibility rather than arbitrary line count.
- No debug `console.log` in app/shared source. Warn/error output must still be sanitized; lint does not detect PII.
- Zero warnings in CI; unused disable comments fail. Generated database types are excluded from lint but included in compilation and drift verification.

Import lint covers named package/deep-import patterns, not every conceivable relative-import escape. Review dependency direction and package exports; add boundary enforcement if agents start bypassing exports. The linter is not a security or architecture proof.

## Do

- Keep screen components focused on rendering/composition, hooks on state orchestration, repositories on I/O, and pure domain functions on calculations.
- Share progress, filtering, validation, error codes, localization keys and command DTOs. Server validates again independently at its trust boundary.
- Model errors as discriminated unions; map unsafe technical errors to localized user messages.
- Use explicit desired-state mutations, request IDs and expected versions. Preserve user input after any failed save.
- Keep migrations append-only after publication; write a new corrective migration. Review generated SQL before applying it.
- Pin package versions and root lockfile. Explain dependency additions and check compatibility with Expo before updating React.
- Keep PRs scoped to one coherent behavior, list exact tests and remaining limitations. Inspect existing code and user changes first.
- Use named constants and small modules. Consider extraction when a file approaches 250 lines or one hook manages unrelated screens.
- Keep English/Bulgarian key sets identical; add an automated missing-key check once dictionaries exist.

## Do not

- Change product rules to simplify implementation; introduce owners/admins for ordinary task actions; invent deletion or notifications.
- Use a service key in client code, authorize from editable metadata, or rely on hidden controls for security.
- Trust client household/creator/version values, silently last-write-win whole records, or build copy via multiple client inserts.
- Reimplement validation/sorting differently for mobile/web, duplicate whole components to tweak styling, or add generic repository frameworks without a concrete need.
- Fix type errors with `as any`, broad casts, `@ts-ignore`, disabled checks or blanket eslint comments. Narrow unknown values through validation.
- Put secrets in fixtures, `.env` files in Git, console logs, screenshots or generated docs. Commit `.env.example` with names and placeholders only.
- Catch errors and pretend success; count mocked tests as live integration; change tests simply to accept broken behavior.
- Add unbounded refetch loops or listeners without cleanup. Avoid a single giant global state object.

## Required scripts as implementation arrives

| Layer    | Required gates                                                                                                       |
| -------- | -------------------------------------------------------------------------------------------------------------------- |
| Shared   | lint, `tsc --noEmit`, domain/contract/data tests, locale parity                                                      |
| Web      | shared gates, component tests, Playwright acceptance, production build                                               |
| Mobile   | shared gates, component tests, Expo Doctor, Android bundle/build, device flow evidence                               |
| Database | schema replay on disposable DB, SQL lint, pgTAP/RLS tests, parallel-command integration tests, type generation drift |
| Release  | cross-client acceptance, security regression, access revocation, environment/redirect routing and restore rehearsal  |

Extend `.github/workflows/quality.yml` with actual named jobs as code arrives. Missing tests/builds must fail once a workspace exists; do not use `--if-present` to hide missing scripts. Typechecking is separate from ESLint and required. Never label the current tooling-only workflow as full release validation.

## Testing style and evidence

Test externally observable behavior and invariants, not private implementation shape or repetitive snapshots. Use synthetic households A/B with at least two members in A. Integration tests use ordinary authenticated credentials for permission checks; setup can use local privileged fixtures. Show that forbidden operations actually fail and do not just return hidden UI.

Each workstream's completion report includes changed paths, requirements met, exact checks and results, environment used, known failures and release risks. Performance claims require measured conditions and samples; security claims require deny-path tests.

## Exceptions and maintenance

The current ESLint 9 pin is deprecated upstream but compatible with the web accessibility plugin's published peer range. See `11-TOOLING-VALIDATION.md` for evidence and the required upgrade follow-up. Do not misrepresent it as a supported newest-version stack.

A narrowly justified lint exception needs a comment explaining the technical reason and a review note. It cannot waive authorization, idempotency or product rules. Do not turn a hard error into a warning globally. Revisit limits only with evidence that decomposition would reduce clarity.

References: [ESLint flat configuration](https://eslint.org/docs/latest/use/configure/configuration-files), [typescript-eslint setup](https://typescript-eslint.io/getting-started/). The committed versions are deliberate compatible pins, not a claim to be the newest releases.
