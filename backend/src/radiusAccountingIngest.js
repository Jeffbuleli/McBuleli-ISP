/**
 * Normalize FreeRADIUS / rlm_rest style JSON (mixed key casing) for storage.
 */

import { query } from "./db.js";

function first(body, keys) {
  if (!body || typeof body !== "object") return null;
  for (const k of keys) {
    const v = body[k];
    if (v != null && v !== "") return v;
  }
  return null;
}

function flattenPayload(body) {
  if (!body || typeof body !== "object") return {};
  const attrs = body.attrs && typeof body.attrs === "object" ? body.attrs : {};
  return { ...attrs, ...body };
}

export function parseRadiusAccountingBody(body) {
  const b = flattenPayload(body);
  const username = first(b, ["User-Name", "user-name", "username", "UserName"]);
  const acctSessionId = first(b, ["Acct-Session-Id", "acct_session_id", "Acct-Session-ID"]);
  const acctStatusType = first(b, ["Acct-Status-Type", "acct_status_type"]);
  const nasIp = first(b, ["NAS-IP-Address", "nas-ip-address", "NAS-IP-Address"]);
  const framedIp = first(b, ["Framed-IP-Address", "framed-ip-address", "Framed-IP-Address"]);
  const inOct = first(b, ["Acct-Input-Octets", "acct-input-octets"]);
  const outOct = first(b, ["Acct-Output-Octets", "acct-output-octets"]);
  const ts = first(b, ["Event-Timestamp", "Acct-Update-Time", "timestamp"]);

  let eventTime = null;
  if (ts != null) {
    const n = Number(ts);
    if (Number.isFinite(n) && n > 1e12) {
      eventTime = new Date(n).toISOString();
    } else if (Number.isFinite(n) && n > 1e8) {
      eventTime = new Date(n * 1000).toISOString();
    } else if (typeof ts === "string" && ts.trim()) {
      const d = new Date(ts);
      if (!Number.isNaN(d.getTime())) eventTime = d.toISOString();
    }
  }

  function octetSafe(v) {
    if (v == null || v === "") return null;
    try {
      const n = BigInt(String(v));
      if (n > BigInt("9223372036854775807")) return "9223372036854775807";
      return String(n);
    } catch {
      return null;
    }
  }

  return {
    username: username != null ? String(username).slice(0, 256) : null,
    acctSessionId: acctSessionId != null ? String(acctSessionId).slice(0, 256) : null,
    acctStatusType: acctStatusType != null ? String(acctStatusType).slice(0, 64) : null,
    nasIpAddress: nasIp != null ? String(nasIp).slice(0, 64) : null,
    framedIpAddress: framedIp != null ? String(framedIp).slice(0, 64) : null,
    acctInputOctets: octetSafe(inOct),
    acctOutputOctets: octetSafe(outOct),
    eventTime,
    raw: b
  };
}

export async function insertRadiusAccountingRecord({ ispId, body }) {
  const p = parseRadiusAccountingBody(body);
  await query(
    `INSERT INTO radius_accounting_ingest
     (isp_id, username, acct_session_id, acct_status_type, nas_ip_address, framed_ip_address, acct_input_octets, acct_output_octets, event_time, raw)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::bigint, $8::bigint, $9::timestamptz, $10::jsonb)`,
    [
      ispId || null,
      p.username,
      p.acctSessionId,
      p.acctStatusType,
      p.nasIpAddress,
      p.framedIpAddress,
      p.acctInputOctets,
      p.acctOutputOctets,
      p.eventTime,
      JSON.stringify(p.raw)
    ]
  );
  return { ok: true };
}
