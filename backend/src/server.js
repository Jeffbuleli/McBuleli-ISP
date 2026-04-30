import "dotenv/config";
import app from "./app.js";
import { initDb, query } from "./db.js";
import { ensureBrandingUploadDir } from "./uploadsConfig.js";
import { processNotificationOutboxBatch } from "./notifications.js";
import { processExpiredSubscriptions, processOverdueInvoices, processRenewalInvoices } from "./billingJobs.js";
import { assertNetworkNodeSecretKeyForProduction } from "./secrets.js";
import { isS3BrandingConfigured } from "./brandingLogoStorage.js";

const port = Number(process.env.PORT || 4000);
const reminderIntervalMinutes = Number(process.env.TID_REMINDER_INTERVAL_MIN || 30);
const notificationWorkerIntervalSec = Number(process.env.NOTIFICATION_WORKER_INTERVAL_SEC || 60);
const notificationMaxAttempts = Number(process.env.NOTIFICATION_MAX_ATTEMPTS || 5);
const billingOverdueIntervalMin = Number(process.env.BILLING_OVERDUE_INTERVAL_MIN || 60);
const billingRenewalIntervalMin = Number(process.env.BILLING_RENEWAL_INTERVAL_MIN || 360);

async function queueAutomaticTidReminders() {
  const isps = await query("SELECT id FROM isps");
  for (const isp of isps.rows) {
    const pending = await query(
      "SELECT id, tid, submitted_by_phone, created_at FROM payment_tid_submissions WHERE isp_id = $1 AND status = 'pending' ORDER BY created_at ASC",
      [isp.id]
    );
    for (const row of pending.rows) {
      const dedupe = await query(
        "SELECT id FROM notification_outbox WHERE isp_id = $1 AND template_key = 'tid_pending_reminder' AND payload->>'submissionId' = $2 AND created_at::date = CURRENT_DATE LIMIT 1",
        [isp.id, row.id]
      );
      if (dedupe.rows[0]) continue;
      await query(
        "INSERT INTO notification_outbox (id, isp_id, channel, recipient, template_key, payload, status) VALUES (gen_random_uuid(), $1, 'internal', $2, 'tid_pending_reminder', $3::jsonb, 'queued')",
        [
          isp.id,
          row.submitted_by_phone || null,
          JSON.stringify({
            submissionId: row.id,
            tid: row.tid,
            pendingSince: row.created_at,
            source: "scheduler"
          })
        ]
      );
    }
  }
}

async function processNotificationOutbox() {
  await processNotificationOutboxBatch({
    limit: 50,
    maxAttempts: notificationMaxAttempts
  });
}

async function runBillingOverdueJob() {
  await processOverdueInvoices();
  await processExpiredSubscriptions();
}

async function runBillingRenewalJob() {
  await processRenewalInvoices();
}

async function start() {
  assertNetworkNodeSecretKeyForProduction();
  if (String(process.env.BRANDING_LOGO_STORAGE || "").toLowerCase() === "s3" && !isS3BrandingConfigured()) {
    throw new Error(
      "BRANDING_LOGO_STORAGE=s3 requires S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY (see .env.example)."
    );
  }
  await initDb();
  ensureBrandingUploadDir();
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Backend running at http://localhost:${port}`);
  });
  setInterval(() => {
    queueAutomaticTidReminders().catch(() => {});
  }, Math.max(reminderIntervalMinutes, 1) * 60 * 1000);
  setInterval(() => {
    processNotificationOutbox().catch(() => {});
  }, Math.max(notificationWorkerIntervalSec, 5) * 1000);
  setInterval(() => {
    runBillingOverdueJob().catch(() => {});
  }, Math.max(billingOverdueIntervalMin, 5) * 60 * 1000);
  setInterval(() => {
    runBillingRenewalJob().catch(() => {});
  }, Math.max(billingRenewalIntervalMin, 15) * 60 * 1000);
}

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start backend:", error?.message || String(error));
  process.exit(1);
});
