# Session Learning Ledger: 2026-11-12 migrasi-claude

## 1. Identity

- Plan: `docs/code-plan/plans/2026-11-12-migrasi-claude.md` (issue #72).
- Session: `migrasi-claude-adaptiva`, branch `2026-11-12-migrasi-claude/migrasi-claude-adaptiva`.
- Harvest run early, at the owner's request ("sekarang aja kalo udah nemu"), before T8 to T11 finished. The plan is not Done.

## 2. Mistake Log

| # | Category | Trigger | Signal | Cost | Correct move |
|---|---|---|---|---|---|
| 1 | `rule-miss` | Ran `pr-registry.mjs claim --project adaptiva --worktree` from `~/vivera` | wt-new created `/mnt/belajarcarabelajar/vivera-wt/migrasi-claude`, a vivera worktree | 4 commands to remove the worktree and branch and close the slot | `claim` has no `--project`; it takes `--repo <path>`. Read the usage line (`bun scripts/pr-registry.mjs` with no args) before the first claim. |
| 2 | `premature-guess` | `git commit` in a fresh worktree | `Author identity unknown` | 1 failed commit | This machine has no global git identity. Read the author from `git log -1 --format='%an <%ae>'` and pass `GIT_AUTHOR_*`/`GIT_COMMITTER_*` per commit. |
| 3 | `rule-miss` | `rmdir` of an empty directory in the main checkout | `rm-tmp-guard` blocked it | 1 retry | Empty directories are harmless to git: leave them, or move them to `~/.cache/tmp` first (AGENTS 3.2). |
| 4 | `wrong-tool` | Brief said "SDK sends `x-api-key`" (T1) | T1 GREEN run failed: SDK 1.3.0 sends `Authorization: Bearer` | 1 extra test run | Check header shapes against the installed SDK source, not memory. The agent fixed the test, not the code. |
| 5 | `scope-creep` (avoided) | Wave 2 put several agents on shared files (`_core.ts`, `geminiService.test.ts`) | Caught before dispatch | none | Recut the work into new-file modules plus a parent wiring task (T11). Plan amendment v1.2. |
| 6 | `premature-guess` | T12 fixed glued tutor words by re-cleaning the whole reply and emitting only an append-only suffix | Independent review: a `*word*` split across deltas froze the reply (`cleanAiOutput` rewrites earlier text) | 1 review round, a second fix | When a transform can rewrite text already emitted, send the whole transformed value (replace semantics), not a suffix. Test with deltas that split the transform's tokens. |

## 3. Distilled Rules

| # | Candidate rule | Minimum-Signal | 30-Day Horizon | Keep? | Kind |
|---|---|---|---|---|---|
| 1 | WHEN claiming a session for a repo other than vivera with `pr-registry.mjs claim` → DO pass `--repo <absolute repo path>` and check the printed worktree path names that repo, NOT `--project` (it does not exist; the claim defaults to vivera) | Y | Y | KEEP | mechanical |
| 2 | WHEN committing in adaptiva on this machine (no global git identity) → DO set `GIT_AUTHOR_NAME/EMAIL` and `GIT_COMMITTER_NAME/EMAIL` from `git log -1 --format='%an <%ae>'` for that commit, NOT `git config --global` | Y | Y | KEEP | mechanical |
| 3 | WHEN a test asserts an SDK request header → DO read the header from the installed SDK (`node_modules/<sdk>/client.js`) first, NOT from memory | Y | N (SDK specific) | NO-OP | judgement |
| 4 | WHEN a parallel wave would put two agents on one file → DO split it into new-file modules plus a parent wiring task, NOT serialize the whole wave | Y | Y | NO-OP (already in `sucp-rules` Non-Overlapping Scopes) | judgement |
| 5 | WHEN streaming text through a cleaner that can rewrite earlier characters (markdown stripping, trimming) → DO pass the whole cleaned text to the UI and replace, with a test whose deltas split the cleaner's tokens, NOT append-only suffixes | Y | Y | KEEP | mechanical |

## 4. Promotion Decision

| Rule # | Destination | Why | Approval |
|---|---|---|---|
| 1 | in-repo `MEMORY.md` | Repo-scoped copy | not required |
| 1 | `~/AGENTS.md` (global) | Recurs in every non-vivera repo that uses the PR registry | DECLINED by the owner (2026-11-12) |
| 2 | in-repo `MEMORY.md` | Repo-scoped | not required |

## Environment Improvements

| # | Kind | What happened | Proposed change | Keep? |
|---|---|---|---|---|
| 1 | `tool-economy` | `pr-registry.mjs` silently ignored the unknown flag `--project` | Make `claim` reject unknown flags (vivera repo) | KEEP as a follow-up candidate |

## 5. Carry-Forward Pointer

Open debt and its backlog: the plan's `## Follow-up backlog` section.
