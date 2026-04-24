import { query } from "./db.js";

const USD_TO_CDF = Number(process.env.PLATFORM_USD_TO_CDF || 2800);
const BILLING_PERIOD_DAYS = Math.min(Math.max(Number(process.env.PLATFORM_SAAS_BILLING_DAYS || 30), 1), 365);

export function billingPeriodDays() {
  return BILLING_PERIOD_DAYS;
}

export function cdfAmountForUsd(usd) {
  const n = Math.ceil(Number(usd) * USD_TO_CDF);
  return String(Math.max(1, n));
}

export function usdAmountString(usd) {
  const n = Number(usd);
  if (!Number.isFinite(n)) return "0";
  if (Math.floor(n) === n) return String(Math.floor(n));
  return n.toFixed(2).replace(/\.?0+$/, "") || "0";
}

export async function getPlatformBillingSnapshot(ispId) {
  const sub = await getLatestPlatformSubscription(ispId);
  if (!sub) {
    return { hasSubscription: false, accessAllowed: true, legacyWorkspace: true };
  }
  const pkg = await query(
    `SELECT name, code, monthly_price_usd AS "monthlyPriceUsd", feature_flags AS "featureFlags"
     FROM platform_packages WHERE id = $1`,
    [sub.packageId]
  );
  const row = { status: sub.status, endsAt: sub.endsAt };
  return {
    hasSubscription: true,
    accessAllowed: isPlatformAccessAllowed(row),
    legacyWorkspace: false,
    subscription: {
      id: sub.id,
      status: sub.status,
      startsAt: sub.startsAt,
      endsAt: sub.endsAt,
      packageId: sub.packageId
    },
    package: pkg.rows[0] || null,
    monthlyPriceUsd: pkg.rows[0]?.monthlyPriceUsd ?? null,
    cdfEstimateForMonth: pkg.rows[0] ? cdfAmountForUsd(pkg.rows[0].monthlyPriceUsd) : null,
    billingPeriodDays: billingPeriodDays()
  };
}

export async function getLatestPlatformSubscription(ispId) {
  const result = await query(
    `SELECT s.id, s.isp_id AS "ispId", s.package_id AS "packageId", s.status, s.starts_at AS "startsAt", s.ends_at AS "endsAt"
     FROM isp_platform_subscriptions s
     WHERE s.isp_id = $1
     ORDER BY s.ends_at DESC, s.created_at DESC
     LIMIT 1`,
    [ispId]
  );
  return result.rows[0] || null;
}

export async function getPlatformFeatureLimits(ispId) {
  const result = await query(
    `SELECT p.feature_flags AS "featureFlags"
     FROM isp_platform_subscriptions s
     JOIN platform_packages p ON p.id = s.package_id
     WHERE s.isp_id = $1
       AND s.ends_at >= NOW()
       AND s.status IN ('trialing', 'active')
     ORDER BY s.ends_at DESC
     LIMIT 1`,
    [ispId]
  );
  return result.rows[0]?.featureFlags || null;
}

export function isPlatformAccessAllowed(subscriptionRow) {
  if (!subscriptionRow) return true;
  if (subscriptionRow.status === "past_due" || subscriptionRow.status === "suspended") {
    return false;
  }
  const ends = new Date(subscriptionRow.endsAt).getTime();
  if (Number.isNaN(ends) || ends < Date.now()) {
    return false;
  }
  return subscriptionRow.status === "trialing" || subscriptionRow.status === "active";
}

export async function extendPlatformSubscriptionAfterPayment(platformSubscriptionId) {
  const subResult = await query(
    `SELECT id, ends_at, status FROM isp_platform_subscriptions WHERE id = $1`,
    [platformSubscriptionId]
  );
  const sub = subResult.rows[0];
  if (!sub) return null;
  const now = Date.now();
  const currentEnd = new Date(sub.ends_at).getTime();
  const anchorMs = currentEnd > now ? currentEnd : now;
  const anchor = new Date(anchorMs);
  anchor.setDate(anchor.getDate() + BILLING_PERIOD_DAYS);
  const updated = await query(
    `UPDATE isp_platform_subscriptions
     SET status = 'active', ends_at = $1
     WHERE id = $2
     RETURNING id, isp_id AS "ispId", package_id AS "packageId", status, starts_at AS "startsAt", ends_at AS "endsAt"`,
    [anchor.toISOString(), platformSubscriptionId]
  );
  return updated.rows[0];
}

/**
 * Mark deposit session completed (idempotent) and extend SaaS subscription period.
 */
export async function applySuccessfulSaasDeposit(depositId) {
  const updatedSession = await query(
    `UPDATE platform_saas_deposit_sessions
     SET status = 'completed', completed_at = NOW()
     WHERE deposit_id = $1::uuid AND status = 'initiated'
     RETURNING id, platform_subscription_id AS "platformSubscriptionId", isp_id AS "ispId"`,
    [depositId]
  );
  if (!updatedSession.rows[0]) {
    const existing = await query(
      `SELECT status FROM platform_saas_deposit_sessions WHERE deposit_id = $1::uuid`,
      [depositId]
    );
    if (existing.rows[0]?.status === "completed") {
      return { ok: true, duplicate: true };
    }
    return { ok: false, reason: "unknown_deposit" };
  }
  const { platformSubscriptionId } = updatedSession.rows[0];
  const subRow = await extendPlatformSubscriptionAfterPayment(platformSubscriptionId);
  return { ok: true, duplicate: false, subscription: subRow };
}

export async function markSaasDepositFailed(depositId) {
  await query(
    `UPDATE platform_saas_deposit_sessions SET status = 'failed', completed_at = NOW()
     WHERE deposit_id = $1::uuid AND status = 'initiated'`,
    [depositId]
  );
}
