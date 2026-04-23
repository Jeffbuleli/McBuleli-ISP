import { query } from "./db.js";
import { decryptSecret } from "./secrets.js";

function getProtocol(node) {
  return node.use_tls ? "https" : "http";
}

function buildBaseUrl(node) {
  return `${getProtocol(node)}://${node.host}:${node.api_port}/rest`;
}

async function mikrotikRequest(node, path, { method = "GET", body } = {}) {
  const password = decryptSecret(node.password_enc || node.password || "");
  const response = await fetch(`${buildBaseUrl(node)}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${node.username}:${password}`).toString("base64")}`,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.message || payload?.detail || `HTTP ${response.status}`;
    throw new Error(`MikroTik API error: ${message}`);
  }
  return payload;
}

function getNetworkUsername(customerId) {
  return `c${String(customerId).replaceAll("-", "").slice(0, 10)}`;
}

function getNetworkPassword(customerId, subscriptionId) {
  const c = String(customerId).replaceAll("-", "").slice(0, 4);
  const s = String(subscriptionId).replaceAll("-", "").slice(0, 6);
  return `mcb${c}${s}`;
}

async function logRadiusSyncEvent({
  ispId,
  subscriptionId = null,
  username,
  action,
  status,
  details = {}
}) {
  await query(
    "INSERT INTO freeradius_sync_events (id, isp_id, subscription_id, username, action, status, details) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6::jsonb)",
    [ispId, subscriptionId, username, action, status, JSON.stringify(details)]
  );
}

async function syncFreeRadius({ ispId, subscriptionId, username, password, rateLimit, disabled }) {
  if (process.env.FREERADIUS_SYNC_ENABLED !== "true") {
    await logRadiusSyncEvent({
      ispId,
      subscriptionId,
      username,
      action: disabled ? "suspend" : "activate",
      status: "skipped",
      details: { reason: "FREERADIUS_SYNC_ENABLED is not true" }
    });
    return;
  }
  try {
    await query("DELETE FROM radius_radcheck WHERE username = $1", [username]);
    await query("DELETE FROM radius_radreply WHERE username = $1", [username]);

    await query(
      "INSERT INTO radius_radcheck (username, attribute, op, value) VALUES ($1, 'Cleartext-Password', ':=', $2)",
      [username, password]
    );
    await query(
      "INSERT INTO radius_radcheck (username, attribute, op, value) VALUES ($1, 'Auth-Type', ':=', $2)",
      [username, disabled ? "Reject" : "Accept"]
    );
    if (!disabled && rateLimit) {
      await query(
        "INSERT INTO radius_radreply (username, attribute, op, value) VALUES ($1, 'Mikrotik-Rate-Limit', ':=', $2)",
        [username, String(rateLimit)]
      );
    }
    await logRadiusSyncEvent({
      ispId,
      subscriptionId,
      username,
      action: disabled ? "suspend" : "activate",
      status: "success",
      details: { rateLimit: rateLimit || null, disabled }
    });
  } catch (error) {
    await logRadiusSyncEvent({
      ispId,
      subscriptionId,
      username,
      action: disabled ? "suspend" : "activate",
      status: "failed",
      details: { message: error?.message || String(error) }
    });
  }
}

async function logProvisioningEvent({
  ispId,
  nodeId = null,
  subscriptionId = null,
  action,
  accessType = null,
  status,
  details = {}
}) {
  await query(
    "INSERT INTO network_provisioning_events (id, isp_id, node_id, subscription_id, action, access_type, status, details) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7::jsonb)",
    [ispId, nodeId, subscriptionId, action, accessType, status, JSON.stringify(details)]
  );
}

async function getDefaultNode(ispId) {
  const result = await query(
    "SELECT id, isp_id, name, host, api_port, use_tls, username, password, password_enc, default_pppoe_profile, default_hotspot_profile FROM isp_network_nodes WHERE isp_id = $1 AND is_active = TRUE ORDER BY is_default DESC, created_at ASC LIMIT 1",
    [ispId]
  );
  return result.rows[0] || null;
}

async function loadSubscriptionContext(ispId, subscriptionId) {
  const result = await query(
    "SELECT s.id, s.isp_id, s.access_type, s.status, s.customer_id, s.plan_id, c.full_name, c.phone, p.rate_limit, p.duration_days FROM subscriptions s JOIN customers c ON c.id = s.customer_id JOIN plans p ON p.id = s.plan_id WHERE s.id = $1 AND s.isp_id = $2",
    [subscriptionId, ispId]
  );
  return result.rows[0] || null;
}

async function ensurePppoeSecret(node, context, disabled) {
  const username = getNetworkUsername(context.customer_id);
  const password = getNetworkPassword(context.customer_id, context.id);
  const all = await mikrotikRequest(node, "/ppp/secret");
  const existing = Array.isArray(all) ? all.find((row) => row.name === username) : null;
  const body = {
    name: username,
    password,
    profile: node.default_pppoe_profile || "default",
    disabled: disabled ? "true" : "false",
    comment: `mcbuleli-sub:${context.id}|rate:${context.rate_limit}`
  };
  if (!existing || !existing[".id"]) {
    await mikrotikRequest(node, "/ppp/secret", { method: "PUT", body });
    return { username, password, mode: "created" };
  }
  await mikrotikRequest(node, `/ppp/secret/${encodeURIComponent(existing[".id"])}`, {
    method: "PATCH",
    body
  });
  return { username, password, mode: "updated" };
}

async function ensureHotspotUser(node, context, disabled) {
  const username = getNetworkUsername(context.customer_id);
  const password = getNetworkPassword(context.customer_id, context.id);
  const all = await mikrotikRequest(node, "/ip/hotspot/user");
  const existing = Array.isArray(all) ? all.find((row) => row.name === username) : null;
  const body = {
    name: username,
    password,
    profile: node.default_hotspot_profile || "default",
    disabled: disabled ? "true" : "false",
    comment: `mcbuleli-sub:${context.id}|rate:${context.rate_limit}`
  };
  if (!existing || !existing[".id"]) {
    await mikrotikRequest(node, "/ip/hotspot/user", { method: "PUT", body });
    return { username, password, mode: "created" };
  }
  await mikrotikRequest(node, `/ip/hotspot/user/${encodeURIComponent(existing[".id"])}`, {
    method: "PATCH",
    body
  });
  return { username, password, mode: "updated" };
}

export async function provisionSubscriptionAccess({ ispId, subscriptionId, action }) {
  const context = await loadSubscriptionContext(ispId, subscriptionId);
  if (!context) {
    return { ok: false, skipped: true, message: "Subscription not found" };
  }
  const node = await getDefaultNode(ispId);
  if (!node) {
    await logProvisioningEvent({
      ispId,
      subscriptionId,
      action,
      accessType: context.access_type,
      status: "skipped",
      details: { reason: "No active network node configured" }
    });
    return { ok: true, skipped: true, message: "No active network node configured" };
  }

  const disabled = action === "suspend";
  try {
    const result =
      context.access_type === "hotspot"
        ? await ensureHotspotUser(node, context, disabled)
        : await ensurePppoeSecret(node, context, disabled);
    await syncFreeRadius({
      ispId,
      subscriptionId,
      username: result.username,
      password: result.password,
      rateLimit: context.rate_limit,
      disabled
    });
    await logProvisioningEvent({
      ispId,
      nodeId: node.id,
      subscriptionId,
      action,
      accessType: context.access_type,
      status: "success",
      details: {
        node: node.name,
        host: node.host,
        username: result.username,
        mode: result.mode,
        disabled
      }
    });
    return {
      ok: true,
      skipped: false,
      nodeName: node.name,
      host: node.host,
      username: result.username,
      password: result.password,
      disabled
    };
  } catch (error) {
    await logProvisioningEvent({
      ispId,
      nodeId: node.id,
      subscriptionId,
      action,
      accessType: context.access_type,
      status: "failed",
      details: { message: error?.message || String(error) }
    });
    return { ok: false, skipped: false, message: error?.message || "Provisioning failed" };
  }
}
