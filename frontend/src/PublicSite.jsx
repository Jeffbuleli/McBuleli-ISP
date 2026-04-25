import { useEffect, useMemo, useState } from "react";

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

const SERVICES = [
  {
    icon: "01",
    fr: {
      title: "Facturation FAI complète",
      text: "Plans, abonnements, factures, renouvellements, suspensions et relances depuis un seul tableau de bord."
    },
    en: {
      title: "Complete ISP billing",
      text: "Plans, subscriptions, invoices, renewals, suspensions and reminders from one dashboard."
    }
  },
  {
    icon: "02",
    fr: {
      title: "Mobile Money & TID",
      text: "Encaissements Pawapay, files TID, confirmations manuelles et callbacks pour activer le service sans délai."
    },
    en: {
      title: "Mobile Money & TID",
      text: "Pawapay collections, TID queues, manual confirmations and callbacks to activate service quickly."
    }
  },
  {
    icon: "03",
    fr: {
      title: "MikroTik, Hotspot & PPPoE",
      text: "Provisioning réseau, bons d'accès, Wi-Fi invité, profils de débit et événements de synchronisation."
    },
    en: {
      title: "MikroTik, Hotspot & PPPoE",
      text: "Network provisioning, access vouchers, guest Wi-Fi, speed profiles and sync events."
    }
  },
  {
    icon: "04",
    fr: {
      title: "Portail client professionnel",
      text: "Les abonnés consultent leurs factures, paient, envoient une TID et gardent leur service à jour."
    },
    en: {
      title: "Professional customer portal",
      text: "Subscribers view invoices, pay, submit TIDs and keep service active."
    }
  },
  {
    icon: "05",
    fr: {
      title: "Équipes, agents & rôles",
      text: "Accréditations, agents terrain, gestion d'équipe, import CSV, audit et suivi des commissions."
    },
    en: {
      title: "Teams, agents & roles",
      text: "Accreditations, field agents, team management, CSV imports, audit and commission tracking."
    }
  },
  {
    icon: "06",
    fr: {
      title: "Marque blanche & domaines",
      text: "Logo, couleurs, sous-domaines, portail Wi-Fi et espace client personnalisés pour chaque entreprise."
    },
    en: {
      title: "White-label branding",
      text: "Logo, colors, subdomains, Wi-Fi portal and customer space customized for each company."
    }
  }
];

const WORKSPACES = [
  {
    fr: "Interface entreprise",
    en: "Company workspace",
    bodyFr: "Vue dirigeant pour suivre revenus, clients, abonnements, dépenses, sites et performance.",
    bodyEn: "Executive view for revenue, customers, subscriptions, expenses, sites and performance."
  },
  {
    fr: "Interface agents",
    en: "Agent workspace",
    bodyFr: "Accès terrain avec rôles, clients assignés, validations et actions quotidiennes.",
    bodyEn: "Field access with roles, assigned customers, validations and daily actions."
  },
  {
    fr: "Mode démo",
    en: "Demo mode",
    bodyFr: "Présentation claire des modules pour vendre, former et embarquer rapidement une équipe.",
    bodyEn: "Clear module presentation for sales, training and quick team onboarding."
  },
  {
    fr: "Facturation",
    en: "Billing",
    bodyFr: "Impayés, paiements confirmés, Mobile Money, TID, dépôts SaaS et relances automatisées.",
    bodyEn: "Outstanding invoices, confirmed payments, Mobile Money, TID, SaaS deposits and reminders."
  }
];

const COMPANY_CONTACT = {
  address: "Av. des Ecuries, Jolis Parcs, Ngaliema Kinshasa",
  email: "mcbuleli@gmail.com",
  phone: "+243997366736",
  whatsapp: "https://wa.me/mcbuleli"
};

function PublicLogo() {
  return <img className="public-logo-img" src="/mcbuleli-logo.svg" alt="McBuleli" />;
}

export default function PublicSite() {
  const [uiLang, setUiLang] = useState(getStoredUiLang);
  const isEn = uiLang === "en";
  const t = (fr, en) => (isEn ? en : fr);
  const statRows = useMemo(
    () => [
      { value: "24/7", label: t("Portails et paiements", "Portals and payments") },
      { value: "10+", label: t("Modules ISP intégrés", "Integrated ISP modules") },
      { value: "1", label: t("Plateforme pour toute l'équipe", "Platform for the whole team") }
    ],
    [isEn]
  );

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("ui_lang", uiLang);
    }
  }, [uiLang]);

  return (
    <main className="public-site">
      <header className="public-hero">
        <div className="public-hero-top">
          <a className="public-brand" href="/">
            <PublicLogo />
            <span>McBuleli</span>
          </a>
          <nav className="public-nav" aria-label="Navigation principale">
            <a href="#services">{t("Services", "Services")}</a>
            <a href="#interfaces">{t("Interfaces", "Workspaces")}</a>
            <a href="#pricing">{t("Tarifs", "Pricing")}</a>
            <a href="#contact">Contact</a>
          </nav>
          <div className="lang-switch">
            <button type="button" onClick={() => setUiLang("fr")} disabled={uiLang === "fr"}>
              FR
            </button>{" "}
            <button type="button" onClick={() => setUiLang("en")} disabled={uiLang === "en"}>
              EN
            </button>
          </div>
        </div>
        <div className="public-hero-grid">
          <section>
            <p className="eyebrow">{t("Billing, réseau et encaissements pour FAI", "Billing, network and collections for ISPs")}</p>
            <h1>{t("La plateforme professionnelle pour lancer, gérer et développer votre FAI.", "The professional platform to launch, manage and grow your ISP.")}</h1>
            <p className="public-hero-lead">
              {t(
                "McBuleli réunit facturation, Mobile Money, portail client, Wi-Fi invité, agents terrain, MikroTik et reporting financier dans une interface claire pour les entreprises internet.",
                "McBuleli brings billing, Mobile Money, customer portal, guest Wi-Fi, field agents, MikroTik and financial reporting into one clear workspace for internet companies."
              )}
            </p>
            <div className="public-cta">
              <a className="btn-primary" href="/signup">
                {t("Démarrer l'essai gratuit", "Start free trial")}
              </a>
              <a className="btn-secondary" href="/login">
                {t("Se connecter", "Login")}
              </a>
              <a className="btn-secondary" href="/portal">
                {t("Portail client", "Customer portal")}
              </a>
            </div>
            <div className="public-stats">
              {statRows.map((row) => (
                <strong key={row.label}>
                  {row.value}
                  <span>{row.label}</span>
                </strong>
              ))}
            </div>
          </section>
          <aside className="hero-dashboard" aria-label={t("Aperçu interface McBuleli", "McBuleli interface preview")}>
            <div className="hero-window-bar">
              <span />
              <span />
              <span />
            </div>
            <div className="hero-dashboard-head">
              <div>
                <small>{t("Tableau de bord FAI", "ISP dashboard")}</small>
                <h2>{t("Revenus & opérations", "Revenue & operations")}</h2>
              </div>
              <b>+18%</b>
            </div>
            <div className="hero-metrics">
              <span>{t("Clients actifs", "Active customers")}<strong>1 248</strong></span>
              <span>{t("Factures impayées", "Open invoices")}<strong>37</strong></span>
              <span>{t("Sites réseau", "Network sites")}<strong>12</strong></span>
            </div>
            <div className="hero-flow">
              <p>{t("Paiement Mobile Money confirmé", "Mobile Money payment confirmed")}</p>
              <p>{t("Activation PPPoE / Hotspot automatique", "Automatic PPPoE / Hotspot activation")}</p>
              <p>{t("Portail client mis à jour", "Customer portal updated")}</p>
            </div>
          </aside>
        </div>
      </header>

      <section className="public-section public-section--split" id="services">
        <div>
          <p className="eyebrow">{t("Nos services", "Our services")}</p>
          <h2>{t("Tout ce qu'un FAI moderne doit maîtriser.", "Everything a modern ISP must control.")}</h2>
        </div>
        <p>
          {t(
            "Inspiré des meilleures plateformes ISP internationales, McBuleli met l'accent sur la simplicité, l'automatisation et une présentation professionnelle pour vos clients comme pour vos équipes.",
            "Inspired by leading ISP platforms, McBuleli focuses on simplicity, automation and a professional experience for both customers and teams."
          )}
        </p>
      </section>

      <section className="public-grid public-grid--services">
        {SERVICES.map((service) => (
          <article className="public-card public-card--service" key={service.icon}>
            <span className="service-icon">{service.icon}</span>
            <h3>{isEn ? service.en.title : service.fr.title}</h3>
            <p>{isEn ? service.en.text : service.fr.text}</p>
          </article>
        ))}
      </section>

      <section className="public-section" id="interfaces">
        <p className="eyebrow">{t("Interfaces", "Workspaces")}</p>
        <h2>{t("Des interfaces propres pour chaque usage.", "Clean workspaces for every use case.")}</h2>
        <div className="public-grid">
          {WORKSPACES.map((item) => (
            <article className="public-card" key={item.fr}>
              <h3>{isEn ? item.en : item.fr}</h3>
              <p>{isEn ? item.bodyEn : item.bodyFr}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="public-section public-demo-section">
        <div>
          <p className="eyebrow">{t("Démonstration produit", "Product demo")}</p>
          <h2>{t("Une expérience lisible de la connexion à la facturation.", "A clear experience from login to billing.")}</h2>
          <p>
            {t(
              "Les pages de connexion, création de compte, portail client et Wi-Fi présentent clairement les actions importantes : se connecter, créer l'entreprise, payer une facture, envoyer une TID ou acheter un pass.",
              "Login, signup, customer portal and Wi-Fi pages clearly present key actions: sign in, create the company, pay an invoice, submit a TID or buy a pass."
            )}
          </p>
        </div>
        <div className="demo-board">
          <div className="demo-board-row"><span>{t("Entreprise", "Company")}</span><b>{t("Revenus, clients, sites", "Revenue, customers, sites")}</b></div>
          <div className="demo-board-row"><span>{t("Agents", "Agents")}</span><b>{t("Rôles, terrain, commissions", "Roles, field work, payouts")}</b></div>
          <div className="demo-board-row"><span>{t("Clients", "Customers")}</span><b>{t("Factures, paiements, TID", "Invoices, payments, TID")}</b></div>
          <div className="demo-board-row"><span>{t("Réseau", "Network")}</span><b>{t("MikroTik, PPPoE, Hotspot", "MikroTik, PPPoE, Hotspot")}</b></div>
        </div>
      </section>

      <section className="public-section" id="pricing">
        <p className="eyebrow">{t("Tarification transparente", "Transparent pricing")}</p>
        <h2>{t("Plans adaptés aux opérateurs en croissance.", "Plans built for growing operators.")}</h2>
        <div className="public-grid public-grid--pricing">
          {PUBLIC_PLANS.map((plan, index) => (
            <article className={`public-card pricing-card ${index === 1 ? "pricing-card--featured" : ""}`} key={plan.code}>
              {index === 1 ? <span className="plan-badge">{t("Populaire", "Popular")}</span> : null}
              <h3>{isEn ? plan.en.name : plan.fr.name}</h3>
              <p className="public-price">{isEn ? plan.en.price : plan.fr.price}</p>
              <p>{isEn ? plan.en.desc : plan.fr.desc}</p>
              <a className="btn-plan" href={plan.code === "premium_custom" ? "#contact" : "/signup"}>
                {plan.code === "premium_custom" ? t("Nous contacter", "Contact us") : t("Choisir ce plan", "Choose plan")}
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="public-section public-section--highlight">
        <h2>{t("Pourquoi choisir McBuleli pour votre ISP ?", "Why choose McBuleli for your ISP?")}</h2>
        <ul>
          <li>{t("Moins de pertes de revenus grâce au suivi des paiements, TID et suspensions.", "Reduce revenue leakage with payment, TID and suspension tracking.")}</li>
          <li>{t("Équipe plus productive grâce à un tableau de bord unique pour dirigeants, agents et support.", "Make teams more productive with one dashboard for leaders, agents and support.")}</li>
          <li>{t("Image professionnelle dès l'ouverture de app.mcbuleli.live.", "A professional image as soon as users open app.mcbuleli.live.")}</li>
        </ul>
      </section>

      <footer className="public-footer" id="contact">
        <div>
          <a className="public-brand public-brand--footer" href="/">
            <PublicLogo />
            <span>McBuleli</span>
          </a>
          <p>{t("Facturation et opérations professionnelles pour fournisseurs d'accès internet.", "Professional billing and operations for internet service providers.")}</p>
        </div>
        <address>
          <strong>{t("Informations de l'entreprise", "Company information")}</strong>
          <span>Adresse : {COMPANY_CONTACT.address}</span>
          <a href={`mailto:${COMPANY_CONTACT.email}`}>Email : {COMPANY_CONTACT.email}</a>
          <a href={`tel:${COMPANY_CONTACT.phone}`}>Tel : {COMPANY_CONTACT.phone}</a>
          <a href={COMPANY_CONTACT.whatsapp}>WhatsApp : {COMPANY_CONTACT.whatsapp}</a>
        </address>
      </footer>
    </main>
  );
}
