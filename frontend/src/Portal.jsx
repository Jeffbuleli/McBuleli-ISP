import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { API_URL, api, publicAssetUrl } from "./api";
import { mcbuleliLogoUrl } from "./brandAssets.js";
import { useReadOnlyUiLang } from "./uiLangSync.js";
import HomeShortcut from "./HomeShortcut.jsx";
import PwaInstallPrompt from "./PwaInstallPrompt.jsx";
import { applyWorkspacePwaManifest } from "./pwaWorkspaceManifest.js";
import { portalBrandTitle, portalInvoiceStatusLabel, portalT } from "./portalCopy.js";
import { sanitizeApiErrorForAudience } from "./httpErrorCopy.js";

const SUBSCRIBER_JWT_KEY = "subscriberJwt";
const DEFAULT_PAWAPAY_NETWORKS = [
  { key: "orange", label: "Orange Money" },
  { key: "airtel", label: "Airtel Money" },
  { key: "mpesa", label: "M-Pesa (Vodacom)" }
];

function money(value, currency = "USD", lang = "fr") {
  return Number(value || 0).toLocaleString(lang === "en" ? "en-GB" : "fr-FR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  });
}

function daysUntil(dateValue) {
  const t = new Date(dateValue).getTime();
  if (!Number.isFinite(t)) return "—";
  return Math.max(0, Math.ceil((t - Date.now()) / 86400000));
}

function formatPortalClientRef(customerId, prefix) {
  const p = prefix != null ? String(prefix).trim() : "";
  const compact = String(customerId || "").replace(/-/g, "");
  const core = (compact.slice(-10) || compact).toUpperCase();
  return `${p}${core}`;
}

function hasPortalIspContact(b) {
  if (!b) return false;
  const phone = b.contactPhone != null ? String(b.contactPhone).trim() : "";
  const email = b.contactEmail != null ? String(b.contactEmail).trim() : "";
  const addr = b.address != null ? String(b.address).trim() : "";
  return Boolean(phone || email || addr);
}

async function portalFetch(path, auth, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  if (auth?.type === "subscriber" && auth.jwt) {
    headers.Authorization = `Bearer ${auth.jwt}`;
  } else if (auth?.type === "opaque" && auth.token) {
    headers["X-Portal-Token"] = auth.token;
  }
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Request failed");
  }
  return response.json();
}

export default function Portal() {
  const initialOpaque = useMemo(() => {
    const q = new URLSearchParams(window.location.search).get("token");
    return q ? q.trim() : "";
  }, []);

  const [auth, setAuth] = useState(() => {
    if (initialOpaque && initialOpaque.length >= 16) {
      return { type: "opaque", token: initialOpaque };
    }
    const sj = typeof localStorage !== "undefined" ? localStorage.getItem(SUBSCRIBER_JWT_KEY) : "";
    if (sj) return { type: "subscriber", jwt: sj };
    return null;
  });

  const [tokenInput, setTokenInput] = useState(initialOpaque);
  const [ispIdInput, setIspIdInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [setupTokenInput, setSetupTokenInput] = useState("");
  const [setupPasswordInput, setSetupPasswordInput] = useState("");
  const [session, setSession] = useState(null);
  const [portalAnnouncements, setPortalAnnouncements] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tidForm, setTidForm] = useState({ invoiceId: "", tid: "", submittedByPhone: "", amountUsd: "" });
  const [networks, setNetworks] = useState(DEFAULT_PAWAPAY_NETWORKS);
  const [mobilePayForm, setMobilePayForm] = useState({
    invoiceId: "",
    currency: "CDF",
    phoneNumber: "",
    networkKey: "orange"
  });
  const [mobilePaySession, setMobilePaySession] = useState(null);
  const uiLang = useReadOnlyUiLang();
  const t = useCallback((key) => portalT(uiLang, key), [uiLang]);
  const isEnPortal = uiLang === "en";
  const portalErr = useCallback(
    (raw) => sanitizeApiErrorForAudience(String(raw ?? ""), null, isEnPortal),
    [isEnPortal]
  );

  const loadSession = useCallback(
    async (a) => {
      setError("");
      setNotice("");
      if (!a || (a.type === "opaque" && (!a.token || a.token.length < 16))) {
        setSession(null);
        setPortalAnnouncements([]);
        setError(portalT(uiLang, "errBootstrap"));
        return;
      }
      if (a.type === "subscriber" && !a.jwt) {
        setSession(null);
        setPortalAnnouncements([]);
        setError(portalT(uiLang, "errNoSession"));
        return;
      }
      const data = await portalFetch("/portal/session", a);
      setSession(data);
      let pa = [];
      try {
        const ann = await portalFetch("/portal/announcements", a);
        pa = ann.items || [];
      } catch {
        pa = [];
      }
      setPortalAnnouncements(pa);
      if (a.type === "opaque" && a.token) {
        const url = new URL(window.location.href);
        url.searchParams.set("token", a.token);
        window.history.replaceState({}, "", url.toString());
      }
    },
    [uiLang]
  );

  useEffect(() => {
    if (!auth) return;
    if (auth.type === "opaque" && auth.token.length < 16) return;
    if (auth.type === "subscriber" && !auth.jwt) return;
    loadSession(auth).catch((e) => {
      setPortalAnnouncements([]);
      setError(portalErr(e.message));
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- bootstrap from URL or stored subscriber JWT

  useEffect(() => {
    api.getPawapayNetworks().then((rows) => {
      if (Array.isArray(rows) && rows.length > 0) setNetworks(rows);
    }).catch(() => {});
  }, []);

  useLayoutEffect(() => {
    if (!import.meta.env.PROD) return;
    if (!session) {
      const link = document.querySelector('link[rel="manifest"]');
      if (link) link.href = "/api/public/pwa-manifest";
      return;
    }
    const d = session.branding?.displayName;
    const title = d != null ? String(d).trim() : "";
    applyWorkspacePwaManifest(title && title !== "AA" ? title : "");
  }, [session]);

  async function onOpenPortal(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    try {
      const trimmedToken = tokenInput.trim();
      localStorage.removeItem(SUBSCRIBER_JWT_KEY);
      const next = trimmedToken.length >= 16 ? { type: "opaque", token: trimmedToken } : null;
      setAuth(next);
      if (!next) {
        setSession(null);
        setError(t("errTokenShort"));
        return;
      }
      await loadSession(next);
    } catch (err) {
      setError(portalErr(err.message));
      setSession(null);
    }
  }

  async function onSubscriberLogin(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    try {
      const res = await api.subscriberLogin({
        ispId: ispIdInput.trim(),
        phone: phoneInput,
        password: passwordInput
      });
      localStorage.setItem(SUBSCRIBER_JWT_KEY, res.token);
      const next = { type: "subscriber", jwt: res.token };
      setAuth(next);
      setPasswordInput("");
      await loadSession(next);
      if (res.mustSetPassword) {
        setNotice(t("noticeMustPwd"));
      }
    } catch (err) {
      setError(portalErr(err.message));
      setSession(null);
    }
  }

  async function onSetupPassword(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    try {
      const res = await api.subscriberSetupPassword({
        setupToken: setupTokenInput.trim(),
        newPassword: setupPasswordInput
      });
      localStorage.setItem(SUBSCRIBER_JWT_KEY, res.token);
      const next = { type: "subscriber", jwt: res.token };
      setAuth(next);
      setSetupTokenInput("");
      setSetupPasswordInput("");
      setNotice(t("noticePwdSaved"));
      await loadSession(next);
    } catch (err) {
      setError(portalErr(err.message));
    }
  }

  async function onSubmitTid(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!auth) {
      setError(t("errNeedLogin"));
      return;
    }
    try {
      await portalFetch("/portal/tid-submissions", auth, {
        method: "POST",
        body: JSON.stringify({
          invoiceId: tidForm.invoiceId,
          tid: tidForm.tid,
          submittedByPhone: tidForm.submittedByPhone || undefined,
          amountUsd: tidForm.amountUsd || undefined
        })
      });
      setNotice(t("noticeTidSent"));
      setTidForm({ invoiceId: "", tid: "", submittedByPhone: "", amountUsd: "" });
      await loadSession(auth);
    } catch (err) {
      setError(portalErr(err.message));
    }
  }

  async function onStartMobileMoneyPayment(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!auth) return setError(t("errNeedLogin"));
    try {
      const res = await portalFetch("/portal/mobile-money/initiate", auth, {
        method: "POST",
        body: JSON.stringify(mobilePayForm)
      });
      setMobilePaySession(res);
      setNotice(res.message || t("noticeMobileSent"));
    } catch (err) {
      setError(portalErr(err.message || t("errMobileStart")));
    }
  }

  async function onCheckMobileMoneyPayment() {
    setError("");
    setNotice("");
    if (!auth || !mobilePaySession?.depositId) return;
    try {
      const res = await portalFetch(`/portal/mobile-money/status/${encodeURIComponent(mobilePaySession.depositId)}`, auth);
      setNotice(`${t("paymentStatus")}: ${res.status}`);
      if (res.status === "completed") {
        setMobilePaySession(null);
        setMobilePayForm({ invoiceId: "", currency: "CDF", phoneNumber: "", networkKey: "orange" });
        await loadSession(auth);
      }
    } catch (err) {
      setError(portalErr(err.message || t("errMobileCheck")));
    }
  }

  function onSignOut() {
    localStorage.removeItem(SUBSCRIBER_JWT_KEY);
    setAuth(null);
    setSession(null);
    setTokenInput("");
    const url = new URL(window.location.href);
    url.searchParams.delete("token");
    window.history.replaceState({}, "", url.toString());
  }

  const brand = session?.branding;
  const portalLogoSrc =
    brand?.logoUrl != null && String(brand.logoUrl).trim()
      ? publicAssetUrl(brand.logoUrl)
      : mcbuleliLogoUrl;

  const portalPwaSubscriberReady = Boolean(session);
  const portalWorkspaceLabel = (() => {
    const d = brand?.displayName;
    const s = d != null ? String(d).trim() : "";
    if (!s || s === "AA") return "";
    return s;
  })();

  return (
    <>
    <main
      className="container portal-page portal-page--dark"
      style={{
        color: brand?.secondaryColor || "#162030"
      }}
    >
      <header className="portal-hero">
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              className="isp-enduser-brand-head__logo-wrap"
              style={{ borderColor: brand?.primaryColor || "#43a047" }}
            >
              <img
                className="portal-hero-logo"
                src={portalLogoSrc}
                alt={
                  brand?.displayName != null && String(brand.displayName).trim()
                    ? String(brand.displayName).trim()
                    : portalT(uiLang, "brandFallbackTitle")
                }
                width={40}
                height={40}
                style={{ width: 40, height: 40, objectFit: "contain" }}
              />
            </div>
            <div>
              <p className="eyebrow">{t("eyebrow")}</p>
              <h1 style={{ color: brand?.primaryColor || "#5d4037", margin: 0 }}>
                {portalBrandTitle(brand?.displayName, uiLang)}
              </h1>
            </div>
          </div>
          <div className="portal-hero-toolbar portal-hero-toolbar--end">
            <HomeShortcut title={t("homeShortcut")} idPrefix="portal" />
          </div>
        </div>
        <p>{t("heroLead")}</p>
        {portalAnnouncements.length > 0 ? (
          <section className="portal-announcements" aria-label={t("announcementsTitle")}>
            <h2 className="portal-announcements__title">{t("announcementsTitle")}</h2>
            <div className="portal-announcements__grid">
              {portalAnnouncements.slice(0, 5).map((a) => (
                <article key={a.id} className="portal-announcement-card">
                  <h3 className="portal-announcement-card__title">{a.title}</h3>
                  <div
                    className="portal-announcement-card__body"
                    dangerouslySetInnerHTML={{ __html: a.bodyHtml || "" }}
                  />
                </article>
              ))}
            </div>
          </section>
        ) : null}
        {session && brand && hasPortalIspContact(brand) ? (
          <aside className="portal-isp-contact" aria-label={t("contactTitle")}>
            <p className="portal-isp-contact__title">{t("contactTitle")}</p>
            <ul className="portal-isp-contact__list">
              {brand.contactPhone ? (
                <li>
                  <span className="portal-isp-contact__label">{t("contactPhone")}</span>{" "}
                  <a href={`tel:${String(brand.contactPhone).replace(/\s+/g, "")}`}>{brand.contactPhone}</a>
                </li>
              ) : null}
              {brand.contactEmail ? (
                <li>
                  <span className="portal-isp-contact__label">{t("contactEmail")}</span>{" "}
                  <a href={`mailto:${brand.contactEmail}`}>{brand.contactEmail}</a>
                </li>
              ) : null}
              {brand.address ? (
                <li>
                  <span className="portal-isp-contact__label">{t("contactAddress")}</span> {brand.address}
                </li>
              ) : null}
            </ul>
          </aside>
        ) : null}
      </header>

      {!session && (
        <section className="portal-login-grid">
          <form className="panel" onSubmit={onSubscriberLogin}>
            <h2>{t("loginPhoneTitle")}</h2>
            <p>{t("loginPhoneHelp")}</p>
            <input
              placeholder={t("ispPlaceholder")}
              value={ispIdInput}
              onChange={(e) => setIspIdInput(e.target.value)}
              style={{ width: "100%", maxWidth: 560 }}
            />
            <input
              placeholder={t("phonePlaceholder")}
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              style={{ width: "100%", maxWidth: 560 }}
            />
            <input
              type="password"
              placeholder={t("passwordPlaceholder")}
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              style={{ width: "100%", maxWidth: 560 }}
            />
            <button type="submit">{t("signIn")}</button>
          </form>

          <form className="panel" onSubmit={onSetupPassword}>
            <h2>{t("firstSetupTitle")}</h2>
            <p>{t("firstSetupHelp")}</p>
            <input
              placeholder={t("setupTokenPh")}
              value={setupTokenInput}
              onChange={(e) => setSetupTokenInput(e.target.value)}
              style={{ width: "100%", maxWidth: 560 }}
            />
            <input
              type="password"
              placeholder={t("newPasswordPh")}
              value={setupPasswordInput}
              onChange={(e) => setSetupPasswordInput(e.target.value)}
              style={{ width: "100%", maxWidth: 560 }}
            />
            <button type="submit">{t("savePasswordSignIn")}</button>
          </form>

          <form className="panel" onSubmit={onOpenPortal}>
            <h2>{t("linkTitle")}</h2>
            <p>{t("linkHelp")}</p>
            <input
              placeholder={t("tokenPh")}
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              style={{ width: "100%", maxWidth: 560 }}
            />
            <button type="submit">{t("openWithToken")}</button>
          </form>
        </section>
      )}

      {session && (
        <p style={{ marginBottom: 12 }}>
          <button type="button" onClick={onSignOut}>
            {t("signOut")}
          </button>
        </p>
      )}

      {error && <p className="error">{error}</p>}
      {notice && <p>{notice}</p>}

      {session && (
        <>
          <section className="public-section public-section--split">
            <div>
              <p className="eyebrow">{t("subscriberSpace")}</p>
              <h2>
                {t("hello")}, {session.customer.fullName}
              </h2>
              <p>
                {t("phoneRegistered")} : {session.customer.phone}
              </p>
              {session.customer.email ? (
                <p>
                  {t("emailRegistered")} : {session.customer.email}
                </p>
              ) : null}
              <p className="portal-client-ref">
                {t("clientRef")} :{" "}
                {formatPortalClientRef(session.customer.id, brand?.portalClientRefPrefix)}
              </p>
            </div>
            <div className="demo-board">
              <div className="demo-board-row">
                <span>{t("subscriptions")}</span>
                <b>{session.subscriptions.length}</b>
              </div>
              <div className="demo-board-row">
                <span>{t("invoices")}</span>
                <b>{session.invoices.length}</b>
              </div>
            </div>
          </section>

          <section className="portal-login-grid">
            <div className="panel">
              <h2>{t("subscriptions")}</h2>
              {session.subscriptions.length === 0 ? (
                <p>{t("noSubscriptions")}</p>
              ) : (
                session.subscriptions.map((s) => (
                  <p key={s.id}>
                    {s.id.slice(0, 8)} — {s.status} ({s.accessType}) {t("until")}{" "}
                    {new Date(s.endDate).toLocaleDateString(uiLang === "en" ? "en-GB" : "fr-FR")}
                    {s.maxSimultaneousDevices != null
                      ? ` — ${t("devicesUpTo")} ${s.maxSimultaneousDevices} ${t("devicesSuffix")}`
                      : ""}
                  </p>
                ))
              )}
            </div>

            <div className="panel">
              <h2>{t("invoices")}</h2>
              {session.invoices.length === 0 ? (
                <p>{t("noInvoices")}</p>
              ) : (
                session.invoices.map((inv) => (
                  <p key={inv.id}>
                    {inv.id.slice(0, 8)} — {money(inv.amountUsd, "USD", uiLang)} —{" "}
                    {portalInvoiceStatusLabel(uiLang, inv.status)} — {t("due")}{" "}
                    {new Date(inv.dueDate).toLocaleDateString(uiLang === "en" ? "en-GB" : "fr-FR")}
                  </p>
                ))
              )}
            </div>
          </section>

          <form className="panel" onSubmit={onStartMobileMoneyPayment}>
            <h2>{t("payMobileTitle")}</h2>
            <select
              value={mobilePayForm.invoiceId}
              onChange={(e) => setMobilePayForm({ ...mobilePayForm, invoiceId: e.target.value })}
            >
              <option value="">{t("chooseOpenInvoice")}</option>
              {session.invoices
                .filter((inv) => inv.status === "unpaid" || inv.status === "overdue")
                .map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.id.slice(0, 8)} — {inv.amountUsd}&nbsp;$ ({portalInvoiceStatusLabel(uiLang, inv.status)})
                  </option>
                ))}
            </select>
            <select
              value={mobilePayForm.currency}
              onChange={(e) => setMobilePayForm({ ...mobilePayForm, currency: e.target.value })}
            >
              <option value="CDF">{t("currencyCdf")}</option>
              <option value="USD">{t("currencyUsd")}</option>
            </select>
            <input
              placeholder={t("payerPhonePh")}
              value={mobilePayForm.phoneNumber}
              onChange={(e) => setMobilePayForm({ ...mobilePayForm, phoneNumber: e.target.value })}
            />
            <select
              value={mobilePayForm.networkKey}
              onChange={(e) => setMobilePayForm({ ...mobilePayForm, networkKey: e.target.value })}
            >
              {networks.map((network) => (
                <option key={network.key} value={network.key}>
                  {network.label}
                </option>
              ))}
            </select>
            <button type="submit" disabled={!mobilePayForm.invoiceId || !mobilePayForm.phoneNumber}>
              {t("payInvoiceBtn")}
            </button>
            {mobilePaySession?.depositId ? (
              <p>
                {t("depositRef")}: <code>{mobilePaySession.depositId}</code>{" "}
                <button type="button" onClick={onCheckMobileMoneyPayment}>
                  {t("checkPayment")}
                </button>
              </p>
            ) : null}
          </form>

          <form className="panel" onSubmit={onSubmitTid}>
            <h2>{t("tidTitle")}</h2>
            <select
              value={tidForm.invoiceId}
              onChange={(e) => setTidForm({ ...tidForm, invoiceId: e.target.value })}
            >
              <option value="">{t("chooseOpenInvoice")}</option>
              {session.invoices
                .filter((inv) => inv.status === "unpaid" || inv.status === "overdue")
                .map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.id.slice(0, 8)} — {inv.amountUsd}&nbsp;$ ({portalInvoiceStatusLabel(uiLang, inv.status)})
                  </option>
                ))}
            </select>
            <input
              placeholder={t("tidPh")}
              value={tidForm.tid}
              onChange={(e) => setTidForm({ ...tidForm, tid: e.target.value })}
            />
            <input
              placeholder={t("yourPhoneOpt")}
              value={tidForm.submittedByPhone}
              onChange={(e) => setTidForm({ ...tidForm, submittedByPhone: e.target.value })}
            />
            <input
              placeholder={t("amountUsdOpt")}
              value={tidForm.amountUsd}
              onChange={(e) => setTidForm({ ...tidForm, amountUsd: e.target.value })}
            />
            <button type="submit" disabled={!tidForm.invoiceId || !tidForm.tid}>
              {t("sendTid")}
            </button>
          </form>
        </>
      )}
      {brand?.portalFooterText ? (
        <footer className="portal-tenant-footer">{brand.portalFooterText}</footer>
      ) : null}
      <footer className="mcbuleli-site-footer">
        <img src={mcbuleliLogoUrl} alt="" width={28} height={28} className="mcbuleli-site-footer__logo" />
        <p className="mcbuleli-site-powered">{t("mcbuleliFooter")}</p>
      </footer>
    </main>
    <PwaInstallPrompt enabled={portalPwaSubscriberReady} workspaceLabel={portalWorkspaceLabel} isEn={uiLang === "en"} />
    </>
  );
}
