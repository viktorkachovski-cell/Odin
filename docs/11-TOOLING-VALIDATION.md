# Planning package validation

Checked September 19, 2026 locally on Windows with Node 24.16.0. CI selects Node 22; its remote result must be checked separately after upload.

## Passed

- `npm run lint`: zero errors or warnings.
- `npm run format:check`: all matched files conform to Prettier.
- `npm run test:tooling`: one regression test passed; unsafe `any` and floating promises rejected, valid typed source accepted, web accessibility/hooks/import rules configured, native code free of DOM-only accessibility rules, domain import boundary configured.
- `npm run check`: all three gates passed together with normal process spawning.
- Local Markdown link validation: no broken relative links.
- Source transcription check: FR 01–27 and BR 01–10 present; all FR IDs covered in acceptance matrix.
- DOCX package inspected: no embedded sketch/image files.

## Limitations and follow-up

The sandbox initially blocked Node's test subprocess with `spawn EPERM`; rerunning the same checks with allowed process spawning passed. This was an environment restriction, not a test failure hidden by changing the suite.

ESLint 9.39.5 is pinned because the current `eslint-plugin-jsx-a11y` peer range excludes ESLint 10. npm marks ESLint 9 deprecated/unsupported. This is a tooling maintenance risk: track accessibility-plugin compatibility and upgrade ESLint when supported, or deliberately replace that plugin with equivalent verified checks. Do not install with `--force` to conceal the incompatibility. Application release should review this pin again.

No mobile/web/database application tests, builds, performance measurements or hosted deployments were run: those applications have not been implemented in this planning task. Future application gates are specified in the workstream briefs and verification checklist.
