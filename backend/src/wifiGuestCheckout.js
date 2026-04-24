import { query } from "./db.js";
import { provisionSubscriptionAccess } from "./networkProvisioning.js";
import { signCustomerSetupToken } from "./subscriberAuth.js";

export async function markWifiGuestPurchaseFailed(depositId) {
  await query(
    `UPDATE wifi_guest_purchases
     SET status = 'failed', completed_at = NOW()
     WHERE deposit_id = $1::uuid AND status = 'pending'`,
    [depositId]
  );
}

export function defaultRedirectUrl(planRow, brandingRow) {
  const fromPlan = planRow?.successRedirectUrl ?? planRow?.success_redirect_url;
  const fromBrand = brandingRow?.wifiPortalRedirectUrl ?? brandingRow?.wifi_portal_redirect_url;
  return fromPlan || fromBrand || "https://www.google.com";
}

/**
 * After Pawapay deposit COMPLETED: create guest customer + subscription + paid invoice, activate access.
 * Idempotent if already completed.
 */
export async function completeWifiGuestPurchase(depositId) {
  const rowResult = await query(
    `SELECT id AS "purchaseId", isp_id AS "ispId", plan_id AS "planId", phone, redirect_url AS "redirectUrl",
            status, subscription_id AS "subscriptionId", customer_id AS "customerId",
            subscriber_setup_token AS "subscriberSetupToken"
     FROM wifi_guest_purchases WHERE deposit_id = $1::uuid`,
    [depositId]
  );
  const r = rowResult.rows[0];
  if (!r) {
    return { ok: false, reason: "unknown_purchase" };
  }
  if (r.status === "completed" && r.subscriptionId) {
    return {
      ok: true,
      duplicate: true,
      subscriptionId: r.subscriptionId,
      customerId: r.customerId || null,
      redirectUrl: r.redirectUrl,
      setupToken: r.subscriberSetupToken || null
    };
  }
  if (r.status !== "pending") {
    return { ok: false, reason: "not_pending" };
  }

  const { purchaseId, ispId, planId, phone, redirectUrl } = r;

  try {
    const plan = await query(
      `SELECT id, price_usd, duration_days, default_access_type AS "defaultAccessType", max_devices AS "maxDevices"
       FROM plans WHERE id = $1 AND isp_id = $2`,
      [planId, ispId]
    );
    if (!plan.rows[0]) {
      throw new Error("Plan missing");
    }
    const p = plan.rows[0];
    const accessType = p.defaultAccessType === "hotspot" ? "hotspot" : "pppoe";

    let customer = await query(
      `SELECT id FROM customers WHERE isp_id = $1 AND phone = $2 LIMIT 1`,
      [ispId, phone]
    );
    let customerId;
    if (customer.rows[0]) {
      customerId = customer.rows[0].id;
    } else {
      const guestName = `Wi‑Fi guest ${phone.slice(-4)}`;
      const ins = await query(
        `INSERT INTO customers (id, isp_id, full_name, phone, status)
         VALUES (gen_random_uuid(), $1, $2, $3, 'active')
         RETURNING id`,
        [ispId, guestName, phone]
      );
      customerId = ins.rows[0].id;
    }

    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + Number(p.duration_days));

    const maxDev = Math.max(1, Number(p.maxDevices) || 1);
    const subIns = await query(
      `INSERT INTO subscriptions (id, isp_id, customer_id, plan_id, status, access_type, start_date, end_date, max_simultaneous_devices)
       VALUES (gen_random_uuid(), $1, $2, $3, 'active', $4, $5, $6, $7)
       RETURNING id`,
      [ispId, customerId, planId, accessType, now.toISOString(), endDate.toISOString(), maxDev]
    );
    const subscriptionId = subIns.rows[0].id;

    const invIns = await query(
      `INSERT INTO invoices (id, isp_id, subscription_id, customer_id, amount_usd, status, due_date)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'paid', $5)
       RETURNING id`,
      [ispId, subscriptionId, customerId, Number(p.price_usd), endDate.toISOString()]
    );
    const invoiceId = invIns.rows[0].id;

    await query(
      `INSERT INTO payments (id, isp_id, invoice_id, provider_ref, amount_usd, status, method)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'confirmed', 'pawapay')`,
      [ispId, invoiceId, `pawapay-deposit-${depositId}`, Number(p.price_usd)]
    );

    const fin = await query(
      `UPDATE wifi_guest_purchases
       SET status = 'completed', subscription_id = $1, customer_id = $2, completed_at = NOW()
       WHERE id = $3 AND status = 'pending'
       RETURNING id`,
      [subscriptionId, customerId, purchaseId]
    );
    if (!fin.rows[0]) {
      const again = await query(
        `SELECT subscription_id AS "subscriptionId", redirect_url AS "redirectUrl",
                customer_id AS "customerId", subscriber_setup_token AS "subscriberSetupToken"
         FROM wifi_guest_purchases WHERE deposit_id = $1::uuid`,
        [depositId]
      );
      if (again.rows[0]?.subscriptionId) {
        return {
          ok: true,
          duplicate: true,
          subscriptionId: again.rows[0].subscriptionId,
          customerId: again.rows[0].customerId || null,
          redirectUrl: again.rows[0].redirectUrl || redirectUrl,
          setupToken: again.rows[0].subscriberSetupToken || null
        };
      }
      throw new Error("Could not finalize guest purchase");
    }

    await provisionSubscriptionAccess({
      ispId,
      subscriptionId,
      action: "activate"
    });

    const pwRow = await query(
      `SELECT password_hash AS "passwordHash" FROM customers WHERE id = $1`,
      [customerId]
    );
    let setupToken = null;
    if (!pwRow.rows[0]?.passwordHash) {
      setupToken = signCustomerSetupToken({ customerId, ispId });
      await query(`UPDATE wifi_guest_purchases SET subscriber_setup_token = $1 WHERE id = $2`, [
        setupToken,
        purchaseId
      ]);
    }

    return {
      ok: true,
      duplicate: false,
      subscriptionId,
      customerId,
      setupToken,
      redirectUrl: redirectUrl || "https://www.google.com"
    };
  } catch (err) {
    await markWifiGuestPurchaseFailed(depositId);
    throw err;
  }
}
