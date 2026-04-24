import { query } from "./db.js";
import { mikrotikRequest } from "./networkProvisioning.js";

function countRestArray(payload) {
  if (Array.isArray(payload)) return payload.length;
  if (payload && typeof payload === "object") {
    const vals = Object.values(payload).filter((v) => v && typeof v === "object");
    if (vals.length) return vals.length;
  }
  return 0;
}

/** Short list of active sessions for telemetry details (not full CPE metrics). */
function extractSessionSamples(payload, kind, limit = 12) {
  const out = [];
  const push = (item) => {
    if (!item || typeof item !== "object" || out.length >= limit) return;
    const name = item.name || item.user || item["user-name"] || item["User-Name"] || "";
    const address = item.address || item["address"] || item["framed-ip-address"] || "";
    out.push({
      kind,
      name: String(name).slice(0, 128),
      address: String(address).slice(0, 64)
    });
  };
  if (Array.isArray(payload)) {
    for (const item of payload) push(item);
    return out;
  }
  if (payload && typeof payload === "object") {
    const vals = Object.values(payload).filter((v) => v && typeof v === "object");
    for (const item of vals) push(item);
  }
  return out;
}

/**
 * Pull active PPPoE and Hotspot sessions from a MikroTik node, store a snapshot,
 * and merge peak counts into today's network_usage_daily row for dashboard charts.
 */
export async function collectAndStoreNetworkTelemetry({ ispId, nodeId }) {
  const nodeResult = await query(
    `SELECT id, isp_id, name, host, api_port, use_tls, username, password, password_enc,
            default_pppoe_profile, default_hotspot_profile
     FROM isp_network_nodes
     WHERE id = $1 AND isp_id = $2 AND is_active = TRUE`,
    [nodeId, ispId]
  );
  const node = nodeResult.rows[0];
  if (!node) {
    return { ok: false, message: "Network node not found or inactive" };
  }

  let pppoeActive = 0;
  let hotspotActive = 0;
  let pppPayload = null;
  let hsPayload = null;
  const errors = [];

  try {
    const ppp = await mikrotikRequest(node, "/ppp/active");
    pppPayload = ppp;
    pppoeActive = countRestArray(ppp);
  } catch (e) {
    errors.push({ path: "/ppp/active", message: e?.message || String(e) });
  }

  try {
    const hs = await mikrotikRequest(node, "/ip/hotspot/active");
    hsPayload = hs;
    hotspotActive = countRestArray(hs);
  } catch (e) {
    errors.push({ path: "/ip/hotspot/active", message: e?.message || String(e) });
  }

  const connectedDevices = pppoeActive + hotspotActive;
  const details = {
    errors: errors.length ? errors : undefined,
    nodeName: node.name,
    pppoeSessionsSample: extractSessionSamples(pppPayload, "pppoe"),
    hotspotSessionsSample: extractSessionSamples(hsPayload, "hotspot")
  };

  await query(
    `INSERT INTO network_telemetry_snapshots (id, isp_id, node_id, pppoe_active, hotspot_active, connected_devices, details)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6::jsonb)`,
    [ispId, nodeId, pppoeActive, hotspotActive, connectedDevices, JSON.stringify(details)]
  );

  await query(
    `INSERT INTO network_usage_daily (id, isp_id, metric_date, hotspot_users, pppoe_users, connected_devices, bandwidth_down_gb, bandwidth_up_gb)
     VALUES (gen_random_uuid(), $1, CURRENT_DATE, $2, $3, $4, 0, 0)
     ON CONFLICT (isp_id, metric_date) DO UPDATE SET
       hotspot_users = GREATEST(network_usage_daily.hotspot_users, EXCLUDED.hotspot_users),
       pppoe_users = GREATEST(network_usage_daily.pppoe_users, EXCLUDED.pppoe_users),
       connected_devices = GREATEST(network_usage_daily.connected_devices, EXCLUDED.connected_devices)`,
    [ispId, hotspotActive, pppoeActive, connectedDevices]
  );

  return {
    ok: true,
    nodeId,
    nodeName: node.name,
    pppoeActive,
    hotspotActive,
    connectedDevices,
    pppoeSessionsSample: details.pppoeSessionsSample,
    hotspotSessionsSample: details.hotspotSessionsSample,
    warnings: errors.length ? errors : undefined
  };
}
