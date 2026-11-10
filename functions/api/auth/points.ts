// Per-account point ledger in the SESSIONS KV namespace.
//
// KV layout:
//   points:<userId>  -> balance as a decimal string, no TTL
//
// Read-modify-write without a lock: two concurrent requests of one account
// can both pass the balance check. The owner accepted that race (no D1/DO).
// This module must not import ./_shared, which re-exports from here.

export const DEFAULT_INITIAL_POINTS = 100;

interface PointsKV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

interface PointsEnv {
  SESSIONS: PointsKV;
}

export interface PointsResult {
  success: boolean;
  remainingPoints: number;
}

export function pointsKey(userId: string): string {
  return `points:${userId}`;
}

function isPositiveAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** Balance of one account; the initial grant is written once, on first lookup. */
export async function getBalance(env: PointsEnv, userId: string): Promise<number> {
  const key = pointsKey(userId);
  const raw = await env.SESSIONS.get(key);
  if (raw === null) {
    await env.SESSIONS.put(key, String(DEFAULT_INITIAL_POINTS));
    return DEFAULT_INITIAL_POINTS;
  }
  // A corrupt value is left in place for inspection and spends as zero.
  const balance = Number(raw);
  return Number.isFinite(balance) ? balance : 0;
}

export async function deductPoints(
  env: PointsEnv,
  userId: string,
  cost: number,
): Promise<PointsResult> {
  // Checked before any KV access so a bad cost cannot even seed the grant.
  if (!isPositiveAmount(cost)) return { success: false, remainingPoints: 0 };
  const balance = await getBalance(env, userId);
  if (balance < cost) return { success: false, remainingPoints: balance };
  const remaining = balance - cost;
  await env.SESSIONS.put(pointsKey(userId), String(remaining));
  return { success: true, remainingPoints: remaining };
}

export async function refundPoints(
  env: PointsEnv,
  userId: string,
  amount: number,
): Promise<PointsResult> {
  if (!isPositiveAmount(amount)) return { success: false, remainingPoints: 0 };
  const balance = await getBalance(env, userId);
  const remaining = balance + amount;
  // KV rejects a second write to one key within about a second, and a refund
  // usually follows the deduction that closely; the failure is logged so the
  // owner can reconcile, and reported so callers never claim a refund.
  try {
    await env.SESSIONS.put(pointsKey(userId), String(remaining));
  } catch (error) {
    console.error("Points refund write failed", {
      userId,
      amount,
      balance,
      error: String(error),
    });
    return { success: false, remainingPoints: balance };
  }
  return { success: true, remainingPoints: remaining };
}
