# MEMORY.md

Durable lessons for agents working in this repository. One rule per line, `WHEN → DO, NOT`.

## Task Group: audit 2026-11-09 wave 1 (2026-11-10)

- WHEN running the Functions tests → DO use `bun run test:functions` (`bun test --isolate functions`), NOT plain `bun test functions`: `mock.module` in the Gemini proxy tests replaces `auth/_shared` for every later file in the same process and `mock.restore()` does not undo it, so auth tests fail whenever the file order puts the proxy tests first (measured 2026-11-10: forced order exit 1 with 5 fails, same order with `--isolate` exit 0).
- WHEN changing the point balance → DO go through `functions/api/auth/points.ts` (`points:<userId>` in KV), NOT a field on the session: sessions are per login, the balance is per account.

## Task Group: migrasi-claude (2026-11-12)

- WHEN claiming a session for this repo with `bun ~/vivera/scripts/pr-registry.mjs claim` → DO pass `--repo /home/belajarcarabelajar/Proyek/adaptiva` and check that the printed worktree path is `adaptiva-wt/...`, NOT `--project adaptiva` (the flag does not exist and is ignored, so the claim creates a vivera worktree; measured 2026-11-12).
- WHEN committing on this machine → DO set `GIT_AUTHOR_NAME/EMAIL` and `GIT_COMMITTER_NAME/EMAIL` from `git log -1 --format='%an <%ae>'` for that commit, NOT `git config --global` (no global identity is configured, so a plain `git commit` fails with "Author identity unknown").
