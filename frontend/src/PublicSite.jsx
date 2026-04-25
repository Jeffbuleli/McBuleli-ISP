import { useEffect, useState } from "react";

function getStoredUiLang() {
  if (typeof window === "undefined") return "fr";
  const saved = window.localStorage.getItem("ui_lang");
  return saved === "en" ? "en" : "fr";
}

const PUBLIC_PLANS = [
  {
    code: "essential",
    fr: {
      name: "Essential",
      price: "10 $/mois",
      desc: "Fonctions de base, facturation, clients, agents terrain et jusqu'à 10 routeurs/sites."
    },
    en: {
      name: "Essential",
      price: "$10/month",
      desc: "Core billing, customers, field agents and up to 10 routers/sites."
    }
  },
  {
    code: "pro",
    fr: {
      name: "Pro",
      price: "15 $/mois",
      desc: "Tous les avantages Essential, domaine personnalisé, agrégateur propre et plus de routeurs."
    },
    en: {
      name: "Pro",
      price: "$15/month",
      desc: "Everything in Essential, custom domain, own gateway and more routers."
    }
  },
  {
    code: "premium_custom",
    fr: {
      name: "Premium personnalisé",
      price: "Sur devis",
      desc: "Contrat sur mesure pour grands réseaux, intégrations et besoins spécifiques."
    },
    en: {
      name: "Custom Premium",
      price: "Custom quote",
      desc: "Tailored contract for large networks, integrations and specific requirements."
    }
  }
];

export default function PublicSite() {
  const [uiLang, setUiLang] = useState(getStoredUiLang);
  const isEn = uiLang === "en";
  const t = (fr, en) => (isEn ? en : fr);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("ui_lang", uiLang);
    }
  }, [uiLang]);

  return (
    <main className="public-site">
      <header className="public-hero">
        <div className="public-hero-top">
          <strong className="public-brand">McBuleli</strong>
          <div>
            <button type="button" onClick={() => setUiLang("fr")} disabled={uiLang === "fr"}>
              FR
            </button>{" "}
            <button type="button" onClick={() => setUiLang("en")} disabled={uiLang === "en"}>
              EN
            </button>
          </div>
        </div>
        <h1>{t("La plateforme ISP moderne pour facturer, encaisser et activer l'internet plus vite.", "The modern ISP platform to bill, collect payments, and activate internet faster.")}</h1>
        <p>
          {t(
            "McBuleli centralise la facturation, les abonnements, le Mobile Money, les TID, le portail client et la gestion réseau dans un seul outil.",
            "McBuleli centralizes billing, subscriptions, Mobile Money, TID, customer portal, and network operations in one tool."
          )}
        </p>
        <div className="public-cta">
          <a className="btn-primary" href="/signup">
            {t("Créer un compte", "Create account")}
          </a>
          <a className="btn-secondary" href="/login">
            {t("Se connecter", "Login")}
          </a>
        </div>
      </header>

      <section className="public-section">
        <h2>{t("Nos services", "Our services")}</h2>
        <div className="public-grid">
          <article className="public-card">
            <h3>{t("Facturation & abonnements", "Billing & subscriptions")}</h3>
            <p>{t("Créez plans, abonnements et factures, puis suivez les impayés en temps réel.", "Create plans, subscriptions and invoices, then track unpaid balances in real time.")}</p>
          </article>
          <article className="public-card">
            <h3>{t("Paiements multi-gateways", "Multi-gateway payments")}</h3>
            <p>{t("Mobile Money, ONAFRIQ, PayPal, crypto et autres avec callback sécurisé.", "Mobile Money, ONAFRIQ, PayPal, crypto and more with secure callbacks.")}</p>
          </article>
          <article className="public-card">
            <h3>{t("Activation réseau automatique", "Automatic network activation")}</h3>
            <p>{t("Après confirmation de paiement, la connexion internet est activée automatiquement.", "After payment confirmation, internet access is activated automatically.")}</p>
          </article>
        </div>
      </section>

      <section className="public-section">
        <h2>{t("Plans", "Plans")}</h2>
        <div className="public-grid">
          {PUBLIC_PLANS.map((plan) => (
            <article className="public-card" key={plan.code}>
              <h3>{isEn ? plan.en.name : plan.fr.name}</h3>
              <p className="public-price">{isEn ? plan.en.price : plan.fr.price}</p>
              <p>{isEn ? plan.en.desc : plan.fr.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="public-section public-section--highlight">
        <h2>{t("Pourquoi choisir McBuleli pour votre ISP ?", "Why choose McBuleli for your ISP?")}</h2>
        <ul>
          <li>{t("Moins de pertes de revenus grâce au suivi des paiements et TID.", "Reduce revenue leakage with payment and TID tracking.")}</li>
          <li>{t("Équipe plus productive grâce à un tableau de bord unique.", "Make your team more productive with one unified dashboard.")}</li>
          <li>{t("Montée en charge simple avec des plans adaptés à votre croissance.", "Scale easily with plans that match your growth.")}</li>
        </ul>
      </section>
    </main>
  );
}
