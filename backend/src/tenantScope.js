/**
 * Tenant isolation helpers for ISP multi-tenancy.
 */

/**
 * Ensure a row's isp_id matches the resolved request tenant.
 * Returns false and sends 404 when mismatched (no cross-tenant leak).
 */
export function assertRowBelongsToTenant(res, row, ispId, notFoundMessage = "Not found") {
  if (!row || String(row.isp_id || row.ispId || "") !== String(ispId || "")) {
    res.status(404).json({ message: notFoundMessage });
    return false;
  }
  return true;
}

/**
 * Staff users with a fixed ispId cannot query another tenant.
 */
export function assertNoCrossTenantQuery(req, requestedIspId) {
  const role = req.user?.role;
  if (role === "system_owner" || role === "super_admin") return true;
  const own = req.user?.ispId || req.tenantIspId;
  if (!own) return false;
  if (requestedIspId && String(requestedIspId) !== String(own)) return false;
  return true;
}
