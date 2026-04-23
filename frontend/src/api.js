const API_URL =
  import.meta.env.VITE_API_URL ||
  (window.location.hostname === "localhost" ? "http://localhost:4000/api" : "/api");
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

  const response = await fetch(`${API_URL}${path}`, {
    headers,
    ...options
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Request failed");
  }

  return response.json();
}

export const api = {
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
  getNetworkStats: (ispId, from, to) =>
    request(
      withIsp(
        `/network/stats?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        ispId
      )
    ),
  getUsers: (ispId) => request(withIsp("/users", ispId)),
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
  getPlans: (ispId) => request(withIsp("/plans", ispId)),
  getSubscriptions: (ispId) => request(withIsp("/subscriptions", ispId)),
  getInvoices: (ispId) => request(withIsp("/invoices", ispId)),
  createCustomer: (ispId, payload) =>
    request(withIsp("/customers", ispId), {
      method: "POST",
      body: JSON.stringify({ ...payload, ispId })
    }),
  createPlan: (ispId, payload) =>
    request(withIsp("/plans", ispId), {
      method: "POST",
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
    })
};
