import { query } from "./db.js";

function normalizeConfig(configJson) {
  if (!configJson || typeof configJson !== "object") return {};
  return configJson;
}

async function resolveProvider(ispId, channel) {
  if (channel === "internal") {
    return { providerKey: "internal", config: {} };
  }
  const result = await query(
    "SELECT provider_key AS \"providerKey\", config_json AS \"config\" FROM isp_notification_providers WHERE isp_id = $1 AND channel = $2 AND is_active = TRUE LIMIT 1",
    [ispId, channel]
  );
  return result.rows[0] || null;
}

async function sendWithWebhook(row, config) {
  const webhookUrl = String(config.webhookUrl || "").trim();
  if (!webhookUrl) {
    return { ok: false, error: "webhookUrl is required in provider config" };
  }
  const method = String(config.method || "POST").toUpperCase();
  const headers = {
    "Content-Type": "application/json"
  };
  if (config.authHeaderName && config.authToken) {
    headers[String(config.authHeaderName)] = String(config.authToken);
  }
  const response = await fetch(webhookUrl, {
    method,
    headers,
    body: JSON.stringify({
      notificationId: row.id,
      ispId: row.isp_id,
      channel: row.channel,
      recipient: row.recipient,
      templateKey: row.template_key,
      payload: row.payload
    })
  });
  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    return { ok: false, error: `Webhook ${response.status}: ${bodyText || "delivery failed"}` };
  }
  return {
    ok: true,
    providerMessageId: response.headers.get("x-request-id") || `webhook-${row.id}`
  };
}

function normalizePhoneTarget(channel, value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (channel === "whatsapp") {
    return raw.startsWith("whatsapp:") ? raw : `whatsapp:${raw}`;
  }
  return raw.replace(/^whatsapp:/, "");
}

async function sendWithTwilio(row, config) {
  const accountSid = String(config.accountSid || "").trim();
  const authToken = String(config.authToken || "").trim();
  const fromValue = String(config.from || config.fromNumber || "").trim();
  const messagingServiceSid = String(config.messagingServiceSid || "").trim();
  if (!accountSid || !authToken) {
    return { ok: false, error: "Twilio config requires accountSid and authToken" };
  }
  if (!fromValue && !messagingServiceSid) {
    return { ok: false, error: "Twilio config requires from/fromNumber or messagingServiceSid" };
  }

  const to = normalizePhoneTarget(row.channel, row.recipient);
  const from = fromValue ? normalizePhoneTarget(row.channel, fromValue) : "";
  const bodyText = String(
    row.payload?.message ||
      row.payload?.text ||
      `${row.template_key}: ${JSON.stringify(row.payload || {})}`
  );

  const form = new URLSearchParams();
  form.set("To", to);
  form.set("Body", bodyText.slice(0, 1500));
  if (messagingServiceSid) form.set("MessagingServiceSid", messagingServiceSid);
  else form.set("From", from);

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: form.toString()
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.message || payload?.detail || "Twilio delivery failed";
    return { ok: false, error: `Twilio ${response.status}: ${detail}` };
  }
  return {
    ok: true,
    providerMessageId: payload?.sid || `twilio-${row.id}`
  };
}

async function sendWithSmtp(row, config) {
  const host = String(config.host || "").trim();
  const from = String(config.from || "").trim();
  if (!host || !from) {
    return { ok: false, error: "SMTP config requires host and from" };
  }
  let nodemailer;
  try {
    nodemailer = await import("nodemailer");
  } catch (_e) {
    return { ok: false, error: "nodemailer package is required for SMTP (npm install nodemailer)" };
  }
  const transport = nodemailer.createTransport({
    host,
    port: Number(config.port) || 587,
    secure: Boolean(config.secure),
    auth:
      config.user && config.pass
        ? { user: String(config.user).trim(), pass: String(config.pass).trim() }
        : undefined
  });
  const subject =
    row.payload?.subject ||
    `Notice: ${String(row.template_key || "notification").replace(/_/g, " ")}`;
  const text =
    row.payload?.message ||
    row.payload?.text ||
    `${row.template_key}: ${JSON.stringify(row.payload || {})}`;
  const info = await transport.sendMail({
    from,
    to: String(row.recipient).trim(),
    subject: String(subject).slice(0, 500),
    text: String(text).slice(0, 50000)
  });
  return { ok: true, providerMessageId: info.messageId || `smtp-${row.id}` };
}

async function deliverRow(row) {
  if (row.channel === "internal") {
    return { ok: true, providerMessageId: `internal-${row.id}` };
  }

  if (row.channel === "email") {
    if (!row.recipient || !String(row.recipient).trim()) {
      return { ok: false, error: "Missing email recipient" };
    }
    const provider = await resolveProvider(row.isp_id, "email");
    if (!provider) {
      return { ok: false, error: "No active provider configured for channel email" };
    }
    const config = normalizeConfig(provider.config);
    if (provider.providerKey === "smtp") {
      return sendWithSmtp(row, config);
    }
    if (provider.providerKey === "webhook") {
      return sendWithWebhook(row, config);
    }
    return { ok: false, error: `Unsupported email provider ${provider.providerKey}` };
  }

  if (!row.recipient) {
    return { ok: false, error: `Missing recipient for channel ${row.channel}` };
  }

  const provider = await resolveProvider(row.isp_id, row.channel);
  if (!provider) {
    return { ok: false, error: `No active provider configured for channel ${row.channel}` };
  }

  const config = normalizeConfig(provider.config);
  if (provider.providerKey === "webhook") {
    return sendWithWebhook(row, config);
  }
  if (provider.providerKey === "twilio") {
    if (!["sms", "whatsapp"].includes(row.channel)) {
      return { ok: false, error: `Twilio is only supported for sms/whatsapp (channel=${row.channel})` };
    }
    return sendWithTwilio(row, config);
  }
  return { ok: false, error: `Unsupported provider ${provider.providerKey} for channel ${row.channel}` };
}

export async function sendNotificationDirect({
  ispId,
  channel,
  recipient,
  templateKey = "manual_test",
  payload = {}
}) {
  const pseudoRow = {
    id: "manual-test",
    isp_id: ispId,
    channel,
    recipient,
    template_key: templateKey,
    payload
  };
  return deliverRow(pseudoRow);
}

export async function processNotificationOutboxBatch({ ispId = null, limit = 50, maxAttempts = 5 }) {
  const rows = ispId
    ? await query(
        "SELECT id, isp_id, channel, recipient, template_key, payload, attempts FROM notification_outbox WHERE isp_id = $1 AND status = 'queued' AND next_attempt_at <= NOW() ORDER BY created_at ASC LIMIT $2",
        [ispId, limit]
      )
    : await query(
        "SELECT id, isp_id, channel, recipient, template_key, payload, attempts FROM notification_outbox WHERE status = 'queued' AND next_attempt_at <= NOW() ORDER BY created_at ASC LIMIT $1",
        [limit]
      );

  let sent = 0;
  let retried = 0;
  let failed = 0;

  for (const row of rows.rows) {
    const attemptNumber = Number(row.attempts || 0) + 1;
    const result = await deliverRow(row);
    if (result.ok) {
      await query(
        "UPDATE notification_outbox SET status = 'sent', attempts = $1, sent_at = NOW(), provider_message_id = $2, last_error = NULL WHERE id = $3",
        [attemptNumber, result.providerMessageId || null, row.id]
      );
      sent += 1;
      continue;
    }
    if (attemptNumber >= maxAttempts) {
      await query(
        "UPDATE notification_outbox SET status = 'failed', attempts = $1, last_error = $2 WHERE id = $3",
        [attemptNumber, result.error || "Notification delivery failed", row.id]
      );
      failed += 1;
      continue;
    }
    const retryMinutes = Math.min(2 ** attemptNumber, 60);
    await query(
      "UPDATE notification_outbox SET attempts = $1, last_error = $2, next_attempt_at = NOW() + ($3 || ' minutes')::interval WHERE id = $4",
      [attemptNumber, result.error || "Notification delivery failed", String(retryMinutes), row.id]
    );
    retried += 1;
  }

  return { sent, retried, failed, processed: rows.rows.length };
}
