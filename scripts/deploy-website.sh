#!/usr/bin/env bash
# =============================================================================
# deploy-website.sh — Full manual deploy for Adaptiva (Cloudflare Pages)
#
# Usage:
#   bash scripts/deploy-website.sh
#   bash scripts/deploy-website.sh --skip-build      # redeploy existing dist/
#   bash scripts/deploy-website.sh --skip-push        # deploy only, no git push
#
# Requires:
#   - .env or /root/.env with CLOUDFLARE_API_TOKEN / CF_API_TOKEN & CLOUDFLARE_ACCOUNT_ID / CF_ACCOUNT_ID
#   - bun installed globally
# =============================================================================

set -euo pipefail

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

step()  { echo -e "\n${CYAN}${BOLD}▶ $*${RESET}"; }
ok()    { echo -e "${GREEN}✔ $*${RESET}"; }
warn()  { echo -e "${YELLOW}⚠ $*${RESET}"; }
die()   { echo -e "${RED}✖ $*${RESET}" >&2; exit 1; }

# ── Parse flags ──────────────────────────────────────────────────────────────
SKIP_BUILD=false
SKIP_PUSH=false
for arg in "$@"; do
  case $arg in
    --skip-build) SKIP_BUILD=true ;;
    --skip-push)  SKIP_PUSH=true  ;;
    *) die "Unknown argument: $arg" ;;
  esac
done

# ── Load .env ─────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  if [[ -f "/root/.env" ]]; then
    warn "Local .env not found. Falling back to /root/.env"
    ENV_FILE="/root/.env"
  else
    die ".env not found at $ENV_FILE or /root/.env"
  fi
fi

# Export CF credentials (support both CLOUDFLARE_* and CF_* naming)
set -a
eval $(grep -E '^(CLOUDFLARE_API_TOKEN|CF_API_TOKEN|CLOUDFLARE_ACCOUNT_ID|CF_ACCOUNT_ID)=' "$ENV_FILE" || true)
set +a

CF_API_TOKEN="${CLOUDFLARE_API_TOKEN:-${CF_API_TOKEN:-}}"
CF_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-${CF_ACCOUNT_ID:-}}"

[[ -z "$CF_API_TOKEN" ]] && die "CLOUDFLARE_API_TOKEN or CF_API_TOKEN is not set in $ENV_FILE"
[[ -z "$CF_ACCOUNT_ID" ]] && die "CLOUDFLARE_ACCOUNT_ID or CF_ACCOUNT_ID is not set in $ENV_FILE"

CF_PROJECT_NAME="adaptiva"
CF_BRANCH="main"

echo -e "\n${BOLD}╔══════════════════════════════════════════╗"
echo -e   "║  Adaptiva — Cloudflare Pages Deploy      ║"
echo -e   "╚══════════════════════════════════════════╝${RESET}"
echo -e   "  Project : ${CYAN}$CF_PROJECT_NAME${RESET}"
echo -e   "  Branch  : ${CYAN}$CF_BRANCH${RESET}"
BUILD_START=$(date +%s)
cd "$ROOT_DIR"

# ── Step 1: Typecheck & Tests ────────────────────────────────────────────────
step "1/5  Typecheck & Automated Tests"
if ! bun x tsc --noEmit --project apps/web/tsconfig.json 2>&1; then
  die "Typecheck failed — fix type errors before deploying."
fi
ok "Typecheck passed"

if ! bun run test 2>&1; then
  die "Unit tests failed — fix failing tests before deploying."
fi
ok "Unit tests passed"

# ── Step 2: Build ─────────────────────────────────────────────────────────────
step "2/5  Build Application"
if [[ "$SKIP_BUILD" == "true" ]]; then
  warn "Skipping build (--skip-build flag set)"
  [[ -d "$ROOT_DIR/apps/web/dist" ]] || die "apps/web/dist/ does not exist — cannot skip build"
  ok "Using existing apps/web/dist/"
else
  BUILD_START=$(date +%s)
  if ! bun run build; then
    die "Build failed — see output above."
  fi

  BUILD_END=$(date +%s)
  BUILD_SECS=$((BUILD_END - BUILD_START))
  ok "Build complete in ${BUILD_SECS}s"

  # Sanity check: apps/web/dist/index.html must exist
  [[ -f "$ROOT_DIR/apps/web/dist/index.html" ]] || die "apps/web/dist/index.html missing after build"

  # Print bundle sizes for the main JS chunks
  echo ""
  echo "  Bundle sizes:"
  (set +o pipefail; find "$ROOT_DIR/apps/web/dist/assets" -name "*.js" -not -name "*.map" 2>/dev/null | xargs du -sh 2>/dev/null | sort -rh | head -8 | sed 's/^/    /')
fi

# ── Step 3: Git status check ─────────────────────────────────────────────────
step "3/5  Git status check"
GIT_STATUS=$(git status --porcelain 2>/dev/null || true)

if [[ -n "$GIT_STATUS" ]]; then
  warn "Uncommitted changes detected in working tree"
  echo "$GIT_STATUS" | head -10 | sed 's/^/    /'
  if [[ $(echo "$GIT_STATUS" | wc -l) -gt 10 ]]; then
    echo "    ... (and more)"
  fi
else
  ok "Working tree clean"
fi

# ── Step 4: Deploy to Cloudflare Pages ───────────────────────────────────────
step "4/5  Deploy to Cloudflare Pages"
DEPLOY_START=$(date +%s)

DEPLOY_OUTPUT=$(
  CLOUDFLARE_API_TOKEN="$CF_API_TOKEN" \
  CLOUDFLARE_ACCOUNT_ID="$CF_ACCOUNT_ID" \
  npx -y wrangler pages deploy apps/web/dist \
    --project-name "$CF_PROJECT_NAME" \
    --branch "$CF_BRANCH" \
    --commit-dirty=true \
    2>&1
)

DEPLOY_EXIT=$?
DEPLOY_END=$(date +%s)
DEPLOY_SECS=$((DEPLOY_END - DEPLOY_START))

echo "$DEPLOY_OUTPUT" | grep -E "(Uploading|Deploying|Deployment|Error|error|WARNING|Deployment complete)" || true

if [[ $DEPLOY_EXIT -ne 0 ]]; then
  echo "$DEPLOY_OUTPUT"
  die "Deployment failed (exit $DEPLOY_EXIT)"
fi

# Extract deployment URL
DEPLOY_URL=$(echo "$DEPLOY_OUTPUT" | grep -oE 'https://[a-z0-9]+\.adaptiva\.pages\.dev' | head -1 || true)

ok "Deployed in ${DEPLOY_SECS}s"

# ── Step 5: Summary ───────────────────────────────────────────────────────────
step "5/5  Deployment Summary"
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗"
echo -e   "║  ✅  Deploy Complete!                    ║"
echo -e   "╚══════════════════════════════════════════╝${RESET}"
echo -e   "  Pages URL   : ${CYAN}${DEPLOY_URL:-https://adaptiva.pages.dev}${RESET}"
echo -e   "  Production  : ${CYAN}https://adaptiva.belajarcarabelajar.com${RESET}"
echo -e   "  Total time  : $((DEPLOY_END - BUILD_START))s"
echo ""
