import { query } from "../db.js";
import { resolveIspId, requireRoles } from "../auth.js";
import { encryptSecret } from "../secrets.js";
import { getPlatformFeatureLimits } from "../platformBilling.js";
import { provisionSubscriptionAccess } from "../networkProvisioning.js";
import { collectAndStoreNetworkTelemetry } from "../networkTelemetry.js";
import { listOnlineSubscriberSessions } from "../networkOnlineSessions.js";
import { assertNoCrossTenantQuery } from "../tenantScope.js";

/**
 * Network / MikroTik routes (extracted from app.js monolith).
 * @param {import('express').Express} app
 * @param {{ authenticate: Function, logAudit: Function }} deps
 */
export function registerNetworkRoutes(app, { authenticate, logAudit }) {
  app.get(
    "/api/network/nodes",
    authenticate,
    requireRoles("super_admin", "company_manager", "isp_admin", "noc_operator"),
    async (req, res) => {
      const ispId = resolveIspId(req, res);
      if (!ispId) return;
      if (!assertNoCrossTenantQuery(req, ispId)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const result = await query(
        "SELECT id, isp_id AS \"ispId\", name, host, api_port AS \"apiPort\", use_tls AS \"useTls\", username, default_pppoe_profile AS \"defaultPppoeProfile\", default_hotspot_profile AS \"defaultHotspotProfile\", is_default AS \"isDefault\", is_active AS \"isActive\", created_at AS \"createdAt\" FROM isp_network_nodes WHERE isp_id = $1 ORDER BY is_default DESC, created_at ASC",
        [ispId]
      );
      res.json(result.rows);
    }
  );

  app.post(
    "/api/network/nodes",
    authenticate,
    requireRoles("super_admin", "company_manager", "isp_admin"),
    async (req, res) => {
      const ispId = resolveIspId(req, res);
      if (!ispId) return;
      const {
        name,
        host,
        apiPort = 443,
        useTls = true,
        username,
        password,
        defaultPppoeProfile = "default",
        defaultHotspotProfile = "default",
        isDefault = false,
        isActive = true
      } = req.body;
      if (!name || !host || !username || !password) {
        return res.status(400).json({ message: "name, host, username and password are required" });
      }
      const limits = await getPlatformFeatureLimits(ispId);
      const maxNodes = limits?.maxNetworkNodes;
      if (Number.isFinite(maxNodes)) {
        const count = await query("SELECT COUNT(*)::int AS c FROM isp_network_nodes WHERE isp_id = $1", [ispId]);
        if (count.rows[0].c >= maxNodes) {
          return res.status(403).json({
            message: `Your McBuleli plan allows up to ${maxNodes} network node(s). Upgrade to Business to add more.`
          });
        }
      }
      const encryptedPassword = encryptSecret(password);
      const inserted = await query(
        "INSERT INTO isp_network_nodes (id, isp_id, name, host, api_port, use_tls, username, password, password_enc, default_pppoe_profile, default_hotspot_profile, is_default, is_active, created_by) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id, isp_id AS \"ispId\", name, host, api_port AS \"apiPort\", use_tls AS \"useTls\", username, default_pppoe_profile AS \"defaultPppoeProfile\", default_hotspot_profile AS \"defaultHotspotProfile\", is_default AS \"isDefault\", is_active AS \"isActive\", created_at AS \"createdAt\"",
        [
          ispId,
          name,
          host,
          Number(apiPort || 443),
          Boolean(useTls),
          username,
          encryptedPassword,
          encryptedPassword,
          defaultPppoeProfile,
          defaultHotspotProfile,
          Boolean(isDefault),
          Boolean(isActive),
          req.user.sub
        ]
      );
      if (Boolean(isDefault)) {
        await query("UPDATE isp_network_nodes SET is_default = FALSE WHERE isp_id = $1 AND id <> $2", [
          ispId,
          inserted.rows[0].id
        ]);
      }
      await logAudit({
        ispId,
        actorUserId: req.user.sub,
        action: "network_node.created",
        entityType: "network_node",
        entityId: inserted.rows[0].id,
        details: { host, useTls: Boolean(useTls), isDefault: Boolean(isDefault), isActive: Boolean(isActive) }
      });
      res.status(201).json(inserted.rows[0]);
    }
  );

  app.get(
    "/api/network/freeradius-sync-events",
    authenticate,
    requireRoles("super_admin", "company_manager", "isp_admin", "noc_operator"),
    async (req, res) => {
      const ispId = resolveIspId(req, res);
      if (!ispId) return;
      const result = await query(
        "SELECT id, subscription_id AS \"subscriptionId\", username, action, status, details, created_at AS \"createdAt\" FROM freeradius_sync_events WHERE isp_id = $1 ORDER BY created_at DESC LIMIT 200",
        [ispId]
      );
      return res.json(result.rows);
    }
  );

  app.post(
    "/api/network/nodes/:nodeId/toggle",
    authenticate,
    requireRoles("super_admin", "company_manager", "isp_admin"),
    async (req, res) => {
      const ispId = resolveIspId(req, res);
      if (!ispId) return;
      const { nodeId } = req.params;
      const { isActive } = req.body;
      const updated = await query(
        "UPDATE isp_network_nodes SET is_active = $1 WHERE id = $2 AND isp_id = $3 RETURNING id, isp_id AS \"ispId\", name, host, api_port AS \"apiPort\", use_tls AS \"useTls\", username, default_pppoe_profile AS \"defaultPppoeProfile\", default_hotspot_profile AS \"defaultHotspotProfile\", is_default AS \"isDefault\", is_active AS \"isActive\", created_at AS \"createdAt\"",
        [Boolean(isActive), nodeId, ispId]
      );
      if (!updated.rows[0]) return res.status(404).json({ message: "Node not found" });
      await logAudit({
        ispId,
        actorUserId: req.user.sub,
        action: "network_node.toggled",
        entityType: "network_node",
        entityId: nodeId,
        details: { isActive: Boolean(isActive) }
      });
      return res.json(updated.rows[0]);
    }
  );

  app.post(
    "/api/network/nodes/:nodeId/default",
    authenticate,
    requireRoles("super_admin", "company_manager", "isp_admin"),
    async (req, res) => {
      const ispId = resolveIspId(req, res);
      if (!ispId) return;
      const { nodeId } = req.params;
      const found = await query("SELECT id FROM isp_network_nodes WHERE id = $1 AND isp_id = $2", [nodeId, ispId]);
      if (!found.rows[0]) return res.status(404).json({ message: "Node not found" });
      await query("UPDATE isp_network_nodes SET is_default = FALSE WHERE isp_id = $1", [ispId]);
      await query("UPDATE isp_network_nodes SET is_default = TRUE WHERE id = $1 AND isp_id = $2", [nodeId, ispId]);
      await logAudit({
        ispId,
        actorUserId: req.user.sub,
        action: "network_node.default_set",
        entityType: "network_node",
        entityId: nodeId
      });
      return res.json({ message: "Default node updated" });
    }
  );

  app.get(
    "/api/network/provisioning-events",
    authenticate,
    requireRoles("super_admin", "company_manager", "isp_admin", "noc_operator"),
    async (req, res) => {
      const ispId = resolveIspId(req, res);
      if (!ispId) return;
      const result = await query(
        "SELECT id, node_id AS \"nodeId\", subscription_id AS \"subscriptionId\", action, access_type AS \"accessType\", status, details, created_at AS \"createdAt\" FROM network_provisioning_events WHERE isp_id = $1 ORDER BY created_at DESC LIMIT 200",
        [ispId]
      );
      return res.json(result.rows);
    }
  );

  app.post(
    "/api/network/subscriptions/:subscriptionId/sync",
    authenticate,
    requireRoles("super_admin", "company_manager", "isp_admin", "noc_operator"),
    async (req, res) => {
      const ispId = resolveIspId(req, res);
      if (!ispId) return;
      const { subscriptionId } = req.params;
      const { action = "activate" } = req.body;
      if (!["activate", "suspend"].includes(action)) {
        return res.status(400).json({ message: "action must be activate or suspend" });
      }
      const result = await provisionSubscriptionAccess({ ispId, subscriptionId, action });
      await logAudit({
        ispId,
        actorUserId: req.user.sub,
        action: "network_subscription.sync",
        entityType: "subscription",
        entityId: subscriptionId,
        details: { action, ok: result.ok, skipped: Boolean(result.skipped), message: result.message || null }
      });
      if (!result.ok) return res.status(400).json({ message: result.message || "Provisioning failed" });
      return res.json(result);
    }
  );

  app.get(
    "/api/network/telemetry-snapshots",
    authenticate,
    requireRoles("super_admin", "company_manager", "isp_admin", "noc_operator", "billing_agent", "field_agent"),
    async (req, res) => {
      const ispId = resolveIspId(req, res);
      if (!ispId) return;
      const limit = Math.min(Math.max(Number(req.query.limit) || 80, 1), 500);
      const result = await query(
        `SELECT t.id, t.isp_id AS "ispId", t.node_id AS "nodeId", n.name AS "nodeName",
                t.pppoe_active AS "pppoeActive", t.hotspot_active AS "hotspotActive",
                t.connected_devices AS "connectedDevices", t.details, t.created_at AS "createdAt"
         FROM network_telemetry_snapshots t
         JOIN isp_network_nodes n ON n.id = t.node_id
         WHERE t.isp_id = $1
         ORDER BY t.created_at DESC
         LIMIT $2`,
        [ispId, limit]
      );
      return res.json(result.rows);
    }
  );

  app.get(
    "/api/network/radius-accounting-ingest",
    authenticate,
    requireRoles("super_admin", "company_manager", "isp_admin", "noc_operator", "billing_agent", "field_agent"),
    async (req, res) => {
      const ispId = resolveIspId(req, res);
      if (!ispId) return;
      const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
      const result = await query(
        `SELECT id, isp_id AS "ispId", username, acct_session_id AS "acctSessionId", acct_status_type AS "acctStatusType",
                nas_ip_address AS "nasIpAddress", framed_ip_address AS "framedIpAddress",
                acct_input_octets AS "acctInputOctets", acct_output_octets AS "acctOutputOctets",
                event_time AS "eventTime", created_at AS "createdAt"
         FROM radius_accounting_ingest
         WHERE isp_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [ispId, limit]
      );
      return res.json(result.rows);
    }
  );

  app.get(
    "/api/network/online-sessions",
    authenticate,
    requireRoles("super_admin", "company_manager", "isp_admin", "noc_operator", "billing_agent", "field_agent"),
    async (req, res) => {
      const ispId = resolveIspId(req, res);
      if (!ispId) return;
      const limit = Math.min(Math.max(Number(req.query.limit) || 80, 1), 500);
      const windowMinutes = Math.min(Math.max(Number(req.query.windowMinutes) || 30, 1), 24 * 60);
      const result = await listOnlineSubscriberSessions({
        ispId,
        limit,
        windowMinutes
      });
      return res.json(result);
    }
  );

  app.post(
    "/api/network/nodes/:nodeId/collect-telemetry",
    authenticate,
    requireRoles("super_admin", "company_manager", "isp_admin", "noc_operator"),
    async (req, res) => {
      const ispId = resolveIspId(req, res);
      if (!ispId) return;
      const { nodeId } = req.params;
      try {
        const result = await collectAndStoreNetworkTelemetry({ ispId, nodeId });
        await logAudit({
          ispId,
          actorUserId: req.user.sub,
          action: "network.telemetry_collected",
          entityType: "network_node",
          entityId: nodeId,
          details: result
        });
        if (!result.ok) {
          return res.status(400).json({ message: result.message || "Telemetry collection failed" });
        }
        return res.json(result);
      } catch (err) {
        return res.status(500).json({ message: err?.message || "Telemetry collection failed" });
      }
    }
  );
}
