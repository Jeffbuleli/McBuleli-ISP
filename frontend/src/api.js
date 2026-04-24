/** In dev, Vite proxies `/api` to the backend so any hostname works. Production same-origin or set VITE_API_URL. */
function defaultBrowserApiUrl() {
  if (typeof window === "undefined") return "/api";
  if (import.meta.env.DEV) return "/api";
  const host = window.location.hostname;
  const isPrivateIpv4 =
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host);
  const isLocalLike = host.endsWith(".local") || host.endsWith(".lan");
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]" || isPrivateIpv4 || isLocalLike) {
    return `http://${host}:4000/api`;
  }
  return "/api";
}

export const API_URL = import.meta.env.VITE_API_URL || defaultBrowserApiUrl();

/** Resolve hosted logo paths for `<img src>` when API is on another origin (set VITE_PUBLIC_API_ORIGIN). */
export function publicAssetUrl(pathOrUrl) {
  if (!pathOrUrl) return "";
  const s = String(pathOrUrl).trim();
  if (s.startsWith("http://") || s.startsWith("https://") || s.startsWith("data:")) return s;
  if (s.startsWith("/")) {
    if (import.meta.env.DEV) return s;
    const o = import.meta.env.VITE_PUBLIC_API_ORIGIN;
    if (o) return `${String(o).replace(/\/$/, "")}${s}`;
  }
  return s;
}
let authToken = localStorage.getItem("token") || "";

export function setAuthToken(token) {
  authToken = token || "";
  if (authToken) localStorage.setItem("token", authToken);
  else localStorage.removeItem("token");
}

function withIsp(path, ispId) {
  const delimiter = path.includes("?") ? "&" : "?";
  return `${path}${delimiter}ispId=${encodeURIComponent(ispId)}`;
}

async function request(path, options) {
  const headers = {
    "Content-Type": "application/json",
    ...(options?.headers || {})
  };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      headers,
      ...options
    });
  } catch (err) {
    const reason = String(err?.message || "").toLowerCase();
    if (reason.includes("failed to fetch") || reason.includes("networkerror")) {
      throw new Error(
        `Impossible de joindre l'API (${API_URL}). Vérifiez que le backend est lancé et que VITE_API_URL est correcte.`
      );
    }
    throw new Error(err?.message || "Erreur réseau lors de l'appel API.");
  }

  if (!response.ok) {
    const error = await extractErrorPayload(response);
    const err = new Error(buildApiErrorMessage(response.status, error));
    if (response.status === 402 || error.code === "PLATFORM_SUBSCRIPTION_REQUIRED") {
      err.code = "PLATFORM_SUBSCRIPTION_REQUIRED";
    }
    throw err;
  }

  return readJsonOrApiMisroute(response);
}

export async function publicRequest(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch (err) {
    const reason = String(err?.message || "").toLowerCase();
    if (reason.includes("failed to fetch") || reason.includes("networkerror")) {
      throw new Error(
        `Impossible de joindre l'API (${API_URL}). Vérifiez que le backend est lancé et que VITE_API_URL est correcte.`
      );
    }
    throw new Error(err?.message || "Erreur réseau lors de l'appel API.");
  }
  if (!response.ok) {
    const error = await extractErrorPayload(response);
    throw new Error(buildApiErrorMessage(response.status, error));
  }
  return readJsonOrApiMisroute(response);
}

function buildApiErrorMessage(status, errorPayload) {
  const msg = String(errorPayload?.message || "").trim();
  if (msg) return msg;
  if (status === 500) {
    return "Erreur serveur (500). Vérifiez la configuration backend (DATABASE_URL, JWT_SECRET, NETWORK_NODE_SECRET_KEY) et les logs Render.";
  }
  return `Échec de la requête (${status})`;
}

async function readJsonOrApiMisroute(response) {
  const responseCopy = response.clone();
  try {
    return await response.json();
  } catch (_err) {
    const body = await responseCopy.text().catch(() => "");
    const sample = String(body || "").trim().split("\n")[0].slice(0, 120);
    if (/^\s*<!doctype html>/i.test(String(body || ""))) {
      throw new Error(
        "Réponse HTML reçue au lieu d'une API JSON. Vérifiez que le backend est lancé et que l'URL API pointe vers /api."
      );
    }
    throw new Error(sample || "Réponse invalide de l'API.");
  }
}

async function extractErrorPayload(response) {
  const ct = String(response.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("application/json")) {
    const json = await response.json().catch(() => ({}));
    if (json && typeof json === "object") return json;
    return {};
  }
  const text = await response.text().catch(() => "");
  const clean = String(text || "").trim();
  if (!clean) return {};
  const firstLine = clean.split("\n")[0].trim();
  return { message: firstLine.slice(0, 200) };
}

function triggerBrowserDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function authFetchBlob(path) {
  const headers = {};
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, { headers });
  } catch (err) {
    throw new Error(
      `Impossible de joindre l'API (${API_URL}). Vérifiez que le backend est lancé et que VITE_API_URL est correcte.`
    );
  }
  if (!response.ok) {
    const err = await extractErrorPayload(response);
    throw new Error(buildApiErrorMessage(response.status, err));
  }
  return response.blob();
}

export const api = {
  getPublicPlatformPackages: () => publicRequest("/public/platform-packages"),
  signupTenant: (payload) =>
    publicRequest("/public/signup", { method: "POST", body: JSON.stringify(payload) }),
  subscriberLogin: (payload) =>
    publicRequest("/subscriber/auth/login", { method: "POST", body: JSON.stringify(payload) }),
  subscriberSetupPassword: (payload) =>
    publicRequest("/subscriber/auth/setup-password", { method: "POST", body: JSON.stringify(payload) }),
  getTenantContext: () => request("/tenant/context"),
  login: (payload) =>
    request("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  me: () => request("/auth/me"),
  changePassword: (payload) =>
    request("/auth/change-password", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  acceptInvite: (payload) =>
    request("/auth/accept-invite", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  getIsps: () => request("/isps"),
  getBranding: (ispId) => request(withIsp("/branding", ispId)),
  updateBranding: (ispId, payload) =>
    request(withIsp("/branding", ispId), {
      method: "POST",
      body: JSON.stringify({ ...payload, ispId })
    }),
  uploadBrandingLogo: async (ispId, file) => {
    const form = new FormData();
    form.append("logo", file);
    const headers = {};
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    let response;
    try {
      response = await fetch(`${API_URL}${withIsp("/branding/logo", ispId)}`, {
        method: "POST",
        headers,
        body: form
      });
    } catch (_err) {
      throw new Error(
        `Impossible de joindre l'API (${API_URL}). Vérifiez que le backend est lancé et que VITE_API_URL est correcte.`
      );
    }
    if (!response.ok) {
      const err = await extractErrorPayload(response);
      throw new Error(buildApiErrorMessage(response.status, err));
    }
    return response.json();
  },
  getNetworkStats: (ispId, from, to) =>
    request(
      withIsp(
        `/network/stats?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        ispId
      )
    ),
  getUsers: (ispId) => request(withIsp("/users", ispId)),
  downloadTeamUsersCsv: async (ispId) => {
    const blob = await authFetchBlob(withIsp("/users/export", ispId));
    triggerBrowserDownload(blob, `team-users-export-${String(ispId).slice(0, 8)}.csv`);
  },
  /** Header row only; matches import column names (password/role optional per row when defaults are set in UI). */
  downloadTeamImportTemplate: () => {
    const header =
      "fullName,email,role,password,accreditationLevel\r\n";
    const blob = new Blob([`\uFEFF${header}`], { type: "text/csv;charset=utf-8" });
    triggerBrowserDownload(blob, "team-users-import-template.csv");
  },
  importTeamUsersCsv: async (ispId, file, defaultPassword, defaultRole) => {
    const form = new FormData();
    form.append("file", file);
    form.append("defaultPassword", String(defaultPassword || ""));
    form.append("defaultRole", String(defaultRole || "billing_agent"));
    const headers = {};
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    let response;
    try {
      response = await fetch(`${API_URL}${withIsp("/users/import", ispId)}`, {
        method: "POST",
        headers,
        body: form
      });
    } catch (_err) {
      throw new Error(
        `Impossible de joindre l'API (${API_URL}). Vérifiez que le backend est lancé et que VITE_API_URL est correcte.`
      );
    }
    if (!response.ok) {
      const err = await extractErrorPayload(response);
      throw new Error(buildApiErrorMessage(response.status, err));
    }
    return response.json();
  },
  createUser: (ispId, payload) =>
    request(withIsp("/users", ispId), {
      method: "POST",
      body: JSON.stringify({ ...payload, ispId })
    }),
  resetUserPassword: (ispId, userId, newPassword) =>
    request(withIsp(`/users/${userId}/reset-password`, ispId), {
      method: "POST",
      body: JSON.stringify({ newPassword, ispId })
    }),
  deactivateUser: (ispId, userId) =>
    request(withIsp(`/users/${userId}/deactivate`, ispId), {
      method: "POST",
      body: JSON.stringify({ ispId })
    }),
  reactivateUser: (ispId, userId) =>
    request(withIsp(`/users/${userId}/reactivate`, ispId), {
      method: "POST",
      body: JSON.stringify({ ispId })
    }),
  createInvite: (ispId, userId) =>
    request(withIsp(`/users/${userId}/invite`, ispId), {
      method: "POST",
      body: JSON.stringify({ ispId })
    }),
  createIsp: (payload) =>
    request("/isps", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  getPlatformPackages: () => request("/platform/packages"),
  getPlatformSubscriptions: (ispId) => request(withIsp("/platform/subscriptions", ispId)),
  createPlatformSubscription: (payload) =>
    request("/platform/subscriptions", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  getPaymentMethods: (ispId) => request(withIsp("/payment-methods", ispId)),
  createPaymentMethod: (ispId, payload) =>
    request(withIsp("/payment-methods", ispId), {
      method: "POST",
      body: JSON.stringify({ ...payload, ispId })
    }),
  togglePaymentMethod: (ispId, methodId, isActive) =>
    request(withIsp(`/payment-methods/${methodId}/toggle`, ispId), {
      method: "POST",
      body: JSON.stringify({ ispId, isActive })
    }),
  generatePaymentMethodCallbackSecret: (ispId, methodId) =>
    request(withIsp(`/payment-methods/${methodId}/callback-secret`, ispId), {
      method: "POST",
      body: JSON.stringify({ ispId })
    }),
  testPaymentMethodCallback: (ispId, methodId, payload = {}) =>
    request(withIsp(`/payment-methods/${methodId}/test-callback`, ispId), {
      method: "POST",
      body: JSON.stringify({ ispId, ...payload })
    }),
  submitTidPayment: (payload) =>
    request("/payments/tid-submissions", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  getTidSubmissions: (ispId) => request(withIsp("/payments/tid-submissions", ispId)),
  getTidConflicts: (ispId) => request(withIsp("/payments/tid-conflicts", ispId)),
  reviewTidSubmission: (ispId, submissionId, payload) =>
    request(withIsp(`/payments/tid-submissions/${submissionId}/review`, ispId), {
      method: "POST",
      body: JSON.stringify({ ...payload, ispId })
    }),
  queueTidReminders: (ispId) =>
    request(withIsp("/payments/tid-submissions/reminders", ispId), {
      method: "POST",
      body: JSON.stringify({ ispId })
    }),
  generateVouchers: (ispId, payload) =>
    request(withIsp("/vouchers/generate", ispId), {
      method: "POST",
      body: JSON.stringify({ ...payload, ispId })
    }),
  getVouchers: (ispId) => request(withIsp("/vouchers", ispId)),
  getExpenses: (ispId, from, to) => {
    const q = `?from=${encodeURIComponent(String(from || "").slice(0, 10))}&to=${encodeURIComponent(
      String(to || "").slice(0, 10)
    )}`;
    return request(withIsp(`/expenses${q}`, ispId));
  },
  createExpense: (ispId, payload) =>
    request(withIsp("/expenses", ispId), {
      method: "POST",
      body: JSON.stringify({ ...payload, ispId })
    }),
  deleteExpense: (ispId, expenseId) =>
    request(withIsp(`/expenses/${encodeURIComponent(expenseId)}`, ispId), {
      method: "DELETE"
    }),
  exportVouchers: (ispId) => request(withIsp("/vouchers/export", ispId)),
  redeemVoucher: (payload) =>
    request("/vouchers/redeem", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  getRoleProfiles: (ispId) => request(withIsp("/role-profiles", ispId)),
  upsertRoleProfile: (ispId, payload) =>
    request(withIsp("/role-profiles", ispId), {
      method: "POST",
      body: JSON.stringify({ ...payload, ispId })
    }),
  getAuditLogs: (ispId) => request(withIsp("/audit-logs", ispId)),
  getNotificationOutbox: (ispId) => request(withIsp("/notifications/outbox", ispId)),
  getNotificationProviders: (ispId) => request(withIsp("/notification-providers", ispId)),
  upsertNotificationProvider: (ispId, payload) =>
    request(withIsp("/notification-providers", ispId), {
      method: "POST",
      body: JSON.stringify({ ...payload, ispId })
    }),
  processNotificationOutbox: () =>
    request("/notifications/process", {
      method: "POST",
      body: JSON.stringify({})
    }),
  getNetworkNodes: (ispId) => request(withIsp("/network/nodes", ispId)),
  createNetworkNode: (ispId, payload) =>
    request(withIsp("/network/nodes", ispId), {
      method: "POST",
      body: JSON.stringify({ ...payload, ispId })
    }),
  toggleNetworkNode: (ispId, nodeId, isActive) =>
    request(withIsp(`/network/nodes/${nodeId}/toggle`, ispId), {
      method: "POST",
      body: JSON.stringify({ ispId, isActive })
    }),
  setDefaultNetworkNode: (ispId, nodeId) =>
    request(withIsp(`/network/nodes/${nodeId}/default`, ispId), {
      method: "POST",
      body: JSON.stringify({ ispId })
    }),
  getProvisioningEvents: (ispId) => request(withIsp("/network/provisioning-events", ispId)),
  getFreeRadiusSyncEvents: (ispId) => request(withIsp("/network/freeradius-sync-events", ispId)),
  getTelemetrySnapshots: (ispId, limit) =>
    request(
      withIsp(`/network/telemetry-snapshots${limit ? `?limit=${encodeURIComponent(limit)}` : ""}`, ispId)
    ),
  collectNetworkTelemetry: (ispId, nodeId) =>
    request(withIsp(`/network/nodes/${encodeURIComponent(nodeId)}/collect-telemetry`, ispId), {
      method: "POST",
      body: JSON.stringify({ ispId })
    }),
  getRadiusAccountingIngest: (ispId, limit) =>
    request(
      withIsp(`/network/radius-accounting-ingest${limit ? `?limit=${encodeURIComponent(limit)}` : ""}`, ispId)
    ),
  syncSubscriptionNetwork: (ispId, subscriptionId, action) =>
    request(withIsp(`/network/subscriptions/${subscriptionId}/sync`, ispId), {
      method: "POST",
      body: JSON.stringify({ ispId, action })
    }),
  suspendSubscription: (ispId, subscriptionId) =>
    request(withIsp(`/subscriptions/${subscriptionId}/suspend`, ispId), {
      method: "POST",
      body: JSON.stringify({ ispId })
    }),
  reactivateSubscription: (ispId, subscriptionId) =>
    request(withIsp(`/subscriptions/${subscriptionId}/reactivate`, ispId), {
      method: "POST",
      body: JSON.stringify({ ispId })
    }),
  sendTestNotification: (ispId, payload) =>
    request(withIsp("/notifications/test", ispId), {
      method: "POST",
      body: JSON.stringify({ ...payload, ispId })
    }),
  getDashboard: (ispId) => request(withIsp("/dashboard", ispId)),
  getSuperDashboard: () => request("/super/dashboard"),
  getCustomers: (ispId) => request(withIsp("/customers", ispId)),
  downloadCustomersCsv: async (ispId) => {
    const blob = await authFetchBlob(withIsp("/customers/export", ispId));
    triggerBrowserDownload(blob, `customers-export-${String(ispId).slice(0, 8)}.csv`);
  },
  /** Header row only; email/password optional. MikroTik-style exports often use `name` instead of fullName/phone — rename or add columns to match. */
  downloadCustomerImportTemplate: () => {
    const header = "fullName,phone,email,password\r\n";
    const blob = new Blob([`\uFEFF${header}`], { type: "text/csv;charset=utf-8" });
    triggerBrowserDownload(blob, "customers-import-template.csv");
  },
  importCustomersCsv: async (ispId, file, defaultPassword) => {
    const form = new FormData();
    form.append("file", file);
    if (defaultPassword && String(defaultPassword).trim().length >= 6) {
      form.append("defaultPassword", String(defaultPassword).trim());
    }
    const headers = {};
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    let response;
    try {
      response = await fetch(`${API_URL}${withIsp("/customers/import", ispId)}`, {
        method: "POST",
        headers,
        body: form
      });
    } catch (_err) {
      throw new Error(
        `Impossible de joindre l'API (${API_URL}). Vérifiez que le backend est lancé et que VITE_API_URL est correcte.`
      );
    }
    if (!response.ok) {
      const err = await extractErrorPayload(response);
      throw new Error(buildApiErrorMessage(response.status, err));
    }
    return response.json();
  },
  getPlans: (ispId) => request(withIsp("/plans", ispId)),
  getSubscriptions: (ispId) => request(withIsp("/subscriptions", ispId)),
  getInvoices: (ispId) => request(withIsp("/invoices", ispId)),
  createCustomer: (ispId, payload) =>
    request(withIsp("/customers", ispId), {
      method: "POST",
      body: JSON.stringify({ ...payload, ispId })
    }),
  patchCustomer: (ispId, customerId, payload) =>
    request(withIsp(`/customers/${encodeURIComponent(customerId)}`, ispId), {
      method: "PATCH",
      body: JSON.stringify({ ...payload, ispId })
    }),
  createPlan: (ispId, payload) =>
    request(withIsp("/plans", ispId), {
      method: "POST",
      body: JSON.stringify({ ...payload, ispId })
    }),
  updatePlan: (ispId, planId, payload) =>
    request(withIsp(`/plans/${planId}`, ispId), {
      method: "PATCH",
      body: JSON.stringify({ ...payload, ispId })
    }),
  createSubscription: (ispId, payload) =>
    request(withIsp("/subscriptions", ispId), {
      method: "POST",
      body: JSON.stringify({ ...payload, ispId })
    }),
  simulatePayment: (ispId, payload) =>
    request(withIsp("/payments/webhook", ispId), {
      method: "POST",
      body: JSON.stringify({ ...payload, ispId })
    }),
  processBillingOverdue: (ispId) =>
    request(withIsp("/billing/process-overdue", ispId), {
      method: "POST",
      body: JSON.stringify({ ispId })
    }),
  generateRenewalInvoices: (ispId) =>
    request(withIsp("/billing/generate-renewals", ispId), {
      method: "POST",
      body: JSON.stringify({ ispId })
    }),
  createPortalToken: (ispId, payload) =>
    request(withIsp("/portal/tokens", ispId), {
      method: "POST",
      body: JSON.stringify({ ...payload, ispId })
    }),
  getPlatformBillingStatus: (ispId) => request(withIsp("/platform/billing/status", ispId)),
  initiatePlatformDeposit: (ispId, payload) =>
    request(withIsp("/platform/billing/initiate-deposit", ispId), {
      method: "POST",
      body: JSON.stringify({ ...payload, ispId })
    }),
  getPlatformDepositStatus: (ispId, depositId) =>
    request(withIsp(`/platform/billing/deposit-status/${encodeURIComponent(depositId)}`, ispId)),
  upgradePlatformPlan: (ispId, packageId) =>
    request(withIsp("/platform/billing/upgrade-plan", ispId), {
      method: "POST",
      body: JSON.stringify({ packageId, ispId })
    })
};
