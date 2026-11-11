---
schema: ultra-plan/v1
plan_id: 2026-11-12-migrasi-claude
status: Approved
version: 1
runner_contract: true
defaults:
  retry_transient_max: 1
  step_timeout_s: 900 # commands run through colab-test (SUCP_REMOTE_RUNNER), which can queue behind other sessions
  on_precondition_fail: stop-task-continue-independent
  allow_loose_skip_if: []
  require_impacts: true
  allow_no_impacts: []
  require_traceability: true
  retry_if: any
tasks:
  - id: T1
    depends_on: []
    impacts: ["Pages Function routing for /api/ai - rg -n 'api/' apps/web/public/_redirects", "points ledger calls deductUserPoints/refundUserPoints unchanged - rg -n 'deductUserPoints|refundUserPoints' functions", "root dependencies and lockfile gain @anthropic-ai/sdk - rg -n 'anthropic' package.json"]
    files: { create: [functions/api/ai/_tasks.ts, functions/api/ai/_claude.ts, functions/api/ai/_core.ts, functions/api/ai/index.ts, functions/api/ai/__tests__/tasks.test.ts, functions/api/ai/__tests__/claude.test.ts, functions/api/ai/__tests__/core.test.ts], modify: [package.json, bun.lock], test: [] }
    idempotency_key: "T1:json-task-endpoint"
    skip_if: "bun test --isolate functions/api/ai/__tests__/core.test.ts"
    verify_exit: 0
    run:
      - cmd: "bun test --isolate functions/api/ai"
        expect_exit: 1
        retry: 0
      - cmd: "bun test --isolate functions/api/ai"
        expect_exit: 0
        retry: 1
  - id: T2
    depends_on: [T1]
    impacts: ["tutor chat client in T6 reads the SSE frame format - rg -n 'event-stream|type.:.delta' functions/api/ai apps/web/src/services/gemini/chat.ts"]
    files: { create: [functions/api/ai/__tests__/tutor-stream.test.ts], modify: [functions/api/ai/_core.ts, functions/api/ai/_claude.ts], test: [] }
    idempotency_key: "T2:tutor-sse"
    skip_if: "bun test --isolate functions/api/ai/__tests__/tutor-stream.test.ts"
    verify_exit: 0
    run:
      - cmd: "bun test --isolate functions/api/ai/__tests__/tutor-stream.test.ts"
        expect_exit: 1
        retry: 0
      - cmd: "bun test --isolate functions/api/ai"
        expect_exit: 0
        retry: 1
  - id: T3
    depends_on: [T2]
    impacts: ["resources client in T7 reads {text, sources} - rg -n 'sources' apps/web/src/services/gemini/resources.ts", "HistoryItem.learningResources keeps {web:{uri,title}} - rg -n 'learningResources' apps/web/src/types.ts"]
    files: { create: [functions/api/ai/__tests__/resources.test.ts], modify: [functions/api/ai/_core.ts, functions/api/ai/_claude.ts, functions/api/ai/_tasks.ts], test: [] }
    idempotency_key: "T3:resources-web-search"
    skip_if: "bun test --isolate functions/api/ai/__tests__/resources.test.ts"
    verify_exit: 0
    run:
      - cmd: "bun test --isolate functions/api/ai/__tests__/resources.test.ts"
        expect_exit: 1
        retry: 0
      - cmd: "bun test --isolate functions/api/ai"
        expect_exit: 0
        retry: 1
  - id: T4
    depends_on: []
    impacts: ["App.tsx callers of generateInitialCurriculumOutline/generateSevenDayPlan/generateModuleLectureSummary - rg -n 'generateInitialCurriculumOutline|generateSevenDayPlan|generateModuleLectureSummary' apps/web/src/App.tsx", "callWithRetries error-string matching used by every service - rg -n 'callWithRetries' apps/web/src/services/gemini", "core.gap.test.ts getAiClient block - rg -n 'getAiClient' apps/web/src/services/gemini/core.gap.test.ts"]
    files: { create: [apps/web/src/services/gemini/aiClient.test.ts, apps/web/src/services/gemini/curriculum.test.ts], modify: [apps/web/src/services/gemini/core.ts, apps/web/src/services/gemini/curriculum.ts, apps/web/src/services/gemini/constants.ts, apps/web/src/services/gemini/core.gap.test.ts, apps/web/src/services/geminiService.test.ts], test: [] }
    idempotency_key: "T4:client-transport-curriculum"
    skip_if: "bun run --cwd apps/web test src/services/gemini/curriculum.test.ts"
    verify_exit: 0
    run:
      - cmd: "bun run --cwd apps/web test src/services/gemini/curriculum.test.ts"
        expect_exit: 1
        retry: 0
      - cmd: "bun run --cwd apps/web test src/services"
        expect_exit: 0
        retry: 1
  - id: T5
    depends_on: [T4]
    impacts: ["App.tsx quiz and exam callers - rg -n 'generateQuiz|generateDetailedQuizExplanation|generateExamQuestions' apps/web/src/App.tsx", "useFlashcards calls generateFlashcardsFromMaterial - rg -n 'generateFlashcardsFromMaterial' apps/web/src/hooks"]
    files: { create: [apps/web/src/services/gemini/quiz.test.ts, apps/web/src/services/gemini/flashcard.test.ts], modify: [apps/web/src/services/gemini/quiz.ts, apps/web/src/services/gemini/flashcard.ts, apps/web/src/services/geminiService.test.ts], test: [] }
    idempotency_key: "T5:quiz-exam-flashcard"
    skip_if: "bun run --cwd apps/web test src/services/gemini/quiz.test.ts src/services/gemini/flashcard.test.ts"
    verify_exit: 0
    run:
      - cmd: "bun run --cwd apps/web test src/services/gemini/quiz.test.ts src/services/gemini/flashcard.test.ts"
        expect_exit: 1
        retry: 0
      - cmd: "bun run --cwd apps/web test src/services src/hooks"
        expect_exit: 0
        retry: 1
  - id: T6
    depends_on: [T5, T2]
    impacts: ["TutorSession.chat type and its three App.tsx creators - rg -n 'startChatSession|TutorSession|Chat \\| null' apps/web/src/App.tsx apps/web/src/types.ts", "persisted history recreates chat on load - rg -n 'startChatSession' apps/web/src/App.tsx"]
    files: { create: [apps/web/src/services/gemini/chat.test.ts], modify: [apps/web/src/services/gemini/chat.ts, apps/web/src/types.ts, apps/web/src/App.tsx, apps/web/src/services/geminiService.test.ts], test: [] }
    idempotency_key: "T6:tutor-chat-client"
    skip_if: "bun run --cwd apps/web test src/services/gemini/chat.test.ts"
    verify_exit: 0
    run:
      - cmd: "bun run --cwd apps/web test src/services/gemini/chat.test.ts"
        expect_exit: 1
        retry: 0
      - cmd: "bun run --cwd apps/web test src/services"
        expect_exit: 0
        retry: 1
      - cmd: "bun x tsc --noEmit --project apps/web/tsconfig.json"
        expect_exit: 0
        retry: 0
  - id: T7
    depends_on: [T6, T3]
    impacts: ["App.tsx resources rendering of source.web.uri/title - rg -n 'source.web' apps/web/src/App.tsx"]
    files: { create: [apps/web/src/services/gemini/resources.test.ts], modify: [apps/web/src/services/gemini/resources.ts, apps/web/src/services/geminiService.test.ts], test: [] }
    idempotency_key: "T7:resources-client"
    skip_if: "bun run --cwd apps/web test src/services/gemini/resources.test.ts"
    verify_exit: 0
    run:
      - cmd: "bun run --cwd apps/web test src/services/gemini/resources.test.ts"
        expect_exit: 1
        retry: 0
      - cmd: "bun run --cwd apps/web test src/services"
        expect_exit: 0
        retry: 1
  - id: T8
    depends_on: [T1]
    impacts: ["root dev script starts apps/api - rg -n 'dev' package.json", "listen-host loopback guard stays - rg -n 'loopback|127.0.0.1' apps/api/src/listen-host.js", "devServer.test.ts pins the Vite proxy - rg -n 'api/' apps/web/src/devServer.test.ts"]
    files: { create: [], modify: [apps/api/src/app.js, apps/api/src/app.test.js, apps/api/src/env.js, apps/api/src/env.test.js, apps/api/src/server.js, apps/web/vite.config.ts, apps/web/src/devServer.test.ts], test: [] }
    idempotency_key: "T8:dev-server-ai-route"
    skip_if: "bun test apps/api/src"
    verify_exit: 0
    run:
      - cmd: "bun test apps/api/src/app.test.js"
        expect_exit: 1
        retry: 0
      - cmd: "bun test apps/api/src"
        expect_exit: 0
        retry: 1
      - cmd: "bun run --cwd apps/web test src/devServer.test.ts"
        expect_exit: 0
        retry: 1
  - id: T9
    depends_on: [T7, T8]
    impacts: ["pointCosts.test.ts imports ACTION_POINT_COSTS - rg -n 'ACTION_POINT_COSTS' apps/web/src", "SPA redirect rule order - rg -n 'api' apps/web/public/_redirects", "deploy script test gate runs the suites - rg -n 'test' scripts/deploy-website.sh", "docs mention GEMINI - rg -n -i 'gemini' README.md .env.example package.json wrangler.jsonc"]
    files: { create: [], modify: [apps/web/package.json, apps/web/index.html, apps/web/public/_redirects, apps/web/src/services/pointCosts.test.ts, package.json, bun.lock, .env.example, README.md, wrangler.jsonc], test: [] }
    idempotency_key: "T9:remove-gemini"
    skip_if: "bun -e \"const g = Bun.spawnSync(['rg','-l','-i','google/genai|api/gemini','apps','functions','package.json','--glob','!**/node_modules/**']); process.exit(g.stdout.toString().trim() === '' ? 0 : 1)\""
    verify_exit: 0
    run:
      - cmd: "bun -e \"const g = Bun.spawnSync(['rg','-l','-i','google/genai|api/gemini','apps','functions','package.json','--glob','!**/node_modules/**']); process.exit(g.stdout.toString().trim() === '' ? 0 : 1)\""
        expect_exit: 1
        retry: 0
      - cmd: "bun -e \"const g = Bun.spawnSync(['rg','-l','-i','google/genai|api/gemini','apps','functions','package.json','--glob','!**/node_modules/**']); process.exit(g.stdout.toString().trim() === '' ? 0 : 1)\""
        expect_exit: 0
        retry: 0
      - cmd: "bun run --cwd apps/web test src/services/pointCosts.test.ts"
        expect_exit: 0
        retry: 1
  - id: T10
    depends_on: [T9]
    impacts: ["production bundle and Functions bundle - bun run build"]
    files: { create: [], modify: [], test: [] }
    idempotency_key: "T10:full-verification"
    skip_if: "false"
    verify_exit: 0
    run:
      - cmd: "bun run test"
        expect_exit: 0
        retry: 1
        timeout_s: 1800
      - cmd: "bun run test:functions"
        expect_exit: 0
        retry: 1
      - cmd: "bun test apps/api/src"
        expect_exit: 0
        retry: 1
      - cmd: "bun x tsc --noEmit --project apps/web/tsconfig.json"
        expect_exit: 0
        retry: 0
      - cmd: "bun run build"
        expect_exit: 0
        retry: 1
---
# Migrating Adaptiva AI to the Claude API: Implementation Plan

> For agentic workers: REQUIRED EXECUTION METHOD: delegated task execution, with the parent owning git. Steps use checkbox syntax.

**Goal:** every AI feature runs on Claude (Sonnet 5.5 or Haiku 5.5, per task) through `/api/ai`, and every JSON output is constrained by a server-side schema.
**Architecture:** a Pages Function `functions/api/ai` that holds the task registry, the points core and the SDK gateway. The web services keep their exported names and call `callAiTask`. The `apps/api` dev server runs the same core without points.
**Tech Stack:** Bun 1.4.4, Cloudflare Pages Functions (`nodejs_compat`), `@anthropic-ai/sdk` 1.3.0, React 19 with Vite and vitest, Express dev server.
**Active Project Profile:** repo `/home/belajarcarabelajar/Proyek/adaptiva`. Plan written at `f9d4e91`. Execution base is `origin/main` `1015764`: #71 makes Vite proxy all of `/api` to `apps/api` and adds `/api/auth/me` 401, so T8 only needs the `/api/ai` route in `apps/api`., bun workspaces `apps/*` and `packages/*`; config in `package.json`, `apps/web/package.json`, `wrangler.jsonc`, `tsconfig.base.json` and `apps/web/tsconfig.json`.
**Project Commands:** web `bun run --cwd apps/web test <path>`, functions `bun run test:functions` (`--isolate`, MEMORY.md), dev API `bun test apps/api/src`, typecheck `bun x tsc --noEmit --project apps/web/tsconfig.json`, build `bun run build`. Heavy commands go through `colab-test` (A47).
**Protected Boundaries:**
- Point costs and refund semantics.
- The error strings matched in `core.ts` `callWithRetries`.
- `functions/api/auth/*`.
- The `adaptiva_sess` session cookie.
- The `GEMINI_API_KEY` secret is not deleted.
- No deploy.
**Spec:** `docs/code-plan/specs/2026-11-12-migrasi-claude-design.md`
**RCA:** `docs/code-plan/debug/2026-11-12-plan-7-hari-json-kutip-rca.md`
**Scope:** the 9 call sites, the new `/api/ai` function, the dev server, and removal of Gemini.
**Non-Goals:**
- Changing point prices.
- Production deploy (asked after the PR).
- Deleting the `GEMINI_API_KEY` secret.
- Renaming `services/gemini/` (`defer: names stay "gemini", upgrade-trigger: next bulk PR in services/`).
- The per-chunk trim in the tutor (old behaviour).

## Session checklist

- [x] Feedback loop for the original bug: `bun ~/.cache/tmp/adaptiva-plan-json/repro.ts` exit 1 on 3/3 runs; control exit 0, days=7.
- [x] Hypothesis chunks C1-C3 gathered, plus the parent bundle check. H1 confirmed; H2-H5 disproven (RCA file).
- [x] RCA written: `docs/code-plan/debug/2026-11-12-plan-7-hari-json-kutip-rca.md`.
- [x] Owner decisions, question tool 2026-11-12:
  - Scope: migrate everything.
  - Points: per-action model mapping, costs unchanged.
  - Intent: mapping approved.
- [x] `ANTHROPIC_API_KEY` installed by the owner. `wrangler pages secret list --project-name adaptiva` lists it in production.
- [x] Research R1 (call sites and schemas), R2 (proxy contract), R3 (SDK shapes) gathered. The spec cites them.
- [x] Plan validated: `bun ~/vivera/scripts/ultra-plan-runner.mjs <plan>` exit 0, `Validation: OK`. Published: `plan-sync` publish exit 0, issue-sync exit 0 -> #72. `Plan` gate approved by the owner 2026-11-12.
- [x] Session claimed. `pr-registry claim --session migrasi-claude-adaptiva --repo <adaptiva> --worktree` reports claimed, with worktree `/mnt/belajarcarabelajar/adaptiva-wt/migrasi-claude-adaptiva` on branch `2026-11-12-migrasi-claude/migrasi-claude-adaptiva` from `origin/main` 1015764. The first claim omitted `--repo` and landed in vivera: its clean worktree and branch were removed, and its slot was set to `closed`.
- [ ] T1-T10 done with evidence, per the tasks below.
- [ ] Fix verification fan-out: replay the original repro, regression suites, sibling-caller audit, and an 8-criteria diff review.
- [ ] Deliver: commit on the session branch, PR with `Refs #<n>`, plan and issue re-synced.
- [ ] Debt sweep, learning ledger, `graphify update` and `graphify:sync`.

## Visual Map

```mermaid
flowchart TD
    accTitle: Task graph for the Claude migration
    accDescr: The plan gate opens the server chain (JSON endpoint, tutor stream, resources search) and the client chain (transport with curriculum, quiz and flashcard, chat, resources) plus the dev server, all of which merge into Gemini removal and full verification.
    G{{"Plan gate"}} --> T1
    T1["T1 /api/ai JSON tasks"] --> T2["T2 tutor SSE"]
    T2 --> T3["T3 resources web_search"]
    G --> T4["T4 client transport + curriculum"]
    T4 --> T5["T5 quiz, exam, flashcard"]
    T5 --> T6["T6 tutor chat client"]
    T2 --> T6
    T6 --> T7["T7 resources client"]
    T3 --> T7
    T1 --> T8["T8 dev server /api/ai"]
    T7 --> T9["T9 remove Gemini"]
    T8 --> T9
    T9 --> T10["T10 full verification"]
    T10 --> V(["Verify fan-out, then PR"])
```

**Reasoning Lenses:**
- Investigative: RCA H1-H5.
- Computational: the schema guarantees 7 days.
- Security: the server picks model and schema; the key lives only in the Function.
- Compatibility: exported names and the error strings stay.
- Operational: rollback by revert while the Gemini secret is still present.
- Test-first: each task opens with a RED run.

**Acceptance Criteria:**
- [ ] AC-1: `curriculum.sevenDayPlan` goes to `claude-sonnet-5-5`, effort `medium`, with a JSON schema whose required properties are `day1`..`day7`.
- [ ] AC-2: every JSON task sends the registry's model, effort, `max_tokens` and schema, and nothing from the client overrides them.
- [ ] AC-3: the points and error contract: deduct before the call, one refund on API or network error, `x-adaptiva-points`, and the five error strings.
- [ ] AC-4: the tutor streams SSE from `claude-haiku-5-5` with the client-supplied history.
- [ ] AC-5: resources use `web_search_20250305` on Sonnet 5.5 and return `{text, sources}`.
- [ ] AC-6: the exported web service names and parameters are unchanged; callers behave the same.
- [ ] AC-7: Gemini is gone, and the suites, typecheck and build exit 0.

**Traceability:**

| AC | Task | Check | Evidence |
|---|---|---|---|
| AC-1 | T1, T4 | `bun test --isolate functions/api/ai/__tests__/tasks.test.ts` and `bun run --cwd apps/web test src/services/gemini/curriculum.test.ts` | the sevenDayPlan schema is `day1..day7` required; the client maps it to 7 days |
| AC-2 | T1 | `bun test --isolate functions/api/ai/__tests__/claude.test.ts` | request body from the gateway: model, effort, format, betas/fallbacks only on Sonnet |
| AC-3 | T1 | `bun test --isolate functions/api/ai/__tests__/core.test.ts` | the status, error and refund table from spec 2.3 |
| AC-4 | T2, T6 | `bun test --isolate functions/api/ai/__tests__/tutor-stream.test.ts` and `bun run --cwd apps/web test src/services/gemini/chat.test.ts` | SSE frames delta, done and error; history appended |
| AC-5 | T3, T7 | `bun test --isolate functions/api/ai/__tests__/resources.test.ts` and `bun run --cwd apps/web test src/services/gemini/resources.test.ts` | sources de-duplicated from `web_search_tool_result`, `pause_turn` at most 2 |
| AC-6 | T4, T5, T6, T7 | `bun x tsc --noEmit --project apps/web/tsconfig.json` | exit 0 with no change to the call sites in App.tsx and the hooks, except the `Chat` type |
| AC-7 | T9, T10 | `bun run test`, `bun run test:functions`, `bun test apps/api/src`, `bun run build` | all exit 0; `rg` for google/genai and api/gemini is empty |

**Assumptions & Open Questions:**
- An effort of `medium` on Sonnet 5.5 follows the owner's request, even though the docs suggest `low` for content generation.
- Refusals are not refunded, following the old proxy's blocked handling.
- `web_search_20250305` instead of `20260209` (spec section 3).

**Dependencies & Impact:**
- New: `@anthropic-ai/sdk` 1.3.0 at the root, where Functions resolve modules.
- Removed: `@google/genai` from `apps/web`.
- Consumers: `App.tsx`, `hooks/useFlashcards.ts`, `pointCosts.test.ts`, `devServer.test.ts`, `apps/api`.

**Risks & Rollback:** cost (Sonnet plus search with the same points), refusal categories without fallback, and SDK bundle size on Workers (measured in T10). Rollback: `git revert` the merge; `GEMINI_API_KEY` is still in Pages.
**Security & Compatibility:**
- The key exists only in the Function and in the dev server's `.env.local`.
- The dev server stays loopback only.
- The client sends no model, schema or `max_tokens`.
- The `messages` sent to the tutor are validated: roles, at most 40 turns, at most 8,000 characters each.
**Operations & Rollout:** no deploy in this plan. After merge, the owner chooses to deploy; the post-deploy check is a new session plus a 7-day plan in production.
**CI/Review Gate:** repo hooks; the verification fan-out after T10; an independent reviewer (`staid`).
**Documentation:** README (env and dev), `.env.example`, `wrangler.jsonc` comment, MEMORY.md lessons in the debt sweep.
**Definition of Done:** AC-1 to AC-7 checked with exit codes, the PR opened with `Refs #<n>`, and the debt sweep done.
**Reproducibility:** Bun 1.4.4. The Anthropic tests use a fake gateway or a fake `fetch`, so there is no network and no key in the tests.
**Test Reliability:** functions tests always run with `--isolate` (MEMORY.md). There is no real time or network in the tests.
**Privacy & Data Governance:** prompts carry learning topics and chat; no personal data is added. The key is never logged.
**Dependencies & Supply Chain:** `@anthropic-ai/sdk` is the official package from Anthropic; `bun.lock` is updated in T1.
**UX States:** the error messages stay in Indonesian as before, and the tutor's apology on stream failure stays.
**Persistent State & Artifact Storage:** `HistoryItem.learningResources` keeps its shape. `TutorSession.chat` changes type; it is recreated on load, as before.
**Entity & Sourcing Verification:** spec section 6 (docs fetched 2026-11-12).
**Verification:** T10 plus the verification fan-out.

## Global Constraints

- The model, effort, `max_tokens` and schema come only from `functions/api/ai/_tasks.ts`.
- Every schema: object root, `additionalProperties: false`, all properties required, no `maxItems` and no `minItems > 1`.
- No `temperature`, `top_p`, `top_k`, `thinking: disabled` or `budget_tokens`. `fallbacks` only on Sonnet.
- The error strings, refund notes and points come verbatim from `functions/api/gemini/[[path]].ts` (spec 2.3).
- Subagents never touch git; the parent stages by path.

## Tasks

### Task T1: /api/ai endpoint for JSON tasks

**Files:**
- Create:
  - `functions/api/ai/_tasks.ts`: the registry plus `ACTION_POINT_COSTS` and `resolveTask`.
  - `functions/api/ai/_claude.ts`: `createClaudeGateway`.
  - `functions/api/ai/_core.ts`: `handleAiRequest`.
  - `functions/api/ai/index.ts`: `onRequest`, with real deps and CORS copied from the old proxy.
  - Tests: `__tests__/tasks.test.ts`, `claude.test.ts`, `core.test.ts`.
- Modify: `package.json` and `bun.lock`, to add `@anthropic-ai/sdk`.

**Interfaces:**
- Produces:
  - `type TaskId`.
  - `resolveTask(id): TaskSpec | null`.
  - `ACTION_POINT_COSTS`.
  - `createClaudeGateway(apiKey, fetchImpl?)`.
  - `handleAiRequest(request, env, deps)`.
  - Response `{text}`.

**Steps:**
- [ ] Write `tasks.test.ts`. It asserts:
  - the 7-row mapping (model, effort, `max_tokens`, action);
  - that the sevenDayPlan schema requires `day1`..`day7`;
  - that no schema uses `maxItems` or `minItems > 1`.
- [ ] Write `claude.test.ts` with a fake `fetch` that returns an SSE message:
  - the request body has `output_config.{effort, format}`;
  - Sonnet sends the `anthropic-beta: server-side-fallback-2026-07-01` header plus `fallbacks: "default"`; Haiku sends neither;
  - text is read from the `text` block after `thinking`.
- [ ] Write `core.test.ts` with a fake gateway and fake deduct and refund, covering each row of spec 2.3.
- [ ] Run `bun test --isolate functions/api/ai`: expect exit 1 (RED).
- [ ] Implement, then run it again: exit 0.

**Edge cases:**
- Unknown task.
- `prompt` empty or not a string.
- Body over 1 MiB.
- A refund that throws.
- `max_tokens` stop.
- Refusal.

**Deliberate Shortcuts:** None.

### Task T2: tutor SSE

**Files:**
- Create: `functions/api/ai/__tests__/tutor-stream.test.ts`.
- Modify: `_core.ts` (the `tutor.chat` branch) and `_claude.ts` (`streamText`).

**Behavior:**
- Frames are `delta`, `done` and `error`.
- An error before the first delta gets a refund; an error after partial output does not.
- `messages` is validated: roles, a final `user` turn, at most 40 turns, at most 8,000 characters each.

**Steps:** RED with `bun test --isolate functions/api/ai/__tests__/tutor-stream.test.ts` (exit 1), implement, then GREEN with `bun test --isolate functions/api/ai` (exit 0).

### Task T3: resources with web_search

**Files:**
- Create: `functions/api/ai/__tests__/resources.test.ts`.
- Modify: `_core.ts`, `_claude.ts` and `_tasks.ts` (the `resources.search` row).

**Behavior:**
- The tool is `{type: "web_search_20250305", name: "web_search", max_uses: 3}`.
- `sources` are unique `{uri, title}` pairs taken from `web_search_tool_result`.
- On `pause_turn` the request continues at most 2 times.
- A search error inside a 200 response gives `sources: []`.

**Steps:** RED (exit 1), implement, then GREEN with `bun test --isolate functions/api/ai` (exit 0).

### Task T4: client transport and curriculum (the reported bug)

**Files:**
- Create: `apps/web/src/services/gemini/aiClient.test.ts` and `curriculum.test.ts`.
- Modify:
  - `core.ts`: `callAiTask` replaces `getAiClient` and `ai`.
  - `curriculum.ts`: the three generators; the 7-day prompt becomes `day1..day7`, and the mapping goes back to `days[]`.
  - `constants.ts`: remove the Gemini model constants.
  - `core.gap.test.ts`: the `getAiClient` block becomes `callAiTask`.
  - `geminiService.test.ts`: remove the curriculum blocks.

**Regression test (correct seam):**
- `curriculum.test.ts` feeds `{day1..day7}` through a fake `fetch`, with text values that contain `"quoted phrases"` (valid JSON, escaped).
- `generateSevenDayPlan` must return 7 days, in order, with the right `day` values.
- The request must have `task: "curriculum.sevenDayPlan"` and must not carry a model.

**Steps:**
- [ ] RED: `bun run --cwd apps/web test src/services/gemini/curriculum.test.ts`, expect exit 1.
- [ ] Implement.
- [ ] GREEN: `bun run --cwd apps/web test src/services`, expect exit 0.

### Task T5: quiz, exam and flashcard

**Files:**
- Create: `quiz.test.ts` and `flashcard.test.ts`.
- Modify:
  - `quiz.ts`: wrap the quiz as `{questions}`; drop `type` and `maxPoints` from the exam prompt.
  - `flashcard.ts`.
  - `geminiService.test.ts`.

**Steps:** RED (exit 1), implement, then GREEN with `bun run --cwd apps/web test src/services src/hooks` (exit 0). The `useFlashcards` tests mock the barrel, so they stay valid.

### Task T6: tutor chat client

**Files:**
- Create: `chat.test.ts`.
- Modify:
  - `chat.ts`: `TutorChat` and the SSE reader.
  - `types.ts`: `TutorSession.chat: TutorChat | null`.
  - `App.tsx`: the `Chat` import becomes `TutorChat`.
  - `geminiService.test.ts`.

**Behavior:**
- `startChatSession` is synchronous and keeps all three system-instruction variants.
- The history gains the user turn and the assistant turn after `done`.
- On an error frame or a network failure, the apology is sent through `onChunk`, as before.

**Steps:** RED (exit 1), implement, GREEN for `src/services` (exit 0), then `tsc` (exit 0).

### Task T7: resources client

**Files:**
- Create: `resources.test.ts`.
- Modify: `resources.ts` (one call to `resources.search`; the retry without tools is removed, because the server has no Google grounding to fail over from) and `geminiService.test.ts`.

**Behavior:**
- `{text, sources}` maps to `{content, sources: [{web: {uri, title}}]}`.
- Empty text returns `null`.

**Steps:** RED (exit 1), implement, then GREEN (exit 0).

### Task T8: dev server /api/ai

**Files:**
- Modify:
  - `apps/api/src/app.js`: POST `/api/ai` calls `handleAiRequest` with no-op points; remove the `/api/gemini` proxy.
  - `env.js`: `requireAnthropicKey`.
  - `server.js`.
  - Tests in `app.test.js` and `env.test.js`.
  - `apps/web/vite.config.ts`: proxy `/api/ai`.
  - `apps/web/src/devServer.test.ts`.

**Steps:** RED `bun test apps/api/src/app.test.js` (exit 1), implement, then GREEN `bun test apps/api/src` (exit 0) and `devServer.test.ts` (exit 0).

### Task T9: remove Gemini

**Files:**
- Delete `functions/api/gemini/` along with its tests. Their behaviour is now covered by T1-T3.
- Modify:
  - `apps/web/package.json`: remove `@google/genai`.
  - `apps/web/index.html`: remove the importmap entry.
  - `apps/web/public/_redirects`: `/api/ai` comes before the catch-all.
  - `pointCosts.test.ts`: the new import path.
  - `package.json`: the `pages:secret:set` script becomes `ANTHROPIC_API_KEY`.
  - `bun.lock`.
  - `.env.example`, `README.md` and the `wrangler.jsonc` comment.

**Steps:**
- [ ] RED: the `rg` probe for `google/genai|api/gemini` finds hits (exit 1).
- [ ] Remove them.
- [ ] Run the probe again: no hits (exit 0).
- [ ] `pointCosts.test.ts`: exit 0.

### Task T10: full verification

Runs: `bun run test`, `bun run test:functions`, `bun test apps/api/src`, `tsc` and `bun run build`, each with exit 0. The runs go through `colab-test`, in parallel where they are independent (A48).

## Size warnings (runner)

The runner warns about `bun.lock`, `App.tsx` and `geminiService.test.ts` because they are over 20,000 bytes. `bun.lock` is generated. `App.tsx` changes only the `Chat` type. `geminiService.test.ts` shrinks in each of T4-T7, because its blocks move to per-domain test files. Adaptiva has no `size:check` gate (`rg -n size package.json` finds nothing), so these are notes only, not blockers.

## Error Ledger

| # | Class | Item | Status |
|---|---|---|---|
| E1 | code | `parseGeminiJsonResponse` cannot repair bare quotes, and no caller sends a schema (RCA H1) | fixed by the schemas in T1 and T4-T5 |
| E2 | pre-existing | functions are not typechecked by any `tsconfig` (`ls functions/tsconfig.json` shows no file) | debt sweep |
| E3 | pre-existing | the tutor's `cleanAiOutput` trims each chunk | non-goal, debt sweep |

## Human Approval Gate

- Intent (mapping): Approved by the owner, 2026-11-12.
- Plan: Approved by the owner, 2026-11-12 (question tool, "Approve, start T1").

## Amendments

- 2026-11-12, v1.1: T4 now depends on nothing instead of `[T1]`. T4 needs only the `/api/ai` response contract (`{text}` plus the error strings in spec 2.3). That contract is fixed in the spec, and T4's files do not overlap with T1's, so T4 runs in parallel with T1. Expand, migrate, contract: T4 adds `callAiTask` and keeps `getAiClient`, `ai` and the Gemini model constants for the services that have not moved yet. T9 removes those, together with the `getAiClient` block in `core.gap.test.ts`.
