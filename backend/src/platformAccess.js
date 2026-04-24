import { getLatestPlatformSubscription, isPlatformAccessAllowed } from "./platformBilling.js";

const BILLING_RELATED_PATHS = new Set([
  "/api/auth/me",
  "/api/auth/change-password",
  "/api/platform/packages",
  "/api/platform/subscriptions",
  "/api/platform/billing/status",
  "/api/platform/billing/initiate-deposit",
  "/api/platform/billing/upgrade-plan"
]);

function isBillingRelatedPath(urlPath) {
  if (BILLING_RELATED_PATHS.has(urlPath)) return true;
  if (urlPath.startsWith("/api/platform/billing/deposit-status")) return true;
  return false;
}

/**
 * After JWT authentication: block tenant workspaces with expired / invalid platform billing.
 * Super admins and users without an ISP are always allowed.
 */
export async function enforcePlatformAccess(req, res, next) {
  try {
    if (!req.user) return next();
    if (req.user.role === "super_admin") return next();
    const ispId = req.user.ispId;
    if (!ispId) return next();

    const sub = await getLatestPlatformSubscription(ispId);
    if (!sub) return next();

    const row = {
      status: sub.status,
      endsAt: sub.endsAt
    };
    if (isPlatformAccessAllowed(row)) return next();
    if (isBillingRelatedPath(req.path)) return next();

    return res.status(402).json({
      code: "PLATFORM_SUBSCRIPTION_REQUIRED",
      message:
        "Your workspace trial or subscription has ended. Pay your monthly plan (Mobile Money via Pawapay) or upgrade to continue.",
      ispId
    });
  } catch (err) {
    return next(err);
  }
}
