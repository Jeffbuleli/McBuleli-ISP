import { pool } from "./db.js";
import { extendSubscriptionAfterPayment } from "./billingJobs.js";
import { provisionSubscriptionAccess } from "./networkProvisioning.js";

function normalizeMethodType(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeGatewayStatus(input) {
  const status = String(input || "confirmed")
    .trim()
    .toLowerCase();
  if (["confirmed", "completed", "success", "successful", "paid"].includes(status)) return "confirmed";
  if (["failed", "error", "cancelled", "canceled", "rejected"].includes(status)) return "failed";
  return "pending";
}

/**
 * Core payment write path inside an open transaction (caller supplies `client`).
 * Does not call provisionSubscriptionAccess (run after COMMIT).
 */
export async function applyInvoicePaymentTx(client, { ispId, invoiceId, providerRef, amountUsd, status, methodType }) {
  const invResult = await client.query("SELECT * FROM invoices WHERE id = $1 AND isp_id = $2 FOR UPDATE", [
    invoiceId,
    ispId
  ]);
  const invoice = invResult.rows[0];
  if (!invoice) {
    return { ok: false, code: 404, message: "Invoice not found" };
  }

  const normalizedStatus = normalizeGatewayStatus(status);
  const normalizedProviderRef = String(providerRef || "n/a").slice(0, 255);
  const methodNorm = normalizeMethodType(methodType) || "mobile_money";

  if (normalizedStatus === "confirmed" && invoice.status === "paid") {
    const existingPaid = await client.query(
      `SELECT id, isp_id AS "ispId", invoice_id AS "invoiceId", provider_ref AS "providerRef",
              amount_usd AS "amountUsd", status, method, paid_at AS "paidAt"
       FROM payments
       WHERE isp_id = $1 AND invoice_id = $2 AND provider_ref = $3
       ORDER BY paid_at DESC LIMIT 1`,
      [ispId, invoiceId, normalizedProviderRef]
    );
    if (existingPaid.rows[0]) {
      return {
        ok: true,
        duplicate: true,
        payment: existingPaid.rows[0],
        invoiceAlreadyPaid: true,
        activated: false,
        subscriptionId: invoice.subscription_id
      };
    }
    return {
      ok: true,
      duplicate: true,
      invoiceAlreadyPaid: true,
      activated: false,
      subscriptionId: invoice.subscription_id
    };
  }

  const existing = await client.query(
    `SELECT id, isp_id AS "ispId", invoice_id AS "invoiceId", provider_ref AS "providerRef",
            amount_usd AS "amountUsd", status, method, paid_at AS "paidAt"
     FROM payments
     WHERE isp_id = $1 AND invoice_id = $2 AND provider_ref = $3
     ORDER BY paid_at DESC LIMIT 1`,
    [ispId, invoiceId, normalizedProviderRef]
  );
  if (existing.rows[0]) {
    return {
      ok: true,
      duplicate: true,
      payment: existing.rows[0],
      invoiceAlreadyPaid: invoice.status === "paid",
      activated: false,
      subscriptionId: invoice.subscription_id
    };
  }

  let paymentInsert;
  try {
    paymentInsert = await client.query(
      'INSERT INTO payments (id, isp_id, invoice_id, provider_ref, amount_usd, status, method) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6) RETURNING id, isp_id AS "ispId", invoice_id AS "invoiceId", provider_ref AS "providerRef", amount_usd AS "amountUsd", status, method, paid_at AS "paidAt"',
      [
        ispId,
        invoiceId,
        normalizedProviderRef,
        Number(amountUsd || invoice.amount_usd),
        normalizedStatus,
        methodNorm
      ]
    );
  } catch (err) {
    if (err && err.code === "23505") {
      const again = await client.query(
        `SELECT id, isp_id AS "ispId", invoice_id AS "invoiceId", provider_ref AS "providerRef",
                amount_usd AS "amountUsd", status, method, paid_at AS "paidAt"
         FROM payments
         WHERE isp_id = $1 AND invoice_id = $2 AND provider_ref = $3
         ORDER BY paid_at DESC LIMIT 1`,
        [ispId, invoiceId, normalizedProviderRef]
      );
      return {
        ok: true,
        duplicate: true,
        payment: again.rows[0],
        invoiceAlreadyPaid: invoice.status === "paid",
        activated: false,
        subscriptionId: invoice.subscription_id
      };
    }
    throw err;
  }

  let activated = false;
  if (normalizedStatus === "confirmed") {
    const paidUpd = await client.query(
      "UPDATE invoices SET status = 'paid' WHERE id = $1 AND status IN ('unpaid', 'overdue') RETURNING id",
      [invoiceId]
    );
    if (paidUpd.rows[0]) {
      await extendSubscriptionAfterPayment(ispId, invoice.subscription_id, client.query.bind(client));
      activated = true;
    }
  }

  return {
    ok: true,
    duplicate: false,
    payment: paymentInsert.rows[0],
    activated,
    subscriptionId: invoice.subscription_id
  };
}

export async function applyInvoicePayment(params) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await applyInvoicePaymentTx(client, params);
    if (!result.ok) {
      await client.query("ROLLBACK");
      return result;
    }
    await client.query("COMMIT");
    if (result.activated) {
      await provisionSubscriptionAccess({
        ispId: params.ispId,
        subscriptionId: result.subscriptionId,
        action: "activate"
      });
    }
    return {
      ok: true,
      duplicate: result.duplicate,
      payment: result.payment,
      activated: Boolean(result.activated),
      invoiceAlreadyPaid: Boolean(result.invoiceAlreadyPaid)
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_e) {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}
