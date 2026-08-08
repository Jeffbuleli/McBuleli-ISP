const PAWAPAY_API_BASE = (process.env.PAWAPAY_API_BASE_URL || "https://api.sandbox.pawapay.io").replace(/\/$/, "");
const PAWAPAY_API_TOKEN = process.env.PAWAPAY_API_TOKEN || "";

/**
 * Initiate a mobile-money deposit (funds move from customer wallet to your Pawapay wallet).
 * @param {object} body - Pawapay DepositInitiationRequest (depositId, amount, currency, payer, ...)
 */
function missingTokenError() {
  const err = new Error("Mobile Money payment is temporarily unavailable. Please try again later.");
  err.code = "MM_NOT_CONFIGURED";
  return err;
}

export async function initiatePawapayDeposit(body) {
  if (!PAWAPAY_API_TOKEN) {
    throw missingTokenError();
  }
  const response = await fetch(`${PAWAPAY_API_BASE}/v2/deposits`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAWAPAY_API_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg =
      data?.failureReason?.failureMessage ||
      data?.message ||
      `Mobile Money request failed (${response.status})`;
    throw new Error(msg);
  }
  return data;
}

export async function fetchPawapayDepositStatus(depositId) {
  if (!PAWAPAY_API_TOKEN) {
    throw missingTokenError();
  }
  const response = await fetch(`${PAWAPAY_API_BASE}/v2/deposits/${encodeURIComponent(depositId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${PAWAPAY_API_TOKEN}`
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg =
      data?.failureReason?.failureMessage ||
      data?.message ||
      `Mobile Money status check failed (${response.status})`;
    throw new Error(msg);
  }
  if (data?.status === "FOUND" && data?.data && typeof data.data === "object") {
    return { ...data.data, searchStatus: data.status };
  }
  return data;
}

export async function initiatePawapayPayout(body) {
  if (!PAWAPAY_API_TOKEN) {
    throw missingTokenError();
  }
  const response = await fetch(`${PAWAPAY_API_BASE}/v2/payouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAWAPAY_API_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg =
      data?.failureReason?.failureMessage ||
      data?.message ||
      `Mobile Money payout request failed (${response.status})`;
    throw new Error(msg);
  }
  return data;
}
