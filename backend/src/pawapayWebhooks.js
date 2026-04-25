import { query } from "./db.js";
import { applySuccessfulSaasDeposit, markSaasDepositFailed } from "./platformBilling.js";
import { completeWifiGuestPurchase, markWifiGuestPurchaseFailed } from "./wifiGuestCheckout.js";

const CALLBACK_PATH = "/api/webhooks/pawapay";

/** Primary secret; falls back to legacy env name used earlier in the project. */
export function getPawapayCallbackSecret() {
  return (process.env.PAWAPAY_CALLBACK_SECRET || process.env.PAWAPAY_PLATFORM_CALLBACK_SECRET || "").trim();
}

/**
 * Optional shared secret so only your Pawapay dashboard / edge can hit this URL.
 * Pawapay does not send this header unless you add it in a reverse proxy; for production prefer signed callbacks.
 */
export function verifyPawapayCallbackSecret(req) {
  const secret = getPawapayCallbackSecret();
  if (!secret) return true;
  const got =
    req.get("x-pawapay-callback-secret") ||
    req.get("X-Pawapay-Callback-Secret") ||
    req.get("x-mcbuleli-callback-secret") ||
    "";
  return got === secret;
}

export function classifyPawapayCallback(body) {
  if (!body || typeof body !== "object") return "unknown";
  if (body.depositId != null && String(body.depositId).trim() !== "") return "deposit";
  if (body.payoutId != null && String(body.payoutId).trim() !== "") return "payout";
  if (body.refundId != null && String(body.refundId).trim() !== "") return "refund";
  return "unknown";
}

async function logPawapayCallback({ action, pawapayId, body }) {
  let entityId = null;
  const idStr = pawapayId != null ? String(pawapayId) : "";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idStr)) {
    entityId = idStr;
  }
  await query(
    "INSERT INTO audit_logs (id, isp_id, actor_user_id, action, entity_type, entity_id, details) VALUES (gen_random_uuid(), NULL, NULL, $1, $2, $3, $4::jsonb)",
    [action, "pawapay_callback", entityId, JSON.stringify({ pawapayId: idStr || null, status: body?.status, payload: body })]
  );
}

/**
 * Single handler for Pawapay final-status callbacks (deposits, payouts/withdrawals, refunds).
 * Register the same POST URL in the Pawapay dashboard for all three event types.
 */
export async function processPawapayCallback(body) {
  const kind = classifyPawapayCallback(body);
  const status = body?.status;

  if (kind === "deposit") {
    const depositId = String(body.depositId);
    if (status === "COMPLETED") {
      const saas = await applySuccessfulSaasDeposit(depositId);
      if (saas.ok) {
        return { kind, status, result: saas, handled: "platform_saas_deposit" };
      }
      const wifi = await completeWifiGuestPurchase(depositId);
      if (wifi.ok) {
        return { kind, status, result: wifi, handled: "wifi_guest_purchase" };
      }
      if (saas.reason === "unknown_deposit" && wifi.reason === "unknown_purchase") {
        await logPawapayCallback({
          action: "pawapay.callback.deposit.unknown",
          pawapayId: depositId,
          body
        });
        return { kind, status, ignored: true, message: "No matching local deposit session (ignored)" };
      }
      return { kind, status, ignored: true, message: "Deposit not applied to platform or Wi‑Fi guest flow" };
    }
    if (status === "FAILED") {
      await markSaasDepositFailed(depositId);
      await markWifiGuestPurchaseFailed(depositId);
      return { kind, status, result: { markedFailed: true } };
    }
    await logPawapayCallback({ action: "pawapay.callback.deposit.non_final", pawapayId: depositId, body });
    return { kind, status, acknowledged: true };
  }

  if (kind === "payout") {
    const payoutId = String(body.payoutId);
    if (status === "COMPLETED") {
      await query(
        `UPDATE isp_withdrawal_requests
         SET status = 'completed', completed_at = NOW(), failure_message = NULL
         WHERE payout_id = $1::uuid AND status = 'processing'`,
        [payoutId]
      );
    } else if (status === "FAILED") {
      await query(
        `UPDATE isp_withdrawal_requests
         SET status = 'failed', completed_at = NOW(), failure_message = $2
         WHERE payout_id = $1::uuid`,
        [payoutId, body?.failureReason?.failureMessage || body?.message || "Pawapay payout failed"]
      );
    }
    await logPawapayCallback({ action: "pawapay.callback.payout", pawapayId: body.payoutId, body });
    return { kind, status, acknowledged: true, note: "Payout logged and withdrawal status reconciled when payoutId matches." };
  }

  if (kind === "refund") {
    await logPawapayCallback({ action: "pawapay.callback.refund", pawapayId: body.refundId, body });
    return { kind, status, acknowledged: true, note: "Refund logged; extend with refund reconciliation when needed." };
  }

  if (body && typeof body === "object" && Object.keys(body).length > 0) {
    await logPawapayCallback({ action: "pawapay.callback.unrecognized", pawapayId: null, body });
  }
  return { kind: "unknown", status: status || null, acknowledged: true, ignored: true };
}

export function getPawapayCallbackDocumentation() {
  const base = (process.env.PUBLIC_API_BASE_URL || "").replace(/\/$/, "");
  const fullUrl = base ? `${base}${CALLBACK_PATH}` : null;
  return {
    title: "Pawapay unified callback (deposits, payouts, refunds)",
    method: "POST",
    path: CALLBACK_PATH,
    fullUrl: fullUrl || "(set PUBLIC_API_BASE_URL in backend .env to show the full URL, e.g. https://api.yourdomain.com)",
    dashboardHint:
      "In the Pawapay test/production dashboard, set the callback URL for deposits, payouts, and refunds to the same POST URL above.",
    optionalHeaders: {
      "Content-Type": "application/json",
      "X-Pawapay-Callback-Secret":
        "If PAWAPAY_CALLBACK_SECRET is set in your server, send the same value here (or terminate TLS at a proxy that injects it). Pawapay’s own signed callbacks are separate; see Pawapay docs."
    },
    detection: {
      deposit: "Body includes depositId (UUID)",
      payout: "Body includes payoutId (UUID) — withdrawals / outbound transfers",
      refund: "Body includes refundId (UUID)"
    },
    bodyExamples: {
      depositCompleted: { depositId: "00000000-0000-4000-8000-000000000001", status: "COMPLETED" },
      depositFailed: { depositId: "00000000-0000-4000-8000-000000000001", status: "FAILED" },
      payoutCompleted: { payoutId: "00000000-0000-4000-8000-000000000002", status: "COMPLETED" },
      refundCompleted: { refundId: "00000000-0000-4000-8000-000000000003", status: "COMPLETED" }
    },
    behavior: {
      deposit:
        "COMPLETED extends McBuleli workspace billing when depositId matches platform_saas_deposit_sessions; FAILED marks session failed.",
      payoutAndRefund:
        "Payout callbacks reconcile isp_withdrawal_requests when payoutId matches; refunds are recorded in audit_logs."
    }
  };
}
