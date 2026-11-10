# MEMORY.md

Durable lessons for agents working in this repository. One rule per line, `WHEN → DO, NOT`.

## Task Group: audit 2026-11-09 wave 1 (2026-11-10)

- WHEN a bun test file calls `mock.module` → DO call `mock.restore()` in `afterEach`, NOT leave the module mocked: the mock leaks into later test files of the same `bun test functions` run (measured: 11 auth tests failed until `request-guard.test.ts` restored it).
- WHEN changing the point balance → DO go through `functions/api/auth/points.ts` (`points:<userId>` in KV), NOT a field on the session: sessions are per login, the balance is per account.
