# Plan: "Failed to generate 7-day plan" (Gemini JSON with unescaped inner quotes)

- **Plan id:** 2026-11-12-plan-7-hari-json-kutip
- **Status:** Draft (investigation; RCA approval gate not passed yet)
- **Path (Step 1):** Bounded, bug fix. One parse flow in `apps/web`; ratchets to Architectural if the cause turns out to be in the shared proxy contract.
- **Skill file used:** `~/vivera/Super Ultra Code Plan Implementation.md` (first hit of the fallback chain); phase skills loaded by name: `super-ultra-code-plan`, `sucp-rules`, `sucp-tdd-debug`, `sucp-brainstorm`.
- **Reported symptom (2026-11-12 04:57, production `adaptiva.belajarcarabelajar.com`, bundle `index-CCeW8Zw3.js`):** "Oops! Something went wrong. Failed to generate 7-day plan." Console: `All JSON parsing attempts failed for the response` (core.ts:188), then `Failed to parse 7-day plan data from Gemini` (curriculum.ts:334), then `Error: Failed to generate 7-day plan.` (App.tsx:654).
- **Evidence artifact:** `~/Unduhan/console-export-2026-11-12_4-58-53.log` lines 124-162 (full response text).

## Active profile (snapshot, HEAD f9d4e91)

| Item | Value | Source |
|---|---|---|
| Repo root | `/home/belajarcarabelajar/Proyek/adaptiva` (bun workspaces `apps/*`, `packages/*`) | `package.json` |
| Target | `apps/web/src/services/gemini/{core,curriculum}.ts` | stack trace in log |
| Test runner | vitest (`apps/web` `vitest run`), functions: `bun test --isolate functions` | `apps/web/package.json`, root `package.json` |
| Heavy commands | through `colab-test` (A47) | `~/AGENTS.md` |
| Model | `MODEL_SEVEN_DAY_PLAN = 'gemini-2.5-flash'` | `apps/web/src/services/gemini/constants.ts:4` |
| Request config | `responseMimeType: "application/json"`, no `responseSchema` | `curriculum.ts` generateSevenDayPlan |

## Feedback loop (Phase 0)

Command: `bun ~/.cache/tmp/adaptiva-plan-json/repro.ts` (replays the captured response through the real `parseGeminiJsonResponse`; exit 1 = bug, exit 0 = 7 days parsed).

- Red: exit 1, `JSON.parse: JSON Parse error: Expected '}'`, `parsed=null days=0`; 3 of 3 runs exit 1.
- Positive control: same text with the 4 inner phrases escaped (`\"...\"`) gives exit 0, `days=7`.
- Unescaped inner phrases found: `"Pengantar Edutech"`, `"Analisis Kebutuhan"`, `"cara membuat kopi"`, `"Pengantar Teknologi Pendidikan"`.

> **Superseded 2026-11-12:** the owner chose to migrate to the Claude API. The session checklist moved to `docs/code-plan/plans/2026-11-12-migrasi-claude.md`. This file is kept as the investigation record.

## Checklist (frozen)

- [x] Feedback loop built and run: `bun ~/.cache/tmp/adaptiva-plan-json/repro.ts` exit 1 (3/3), control exit 0 days=7.
- [ ] Minimise: one unescaped pair in a minimal `{"days":[...]}` is sufficient for red (becomes the vitest fixture).
- [x] Hypothesis chunks dispatched (manifest below) and all reports gathered: C1 (H2, H3 disproven, `[[path]].ts:137-140`, `:603-606`), C2 (schema page fetched 2026-11-12), C3 (H4 disproven, old parsers `parsed days: null`; 7 callers).
- [x] Deployed bundle `index-CCeW8Zw3.js` matches `main` parser logic: `curl` HTTP 200, `rg -c` found 1 hit each for the parser strings.
- [x] RCA written to `docs/code-plan/debug/2026-11-12-plan-7-hari-json-kutip-rca.md` with Mermaid loop diagram (H1 confirmed by repro exit 1 and control exit 0).
- [x] Owner's key verified usable: Models API `GET /v1/models/claude-sonnet-5-5` HTTP 200 (key read from clipboard by pipe, never printed).
- [x] Owner decision (question tool, 2026-11-12): Scope = migrate all 9 AI call sites to the Claude API. Points = per-action model mapping, costs unchanged. Intent gate = Approve mapping (Sonnet 5.5 medium: curriculum, module, exam, default/resources; Haiku 5.5: quiz medium, flashcard low, tutor low).
- [x] Secret installed by the owner via `!` (`wrangler pages secret put ANTHROPIC_API_KEY` reported Success); `wrangler pages secret list --project-name adaptiva` lists `ANTHROPIC_API_KEY` in production.
- [ ] Facts for spec gathered (R1 client call sites + schemas, R2 proxy contract, R3 Anthropic SDK on Pages Functions).
- [ ] Spec `docs/code-plan/specs/2026-11-12-migrasi-claude-design.md` + ultra-plan tasks written and validated; Spec/Plan gate approved.

Path ratcheted 2026-11-12: Bounded -> Architectural (provider migration across 9 call sites, proxy, tests).
- [ ] RCA approval gate asked (question tool) and answered Approve.
- [ ] Regression test RED at the chosen seam (via `colab-test`).
- [ ] Smallest safe fix; regression test GREEN, neighbouring suite 0 failures, typecheck exit 0 (via `colab-test`).
- [ ] Fix verification fan-out: repro rerun, regression suite, sibling-caller audit, 8-criteria diff review.
- [ ] Deliver: commit on session branch, PR with `Refs #<n>`.
- [ ] Debt sweep, learning ledger, graphify update + sync.

## Hypotheses (ranked, each falsifiable)

| # | Hypothesis | Prediction |
|---|---|---|
| H1 | Gemini 2.5 Flash in JSON mode without `responseSchema` can emit literal `"` inside string values; parser has no repair for that | Escaping only the inner quotes makes the captured text parse (already observed); docs do not promise escaping without a schema |
| H2 | The proxy (`functions/api/gemini`) drops or replaces `generationConfig.responseMimeType` (e.g. #69 output-token cap) so the model is in free-text mode | Proxy code builds a new `generationConfig` without the mime type; restoring it changes the upstream request body |
| H3 | Something between Google and `response.text` unescapes `\"` (proxy response rewrite, SDK, cleaning) | Proxy/SDK code transforms response text; `\n` survives but `\"` does not |
| H4 | Regression: `sanitizeJsonString` before d478646 (#50) tolerated inner quotes | Old version returns 7 days on the captured text |
| H5 | Deployed bundle differs from `main` parser | Production bundle lacks the same parse attempts |

## Batch manifest

| Chunk | Hypothesis | Owner | Scope (read-only) | Expected output | Verification |
|---|---|---|---|---|---|
| C1 | H2, H3 | timid | `functions/api/gemini/**`, `apps/web/src/services/gemini/core.ts` client config | verdict per hypothesis with `file:line` | quote the code lines that build the upstream body and return the response |
| C2 | H1 (external) | aqua | TinyFish search/fetch: Gemini structured output docs, `@google/genai` installed version | verdict with fetched URLs + date | cited URLs were fetched in the run |
| C3 | H4 + sibling inventory | Explore-type (timid) | `git show d478646`, all callers of `parseGeminiJsonResponse` and their `generateContent` configs | verdict on H4 by running repro against old parser copy in scratch; caller table | repro command output against old copy |
| P | H5 | parent | `curl` production bundle | match/mismatch | strings found in bundle |
