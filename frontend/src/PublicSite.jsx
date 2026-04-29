import { useEffect, useMemo, useState } from "react";
import { api, publicAssetUrl } from "./api.js";
import LangSwitch from "./LangSwitch.jsx";
import { UI_LANG_SYNC_EVENT, getStoredUiLang } from "./uiLangSync.js";
import PublicSocialLinks from "./PublicSocialLinks.jsx";
import PublicMobileNavMenu from "./PublicMobileNavMenu.jsx";
import PublicHomePromos from "./PublicHomePromos.jsx";
import PublicMarketingSlot from "./PublicMarketingSlot.jsx";
import PublicCeoSection from "./PublicCeoSection.jsx";
import { mcbuleliLogoUrl } from "./brandAssets.js";
import { COMPANY_CONTACT } from "./companyContact.js";
import {
  IconBuilding,
  IconMail,
  IconMapPin,
  IconPhone,
  IconPresentation,
  IconReceipt,
  IconUserCheck,
  IconWhatsApp,
  IconMenuHamburger
} from "./icons.jsx";

const PUBLIC_NAV_LINKS = [
  { href: "#services", fr: "Services", en: "Services" },
  { href: "#promos", fr: "Offres", en: "Offers" },
  { href: "#interfaces", fr: "Interfaces", en: "Workspaces" },
  { href: "#pricing", fr: "Tarifs", en: "Pricing" },
  { href: "#testimonials", fr: "Témoignages", en: "Testimonials" },
  { href: "#faq", fr: "FAQ", en: "FAQ" },
  { href: "/buy/packages", fr: "Wi‑Fi invité", en: "Guest Wi‑Fi" },
  { href: "#contact", fr: "Contact", en: "Contact" }
];

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
    icon: "billing",
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
    icon: "payments",
    fr: {
      title: "Encaissements mobiles & références",
      text: "Paiements mobiles, files de références (TID), confirmation automatique ou manuelle, et rappels serveur sécurisés pour activer le service rapidement."
    },
    en: {
      title: "Mobile money & payment references",
      text: "Mobile payments, TID queues, automatic or manual verification, and secure server callbacks to activate service quickly."
    }
  },
  {
    icon: "network",
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
    icon: "portal",
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
    icon: "team",
    fr: {
      title: "Équipes, agents & rôles",
      text: "Accréditations, agents terrain, import CSV, validation des dépenses à deux niveaux, clôtures comptables et journal d’audit. Depuis peu : discussion d’équipe par entreprise, directement dans McBuleli."
    },
    en: {
      title: "Teams, agents & roles",
      text: "Accreditations, field agents, CSV imports, two-step expense approval, period locks and an audit trail. New: per-company team chat right in McBuleli."
    }
  },
  {
    icon: "brand",
    fr: {
      title: "Marque blanche & documents",
      text: "Logo, couleurs, domaines, portail Wi‑Fi invité et factures pro forma PDF aux couleurs de chaque entreprise."
    },
    en: {
      title: "White-label & documents",
      text: "Logo, colors, domains, guest Wi‑Fi portal and downloadable pro forma PDF invoices per company brand."
    }
  }
];

const CEO_BIO_FALLBACK = {
  bioFr:
    "Jeff Buleli mêle entrepreneurship et terrain : il façonne une suite qui aide les FAI africains à aligner trésorerie, terrain et fidélité abonnés.",
  bioEn:
    "Jeff blends product instincts with ISP operations—bringing billing clarity, crews and subscriber trust under one sane roof across Africa."
};

function ServiceIcon({ type }) {
  const common = { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true" };
  if (type === "payments") {
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="14" rx="3" stroke="currentColor" strokeWidth="2" />
        <path d="M3 10h18M8 15h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (type === "network") {
    return (
      <svg {...common}>
        <path d="M5 10a10 10 0 0 1 14 0M8 13a6 6 0 0 1 8 0M11 16a2 2 0 0 1 2 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="12" cy="19" r="1.5" fill="currentColor" />
      </svg>
    );
  }
  if (type === "portal") {
    return (
      <svg {...common}>
        <circle cx="12" cy="8" r="3" stroke="currentColor" strokeWidth="2" />
        <path d="M5 20a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (type === "team") {
    return (
      <svg {...common}>
        <circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="2" />
        <circle cx="17" cy="10" r="2" stroke="currentColor" strokeWidth="2" />
        <path d="M3 20a6 6 0 0 1 12 0M14 18a4 4 0 0 1 7 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (type === "brand") {
    return (
      <svg {...common}>
        <path d="M5 19h14M7 15l8-8 2 2-8 8H7v-2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14 6l2-2 4 4-2 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M7 3h8l4 4v14H7V3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M15 3v5h5M10 13h6M10 17h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const WORKSPACES = [
  {
    icon: "building",
    fr: "Espace entreprise",
    en: "Company workspace",
    bodyFr:
      "Vue dirigeante : revenus, clients, abonnements, dépenses, sites et indicateurs clés — au même endroit.",
    bodyEn: "Executive view: revenue, customers, subscriptions, expenses, sites and KPIs in one place."
  },
  {
    icon: "agents",
    fr: "Espace agents",
    en: "Field & agents",
    bodyFr: "Rôles, clients assignés, validations terrain et actions du quotidien, sans friction.",
    bodyEn: "Roles, assigned customers, field validations and day-to-day actions—without friction."
  },
  {
    icon: "demo",
    fr: "Mode démonstration",
    en: "Demo mode",
    bodyFr: "Présentation claire des modules pour vendre, former et embarquer une équipe rapidement.",
    bodyEn: "Clear walkthrough of modules for sales, training and fast team onboarding."
  },
  {
    icon: "billing",
    fr: "Facturation & encaissements",
    en: "Billing & collections",
    bodyFr:
      "Impayés, paiements confirmés, validation à deux étapes des dépenses, clôtures de période après inventaire, abonnement plateforme et relances.",
    bodyEn:
      "Overdue accounts, confirmed payments, two-step expense approval, accounting period locks after inventory checks, platform billing and dunning."
  }
];

function WorkspaceIcon({ type }) {
  const s = { width: 26, height: 26 };
  if (type === "agents") return <IconUserCheck {...s} />;
  if (type === "demo") return <IconPresentation {...s} />;
  if (type === "billing") return <IconReceipt {...s} />;
  return <IconBuilding {...s} />;
}

const TESTIMONIALS = [
  {
    fr: {
      quote:
        "On a enfin repris la main sur les impayés : la facturation et les coupures automatiques nous font gagner des heures chaque semaine, et tout le monde lit la même carte.",
      name: "Claire M.",
      role: "Directrice opérations, FAI urbain"
    },
    en: {
      quote:
        "We finally stopped chasing invoices blindly—automations and coordinated suspensions buy us serious time, and the whole desk sees one story.",
      name: "Claire M.",
      role: "Operations lead, urban ISP"
    }
  },
  {
    fr: {
      quote:
        "Les appels « où est ma facture ? » ont baissé : le portail et le Mobile Money règlent avant qu’il ne faille téléphoner trois fois.",
      name: "Josué K.",
      role: "Responsable support"
    },
    en: {
      quote:
        "Fewer 'where’s my invoice?' calls—the portal plus mobile money clears things before folks need another phone chase.",
      name: "Josué K.",
      role: "Support lead"
    }
  },
  {
    fr: {
      quote:
        "Les évènements provisioning et MikroTik parlent ensemble : quelqu’un paie → on peut rétablir l’accès sans bricoler le routeur depuis un SMS.",
      name: "Patrick N.",
      role: "Ingénieur réseau"
    },
    en: {
      quote:
        "Provisioning events tied to MikroTik logs mean paying a bill can flip service back without a router hunt over SMS chains.",
      name: "Patrick N.",
      role: "Network engineer"
    }
  }
];

const FAQ_ITEMS = [
  {
    fr: {
      q: "Proposez-vous un essai ?",
      a: "Oui : les nouveaux espaces bénéficient d’une période de test (durée suivant ce que définit votre hébergement McBuleli). Ouvrir un compte suffit pour se promener dans les écrans."
    },
    en: {
      q: "Do you offer a trial?",
      a: "Yes—fresh workspaces inherit a guided trial whose length mirrors what your McBuleli administrator configured. Signing up unlocks exploration before you subscribe."
    }
  },
  {
    fr: {
      q: "Quels paiements fonctionnent avec McBuleli ?",
      a: "Mobile Money où vous l’activez, virement, espèce, paiement en passerelle lorsque vos opérateurs le permettent, et une petite file qui fait relire vos références TID à un humain quand nécessaire."
    },
    en: {
      q: "Which payment rails can we use?",
      a: "Mobile money where enabled, transfers, cash, gateway flows when carriers expose them, and a lightweight queue whenever someone must eyeball a TID before crediting revenue."
    }
  },
  {
    fr: {
      q: "McBuleli connaît-il MikroTik ?",
      a: "Oui — PPPoE, Hotspot, profils réseau : on pousse vos réglages depuis l’API REST, conserve un journal lisible pour le support et, si vous déployez RADIUS là où vous décidez, la même base Postgres peut suivre vos sessions."
    },
    en: {
      q: "Does McBuleli integrate with MikroTik?",
      a: "Yes—think PPPoE, hotspot tiers, scripted pushes through the RouterOS REST hooks, searchable events for your helpdesk, optional FreeRADIUS sync when you bolt it onto the same Postgres footprint."
    }
  },
  {
    fr: {
      q: "Les abonnés ont-ils un portail leur parlant directement ?",
      a: "Oui — factures, statut du service, paiement Mobile Money, envoi TID, téléphone comme identifiant : vous choisissez ce qui doit apparaître pour le FAI actif."
    },
    en: {
      q: "Is there a subscriber-facing portal?",
      a: "They get invoices, service status, mobile payouts, TID flows, SMS-style phone logins—whatever you expose for each ISP persona."
    }
  },
  {
    fr: {
      q: "Plusieurs équipes peuvent-elles vivre ensemble sur la même instance ?",
      a: "Oui — direction, équipe facturation, NOC ou agents terrain reçoivent des rôles dédiés, et vous pouvez raffiner leurs périmètres sans dupliquer l’infra."
    },
    en: {
      q: "Can departments share one deployment?",
      a: "Yes—finance, provisioning, technicians and field reps each inherit tailored roles plus guardrails instead of spawning another standalone stack."
    }
  },
  {
    fr: {
      q: "Où restent tout simplement nos données ?",
      a: "Chez vous : vous décidez du serveur, du Postgres et du périmètre réseau. McBuleli doit rester un outillage que vous supervisez jusqu’aux sauvegardes."
    },
    en: {
      q: "Where does our data physically live?",
      a: "Wherever you provision the backend—you pick the Postgres host, VPC and backup cadence. McBuleli behaves like software you supervise end to end."
    }
  }
];

function PublicLogo() {
  return (
    <img
      className="public-logo-img"
      src={mcbuleliLogoUrl}
      alt=""
      width={48}
      height={48}
      loading="eager"
      decoding="async"
      aria-hidden="true"
    />
  );
}

export default function PublicSite() {
  const [publicMenuOpen, setPublicMenuOpen] = useState(false);
  const [uiLang, setUiLang] = useState(getStoredUiLang);
  const [homeMarketing, setHomeMarketing] = useState({
    homePromos: [],
    footerBlocks: [],
    founderShowcase: { caption: "", imageUrl: null },
    faqAds: []
  });
  const isEn = uiLang === "en";
  const t = (fr, en) => (isEn ? en : fr);
  const publicNavLabeled = useMemo(
    () => PUBLIC_NAV_LINKS.map((item) => ({ href: item.href, label: t(item.fr, item.en) })),
    [isEn]
  );
  const statRows = useMemo(
    () => [
      {
        value: "24/7",
        label: t("Portail abonné disponible jour et nuit", "Subscriber portal available anytime")
      },
      {
        value: "10+",
        label: t("Modules métier dans une même application", "Business modules inside one suite")
      },
      {
        value: "+",
        label: t(
          "Le produit bouge sans casser vos habitudes",
          "Keeps evolving without breaking your onboarding"
        )
      }
    ],
    [isEn]
  );

  const year = useMemo(() => new Date().getFullYear(), []);

  const sortedMarketingBlocks = useMemo(() => {
    const list = [...(homeMarketing.footerBlocks || [])];
    list.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    return list;
  }, [homeMarketing.footerBlocks]);

  const faqAds = homeMarketing.faqAds || [];

  const afterWhyMarketingBlocks = useMemo(
    () => sortedMarketingBlocks.filter((b) => b.placement === "after_why"),
    [sortedMarketingBlocks]
  );

  const preFooterMarketingBlocks = useMemo(
    () => sortedMarketingBlocks.filter((b) => b.placement !== "after_why"),
    [sortedMarketingBlocks]
  );

  const founderShowcase = homeMarketing.founderShowcase || { caption: "", imageUrl: null };
  const ceoHeadshotSrc = useMemo(() => {
    const raw = founderShowcase.imageUrl != null ? String(founderShowcase.imageUrl).trim() : "";
    if (!raw) return null;
    return publicAssetUrl(raw);
  }, [founderShowcase.imageUrl]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("ui_lang", uiLang);
      window.dispatchEvent(new Event(UI_LANG_SYNC_EVENT));
    }
  }, [uiLang]);

  useEffect(() => {
    if (!publicMenuOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [publicMenuOpen]);

  useEffect(() => {
    if (!publicMenuOpen) return undefined;
    function onKey(e) {
      if (e.key === "Escape") setPublicMenuOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [publicMenuOpen]);

  useEffect(() => {
    let cancelled = false;
    api
      .getPublicHomeMarketing()
      .then((data) => {
        if (!cancelled) {
          setHomeMarketing({
            homePromos: data.homePromos || [],
            footerBlocks: data.footerBlocks || [],
            founderShowcase: data.founderShowcase || { caption: "", imageUrl: null },
            faqAds: data.faqAds || []
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHomeMarketing({
            homePromos: [],
            footerBlocks: [],
            founderShowcase: { caption: "", imageUrl: null },
            faqAds: []
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="public-site public-site--dark">
      <div className="public-sticky-bar-wrap">
        <div className="public-hero-top">
          <a className="public-brand" href="/">
            <PublicLogo />
            <span>McBuleli</span>
          </a>
          <nav className="public-nav" aria-label={t("Navigation principale", "Main navigation")}>
            {PUBLIC_NAV_LINKS.map((item) => (
              <a key={item.href} href={item.href}>
                {t(item.fr, item.en)}
              </a>
            ))}
          </nav>
          <div className="public-hero-toolbar public-hero-toolbar-row">
            <PublicSocialLinks idPrefix="public" isEn={isEn} compact />
            <LangSwitch value={uiLang} onChange={setUiLang} idPrefix="public" compact />
            <button
              type="button"
              className="public-hero-menu-btn btn-icon-toolbar"
              aria-expanded={publicMenuOpen}
              onClick={() => setPublicMenuOpen(true)}
              aria-label={t("Ouvrir le menu", "Open menu")}
            >
              <IconMenuHamburger width={18} height={18} />
            </button>
          </div>
        </div>
      </div>
      <PublicMobileNavMenu
        open={publicMenuOpen}
        onClose={() => setPublicMenuOpen(false)}
        title={t("Navigation", "Navigation")}
        closeLabel={t("Fermer", "Close")}
        items={publicNavLabeled}
      />
      <header className="public-hero">
        <div className="public-hero-grid">
          <section>
            <p className="eyebrow public-hero-eyebrow">
              {t(
                "Facturation, réseau et équipes — sur une seule plateforme",
                "Billing, network and teams — in one place"
              )}
            </p>
            <h1 className="public-hero-title">
              {t(
                "Tout ce dont votre FAI a besoin pour avancer sereinement.",
                "Everything your ISP needs to move forward with confidence."
              )}
            </h1>
            <p className="public-hero-lead">
              {t(
                "Encaissements mobiles, portail abonnés, Wi‑Fi invité, terrain et synchronisation MikroTik : vos équipes voient l’essentiel au même endroit, sans se noyer dans les fichiers.",
                "Mobile collections, subscriber portal, guest Wi‑Fi, field work and MikroTik sync — your people see what matters in one place, without drowning in files."
              )}
            </p>
            <div className="public-cta">
              <a className="btn-primary" href="/signup">
                {t("Commencer", "Get started")}
              </a>
              <a className="btn-secondary" href="/login">
                {t("Se connecter", "Sign in")}
              </a>
              <a className="btn-secondary" href="/buy/packages">
                {t("Achat pass Wi‑Fi", "Buy Wi‑Fi pass")}
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
              <p>{t("Paiement mobile confirmé côté opérateur", "Operator-confirmed mobile payment")}</p>
              <p>{t("Activation PPPoE / Hotspot automatique", "Automatic PPPoE / Hotspot activation")}</p>
              <p>{t("Portail client mis à jour", "Customer portal updated")}</p>
            </div>
          </aside>
        </div>
      </header>

      <section className="public-whats-new" aria-label={t("Nouveautés produit", "Product updates")}>
        <p>
          <strong>{t("Nouveau", "New")}</strong>
          {" — "}
          {t(
            "Discussion d’équipe réservée à votre entreprise, dans le tableau de bord : vous échangez vite, voyez qui a lu — sans passer par un autre outil.",
            "Team-only chat inside the dashboard — quick messages and read receipts, no extra app."
          )}
        </p>
      </section>

      <PublicHomePromos t={t} isEn={isEn} apiPromos={homeMarketing.homePromos} />

      <section className="public-section public-section--split" id="services">
        <div>
          <p className="eyebrow">{t("Nos services", "Our services")}</p>
          <h2>{t("L’essentiel pour faire tourner un FAI aujourd’hui.", "What a modern ISP actually needs day to day.")}</h2>
        </div>
        <p>
          {t(
            "Les finances, le terrain et vos abonnés lisent la même vérité : moins de frictions, une marque propre et moins d’échanges inutiles.",
            "Finance, field teams and subscribers see the same story—less friction, a clean brand, fewer needless back‑and‑forths."
          )}
        </p>
      </section>

      <section className="public-grid public-grid--services">
        {SERVICES.map((service) => (
          <article className="public-card public-card--service" key={service.icon}>
            <span className="service-icon"><ServiceIcon type={service.icon} /></span>
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
            <article className="public-card public-card--workspace" key={item.fr}>
              <span className="workspace-icon" aria-hidden>
                <WorkspaceIcon type={item.icon} />
              </span>
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
        <p className="public-section-lead">
          {t(
            "Trois offres claires côte à côte : démarrez petit, passez au niveau supérieur quand votre parc réseau grandit.",
            "Three clear plans side by side—start small and move up as your network footprint grows."
          )}
        </p>
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
        <h2>{t("Pourquoi McBuleli ?", "Why McBuleli?")}</h2>
        <ul>
          <li>{t("Moins de pertes grâce au suivi des paiements, références et suspensions orchestrées.", "Less revenue leakage thanks to routed payments, reference queues and coordinated suspensions.")}</li>
          <li>{t("Une seule vérité financière pour la direction, le terrain et le support.", "One financial truth shared by executives, field teams and support.")}</li>
          <li>
            {t(
              "Image premium dès la première interaction sur votre domaine ou votre sous-domaine.",
              "A premium-first interaction on every browser session under your owned domain."
            )}
          </li>
        </ul>
      </section>

      <PublicCeoSection
        t={t}
        isEn={isEn}
        imageUrl={ceoHeadshotSrc}
        remoteCaption={founderShowcase.caption}
        ceoNameFr="Jeff Buleli"
        ceoNameEn="Jeff Buleli"
        roleFr="CEO / Fondateur"
        roleEn="CEO / Founder"
        bioFr={CEO_BIO_FALLBACK.bioFr}
        bioEn={CEO_BIO_FALLBACK.bioEn}
      />

      {(afterWhyMarketingBlocks || []).map((block) => (
        <PublicMarketingSlot key={block.id} slot={{ ...block, isActive: true }} variant="footer" t={t} />
      ))}

      <section className="public-section" id="testimonials">
        <p className="eyebrow">{t("Ils nous font confiance", "Teams that trust McBuleli")}</p>
        <h2>{t("Ce que disent les opérateurs", "What operators say")}</h2>
        <p className="public-section-lead">
          {t(
            "Des retours concrets sur la facturation, le portail client et le réseau — pas seulement des promesses marketing.",
            "Real feedback on billing, the customer portal and the network—not just marketing claims."
          )}
        </p>
        <div className="public-testimonials">
          {TESTIMONIALS.map((item, i) => (
            <blockquote className="public-quote-card" key={i}>
              <p className="public-quote-text">&ldquo;{isEn ? item.en.quote : item.fr.quote}&rdquo;</p>
              <footer>
                <strong>{isEn ? item.en.name : item.fr.name}</strong>
                <span>{isEn ? item.en.role : item.fr.role}</span>
              </footer>
            </blockquote>
          ))}
        </div>
      </section>

      <section className="public-section public-section--faq" id="faq">
        <div className="public-faq-layout">
          <div className="public-faq-main">
            <p className="eyebrow">{t("Questions fréquentes", "Frequently asked questions")}</p>
            <h2>{t("Réponses courtes, sans jargon inutile", "Straight answers, minimal jargon")}</h2>
            <div className="public-faq">
              {FAQ_ITEMS.map((item, i) => (
                <details className="public-faq-item" key={i}>
                  <summary>{isEn ? item.en.q : item.fr.q}</summary>
                  <p>{isEn ? item.en.a : item.fr.a}</p>
                </details>
              ))}
            </div>
          </div>
          {faqAds.length > 0 ? (
            <aside className="public-faq-ad-column" aria-label={t("Espace publicitaire", "Advertisement")}>
              {faqAds.map((ad) => {
                const capFr = ad.captionFr != null && String(ad.captionFr).trim() ? String(ad.captionFr).trim() : "";
                const capEn = ad.captionEn != null && String(ad.captionEn).trim() ? String(ad.captionEn).trim() : "";
                const altFr = ad.altTextFr != null && String(ad.altTextFr).trim() ? String(ad.altTextFr).trim() : "";
                const altEn = ad.altTextEn != null && String(ad.altTextEn).trim() ? String(ad.altTextEn).trim() : "";
                const legendFr = capFr || altFr;
                const legendEn = capEn || altEn;
                const legend = (isEn ? legendEn : legendFr).trim();
                const imgAlt = (isEn ? altEn || capEn : altFr || capFr) || t("Publicité", "Advertisement");
                const media = (
                  <span className="public-faq-ad-card__media">
                    <img src={ad.imageUrl} alt={imgAlt} loading="lazy" decoding="async" />
                  </span>
                );
                const caption =
                  legend.length > 0 ? (
                    <span className="public-home-promo-card__caption public-faq-ad-card__caption">{legend}</span>
                  ) : null;
                return (
                  <div key={ad.id} className="public-faq-ad-card">
                    {ad.linkUrl ? (
                      <a
                        href={ad.linkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="public-faq-ad-card__link"
                        aria-label={legend || imgAlt}
                      >
                        {media}
                        {caption}
                      </a>
                    ) : (
                      <>
                        {media}
                        {caption}
                      </>
                    )}
                  </div>
                );
              })}
            </aside>
          ) : null}
        </div>
      </section>

      {(preFooterMarketingBlocks || []).map((block) => (
        <PublicMarketingSlot key={block.id} slot={{ ...block, isActive: true }} variant="footer" t={t} />
      ))}

      <footer className="public-footer" id="contact">
        <div className="public-footer-main">
          <div className="public-footer-intro">
            <a className="public-brand public-brand--footer" href="/">
              <PublicLogo />
              <span>McBuleli</span>
            </a>
            <p className="public-footer-tagline">
              {t(
                "Tout pour encaisser, piloter vos sites et vos équipes depuis un tableau de bord unique—sans mille feuilles Excel ni messages perdus dans les groupes WhatsApp.",
                "Billing, network operations and teammate coordination converge in one place—without scattered spreadsheets or lost WhatsApp threads."
              )}
            </p>
          </div>
          <div className="public-footer-cards" role="group" aria-label={t("Coordonnées", "Contact details")}>
            <a
              className="public-footer-card"
              href={`mailto:${COMPANY_CONTACT.email}`}
              aria-label={`${t("Courriel", "Email")}: ${COMPANY_CONTACT.email}`}
            >
              <span className="public-footer-card-icon" aria-hidden="true">
                <IconMail width={24} height={24} />
              </span>
              <span className="public-footer-card-value">{COMPANY_CONTACT.email}</span>
            </a>
            <a
              className="public-footer-card"
              href={`tel:${COMPANY_CONTACT.phoneTel}`}
              aria-label={`${t("Téléphone", "Phone")}: ${COMPANY_CONTACT.phoneDisplay}`}
            >
              <span className="public-footer-card-icon" aria-hidden="true">
                <IconPhone width={24} height={24} />
              </span>
              <span className="public-footer-card-value">{COMPANY_CONTACT.phoneDisplay}</span>
            </a>
            <a
              className="public-footer-card"
              href={COMPANY_CONTACT.whatsapp}
              rel="noopener noreferrer"
              aria-label={`WhatsApp — ${t("Écrire à McBuleli", "Message McBuleli")}`}
            >
              <span className="public-footer-card-icon" aria-hidden="true">
                <IconWhatsApp width={24} height={24} />
              </span>
              <span className="public-footer-card-value">{t("Écrire à McBuleli", "Message McBuleli")}</span>
            </a>
            <div
              className="public-footer-card public-footer-card--static public-footer-card--address"
              role="group"
              aria-label={`${t("Siège", "Head office")}: ${COMPANY_CONTACT.address}`}
            >
              <span className="public-footer-card-icon" aria-hidden="true">
                <IconMapPin width={24} height={24} />
              </span>
              <span className="public-footer-card-value">{COMPANY_CONTACT.address}</span>
            </div>
          </div>
        </div>
        <div className="public-footer-legal">
          <p className="public-footer-legal-inner">
            <span className="public-footer-meta">
              © {year} McBuleli
            </span>
            <span className="public-footer-sep" aria-hidden="true">
              |
            </span>
            <a className="public-footer-meta public-footer-meta--link" href="/privacy">
              {t("Politique de confidentialité", "Privacy policy")}
            </a>
            <span className="public-footer-sep" aria-hidden="true">
              |
            </span>
            <span className="public-footer-meta public-footer-meta--muted">
              RCCM&nbsp;: <span className="public-footer-rccm-id">{COMPANY_CONTACT.rccm}</span>
            </span>
          </p>
        </div>
      </footer>
    </main>
  );
}
