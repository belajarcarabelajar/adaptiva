# Session Learning Ledger: audit 2026-11-09 wave 1 (adaptiva, setform, terminal-log-intelligence)

## 1. Identity

- **Session:** audit1109-adaptiva, audit1109-setform, audit1109-tli (one orchestrating session, three repositories)
- **Plan files:** `docs/code-plan/plans/2026-11-10-audit-gelombang-1-{adaptiva,setform,tli}.md` in each repository
- **Written at:** 2026-11-10
- **Preconditions:** all task commits verified; two pre-existing gate reds (adaptiva typecheck, TLI format) moved to their own PRs (#66, TLI format PR).

## 2. Mistake Log

| # | Category | Trigger (what I did) | Signal (how it surfaced) | Cost | Correct move |
|---|---|---|---|---|---|
| 1 | `tool-misfire` | Ran `bun scripts/ultra-plan-runner.mjs <abs plan path> --execute` from `~/vivera` for plans in other repositories | `FAILED-BLOCKING (precondition: modify: userscript/setform.user.js)`; runner resolves `files` against `process.cwd()` (`executePlan(... dir = process.cwd())`) | 3 wasted runs, 1 extra round | `cd <plan repo worktree> && bun ~/vivera/scripts/ultra-plan-runner.mjs <relative plan> --execute` |
| 2 | `premature-guess` | Wrote verify tasks requiring typecheck/lint/format exit 0 after measuring only the test-suite baseline | Pre-existing reds found only at the end (adaptiva tsc 196 errors, TLI format:check) | 2 extra follow-up PRs, plans not closable | Run every gate the verify task names on the base commit before writing the plan, and record the baseline |
| 3 | `rule-miss` | Ran TLI verification through `colab-test -C <worktree>` whose folder is `audit1109-tli` | `paths.test.ts` asserts the checkout folder name; colab-test copies to `/content/<basename>` | 1 false failure, 1 extra verify worktree | Verify from a detached worktree whose basename equals the repository name, or note the known false failure |
| 4 | `retry-blind` | (none observed) | | | |

Not counted as own mistakes: three subagents ended on the provider usage limit (AGENTS.md A16 handled it: no new dispatch, chunks finished inline); a subagent's off-right detection bug and a test-isolation leak were caught in the parent diff audit.

## 3. Distilled Rules

| # | Candidate rule | Minimum-Signal | 30-Day Horizon | Keep? | Kind |
|---|---|---|---|---|---|
| 1 | WHEN running `ultra-plan-runner.mjs --execute`, `plan-mark-done.mjs` or `plan-closeout.mjs` for a plan outside vivera → DO run them with cwd = the plan's repository worktree, NOT from `~/vivera` with an absolute plan path | Y | Y | KEEP (cross-project; promotion asked) | mechanical (the runner could resolve `files` against the plan's git root) |
| 2 | WHEN a plan's verify task asserts typecheck, lint, format or build exit 0 → DO run each of those gates on the base commit during grounding and record the result, NOT only the test suite | Y | Y | KEEP (cross-project; promotion asked) | judgement |
| 3 | WHEN verifying terminal-log-intelligence through colab-test → DO use a copy whose folder is named `terminal-log-intelligence`, NOT a worktree slot folder (`paths.test.ts` asserts the name) | Y | Y | KEEP (repo MEMORY.md) | mechanical |
| 4 | WHEN a bun test file calls `mock.module` → DO call `mock.restore()` in `afterEach`, NOT leave the module mocked (it leaks into later files of the same `bun test` run) | Y | Y | KEEP (repo MEMORY.md) | mechanical |
