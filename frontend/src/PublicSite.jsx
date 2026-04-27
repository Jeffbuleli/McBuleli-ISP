import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import LangSwitch from "./LangSwitch.jsx";
import PublicSocialLinks from "./PublicSocialLinks.jsx";
import PublicHomePromos from "./PublicHomePromos.jsx";
import PublicMarketingSlot from "./PublicMarketingSlot.jsx";
import { mcbuleliLogoUrl } from "./brandAssets.js";
import { COMPANY_CONTACT } from "./companyContact.js";
import {
  IconBuilding,
  IconMail,
  IconPhone,
  IconPresentation,
  IconReceipt,
  IconUserCheck,
  IconWhatsApp
} from "./icons.jsx";

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
      title: "Mobile Money & TID",
      text: "Encaissements Pawapay, files TID, confirmations manuelles et callbacks pour activer le service sans délai."
    },
    en: {
      title: "Mobile Money & TID",
      text: "Pawapay collections, TID queues, manual confirmations and callbacks to activate service quickly."
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
      text: "Accréditations, agents terrain, gestion d'équipe, import CSV, audit et suivi des commissions."
    },
    en: {
      title: "Teams, agents & roles",
      text: "Accreditations, field agents, team management, CSV imports, audit and commission tracking."
    }
  },
  {
    icon: "brand",
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
    bodyFr: "Impayés, paiements confirmés, Mobile Money, files TID, abonnement plateforme et relances.",
    bodyEn: "Outstanding invoices, confirmed payments, Mobile Money, TID queue, platform billing and reminders."
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
        "La facturation et les suspensions automatiques nous ont fait gagner un temps précieux. L'équipe voit enfin la même vérité sur les impayés.",
      name: "Claire M.",
      role: "Directrice opérations, FAI urbain"
    },
    en: {
      quote:
        "Automated billing and suspensions saved us countless hours. Everyone finally sees the same picture on overdue accounts.",
      name: "Claire M.",
      role: "COO, urban ISP"
    }
  },
  {
    fr: {
      quote:
        "Le portail client et les paiements Mobile Money réduisent les appels « ma facture ». Les TID sont traitées sans doublon.",
      name: "Josué K.",
      role: "Responsable support"
    },
    en: {
      quote:
        "The customer portal and Mobile Money cut down 'where is my invoice?' calls. TIDs are handled without duplicates.",
      name: "Josué K.",
      role: "Support lead"
    }
  },
  {
    fr: {
      quote:
        "MikroTik et le suivi des événements de provisioning nous permettent de réactiver un abonné payé en quelques clics.",
      name: "Patrick N.",
      role: "Ingénieur réseau"
    },
    en: {
      quote:
        "MikroTik plus provisioning events let us turn a paid subscription back on in just a few clicks.",
      name: "Patrick N.",
      role: "Network engineer"
    }
  }
];

const FAQ_ITEMS = [
  {
    fr: {
      q: "Proposez-vous un essai ?",
      a: "Oui : les nouveaux espaces entreprise bénéficient d'une période d'essai (selon la configuration de la plateforme). Vous pouvez créer un compte et explorer le tableau de bord avant de souscrire."
    },
    en: {
      q: "Do you offer a trial?",
      a: "Yes—new workspaces get a trial period (per platform settings). Create an account and explore the dashboard before subscribing."
    }
  },
  {
    fr: {
      q: "Quels moyens de paiement sont pris en charge ?",
      a: "Mobile Money via Pawapay (selon réseaux configurés), virement, espèces, passerelles personnalisées avec callback, et file de vérification manuelle des TID."
    },
    en: {
      q: "Which payment methods are supported?",
      a: "Mobile Money via Pawapay (per configured networks), bank transfer, cash, custom gateways with callbacks, and a manual TID verification queue."
    }
  },
  {
    fr: {
      q: "McBuleli fonctionne-t-il avec MikroTik ?",
      a: "Oui : provisioning PPPoE et Hotspot via l'API REST, journal des événements, synchronisation optionnelle FreeRADIUS sur la même base PostgreSQL."
    },
    en: {
      q: "Does McBuleli work with MikroTik?",
      a: "Yes—PPPoE and Hotspot provisioning via REST API, event logs, and optional FreeRADIUS sync on the same PostgreSQL database."
    }
  },
  {
    fr: {
      q: "Les abonnés ont-ils un portail dédié ?",
      a: "Oui : factures, abonnements, paiement Mobile Money, envoi de TID et connexion par téléphone / jeton selon la configuration de votre FAI."
    },
    en: {
      q: "Is there a subscriber portal?",
      a: "Yes—invoices, subscriptions, Mobile Money checkout, TID submission, and phone or token-based login per your ISP setup."
    }
  },
  {
    fr: {
      q: "Plusieurs utilisateurs et rôles sont-ils possibles ?",
      a: "Oui : super-admin plateforme, gestionnaire, admin FAI, facturation, NOC, agents terrain, avec profils d'accréditation configurables."
    },
    en: {
      q: "Can we have multiple users and roles?",
      a: "Yes—platform super-admin, company manager, ISP admin, billing, NOC, field agents, with configurable accreditation profiles."
    }
  },
  {
    fr: {
      q: "Où sont hébergées les données ?",
      a: "Vous déployez le backend (par ex. Render, VPS) et la base PostgreSQL où vous le souhaitez. McBuleli est conçu pour rester sous votre contrôle opérationnel."
    },
    en: {
      q: "Where is data hosted?",
      a: "You run the backend (e.g. Render, VPS) and PostgreSQL where you choose. McBuleli is built to stay under your operational control."
    }
  }
];

function PublicLogo() {
  return (
    <img
      className="public-logo-img"
      src={mcbuleliLogoUrl}
      alt="McBuleli"
      width={48}
      height={48}
      loading="eager"
      decoding="async"
    />
  );
}

export default function PublicSite() {
  const [uiLang, setUiLang] = useState(getStoredUiLang);
  const [homeMarketing, setHomeMarketing] = useState({
    homePromos: [],
    footerBlocks: [],
    founderShowcase: { caption: "", imageUrl: null }
  });
  const isEn = uiLang === "en";
  const t = (fr, en) => (isEn ? en : fr);
  const statRows = useMemo(
    () => [
      {
        value: "24/7",
        label: t("Portail & paiements toujours accessibles", "Portal & payments always on")
      },
      {
        value: "10+",
        label: t("Modules métiers dans un seul produit", "Business modules in one product")
      },
      {
        value: "1",
        label: t("Une vision pour direction & terrain", "One view for leadership & field teams")
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

  const afterWhyMarketingBlocks = useMemo(
    () => sortedMarketingBlocks.filter((b) => b.placement === "after_why"),
    [sortedMarketingBlocks]
  );

  const preFooterMarketingBlocks = useMemo(
    () => sortedMarketingBlocks.filter((b) => b.placement !== "after_why"),
    [sortedMarketingBlocks]
  );

  const founderShowcase = homeMarketing.founderShowcase || { caption: "", imageUrl: null };
  const showFounderBlock = Boolean(
    String(founderShowcase.caption || "").trim() || founderShowcase.imageUrl
  );

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("ui_lang", uiLang);
    }
  }, [uiLang]);

  useEffect(() => {
    let cancelled = false;
    api
      .getPublicHomeMarketing()
      .then((data) => {
        if (!cancelled) {
          setHomeMarketing({
            homePromos: data.homePromos || [],
            footerBlocks: data.footerBlocks || [],
            founderShowcase: data.founderShowcase || { caption: "", imageUrl: null }
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHomeMarketing({
            homePromos: [],
            footerBlocks: [],
            founderShowcase: { caption: "", imageUrl: null }
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
            <a href="#promos">{t("Offres", "Offers")}</a>
            <a href="#interfaces">{t("Interfaces", "Workspaces")}</a>
            <a href="#pricing">{t("Tarifs", "Pricing")}</a>
            <a href="#testimonials">{t("Témoignages", "Testimonials")}</a>
            <a href="#faq">{t("FAQ", "FAQ")}</a>
            <a href="/buy/packages">{t("Wi‑Fi invité", "Guest Wi‑Fi")}</a>
            <a href="#contact">Contact</a>
          </nav>
          <div className="public-hero-toolbar">
            <PublicSocialLinks idPrefix="public" isEn={isEn} />
            <LangSwitch value={uiLang} onChange={setUiLang} idPrefix="public" />
          </div>
        </div>
        <div className="public-hero-grid">
          <section>
            <p className="eyebrow public-hero-eyebrow">
              {t(
                "Facturation · Réseau · Encaissements — conçu pour les FAI",
                "Billing · Network · Collections — built for ISPs"
              )}
            </p>
            <h1 className="public-hero-title">
              {t(
                "Alignez abonnés, trésorerie et infrastructure réseau sur une seule plateforme.",
                "Keep subscribers, cash flow and network infrastructure aligned on one platform."
              )}
            </h1>
            <p className="public-hero-lead">
              {t(
                "McBuleli centralise relances, Mobile Money, portail abonné, Wi‑Fi invité, équipes terrain et synchronisation MikroTik — avec la traçabilité attendue par les opérateurs sérieux.",
                "McBuleli unifies dunning, Mobile Money, the subscriber portal, guest Wi‑Fi, field teams and MikroTik sync—with the traceability serious operators expect."
              )}
            </p>
            <div className="public-cta">
              <a className="btn-primary" href="/signup">
                {t("Démarrer l'essai gratuit", "Start free trial")}
              </a>
              <a className="btn-secondary" href="/login">
                {t("Se connecter", "Login")}
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
              <p>{t("Paiement Mobile Money confirmé", "Mobile Money payment confirmed")}</p>
              <p>{t("Activation PPPoE / Hotspot automatique", "Automatic PPPoE / Hotspot activation")}</p>
              <p>{t("Portail client mis à jour", "Customer portal updated")}</p>
            </div>
          </aside>
        </div>
      </header>

      <PublicHomePromos t={t} isEn={isEn} apiPromos={homeMarketing.homePromos} />

      <section className="public-section public-section--split" id="services">
        <div>
          <p className="eyebrow">{t("Nos services", "Our services")}</p>
          <h2>{t("Tout ce qu'un FAI moderne doit maîtriser.", "Everything a modern ISP must control.")}</h2>
        </div>
        <p>
          {t(
            "Comme les plateformes FAI les plus abouties, McBuleli privilégie la simplicité, l'automatisation et une expérience digne d'une marque professionnelle — côté client et côté équipe.",
            "Like leading ISP platforms, McBuleli emphasizes simplicity, automation and a polished, professional experience—on the customer side and inside your team."
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
        <h2>{t("Pourquoi choisir McBuleli pour votre ISP ?", "Why choose McBuleli for your ISP?")}</h2>
        <ul>
          <li>{t("Moins de pertes de revenus grâce au suivi des paiements, TID et suspensions.", "Reduce revenue leakage with payment, TID and suspension tracking.")}</li>
          <li>{t("Équipe plus productive grâce à un tableau de bord unique pour dirigeants, agents et support.", "Make teams more productive with one dashboard for leaders, agents and support.")}</li>
          <li>
            {t(
              "Image professionnelle dès la première visite sur votre domaine ou sous-domaine.",
              "A professional first impression on your own domain or subdomain."
            )}
          </li>
        </ul>
      </section>

      {(afterWhyMarketingBlocks || []).map((block) => (
        <PublicMarketingSlot key={block.id} slot={{ ...block, isActive: true }} variant="footer" t={t} />
      ))}

      <section className="public-section" id="testimonials">
        <p className="eyebrow">{t("Ils utilisent McBuleli", "Teams using McBuleli")}</p>
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
                "Suite d'exploitation pour FAI : facturation, encaissements, portail abonné et réseau.",
                "Operations suite for ISPs: billing, collections, subscriber portal and network."
              )}
            </p>
            {showFounderBlock ? (
              <div className="public-footer-founder">
                {founderShowcase.imageUrl ? (
                  <div className="public-footer-founder-photoWrap">
                    <img
                      className="public-footer-founder-photo"
                      src={founderShowcase.imageUrl}
                      alt={String(founderShowcase.caption || "").trim() || ""}
                      width={80}
                      height={80}
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                ) : null}
                {String(founderShowcase.caption || "").trim() ? (
                  <p className="public-footer-founder-caption">{String(founderShowcase.caption).trim()}</p>
                ) : null}
              </div>
            ) : null}
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
              <span className="public-footer-card-value">{COMPANY_CONTACT.address}</span>
            </div>
          </div>
        </div>
        <div className="public-footer-legal">
          <p className="public-footer-copy">
            © {year} McBuleli — {t("Tous droits réservés.", "All rights reserved.")}
          </p>
          <p className="public-footer-rccm">
            RCCM : <span className="public-footer-rccm-id">{COMPANY_CONTACT.rccm}</span>
          </p>
          <p className="public-footer-powered">Powered by McBuleli</p>
        </div>
      </footer>
    </main>
  );
}
