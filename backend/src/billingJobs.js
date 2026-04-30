import { query } from "./db.js";
import { provisionSubscriptionAccess } from "./networkProvisioning.js";
import { billingJobLog } from "./billingLogger.js";

function renewalWindowDays() {
  const d = Number(process.env.BILLING_RENEWAL_WINDOW_DAYS || 7);
  return Number.isFinite(d) && d >= 1 ? Math.min(Math.floor(d), 90) : 7;
}

function graceIntervalHours() {
  const h = Number(process.env.BILLING_OVERDUE_GRACE_HOURS || 0);
  return Number.isFinite(h) && h >= 0 ? Math.floor(h) : 0;
}

function expiryGraceIntervalHours() {
  const h = Number(process.env.BILLING_EXPIRY_GRACE_HOURS ?? process.env.BILLING_OVERDUE_GRACE_HOURS ?? 0);
  return Number.isFinite(h) && h >= 0 ? Math.floor(h) : 0;
}

/**
 * For each subscription that has at least one unpaid invoice past due (plus grace),
 * suspend the subscription (if still active) and push network/RADIUS suspend.
 * Mark all qualifying unpaid invoices as overdue.
 */
export async function processOverdueInvoices() {
  const graceH = graceIntervalHours();
  const overdueInvoices = await query(
    `SELECT id, isp_id, subscription_id
     FROM invoices
     WHERE status = 'unpaid'
       AND due_date + make_interval(hours => $1::int) < NOW()`,
    [graceH]
  );

  const bySubscription = new Map();
  for (const row of overdueInvoices.rows) {
    const cur = bySubscription.get(row.subscription_id) || {
      ispId: row.isp_id,
      invoiceIds: []
    };
    cur.invoiceIds.push(row.id);
    bySubscription.set(row.subscription_id, cur);
  }

  let subscriptionsSuspended = 0;
  let invoicesMarkedOverdue = 0;

  for (const [subscriptionId, { ispId }] of bySubscription) {
    const subResult = await query("SELECT status FROM subscriptions WHERE id = $1 AND isp_id = $2", [
      subscriptionId,
      ispId
    ]);
    const sub = subResult.rows[0];
    if (sub?.status === "active") {
      await query("UPDATE subscriptions SET status = 'suspended' WHERE id = $1 AND isp_id = $2", [
        subscriptionId,
        ispId
      ]);
      await provisionSubscriptionAccess({
        ispId,
        subscriptionId,
        action: "suspend"
      });
      subscriptionsSuspended += 1;
    }

    const upd = await query(
      `UPDATE invoices
       SET status = 'overdue'
       WHERE subscription_id = $1
         AND status = 'unpaid'
         AND due_date + make_interval(hours => $2::int) < NOW()
       RETURNING id`,
      [subscriptionId, graceH]
    );
    invoicesMarkedOverdue += upd.rows.length;
  }

  const summary = {
    graceHours: graceH,
    overdueInvoiceCandidates: overdueInvoices.rows.length,
    subscriptionsSuspended,
    invoicesMarkedOverdue
  };
  if (subscriptionsSuspended || invoicesMarkedOverdue) {
    billingJobLog("overdue_invoices", summary);
  }
  return summary;
}

/**
 * After a subscription invoice is paid, extend service end date by the plan duration
 * (from the later of current end date or now).
 */
export async function extendSubscriptionAfterPayment(ispId, subscriptionId, exec = query) {
  await exec(
    `UPDATE subscriptions s
     SET status = 'active',
         end_date = GREATEST(s.end_date, CURRENT_TIMESTAMP) + make_interval(days => p.duration_days)
     FROM plans p
     WHERE s.id = $1 AND s.isp_id = $2 AND p.id = s.plan_id`,
    [subscriptionId, ispId]
  );
}

/**
 * Create a renewal invoice for active subscriptions approaching end_date (or already past
 * end_date but still active), when there is no open unpaid/overdue invoice yet.
 * Queues SMS (if phone), email (if customers.email and email/SMTP provider configured), or internal notice.
 */
export async function processRenewalInvoices() {
  const windowD = renewalWindowDays();
  const candidates = await query(
    `SELECT s.id AS subscription_id, s.isp_id, s.customer_id, s.plan_id, s.end_date,
            p.price_usd, p.duration_days, p.name AS plan_name, c.phone AS customer_phone, c.email AS customer_email,
            c.full_name
     FROM subscriptions s
     JOIN plans p ON p.id = s.plan_id AND p.isp_id = s.isp_id
     JOIN customers c ON c.id = s.customer_id AND c.isp_id = s.isp_id
     WHERE s.status = 'active'
       AND s.end_date <= CURRENT_TIMESTAMP + make_interval(days => $1::int)
       AND NOT EXISTS (
         SELECT 1 FROM invoices i
         WHERE i.subscription_id = s.id AND i.status IN ('unpaid', 'overdue')
       )`,
    [windowD]
  );

  let invoicesCreated = 0;
  let notificationsQueued = 0;

  for (const row of candidates.rows) {
    const inv = await query(
      `INSERT INTO invoices (id, isp_id, subscription_id, customer_id, amount_usd, status, due_date)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'unpaid', $5)
       RETURNING id`,
      [
        row.isp_id,
        row.subscription_id,
        row.customer_id,
        Number(row.price_usd),
        row.end_date
      ]
    );
    const invoiceId = inv.rows[0].id;
    invoicesCreated += 1;

    const message = `Renewal: plan "${row.plan_name}" — please pay invoice before ${new Date(row.end_date).toLocaleDateString()}.`;
    const payloadJson = JSON.stringify({
      subscriptionId: row.subscription_id,
      invoiceId,
      customerId: row.customer_id,
      customerName: row.full_name,
      endDate: row.end_date,
      message,
      subject: `Renewal invoice — ${row.plan_name}`
    });

    const phone = row.customer_phone ? String(row.customer_phone).trim() : "";
    const dedupeSms = await query(
      `SELECT id FROM notification_outbox
       WHERE isp_id = $1 AND template_key = 'subscription_renewal_invoice'
         AND payload->>'subscriptionId' = $2 AND channel = 'sms' AND created_at::date = CURRENT_DATE LIMIT 1`,
      [row.isp_id, row.subscription_id]
    );
    if (!dedupeSms.rows[0]) {
      await query(
        `INSERT INTO notification_outbox (id, isp_id, channel, recipient, template_key, payload, status)
         VALUES (gen_random_uuid(), $1, $2, $3, 'subscription_renewal_invoice', $4::jsonb, 'queued')`,
        [row.isp_id, phone ? "sms" : "internal", phone || null, payloadJson]
      );
      notificationsQueued += 1;
    }

    const emailAddr = row.customer_email ? String(row.customer_email).trim() : "";
    if (emailAddr) {
      const dedupeEmail = await query(
        `SELECT id FROM notification_outbox
         WHERE isp_id = $1 AND template_key = 'subscription_renewal_invoice'
           AND payload->>'subscriptionId' = $2 AND channel = 'email' AND created_at::date = CURRENT_DATE LIMIT 1`,
        [row.isp_id, row.subscription_id]
      );
      if (!dedupeEmail.rows[0]) {
        await query(
          `INSERT INTO notification_outbox (id, isp_id, channel, recipient, template_key, payload, status)
           VALUES (gen_random_uuid(), $1, 'email', $2, 'subscription_renewal_invoice', $3::jsonb, 'queued')`,
          [row.isp_id, emailAddr, payloadJson]
        );
        notificationsQueued += 1;
      }
    }
  }

  const summary = {
    renewalWindowDays: windowD,
    candidatesScanned: candidates.rows.length,
    invoicesCreated,
    notificationsQueued
  };
  if (invoicesCreated || notificationsQueued) {
    billingJobLog("renewal_invoices", summary);
  }
  return summary;
}

/**
 * Suspend network access for subscriptions that are still "active" in DB but past end_date
 * (e.g. renewal invoice was never created, or manual DB edits). Complements overdue-invoice suspension.
 */
export async function processExpiredSubscriptions() {
  const graceH = expiryGraceIntervalHours();
  const expired = await query(
    `SELECT id, isp_id
     FROM subscriptions
     WHERE status = 'active'
       AND end_date + make_interval(hours => $1::int) < CURRENT_TIMESTAMP`,
    [graceH]
  );

  let suspended = 0;
  for (const row of expired.rows) {
    await query("UPDATE subscriptions SET status = 'suspended' WHERE id = $1 AND isp_id = $2", [
      row.id,
      row.isp_id
    ]);
    await provisionSubscriptionAccess({
      ispId: row.isp_id,
      subscriptionId: row.id,
      action: "suspend"
    });
    suspended += 1;
  }

  const summary = { graceHours: graceH, expiredCandidates: expired.rows.length, subscriptionsSuspended: suspended };
  if (suspended) {
    billingJobLog("subscription_expiry", summary);
  }
  return summary;
}
