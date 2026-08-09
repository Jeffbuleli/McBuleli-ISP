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
  IconTicket,
  IconWallet,
  IconX,
  IconZap
} from "./icons.jsx";

/** Guest catalog accent (mint) — ignore ISP branding blue/brown. */
const WIFI_ACCENT = "#63b38f";
import { wifiT } from "./wifiCopy.js";
import { sanitizeApiErrorForAudience } from "./httpErrorCopy.js";
import { setIndependentPublicPageTitle } from "./pageTitle.js";
import { isLikelyDrCongoMsisdn, normalizeDrCongoMsisdn } from "./phoneNormalize.js";

function wifiDisplayName(name, lang) {
  const s = name != null ? String(name).trim() : "";
  if (!s || s === "AA") return lang === "en" ? "Guest Wi-Fi" : "Wi-Fi invité";
  return s;
}

function wifiEyebrowText(branding, lang, t) {
  const base = t("eyebrow");
  const n = branding?.displayName != null ? String(branding.displayName).trim() : "";
  if (n && n !== "AA") return `${base} - ${n}`;
  return base;
}

const WIFI_PLAN_ICONS = [IconZap, IconAntenna, IconWallet];

function WifiPlanHeroIcon({ plan, index }) {
  const raw = String(plan?.defaultAccessType || "").toLowerCase();
  let Icon = WIFI_PLAN_ICONS[((index % 3) + 3) % 3];
  if (raw.includes("ppp")) Icon = IconAntenna;
  else if (raw.includes("hot")) Icon = IconZap;
  return <Icon width={28} height={28} aria-hidden />;
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
    phone: "",
    payerContact: ""
  });
  const [checkoutMode, setCheckoutMode] = useState("mm");
  const [checkoutVoucher, setCheckoutVoucher] = useState({
    code: "",
    phone: "",
    password: ""
  });
  const [paperVoucherCode, setPaperVoucherCode] = useState("");
  const [voucherBusy, setVoucherBusy] = useState(false);
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = new URLSearchParams(window.location.search).get("v")?.trim();
    if (!v || !plans.length) return;
    setPaperVoucherCode(v);
    setCheckoutMode("paper");
    setSelectedPlan((prev) => prev || plans[0]);
  }, [plans]);

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
    const phone = normalizeDrCongoMsisdn(checkoutMm.phone);
    if (!isLikelyDrCongoMsisdn(phone)) {
      setError(t("errPhone"));
      return;
    }
    try {
      const res = await initiateWifiPurchase("mobile_money", {
        phoneNumber: phone,
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
    const phone = normalizeDrCongoMsisdn(checkoutAlt.phone || checkoutMm.phone);
    if (!isLikelyDrCongoMsisdn(phone)) {
      setError(t("errPhone"));
      return;
    }
    try {
      const res = await initiateWifiPurchase(methodType, {
        phoneNumber: phone,
        externalRef: checkoutAlt.externalRef,
        payerContact: checkoutAlt.payerContact || phone
      });
      setDepositId(res.depositId);
      setRedirectUrl(res.redirectUrlAfterPayment || "https://www.google.com");
      setNotice(res.message || t("noticeManualPending"));
      setPolling(true);
    } catch (err) {
      setError(wifiErr(err.message || t("errPayStart")));
    }
  }

  async function onActivatePaperVoucher(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    const code = String(paperVoucherCode || "").trim();
    if (!code) {
      setError(t("errWifiVoucherCode"));
      return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      }
    } catch {
      /* ignore */
    }
    setNotice(t("wifiVoucherReady"));
    const router = captiveInfo.router;
    if (router) {
      const host = String(router).replace(/^https?:\/\//i, "").split("/")[0];
      if (host) {
        window.setTimeout(() => {
          window.location.href = `http://${host}/login`;
        }, 400);
      }
    }
  }

  async function onRedeemVoucher(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!selectedPlan || !activeIspId) return;
    const code = String(checkoutVoucher.code || "").trim();
    if (!code) {
      setError(t("errVoucherCode"));
      return;
    }
    const phone = normalizeDrCongoMsisdn(checkoutVoucher.phone);
    if (!isLikelyDrCongoMsisdn(phone)) {
      setError(t("errPhone"));
      return;
    }
    const password = String(checkoutVoucher.password || "");
    if (password.length < 6) {
      setError(t("errVoucherPassword"));
      return;
    }
    setVoucherBusy(true);
    try {
      const res = await publicRequest("/public/wifi-voucher/redeem", {
        method: "POST",
        body: JSON.stringify({
          ispId: activeIspId,
          planId: selectedPlan.id,
          code,
          phoneNumber: phone,
          newPassword: password
        })
      });
      const nextUrl = res.redirectUrl || "https://www.google.com";
      setSelectedPlan(null);
      setNotice(t("voucherOk"));
      if (res.setupToken) {
        setPostPaySetup({ setupToken: res.setupToken, redirectUrl: nextUrl });
        setNotice(t("noticePostPay"));
      } else {
        window.setTimeout(() => {
          window.location.href = nextUrl;
        }, 700);
      }
    } catch (err) {
      setError(wifiErr(err.message || t("errPayStart")));
    } finally {
      setVoucherBusy(false);
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
            setSelectedPlan(null);
            const nextUrl = st.redirectUrl || redirectUrl || "https://www.google.com";
            if (st.setupToken) {
              setPostPaySetup({ setupToken: st.setupToken, redirectUrl: nextUrl });
              setNotice(wifiT(uiLang, "noticePostPay"));
            } else {
              setNotice(wifiT(uiLang, "noticeRedirecting"));
              window.setTimeout(() => {
                window.location.href = nextUrl;
              }, 500);
            }
          }
        }
        if (st.status === "failed") {
          clearInterval(pollTimer);
          if (!cancelled) {
            setPolling(false);
            setSelectedPlan(null);
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

  const brandName = wifiDisplayName(branding?.displayName, uiLang);
  const accent = WIFI_ACCENT;
  const phoneNorm = normalizeDrCongoMsisdn(checkoutMm.phone);
  const phoneRawDigits = String(checkoutMm.phone).replace(/\D/g, "").replace(/^00/, "");
  const showPhoneNorm = Boolean(checkoutMm.phone.trim() && phoneNorm && phoneNorm !== phoneRawDigits);
  const voucherPhoneNorm = normalizeDrCongoMsisdn(checkoutVoucher.phone);
  const voucherPhoneRaw = String(checkoutVoucher.phone).replace(/\D/g, "").replace(/^00/, "");
  const showVoucherPhoneNorm = Boolean(
    checkoutVoucher.phone.trim() && voucherPhoneNorm && voucherPhoneNorm !== voucherPhoneRaw
  );

  return (
    <main className="container wifi-portal-page wifi-portal-page--dark wifi-portal-page--v2">
      <header className="wifi-topbar">
        <div className="wifi-topbar__brand">
          <span className="wifi-topbar__logo" style={{ "--wifi-accent": accent }}>
            <img
              src={wifiLogoSrc}
              alt=""
              width={36}
              height={36}
            />
          </span>
          <div className="wifi-topbar__text">
            <p className="wifi-topbar__eyebrow">{t("eyebrow")}</p>
            <h1 className="wifi-topbar__name">{brandName}</h1>
          </div>
        </div>
        <HomeShortcut title={t("homeShortcut")} idPrefix="wifi" className="app-home-shortcut wifi-topbar__home" />
      </header>

      <section className="wifi-intro" aria-label={wifiEyebrowText(branding, uiLang, t)}>
        <h2 className="wifi-intro__title">{t("heroTitle")}</h2>
        <p className="wifi-intro__lead">{t("heroLead")}</p>
      </section>

      {activeIspId && (captiveInfo.ip || captiveInfo.router || captiveInfo.mac) ? (
        <div className="wifi-captive-banner" role="status">
          <strong>{t("captiveTitle")}</strong>
          <div>
            {captiveInfo.ip ? (
              <span>
                {t("captiveIp")}: {captiveInfo.ip}
                {" - "}
              </span>
            ) : null}
            {captiveInfo.router ? (
              <span>
                {t("captiveRouter")}: {captiveInfo.router}
                {" - "}
              </span>
            ) : null}
            {captiveInfo.mac ? (
              <span>
                {t("captiveMac")}: {captiveInfo.mac}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {!activeIspId && (
        <form className="panel wifi-access-panel" onSubmit={onOpenCatalog}>
          <h2>{t("accessTitle")}</h2>
          <p className="wifi-lead">{t("accessLead")}</p>
          <input
            placeholder={t("ispPh")}
            value={ispIdInput}
            onChange={(e) => setIspIdInput(e.target.value)}
          />
          <button type="submit">{t("showPlans")}</button>
        </form>
      )}

      {error ? <p className="error wifi-flash">{error}</p> : null}
      {notice ? <p className="wifi-flash wifi-flash--ok">{notice}</p> : null}

      {postPaySetup ? (
        <section className="panel wifi-postpay">
          <h2>{t("postPayTitle")}</h2>
          <p>{t("postPayHelp")}</p>
          <textarea readOnly rows={3} value={postPaySetup.setupToken} className="wifi-postpay__token" />
          <div className="wifi-postpay__actions">
            <button type="button" onClick={() => window.open("/portal", "_blank", "noopener,noreferrer")}>
              {t("openPortal")}
            </button>
            <button
              type="button"
              className="wifi-btn-ghost"
              onClick={() => {
                window.location.href = postPaySetup.redirectUrl;
              }}
            >
              {t("continueWifi")}
            </button>
          </div>
        </section>
      ) : null}

      {activeIspId && plans.length === 0 && !error ? <p className="wifi-empty">{t("noPlans")}</p> : null}

      <section className="wifi-plan-grid" aria-label={t("catalogLead")}>
        {plans.map((plan, planIndex) => {
          const daysLabel = plan.durationDays === 1 ? t("daySingular") : t("dayPlural");
          const cardLabel = `${plan.name}. ${plan.priceUsd} $, ${plan.durationDays} ${daysLabel}.`;
          return (
            <button
              key={plan.id}
              type="button"
              className="wifi-plan-card wifi-plan-card--v2"
              style={{ "--wifi-accent": accent, animationDelay: `${planIndex * 60}ms` }}
              aria-label={cardLabel}
              onClick={() => {
                setSelectedPlan(plan);
                setDepositId(null);
                setCheckoutMode("mm");
                setPaperVoucherCode("");
                setNotice("");
                setError("");
              }}
            >
              <span className="wifi-plan-card__icon">
                <WifiPlanHeroIcon plan={plan} index={planIndex} />
              </span>
              <span className="wifi-plan-card__name">{plan.name}</span>
              <span className="wifi-plan-card__price">
                <strong>{Number(plan.priceUsd).toFixed(2)}</strong>
                <span className="wifi-plan-card__currency">$</span>
              </span>
              <span className="wifi-plan-card__duration">
                {plan.durationDays} {daysLabel}
              </span>
              <span className="wifi-plan-card__meta">
                {plan.speedLabel || plan.rateLimit}
                {plan.maxDevices > 1 ? ` - ${plan.maxDevices} ${t("devices")}` : ""}
              </span>
              <span className="wifi-plan-card__cta">{t("renewCta")}</span>
            </button>
          );
        })}
      </section>

      {activeIspId && hasIspContact(branding) ? (
        <aside className="wifi-contact-strip" aria-label={t("contactTitle")}>
          {branding.contactPhone ? (
            <a href={`tel:${String(branding.contactPhone).replace(/\s+/g, "")}`}>
              <IconPhone width={16} height={16} aria-hidden />
              {branding.contactPhone}
            </a>
          ) : null}
          {branding.contactEmail ? <a href={`mailto:${branding.contactEmail}`}>{branding.contactEmail}</a> : null}
        </aside>
      ) : null}

      {selectedPlan ? (
        <>
          <div
            role="presentation"
            className="wifi-checkout-backdrop"
            onClick={() => setSelectedPlan(null)}
          />
          <div
            className="wifi-checkout-modal wifi-checkout-modal--v2"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wifi-checkout-summary"
            onClick={(e) => e.stopPropagation()}
            style={{ "--wifi-accent": accent }}
          >
            <button
              type="button"
              className="wifi-checkout-modal__close"
              onClick={() => setSelectedPlan(null)}
              aria-label={t("close")}
            >
              <IconX width={18} height={18} />
            </button>

            <div className="wifi-checkout-modal__head">
              <span className="wifi-checkout-modal__wifi-mark" aria-hidden="true">
                <IconAntenna width={26} height={26} />
              </span>
              <p className="wifi-checkout-modal__plan">{selectedPlan.name}</p>
              <p id="wifi-checkout-summary" className="wifi-checkout-modal__summary">
                <strong className="wifi-checkout-modal__amount">
                  {Number(selectedPlan.priceUsd).toFixed(2)} $
                </strong>
                <span className="wifi-checkout-modal__sep">·</span>
                <span>
                  {selectedPlan.durationDays}{" "}
                  {selectedPlan.durationDays === 1 ? t("daySingular") : t("dayPlural")}
                </span>
              </p>
              <span className="wifi-checkout-pay-head" aria-hidden="true">
                <IconWallet width={22} height={22} />
              </span>
            </div>

            <div className="wifi-checkout-tabs wifi-checkout-tabs--3" role="tablist" aria-label={t("payTitle")}>
              <button
                type="button"
                role="tab"
                aria-selected={checkoutMode === "mm"}
                className={`wifi-checkout-tab${checkoutMode === "mm" ? " is-active" : ""}`}
                onClick={() => setCheckoutMode("mm")}
              >
                {t("payTabMm")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={checkoutMode === "mcbuleli"}
                className={`wifi-checkout-tab${checkoutMode === "mcbuleli" ? " is-active" : ""}`}
                onClick={() => setCheckoutMode("mcbuleli")}
              >
                {t("payTabMcbuleli")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={checkoutMode === "paper"}
                className={`wifi-checkout-tab${checkoutMode === "paper" ? " is-active" : ""}`}
                onClick={() => setCheckoutMode("paper")}
              >
                <IconTicket width={14} height={14} aria-hidden />
                {t("payTabWifiVoucher")}
              </button>
            </div>

            {checkoutMode === "mm" ? (
              <>
                <p className="wifi-checkout-section-title">{t("pawapayBlockTitle")}</p>
                <form className="wifi-checkout-form" onSubmit={onStartPawapayPayment}>
                  <label className="wifi-field">
                    <span className="wifi-field__label">{t("phoneLabel")}</span>
                    <div className="wifi-input-row">
                      <span className="wifi-input-row__lead" aria-hidden="true">
                        <IconSmartphone width={18} height={18} />
                      </span>
                      <input
                        id="wifi-checkout-phone"
                        autoComplete="tel"
                        inputMode="tel"
                        placeholder={t("phonePh")}
                        value={checkoutMm.phone}
                        onChange={(e) => setCheckoutMm({ ...checkoutMm, phone: e.target.value })}
                      />
                    </div>
                    {showPhoneNorm ? (
                      <span className="wifi-checkout-phone-norm">
                        {t("phoneHint")}: {phoneNorm}
                      </span>
                    ) : null}
                  </label>
                  <label className="wifi-field">
                    <span className="wifi-field__label">{t("network")}</span>
                    <div className="wifi-input-row">
                      <span className="wifi-input-row__lead" aria-hidden="true">
                        <IconSignalBars width={18} height={18} />
                      </span>
                      <select
                        id="wifi-checkout-network"
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
                  </label>
                  <button type="submit" className="wifi-pay-submit" disabled={polling || !checkoutMm.phone}>
                    <IconWallet width={18} height={18} aria-hidden />
                    <span>{polling ? t("paying") : t("paySubmit")}</span>
                  </button>
                </form>
                {pawapayMethodDetails?.instructions?.note ? (
                  <p className="wifi-checkout-foot">
                    <small>
                      {String(pawapayMethodDetails.instructions.note).replace(/pawapay/gi, "Mobile Money")}
                    </small>
                  </p>
                ) : null}

                {alternateMethodOptions.length ? (
                  <>
                    <hr className="wifi-checkout-split" />
                    <p className="wifi-checkout-section-title">{t("alternateBlockTitle")}</p>
                    <form className="wifi-checkout-form" onSubmit={onStartAlternatePayment}>
                      <div className="wifi-input-row">
                        <span className="wifi-input-row__lead" aria-hidden="true">
                          <IconWallet width={18} height={18} />
                        </span>
                        <select
                          aria-label={t("method")}
                          value={checkoutAlt.methodType}
                          onChange={(e) => setCheckoutAlt({ ...checkoutAlt, methodType: e.target.value })}
                        >
                          {alternateMethodOptions.map((m) => (
                            <option key={m.id} value={m.methodType}>
                              {m.providerName}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="wifi-input-row">
                        <span className="wifi-input-row__lead" aria-hidden="true">
                          <IconSmartphone width={18} height={18} />
                        </span>
                        <input
                          autoComplete="tel"
                          inputMode="tel"
                          aria-label={t("phoneLabel")}
                          placeholder={t("phonePh")}
                          value={checkoutAlt.phone}
                          onChange={(e) => setCheckoutAlt({ ...checkoutAlt, phone: e.target.value })}
                        />
                      </div>
                      <div className="wifi-input-row">
                        <span className="wifi-input-row__lead" aria-hidden="true">
                          <IconSmartphone width={18} height={18} />
                        </span>
                        <input
                          autoComplete="off"
                          aria-label={t("reference")}
                          placeholder={t("referencePh")}
                          value={checkoutAlt.externalRef}
                          onChange={(e) => setCheckoutAlt({ ...checkoutAlt, externalRef: e.target.value })}
                        />
                      </div>
                      <button
                        type="submit"
                        className="wifi-pay-submit wifi-pay-submit--secondary"
                        disabled={
                          polling ||
                          !String(checkoutAlt.externalRef || "").trim() ||
                          !String(checkoutAlt.phone || "").trim()
                        }
                      >
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
                  </>
                ) : null}
              </>
            ) : null}

            {checkoutMode === "mcbuleli" ? (
              <>
                <p className="wifi-checkout-section-title">{t("payTabMcbuleli")}</p>
                <form className="wifi-checkout-form" onSubmit={onRedeemVoucher}>
                  <label className="wifi-field">
                    <span className="wifi-field__label">{t("voucherCodeLabel")}</span>
                    <div className="wifi-input-row">
                      <span className="wifi-input-row__lead" aria-hidden="true">
                        <IconTicket width={18} height={18} />
                      </span>
                      <input
                        id="wifi-checkout-voucher"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder={t("voucherCodePh")}
                        value={checkoutVoucher.code}
                        onChange={(e) => setCheckoutVoucher({ ...checkoutVoucher, code: e.target.value })}
                      />
                    </div>
                  </label>
                  <label className="wifi-field">
                    <span className="wifi-field__label">{t("phoneLabel")}</span>
                    <div className="wifi-input-row">
                      <span className="wifi-input-row__lead" aria-hidden="true">
                        <IconSmartphone width={18} height={18} />
                      </span>
                      <input
                        id="wifi-checkout-voucher-phone"
                        autoComplete="tel"
                        inputMode="tel"
                        placeholder={t("phonePh")}
                        value={checkoutVoucher.phone}
                        onChange={(e) => setCheckoutVoucher({ ...checkoutVoucher, phone: e.target.value })}
                      />
                    </div>
                    {showVoucherPhoneNorm ? (
                      <span className="wifi-checkout-phone-norm">
                        {t("phoneHint")}: {voucherPhoneNorm}
                      </span>
                    ) : null}
                  </label>
                  <label className="wifi-field">
                    <span className="wifi-field__label">{t("voucherPasswordLabel")}</span>
                    <div className="wifi-input-row">
                      <span className="wifi-input-row__lead" aria-hidden="true">
                        <IconWallet width={18} height={18} />
                      </span>
                      <input
                        id="wifi-checkout-voucher-password"
                        type="password"
                        autoComplete="new-password"
                        placeholder={t("voucherPasswordPh")}
                        value={checkoutVoucher.password}
                        onChange={(e) => setCheckoutVoucher({ ...checkoutVoucher, password: e.target.value })}
                      />
                    </div>
                  </label>
                  <button
                    type="submit"
                    className="wifi-pay-submit"
                    disabled={
                      voucherBusy ||
                      !String(checkoutVoucher.code || "").trim() ||
                      !String(checkoutVoucher.phone || "").trim()
                    }
                  >
                    <IconTicket width={18} height={18} aria-hidden />
                    <span>{voucherBusy ? t("voucherBusy") : t("voucherSubmit")}</span>
                  </button>
                </form>
              </>
            ) : null}

            {checkoutMode === "paper" ? (
              <form className="wifi-checkout-form" onSubmit={onActivatePaperVoucher}>
                <label className="wifi-field">
                  <span className="wifi-field__label">{t("wifiVoucherTitle")}</span>
                  <div className="wifi-input-row">
                    <span className="wifi-input-row__lead" aria-hidden="true">
                      <IconTicket width={18} height={18} />
                    </span>
                    <input
                      id="wifi-checkout-paper-code"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder={t("wifiVoucherCodePh")}
                      value={paperVoucherCode}
                      onChange={(e) => setPaperVoucherCode(e.target.value)}
                    />
                  </div>
                </label>
                <button
                  type="submit"
                  className="wifi-pay-submit"
                  disabled={!String(paperVoucherCode || "").trim()}
                >
                  <IconTicket width={18} height={18} aria-hidden />
                  <span>{t("wifiVoucherActivate")}</span>
                </button>
                <p className="wifi-checkout-foot">
                  <small>{t("wifiVoucherHint")}</small>
                </p>
              </form>
            ) : null}
            {import.meta.env.DEV ? (
              <p>
                <small>API: {API_URL}</small>
              </p>
            ) : null}
          </div>
        </>
      ) : null}

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

      <footer className="mcbuleli-site-footer wifi-footer">
        <PoweredByMcBuleli poweredByLabel={t("mcbuleliPoweredPrefix")} />
      </footer>
    </main>
  );
}
