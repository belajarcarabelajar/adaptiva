#!/usr/bin/env bun
/**
 * Create the SESSIONS KV namespace for Adaptiva and update wrangler.jsonc.
 *
 * Steps:
 *   1. Run `wrangler kv namespace create SESSIONS`
 *   2. Parse the JSON output for the new namespace id
 *   3. Insert/replace `kv_namespaces` in wrangler.jsonc
 *
 * Usage:
 *   bun run scripts/setup-kv.ts
 *   bun run scripts/setup-kv.ts --dry-run
 *   bun run scripts/setup-kv.ts --ns-id <id>   # skip the wrangler call
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const WRANGLER_CONFIG = "wrangler.jsonc";
const BINDING = "SESSIONS";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const idFlag = process.argv.indexOf("--ns-id");
const providedId = idFlag !== -1 ? process.argv[idFlag + 1] : null;

function fail(msg: string, code = 1): never {
  console.error(`✗ ${msg}`);
  process.exit(code);
}

function ok(msg: string): void {
  console.log(`✓ ${msg}`);
}

// 1. Get the namespace id
let namespaceId = providedId;

if (!namespaceId) {
  console.log(`Running: wrangler kv namespace create ${BINDING}`);
  let stdout: string;
  try {
    stdout = execSync(`wrangler kv namespace create ${BINDING}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    fail(
      `wrangler failed.\nstdout: ${err.stdout ?? ""}\nstderr: ${err.stderr ?? err.message}`,
    );
  }
  // wrangler prints JSON like: { "id": "abc123..." }
  // or TOML like: { binding = "SESSIONS", id = "abc123..." }
  const m = stdout.match(/(?:"id"|id)\s*[:=]\s*"([^"]+)"/);
  if (!m) {
    fail(`Could not parse namespace id from wrangler output:\n${stdout}`);
  }
  namespaceId = m[1];
  ok(`Created namespace ${BINDING} = ${namespaceId}`);
}

if (!/^[0-9a-f]{32}$/.test(namespaceId)) {
  fail(`Namespace id looks invalid: ${namespaceId}`);
}

// 2. Read wrangler.jsonc, update kv_namespaces
const raw = readFileSync(WRANGLER_CONFIG, "utf8");

// Build the new entry. We'll only add if not present, or replace if binding matches.
const entryLine = `    { "binding": "${BINDING}", "id": "${namespaceId}" },`;
const blockStart = /"kv_namespaces"\s*:\s*\[/;
const blockEnd = /\]/;

if (blockStart.test(raw)) {
  // Find array bounds
  const startIdx = raw.search(blockStart) + raw.match(blockStart)![0].length;
  const rest = raw.slice(startIdx);
  const endMatch = rest.match(blockEnd);
  if (!endMatch) fail("Could not find closing ] of kv_namespaces");
  const endIdx = startIdx + endMatch.index!;

  const inner = raw.slice(startIdx, endIdx).trim();
  // Check if binding already present
  if (new RegExp(`"binding"\\s*:\\s*"${BINDING}"`).test(inner)) {
    // Replace existing entry
    const lines = inner.split("\n");
    const filtered = lines
      .map((l) => l)
      .filter((l) => !new RegExp(`"binding"\\s*:\\s*"${BINDING}"`).test(l));
    // If we removed the line, re-add; otherwise it was already there with same id
    const newInner = [...filtered, entryLine].join("\n");
    const newRaw = raw.slice(0, startIdx) + "\n" + newInner + "\n  " + raw.slice(endIdx);
    if (dryRun) {
      console.log("--- diff (dry run) ---");
      console.log(newRaw);
      process.exit(0);
    }
    writeFileSync(WRANGLER_CONFIG, newRaw);
    ok(`Updated existing ${BINDING} binding in ${WRANGLER_CONFIG}`);
  } else {
    // Append to existing array
    const newInner = (inner ? inner + "\n" : "") + entryLine;
    const newRaw = raw.slice(0, startIdx) + "\n" + newInner + "\n  " + raw.slice(endIdx);
    if (dryRun) {
      console.log("--- diff (dry run) ---");
      console.log(newRaw);
      process.exit(0);
    }
    writeFileSync(WRANGLER_CONFIG, newRaw);
    ok(`Added ${BINDING} binding to existing kv_namespaces in ${WRANGLER_CONFIG}`);
  }
} else {
  // Insert a new kv_namespaces block before the closing brace.
  const newBlock = `\n  "kv_namespaces": [\n${entryLine}\n  ],`;
  const closingBrace = raw.lastIndexOf("}");
  if (closingBrace === -1) fail("Could not find closing } in wrangler.jsonc");
  const newRaw = raw.slice(0, closingBrace) + "," + newBlock + "\n" + raw.slice(closingBrace);
  if (dryRun) {
    console.log("--- diff (dry run) ---");
    console.log(newRaw);
    process.exit(0);
  }
  writeFileSync(WRANGLER_CONFIG, newRaw);
  ok(`Inserted new kv_namespaces block into ${WRANGLER_CONFIG}`);
}

console.log("");
console.log("Next steps:");
console.log("  1. Verify wrangler.jsonc has the binding");
console.log("  2. Run: bun run deploy");
console.log("  3. After deploy, the Functions at /api/auth/* will have SESSIONS bound");
