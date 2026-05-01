import { useCallback, useEffect, useMemo, useState } from "react";
import { API_URL, publicAssetUrl, publicRequest } from "./api";
import { mcbuleliLogoUrl } from "./brandAssets.js";
import PoweredByMcBuleli from "./PoweredByMcBuleli.jsx";
import { useReadOnlyUiLang } from "./uiLangSync.js";
import HomeShortcut from "./HomeShortcut.jsx";
import {
  IconAntenna,
  IconPhone,
  IconSignalBars,
  IconSmartphone,
  IconWallet,
  IconX,
  IconZap
} from "./icons.jsx";
import { wifiT } from "./wifiCopy.js";
import { sanitizeApiErrorForAudience } from "./httpErrorCopy.js";
import { setIndependentPublicPageTitle } from "./pageTitle.js";

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

const WIFI_PLAN_ICONS = [IconZap, IconAntenna, IconWallet];

function WifiPlanHeroIcon({ plan, index }) {
  const raw = String(plan?.defaultAccessType || "").toLowerCase();
  let Icon = WIFI_PLAN_ICONS[((index % 3) + 3) % 3];
  if (raw.includes("ppp")) Icon = IconAntenna;
  else if (raw.includes("hot")) Icon = IconZap;
  return <Icon width={44} height={44} style={{ color: "#2f7439" }} aria-hidden />;
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
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [networks, setNetworks] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [checkoutMm, setCheckoutMm] = useState({
    phone: "",
    networkKey: "orange"
  });
  const [checkoutAlt, setCheckoutAlt] = useState({
    methodType: "bank_transfer",
    externalRef: "",
    payerContact: ""
  });
  const [depositId, setDepositId] = useState(null);
  const [redirectUrl, setRedirectUrl] = useState(null);
  const [polling, setPolling] = useState(false);
  const [postPaySetup, setPostPaySetup] = useState(null);
  const uiLang = useReadOnlyUiLang();
  const t = (key) => wifiT(uiLang, key);
  const isEn = uiLang === "en";

  const wifiErr = (raw) => sanitizeApiErrorForAudience(String(raw ?? ""), null, isEn);

  const loadCatalog = useCallback(async (isp) => {
    setError("");
    const [p, n, methods] = await Promise.all([
      publicRequest(`/public/wifi-plans?ispId=${encodeURIComponent(isp)}`),
      publicRequest("/public/wifi-networks"),
      publicRequest(`/public/wifi-payment-methods?ispId=${encodeURIComponent(isp)}`)
    ]);
    setBranding(p.branding || {});
    setPlans(p.plans || []);
    setNetworks(n || []);
    const methodItems = Array.isArray(methods?.items) ? methods.items : [];
    setPaymentMethods(methodItems);
    const firstAlt = methodItems.find((m) => String(m.methodType || "").toLowerCase() !== "mobile_money");
    setCheckoutAlt((prev) => ({
      ...prev,
      methodType: firstAlt?.methodType || "bank_transfer"
    }));
    setActiveIspId(isp);
    const url = new URL(window.location.href);
    url.searchParams.set("ispId", isp);
    const next = url.toString();
    window.history.replaceState({}, "", next);
  }, []);

  useEffect(() => {
    publicRequest("/public/wifi-networks")
      .then(setNetworks)
      .catch(() => {});
  }, []);

  useEffect(() => {
    setIndependentPublicPageTitle();
  }, []);

  useEffect(() => {
    if (!ispIdFromQuery) return;
    loadCatalog(ispIdFromQuery).catch((e) => setError(wifiErr(e.message)));
  }, [ispIdFromQuery, loadCatalog]);

  async function onOpenCatalog(e) {
    e.preventDefault();
    try {
      await loadCatalog(ispIdInput.trim());
    } catch (err) {
      setError(wifiErr(err.message));
    }
  }

  const captiveInfo = useMemo(() => {
    if (typeof window === "undefined") return { ip: "", router: "", mac: "" };
    const sp = new URLSearchParams(window.location.search);
    return {
      ip: sp.get("ip")?.trim() || "",
      router: sp.get("router")?.trim() || "",
      mac: sp.get("mac")?.trim() || ""
    };
  }, [activeIspId]);

  async function initiateWifiPurchase(methodType, bodyExtra) {
    const sp = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    const captiveContext = {
      ip: sp.get("ip")?.trim() || undefined,
      router: sp.get("router")?.trim() || undefined,
      mac: sp.get("mac")?.trim() || undefined
    };
    const hasCap = Boolean(captiveContext.ip || captiveContext.router || captiveContext.mac);
    return publicRequest("/public/wifi-purchase/initiate", {
      method: "POST",
      body: JSON.stringify({
        ispId: activeIspId,
        planId: selectedPlan.id,
        methodType,
        ...(hasCap ? { captiveContext } : {}),
        ...bodyExtra
      })
    });
  }

  async function onStartPawapayPayment(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!selectedPlan || !activeIspId) return;
    const phone = checkoutMm.phone.replace(/\s+/g, "").replace(/^\+/, "");
    if (phone.length < 9) {
      setError(t("errPhone"));
      return;
    }
    try {
      const res = await initiateWifiPurchase("mobile_money", {
        phoneNumber: phone || undefined,
        networkKey: checkoutMm.networkKey
      });
      setDepositId(res.depositId);
      setRedirectUrl(res.redirectUrlAfterPayment || "https://www.google.com");
      setNotice(res.message || t("noticePhone"));
      setPolling(true);
    } catch (err) {
      setError(wifiErr(err.message || t("errPayStart")));
    }
  }

  async function onStartAlternatePayment(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!selectedPlan || !activeIspId) return;
    const methodType = String(checkoutAlt.methodType || "bank_transfer").toLowerCase();
    if (!String(checkoutAlt.externalRef || "").trim()) {
      setError(t("errRef"));
      return;
    }
    try {
      const res = await initiateWifiPurchase(methodType, {
        externalRef: checkoutAlt.externalRef,
        payerContact: checkoutAlt.payerContact || undefined
      });
      setDepositId(res.depositId);
      setRedirectUrl(res.redirectUrlAfterPayment || "https://www.google.com");
      setNotice(res.message || t("noticePhone"));
      if (res.status === "pending_manual") {
        setPolling(false);
      } else {
        setPolling(false);
      }
    } catch (err) {
      setError(wifiErr(err.message || t("errPayStart")));
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

  const wifiLogoSrc =
    branding?.logoUrl != null && String(branding.logoUrl).trim()
      ? publicAssetUrl(branding.logoUrl)
      : mcbuleliLogoUrl;
  const pawapayMethodDetails =
    paymentMethods.find((m) => String(m.methodType || "").toLowerCase() === "mobile_money") || null;
  const alternateMethodDetails =
    paymentMethods.find((m) => String(m.methodType || "") === String(checkoutAlt.methodType || "")) || null;
  const alternateMethodOptions = paymentMethods.filter(
    (m) => String(m.methodType || "").toLowerCase() !== "mobile_money"
  );

  return (
    <main className="container wifi-portal-page wifi-portal-page--dark">
      <section className="wifi-hero" aria-label={uiLang === "en" ? "Wi‑Fi guest overview" : "Présentation Wi‑Fi"}>
        <div className="wifi-hero-top">
          <div className="wifi-hero-intro">
            <p className="eyebrow">{wifiEyebrowText(branding, uiLang, t)}</p>
            <h1>{t("heroTitle")}</h1>
            <p className="wifi-lead">{t("heroLead")}</p>
          </div>
          <div className="wifi-hero-toolbar wifi-hero-toolbar--end">
            <HomeShortcut title={t("homeShortcut")} idPrefix="wifi" className="app-home-shortcut" />
          </div>
        </div>
        {activeIspId && hasIspContact(branding) ? (
          <aside className="wifi-isp-contact" aria-label={t("contactTitle")}>
            <p className="wifi-isp-contact__title">{t("contactTitle")}</p>
            <ul className="wifi-isp-contact__list">
              {branding.contactPhone ? (
                <li className="wifi-isp-contact__line">
                  <span
                    className="wifi-isp-contact__label wifi-isp-contact__label--icon"
                    title={t("contactPhone")}
                  >
                    <IconPhone width={18} height={18} aria-hidden />
                    <span className="visually-hidden">{t("contactPhone")}</span>
                  </span>
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
      <header className="isp-enduser-brand-head">
        <div
          className="isp-enduser-brand-head__logo-wrap"
          style={{ borderColor: branding?.primaryColor || "#43a047" }}
        >
          <img
            src={wifiLogoSrc}
            alt={wifiDisplayName(branding?.displayName, uiLang) || (uiLang === "en" ? "Internet provider" : "Opérateur")}
            width={40}
            height={40}
          />
        </div>
        <div className="isp-enduser-brand-head__text">
          <h1>{wifiDisplayName(branding?.displayName, uiLang)}</h1>
          <p className="app-meta">{t("catalogLead")}</p>
        </div>
      </header>

      {activeIspId && (captiveInfo.ip || captiveInfo.router || captiveInfo.mac) ? (
        <div className="wifi-captive-banner" role="status">
          <strong>{t("captiveTitle")}</strong>
          <div>
            {captiveInfo.ip ? (
              <span>
                {t("captiveIp")}: {captiveInfo.ip}
                {" · "}
              </span>
            ) : null}
            {captiveInfo.router ? (
              <span>
                {t("captiveRouter")}: {captiveInfo.router}
                {" · "}
              </span>
            ) : null}
            {captiveInfo.mac ? (
              <span>
                {t("captiveMac")}: {captiveInfo.mac}
              </span>
            ) : null}
          </div>
          <p className="app-meta" style={{ margin: "8px 0 0", fontSize: "0.82rem" }}>
            {t("captiveHelp")}
          </p>
        </div>
      ) : null}

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

      <section className="grid wifi-plan-grid">
        {plans.map((plan, planIndex) => {
          const cardLabel = `${plan.name}. ${plan.priceUsd} $, ${plan.durationDays} ${
            plan.durationDays === 1 ? t("daySingular") : t("dayPlural")
          }. ${t("speed")} ${plan.speedLabel || plan.rateLimit}, ${plan.defaultAccessType}, ${plan.maxDevices} ${t("devices")}.`;
          return (
            <button
              key={plan.id}
              type="button"
              className="panel pricing-card wifi-plan-card"
              aria-label={cardLabel}
              onClick={() => {
                setSelectedPlan(plan);
                setDepositId(null);
                setNotice("");
                setError("");
              }}
            >
              <div className="wifi-plan-card__icon-wrap">
                <WifiPlanHeroIcon plan={plan} index={planIndex} />
              </div>
              <span className="visually-hidden">{plan.name}</span>
              <hr className="wifi-plan-card__divider" />
              <p className="wifi-plan-card__price">
                <strong>
                  {plan.priceUsd}&nbsp;$ — {plan.durationDays}{" "}
                  {plan.durationDays === 1 ? t("daySingular") : t("dayPlural")}
                </strong>
              </p>
              <p className="wifi-plan-card__meta">
                {t("speed")} : {plan.speedLabel || plan.rateLimit} · {t("type")} : {plan.defaultAccessType} ·{" "}
                {t("devices")} : {plan.maxDevices}
              </p>
            </button>
          );
        })}
      </section>

      {selectedPlan && (
        <div
          role="presentation"
          className="wifi-checkout-backdrop"
          onClick={() => setSelectedPlan(null)}
        />
      )}
      {selectedPlan && (
        <div
          className="panel wifi-checkout-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wifi-checkout-summary"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="wifi-checkout-modal__close"
            onClick={() => setSelectedPlan(null)}
            aria-label={t("close")}
          >
            <IconX width={20} height={20} />
          </button>

          <div className="wifi-checkout-modal__head">
            <span className="wifi-checkout-modal__wifi-mark" aria-hidden="true">
              <IconAntenna width={26} height={26} />
            </span>
            <p id="wifi-checkout-summary" className="wifi-checkout-modal__summary">
              <span className="visually-hidden">{selectedPlan.name}. </span>
              <strong className="wifi-checkout-modal__amount">
                {selectedPlan.priceUsd}&nbsp;$ · {selectedPlan.durationDays}{" "}
                {selectedPlan.durationDays === 1 ? t("daySingular") : t("dayPlural")}
              </strong>
            </p>
          </div>

          <div className="wifi-checkout-pay-head" role="group" aria-label={t("payTitle")}>
            <IconWallet width={22} height={22} aria-hidden />
          </div>

          <p className="wifi-checkout-section-title">{t("pawapayBlockTitle")}</p>
          <p className="wifi-checkout-section-lead app-meta">{t("pawapayBlockLead")}</p>
          <form className="wifi-checkout-form" onSubmit={onStartPawapayPayment}>
            <div className="wifi-input-row">
              <span className="wifi-input-row__lead" aria-hidden="true">
                <IconSmartphone width={20} height={20} />
              </span>
              <input
                id="wifi-checkout-phone"
                autoComplete="tel"
                aria-label={t("phoneLabel")}
                placeholder={t("phonePh")}
                value={checkoutMm.phone}
                onChange={(e) => setCheckoutMm({ ...checkoutMm, phone: e.target.value })}
              />
            </div>
            <div className="wifi-input-row">
              <span className="wifi-input-row__lead" aria-hidden="true">
                <IconSignalBars width={20} height={20} />
              </span>
              <select
                id="wifi-checkout-network"
                aria-label={t("network")}
                value={checkoutMm.networkKey}
                onChange={(e) => setCheckoutMm({ ...checkoutMm, networkKey: e.target.value })}
              >
                {networks.map((n) => (
                  <option key={n.key} value={n.key}>
                    {n.label}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="wifi-pay-submit" disabled={polling || !checkoutMm.phone}>
              <IconWallet width={18} height={18} aria-hidden />
              <span>{polling ? t("paying") : t("paySubmit")}</span>
            </button>
          </form>
          {pawapayMethodDetails ? (
            <p className="wifi-checkout-foot">
              <small>
                {pawapayMethodDetails.instructions?.collectionPoint ||
                  pawapayMethodDetails.instructions?.mobileMoneyNumber ||
                  pawapayMethodDetails.instructions?.note ||
                  ""}
              </small>
            </p>
          ) : null}

          <hr className="wifi-checkout-split" />
          <p className="wifi-checkout-section-title">{t("alternateBlockTitle")}</p>
          <p className="wifi-checkout-section-lead app-meta">{t("alternateBlockLead")}</p>
          <form className="wifi-checkout-form" onSubmit={onStartAlternatePayment}>
            <div className="wifi-input-row">
              <span className="wifi-input-row__lead" aria-hidden="true">
                <IconWallet width={20} height={20} />
              </span>
              <select
                aria-label={t("method")}
                value={checkoutAlt.methodType}
                onChange={(e) => setCheckoutAlt({ ...checkoutAlt, methodType: e.target.value })}
              >
                {alternateMethodOptions.length ? (
                  alternateMethodOptions.map((m) => (
                    <option key={m.id} value={m.methodType}>
                      {m.providerName} ({m.methodType})
                    </option>
                  ))
                ) : (
                  <>
                    <option value="bank_transfer">bank_transfer</option>
                    <option value="cash">cash</option>
                    <option value="binance_pay">binance_pay</option>
                    <option value="crypto_wallet">crypto_wallet</option>
                    <option value="visa_card">visa_card</option>
                  </>
                )}
              </select>
            </div>
            <div className="wifi-input-row">
              <span className="wifi-input-row__lead" aria-hidden="true">
                <IconSmartphone width={20} height={20} />
              </span>
              <input
                autoComplete="off"
                aria-label={t("reference")}
                placeholder={t("referencePh")}
                value={checkoutAlt.externalRef}
                onChange={(e) => setCheckoutAlt({ ...checkoutAlt, externalRef: e.target.value })}
              />
            </div>
            <div className="wifi-input-row">
              <span className="wifi-input-row__lead" aria-hidden="true">
                <IconPhone width={20} height={20} />
              </span>
              <input
                autoComplete="tel"
                aria-label={t("payerContact")}
                placeholder={t("payerContactPh")}
                value={checkoutAlt.payerContact}
                onChange={(e) => setCheckoutAlt({ ...checkoutAlt, payerContact: e.target.value })}
              />
            </div>
            <button
              type="submit"
              className="wifi-pay-submit wifi-pay-submit--secondary"
              disabled={polling || !String(checkoutAlt.externalRef || "").trim()}
            >
              <IconWallet width={18} height={18} aria-hidden />
              <span>{t("alternateSubmit")}</span>
            </button>
          </form>
          {alternateMethodDetails ? (
            <p className="wifi-checkout-foot">
              <small>
                {alternateMethodDetails.instructions?.collectionPoint ||
                  alternateMethodDetails.instructions?.bankName ||
                  alternateMethodDetails.instructions?.walletAddress ||
                  alternateMethodDetails.instructions?.processorName ||
                  alternateMethodDetails.instructions?.note ||
                  ""}
              </small>
            </p>
          ) : null}
          <p className="wifi-checkout-foot">
            <small>{t("payFoot")}</small>
          </p>
          {import.meta.env.DEV ? (
            <p>
              <small>API: {API_URL}</small>
            </p>
          ) : null}
        </div>
      )}

      {activeIspId && branding?.wifiPortalBannerUrl ? (
        <section className="wifi-portal-bottom-banner" aria-label={t("wifiBannerAria")}>
          <img
            src={publicAssetUrl(branding.wifiPortalBannerUrl)}
            alt=""
            className="wifi-portal-bottom-banner__img"
            loading="lazy"
            decoding="async"
          />
        </section>
      ) : null}

      <footer className="mcbuleli-site-footer">
        <PoweredByMcBuleli poweredByLabel={t("mcbuleliPoweredPrefix")} />
      </footer>
    </main>
  );
}
