/** Table names must match FreeRADIUS sql module configuration (same DB as this app). */

const RADCHECK_ALLOWED = ["radius_radcheck", "radcheck"];
const RADREPLY_ALLOWED = ["radius_radreply", "radreply"];

function pick(name, allowed, label) {
  const t = String(name || "").trim() || allowed[0];
  if (!allowed.includes(t)) {
    throw new Error(`${label} must be one of: ${allowed.join(", ")}`);
  }
  return t;
}

export function resolveFreeradiusRadcheckTable() {
  return pick(process.env.FREERADIUS_TABLE_RADCHECK, RADCHECK_ALLOWED, "FREERADIUS_TABLE_RADCHECK");
}

export function resolveFreeradiusRadreplyTable() {
  return pick(process.env.FREERADIUS_TABLE_RADREPLY, RADREPLY_ALLOWED, "FREERADIUS_TABLE_RADREPLY");
}
