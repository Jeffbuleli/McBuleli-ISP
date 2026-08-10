import crypto from "crypto";
import { query } from "../db.js";
import { sendPlatformMail } from "../platformMail.js";
import {
  buildAuthenticationOptions,
  buildRegistrationOptions,
  resolveExpectedOrigin,
  verifyAuthentication,
  verifyRegistration
} from "../webauthn.js";
import { generateTotpSecret, totpAuthUrl, verifyTotpCode } from "../totp.js";

function hashOtp(code) {
  return crypto.createHash("sha256").update(String(code)).digest("hex");
}

async function securityStatus(userId) {
  const user = await query(
    `SELECT email, mfa_totp_enabled AS "mfaTotpEnabled", mfa_email_enabled AS "mfaEmailEnabled",
            email_verified_at AS "emailVerifiedAt"
     FROM users WHERE id = $1`,
    [userId]
  );
  const creds = await query(
    `SELECT id, credential_id AS "credentialId", device_name AS "deviceName", created_at AS "createdAt"
     FROM user_webauthn_credentials WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  const u = user.rows[0] || {};
  return {
    email: u.email || null,
    emailVerified: Boolean(u.emailVerifiedAt),
    mfaEmailEnabled: Boolean(u.mfaEmailEnabled),
    mfaTotpEnabled: Boolean(u.mfaTotpEnabled),
    passkeys: creds.rows,
    passkeyCount: creds.rows.length
  };
}

/**
 * @param {import('express').Express} app
 * @param {{ authenticate: Function, logAudit: Function }} deps
 */
export function registerSecurityRoutes(app, { authenticate, logAudit }) {
  app.get("/api/auth/security/status", authenticate, async (req, res) => {
    return res.json(await securityStatus(req.user.sub));
  });

  app.post("/api/auth/security/email/send-code", authenticate, async (req, res) => {
    const u = await query("SELECT id, email FROM users WHERE id = $1", [req.user.sub]);
    const user = u.rows[0];
    if (!user?.email) return res.status(400).json({ message: "No email on account." });
    const code = String(crypto.randomInt(100000, 999999));
    const expires = new Date(Date.now() + 10 * 60_000);
    await query(
      `UPDATE user_mfa_challenges SET status = 'expired'
       WHERE user_id = $1 AND purpose = 'email_verify' AND status = 'pending'`,
      [req.user.sub]
    );
    await query(
      `INSERT INTO user_mfa_challenges (id, user_id, purpose, code_hash, metadata, expires_at, status)
       VALUES (gen_random_uuid(), $1, 'email_verify', $2, '{}'::jsonb, $3, 'pending')`,
      [req.user.sub, hashOtp(code), expires.toISOString()]
    );
    const mail = await sendPlatformMail({
      to: user.email,
      subject: "McBuleli - code de verification",
      text: `McBuleli\n\nVotre code: ${code}\nValable 10 minutes.\n\nYour code: ${code}\nValid 10 minutes.`
    });
    if (!mail.ok && !mail.skipped) {
      return res.status(502).json({ message: "Could not send email. Check mail configuration." });
    }
    await logAudit({
      actorUserId: req.user.sub,
      action: "security.email_code_sent",
      entityType: "user",
      entityId: req.user.sub,
      details: { skipped: Boolean(mail.skipped), provider: mail.provider || null }
    });
    return res.json({
      ok: true,
      email: user.email,
      skipped: Boolean(mail.skipped),
      ...(mail.skipped && process.env.NODE_ENV !== "production" ? { devCode: code } : {})
    });
  });

  app.post("/api/auth/security/email/verify", authenticate, async (req, res) => {
    const code = String(req.body?.code || "").replace(/\s+/g, "");
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ message: "Enter the 6-digit code." });
    const row = await query(
      `SELECT id FROM user_mfa_challenges
       WHERE user_id = $1 AND purpose = 'email_verify' AND status = 'pending'
         AND expires_at > NOW() AND code_hash = $2
       ORDER BY expires_at DESC LIMIT 1`,
      [req.user.sub, hashOtp(code)]
    );
    if (!row.rows[0]) return res.status(400).json({ message: "Invalid or expired code." });
    await query(`UPDATE user_mfa_challenges SET status = 'verified', verified_at = NOW() WHERE id = $1`, [
      row.rows[0].id
    ]);
    await query(
      `UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW()), mfa_email_enabled = TRUE WHERE id = $1`,
      [req.user.sub]
    );
    await logAudit({
      actorUserId: req.user.sub,
      action: "security.email_verified",
      entityType: "user",
      entityId: req.user.sub,
      details: {}
    });
    return res.json(await securityStatus(req.user.sub));
  });

  app.post("/api/auth/security/email/disable", authenticate, async (req, res) => {
    await query(`UPDATE users SET mfa_email_enabled = FALSE WHERE id = $1`, [req.user.sub]);
    return res.json(await securityStatus(req.user.sub));
  });

  app.post("/api/auth/mfa/webauthn/register/options", authenticate, async (req, res) => {
    const u = await query("SELECT id, email, full_name FROM users WHERE id = $1", [req.user.sub]);
    const user = u.rows[0];
    if (!user) return res.status(404).json({ message: "User not found" });
    const existing = await query(
      `SELECT credential_id AS "credentialId" FROM user_webauthn_credentials WHERE user_id = $1`,
      [req.user.sub]
    );
    const options = await buildRegistrationOptions({
      userId: req.user.sub,
      userName: user.email,
      userDisplayName: user.full_name || user.email,
      existingCredentialIds: existing.rows.map((r) => r.credentialId)
    });
    return res.json(options);
  });

  app.post("/api/auth/mfa/webauthn/register/verify", authenticate, async (req, res) => {
    const response = req.body?.credential || req.body;
    const deviceName = String(req.body?.deviceName || "Passkey").slice(0, 80);
    const result = await verifyRegistration({
      userId: req.user.sub,
      response,
      expectedOrigin: resolveExpectedOrigin(req)
    });
    if (!result.ok) return res.status(400).json({ message: result.message });
    await query(
      `INSERT INTO user_webauthn_credentials (user_id, credential_id, public_key, counter, transports, device_name)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       ON CONFLICT (credential_id) DO NOTHING`,
      [
        req.user.sub,
        result.credentialId,
        result.publicKey,
        result.counter || 0,
        JSON.stringify(result.transports || []),
        deviceName
      ]
    );
    await logAudit({
      actorUserId: req.user.sub,
      action: "security.passkey_added",
      entityType: "user",
      entityId: req.user.sub,
      details: { deviceName }
    });
    return res.json(await securityStatus(req.user.sub));
  });

  app.delete("/api/auth/mfa/webauthn/:credentialRowId", authenticate, async (req, res) => {
    const id = String(req.params.credentialRowId || "");
    const del = await query(
      `DELETE FROM user_webauthn_credentials WHERE id = $1::uuid AND user_id = $2 RETURNING id`,
      [id, req.user.sub]
    );
    if (!del.rows[0]) return res.status(404).json({ message: "Passkey not found" });
    return res.json(await securityStatus(req.user.sub));
  });

  app.post("/api/auth/mfa/webauthn/authenticate/options", authenticate, async (req, res) => {
    const creds = await query(
      `SELECT credential_id AS "credentialId", transports
       FROM user_webauthn_credentials WHERE user_id = $1`,
      [req.user.sub]
    );
    if (!creds.rows.length) return res.status(400).json({ message: "No passkey registered." });
    const options = await buildAuthenticationOptions({
      userId: req.user.sub,
      allowCredentials: creds.rows.map((c) => ({
        credentialId: c.credentialId,
        transports: Array.isArray(c.transports) ? c.transports : undefined
      }))
    });
    return res.json(options);
  });

  app.post("/api/auth/mfa/webauthn/authenticate/verify", authenticate, async (req, res) => {
    const response = req.body?.credential || req.body;
    const credId = response?.id;
    if (!credId) return res.status(400).json({ message: "Missing credential." });
    const row = await query(
      `SELECT credential_id AS "credentialId", public_key AS "publicKey", counter, transports
       FROM user_webauthn_credentials WHERE user_id = $1 AND credential_id = $2`,
      [req.user.sub, credId]
    );
    const credential = row.rows[0];
    if (!credential) return res.status(404).json({ message: "Unknown passkey." });
    const result = await verifyAuthentication({
      userId: req.user.sub,
      response,
      credential: {
        ...credential,
        transports: Array.isArray(credential.transports) ? credential.transports : undefined
      },
      expectedOrigin: resolveExpectedOrigin(req)
    });
    if (!result.ok) return res.status(400).json({ message: result.message });
    await query(`UPDATE user_webauthn_credentials SET counter = $1 WHERE credential_id = $2`, [
      result.newCounter,
      credId
    ]);
    return res.json({ ok: true });
  });

  // Allow TOTP setup for any authenticated dashboard user (Security page)
  app.post("/api/auth/mfa/totp/setup", authenticate, async (req, res) => {
    const result = await query("SELECT id, email FROM users WHERE id = $1", [req.user.sub]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ message: "User not found" });
    const secret = generateTotpSecret();
    await query("UPDATE users SET mfa_totp_secret = $1, mfa_totp_enabled = FALSE WHERE id = $2", [
      secret,
      req.user.sub
    ]);
    return res.json({
      secret,
      otpauthUrl: totpAuthUrl({
        secret,
        accountName: user.email,
        issuer: "McBuleli"
      }),
      enabled: false
    });
  });

  app.post("/api/auth/mfa/totp/enable", authenticate, async (req, res) => {
    const { code } = req.body || {};
    const result = await query("SELECT id, mfa_totp_secret FROM users WHERE id = $1", [req.user.sub]);
    const user = result.rows[0];
    if (!user?.mfa_totp_secret) return res.status(400).json({ message: "Start TOTP setup first." });
    if (!verifyTotpCode({ secret: user.mfa_totp_secret, code })) {
      return res.status(400).json({ message: "Invalid authenticator code." });
    }
    await query("UPDATE users SET mfa_totp_enabled = TRUE WHERE id = $1", [req.user.sub]);
    return res.json({ ...(await securityStatus(req.user.sub)), enabled: true });
  });

  app.post("/api/auth/mfa/totp/disable", authenticate, async (req, res) => {
    const code = String(req.body?.code || "");
    const result = await query("SELECT mfa_totp_secret, mfa_totp_enabled FROM users WHERE id = $1", [
      req.user.sub
    ]);
    const user = result.rows[0];
    if (!user?.mfa_totp_enabled) return res.json(await securityStatus(req.user.sub));
    if (!verifyTotpCode({ secret: user.mfa_totp_secret, code })) {
      return res.status(400).json({ message: "Invalid authenticator code." });
    }
    await query(
      `UPDATE users SET mfa_totp_enabled = FALSE, mfa_totp_secret = NULL WHERE id = $1`,
      [req.user.sub]
    );
    return res.json(await securityStatus(req.user.sub));
  });
}
