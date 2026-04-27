import { useCallback, useEffect, useMemo, useState } from "react";
import { API_URL, publicRequest } from "./api";
import { mcbuleliLogoUrl } from "./brandAssets.js";
import LangSwitch from "./LangSwitch.jsx";
import { IconAntenna, IconWallet, IconZap } from "./icons.jsx";
import { wifiT } from "./wifiCopy.js";

function getStoredUiLang() {
  if (typeof window === "undefined") return "fr";
  return window.localStorage.getItem("ui_lang") === "en" ? "en" : "fr";
}

function wifiDisplayName(name, lang) {
  const s = name != null ? String(name).trim() : "";
  if (!s || s === "AA") return lang === "en" ? "Guest Wi‑Fi catalog" : "Catalogue Wi‑Fi invité";
  return s;
}

function wifiEyebrowText(branding, lang, t) {
  const base = t("eyebrow");
  const n = branding?.displayName != null ? String(branding.displayName).trim() : "";
  if (n && n !== "AA") return `${base} — ${n}`;
  return base;
}

function hasIspContact(b) {
  if (!b) return false;
  const phone = b.contactPhone != null ? String(b.contactPhone).trim() : "";
  const email = b.contactEmail != null ? String(b.contactEmail).trim() : "";
  const addr = b.address != null ? String(b.address).trim() : "";
  return Boolean(phone || email || addr);
}

export default function WifiPortal() {
  const ispIdFromQuery = useMemo(() => {
    const q = new URLSearchParams(window.location.search).get("ispId");
    return q ? q.trim() : "";
  }, []);

  const [ispIdInput, setIspIdInput] = useState(ispIdFromQuery);
  const [activeIspId, setActiveIspId] = useState(ispIdFromQuery);
  const [branding, setBranding] = useState(null);
  const [plans, setPlans] = useState([]);
  const [networks, setNetworks] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [checkout, setCheckout] = useState({
    phone: "",
    networkKey: "orange"
  });
  const [depositId, setDepositId] = useState(null);
  const [redirectUrl, setRedirectUrl] = useState(null);
  const [polling, setPolling] = useState(false);
  const [postPaySetup, setPostPaySetup] = useState(null);
  const [uiLang, setUiLang] = useState(getStoredUiLang);
  const t = (key) => wifiT(uiLang, key);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("ui_lang", uiLang);
    }
  }, [uiLang]);

  const loadCatalog = useCallback(async (isp) => {
    setError("");
    const [p, n] = await Promise.all([
      publicRequest(`/public/wifi-plans?ispId=${encodeURIComponent(isp)}`),
      publicRequest("/public/wifi-networks")
    ]);
    setBranding(p.branding || {});
    setPlans(p.plans || []);
    setNetworks(n || []);
    setActiveIspId(isp);
    const url = new URL(window.location.href);
    url.searchParams.set("ispId", isp);
    window.history.replaceState({}, "", url.toString());
  }, []);

  useEffect(() => {
    publicRequest("/public/wifi-networks")
      .then(setNetworks)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!ispIdFromQuery) return;
    loadCatalog(ispIdFromQuery).catch((e) => setError(e.message));
  }, [ispIdFromQuery, loadCatalog]);

  async function onOpenCatalog(e) {
    e.preventDefault();
    try {
      await loadCatalog(ispIdInput.trim());
    } catch (err) {
      setError(err.message);
    }
  }

  async function onStartPayment(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!selectedPlan || !activeIspId) return;
    const phone = checkout.phone.replace(/\s+/g, "").replace(/^\+/, "");
    if (phone.length < 9) {
      setError(t("errPhone"));
      return;
    }
    try {
      const res = await publicRequest("/public/wifi-purchase/initiate", {
        method: "POST",
        body: JSON.stringify({
          ispId: activeIspId,
          planId: selectedPlan.id,
          phoneNumber: phone,
          networkKey: checkout.networkKey
        })
      });
      setDepositId(res.depositId);
      setRedirectUrl(res.redirectUrlAfterPayment || "https://www.google.com");
      setNotice(res.message || t("noticePhone"));
      setPolling(true);
    } catch (err) {
      setError(err.message || t("errPayStart"));
    }
  }

  useEffect(() => {
    if (!polling || !depositId) return;
    let cancelled = false;
    let ticks = 0;
    const pollTimer = setInterval(async () => {
      ticks += 1;
      if (ticks > 120) {
        clearInterval(pollTimer);
        if (!cancelled) setPolling(false);
        return;
      }
      try {
        const st = await publicRequest(
          `/public/wifi-purchase/status/${encodeURIComponent(depositId)}`
        );
        if (st.status === "completed") {
          clearInterval(pollTimer);
          if (!cancelled) {
            setPolling(false);
            const nextUrl = st.redirectUrl || redirectUrl || "https://www.google.com";
            if (st.setupToken) {
              setPostPaySetup({ setupToken: st.setupToken, redirectUrl: nextUrl });
              setNotice(wifiT(uiLang, "noticePostPay"));
            } else {
              window.location.href = nextUrl;
            }
          }
        }
        if (st.status === "failed") {
          clearInterval(pollTimer);
          if (!cancelled) {
            setPolling(false);
            setError(wifiT(uiLang, "errPayFailed"));
          }
        }
      } catch (_e) {
        /* keep polling */
      }
    }, 3500);
    return () => {
      cancelled = true;
      clearInterval(pollTimer);
    };
  }, [polling, depositId, redirectUrl, uiLang]);

  return (
    <main className="container">
      <section className="wifi-hero" aria-label={uiLang === "en" ? "Wi‑Fi guest overview" : "Présentation Wi‑Fi"}>
        <div className="wifi-hero-top">
          <div>
            <p className="eyebrow">{wifiEyebrowText(branding, uiLang, t)}</p>
            <h1>{t("heroTitle")}</h1>
            <p className="wifi-lead">{t("heroLead")}</p>
          </div>
          <LangSwitch value={uiLang} onChange={setUiLang} idPrefix="wifi" />
        </div>
        {activeIspId && hasIspContact(branding) ? (
          <aside className="wifi-isp-contact" aria-label={t("contactTitle")}>
            <p className="wifi-isp-contact__title">{t("contactTitle")}</p>
            <ul className="wifi-isp-contact__list">
              {branding.contactPhone ? (
                <li>
                  <span className="wifi-isp-contact__label">{t("contactPhone")}</span>{" "}
                  <a href={`tel:${String(branding.contactPhone).replace(/\s+/g, "")}`}>{branding.contactPhone}</a>
                </li>
              ) : null}
              {branding.contactEmail ? (
                <li>
                  <span className="wifi-isp-contact__label">{t("contactEmail")}</span>{" "}
                  <a href={`mailto:${branding.contactEmail}`}>{branding.contactEmail}</a>
                </li>
              ) : null}
              {branding.address ? (
                <li>
                  <span className="wifi-isp-contact__label">{t("contactAddress")}</span> {branding.address}
                </li>
              ) : null}
            </ul>
          </aside>
        ) : null}
        <div className="demo-board">
          <div className="demo-board-row">
            <span className="wifi-step-icon" aria-hidden="true">
              <IconAntenna width={22} height={22} />
            </span>
            <b>{t("stepPick")}</b>
          </div>
          <div className="demo-board-row">
            <span className="wifi-step-icon" aria-hidden="true">
              <IconWallet width={22} height={22} />
            </span>
            <b>{t("stepPay")}</b>
          </div>
          <div className="demo-board-row">
            <span className="wifi-step-icon" aria-hidden="true">
              <IconZap width={22} height={22} />
            </span>
            <b>{t("stepOn")}</b>
          </div>
        </div>
      </section>
      <header className="app-header" style={{ alignItems: "center" }}>
        <img src={mcbuleliLogoUrl} alt="McBuleli" style={{ height: 40, width: "auto", objectFit: "contain" }} />
        <div>
          <h1 style={{ margin: 0 }}>{wifiDisplayName(branding?.displayName, uiLang)}</h1>
          <p className="app-meta">{t("catalogLead")}</p>
        </div>
      </header>

      {!activeIspId && (
        <form className="panel" onSubmit={onOpenCatalog}>
          <h2>{t("accessTitle")}</h2>
          <p className="wifi-lead">{t("accessLead")}</p>
          <input
            placeholder={t("ispPh")}
            value={ispIdInput}
            onChange={(e) => setIspIdInput(e.target.value)}
            style={{ width: "100%", maxWidth: 400 }}
          />
          <button type="submit">{t("showPlans")}</button>
        </form>
      )}

      {error && <p className="error">{error}</p>}
      {notice && <p>{notice}</p>}

      {postPaySetup && (
        <section className="panel" style={{ marginTop: 16 }}>
          <h2>{t("postPayTitle")}</h2>
          <p>{t("postPayHelp")}</p>
          <textarea
            readOnly
            rows={3}
            value={postPaySetup.setupToken}
            style={{ width: "100%", maxWidth: 560, fontFamily: "monospace" }}
          />
          <p>
            <button type="button" onClick={() => window.open("/portal", "_blank", "noopener,noreferrer")}>
              {t("openPortal")}
            </button>{" "}
            <button
              type="button"
              onClick={() => {
                window.location.href = postPaySetup.redirectUrl;
              }}
            >
              {t("continueWifi")}
            </button>
          </p>
        </section>
      )}

      {activeIspId && plans.length === 0 && !error && <p>{t("noPlans")}</p>}

      <section className="grid">
        {plans.map((plan) => (
          <button
            key={plan.id}
            type="button"
            className="panel pricing-card"
            style={{ textAlign: "left", cursor: "pointer" }}
            onClick={() => {
              setSelectedPlan(plan);
              setDepositId(null);
              setNotice("");
              setError("");
            }}
          >
            <h2>{plan.name}</h2>
            <p>
              <strong>{plan.priceUsd}&nbsp;$</strong> — {plan.durationDays}{" "}
              {plan.durationDays === 1 ? t("daySingular") : t("dayPlural")}
            </p>
            <p>
              {t("speed")} : {plan.speedLabel || plan.rateLimit} · {t("type")} : {plan.defaultAccessType} ·{" "}
              {t("devices")} : {plan.maxDevices}
            </p>
          </button>
        ))}
      </section>

      {selectedPlan && (
        <div
          role="presentation"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 40
          }}
          onClick={() => setSelectedPlan(null)}
        />
      )}
      {selectedPlan && (
        <div
          className="panel"
          style={{
            position: "fixed",
            inset: 0,
            margin: "auto",
            maxWidth: 420,
            maxHeight: "90vh",
            overflow: "auto",
            zIndex: 50,
            boxShadow: "0 8px 32px rgba(0,0,0,0.25)"
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h2>{selectedPlan.name}</h2>
          <p>
            {selectedPlan.priceUsd}&nbsp;$ · {selectedPlan.durationDays}{" "}
            {selectedPlan.durationDays === 1 ? t("daySingular") : t("dayPlural")}
          </p>
          <button type="button" onClick={() => setSelectedPlan(null)}>
            {t("close")}
          </button>

          <h3>{t("payMobileTitle")}</h3>
          <form onSubmit={onStartPayment}>
            <p>{t("phoneLabel")}</p>
            <input
              placeholder={t("phonePh")}
              value={checkout.phone}
              onChange={(e) => setCheckout({ ...checkout, phone: e.target.value })}
            />
            <p>{t("network")}</p>
            <select
              value={checkout.networkKey}
              onChange={(e) => setCheckout({ ...checkout, networkKey: e.target.value })}
            >
              {networks.map((n) => (
                <option key={n.key} value={n.key}>
                  {n.label}
                </option>
              ))}
            </select>
            <button type="submit" disabled={polling || !checkout.phone}>
              {polling ? t("paying") : t("paySubmit")}
            </button>
          </form>
          <p>
            <small>{t("payFoot")}</small>
          </p>
          {import.meta.env.DEV ? (
            <p>
              <small>API: {API_URL}</small>
            </p>
          ) : null}
        </div>
      )}
      <footer className="mcbuleli-site-footer">
        <img src={mcbuleliLogoUrl} alt="" width={28} height={28} className="mcbuleli-site-footer__logo" />
        <p>{t("mcbuleliFooter")}</p>
      </footer>
    </main>
  );
}
