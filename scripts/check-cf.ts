#!/usr/bin/env bun
/**
 * Validate Cloudflare Pages project + env + custom domain setup.
 * Reads /root/.env locally, never echoes token values.
 *
 * Usage:
 *   bun run scripts/check-cf.ts                 # stdout summary
 *   bun run scripts/check-cf.ts --json          # raw JSON dump
 *   bun run scripts/check-cf.ts --out /tmp/x    # also write to file
 *
 * Required in /root/.env:
 *   CLOUDFLARE_API_TOKEN
 *   CLOUDFLARE_ACCOUNT_ID
 * Optional (will be reported if present):
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 */

import { readFileSync, writeFileSync } from "node:fs";

import { existsSync } from "node:fs";

const ENV_PATH =
  process.env.ADAPTIVA_ENV_PATH ??
  (existsSync("./.env") ? "./.env" : "/root/.env");
const PROJECT_NAME = "adaptiva";
const EXPECTED_DOMAIN = "adaptiva.belajarcarabelajar.com";

// --- 1. Load /root/.env (do not log values) ---
function loadEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function mask(v: string | undefined): string {
  if (!v) return "<missing>";
  if (v.length <= 8) return `<len=${v.length}>`;
  return `${v.slice(0, 4)}…${v.slice(-4)} (len=${v.length})`;
}

type CfResponse<T> = { success: boolean; errors: unknown[]; result: T };

async function cfGet<T>(path: string, token: string): Promise<CfResponse<T>> {
  const r = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return (await r.json()) as CfResponse<T>;
}

type Deployment = {
  id: string;
  url: string;
  environment: string;
  created_on: string;
  latest_stage?: { name: string; status: string };
  stages?: Array<{ name: string; status: string }>;
  is_skipped?: boolean;
};
type Project = {
  name: string;
  subdomain: string;
  production_branch: string;
  latest_deployment: Deployment | null;
};
type Domain = { name: string; status: string };

async function main() {
  const args = new Set(process.argv.slice(2));
  const wantJson = args.has("--json");
  const outIdx = process.argv.indexOf("--out");
  const outPath = outIdx !== -1 ? process.argv[outIdx + 1] : null;

  let env: Record<string, string>;
  try {
    env = loadEnv(ENV_PATH);
  } catch (e) {
    const msg = `Failed to read ${ENV_PATH}: ${(e as Error).message}`;
    if (outPath) writeFileSync(outPath, JSON.stringify({ ok: false, error: msg }));
    console.error(msg);
    process.exit(2);
  }

  // Accept both CLOUDFLARE_* and CF_* naming.
  const token = env.CLOUDFLARE_API_TOKEN ?? env.CF_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID ?? env.CF_ACCOUNT_ID;
  const googleId = env.GOOGLE_CLIENT_ID;
  const googleSecret = env.GOOGLE_CLIENT_SECRET;

  const checks: Array<{ name: string; ok: boolean; detail: unknown }> = [];

  // --- Env presence (no values printed) ---
  const tokenSource = env.CLOUDFLARE_API_TOKEN
    ? "CLOUDFLARE_API_TOKEN"
    : env.CF_API_TOKEN
      ? "CF_API_TOKEN"
      : null;
  const accountSource = env.CLOUDFLARE_ACCOUNT_ID
    ? "CLOUDFLARE_ACCOUNT_ID"
    : env.CF_ACCOUNT_ID
      ? "CF_ACCOUNT_ID"
      : null;
  checks.push({
    name: "env: Cloudflare API token present",
    ok: Boolean(token),
    detail: token
      ? { source: tokenSource, masked: mask(token) }
      : "missing (set CLOUDFLARE_API_TOKEN or CF_API_TOKEN in /root/.env)",
  });
  checks.push({
    name: "env: Cloudflare account ID present",
    ok: Boolean(accountId),
    detail: accountId
      ? { source: accountSource, masked: mask(accountId) }
      : "missing (set CLOUDFLARE_ACCOUNT_ID or CF_ACCOUNT_ID in /root/.env)",
  });
  checks.push({
    name: "env: GOOGLE_CLIENT_ID present",
    ok: Boolean(googleId),
    detail: googleId ? { masked: mask(googleId) } : "missing (required for Google OAuth)",
  });
  checks.push({
    name: "env: GOOGLE_CLIENT_SECRET present",
    ok: Boolean(googleSecret),
    detail: googleSecret ? { masked: mask(googleSecret) } : "missing (required for token exchange)",
  });

  if (!token || !accountId) {
    const result = {
      ok: false,
      envPath: ENV_PATH,
      checks,
      note: "Missing required env vars; aborting Cloudflare API calls.",
    };
    if (outPath) writeFileSync(outPath, JSON.stringify(result, null, 2));
    if (wantJson) console.log(JSON.stringify(result, null, 2));
    else console.log("✗ Missing CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID in /root/.env");
    process.exit(3);
  }

  // --- Project lookup ---
  const project = await cfGet<Project>(
    `/accounts/${accountId}/pages/projects/${PROJECT_NAME}`,
    token,
  );
  if (!project.success) {
    const result = {
      ok: false,
      envPath: ENV_PATH,
      checks,
      api: { project: project.errors },
    };
    if (outPath) writeFileSync(outPath, JSON.stringify(result, null, 2));
    if (wantJson) console.log(JSON.stringify(result, null, 2));
    else console.log("✗ Cloudflare API error:", JSON.stringify(project.errors));
    process.exit(4);
  }

  const p = project.result;
  checks.push({
    name: `pages project "${PROJECT_NAME}" exists`,
    ok: true,
    detail: {
      subdomain: p.subdomain,
      production_branch: p.production_branch,
      cf_url: p.subdomain.endsWith(".pages.dev")
        ? p.subdomain
        : `${p.subdomain}.pages.dev`,
    },
  });
  const latest = p.latest_deployment;
  const latestStageStatus = latest?.latest_stage?.status;
  const allStagesOk =
    latest?.stages?.every(
      (s) => s.status === "success" || s.status === "skipped" || s.status === "idle",
    ) ?? false;
  checks.push({
    name: "latest deployment",
    ok: latestStageStatus === "success" || allStagesOk,
    detail: latest
      ? {
          id: latest.id,
          env: latest.environment,
          created_on: latest.created_on,
          url: latest.url,
          latest_stage: latest.latest_stage,
          is_skipped: latest.is_skipped,
        }
      : "no deployments",
  });

  // --- Custom domains ---
  const domains = await cfGet<Domain[]>(
    `/accounts/${accountId}/pages/projects/${PROJECT_NAME}/domains`,
    token,
  );
  if (domains.success) {
    const names = domains.result.map((d) => d.name);
    const expectedActive = domains.result.find(
      (d) => d.name === EXPECTED_DOMAIN && d.status === "active",
    );
    checks.push({
      name: `custom domain ${EXPECTED_DOMAIN}`,
      ok: Boolean(expectedActive),
      detail: {
        registered: names,
        matched: expectedActive ? expectedActive.status : "not found",
      },
    });
  } else {
    checks.push({
      name: `custom domain ${EXPECTED_DOMAIN}`,
      ok: false,
      detail: domains.errors,
    });
  }

  // --- Pages secrets (names only via wrangler; skip in JSON mode if not installed) ---
  // We avoid shelling out to wrangler here; user can run separately:
  //   bunx wrangler pages secret list --project-name adaptiva
  checks.push({
    name: "hint: list Pages secrets",
    ok: true,
    detail: "run: bunx wrangler pages secret list --project-name adaptiva",
  });

  const overall = checks.every((c) => c.ok || c.name.startsWith("hint:"));
  const result = {
    ok: overall,
    envPath: ENV_PATH,
    expectedDomain: EXPECTED_DOMAIN,
    cfPagesUrl: `${p.subdomain}.pages.dev`,
    checks,
  };

  if (outPath) writeFileSync(outPath, JSON.stringify(result, null, 2));
  if (wantJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  for (const c of checks) {
    const mark = c.ok ? "✓" : "✗";
    console.log(`${mark} ${c.name}`);
    console.log(`    ${JSON.stringify(c.detail)}`);
  }
  console.log("");
  console.log(
    `Pages URL : https://${p.subdomain.endsWith(".pages.dev") ? p.subdomain : `${p.subdomain}.pages.dev`}`,
  );
  console.log(`Custom    : https://${EXPECTED_DOMAIN}`);
  console.log(`Overall   : ${overall ? "OK" : "ISSUES"}`);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
