import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { query } from "./db.js";
import { authenticate, requireRoles, resolveIspId, signToken } from "./auth.js";
import { processNotificationOutboxBatch, sendNotificationDirect } from "./notifications.js";
import { provisionSubscriptionAccess } from "./networkProvisioning.js";
import { encryptSecret } from "./secrets.js";

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

const PLATFORM_PUBLIC_BASE_URL =
  process.env.PLATFORM_PUBLIC_BASE_URL || "http://localhost:5173";

function extractTenantHost(req) {
  const explicit = req.headers["x-tenant-host"];
  const forwarded = req.headers["x-forwarded-host"];
  const raw = explicit || forwarded || req.headers.host || "";
  const first = Array.isArray(raw) ? raw[0] : String(raw).split(",")[0];
  return first.trim().split(":")[0].toLowerCase();
}

async function logAudit({ ispId = null, actorUserId = null, action, entityType, entityId = null, details = {} }) {
  await query(
    "INSERT INTO audit_logs (id, isp_id, actor_user_id, action, entity_type, entity_id, details) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6::jsonb)",
    [ispId, actorUserId, action, entityType, entityId, JSON.stringify(details)]
  );
}

app.use(async (req, _res, next) => {
  const host = extractTenantHost(req);
  req.tenantHost = host;
  if (!host || host === "localhost" || host === "127.0.0.1") return next();
  try {
    const tenant = await query(
      "SELECT i.id AS \"ispId\", i.name, i.subdomain, b.display_name AS \"displayName\", b.logo_url AS \"logoUrl\", b.primary_color AS \"primaryColor\", b.secondary_color AS \"secondaryColor\" FROM isps i LEFT JOIN isp_branding b ON b.isp_id = i.id WHERE LOWER(i.subdomain) = LOWER($1) OR LOWER(COALESCE(b.custom_domain, '')) = LOWER($1) LIMIT 1",
      [host]
    );
    if (tenant.rows[0]) {
      req.tenantIspId = tenant.rows[0].ispId;
      req.tenantContext = tenant.rows[0];
    }
  } catch (_err) {
    // Ignore tenant resolution failures and continue.
  }
  return next();
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.get("/api/tenant/context", async (req, res) => {
  if (!req.tenantContext) {
    return res.json({ matched: false, host: req.tenantHost || null });
  }
  return res.json({
    matched: true,
    host: req.tenantHost,
    ispId: req.tenantContext.ispId,
    displayName: req.tenantContext.displayName || req.tenantContext.name,
    logoUrl: req.tenantContext.logoUrl || null,
    primaryColor: req.tenantContext.primaryColor || "#1565d8",
    secondaryColor: req.tenantContext.secondaryColor || "#162030"
  });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: "email and password are required" });
  const result = await query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
  const user = result.rows[0];
  if (!user) return res.status(401).json({ message: "Invalid credentials" });
  if (!user.is_active) return res.status(403).json({ message: "User account is deactivated" });
  if (req.tenantIspId && user.role !== "super_admin" && user.isp_id !== req.tenantIspId) {
    return res.status(403).json({ message: "This account does not belong to this ISP workspace." });
  }
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ message: "Invalid credentials" });
  const token = signToken(user);
  return res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      ispId: user.isp_id,
      isActive: user.is_active,
      mustChangePassword: user.must_change_password
    }
  });
});

app.get("/api/auth/me", authenticate, async (req, res) => {
  const result = await query(
    "SELECT id, email, full_name, role, isp_id, is_active, must_change_password FROM users WHERE id = $1",
    [req.user.sub]
  );
  const user = result.rows[0];
  if (!user) return res.status(404).json({ message: "User not found" });
  return res.json({
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
    ispId: user.isp_id,
    isActive: user.is_active,
    mustChangePassword: user.must_change_password
  });
});

app.post("/api/auth/change-password", authenticate, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ message: "currentPassword and valid newPassword are required" });
  }
  const result = await query("SELECT id, password_hash FROM users WHERE id = $1", [req.user.sub]);
  const user = result.rows[0];
  if (!user) return res.status(404).json({ message: "User not found" });
  const ok = await bcrypt.compare(currentPassword, user.password_hash);
  if (!ok) return res.status(401).json({ message: "Current password is incorrect" });
  const hash = await bcrypt.hash(newPassword, 10);
  await query("UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2", [
    hash,
    req.user.sub
  ]);
  return res.json({ message: "Password changed successfully" });
});

app.post("/api/auth/accept-invite", async (req, res) => {
  const { token, password, fullName } = req.body;
  if (!token || !password || password.length < 6) {
    return res.status(400).json({ message: "token and valid password are required" });
  }
  const inviteResult = await query(
    "SELECT it.id, it.user_id, it.expires_at, it.used_at, u.email FROM invite_tokens it JOIN users u ON u.id = it.user_id WHERE it.token = $1",
    [token]
  );
  const invite = inviteResult.rows[0];
  if (!invite) return res.status(404).json({ message: "Invalid invite token" });
  if (invite.used_at) return res.status(400).json({ message: "Invite token already used" });
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ message: "Invite token expired" });
  }
  const hash = await bcrypt.hash(password, 10);
  await query(
    "UPDATE users SET password_hash = $1, must_change_password = FALSE, is_active = TRUE, full_name = COALESCE($2, full_name) WHERE id = $3",
    [hash, fullName || null, invite.user_id]
  );
  await query("UPDATE invite_tokens SET used_at = NOW() WHERE id = $1", [invite.id]);
  return res.json({ message: "Invite accepted. You can now login.", email: invite.email });
});

app.get("/api/isps", authenticate, async (_req, res) => {
  const result = await query(
    "SELECT id, name, location, subdomain, contact_phone AS \"contactPhone\", created_at AS \"createdAt\" FROM isps ORDER BY created_at DESC"
  );
  res.json(result.rows);
});

app.post("/api/isps", authenticate, requireRoles("super_admin"), async (req, res) => {
  const { name, location, contactPhone, subdomain } = req.body;
  if (!name || !location || !contactPhone) return res.status(400).json({ message: "name, location and contactPhone are required" });
  const safeSubdomain =
    subdomain ||
    `${name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "tenant"}-${crypto.randomBytes(2).toString("hex")}.tenant.local`;
  const inserted = await query(
    "INSERT INTO isps (id, name, location, contact_phone, subdomain) VALUES (gen_random_uuid(), $1, $2, $3, $4) RETURNING id, name, location, subdomain, contact_phone AS \"contactPhone\", created_at AS \"createdAt\"",
    [name, location, contactPhone, safeSubdomain]
  );
  await query(
    "INSERT INTO isp_branding (id, isp_id, display_name, contact_phone) VALUES (gen_random_uuid(), $1, $2, $3)",
    [inserted.rows[0].id, name, contactPhone]
  );
  await logAudit({
    action: "isp.created",
    entityType: "isp",
    entityId: inserted.rows[0].id,
    actorUserId: req.user.sub,
    details: { name, location }
  });
  res.status(201).json(inserted.rows[0]);
});

app.get("/api/branding", authenticate, async (req, res) => {
  const ispId = resolveIspId(req, res);
  if (!ispId) return;
  const result = await query(
    "SELECT b.id, b.isp_id AS \"ispId\", b.display_name AS \"displayName\", b.logo_url AS \"logoUrl\", b.primary_color AS \"primaryColor\", b.secondary_color AS \"secondaryColor\", b.invoice_footer AS \"invoiceFooter\", b.address, b.contact_email AS \"contactEmail\", b.contact_phone AS \"contactPhone\", b.custom_domain AS \"customDomain\", i.subdomain FROM isp_branding b JOIN isps i ON i.id = b.isp_id WHERE b.isp_id = $1",
    [ispId]
  );
  res.json(result.rows[0] || null);
});

app.post(
  "/api/branding",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const {
      displayName,
      logoUrl,
      primaryColor,
      secondaryColor,
      invoiceFooter,
      address,
      contactEmail,
      contactPhone,
      customDomain,
      subdomain
    } = req.body;
    const updated = await query(
      "UPDATE isp_branding SET display_name = COALESCE($1, display_name), logo_url = $2, primary_color = COALESCE($3, primary_color), secondary_color = COALESCE($4, secondary_color), invoice_footer = $5, address = $6, contact_email = $7, contact_phone = $8, custom_domain = $9, updated_at = NOW() WHERE isp_id = $10 RETURNING id",
      [
        displayName || null,
        logoUrl || null,
        primaryColor || null,
        secondaryColor || null,
        invoiceFooter || null,
        address || null,
        contactEmail || null,
        contactPhone || null,
        customDomain || null,
        ispId
      ]
    );
    if (subdomain) {
      await query("UPDATE isps SET subdomain = $1 WHERE id = $2", [subdomain, ispId]);
    }
    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: "branding.updated",
      entityType: "branding",
      entityId: updated.rows[0]?.id || null
    });
    const finalResult = await query(
      "SELECT b.id, b.isp_id AS \"ispId\", b.display_name AS \"displayName\", b.logo_url AS \"logoUrl\", b.primary_color AS \"primaryColor\", b.secondary_color AS \"secondaryColor\", b.invoice_footer AS \"invoiceFooter\", b.address, b.contact_email AS \"contactEmail\", b.contact_phone AS \"contactPhone\", b.custom_domain AS \"customDomain\", i.subdomain FROM isp_branding b JOIN isps i ON i.id = b.isp_id WHERE b.isp_id = $1",
      [ispId]
    );
    return res.json(finalResult.rows[0]);
  }
);

app.get("/api/platform/packages", authenticate, async (_req, res) => {
  const result = await query(
    "SELECT id, code, name, monthly_price_usd AS \"monthlyPriceUsd\", feature_flags AS \"featureFlags\" FROM platform_packages ORDER BY monthly_price_usd ASC"
  );
  res.json(result.rows);
});

app.get("/api/platform/subscriptions", authenticate, async (req, res) => {
  const ispId = resolveIspId(req, res);
  if (!ispId) return;
  const result = await query(
    "SELECT s.id, s.isp_id AS \"ispId\", s.package_id AS \"packageId\", p.name AS \"packageName\", p.code AS \"packageCode\", s.status, s.starts_at AS \"startsAt\", s.ends_at AS \"endsAt\" FROM isp_platform_subscriptions s JOIN platform_packages p ON p.id = s.package_id WHERE s.isp_id = $1 ORDER BY s.created_at DESC",
    [ispId]
  );
  res.json(result.rows);
});

app.post("/api/platform/subscriptions", authenticate, requireRoles("super_admin"), async (req, res) => {
  const { ispId, packageId, durationDays = 30 } = req.body;
  if (!ispId || !packageId) return res.status(400).json({ message: "ispId and packageId are required" });
  const startsAt = new Date();
  const endsAt = new Date(startsAt);
  endsAt.setDate(endsAt.getDate() + Number(durationDays));
  const inserted = await query(
    "INSERT INTO isp_platform_subscriptions (id, isp_id, package_id, status, starts_at, ends_at) VALUES (gen_random_uuid(), $1, $2, 'active', $3, $4) RETURNING id, isp_id AS \"ispId\", package_id AS \"packageId\", status, starts_at AS \"startsAt\", ends_at AS \"endsAt\"",
    [ispId, packageId, startsAt.toISOString(), endsAt.toISOString()]
  );
  await logAudit({
    ispId,
    actorUserId: req.user.sub,
    action: "platform.subscription.assigned",
    entityType: "platform_subscription",
    entityId: inserted.rows[0].id,
    details: { packageId, durationDays: Number(durationDays) }
  });
  res.status(201).json(inserted.rows[0]);
});

app.get("/api/payment-methods", authenticate, async (req, res) => {
  const ispId = resolveIspId(req, res);
  if (!ispId) return;
  const result = await query(
    "SELECT id, isp_id AS \"ispId\", method_type AS \"methodType\", provider_name AS \"providerName\", config_json AS \"config\", is_active AS \"isActive\", created_at AS \"createdAt\" FROM isp_payment_methods WHERE isp_id = $1 ORDER BY created_at DESC",
    [ispId]
  );
  res.json(result.rows);
});

app.post(
  "/api/payment-methods",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const { methodType, providerName, config = {}, isActive = true } = req.body;
    if (!methodType || !providerName) {
      return res.status(400).json({ message: "methodType and providerName are required" });
    }
    const inserted = await query(
      "INSERT INTO isp_payment_methods (id, isp_id, method_type, provider_name, config_json, is_active, created_by) VALUES (gen_random_uuid(), $1, $2, $3, $4::jsonb, $5, $6) RETURNING id, isp_id AS \"ispId\", method_type AS \"methodType\", provider_name AS \"providerName\", config_json AS \"config\", is_active AS \"isActive\", created_at AS \"createdAt\"",
      [ispId, methodType, providerName, JSON.stringify(config), Boolean(isActive), req.user.sub]
    );
    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: "payment_method.created",
      entityType: "payment_method",
      entityId: inserted.rows[0].id,
      details: { methodType, providerName }
    });
    return res.status(201).json(inserted.rows[0]);
  }
);

app.post(
  "/api/payment-methods/:methodId/toggle",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const { methodId } = req.params;
    const { isActive } = req.body;
    const updated = await query(
      "UPDATE isp_payment_methods SET is_active = $1 WHERE id = $2 AND isp_id = $3 RETURNING id, is_active AS \"isActive\"",
      [Boolean(isActive), methodId, ispId]
    );
    if (!updated.rows[0]) return res.status(404).json({ message: "Payment method not found" });
    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: "payment_method.toggled",
      entityType: "payment_method",
      entityId: methodId,
      details: { isActive: Boolean(isActive) }
    });
    return res.json(updated.rows[0]);
  }
);

app.get("/api/role-profiles", authenticate, async (req, res) => {
  const ispId = resolveIspId(req, res);
  if (!ispId) return;
  const result = await query(
    "SELECT id, isp_id AS \"ispId\", role_key AS \"roleKey\", accreditation_level AS \"accreditationLevel\", permissions, is_active AS \"isActive\" FROM isp_role_profiles WHERE isp_id = $1 ORDER BY role_key ASC",
    [ispId]
  );
  res.json(result.rows);
});

app.post(
  "/api/role-profiles",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const { roleKey, accreditationLevel = "basic", permissions = [] } = req.body;
    if (!roleKey) return res.status(400).json({ message: "roleKey is required" });
    const upsert = await query(
      "INSERT INTO isp_role_profiles (id, isp_id, role_key, accreditation_level, permissions, is_active) VALUES (gen_random_uuid(), $1, $2, $3, $4::jsonb, TRUE) ON CONFLICT (isp_id, role_key) DO UPDATE SET accreditation_level = EXCLUDED.accreditation_level, permissions = EXCLUDED.permissions RETURNING id, isp_id AS \"ispId\", role_key AS \"roleKey\", accreditation_level AS \"accreditationLevel\", permissions, is_active AS \"isActive\"",
      [ispId, roleKey, accreditationLevel, JSON.stringify(permissions)]
    );
    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: "role_profile.upserted",
      entityType: "role_profile",
      entityId: upsert.rows[0].id,
      details: { roleKey, accreditationLevel }
    });
    res.json(upsert.rows[0]);
  }
);

app.get("/api/audit-logs", authenticate, async (req, res) => {
  const ispId = resolveIspId(req, res);
  if (!ispId) return;
  const result = await query(
    "SELECT id, action, entity_type AS \"entityType\", entity_id AS \"entityId\", details, created_at AS \"createdAt\" FROM audit_logs WHERE isp_id = $1 ORDER BY created_at DESC LIMIT 100",
    [ispId]
  );
  res.json(result.rows);
});

app.get(
  "/api/notifications/outbox",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const result = await query(
      "SELECT id, isp_id AS \"ispId\", channel, recipient, template_key AS \"templateKey\", payload, status, attempts, last_error AS \"lastError\", sent_at AS \"sentAt\", next_attempt_at AS \"nextAttemptAt\", created_at AS \"createdAt\" FROM notification_outbox WHERE isp_id = $1 ORDER BY created_at DESC LIMIT 200",
      [ispId]
    );
    res.json(result.rows);
  }
);

app.get(
  "/api/notification-providers",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const result = await query(
      "SELECT id, isp_id AS \"ispId\", channel, provider_key AS \"providerKey\", config_json AS config, is_active AS \"isActive\", updated_at AS \"updatedAt\" FROM isp_notification_providers WHERE isp_id = $1 ORDER BY channel ASC",
      [ispId]
    );
    res.json(result.rows);
  }
);

app.post(
  "/api/notification-providers",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const { channel, providerKey = "webhook", config = {}, isActive = true } = req.body;
    if (!["sms", "email", "whatsapp"].includes(channel)) {
      return res.status(400).json({ message: "channel must be sms, email, or whatsapp" });
    }
    if (!["webhook", "twilio"].includes(providerKey)) {
      return res.status(400).json({ message: "providerKey must be webhook or twilio" });
    }
    if (providerKey === "twilio" && !["sms", "whatsapp"].includes(channel)) {
      return res.status(400).json({ message: "Twilio supports sms and whatsapp channels only" });
    }
    const result = await query(
      "INSERT INTO isp_notification_providers (id, isp_id, channel, provider_key, config_json, is_active, created_by, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, $4::jsonb, $5, $6, NOW()) ON CONFLICT (isp_id, channel) DO UPDATE SET provider_key = EXCLUDED.provider_key, config_json = EXCLUDED.config_json, is_active = EXCLUDED.is_active, updated_at = NOW() RETURNING id, isp_id AS \"ispId\", channel, provider_key AS \"providerKey\", config_json AS config, is_active AS \"isActive\", updated_at AS \"updatedAt\"",
      [ispId, channel, providerKey, JSON.stringify(config || {}), Boolean(isActive), req.user.sub]
    );
    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: "notification_provider.upserted",
      entityType: "notification_provider",
      entityId: result.rows[0].id,
      details: { channel, providerKey, isActive: Boolean(isActive) }
    });
    res.json(result.rows[0]);
  }
);

app.post(
  "/api/notifications/process",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const stats = await processNotificationOutboxBatch({
      ispId,
      limit: 50,
      maxAttempts: Number(process.env.NOTIFICATION_MAX_ATTEMPTS || 5)
    });
    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: "notification.worker.trigger",
      entityType: "notification_outbox",
      entityId: null,
      details: stats
    });
    res.json(stats);
  }
);

app.post(
  "/api/notifications/test",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const { channel, recipient, message } = req.body;
    if (!["sms", "email", "whatsapp"].includes(channel)) {
      return res.status(400).json({ message: "channel must be sms, email, or whatsapp" });
    }
    if (!recipient || String(recipient).trim().length < 3) {
      return res.status(400).json({ message: "recipient is required" });
    }
    const result = await sendNotificationDirect({
      ispId,
      channel,
      recipient: String(recipient).trim(),
      templateKey: "notification_test",
      payload: {
        message: String(message || "This is a test notification from your ISP platform."),
        source: "manual-test"
      }
    });
    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: "notification.test.sent",
      entityType: "notification_provider",
      entityId: null,
      details: {
        channel,
        recipient: String(recipient).trim(),
        ok: Boolean(result.ok),
        error: result.error || null
      }
    });
    if (!result.ok) {
      return res.status(400).json({ message: result.error || "Test notification failed" });
    }
    return res.json({
      ok: true,
      channel,
      recipient: String(recipient).trim(),
      providerMessageId: result.providerMessageId || null
    });
  }
);

app.get(
  "/api/network/nodes",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin", "noc_operator"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
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
    res.json(updated.rows[0]);
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
    const exists = await query("SELECT id FROM isp_network_nodes WHERE id = $1 AND isp_id = $2", [nodeId, ispId]);
    if (!exists.rows[0]) return res.status(404).json({ message: "Node not found" });
    await query("UPDATE isp_network_nodes SET is_default = (id = $1) WHERE isp_id = $2", [nodeId, ispId]);
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
  "/api/users",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
  const ispId = resolveIspId(req, res);
  if (!ispId) return;
  const result = await query(
    "SELECT id, isp_id AS \"ispId\", full_name AS \"fullName\", email, role, accreditation_level AS \"accreditationLevel\", is_active AS \"isActive\", must_change_password AS \"mustChangePassword\", created_at AS \"createdAt\" FROM users WHERE isp_id = $1 ORDER BY created_at DESC",
    [ispId]
  );
    return res.json(result.rows);
  }
);

app.post(
  "/api/users",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
  const targetIspId = resolveIspId(req, res);
  if (!targetIspId) return;

  const { fullName, email, password, role, accreditationLevel = "basic" } = req.body;
  if (!fullName || !email || !password || !role) {
    return res.status(400).json({ message: "fullName, email, password and role are required" });
  }

  const allowedRolesByRequester = {
    super_admin: ["company_manager", "isp_admin", "billing_agent", "noc_operator", "field_agent"],
    company_manager: ["isp_admin", "billing_agent", "noc_operator", "field_agent"],
    isp_admin: ["billing_agent", "noc_operator", "field_agent"]
  };

  const allowed = allowedRolesByRequester[req.user.role] || [];
  if (!allowed.includes(role)) {
    return res.status(403).json({ message: "You cannot create this role" });
  }

  if (req.user.role !== "super_admin" && role === "super_admin") {
    return res.status(403).json({ message: "Forbidden role assignment" });
  }

  const hash = await bcrypt.hash(password, 10);
  const limits = await query(
    "SELECT p.feature_flags AS \"featureFlags\" FROM isp_platform_subscriptions s JOIN platform_packages p ON p.id = s.package_id WHERE s.isp_id = $1 AND s.status = 'active' AND s.ends_at >= NOW() ORDER BY s.ends_at DESC LIMIT 1",
    [targetIspId]
  );
  const maxUsers = limits.rows[0]?.featureFlags?.maxUsers;
  if (Number.isFinite(maxUsers)) {
    const activeUsers = await query(
      "SELECT COUNT(*)::int AS count FROM users WHERE isp_id = $1 AND is_active = TRUE",
      [targetIspId]
    );
    if (activeUsers.rows[0].count >= maxUsers) {
      return res.status(403).json({
        message: `User limit reached for current package (${maxUsers} active users).`
      });
    }
  }
  const inserted = await query(
    "INSERT INTO users (id, isp_id, full_name, email, password_hash, role, accreditation_level, is_active, must_change_password) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, TRUE, TRUE) RETURNING id, isp_id AS \"ispId\", full_name AS \"fullName\", email, role, accreditation_level AS \"accreditationLevel\", is_active AS \"isActive\", must_change_password AS \"mustChangePassword\", created_at AS \"createdAt\"",
    [targetIspId, fullName, email.toLowerCase(), hash, role, accreditationLevel]
  );
  await logAudit({
    ispId: targetIspId,
    actorUserId: req.user.sub,
    action: "user.created",
    entityType: "user",
    entityId: inserted.rows[0].id,
    details: { role, accreditationLevel, email: email.toLowerCase() }
  });
  return res.status(201).json(inserted.rows[0]);
  }
);

app.post(
  "/api/users/:userId/reset-password",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
  const targetIspId = resolveIspId(req, res);
  if (!targetIspId) return;
  const { userId } = req.params;
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ message: "newPassword must be at least 6 characters" });
  }

  const existing = await query("SELECT id, role, isp_id FROM users WHERE id = $1", [userId]);
  const targetUser = existing.rows[0];
  if (!targetUser) return res.status(404).json({ message: "User not found" });
  if (targetUser.isp_id !== targetIspId) {
    return res.status(403).json({ message: "Cross-tenant operation forbidden" });
  }
  if (req.user.role !== "super_admin" && targetUser.role === "super_admin") {
    return res.status(403).json({ message: "Forbidden target user" });
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await query("UPDATE users SET password_hash = $1, must_change_password = TRUE WHERE id = $2", [
    hash,
    userId
  ]);
  await logAudit({
    ispId: targetIspId,
    actorUserId: req.user.sub,
    action: "user.password_reset",
    entityType: "user",
    entityId: userId
  });
  return res.json({ message: "Password reset successful" });
  }
);

app.post(
  "/api/users/:userId/deactivate",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
  const targetIspId = resolveIspId(req, res);
  if (!targetIspId) return;
  const { userId } = req.params;
  const existing = await query("SELECT id, role, isp_id FROM users WHERE id = $1", [userId]);
  const targetUser = existing.rows[0];
  if (!targetUser) return res.status(404).json({ message: "User not found" });
  if (targetUser.isp_id !== targetIspId) {
    return res.status(403).json({ message: "Cross-tenant operation forbidden" });
  }
  if (targetUser.role === "super_admin") {
    return res.status(403).json({ message: "Cannot deactivate super admin" });
  }
  await query("UPDATE users SET is_active = FALSE WHERE id = $1", [userId]);
  await logAudit({
    ispId: targetIspId,
    actorUserId: req.user.sub,
    action: "user.deactivated",
    entityType: "user",
    entityId: userId
  });
  return res.json({ message: "User deactivated" });
  }
);

app.post(
  "/api/users/:userId/reactivate",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const targetIspId = resolveIspId(req, res);
    if (!targetIspId) return;
    const { userId } = req.params;
    const existing = await query("SELECT id, role, isp_id FROM users WHERE id = $1", [userId]);
    const targetUser = existing.rows[0];
    if (!targetUser) return res.status(404).json({ message: "User not found" });
    if (targetUser.isp_id !== targetIspId) {
      return res.status(403).json({ message: "Cross-tenant operation forbidden" });
    }
    await query("UPDATE users SET is_active = TRUE WHERE id = $1", [userId]);
    await logAudit({
      ispId: targetIspId,
      actorUserId: req.user.sub,
      action: "user.reactivated",
      entityType: "user",
      entityId: userId
    });
    return res.json({ message: "User reactivated" });
  }
);

app.post(
  "/api/users/:userId/invite",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
  const targetIspId = resolveIspId(req, res);
  if (!targetIspId) return;
  const { userId } = req.params;
  const existing = await query("SELECT id, isp_id FROM users WHERE id = $1", [userId]);
  const targetUser = existing.rows[0];
  if (!targetUser) return res.status(404).json({ message: "User not found" });
  if (targetUser.isp_id !== targetIspId) {
    return res.status(403).json({ message: "Cross-tenant operation forbidden" });
  }
  const token = crypto.randomBytes(24).toString("hex");
  await query(
    "INSERT INTO invite_tokens (id, user_id, token, expires_at, created_by) VALUES (gen_random_uuid(), $1, $2, NOW() + INTERVAL '7 days', $3)",
    [userId, token, req.user.sub]
  );
  await logAudit({
    ispId: targetIspId,
    actorUserId: req.user.sub,
    action: "user.invite_created",
    entityType: "user",
    entityId: userId
  });
  return res.json({
    token,
    inviteLink: `${PLATFORM_PUBLIC_BASE_URL}/invite?token=${token}`,
    expiresIn: "7 days"
  });
  }
);

app.get("/api/customers", authenticate, async (req, res) => {
  const ispId = resolveIspId(req, res);
  if (!ispId) return;
  const result = await query(
    "SELECT id, isp_id AS \"ispId\", full_name AS \"fullName\", phone, status, created_at AS \"createdAt\" FROM customers WHERE isp_id = $1 ORDER BY created_at DESC",
    [ispId]
  );
  res.json(result.rows);
});

app.post("/api/customers", authenticate, async (req, res) => {
  const ispId = resolveIspId(req, res);
  if (!ispId) return;
  const { fullName, phone } = req.body;
  if (!fullName || !phone) return res.status(400).json({ message: "fullName and phone are required" });
  const inserted = await query(
    "INSERT INTO customers (id, isp_id, full_name, phone, status) VALUES (gen_random_uuid(), $1, $2, $3, 'active') RETURNING id, isp_id AS \"ispId\", full_name AS \"fullName\", phone, status, created_at AS \"createdAt\"",
    [ispId, fullName, phone]
  );
  res.status(201).json(inserted.rows[0]);
});

app.get("/api/plans", authenticate, async (req, res) => {
  const ispId = resolveIspId(req, res);
  if (!ispId) return;
  const result = await query(
    "SELECT id, isp_id AS \"ispId\", name, price_usd AS \"priceUsd\", duration_days AS \"durationDays\", rate_limit AS \"rateLimit\", created_at AS \"createdAt\" FROM plans WHERE isp_id = $1 ORDER BY created_at DESC",
    [ispId]
  );
  res.json(result.rows);
});

app.post("/api/plans", authenticate, async (req, res) => {
  const ispId = resolveIspId(req, res);
  if (!ispId) return;
  const { name, priceUsd, durationDays, rateLimit } = req.body;
  if (!name || !priceUsd || !durationDays || !rateLimit) return res.status(400).json({ message: "All plan fields are required" });
  const inserted = await query(
    "INSERT INTO plans (id, isp_id, name, price_usd, duration_days, rate_limit) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5) RETURNING id, isp_id AS \"ispId\", name, price_usd AS \"priceUsd\", duration_days AS \"durationDays\", rate_limit AS \"rateLimit\", created_at AS \"createdAt\"",
    [ispId, name, Number(priceUsd), Number(durationDays), rateLimit]
  );
  res.status(201).json(inserted.rows[0]);
});

app.get("/api/subscriptions", authenticate, async (req, res) => {
  const ispId = resolveIspId(req, res);
  if (!ispId) return;
  const result = await query(
    "SELECT id, isp_id AS \"ispId\", customer_id AS \"customerId\", plan_id AS \"planId\", status, access_type AS \"accessType\", start_date AS \"startDate\", end_date AS \"endDate\" FROM subscriptions WHERE isp_id = $1 ORDER BY start_date DESC",
    [ispId]
  );
  res.json(result.rows);
});

app.post("/api/subscriptions", authenticate, async (req, res) => {
  const ispId = resolveIspId(req, res);
  if (!ispId) return;
  const { customerId, planId, accessType = "pppoe" } = req.body;
  const customer = await query("SELECT id FROM customers WHERE id = $1 AND isp_id = $2", [customerId, ispId]);
  const plan = await query("SELECT id, price_usd, duration_days FROM plans WHERE id = $1 AND isp_id = $2", [planId, ispId]);
  if (!customer.rows[0] || !plan.rows[0]) return res.status(404).json({ message: "Customer or plan not found" });

  const now = new Date();
  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() + Number(plan.rows[0].duration_days));

  const subInsert = await query(
    "INSERT INTO subscriptions (id, isp_id, customer_id, plan_id, status, access_type, start_date, end_date) VALUES (gen_random_uuid(), $1, $2, $3, 'active', $4, $5, $6) RETURNING id, isp_id AS \"ispId\", customer_id AS \"customerId\", plan_id AS \"planId\", status, access_type AS \"accessType\", start_date AS \"startDate\", end_date AS \"endDate\"",
    [ispId, customerId, planId, accessType, now.toISOString(), endDate.toISOString()]
  );
  const subscription = subInsert.rows[0];
  const invoiceInsert = await query(
    "INSERT INTO invoices (id, isp_id, subscription_id, customer_id, amount_usd, status, due_date) VALUES (gen_random_uuid(), $1, $2, $3, $4, 'unpaid', $5) RETURNING id, isp_id AS \"ispId\", subscription_id AS \"subscriptionId\", customer_id AS \"customerId\", amount_usd AS \"amountUsd\", status, due_date AS \"dueDate\", created_at AS \"createdAt\"",
    [ispId, subscription.id, customerId, Number(plan.rows[0].price_usd), endDate.toISOString()]
  );
  await provisionSubscriptionAccess({
    ispId,
    subscriptionId: subscription.id,
    action: "activate"
  });
  res.status(201).json({ subscription, invoice: invoiceInsert.rows[0] });
});

app.post(
  "/api/subscriptions/:subscriptionId/suspend",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin", "noc_operator"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const { subscriptionId } = req.params;
    const updated = await query(
      "UPDATE subscriptions SET status = 'suspended' WHERE id = $1 AND isp_id = $2 RETURNING id, isp_id AS \"ispId\", customer_id AS \"customerId\", plan_id AS \"planId\", status, access_type AS \"accessType\", start_date AS \"startDate\", end_date AS \"endDate\"",
      [subscriptionId, ispId]
    );
    if (!updated.rows[0]) return res.status(404).json({ message: "Subscription not found" });
    const provisioning = await provisionSubscriptionAccess({
      ispId,
      subscriptionId,
      action: "suspend"
    });
    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: "subscription.suspended",
      entityType: "subscription",
      entityId: subscriptionId,
      details: { provisioning }
    });
    return res.json({ subscription: updated.rows[0], provisioning });
  }
);

app.post(
  "/api/subscriptions/:subscriptionId/reactivate",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin", "noc_operator"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const { subscriptionId } = req.params;
    const updated = await query(
      "UPDATE subscriptions SET status = 'active' WHERE id = $1 AND isp_id = $2 RETURNING id, isp_id AS \"ispId\", customer_id AS \"customerId\", plan_id AS \"planId\", status, access_type AS \"accessType\", start_date AS \"startDate\", end_date AS \"endDate\"",
      [subscriptionId, ispId]
    );
    if (!updated.rows[0]) return res.status(404).json({ message: "Subscription not found" });
    const provisioning = await provisionSubscriptionAccess({
      ispId,
      subscriptionId,
      action: "activate"
    });
    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: "subscription.reactivated",
      entityType: "subscription",
      entityId: subscriptionId,
      details: { provisioning }
    });
    return res.json({ subscription: updated.rows[0], provisioning });
  }
);

app.get("/api/invoices", authenticate, async (req, res) => {
  const ispId = resolveIspId(req, res);
  if (!ispId) return;
  const result = await query(
    "SELECT id, isp_id AS \"ispId\", subscription_id AS \"subscriptionId\", customer_id AS \"customerId\", amount_usd AS \"amountUsd\", status, due_date AS \"dueDate\", created_at AS \"createdAt\" FROM invoices WHERE isp_id = $1 ORDER BY created_at DESC",
    [ispId]
  );
  res.json(result.rows);
});

app.post("/api/payments/webhook", authenticate, async (req, res) => {
  const ispId = resolveIspId(req, res);
  if (!ispId) return;
  const { invoiceId, providerRef, amountUsd, status, method } = req.body;
  const methodType = method || "cash";
  const paymentMethod = await query(
    "SELECT id FROM isp_payment_methods WHERE isp_id = $1 AND method_type = $2 AND is_active = TRUE LIMIT 1",
    [ispId, methodType]
  );
  if (!paymentMethod.rows[0]) {
    return res.status(400).json({
      message: `No active ${methodType} payment method configured by this ISP.`
    });
  }
  const invResult = await query("SELECT * FROM invoices WHERE id = $1 AND isp_id = $2", [invoiceId, ispId]);
  const invoice = invResult.rows[0];
  if (!invoice) return res.status(404).json({ message: "Invoice not found" });

  const paymentInsert = await query(
    "INSERT INTO payments (id, isp_id, invoice_id, provider_ref, amount_usd, status, method) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6) RETURNING id, isp_id AS \"ispId\", invoice_id AS \"invoiceId\", provider_ref AS \"providerRef\", amount_usd AS \"amountUsd\", status, method, paid_at AS \"paidAt\"",
    [ispId, invoiceId, providerRef || "n/a", Number(amountUsd || invoice.amount_usd), status || "confirmed", method || "mobile_money"]
  );
  if ((status || "confirmed") === "confirmed") {
    await query("UPDATE invoices SET status = 'paid' WHERE id = $1", [invoiceId]);
    await query("UPDATE subscriptions SET status = 'active' WHERE id = $1", [invoice.subscription_id]);
    await provisionSubscriptionAccess({
      ispId,
      subscriptionId: invoice.subscription_id,
      action: "activate"
    });
  }
  res.json({ message: "Webhook processed", payment: paymentInsert.rows[0] });
});

app.post("/api/payments/tid-submissions", async (req, res) => {
  const { invoiceId, tid, submittedByPhone, amountUsd } = req.body;
  if (!invoiceId || !tid) {
    return res.status(400).json({ message: "invoiceId and tid are required" });
  }
  const inv = await query(
    "SELECT id, isp_id, customer_id, subscription_id, amount_usd FROM invoices WHERE id = $1",
    [invoiceId]
  );
  const invoice = inv.rows[0];
  if (!invoice) return res.status(404).json({ message: "Invoice not found" });
  const duplicateTid = await query(
    "SELECT id, status FROM payment_tid_submissions WHERE isp_id = $1 AND tid = $2 ORDER BY created_at DESC LIMIT 1",
    [invoice.isp_id, tid]
  );
  if (duplicateTid.rows[0] && duplicateTid.rows[0].status !== "rejected") {
    return res.status(409).json({
      message: "This TID is already submitted and awaiting/approved verification."
    });
  }
  const inserted = await query(
    "INSERT INTO payment_tid_submissions (id, isp_id, invoice_id, customer_id, subscription_id, tid, submitted_by_phone, amount_usd, status) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'pending') RETURNING id, isp_id AS \"ispId\", invoice_id AS \"invoiceId\", tid, submitted_by_phone AS \"submittedByPhone\", amount_usd AS \"amountUsd\", status, created_at AS \"createdAt\"",
    [
      invoice.isp_id,
      invoice.id,
      invoice.customer_id,
      invoice.subscription_id,
      tid,
      submittedByPhone || null,
      Number(amountUsd || invoice.amount_usd)
    ]
  );
  await logAudit({
    ispId: invoice.isp_id,
    action: "payment.tid_submitted",
    entityType: "payment_tid_submission",
    entityId: inserted.rows[0].id,
    details: { invoiceId: invoice.id, tid }
  });
  return res.status(201).json(inserted.rows[0]);
});

app.get(
  "/api/payments/tid-submissions",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin", "billing_agent"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const result = await query(
      "SELECT id, invoice_id AS \"invoiceId\", customer_id AS \"customerId\", subscription_id AS \"subscriptionId\", tid, submitted_by_phone AS \"submittedByPhone\", amount_usd AS \"amountUsd\", status, review_note AS \"reviewNote\", created_at AS \"createdAt\" FROM payment_tid_submissions WHERE isp_id = $1 ORDER BY created_at DESC",
      [ispId]
    );
    return res.json(result.rows);
  }
);

app.get(
  "/api/payments/tid-conflicts",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin", "billing_agent"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const result = await query(
      "SELECT tid, COUNT(*)::int AS duplicates, ARRAY_AGG(id ORDER BY created_at DESC) AS submission_ids, ARRAY_AGG(status ORDER BY created_at DESC) AS statuses, MIN(created_at) AS first_seen, MAX(created_at) AS last_seen FROM payment_tid_submissions WHERE isp_id = $1 GROUP BY tid HAVING COUNT(*) > 1 ORDER BY last_seen DESC",
      [ispId]
    );
    return res.json(result.rows);
  }
);

app.post(
  "/api/payments/tid-submissions/:submissionId/review",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin", "billing_agent"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const { submissionId } = req.params;
    const { decision, note } = req.body;
    if (!["approved", "rejected"].includes(decision)) {
      return res.status(400).json({ message: "decision must be approved or rejected" });
    }
    const submissionResult = await query(
      "SELECT * FROM payment_tid_submissions WHERE id = $1 AND isp_id = $2",
      [submissionId, ispId]
    );
    const submission = submissionResult.rows[0];
    if (!submission) return res.status(404).json({ message: "Submission not found" });
    await query(
      "UPDATE payment_tid_submissions SET status = $1, reviewed_by = $2, reviewed_at = NOW(), review_note = $3 WHERE id = $4",
      [decision, req.user.sub, note || null, submissionId]
    );
    if (decision === "approved") {
      await query("UPDATE invoices SET status = 'paid' WHERE id = $1", [submission.invoice_id]);
      await query("UPDATE subscriptions SET status = 'active' WHERE id = $1", [submission.subscription_id]);
      await query(
        "INSERT INTO payments (id, isp_id, invoice_id, provider_ref, amount_usd, status, method) VALUES (gen_random_uuid(), $1, $2, $3, $4, 'confirmed', 'manual_mobile_money')",
        [ispId, submission.invoice_id, submission.tid, Number(submission.amount_usd || 0)]
      );
      await provisionSubscriptionAccess({
        ispId,
        subscriptionId: submission.subscription_id,
        action: "activate"
      });
    }
    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: `payment.tid_${decision}`,
      entityType: "payment_tid_submission",
      entityId: submissionId,
      details: { note: note || null }
    });
    return res.json({ message: `Submission ${decision}` });
  }
);

app.post(
  "/api/payments/tid-submissions/reminders",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin", "billing_agent"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const pending = await query(
      "SELECT id, tid, submitted_by_phone, created_at FROM payment_tid_submissions WHERE isp_id = $1 AND status = 'pending' ORDER BY created_at ASC",
      [ispId]
    );
    let queued = 0;
    for (const row of pending.rows) {
      const dedupe = await query(
        "SELECT id FROM notification_outbox WHERE isp_id = $1 AND template_key = 'tid_pending_reminder' AND payload->>'submissionId' = $2 AND created_at::date = CURRENT_DATE LIMIT 1",
        [ispId, row.id]
      );
      if (dedupe.rows[0]) continue;
      await query(
        "INSERT INTO notification_outbox (id, isp_id, channel, recipient, template_key, payload, status) VALUES (gen_random_uuid(), $1, 'internal', $2, 'tid_pending_reminder', $3::jsonb, 'queued')",
        [
          ispId,
          row.submitted_by_phone || null,
          JSON.stringify({
            submissionId: row.id,
            tid: row.tid,
            pendingSince: row.created_at
          })
        ]
      );
      queued += 1;
    }
    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: "payment.tid_reminders_queued",
      entityType: "notification_batch",
      details: { queued }
    });
    return res.json({ queued, totalPending: pending.rows.length });
  }
);

app.post(
  "/api/vouchers/generate",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin", "billing_agent", "field_agent"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const { planId, quantity = 1 } = req.body;
    if (!planId) return res.status(400).json({ message: "planId is required" });
    const planResult = await query(
      "SELECT id, rate_limit, duration_days FROM plans WHERE id = $1 AND isp_id = $2",
      [planId, ispId]
    );
    const plan = planResult.rows[0];
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    const qty = Math.min(Math.max(Number(quantity), 1), 100);
    const created = [];
    for (let i = 0; i < qty; i += 1) {
      const code = `VCH-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
      const row = await query(
        "INSERT INTO access_vouchers (id, isp_id, plan_id, code, rate_limit, duration_days, status, created_by, expires_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'unused', $6, NOW() + INTERVAL '90 days') RETURNING id, code, rate_limit AS \"rateLimit\", duration_days AS \"durationDays\", status, expires_at AS \"expiresAt\"",
        [ispId, plan.id, code, plan.rate_limit, plan.duration_days, req.user.sub]
      );
      created.push(row.rows[0]);
    }
    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: "voucher.generated",
      entityType: "voucher_batch",
      details: { planId, quantity: qty, rateLimit: plan.rate_limit }
    });
    return res.status(201).json(created);
  }
);

app.get("/api/vouchers", authenticate, async (req, res) => {
  const ispId = resolveIspId(req, res);
  if (!ispId) return;
  const result = await query(
    "SELECT id, code, rate_limit AS \"rateLimit\", duration_days AS \"durationDays\", status, expires_at AS \"expiresAt\", used_at AS \"usedAt\" FROM access_vouchers WHERE isp_id = $1 ORDER BY created_at DESC LIMIT 200",
    [ispId]
  );
  return res.json(result.rows);
});

app.get("/api/vouchers/export", authenticate, async (req, res) => {
  const ispId = resolveIspId(req, res);
  if (!ispId) return;
  const result = await query(
    "SELECT code, rate_limit AS \"rateLimit\", duration_days AS \"durationDays\", status, expires_at AS \"expiresAt\", used_at AS \"usedAt\" FROM access_vouchers WHERE isp_id = $1 ORDER BY created_at DESC",
    [ispId]
  );
  const header = "code,rate_limit,duration_days,status,expires_at,used_at";
  const rows = result.rows.map((r) =>
    [r.code, r.rateLimit, r.durationDays, r.status, r.expiresAt || "", r.usedAt || ""]
      .map((v) => `"${String(v).replaceAll('"', '""')}"`)
      .join(",")
  );
  return res.json({
    filename: `vouchers-${new Date().toISOString().slice(0, 10)}.csv`,
    content: [header, ...rows].join("\n")
  });
});

app.post("/api/vouchers/redeem", async (req, res) => {
  const { code, customerId } = req.body;
  if (!code || !customerId) return res.status(400).json({ message: "code and customerId are required" });
  const voucherResult = await query(
    "SELECT * FROM access_vouchers WHERE code = $1 AND status = 'unused'",
    [code]
  );
  const voucher = voucherResult.rows[0];
  if (!voucher) return res.status(404).json({ message: "Voucher not found or already used" });
  if (voucher.expires_at && new Date(voucher.expires_at).getTime() < Date.now()) {
    await query("UPDATE access_vouchers SET status = 'expired' WHERE id = $1", [voucher.id]);
    return res.status(400).json({ message: "Voucher expired" });
  }
  const customer = await query("SELECT id FROM customers WHERE id = $1 AND isp_id = $2", [
    customerId,
    voucher.isp_id
  ]);
  if (!customer.rows[0]) return res.status(404).json({ message: "Customer not found for this ISP" });
  await query(
    "UPDATE access_vouchers SET status = 'used', assigned_customer_id = $1, used_at = NOW() WHERE id = $2",
    [customerId, voucher.id]
  );
  await query(
    "UPDATE subscriptions SET status = 'active', end_date = NOW() + ($1 || ' days')::interval WHERE customer_id = $2 AND isp_id = $3",
    [String(voucher.duration_days), customerId, voucher.isp_id]
  );
  const subResult = await query(
    "SELECT id FROM subscriptions WHERE customer_id = $1 AND isp_id = $2 ORDER BY end_date DESC LIMIT 1",
    [customerId, voucher.isp_id]
  );
  if (subResult.rows[0]?.id) {
    await provisionSubscriptionAccess({
      ispId: voucher.isp_id,
      subscriptionId: subResult.rows[0].id,
      action: "activate"
    });
  }
  await logAudit({
    ispId: voucher.isp_id,
    action: "voucher.redeemed",
    entityType: "voucher",
    entityId: voucher.id,
    details: { customerId, code }
  });
  return res.json({ message: "Voucher redeemed", rateLimit: voucher.rate_limit, durationDays: voucher.duration_days });
});

app.get("/api/network/stats", authenticate, async (req, res) => {
  const ispId = resolveIspId(req, res);
  if (!ispId) return;
  const from = req.query.from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = req.query.to || new Date().toISOString().slice(0, 10);

  const usage = await query(
    "SELECT COALESCE(SUM(hotspot_users),0)::int AS \"hotspotUsers\", COALESCE(SUM(pppoe_users),0)::int AS \"pppoeUsers\", COALESCE(MAX(connected_devices),0)::int AS \"connectedDevices\", COALESCE(SUM(bandwidth_down_gb + bandwidth_up_gb),0)::float AS \"bandwidthTotalGb\" FROM network_usage_daily WHERE isp_id = $1 AND metric_date BETWEEN $2::date AND $3::date",
    [ispId, from, to]
  );
  const revenue = await query(
    "SELECT COALESCE(SUM(amount_usd),0)::float AS \"revenueCollectedUsd\" FROM payments WHERE isp_id = $1 AND status = 'confirmed' AND paid_at::date BETWEEN $2::date AND $3::date",
    [ispId, from, to]
  );
  return res.json({
    period: { from, to },
    hotspotUsers: usage.rows[0].hotspotUsers,
    pppoeUsers: usage.rows[0].pppoeUsers,
    connectedDevices: usage.rows[0].connectedDevices,
    bandwidthTotalGb: usage.rows[0].bandwidthTotalGb,
    revenueCollectedUsd: revenue.rows[0].revenueCollectedUsd
  });
});

app.get("/api/dashboard", authenticate, async (req, res) => {
  const ispId = resolveIspId(req, res);
  if (!ispId) return;
  const [customers, active, unpaid, revenue] = await Promise.all([
    query("SELECT COUNT(*)::int AS value FROM customers WHERE isp_id = $1", [ispId]),
    query("SELECT COUNT(*)::int AS value FROM subscriptions WHERE isp_id = $1 AND status = 'active'", [ispId]),
    query("SELECT COUNT(*)::int AS value FROM invoices WHERE isp_id = $1 AND status = 'unpaid'", [ispId]),
    query("SELECT COALESCE(SUM(amount_usd), 0)::float AS value FROM invoices WHERE isp_id = $1 AND status = 'paid'", [ispId])
  ]);
  res.json({
    totalCustomers: customers.rows[0].value,
    activeSubscriptions: active.rows[0].value,
    unpaidInvoices: unpaid.rows[0].value,
    revenueUsd: revenue.rows[0].value,
    networkSessions: 0
  });
});

app.get("/api/super/dashboard", authenticate, requireRoles("super_admin"), async (_req, res) => {
  const [isps, customers, active, revenue] = await Promise.all([
    query("SELECT COUNT(*)::int AS value FROM isps"),
    query("SELECT COUNT(*)::int AS value FROM customers"),
    query("SELECT COUNT(*)::int AS value FROM subscriptions WHERE status = 'active'"),
    query("SELECT COALESCE(SUM(amount_usd), 0)::float AS value FROM invoices WHERE status = 'paid'")
  ]);
  res.json({
    totalIsps: isps.rows[0].value,
    totalCustomers: customers.rows[0].value,
    totalActiveSubscriptions: active.rows[0].value,
    totalRevenueUsd: revenue.rows[0].value
  });
});

export default app;
