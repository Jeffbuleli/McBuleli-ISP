import bcrypt from "bcryptjs";
import { query } from "./db.js";
import { provisionSubscriptionAccess } from "./networkProvisioning.js";
import { isLikelyDrCongoMsisdn, normalizeDrCongoMsisdn } from "./phoneNormalize.js";
import { signCustomerSetupToken, signSubscriberToken } from "./subscriberAuth.js";

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
 * Guest catalog: redeem an unused access voucher with phone (+ optional portal password).
 * Creates the guest customer when needed, activates access, returns redirect + tokens.
 */
export async function redeemWifiGuestVoucher({ ispId, code, phoneNumber, newPassword, expectPlanId }) {
  const phone = normalizeDrCongoMsisdn(phoneNumber);
  const voucherCode = String(code || "").trim();
  if (!ispId || !voucherCode) {
    return { ok: false, status: 400, message: "ispId and code are required" };
  }
  if (!isLikelyDrCongoMsisdn(phone)) {
    return {
      ok: false,
      status: 400,
      message: "Numéro invalide. Exemple: 0812345678 (converti en 243812345678)."
    };
  }

  const voucherResult = await query(
    "SELECT * FROM access_vouchers WHERE code = $1 AND status = 'unused'",
    [voucherCode]
  );
  const voucher = voucherResult.rows[0];
  if (!voucher) {
    return { ok: false, status: 404, message: "Voucher not found or already used" };
  }
  if (String(voucher.isp_id) !== String(ispId)) {
    return { ok: false, status: 400, message: "ispId does not match this voucher" };
  }
  if (expectPlanId && String(voucher.plan_id) !== String(expectPlanId)) {
    return { ok: false, status: 400, message: "This voucher is not valid for the selected plan" };
  }
  if (voucher.expires_at && new Date(voucher.expires_at).getTime() < Date.now()) {
    await query("UPDATE access_vouchers SET status = 'expired' WHERE id = $1", [voucher.id]);
    return { ok: false, status: 400, message: "Voucher expired" };
  }

  const planRow = await query(
    `SELECT id, price_usd AS "priceUsd", duration_days AS "durationDays",
            default_access_type AS "defaultAccessType", max_devices AS "maxDevices",
            success_redirect_url AS "successRedirectUrl"
     FROM plans WHERE id = $1 AND isp_id = $2`,
    [voucher.plan_id, ispId]
  );
  const plan = planRow.rows[0];
  if (!plan) {
    return { ok: false, status: 500, message: "Voucher plan is missing" };
  }

  let customer = await query(
    `SELECT id, password_hash AS "passwordHash" FROM customers WHERE isp_id = $1 AND phone = $2
     ORDER BY created_at DESC LIMIT 1`,
    [ispId, phone]
  );
  let customerId;
  let hasPw = false;
  if (customer.rows[0]) {
    customerId = customer.rows[0].id;
    hasPw = Boolean(customer.rows[0].passwordHash);
  } else {
    const guestName = `Wi‑Fi guest ${phone.slice(-4)}`;
    const ins = await query(
      `INSERT INTO customers (id, isp_id, full_name, phone, status)
       VALUES (gen_random_uuid(), $1, $2, $3, 'active')
       RETURNING id`,
      [ispId, guestName, phone]
    );
    customerId = ins.rows[0].id;
    hasPw = false;
  }

  if (!hasPw && !(newPassword != null && String(newPassword).length > 0)) {
    return {
      ok: false,
      status: 400,
      message: "Set newPassword on first redeem for this account so you can log in later."
    };
  }
  if (newPassword != null && String(newPassword).length > 0) {
    if (String(newPassword).length < 6) {
      return { ok: false, status: 400, message: "newPassword must be at least 6 characters" };
    }
    const hash = await bcrypt.hash(String(newPassword), 10);
    await query(`UPDATE customers SET password_hash = $1, must_set_password = FALSE WHERE id = $2`, [
      hash,
      customerId
    ]);
    hasPw = true;
  }

  await query(
    "UPDATE access_vouchers SET status = 'used', assigned_customer_id = $1, used_at = NOW() WHERE id = $2",
    [customerId, voucher.id]
  );

  const voucherDeviceCap = Math.max(1, Number(voucher.max_devices) || 1);
  const planDeviceCap = Math.max(1, Number(plan.maxDevices) || 1);
  const effectiveDevices = Math.min(voucherDeviceCap, planDeviceCap);
  const durationDays = Number(voucher.duration_days) || Number(plan.durationDays) || 0;
  const extendMs = durationDays * 86400000;
  const now = new Date();

  const activeSub = await query(
    `SELECT id, end_date AS "endDate" FROM subscriptions
     WHERE customer_id = $1 AND isp_id = $2 AND status = 'active'
     ORDER BY end_date DESC LIMIT 1`,
    [customerId, ispId]
  );
  let subscriptionId = null;
  if (activeSub.rows[0]) {
    subscriptionId = activeSub.rows[0].id;
    const curEnd = new Date(activeSub.rows[0].endDate);
    const base = curEnd.getTime() > now.getTime() ? curEnd : now;
    const newEnd = new Date(base.getTime() + extendMs);
    await query(
      `UPDATE subscriptions
       SET end_date = $1, max_simultaneous_devices = $2, plan_id = $3, status = 'active'
       WHERE id = $4`,
      [newEnd.toISOString(), effectiveDevices, voucher.plan_id, subscriptionId]
    );
  } else {
    const accessType =
      String(plan.defaultAccessType || "").toLowerCase() === "hotspot" ? "hotspot" : "pppoe";
    const endDate = new Date(now.getTime() + extendMs);
    const subIns = await query(
      `INSERT INTO subscriptions (id, isp_id, customer_id, plan_id, status, access_type, start_date, end_date, max_simultaneous_devices)
       VALUES (gen_random_uuid(), $1, $2, $3, 'active', $4, $5, $6, $7)
       RETURNING id`,
      [ispId, customerId, voucher.plan_id, accessType, now.toISOString(), endDate.toISOString(), effectiveDevices]
    );
    subscriptionId = subIns.rows[0].id;
    const invIns = await query(
      `INSERT INTO invoices (id, isp_id, subscription_id, customer_id, amount_usd, status, due_date)
       VALUES (gen_random_uuid(), $1, $2, $3, 0, 'paid', $4)
       RETURNING id`,
      [ispId, subscriptionId, customerId, endDate.toISOString()]
    );
    await query(
      `INSERT INTO payments (id, isp_id, invoice_id, provider_ref, amount_usd, status, method)
       VALUES (gen_random_uuid(), $1, $2, $3, 0, 'confirmed', 'voucher')`,
      [ispId, invIns.rows[0].id, `voucher-${voucher.id}`]
    );
  }

  if (subscriptionId) {
    await provisionSubscriptionAccess({
      ispId,
      subscriptionId,
      action: "activate"
    });
  }

  const brandRow = await query(
    'SELECT wifi_portal_redirect_url AS "wifiPortalRedirectUrl" FROM isp_branding WHERE isp_id = $1',
    [ispId]
  );
  const redirectUrl = defaultRedirectUrl(plan, brandRow.rows[0] || {});

  let setupToken = null;
  let subscriberToken = null;
  if (hasPw) {
    subscriberToken = signSubscriberToken({ id: customerId, isp_id: ispId });
  } else {
    setupToken = signCustomerSetupToken({ customerId, ispId });
  }

  return {
    ok: true,
    status: 200,
    message: "Voucher redeemed",
    rateLimit: voucher.rate_limit,
    durationDays: voucher.duration_days,
    maxDevices: effectiveDevices,
    subscriptionId,
    customerId,
    redirectUrl,
    setupToken,
    subscriberToken
  };
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
