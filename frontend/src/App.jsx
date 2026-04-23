import { useEffect, useState } from "react";
import { api, setAuthToken } from "./api";

function App() {
  const [user, setUser] = useState(null);
  const [tenantContext, setTenantContext] = useState(null);
  const [loginForm, setLoginForm] = useState({ email: "admin@isp.local", password: "admin123" });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "" });
  const [inviteAcceptForm, setInviteAcceptForm] = useState({
    token: "",
    fullName: "",
    password: ""
  });
  const [isps, setIsps] = useState([]);
  const [selectedIspId, setSelectedIspId] = useState("");
  const [superDashboard, setSuperDashboard] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [users, setUsers] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [notificationProviders, setNotificationProviders] = useState([]);
  const [roleProfiles, setRoleProfiles] = useState([]);
  const [platformPackages, setPlatformPackages] = useState([]);
  const [platformSubscriptions, setPlatformSubscriptions] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [notificationOutbox, setNotificationOutbox] = useState([]);
  const [branding, setBranding] = useState(null);
  const [networkStats, setNetworkStats] = useState(null);
  const [networkNodes, setNetworkNodes] = useState([]);
  const [provisioningEvents, setProvisioningEvents] = useState([]);
  const [radiusSyncEvents, setRadiusSyncEvents] = useState([]);
  const [tidSubmissions, setTidSubmissions] = useState([]);
  const [tidConflicts, setTidConflicts] = useState([]);
  const [vouchers, setVouchers] = useState([]);
  const [plans, setPlans] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  const [customerForm, setCustomerForm] = useState({ fullName: "", phone: "" });
  const [planForm, setPlanForm] = useState({
    name: "",
    priceUsd: "",
    durationDays: "",
    rateLimit: ""
  });
  const [subForm, setSubForm] = useState({ customerId: "", planId: "", accessType: "pppoe" });
  const [ispForm, setIspForm] = useState({ name: "", location: "", contactPhone: "" });
  const [generatedInvite, setGeneratedInvite] = useState(null);
  const [paymentMethodForm, setPaymentMethodForm] = useState({
    methodType: "cash",
    providerName: "Manual Cash Desk",
    configText: "{}"
  });
  const [notificationProviderForm, setNotificationProviderForm] = useState({
    channel: "sms",
    providerKey: "webhook",
    webhookUrl: "",
    authHeaderName: "Authorization",
    authToken: "",
    twilioAccountSid: "",
    twilioAuthToken: "",
    twilioFrom: "",
    twilioMessagingServiceSid: "",
    isActive: true
  });
  const [roleProfileForm, setRoleProfileForm] = useState({
    roleKey: "field_agent",
    accreditationLevel: "basic",
    permissionsText: "[\"collect_payment\"]"
  });
  const [platformSubForm, setPlatformSubForm] = useState({
    packageId: "",
    durationDays: 30
  });
  const [statsPeriod, setStatsPeriod] = useState({
    from: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10)
  });
  const [brandingForm, setBrandingForm] = useState({
    displayName: "",
    logoUrl: "",
    primaryColor: "#1565d8",
    secondaryColor: "#162030",
    invoiceFooter: "",
    address: "",
    contactEmail: "",
    contactPhone: "",
    customDomain: "",
    subdomain: ""
  });
  const [userForm, setUserForm] = useState({
    fullName: "",
    email: "",
    password: "",
    role: "billing_agent",
    accreditationLevel: "basic"
  });
  const [tidForm, setTidForm] = useState({
    invoiceId: "",
    tid: "",
    submittedByPhone: "",
    amountUsd: ""
  });
  const [voucherForm, setVoucherForm] = useState({
    planId: "",
    quantity: 1
  });
  const [voucherRedeemForm, setVoucherRedeemForm] = useState({
    code: "",
    customerId: ""
  });
  const [networkNodeForm, setNetworkNodeForm] = useState({
    name: "",
    host: "",
    apiPort: 443,
    useTls: true,
    username: "",
    password: "",
    defaultPppoeProfile: "default",
    defaultHotspotProfile: "default",
    isDefault: false,
    isActive: true
  });
  const [notificationTestForm, setNotificationTestForm] = useState({
    channel: "sms",
    recipient: "",
    message: "This is a test notification from your ISP platform."
  });

  async function refresh(selectedTenantId = selectedIspId) {
    setLoading(true);
    setError("");
    try {
      const [allIsps, currentUser, packages] = await Promise.all([
        api.getIsps(),
        api.me(),
        api.getPlatformPackages()
      ]);
      setUser(currentUser);
      const activeIspId =
        tenantContext?.ispId || selectedTenantId || currentUser.ispId || allIsps[0]?.id || "";
      const superDash =
        currentUser.role === "super_admin"
          ? await api.getSuperDashboard()
          : {
              totalIsps: allIsps.length,
              totalCustomers: 0,
              totalActiveSubscriptions: 0,
              totalRevenueUsd: 0
            };

      const [dash, c, u, p, s, i, payMethods, notifProviders, nodes, provEvents, radiusEvents, roles, platformSubs, logs, outbox, brand, stats, tids, conflicts, vchs] = activeIspId
        ? await Promise.all([
            api.getDashboard(activeIspId),
            api.getCustomers(activeIspId),
            api.getUsers(activeIspId),
            api.getPlans(activeIspId),
            api.getSubscriptions(activeIspId),
            api.getInvoices(activeIspId),
            api.getPaymentMethods(activeIspId),
            api.getNotificationProviders(activeIspId),
            api.getNetworkNodes(activeIspId),
            api.getProvisioningEvents(activeIspId),
            api.getFreeRadiusSyncEvents(activeIspId),
            api.getRoleProfiles(activeIspId),
            api.getPlatformSubscriptions(activeIspId),
            api.getAuditLogs(activeIspId),
            api.getNotificationOutbox(activeIspId),
            api.getBranding(activeIspId),
            api.getNetworkStats(activeIspId, statsPeriod.from, statsPeriod.to),
            api.getTidSubmissions(activeIspId),
            api.getTidConflicts(activeIspId),
            api.getVouchers(activeIspId)
          ])
        : [{}, [], [], [], [], [], [], [], [], [], [], [], [], [], null, null, [], [], []];

      setIsps(allIsps);
      setSelectedIspId(activeIspId);
      setSuperDashboard(superDash);
      setDashboard(dash);
      setCustomers(c);
      setUsers(u);
      setPlans(p);
      setSubscriptions(s);
      setInvoices(i);
      setPaymentMethods(payMethods);
      setNotificationProviders(notifProviders);
      setNetworkNodes(nodes);
      setProvisioningEvents(provEvents);
      setRadiusSyncEvents(radiusEvents);
      setRoleProfiles(roles);
      setPlatformPackages(packages);
      setPlatformSubscriptions(platformSubs);
      setAuditLogs(logs);
      setNotificationOutbox(outbox);
      setBranding(brand);
      setNetworkStats(stats);
      setTidSubmissions(tids);
      setTidConflicts(conflicts);
      setVouchers(vchs);
      if (brand) {
        setBrandingForm({
          displayName: brand.displayName || "",
          logoUrl: brand.logoUrl || "",
          primaryColor: brand.primaryColor || "#1565d8",
          secondaryColor: brand.secondaryColor || "#162030",
          invoiceFooter: brand.invoiceFooter || "",
          address: brand.address || "",
          contactEmail: brand.contactEmail || "",
          contactPhone: brand.contactPhone || "",
          customDomain: brand.customDomain || "",
          subdomain: brand.subdomain || ""
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function bootstrap() {
      const tokenFromUrl = new URLSearchParams(window.location.search).get("token");
      if (tokenFromUrl) {
        setInviteAcceptForm((prev) => ({ ...prev, token: tokenFromUrl }));
      }
      try {
        const tenant = await api.getTenantContext();
        if (tenant?.matched) {
          setTenantContext(tenant);
        }
      } catch (_err) {
        // Ignore tenant-context bootstrap failures.
      }
      if (localStorage.getItem("token")) {
        refresh();
      }
    }
    bootstrap();
  }, []);

  async function onLogin(e) {
    e.preventDefault();
    setError("");
    try {
      const payload = await api.login(loginForm);
      setAuthToken(payload.token);
      setUser(payload.user);
      refresh(payload.user.ispId || "");
    } catch (err) {
      setError(err.message);
    }
  }

  function onLogout() {
    setAuthToken("");
    setUser(null);
    setIsps([]);
    setSelectedIspId("");
    setSuperDashboard(null);
    setDashboard(null);
    setCustomers([]);
    setUsers([]);
    setPaymentMethods([]);
    setNotificationProviders([]);
    setRoleProfiles([]);
    setPlatformPackages([]);
    setPlatformSubscriptions([]);
    setAuditLogs([]);
    setNotificationOutbox([]);
    setBranding(null);
    setNetworkStats(null);
    setNetworkNodes([]);
    setProvisioningEvents([]);
    setRadiusSyncEvents([]);
    setTidSubmissions([]);
    setTidConflicts([]);
    setVouchers([]);
    setPlans([]);
    setSubscriptions([]);
    setInvoices([]);
  }

  async function onCreateIsp(e) {
    e.preventDefault();
    const created = await api.createIsp(ispForm);
    setIspForm({ name: "", location: "", contactPhone: "" });
    refresh(created.id);
  }

  async function onCreateCustomer(e) {
    e.preventDefault();
    await api.createCustomer(selectedIspId, customerForm);
    setCustomerForm({ fullName: "", phone: "" });
    refresh();
  }

  async function onCreatePlan(e) {
    e.preventDefault();
    await api.createPlan(selectedIspId, planForm);
    setPlanForm({ name: "", priceUsd: "", durationDays: "", rateLimit: "" });
    refresh();
  }

  async function onCreateSubscription(e) {
    e.preventDefault();
    await api.createSubscription(selectedIspId, subForm);
    setSubForm({ customerId: "", planId: "", accessType: "pppoe" });
    refresh();
  }

  async function onRefreshStats(e) {
    e.preventDefault();
    refresh();
  }

  async function onSaveBranding(e) {
    e.preventDefault();
    await api.updateBranding(selectedIspId, brandingForm);
    setNotice("Branding updated successfully.");
    refresh();
  }

  async function onMarkPaid(invoiceId, amountUsd) {
    await api.simulatePayment(selectedIspId, {
      invoiceId,
      amountUsd,
      providerRef: `DEMO-${Date.now()}`,
      status: "confirmed",
      method: "mobile_money"
    });
    refresh();
  }

  async function onCreateUser(e) {
    e.preventDefault();
    await api.createUser(selectedIspId, userForm);
    setUserForm({
      fullName: "",
      email: "",
      password: "",
      role: "billing_agent",
      accreditationLevel: "basic"
    });
    refresh();
  }

  async function onResetPassword(userId) {
    setError("");
    setNotice("");
    const newPassword = window.prompt("Enter new password (min 6 chars)");
    if (!newPassword) return;
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    try {
      await api.resetUserPassword(selectedIspId, userId, newPassword);
      setNotice("Password reset successful. User will be asked to change it on next login.");
      refresh();
    } catch (err) {
      setError(err.message || "Failed to reset password.");
    }
  }

  async function onDeactivateUser(userId) {
    await api.deactivateUser(selectedIspId, userId);
    refresh();
  }

  async function onReactivateUser(userId) {
    await api.reactivateUser(selectedIspId, userId);
    refresh();
  }

  async function onCreateInvite(userId) {
    setError("");
    const payload = await api.createInvite(selectedIspId, userId);
    setGeneratedInvite(payload);
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(payload.inviteLink).catch(() => {});
    }
  }

  async function onCreatePaymentMethod(e) {
    e.preventDefault();
    await api.createPaymentMethod(selectedIspId, {
      methodType: paymentMethodForm.methodType,
      providerName: paymentMethodForm.providerName,
      config: JSON.parse(paymentMethodForm.configText || "{}")
    });
    setPaymentMethodForm({
      methodType: "cash",
      providerName: "Manual Cash Desk",
      configText: "{}"
    });
    refresh();
  }

  async function onTogglePaymentMethod(methodId, isActive) {
    await api.togglePaymentMethod(selectedIspId, methodId, isActive);
    refresh();
  }

  async function onCreateNetworkNode(e) {
    e.preventDefault();
    await api.createNetworkNode(selectedIspId, networkNodeForm);
    setNotice("Network node saved.");
    setNetworkNodeForm({
      name: "",
      host: "",
      apiPort: 443,
      useTls: true,
      username: "",
      password: "",
      defaultPppoeProfile: "default",
      defaultHotspotProfile: "default",
      isDefault: false,
      isActive: true
    });
    refresh();
  }

  async function onToggleNetworkNode(nodeId, isActive) {
    await api.toggleNetworkNode(selectedIspId, nodeId, isActive);
    refresh();
  }

  async function onSetDefaultNetworkNode(nodeId) {
    await api.setDefaultNetworkNode(selectedIspId, nodeId);
    refresh();
  }

  async function onUpsertNotificationProvider(e) {
    e.preventDefault();
    const config =
      notificationProviderForm.providerKey === "twilio"
        ? {
            accountSid: notificationProviderForm.twilioAccountSid,
            authToken: notificationProviderForm.twilioAuthToken,
            from: notificationProviderForm.twilioFrom,
            messagingServiceSid: notificationProviderForm.twilioMessagingServiceSid
          }
        : {
            webhookUrl: notificationProviderForm.webhookUrl,
            authHeaderName: notificationProviderForm.authHeaderName,
            authToken: notificationProviderForm.authToken
          };
    await api.upsertNotificationProvider(selectedIspId, {
      channel: notificationProviderForm.channel,
      providerKey: notificationProviderForm.providerKey,
      isActive: notificationProviderForm.isActive,
      config
    });
    setNotice(`Notification provider saved for ${notificationProviderForm.channel}.`);
    refresh();
  }

  async function onUpsertRoleProfile(e) {
    e.preventDefault();
    await api.upsertRoleProfile(selectedIspId, {
      roleKey: roleProfileForm.roleKey,
      accreditationLevel: roleProfileForm.accreditationLevel,
      permissions: JSON.parse(roleProfileForm.permissionsText || "[]")
    });
    refresh();
  }

  async function onCreatePlatformSubscription(e) {
    e.preventDefault();
    await api.createPlatformSubscription({
      ispId: selectedIspId,
      packageId: platformSubForm.packageId,
      durationDays: Number(platformSubForm.durationDays)
    });
    refresh();
  }

  async function onSubmitTid(e) {
    e.preventDefault();
    await api.submitTidPayment({
      invoiceId: tidForm.invoiceId,
      tid: tidForm.tid,
      submittedByPhone: tidForm.submittedByPhone,
      amountUsd: tidForm.amountUsd || undefined
    });
    setTidForm({ invoiceId: "", tid: "", submittedByPhone: "", amountUsd: "" });
    setNotice("TID submitted. Waiting admin verification.");
    refresh();
  }

  async function onReviewTid(submissionId, decision) {
    const note = window.prompt(`Optional note for ${decision}`, "");
    await api.reviewTidSubmission(selectedIspId, submissionId, { decision, note: note || "" });
    refresh();
  }

  async function onQueueTidReminders() {
    const payload = await api.queueTidReminders(selectedIspId);
    setNotice(`Queued ${payload.queued} reminder(s) for ${payload.totalPending} pending TID submissions.`);
    refresh();
  }

  async function onProcessNotificationOutbox() {
    setError("");
    try {
      const stats = await api.processNotificationOutbox();
      setNotice(
        `Notification worker processed ${stats.processed} item(s): sent ${stats.sent}, retried ${stats.retried}, failed ${stats.failed}.`
      );
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function onSendTestNotification(e) {
    e.preventDefault();
    setError("");
    try {
      const payload = await api.sendTestNotification(selectedIspId, notificationTestForm);
      setNotice(
        `Test sent to ${payload.recipient} via ${payload.channel}. Provider message ID: ${payload.providerMessageId || "n/a"}`
      );
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function onGenerateVouchers(e) {
    e.preventDefault();
    await api.generateVouchers(selectedIspId, {
      planId: voucherForm.planId,
      quantity: Number(voucherForm.quantity || 1)
    });
    setNotice("Vouchers generated successfully.");
    setVoucherForm({ planId: "", quantity: 1 });
    refresh();
  }

  async function onSuspendSubscription(subscriptionId) {
    await api.suspendSubscription(selectedIspId, subscriptionId);
    setNotice("Subscription suspended and network access update requested.");
    refresh();
  }

  async function onReactivateSubscription(subscriptionId) {
    await api.reactivateSubscription(selectedIspId, subscriptionId);
    setNotice("Subscription reactivated and network access update requested.");
    refresh();
  }

  async function onSyncSubscriptionNetwork(subscriptionId, action = "activate") {
    const result = await api.syncSubscriptionNetwork(selectedIspId, subscriptionId, action);
    setNotice(result.message || `Network sync ${action} completed.`);
    refresh();
  }

  async function onRedeemVoucher(e) {
    e.preventDefault();
    await api.redeemVoucher(voucherRedeemForm);
    setNotice("Voucher redeemed and access extended.");
    setVoucherRedeemForm({ code: "", customerId: "" });
    refresh();
  }

  async function onExportVouchers() {
    const payload = await api.exportVouchers(selectedIspId);
    const blob = new Blob([payload.content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = payload.filename || "vouchers.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function onPrintVouchers() {
    const printable = vouchers.filter((v) => v.status === "unused").slice(0, 24);
    if (printable.length === 0) {
      setError("No unused vouchers available for printing.");
      return;
    }
    const html = `
      <html>
      <head><title>Vouchers</title></head>
      <body style="font-family: Arial; padding: 16px; color: ${branding?.secondaryColor || "#162030"};">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
          ${branding?.logoUrl ? `<img src="${branding.logoUrl}" alt="logo" style="height:40px;" />` : ""}
          <h2 style="margin:0;color:${branding?.primaryColor || "#1565d8"};">${branding?.displayName || "ISP"} - Access Vouchers</h2>
        </div>
        ${printable
          .map(
            (v) => `
          <div style="border:1px solid ${branding?.primaryColor || "#1565d8"}; border-radius:8px; padding:12px; margin:8px 0;">
            <strong style="color:${branding?.primaryColor || "#1565d8"};">${v.code}</strong><br/>
            Bandwidth: ${v.rateLimit}<br/>
            Duration: ${v.durationDays} day(s)<br/>
            Expires: ${v.expiresAt ? new Date(v.expiresAt).toLocaleDateString() : "N/A"}
          </div>
        `
          )
          .join("")}
        <p style="margin-top:16px;">${branding?.invoiceFooter || ""}</p>
      </body>
      </html>
    `;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  }

  async function onChangePassword(e) {
    e.preventDefault();
    await api.changePassword(passwordForm);
    setPasswordForm({ currentPassword: "", newPassword: "" });
    refresh();
  }

  async function onAcceptInvite(e) {
    e.preventDefault();
    await api.acceptInvite(inviteAcceptForm);
    setInviteAcceptForm({ token: "", fullName: "", password: "" });
    setError("Invite accepted. You can now login.");
    window.history.replaceState({}, "", window.location.pathname);
  }

  if (!user) {
    return (
      <main className="container">
        <h1>{tenantContext?.displayName || "Multi-ISP Billing System"}</h1>
        {error && <p className="error">{error}</p>}
        <form className="panel" onSubmit={onLogin}>
          <h2>Login</h2>
          <input
            placeholder="Email"
            value={loginForm.email}
            onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
          />
          <input
            placeholder="Password"
            type="password"
            value={loginForm.password}
            onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
          />
          <button type="submit">Login</button>
          <p>Default admin: admin@isp.local / admin123</p>
        </form>
        <form className="panel" onSubmit={onAcceptInvite}>
          <h2>Accept Invite</h2>
          <input
            placeholder="Invite token"
            value={inviteAcceptForm.token}
            onChange={(e) => setInviteAcceptForm({ ...inviteAcceptForm, token: e.target.value })}
          />
          <input
            placeholder="Full name (optional)"
            value={inviteAcceptForm.fullName}
            onChange={(e) => setInviteAcceptForm({ ...inviteAcceptForm, fullName: e.target.value })}
          />
          <input
            placeholder="New password"
            type="password"
            value={inviteAcceptForm.password}
            onChange={(e) => setInviteAcceptForm({ ...inviteAcceptForm, password: e.target.value })}
          />
          <button type="submit">Accept invite</button>
        </form>
      </main>
    );
  }

  if (user.mustChangePassword) {
    return (
      <main className="container">
        <h1>Password Update Required</h1>
        {error && <p className="error">{error}</p>}
        <form className="panel" onSubmit={onChangePassword}>
          <h2>Change Password</h2>
          <input
            type="password"
            placeholder="Current password"
            value={passwordForm.currentPassword}
            onChange={(e) =>
              setPasswordForm({ ...passwordForm, currentPassword: e.target.value })
            }
          />
          <input
            type="password"
            placeholder="New password"
            value={passwordForm.newPassword}
            onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
          />
          <button type="submit">Update password</button>
        </form>
      </main>
    );
  }

  return (
    <main className="container">
      <h1>
        {branding?.displayName || tenantContext?.displayName || "Multi-ISP Billing System (Centipid Style)"}
      </h1>
      <p>
        Logged in as {user.fullName} ({user.role}) <button onClick={onLogout}>Logout</button>
      </p>
      {loading && <p>Loading...</p>}
      {error && <p className="error">{error}</p>}
      {notice && <p>{notice}</p>}

      <section className="grid metrics">
        <Card title="ISPs" value={superDashboard?.totalIsps ?? 0} />
        <Card title="All Customers" value={superDashboard?.totalCustomers ?? 0} />
        <Card
          title="All Active Subscriptions"
          value={superDashboard?.totalActiveSubscriptions ?? 0}
        />
        <Card title="Global Revenue (USD)" value={superDashboard?.totalRevenueUsd ?? 0} />
      </section>

      <section className="grid metrics">
        <Card title="Hotspot Users" value={networkStats?.hotspotUsers ?? 0} />
        <Card title="PPPoE Users" value={networkStats?.pppoeUsers ?? 0} />
        <Card title="Connected Devices" value={networkStats?.connectedDevices ?? 0} />
        <Card title="Bandwidth (GB)" value={networkStats?.bandwidthTotalGb ?? 0} />
        <Card title="Revenue In Period (USD)" value={networkStats?.revenueCollectedUsd ?? 0} />
      </section>

      <section className="panel">
        <h2>Statistics Period</h2>
        <form onSubmit={onRefreshStats}>
          <input
            type="date"
            value={statsPeriod.from}
            onChange={(e) => setStatsPeriod({ ...statsPeriod, from: e.target.value })}
          />
          <input
            type="date"
            value={statsPeriod.to}
            onChange={(e) => setStatsPeriod({ ...statsPeriod, to: e.target.value })}
          />
          <button type="submit" disabled={!selectedIspId}>
            Refresh stats
          </button>
        </form>
      </section>

      <section className="grid">
        {user.role === "super_admin" && (
          <form className="panel" onSubmit={onCreateIsp}>
            <h2>Create ISP Tenant</h2>
            <input
              placeholder="ISP name"
              value={ispForm.name}
              onChange={(e) => setIspForm({ ...ispForm, name: e.target.value })}
            />
            <input
              placeholder="Location"
              value={ispForm.location}
              onChange={(e) => setIspForm({ ...ispForm, location: e.target.value })}
            />
            <input
              placeholder="Contact phone"
              value={ispForm.contactPhone}
              onChange={(e) => setIspForm({ ...ispForm, contactPhone: e.target.value })}
            />
            <button type="submit">Create ISP</button>
          </form>
        )}

        <section className="panel">
          <h2>Active ISP Workspace</h2>
          <select
            value={selectedIspId}
            onChange={(e) => refresh(e.target.value)}
            disabled={user.role !== "super_admin" || Boolean(tenantContext?.ispId)}
          >
            <option value="">Select ISP</option>
            {isps.map((isp) => (
              <option key={isp.id} value={isp.id}>
                {isp.name} ({isp.location})
              </option>
            ))}
          </select>
        </section>
      </section>

      <section className="grid">
        {(user.role === "super_admin" || user.role === "company_manager" || user.role === "isp_admin") && (
          <form className="panel" onSubmit={onSaveBranding}>
            <h2>Tenant Branding / White-label</h2>
            <input
              placeholder="Display name"
              value={brandingForm.displayName}
              onChange={(e) => setBrandingForm({ ...brandingForm, displayName: e.target.value })}
            />
            <input
              placeholder="Subdomain (ex: admin1.yourdomain.com)"
              value={brandingForm.subdomain}
              onChange={(e) => setBrandingForm({ ...brandingForm, subdomain: e.target.value })}
            />
            <input
              placeholder="Custom domain (optional)"
              value={brandingForm.customDomain}
              onChange={(e) => setBrandingForm({ ...brandingForm, customDomain: e.target.value })}
            />
            <input
              placeholder="Logo URL"
              value={brandingForm.logoUrl}
              onChange={(e) => setBrandingForm({ ...brandingForm, logoUrl: e.target.value })}
            />
            <input
              placeholder="Primary color (#hex)"
              value={brandingForm.primaryColor}
              onChange={(e) => setBrandingForm({ ...brandingForm, primaryColor: e.target.value })}
            />
            <input
              placeholder="Secondary color (#hex)"
              value={brandingForm.secondaryColor}
              onChange={(e) =>
                setBrandingForm({ ...brandingForm, secondaryColor: e.target.value })
              }
            />
            <input
              placeholder="Invoice footer"
              value={brandingForm.invoiceFooter}
              onChange={(e) => setBrandingForm({ ...brandingForm, invoiceFooter: e.target.value })}
            />
            <input
              placeholder="Address"
              value={brandingForm.address}
              onChange={(e) => setBrandingForm({ ...brandingForm, address: e.target.value })}
            />
            <input
              placeholder="Contact email"
              value={brandingForm.contactEmail}
              onChange={(e) => setBrandingForm({ ...brandingForm, contactEmail: e.target.value })}
            />
            <input
              placeholder="Contact phone"
              value={brandingForm.contactPhone}
              onChange={(e) => setBrandingForm({ ...brandingForm, contactPhone: e.target.value })}
            />
            <button type="submit" disabled={!selectedIspId}>
              Save branding
            </button>
          </form>
        )}
      </section>

      <section className="grid">
        {(user.role === "super_admin" || user.role === "company_manager" || user.role === "isp_admin") && (
          <form className="panel" onSubmit={onCreatePaymentMethod}>
            <h2>ISP Payment Methods</h2>
            <select
              value={paymentMethodForm.methodType}
              onChange={(e) =>
                setPaymentMethodForm({ ...paymentMethodForm, methodType: e.target.value })
              }
            >
              <option value="cash">cash</option>
              <option value="pawapay">pawapay</option>
              <option value="bank_transfer">bank_transfer</option>
              <option value="crypto_wallet">crypto_wallet</option>
              <option value="other">other</option>
            </select>
            <input
              placeholder="Provider name"
              value={paymentMethodForm.providerName}
              onChange={(e) =>
                setPaymentMethodForm({ ...paymentMethodForm, providerName: e.target.value })
              }
            />
            <input
              placeholder='Config JSON (ex: {"apiKey":"xxx"})'
              value={paymentMethodForm.configText}
              onChange={(e) =>
                setPaymentMethodForm({ ...paymentMethodForm, configText: e.target.value })
              }
            />
            <button type="submit" disabled={!selectedIspId}>
              Add payment method
            </button>
            {paymentMethods.map((pm) => (
              <p key={pm.id}>
                {pm.methodType} - {pm.providerName} [{pm.isActive ? "active" : "inactive"}]{" "}
                <button onClick={() => onTogglePaymentMethod(pm.id, !pm.isActive)}>
                  {pm.isActive ? "Disable" : "Enable"}
                </button>
              </p>
            ))}
          </form>
        )}

        {(user.role === "super_admin" || user.role === "company_manager") && (
          <form className="panel" onSubmit={onUpsertRoleProfile}>
            <h2>Accreditation Profiles</h2>
            <input
              placeholder="Role key (ex: field_agent)"
              value={roleProfileForm.roleKey}
              onChange={(e) => setRoleProfileForm({ ...roleProfileForm, roleKey: e.target.value })}
            />
            <select
              value={roleProfileForm.accreditationLevel}
              onChange={(e) =>
                setRoleProfileForm({ ...roleProfileForm, accreditationLevel: e.target.value })
              }
            >
              <option value="basic">basic</option>
              <option value="standard">standard</option>
              <option value="senior">senior</option>
              <option value="manager">manager</option>
            </select>
            <input
              placeholder='Permissions JSON (ex: ["collect_payment","install_cpe"])'
              value={roleProfileForm.permissionsText}
              onChange={(e) =>
                setRoleProfileForm({ ...roleProfileForm, permissionsText: e.target.value })
              }
            />
            <button type="submit" disabled={!selectedIspId}>
              Save role profile
            </button>
            {roleProfiles.map((profile) => (
              <p key={profile.id}>
                {profile.roleKey} - {profile.accreditationLevel} -{" "}
                {Array.isArray(profile.permissions) ? profile.permissions.join(", ") : ""}
              </p>
            ))}
          </form>
        )}
      </section>

      <section className="grid">
        {(user.role === "super_admin" || user.role === "company_manager" || user.role === "isp_admin") && (
          <form className="panel" onSubmit={onCreateNetworkNode}>
            <h2>MikroTik Network Node</h2>
            <input
              placeholder="Node name"
              value={networkNodeForm.name}
              onChange={(e) => setNetworkNodeForm({ ...networkNodeForm, name: e.target.value })}
            />
            <input
              placeholder="Router host (IP or domain)"
              value={networkNodeForm.host}
              onChange={(e) => setNetworkNodeForm({ ...networkNodeForm, host: e.target.value })}
            />
            <input
              type="number"
              placeholder="API port"
              value={networkNodeForm.apiPort}
              onChange={(e) => setNetworkNodeForm({ ...networkNodeForm, apiPort: e.target.value })}
            />
            <input
              placeholder="Router username"
              value={networkNodeForm.username}
              onChange={(e) => setNetworkNodeForm({ ...networkNodeForm, username: e.target.value })}
            />
            <input
              type="password"
              placeholder="Router password"
              value={networkNodeForm.password}
              onChange={(e) => setNetworkNodeForm({ ...networkNodeForm, password: e.target.value })}
            />
            <input
              placeholder="Default PPPoE profile"
              value={networkNodeForm.defaultPppoeProfile}
              onChange={(e) =>
                setNetworkNodeForm({ ...networkNodeForm, defaultPppoeProfile: e.target.value })
              }
            />
            <input
              placeholder="Default hotspot profile"
              value={networkNodeForm.defaultHotspotProfile}
              onChange={(e) =>
                setNetworkNodeForm({ ...networkNodeForm, defaultHotspotProfile: e.target.value })
              }
            />
            <label>
              <input
                type="checkbox"
                checked={networkNodeForm.useTls}
                onChange={(e) => setNetworkNodeForm({ ...networkNodeForm, useTls: e.target.checked })}
              />{" "}
              Use TLS
            </label>
            <label>
              <input
                type="checkbox"
                checked={networkNodeForm.isDefault}
                onChange={(e) =>
                  setNetworkNodeForm({ ...networkNodeForm, isDefault: e.target.checked })
                }
              />{" "}
              Set as default node
            </label>
            <button type="submit" disabled={!selectedIspId}>
              Save node
            </button>
            {networkNodes.map((node) => (
              <p key={node.id}>
                {node.name} ({node.host}:{node.apiPort}) [{node.isActive ? "active" : "inactive"}]
                {node.isDefault ? " [default]" : ""}{" "}
                <button type="button" onClick={() => onToggleNetworkNode(node.id, !node.isActive)}>
                  {node.isActive ? "Disable" : "Enable"}
                </button>{" "}
                {!node.isDefault && (
                  <button type="button" onClick={() => onSetDefaultNetworkNode(node.id)}>
                    Set default
                  </button>
                )}
              </p>
            ))}
          </form>
        )}

        <section className="panel">
          <h2>Provisioning Events</h2>
          {provisioningEvents.slice(0, 12).map((event) => (
            <p key={event.id}>
              {new Date(event.createdAt).toLocaleString()} - {event.action} ({event.accessType || "n/a"}){" "}
              [{event.status}]
            </p>
          ))}
        </section>

        <section className="panel">
          <h2>FreeRADIUS Sync Events</h2>
          {radiusSyncEvents.slice(0, 12).map((event) => (
            <p key={event.id}>
              {new Date(event.createdAt).toLocaleString()} - {event.action} {event.username} [{event.status}]
            </p>
          ))}
        </section>
      </section>

      <section className="grid">
        {(user.role === "super_admin" || user.role === "company_manager" || user.role === "isp_admin") && (
          <form className="panel" onSubmit={onUpsertNotificationProvider}>
            <h2>Notification Providers</h2>
            <select
              value={notificationProviderForm.channel}
              onChange={(e) =>
                setNotificationProviderForm({ ...notificationProviderForm, channel: e.target.value })
              }
            >
              <option value="sms">sms</option>
              <option value="email">email</option>
              <option value="whatsapp">whatsapp</option>
            </select>
            <select
              value={notificationProviderForm.providerKey}
              onChange={(e) =>
                setNotificationProviderForm({
                  ...notificationProviderForm,
                  providerKey: e.target.value
                })
              }
            >
              <option value="webhook">webhook</option>
              <option value="twilio">twilio</option>
            </select>
            {notificationProviderForm.providerKey === "twilio" ? (
              <>
                <input
                  placeholder="Twilio Account SID"
                  value={notificationProviderForm.twilioAccountSid}
                  onChange={(e) =>
                    setNotificationProviderForm({
                      ...notificationProviderForm,
                      twilioAccountSid: e.target.value
                    })
                  }
                />
                <input
                  placeholder="Twilio Auth Token"
                  value={notificationProviderForm.twilioAuthToken}
                  onChange={(e) =>
                    setNotificationProviderForm({
                      ...notificationProviderForm,
                      twilioAuthToken: e.target.value
                    })
                  }
                />
                <input
                  placeholder="Twilio From Number (or whatsapp:+...)"
                  value={notificationProviderForm.twilioFrom}
                  onChange={(e) =>
                    setNotificationProviderForm({
                      ...notificationProviderForm,
                      twilioFrom: e.target.value
                    })
                  }
                />
                <input
                  placeholder="Messaging Service SID (optional)"
                  value={notificationProviderForm.twilioMessagingServiceSid}
                  onChange={(e) =>
                    setNotificationProviderForm({
                      ...notificationProviderForm,
                      twilioMessagingServiceSid: e.target.value
                    })
                  }
                />
              </>
            ) : (
              <>
                <input
                  placeholder="Webhook URL"
                  value={notificationProviderForm.webhookUrl}
                  onChange={(e) =>
                    setNotificationProviderForm({
                      ...notificationProviderForm,
                      webhookUrl: e.target.value
                    })
                  }
                />
                <input
                  placeholder="Auth header name (optional)"
                  value={notificationProviderForm.authHeaderName}
                  onChange={(e) =>
                    setNotificationProviderForm({
                      ...notificationProviderForm,
                      authHeaderName: e.target.value
                    })
                  }
                />
                <input
                  placeholder="Auth token (optional)"
                  value={notificationProviderForm.authToken}
                  onChange={(e) =>
                    setNotificationProviderForm({
                      ...notificationProviderForm,
                      authToken: e.target.value
                    })
                  }
                />
              </>
            )}
            <label>
              <input
                type="checkbox"
                checked={notificationProviderForm.isActive}
                onChange={(e) =>
                  setNotificationProviderForm({
                    ...notificationProviderForm,
                    isActive: e.target.checked
                  })
                }
              />{" "}
              Active
            </label>
            <button type="submit" disabled={!selectedIspId}>
              Save provider
            </button>
            {notificationProviders.map((provider) => (
              <p key={provider.id}>
                {provider.channel} - {provider.providerKey} [{provider.isActive ? "active" : "inactive"}]
              </p>
            ))}
          </form>
        )}
      </section>

      <section className="grid">
        <form className="panel" onSubmit={onSubmitTid}>
          <h2>Manual Mobile Money (TID)</h2>
          <select
            value={tidForm.invoiceId}
            onChange={(e) => setTidForm({ ...tidForm, invoiceId: e.target.value })}
          >
            <option value="">Select unpaid invoice</option>
            {invoices
              .filter((inv) => inv.status === "unpaid")
              .map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.id.slice(0, 8)} - ${inv.amountUsd}
                </option>
              ))}
          </select>
          <input
            placeholder="Transaction ID (TID)"
            value={tidForm.tid}
            onChange={(e) => setTidForm({ ...tidForm, tid: e.target.value })}
          />
          <input
            placeholder="Payer mobile number"
            value={tidForm.submittedByPhone}
            onChange={(e) => setTidForm({ ...tidForm, submittedByPhone: e.target.value })}
          />
          <input
            placeholder="Amount (optional)"
            value={tidForm.amountUsd}
            onChange={(e) => setTidForm({ ...tidForm, amountUsd: e.target.value })}
          />
          <button type="submit" disabled={!selectedIspId}>
            Submit TID
          </button>
        </form>

        <section className="panel">
          <h2>TID Verification Queue</h2>
          <button onClick={onQueueTidReminders} disabled={!selectedIspId}>
            Queue Pending TID Reminders
          </button>
          {tidSubmissions.map((row) => (
            <p key={row.id}>
              {row.tid} - {row.status} - invoice {row.invoiceId?.slice(0, 8)}{" "}
              {(user.role === "super_admin" ||
                user.role === "company_manager" ||
                user.role === "isp_admin" ||
                user.role === "billing_agent") &&
                row.status === "pending" && (
                  <>
                    <button onClick={() => onReviewTid(row.id, "approved")}>Approve</button>{" "}
                    <button onClick={() => onReviewTid(row.id, "rejected")}>Reject</button>
                  </>
                )}
            </p>
          ))}
          {tidConflicts.length > 0 && (
            <>
              <h3>Duplicate TID Conflicts</h3>
              {tidConflicts.map((c) => (
                <p key={c.tid}>
                  {c.tid} - {c.duplicates} submissions - {c.statuses?.join(", ")}
                </p>
              ))}
            </>
          )}
        </section>
      </section>

      <section className="grid">
        <form className="panel" onSubmit={onGenerateVouchers}>
          <h2>Generate Access Vouchers</h2>
          <select
            value={voucherForm.planId}
            onChange={(e) => setVoucherForm({ ...voucherForm, planId: e.target.value })}
          >
            <option value="">Select plan</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} ({plan.rateLimit}, {plan.durationDays} days)
              </option>
            ))}
          </select>
          <input
            type="number"
            min="1"
            max="100"
            value={voucherForm.quantity}
            onChange={(e) => setVoucherForm({ ...voucherForm, quantity: e.target.value })}
          />
          <button type="submit" disabled={!selectedIspId}>
            Generate vouchers
          </button>
          <button type="button" onClick={onPrintVouchers} disabled={!selectedIspId}>
            Print Unused Vouchers
          </button>
          <button type="button" onClick={onExportVouchers} disabled={!selectedIspId}>
            Export CSV
          </button>
        </form>

        <form className="panel" onSubmit={onRedeemVoucher}>
          <h2>Redeem Voucher</h2>
          <input
            placeholder="Voucher code"
            value={voucherRedeemForm.code}
            onChange={(e) => setVoucherRedeemForm({ ...voucherRedeemForm, code: e.target.value })}
          />
          <select
            value={voucherRedeemForm.customerId}
            onChange={(e) =>
              setVoucherRedeemForm({ ...voucherRedeemForm, customerId: e.target.value })
            }
          >
            <option value="">Select customer</option>
            {customers.map((cst) => (
              <option key={cst.id} value={cst.id}>
                {cst.fullName}
              </option>
            ))}
          </select>
          <button type="submit" disabled={!selectedIspId}>
            Redeem voucher
          </button>
          <h3>Latest Vouchers</h3>
          {vouchers.slice(0, 12).map((v) => (
            <p key={v.id}>
              {v.code} - {v.rateLimit} - {v.durationDays}d - {v.status}
            </p>
          ))}
        </form>
      </section>

      <section className="grid">
        <section className="panel">
          <h2>Platform Package (Your SaaS Billing)</h2>
          <form onSubmit={onCreatePlatformSubscription}>
            <select
              value={platformSubForm.packageId}
              onChange={(e) => setPlatformSubForm({ ...platformSubForm, packageId: e.target.value })}
            >
              <option value="">Select package</option>
              {platformPackages.map((pkg) => (
                <option key={pkg.id} value={pkg.id}>
                  {pkg.name} (${pkg.monthlyPriceUsd}/month)
                </option>
              ))}
            </select>
            <input
              type="number"
              value={platformSubForm.durationDays}
              onChange={(e) =>
                setPlatformSubForm({ ...platformSubForm, durationDays: e.target.value })
              }
            />
            <button type="submit" disabled={!selectedIspId || user.role !== "super_admin"}>
              Assign package
            </button>
          </form>
          {platformSubscriptions.map((sub) => (
            <p key={sub.id}>
              {sub.packageName} ({sub.status}) until {new Date(sub.endsAt).toLocaleDateString()}
            </p>
          ))}
        </section>
      </section>

      <section className="grid">
        {(user.role === "super_admin" || user.role === "company_manager" || user.role === "isp_admin") && (
          <form className="panel" onSubmit={onCreateUser}>
            <h2>Create Team User</h2>
            <input
              placeholder="Full name"
              value={userForm.fullName}
              onChange={(e) => setUserForm({ ...userForm, fullName: e.target.value })}
            />
            <input
              placeholder="Email"
              value={userForm.email}
              onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
            />
            <input
              placeholder="Temporary password"
              type="password"
              value={userForm.password}
              onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
            />
            <select
              value={userForm.role}
              onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
            >
              {user.role === "super_admin" && <option value="company_manager">company_manager</option>}
              <option value="isp_admin">isp_admin</option>
              <option value="billing_agent">billing_agent</option>
              <option value="noc_operator">noc_operator</option>
              <option value="field_agent">field_agent</option>
            </select>
            <select
              value={userForm.accreditationLevel}
              onChange={(e) =>
                setUserForm({ ...userForm, accreditationLevel: e.target.value })
              }
            >
              <option value="basic">basic</option>
              <option value="standard">standard</option>
              <option value="senior">senior</option>
              <option value="manager">manager</option>
            </select>
            <button type="submit" disabled={!selectedIspId}>
              Create user
            </button>
          </form>
        )}

        <section className="panel">
          <h2>ISP Team Users</h2>
          {generatedInvite && (
            <div>
              <p>
                Latest Invite Link: <code>{generatedInvite.inviteLink}</code>
              </p>
              <p>
                Token: <code>{generatedInvite.token}</code>
              </p>
              <p>Expires: {generatedInvite.expiresIn}</p>
            </div>
          )}
          {users.map((item) => (
            <p key={item.id}>
              {item.fullName} ({item.role}) - {item.email} [{item.isActive ? "active" : "inactive"}]{" "}
              {item.accreditationLevel ? `(${item.accreditationLevel})` : ""}{" "}
              {(user.role === "super_admin" || user.role === "company_manager" || user.role === "isp_admin") && (
                <>
                  <button onClick={() => onResetPassword(item.id)}>Reset Password</button>{" "}
                  <button onClick={() => onCreateInvite(item.id)}>Create Invite</button>{" "}
                  {item.isActive && (
                    <button onClick={() => onDeactivateUser(item.id)}>Deactivate</button>
                  )}
                  {!item.isActive && (
                    <button onClick={() => onReactivateUser(item.id)}>Reactivate</button>
                  )}
                </>
              )}
            </p>
          ))}
        </section>
      </section>

      <section className="panel">
        <h2>Recent Audit Logs</h2>
        {auditLogs.slice(0, 12).map((log) => (
          <p key={log.id}>
            {new Date(log.createdAt).toLocaleString()} - {log.action} ({log.entityType})
          </p>
        ))}
      </section>

      <section className="panel">
        <h2>Notification Outbox</h2>
        <p>
          Queued: {notificationOutbox.filter((row) => row.status === "queued").length} | Sent:{" "}
          {notificationOutbox.filter((row) => row.status === "sent").length} | Failed:{" "}
          {notificationOutbox.filter((row) => row.status === "failed").length}
        </p>
        <button onClick={onProcessNotificationOutbox} disabled={!selectedIspId}>
          Process Outbox Now
        </button>
        {notificationOutbox.slice(0, 12).map((row) => (
          <p key={row.id}>
            {new Date(row.createdAt).toLocaleString()} - {row.templateKey} via {row.channel} ({row.status})
            {row.lastError ? ` - ${row.lastError}` : ""}
          </p>
        ))}
      </section>

      <section className="panel">
        <h2>Send Test Notification</h2>
        <form onSubmit={onSendTestNotification}>
          <select
            value={notificationTestForm.channel}
            onChange={(e) =>
              setNotificationTestForm({ ...notificationTestForm, channel: e.target.value })
            }
          >
            <option value="sms">sms</option>
            <option value="email">email</option>
            <option value="whatsapp">whatsapp</option>
          </select>
          <input
            placeholder="Recipient (phone or email)"
            value={notificationTestForm.recipient}
            onChange={(e) =>
              setNotificationTestForm({ ...notificationTestForm, recipient: e.target.value })
            }
          />
          <input
            placeholder="Message"
            value={notificationTestForm.message}
            onChange={(e) =>
              setNotificationTestForm({ ...notificationTestForm, message: e.target.value })
            }
          />
          <button type="submit" disabled={!selectedIspId}>
            Send test
          </button>
        </form>
      </section>

      <section className="grid metrics">
        <Card title="Customers" value={dashboard?.totalCustomers ?? 0} />
        <Card title="Active Subscriptions" value={dashboard?.activeSubscriptions ?? 0} />
        <Card title="Unpaid Invoices" value={dashboard?.unpaidInvoices ?? 0} />
        <Card title="Revenue (USD)" value={dashboard?.revenueUsd ?? 0} />
      </section>

      <section className="grid">
        <form className="panel" onSubmit={onCreateCustomer}>
          <h2>Create Customer</h2>
          <input
            placeholder="Full name"
            value={customerForm.fullName}
            onChange={(e) => setCustomerForm({ ...customerForm, fullName: e.target.value })}
          />
          <input
            placeholder="Phone (+243...)"
            value={customerForm.phone}
            onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
          />
          <button type="submit" disabled={!selectedIspId}>
            Save customer
          </button>
        </form>

        <form className="panel" onSubmit={onCreatePlan}>
          <h2>Create Plan</h2>
          <input
            placeholder="Plan name"
            value={planForm.name}
            onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
          />
          <input
            type="number"
            placeholder="Price USD"
            value={planForm.priceUsd}
            onChange={(e) => setPlanForm({ ...planForm, priceUsd: e.target.value })}
          />
          <input
            type="number"
            placeholder="Duration days"
            value={planForm.durationDays}
            onChange={(e) => setPlanForm({ ...planForm, durationDays: e.target.value })}
          />
          <input
            placeholder="Rate limit (ex: 10M/10M)"
            value={planForm.rateLimit}
            onChange={(e) => setPlanForm({ ...planForm, rateLimit: e.target.value })}
          />
          <button type="submit" disabled={!selectedIspId}>
            Save plan
          </button>
        </form>

        <form className="panel" onSubmit={onCreateSubscription}>
          <h2>Create Subscription</h2>
          <select
            value={subForm.customerId}
            onChange={(e) => setSubForm({ ...subForm, customerId: e.target.value })}
          >
            <option value="">Select customer</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.fullName}
              </option>
            ))}
          </select>
          <select
            value={subForm.planId}
            onChange={(e) => setSubForm({ ...subForm, planId: e.target.value })}
          >
            <option value="">Select plan</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </select>
          <select
            value={subForm.accessType}
            onChange={(e) => setSubForm({ ...subForm, accessType: e.target.value })}
          >
            <option value="pppoe">PPPoE</option>
            <option value="hotspot">Hotspot</option>
          </select>
          <button type="submit" disabled={!selectedIspId}>
            Activate subscription
          </button>
        </form>
      </section>

      <section className="panel">
        <h2>Invoices</h2>
        <div className="table">
          <div className="row header">
            <span>ID</span>
            <span>Amount</span>
            <span>Status</span>
            <span>Action</span>
          </div>
          {invoices.map((invoice) => (
            <div className="row" key={invoice.id}>
              <span>{invoice.id.slice(0, 8)}</span>
              <span>${invoice.amountUsd}</span>
              <span>{invoice.status}</span>
              <span>
                {invoice.status === "unpaid" ? (
                  <button onClick={() => onMarkPaid(invoice.id, invoice.amountUsd)}>Mark paid</button>
                ) : (
                  "Paid"
                )}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Subscriptions</h2>
        {subscriptions.map((subscription) => (
          <p key={subscription.id}>
            {subscription.id.slice(0, 8)} - {subscription.status} ({subscription.accessType || "pppoe"}){" "}
            {subscription.status !== "suspended" ? (
              <button onClick={() => onSuspendSubscription(subscription.id)}>Suspend</button>
            ) : (
              <button onClick={() => onReactivateSubscription(subscription.id)}>Reactivate</button>
            )}{" "}
            <button onClick={() => onSyncSubscriptionNetwork(subscription.id, "activate")}>
              Sync Activate
            </button>{" "}
            <button onClick={() => onSyncSubscriptionNetwork(subscription.id, "suspend")}>
              Sync Suspend
            </button>
          </p>
        ))}
      </section>
    </main>
  );
}

function Card({ title, value }) {
  return (
    <article className="panel metric">
      <h3>{title}</h3>
      <p>{value}</p>
    </article>
  );
}

export default App;
