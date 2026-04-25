import { useEffect, useState } from "react";
import { api, setAuthToken } from "./api";

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
  const [uiLang, setUiLang] = useState(getStoredUiLang);
  const isEn = uiLang === "en";

  useEffect(() => {
    api
      .getPublicPlatformPackages()
      .then(setPackages)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!packages.length) return;
    const selectedExists = packages.some((p) => p.code === form.packageCode);
    if (!selectedExists) {
      setForm((prev) => ({ ...prev, packageCode: packages[0].code }));
    }
  }, [packages, form.packageCode]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("ui_lang", uiLang);
    }
  }, [uiLang]);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!packages.length) {
      setError(
        isEn
          ? "Plans are unavailable. Please check backend/API connection."
          : "Aucune formule disponible. Vérifiez la connexion backend/API."
      );
      return;
    }
    try {
      const res = await api.signupTenant(form);
      setAuthToken(res.token);
      setNotice(isEn ? "Account created. Redirecting to your dashboard..." : "Compte créé. Redirection vers votre tableau de bord…");
      window.location.href = "/";
    } catch (err) {
      setError(err.message || (isEn ? "Could not create account" : "Inscription impossible"));
    }
  }

  return (
    <main className="container container--login">
      <div className="login-layout">
        <section className="login-poster" aria-label="Présentation">
            <div className="login-poster-logo">McBuleli</div>
          <p className="login-poster-lead">
              {isEn
                ? "Launch your operator workspace in minutes: 1-month free trial, then monthly billing via Mobile Money. McBuleli centralizes billing, payments, and operations for your ISP."
                : "Ouvrez votre espace opérateur en quelques minutes : essai gratuit 1 mois, puis abonnement mensuel en francs congolais ou dollars via Mobile Money. McBuleli centralise la facturation, les paiements et le suivi pour votre FAI."}
          </p>
        </section>
        <div className="login-stack">
          <header className="app-header app-header--login">
            <div>
                <h1>{isEn ? "Create your McBuleli workspace" : "Créer votre espace McBuleli"}</h1>
              <p className="app-meta">
                  {isEn
                    ? "Plans: Essential ($10/month) or Pro ($15/month). Premium is customized by contract."
                    : "Formules Essential (10 $/mois) ou Pro (15 $/mois). Premium est personnalisé sur contrat."}
              </p>
            </div>
              <div style={{ marginTop: 10 }}>
                <button type="button" onClick={() => setUiLang("fr")} disabled={uiLang === "fr"}>
                  FR
                </button>{" "}
                <button type="button" onClick={() => setUiLang("en")} disabled={uiLang === "en"}>
                  EN
                </button>
              </div>
          </header>
          {error && <p className="error">{error}</p>}
          {notice && <p>{notice}</p>}
          <form className="panel" onSubmit={onSubmit}>
              <h2>{isEn ? "Company / ISP" : "Entreprise / FAI"}</h2>
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
              <h2>{isEn ? "Administrator" : "Administrateur"}</h2>
            <input
                placeholder={isEn ? "Full name" : "Nom complet"}
              value={form.adminFullName}
              onChange={(e) => setForm({ ...form, adminFullName: e.target.value })}
              required
            />
            <input
              type="email"
                placeholder={isEn ? "Work email (login)" : "E-mail professionnel (connexion)"}
              value={form.adminEmail}
              onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
              required
            />
            <input
              type="password"
                placeholder={isEn ? "Password (min 6 chars)" : "Mot de passe (min. 6 caractères)"}
              value={form.adminPassword}
              onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
              required
            />
              <h2>{isEn ? "Plan" : "Formule"}</h2>
            <select value={form.packageCode} onChange={(e) => setForm({ ...form, packageCode: e.target.value })}>
                {!packages.length ? (
                  <option value="" disabled>
                    {isEn ? "No plans loaded" : "Aucune formule chargée"}
                  </option>
                ) : null}
              {packages.map((p) => (
                <option key={p.code} value={p.code}>
                    {isEn ? `${p.name} — $${p.monthlyPriceUsd}/month` : `${p.name} — ${p.monthlyPriceUsd} $ / mois`}
                </option>
              ))}
            </select>
            <p>
              <small>
                  {isEn
                    ? "Essential: 10 routers, field agents, roles, customers and finance with McBuleli Pawapay. Pro adds custom domain, own gateway, higher router limits and richer analytics."
                    : "Essential : 10 routeurs, agents terrain, rôles, clients et finances via Pawapay McBuleli. Pro ajoute domaine personnalisé, agrégateur propre, plus de routeurs et analyses avancées."}
              </small>
            </p>
              <button type="submit" disabled={!packages.length}>
                {isEn ? "Start free trial" : "Démarrer l'essai gratuit"}
              </button>
          </form>
          <p>
              <a href="/login">{isEn ? "Back to login" : "Retour à la connexion"}</a>
          </p>
        </div>
      </div>
    </main>
  );
}
