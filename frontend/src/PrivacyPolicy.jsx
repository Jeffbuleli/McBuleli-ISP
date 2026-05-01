import { useEffect, useState } from "react";
import LangSwitch from "./LangSwitch.jsx";
import { mcbuleliLogoUrl } from "./brandAssets.js";
import { setIndependentPublicPageTitle } from "./pageTitle.js";
import { UI_LANG_SYNC_EVENT, getStoredUiLang } from "./uiLangSync.js";

export default function PrivacyPolicy() {
  const [uiLang, setUiLang] = useState(getStoredUiLang);
  const isEn = uiLang === "en";

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("ui_lang", uiLang);
      window.dispatchEvent(new Event(UI_LANG_SYNC_EVENT));
    }
  }, [uiLang]);

  useEffect(() => {
    setIndependentPublicPageTitle();
  }, []);

  const year = new Date().getFullYear();

  return (
    <main className="public-site public-site--dark privacy-page">
      <div className="public-sticky-bar-wrap">
        <div className="public-hero-top">
          <a className="public-brand" href="/">
            <img className="public-logo-img" src={mcbuleliLogoUrl} alt="" width={40} height={40} loading="eager" />
            <span>McBuleli</span>
          </a>
          <div className="privacy-page-toolbar">
            <LangSwitch value={uiLang} onChange={setUiLang} idPrefix="privacy" compact />
          </div>
        </div>
      </div>
      <article className="public-section privacy-policy-article">
        <h1 className="privacy-policy-h1">
          {isEn ? "Privacy policy" : "Politique de confidentialité"}
        </h1>
        <p className="privacy-policy-meta">{isEn ? "Last updated" : "Dernière mise à jour"} : April {year}</p>
        {isEn ? (
          <>
            <p>
              McBuleli handles the essentials your ISP already tracks every day — logins,
              invoicing notes, network touchpoints — so crews can troubleshoot without juggling half a dozen
              spreadsheets. This page summarizes that flow in readable language rather than boilerplate jargon.
            </p>
            <h2>Data we process</h2>
            <p>
              Contact details tied to workspaces, bookkeeping metadata surfaced on invoices or payment rails,
              operational breadcrumbs your operators already expect (sessions, ticketing notes, uploads you place
              into the dashboard) and telemetry headers your MikroTik stack sends when you configure it—nothing mystical.
            </p>
            <h2>Why we process it</h2>
            <p>
              We keep workspaces provisioned, money flowing, outages visible and support chats grounded in reality.
              We do not resell identifiable rows to advertisers.
            </p>
            <h2>Hosting & transfers</h2>
            <p>
              Geography follows your infra contract. If you bolt McBuleli onto a Tunis VPS, Tunis governs egress; plug it
              into Nairobi, Nairobi does. Coordinate legals with whoever holds the bare metal—not with the UI alone.
            </p>
            <h2>Retention</h2>
            <p>
              Mirrors your fiscal calendar, ticketing backlog and mandated telecom retention windows wherever you operate.
              Admins retain exports—the platform won’t magically erase subpoena-grade ledgers sooner than statute allows.
            </p>
            <h2>Your rights</h2>
            <p>
              Depending on locality you can request portability, corrections or suppression when law permits. Ping the
              address below and specify the workspace—we answer as quickly as a small ops team realistically can.
            </p>
            <h2>Contact</h2>
            <p>
              Privacy questions:{" "}
              <a href="mailto:mcbuleli@gmail.com">mcbuleli@gmail.com</a>
            </p>
          </>
        ) : (
          <>
            <p>
              McBuleli concentre ce qu’un FAI gère déjà au quotidien — identités, dossiers financiers et incidents réseau — pour
              qu’une petite équipe s’y retrouve sans tableurs éclatés partout.
            </p>
            <h2>Données traitées</h2>
            <p>
              Coordonnées liées aux espaces, métadonnées comptables apparaissant sur vos factures ou rails de paiement,
              traces d’activité indispensables aux audits, pièces importées dans l’outil : rien qui ne soit pas nécessaire aux opérations.
            </p>
            <h2>Pour quoi faire</h2>
            <p>
              Provisionner vos espaces clients, suivre paiements ou suspensions et donner aux équipes un fil conducteur
              quand ils enquêtent ou relancent. Aucune revente d’informations nominatives hors ce cadre.
            </p>
            <h2>Hébergement et transferts</h2>
            <p>
              La zone géographique suit votre contrat d’infra. Si vous montez tout sur Genève ou sur Accra,
              vos engagements locaux prévalent : assurez vos clauses avec l’opérateur qui tient vos machines physiques.
            </p>
            <h2>Conservation</h2>
            <p>
              Tant que le contrat existe, puis tant que vos obligations légales imposent de garder preuves,
              dossiers disputés ou historiques télécom réglementaires. Les admins peuvent exporter tant que la loi permet.
            </p>
            <h2>Vos droits</h2>
            <p>
              Selon votre juridiction : accès, rectification, portabilité ou effacement lorsque rien ne l&apos;interdit.
              Mentionnez l&apos;entreprise concernée depuis{" "}
              <a href="mailto:mcbuleli@gmail.com">mcbuleli@gmail.com</a> ; nous suivons vos demandes aussi vite que la petite équipe le permet.
            </p>
          </>
        )}
        <p className="privacy-policy-back-wrap">
          <a className="privacy-policy-back" href="/">
            ← {isEn ? "Back to homepage" : "Retour à l’accueil"}
          </a>
        </p>
      </article>
    </main>
  );
}
