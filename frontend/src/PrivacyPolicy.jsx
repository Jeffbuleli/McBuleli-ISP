import { useEffect, useState } from "react";
import LangSwitch from "./LangSwitch.jsx";
import { UI_LANG_SYNC_EVENT, getStoredUiLang } from "./uiLangSync.js";
import { mcbuleliLogoUrl } from "./brandAssets.js";

export default function PrivacyPolicy() {
  const [uiLang, setUiLang] = useState(getStoredUiLang);
  const isEn = uiLang === "en";

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("ui_lang", uiLang);
      window.dispatchEvent(new Event(UI_LANG_SYNC_EVENT));
    }
  }, [uiLang]);

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
              McBuleli processes limited personal information to operate its
              platform—authentication, invoicing and support—and to improve reliability and security. This page summarizes
              that processing in plain language.
            </p>
            <h2>Data we process</h2>
            <p>
              Typical categories include identifiers you provide during signup or support (such as email, telephone and
              company name), payment-related metadata needed by your workspace configuration, operational logs strictly
              required for auditing and troubleshooting, and content you knowingly upload within the product interface.
            </p>
            <h2>Why we process it</h2>
            <p>
              We use information to provision your workspace, deliver billing and network tooling, authenticate users,
              answer support requests and meet applicable legal retention duties. We do not sell personal information.
            </p>
            <h2>Hosting & cross-border transfers</h2>
            <p>
              Your deployment geography depends on infrastructure you configure (for example VPS or Render). Please ensure
              your contracts with infrastructure providers satisfy your locality requirements where applicable.
            </p>
            <h2>Retention</h2>
            <p>
              Retention aligns with bookkeeping, invoicing dispute windows and lawful regulatory minimums configured for
              your deployment. Administrators can export or request deletion paths subject to overriding legal retention.
            </p>
            <h2>Your rights</h2>
            <p>
              Depending on applicable law you may exercise access, correction, portability, restriction or erasure via
              the contact points listed on app.mcbuleli.live—we respond within commercially reasonable timelines.
            </p>
            <h2>Contact</h2>
            <p>
              Data protection enquiries:{' '}
              <a href="mailto:mcbuleli@gmail.com">mcbuleli@gmail.com</a>
            </p>
          </>
        ) : (
          <>
            <p>
              McBuleli (« nous ») traite uniquement les informations personnelles nécessaires au
              fonctionnement de la plateforme — authentification, facturation, support — ainsi qu’à la sécurité et à la
              fiabilité du service.
            </p>
            <h2>Données concernées</h2>
            <p>
              Sont habituellement concernés les identifiants fournis lors de l’inscription ou du support (courriel,
              téléphone, raison sociale), les métadonnées nécessaires à la configuration comptable et de paiement, les
              journaux techniques indispensables à l&apos;audit ainsi que tout contenu importé volontairement dans
              l&apos;interface.
            </p>
            <h2>Fins du traitement</h2>
            <p>
              Ces données permettent d&apos;activer l’espace client, de livrer les modules facturation / réseau,
              d’authentifier les profils, de répondre au support et de respecter nos obligations légales de conservation.
              Aucune revente de données à des fins publicitaires.
            </p>
            <h2>Hébergement et transferts</h2>
            <p>
              La géographie effective dépend de l&apos;infrastructure que vous sélectionnez pour le backend ; assurez la
              conformité contractuelle nécessaire côté hébergement lorsque vos activités ont un rattachement local strict.
            </p>
            <h2>Durées</h2>
            <p>
              La conservation se prolonge tant que la relation contractuelle existe et au-delà pour les durées
              comptables, réglementaires et contentieuses prescrites par la loi applicable à votre déploiement.
            </p>
            <h2>Vos droits</h2>
            <p>
              Selon le droit applicable, vous pouvez exercer vos droits d’accès, de rectification, de portabilité, de
              limitation ou de suppression lorsqu’aucune obligation légale contraire ne s’y oppose.
            </p>
            <h2>Contact</h2>
            <p>
              Questions données personnelles :{' '}
              <a href="mailto:mcbuleli@gmail.com">mcbuleli@gmail.com</a>
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
