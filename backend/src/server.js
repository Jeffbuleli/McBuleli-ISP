import dotenv from "dotenv";
import app from "./app.js";
import { initDb, query } from "./db.js";
import { processNotificationOutboxBatch } from "./notifications.js";

dotenv.config();

const port = Number(process.env.PORT || 4000);
const reminderIntervalMinutes = Number(process.env.TID_REMINDER_INTERVAL_MIN || 30);
const notificationWorkerIntervalSec = Number(process.env.NOTIFICATION_WORKER_INTERVAL_SEC || 60);
const notificationMaxAttempts = Number(process.env.NOTIFICATION_MAX_ATTEMPTS || 5);

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

async function start() {
  await initDb();
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
}

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start backend:", error?.message || String(error));
  process.exit(1);
});
