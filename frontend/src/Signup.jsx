import { useEffect, useState } from "react";
import { api, publicAssetUrl, setAuthToken } from "./api";
import { mcbuleliLogoUrl } from "./brandAssets.js";
import PoweredByMcBuleli from "./PoweredByMcBuleli.jsx";
import { IconArrowLeft } from "./icons.jsx";
import { sanitizeApiErrorForAudience } from "./httpErrorCopy.js";
import { setIndependentPublicPageTitle } from "./pageTitle.js";

function resolveSignupTitle(displayName) {
  const s = displayName != null ? String(displayName).trim() : "";
  if (!s || s === "AA") return "McBuleli";
  return s;
}

function getStoredUiLang() {
  if (typeof window === "undefined") return "fr";
  const saved = window.localStorage.getItem("ui_lang");
  return saved === "en" ? "en" : "fr";
}

export default function Signup() {
  const [packages, setPackages] = useState([]);
  const [form, setForm] = useState({
    companyName: "",
    location: "",
    contactPhone: "",
    adminFullName: "",
    adminEmail: "",
    adminPassword: "",
    packageCode: "essential"
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [uiLang] = useState(getStoredUiLang);
  const isEn = uiLang === "en";
  const [tenantContext, setTenantContext] = useState(null);

  const surfaceLogoSrc =
    tenantContext?.logoUrl != null && String(tenantContext.logoUrl).trim()
      ? publicAssetUrl(tenantContext.logoUrl)
      : mcbuleliLogoUrl;
  const surfaceLogoAlt =
    (tenantContext?.displayName != null && String(tenantContext.displayName).trim()) || "McBuleli";
  const headlineTitle = resolveSignupTitle(tenantContext?.displayName);

  useEffect(() => {
    api
      .getTenantContext()
      .then((row) => {
        if (row?.matched) setTenantContext(row);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setIndependentPublicPageTitle();
  }, []);

  useEffect(() => {
    api
      .getPublicPlatformPackages()
      .then(setPackages)
      .catch((e) => setError(sanitizeApiErrorForAudience(e.message, null, isEn)));
  }, []);

  useEffect(() => {
    if (!packages.length) return;
    const selectedExists = packages.some((p) => p.code === form.packageCode);
    if (!selectedExists) {
      setForm((prev) => ({ ...prev, packageCode: packages[0].code }));
    }
  }, [packages, form.packageCode]);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!packages.length) {
      setError(
        isEn
          ? "We couldn’t load the plans. Wait a moment and try again."
          : "Les formules ne se chargent pas pour l’instant. Réessayez dans une minute."
      );
      return;
    }
    try {
      const res = await api.signupTenant(form);
      setAuthToken(res.token);
      setNotice(
        isEn ? "Account created. Redirecting to your dashboard..." : "Compte créé. Redirection vers votre tableau de bord…"
      );
      window.location.href = "/";
    } catch (err) {
      setError(
        sanitizeApiErrorForAudience(err.message || (isEn ? "Could not create account" : "Inscription impossible"), null, isEn)
      );
    }
  }

  return (
    <main className="auth-simple auth-simple--dark">
      <div className="auth-simple-card">
        <img className="auth-simple-logo" src={surfaceLogoSrc} alt={surfaceLogoAlt} width={80} height={80} />
        <h1 className="auth-simple-title">{headlineTitle}</h1>
        {headlineTitle !== "McBuleli" ? (
          <PoweredByMcBuleli
            className="auth-simple-powered-by"
            poweredByLabel={isEn ? "Powered by" : "Propulsé par"}
          />
        ) : null}
        <p className="auth-simple-sub">
          {isEn ? "Create your workspace — 1-month trial." : "Créez votre espace — essai 1 mois."}
        </p>
        {error ? (
          <div role="alert" className="auth-simple-banner auth-simple-banner--error">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div role="status" className="auth-simple-banner auth-simple-banner--info">
            {notice}
          </div>
        ) : null}
        <form className="panel auth-simple-panel" onSubmit={onSubmit}>
          <input
            placeholder={isEn ? "Company or ISP name" : "Nom de l'entreprise ou du FAI"}
            value={form.companyName}
            onChange={(e) => setForm({ ...form, companyName: e.target.value })}
            required
          />
          <input
            placeholder={isEn ? "City or region" : "Ville ou région"}
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            required
          />
          <input
            placeholder={isEn ? "Contact phone" : "Téléphone de contact"}
            value={form.contactPhone}
            onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
            required
          />
          <input
            placeholder={isEn ? "Your full name" : "Nom complet"}
            value={form.adminFullName}
            onChange={(e) => setForm({ ...form, adminFullName: e.target.value })}
            required
          />
          <input
            type="email"
            autoComplete="email"
            placeholder={isEn ? "Work email (login)" : "E-mail professionnel (connexion)"}
            value={form.adminEmail}
            onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
            required
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder={isEn ? "Password (min. 6)" : "Mot de passe (min. 6)"}
            value={form.adminPassword}
            onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
            required
            minLength={6}
          />
          <label className="auth-simple-label" htmlFor="signup-package">
            {isEn ? "Plan" : "Formule"}
          </label>
          <select
            id="signup-package"
            value={form.packageCode}
            onChange={(e) => setForm({ ...form, packageCode: e.target.value })}
          >
            {!packages.length ? (
              <option value="" disabled>
                {isEn ? "Loading…" : "Chargement…"}
              </option>
            ) : null}
            {packages.map((p) => (
              <option key={p.code} value={p.code}>
                {isEn ? `${p.name} — $${p.monthlyPriceUsd}/mo` : `${p.name} — ${p.monthlyPriceUsd} $/mois`}
              </option>
            ))}
          </select>
          <button type="submit" disabled={!packages.length}>
            {isEn ? "Start free trial" : "Démarrer l'essai gratuit"}
          </button>
        </form>
        <p className="auth-simple-footer-links">
          <a href="/login">{isEn ? "Already have an account? Sign in" : "Déjà un compte ? Connexion"}</a>
        </p>
        <a className="auth-simple-back" href="/">
          <IconArrowLeft width={20} height={20} aria-hidden />
          {isEn ? "Homepage" : "Accueil"}
        </a>
      </div>
    </main>
  );
}
