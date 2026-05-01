import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api, publicAssetUrl, setAuthToken, syncAuthTokenFromStorage } from "./api";
import PublicHomePromos from "./PublicHomePromos.jsx";
import TeamChatPanel from "./TeamChatPanel.jsx";
import AnalyticMetricCard from "./AnalyticMetricCard.jsx";
import { DEFINITION_GLOSSARY } from "./dashboardMetricCatalog.js";
import { formatUsd, formatGb, formatCount, formatIsoRange } from "./dashboardFormat.js";
import DashboardSideNav from "./DashboardSideNav.jsx";
import DashboardMobileSheetMenu from "./DashboardMobileSheetMenu.jsx";
import DashboardScreenGate from "./DashboardScreenGate.jsx";
import DashboardTopBar from "./DashboardTopBar.jsx";
import DashboardStickyBanner from "./DashboardStickyBanner.jsx";
import { DataTable } from "./ui/DataTable.jsx";
import { useDashboardMobilePath } from "./useDashboardMobilePath.js";
import { buildDashboardNavCategories } from "./dashboardNavCategories.js";
import PlatformHomeMarketingPanel from "./PlatformHomeMarketingPanel.jsx";
import PwaInstallPrompt from "./PwaInstallPrompt.jsx";
import PoweredByMcBuleli from "./PoweredByMcBuleli.jsx";
import { applyWorkspacePwaManifest } from "./pwaWorkspaceManifest.js";
import { mcbuleliLogoUrl } from "./brandAssets.js";
import GuestWifiShare from "./GuestWifiShare.jsx";
import { formatStaffRole } from "./staffRoleLabels.js";
import { sanitizeApiErrorForAudience } from "./httpErrorCopy.js";
import { clearPwaTeamChatBadge, onTeamChatUnreadTick } from "./teamChatAlerts.js";
import { UI_LANG_SYNC_EVENT, getStoredUiLang } from "./uiLangSync.js";
import { setIndependentPublicPageTitle, setWorkspaceTabTitle } from "./pageTitle.js";
import {
  IconArrowLeft,
  IconHome,
  IconMail,
  IconPhone
} from "./icons.jsx";

const DashboardHistograms = lazy(() => import("./DashboardHistograms.jsx"));

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(query);
    const fn = () => setMatches(mq.matches);
    fn();
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [query]);
  return matches;
}

function userInitials(fullName) {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function readDashboardNavCompact() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem("dashboard_nav_compact") === "1";
}

function isPlatformSuperRole(role) {
  return role === "super_admin" || role === "system_owner";
}

function workspaceHeaderTitle(branding, tenantContext, isps, selectedIspId, user) {
  const fromSession = user?.workspaceDisplayName != null ? String(user.workspaceDisplayName).trim() : "";
  if (fromSession && fromSession !== "AA") return fromSession;
  const fromBrand = branding?.displayName != null ? String(branding.displayName).trim() : "";
  if (fromBrand && fromBrand !== "AA") return fromBrand;
  const sid = selectedIspId || tenantContext?.ispId;
  const isp = sid && Array.isArray(isps) ? isps.find((i) => i.id === sid) : null;
  if (isp?.name) return String(isp.name).trim();
  const tc = tenantContext?.displayName != null ? String(tenantContext.displayName).trim() : "";
  if (tc && tc !== "AA") return tc;
  return "";
}

function tidSubmissionStatusLabel(status, isEn) {
  const s = String(status || "").toLowerCase();
  const m = {
    pending: { fr: "en attente", en: "pending" },
    approved_l1: { fr: "approuvé niveau 1", en: "approved level 1" },
    approved: { fr: "approuvé", en: "approved" },
    rejected: { fr: "rejeté", en: "rejected" },
    cancelled: { fr: "annulé", en: "cancelled" },
    expired: { fr: "expiré", en: "expired" }
  };
  const row = m[s];
  return row ? (isEn ? row.en : row.fr) : status || "—";
}

function paymentIntentStatusLabel(status, isEn) {
  return tidSubmissionStatusLabel(status, isEn);
}

function invoiceStatusShort(status, isEn) {
  const s = String(status || "").toLowerCase();
  const m = {
    unpaid: { fr: "impayée", en: "unpaid" },
    overdue: { fr: "en retard", en: "overdue" },
    paid: { fr: "payée", en: "paid" }
  };
  const row = m[s];
  return row ? (isEn ? row.en : row.fr) : status || "—";
}

/** Lien tel: à partir du numéro saisi dans l’image de marque (conserve + et chiffres). */
function telHrefFromBrandingPhone(phone) {
  const s = String(phone || "").trim();
  if (!s) return null;
  const cleaned = s.replace(/[^\d+]/g, "");
  if (!cleaned) return null;
  return `tel:${cleaned}`;
}

/** Replace placeholder tenant names (e.g. "AA") with McBuleli for public-facing titles. */
function resolvePublicBrandName(displayName) {
  const s = displayName != null ? String(displayName).trim() : "";
  if (!s || s === "AA") return "McBuleli";
  return displayName;
}

/** Preview URL for system_owner banner cards (data URL, legacy URL, or public slot route). */
function platformBannerThumbSrc(slot) {
  if (!slot) return "";
  const primary = slot.imageUrl != null ? String(slot.imageUrl).trim() : "";
  if (primary) return publicAssetUrl(primary);
  if (slot.slotIndex != null) return publicAssetUrl(`/api/public/platform-banner/${slot.slotIndex}`);
  return "";
}

function platformBannerHasStoredImage(slot) {
  if (!slot) return false;
  if (slot.hasImage === true) return true;
  const u = slot.imageUrl != null ? String(slot.imageUrl).trim() : "";
  return Boolean(u);
}

const DEFAULT_PAWAPAY_NETWORKS = [
  { key: "orange", label: "Orange Money" },
  { key: "airtel", label: "Airtel Money" },
  { key: "mpesa", label: "M-Pesa (Vodacom)" }
];

function usablePawapayNetworks(networks) {
  return Array.isArray(networks) && networks.length ? networks : DEFAULT_PAWAPAY_NETWORKS;
}

const EN_TEXT_MAP = {
  "Image de marque / marque blanche": "Tenant Branding / White-label",
  "Nom affiché": "Display name",
  "Sous-domaine (ex. admin1.votredomaine.com)": "Subdomain (e.g. admin1.yourdomain.com)",
  "Domaine personnalisé (facultatif)": "Custom domain (optional)",
  "Logo entreprise (depuis votre appareil)": "Company logo (from your device)",
  "Aperçu du logo": "Logo preview",
  "URL logo externe (facultatif, https://…)": "External logo URL (optional, https://...)",
  "Couleur principale (#hex)": "Primary color (#hex)",
  "Couleur secondaire (#hex)": "Secondary color (#hex)",
  "Pied de facture": "Invoice footer",
  "Adresse": "Address",
  "E-mail de contact": "Contact email",
  "Téléphone de contact": "Contact phone",
  "Redirection après paiement Wi‑Fi (https://…)": "Default post-payment Wi-Fi redirect (https://...)",
  "Enregistrer l'image de marque": "Save branding",
  "Moyens de paiement FAI": "ISP Payment Methods",
  "Espèces (cash)": "Cash",
  "Virement bancaire": "Bank transfer",
  "Portefeuille crypto": "Crypto wallet",
  "Mobile Money (générique)": "Mobile Money (generic)",
  "Gateway personnalisé": "Custom gateway",
  "Autre": "Other",
  "Nom du fournisseur": "Provider name",
  "Configuration JSON (ex : {\"apiKey\":\"xxx\"})": "Config JSON (e.g. {\"apiKey\":\"xxx\"})",
  "Ajouter un moyen de paiement": "Add payment method",
  "actif": "active",
  "inactif": "inactive",
  "Désactiver": "Disable",
  "Activer": "Enable",
  "Générer callback gateway": "Generate gateway callback",
  "Tester callback (activation)": "Test callback (activation)",
  "Copier URL": "Copy URL",
  "Copier secret": "Copy secret",
  "Profils d'habilitation": "Accreditation Profiles",
  "Clé de rôle (ex. field_agent)": "Role key (e.g. field_agent)",
  "Enregistrer le profil de rôle": "Save role profile",
  "Nœud réseau MikroTik": "MikroTik Network Node",
  "Nom du nœud": "Node name",
  "Hôte routeur (IP ou domaine)": "Router host (IP or domain)",
  "Port API": "API port",
  "Utilisateur routeur": "Router username",
  "Mot de passe routeur": "Router password",
  "Profil PPPoE par défaut": "Default PPPoE profile",
  "Profil hotspot par défaut": "Default hotspot profile",
  "Utiliser TLS": "Use TLS",
  "Définir comme nœud par défaut": "Set as default node",
  "Enregistrer le nœud": "Save node",
  "Par défaut": "Set default",
  "Collecter la télémétrie": "Collect telemetry",
  "Événements de provisionnement": "Provisioning Events",
  "Synchronisation FreeRADIUS": "FreeRADIUS Sync Events",
  "Télémétrie réseau (MikroTik)": "Network telemetry (MikroTik pull)",
  "Aucun instantané pour le moment.": "No snapshots yet.",
  "Comptabilité RADIUS (reçue)": "RADIUS accounting (ingested)",
  "Aucun enregistrement de comptabilité pour ce locataire.": "No accounting records yet for this tenant.",
  "Fournisseurs de notifications": "Notification Providers",
  "SID compte Twilio": "Twilio Account SID",
  "Jeton d'authentification Twilio": "Twilio Auth Token",
  "Numéro expéditeur Twilio (ou whatsapp:+…)": "Twilio From Number (or whatsapp:+...)",
  "SID service de messagerie (facultatif)": "Messaging Service SID (optional)",
  "Hôte SMTP": "SMTP host",
  "Port (défaut 587)": "Port (default 587)",
  "TLS (sécurisé)": "TLS (secure)",
  "Utilisateur SMTP (facultatif)": "SMTP user (optional)",
  "Mot de passe SMTP (facultatif)": "SMTP password (optional)",
  "Adresse expéditrice (obligatoire)": "From address (required)",
  "URL du webhook": "Webhook URL",
  "Nom d'en-tête d'authentification (facultatif)": "Auth header name (optional)",
  "Jeton d'authentification (facultatif)": "Auth token (optional)",
  "Actif": "Active",
  "Enregistrer le fournisseur": "Save provider",
  "Mobile Money manuel (TID)": "Manual Mobile Money (TID)",
  "Choisir une facture ouverte (impayée / en retard)": "Select open invoice (unpaid / overdue)",
  "Référence de transaction (TID)": "Transaction ID (TID)",
  "Téléphone payeur": "Payer mobile number",
  "Montant (facultatif)": "Amount (optional)",
  "Envoyer la TID": "Submit TID",
  "File de vérification des TID": "TID Verification Queue",
  "Mettre en file les rappels TID en attente": "Queue Pending TID Reminders",
  "Approuver": "Approve",
  "Rejeter": "Reject",
  "Conflits TID en double": "Duplicate TID Conflicts",
  "Générer des bons d'accès": "Generate Access Vouchers",
  "Appareils max par bon (défaut = limite de la formule)": "Max devices per voucher (defaults to plan limit)",
  "Défaut formule": "Plan default",
  "Générer les bons": "Generate vouchers",
  "Imprimer les bons inutilisés": "Print Unused Vouchers",
  "Utiliser un bon": "Redeem Voucher",
  "Code du bon": "Voucher code",
  "Utiliser par téléphone (FAI = locataire sélectionné)": "Redeem by phone (ISP context = selected tenant)",
  "Téléphone client (chiffres, indicatif)": "Customer phone (digits, country code)",
  "Mot de passe portail (obligatoire si absent, min. 6 car.)": "Set portal password (required if customer has none, min 6 chars)",
  "Utiliser le bon": "Redeem voucher",
  "Derniers bons": "Latest Vouchers",
  "Formule plateforme (facturation SaaS)": "Platform Package (Your SaaS Billing)",
  "Attribuer la formule": "Assign package",
  "Créer un utilisateur équipe": "Create Team User",
  "Nom complet": "Full name",
  "Mot de passe temporaire": "Temporary password",
  "Créer l'utilisateur": "Create user",
  "Équipe du FAI": "ISP Team Users",
  "Import / export équipe (CSV)": "Import / export team users (CSV)",
  "Télécharger le CSV équipe": "Download team users CSV",
  "Télécharger le modèle d'import": "Download import template",
  "Résultat de l'import": "Import result",
  "Fermer": "Close",
  "Lignes ignorées (premières ": "Skipped rows (first ",
  "erreur": "error",
  "erreurs": "errors",
  "Ligne ": "Row ",
  "Mot de passe par défaut pour les lignes sans (min. 6)": "Default password for rows without password (min 6)",
  "Importer le CSV équipe": "Import team CSV",
  "Dernier lien d'invitation :": "Latest Invite Link:",
  "Jeton :": "Token:",
  "Expire :": "Expires:",
  "Réinitialiser le mot de passe": "Reset Password",
  "Créer une invitation": "Create Invite",
  "Réactiver": "Reactivate",
  "Journal d'audit récent": "Recent Audit Logs",
  "File d'attente des notifications": "Notification Outbox",
  "En file :": "Queued:",
  "Envoyé :": "Sent:",
  "Échec :": "Failed:",
  "Traiter la file maintenant": "Process Outbox Now",
  "Envoyer une notification de test": "Send Test Notification",
  "Destinataire (téléphone ou e-mail)": "Recipient (phone or email)",
  "Envoyer le test": "Send test",
  "Clients": "Customers",
  "Abonnements actifs": "Active Subscriptions",
  "Factures impayées": "Outstanding Invoices",
  "Chiffre d'affaires (USD)": "Revenue (USD)",
  "Dépenses & suivi des fonds": "Expenses & fund reporting",
  "Du": "From",
  "Au": "To",
  "Appliquer la période": "Apply range",
  "Encaissé (paiements confirmés)": "Collected (confirmed payments)",
  "Total dépenses (saisies)": "Total expenses (logged)",
  "Net (encaissements − dépenses)": "Net (collections − expenses)",
  "Nouvelle dépense": "New expense entry",
  "Catégorie": "Category",
  "Montant (USD)": "Amount (USD)",
  "Description (facultatif)": "Description (optional)",
  "Début de période": "Period start",
  "Fin de période": "Period end",
  "Aligner sur le rapport": "Match report range",
  "Agent terrain": "Field agent",
  "Choisir un agent": "Select agent",
  "Commission % (base CA ou encaissements)": "Commission % (of revenue basis or collections)",
  "Base CA USD (facultatif, traçabilité)": "Revenue basis USD (optional, for documentation)",
  "Enregistrer la dépense": "Save expense",
  "Lignes sur la période": "Entries in range",
  "Supprimer": "Delete",
  "Créer un client": "Create Customer",
  "Téléphone (+243…)": "Phone (+243...)",
  "E-mail pour les renouvellements (facultatif)": "Email for renewal notices (optional)",
  "Mot de passe portail initial (facultatif, min. 6 car.)": "Initial portal password (optional, min 6 chars)",
  "Enregistrer le client": "Save customer",
  "Import / export clients (CSV)": "Import / export customers (CSV)",
  "Télécharger le CSV clients": "Download customers CSV",
  "Importer CSV": "Import CSV",
  "Mettre à jour l'e-mail client": "Update customer email",
  "E-mail (vide = effacer)": "Email (leave empty to clear)",
  "Enregistrer l'e-mail": "Save email",
  "Portail libre-service client": "Customer self-service portal",
  "Validité du lien en jours": "Link validity in days",
  "Générer le lien portail": "Generate portal link",
  "Générez un lien limité dans le temps pour consulter les factures et envoyer une TID Mobile Money.":
    "Generate a time-limited link to view invoices and submit a Mobile Money TID.",
  "Lien :": "Link:",
  "Expire le": "Expires",
  "Créer une formule Wi‑Fi / accès": "Create Wi‑Fi / access package",
  "Nom": "Name",
  "Prix (USD)": "Price (USD)",
  "Durée (jours)": "Duration (days)",
  "Libellé débit affiché aux clients (ex. 20 Mbps)": "Speed (label shown to guests, e.g. 20 Mbps)",
  "Limite technique (ex. 10M/10M)": "Technical rate limit (e.g. 10M/10M)",
  "Nombre max d'appareils": "Max authorized devices",
  "Disponible (pas épuisé)": "Available (not sold out)",
  "Indisponible (masqué à l'achat)": "Unavailable (hidden from buy page)",
  "Afficher sur la page d'achat Wi‑Fi publique": "Show on public Wi‑Fi purchase page",
  "URL après paiement (facultatif, sinon défaut FAI ou Google)": "After-pay redirect URL (optional, else ISP default or Google)",
  "Enregistrer la formule": "Save package",
  "Lien invité :": "Guest link:",
  "Modifier une formule": "Edit package",
  "Choisir une formule à modifier…": "Select plan to edit…",
  "Prix USD": "Price USD",
  "Libellé débit": "Speed label",
  "Limite de débit": "Rate limit",
  "Appareils max": "Max devices",
  "Disponible": "Available",
  "Indisponible": "Unavailable",
  "Publié sur la page Wi‑Fi": "Published on Wi‑Fi page",
  "URL après paiement": "After-pay redirect URL",
  "Enregistrer les modifications": "Save changes",
  "Créer un abonnement": "Create Subscription",
  "Activer l'abonnement": "Activate subscription",
  "Factures": "Invoices",
  "Montant": "Amount",
  "Statut": "Status",
  "Marquer payée": "Mark paid",
  "Payée": "Paid",
  "Abonnements": "Subscriptions",
  "Suspendre": "Suspend",
  "Sync activer": "Sync Activate",
  "Sync suspendre": "Sync Suspend",
  "Facturation FAI & opérations réseau": "ISP billing & network operations"
};

function translateToEnglish(input) {
  let out = String(input ?? "");
  for (const [fr, en] of Object.entries(EN_TEXT_MAP)) {
    out = out.split(fr).join(en);
  }
  return out;
}

/** Libellés types de moyen de paiement (liste déroulante + affichage) */
const PAYMENT_METHOD_TYPE_I18N = {
  cash: ["Espèces (cash)", "Cash"],
  mobile_money: ["Mobile Money", "Mobile Money"],
  binance_pay: ["Binance Pay", "Binance Pay"],
  bank_transfer: ["Virement bancaire", "Bank transfer"],
  crypto_wallet: ["Portefeuille crypto", "Crypto wallet"],
  visa_card: ["Visa Card", "Visa Card"]
};

function paymentMethodTypeText(mt, t) {
  const p = PAYMENT_METHOD_TYPE_I18N[mt];
  return p ? t(p[0], p[1]) : mt || "—";
}

function paymentMethodConfigFromForm(form) {
  const mt = String(form.methodType || "");
  const base = {
    note: String(form.note || "").trim(),
    validationEtaMinutes: Number(form.validationEtaMinutes || 15),
    checkoutSteps: []
  };
  if (mt === "cash") {
    return {
      ...base,
      checkoutSteps: [
        "Client reçoit le montant + référence facture.",
        "Agent terrain collecte et remet un reçu signé.",
        "Superviseur valide l'encaissement avant activation."
      ],
      collectionPoint: String(form.collectionPoint || "").trim(),
      collectionContact: String(form.collectionContact || "").trim(),
      collectorPolicy: String(form.collectorPolicy || "").trim()
    };
  }
  if (mt === "mobile_money") {
    return {
      ...base,
      checkoutSteps: [
        "Client envoie Mobile Money vers le numéro du FAI.",
        "Client partage la référence transaction.",
        "Agent validation confirme réception avant activation."
      ],
      mobileMoneyNumber: String(form.mobileMoneyNumber || "").trim(),
      accountName: String(form.accountName || "").trim(),
      networkHints: String(form.networkHints || "").trim()
    };
  }
  if (mt === "bank_transfer") {
    return {
      ...base,
      checkoutSteps: [
        "Client initie le virement au bénéficiaire FAI.",
        "Client transmet la référence bancaire.",
        "Finance FAI vérifie le crédit compte avant activation."
      ],
      bankName: String(form.bankName || "").trim(),
      accountName: String(form.accountName || "").trim(),
      accountNumber: String(form.accountNumber || "").trim(),
      iban: String(form.iban || "").trim(),
      swiftCode: String(form.swiftCode || "").trim()
    };
  }
  if (mt === "crypto_wallet" || mt === "binance_pay") {
    return {
      ...base,
      checkoutSteps: [
        "Client envoie le montant vers l'adresse officielle.",
        "Client partage le hash TX.",
        "FAI confirme transaction on-chain avant activation."
      ],
      walletAddress: String(form.walletAddress || "").trim(),
      walletNetwork: String(form.walletNetwork || "").trim(),
      memoTag: String(form.memoTag || "").trim()
    };
  }
  if (mt === "visa_card") {
    return {
      ...base,
      checkoutSteps: [
        "Client paie via terminal ou lien Visa.",
        "Client conserve le reçu/autorisation.",
        "FAI vérifie la capture avant activation."
      ],
      processorName: String(form.processorName || "").trim(),
      merchantLabel: String(form.merchantLabel || "").trim(),
      supportContact: String(form.supportContact || "").trim()
    };
  }
  return base;
}

const ROLE_PROFILE_OPTIONS = [
  { key: "field_agent", fr: "Agent terrain", en: "Field agent" },
  { key: "billing_agent", fr: "Agent facturation", en: "Billing agent" },
  { key: "noc_operator", fr: "Opérateur NOC", en: "NOC operator" },
  { key: "isp_admin", fr: "Administrateur FAI", en: "ISP administrator" },
  { key: "company_manager", fr: "Dirigeant entreprise", en: "Company manager" }
];

const ROLE_PERMISSION_OPTIONS = [
  { key: "collect_payment", fr: "Collecter paiements", en: "Collect payments" },
  { key: "review_payment_intent", fr: "Valider encaissements", en: "Review payment intents" },
  { key: "manage_customers", fr: "Gérer clients", en: "Manage customers" },
  { key: "manage_subscriptions", fr: "Gérer abonnements", en: "Manage subscriptions" }
];

function roleProfileLabel(roleKey, t) {
  const row = ROLE_PROFILE_OPTIONS.find((x) => x.key === roleKey);
  if (!row) return roleKey || "—";
  return t(row.fr, row.en);
}

function rolePermissionLabel(permissionKey, t) {
  const row = ROLE_PERMISSION_OPTIONS.find((x) => x.key === permissionKey);
  if (!row) return permissionKey || "—";
  return t(row.fr, row.en);
}

function accreditationLabel(level, t) {
  const k = String(level || "").toLowerCase();
  if (k === "basic") return t("Basique", "Basic");
  if (k === "standard") return t("Standard", "Standard");
  if (k === "senior") return t("Senior", "Senior");
  if (k === "manager") return t("Manager", "Manager");
  return level || "—";
}

function CsvImportResultBlock({ createdCount, skipped, errors, maxRows = 40, onDismiss, t }) {
  const tr = typeof t === "function" ? t : (_, en) => en;
  const sk = skipped || [];
  const er = errors || [];
  if (sk.length === 0 && er.length === 0 && !createdCount) return null;
  return (
    <div style={{ marginTop: 12, padding: 12, background: "#f8f9fb", fontSize: "0.9rem", borderRadius: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <strong>{tr("Résultat de l'import", "Import result")}</strong>
        {onDismiss ? (
          <button type="button" onClick={onDismiss}>
            {tr("Fermer", "Close")}
          </button>
        ) : null}
      </div>
      <p style={{ margin: "8px 0" }}>
        <strong>{createdCount}</strong>{" "}
        {createdCount === 1
          ? tr("ligne importée.", "row imported.")
          : tr("lignes importées.", "rows imported.")}{" "}
        {sk.length ? (
          <>
            <strong>{sk.length}</strong>{" "}
            {sk.length === 1 ? tr("ignorée.", "skipped.") : tr("ignorées.", "skipped.")}{" "}
          </>
        ) : null}
        {er.length ? (
          <>
            <strong>{er.length}</strong> {er.length === 1 ? tr("erreur.", "error.") : tr("erreurs.", "errors.")}
          </>
        ) : null}
      </p>
      {sk.length > 0 ? (
        <details open={sk.length <= 15} style={{ marginTop: 8 }}>
          <summary>
            {tr("Lignes ignorées (premières ", "Skipped rows (first ")}
            {Math.min(sk.length, maxRows)})
          </summary>
          <ul style={{ margin: "8px 0", paddingLeft: 20 }}>
            {sk.slice(0, maxRows).map((s, i) => (
              <li key={i}>
                {tr("Ligne ", "Row ")}
                {s.line} : {s.reason || tr("ignorée", "skipped")}
                {s.phone != null ? ` — ${tr("tél.", "phone")} ${s.phone}` : ""}
                {s.email != null ? ` — ${s.email}` : ""}
              </li>
            ))}
          </ul>
          {sk.length > maxRows ? (
            <p>
              … {tr("et ", "and ")}
              {sk.length - maxRows} {tr("autres ignorées.", "more skipped.")}
            </p>
          ) : null}
        </details>
      ) : null}
      {er.length > 0 ? (
        <details open style={{ marginTop: 8 }}>
          <summary>
            {tr("Erreurs (premières ", "Errors (first ")}
            {Math.min(er.length, maxRows)})
          </summary>
          <ul style={{ margin: "8px 0", paddingLeft: 20 }}>
            {er.slice(0, maxRows).map((e, i) => (
              <li key={i}>
                {tr("Ligne ", "Row ")}
                {e.line} : {e.message || tr("Erreur inconnue", "Unknown error")}
              </li>
            ))}
          </ul>
          {er.length > maxRows ? (
            <p>
              … {tr("et ", "and ")}
              {er.length - maxRows} {tr("autres erreurs.", "more errors.")}
            </p>
          ) : null}
        </details>
      ) : null}
    </div>
  );
}

const EXPENSE_CATEGORY_OPTIONS = [
  { value: "field_agent_fixed", labelFr: "Agent terrain — paiement fixe", labelEn: "Field agent — fixed payment" },
  {
    value: "field_agent_percentage",
    labelFr: "Agent terrain — pourcentage / commission",
    labelEn: "Field agent — percentage / commission"
  },
  { value: "equipment", labelFr: "Équipement", labelEn: "Equipment" },
  { value: "operations", labelFr: "Exploitation", labelEn: "Operations" },
  { value: "marketing", labelFr: "Marketing", labelEn: "Marketing" },
  { value: "utilities", labelFr: "Charges & services", labelEn: "Utilities & services" },
  { value: "transport", labelFr: "Transport", labelEn: "Transport" },
  { value: "salaries", labelFr: "Salaires", labelEn: "Payroll" },
  { value: "taxes", labelFr: "Impôts & taxes", labelEn: "Taxes" },
  { value: "other", labelFr: "Autre", labelEn: "Other" }
];

function expenseCategoryLabel(value, isEn) {
  const o = EXPENSE_CATEGORY_OPTIONS.find((x) => x.value === value);
  if (!o) return value;
  return isEn ? o.labelEn : o.labelFr;
}

function expenseApprovalStatusLabel(status, isEn) {
  const s = String(status || "");
  if (s === "approved") return isEn ? "Approved" : "Approuvée";
  if (s === "rejected") return isEn ? "Rejected" : "Rejetée";
  return isEn ? "Pending" : "En attente";
}

function withdrawalStatusLabel(status, isEn) {
  const s = String(status || "").toLowerCase();
  if (s === "completed" || s === "success" || s === "paid") return isEn ? "Completed" : "Terminé";
  if (s === "pending" || s === "processing") return isEn ? "Pending" : "En attente";
  if (s === "failed" || s === "cancelled" || s === "canceled") return isEn ? "Failed" : "Échoué";
  return status || "—";
}

// Legacy tenants pagination replaced by DataTable pagination.

function humanizeProvisioningEvent(ev, isEn) {
  const d = ev.details && typeof ev.details === "object" ? ev.details : {};
  const reason = d.reason || d.message;
  if (ev.status === "skipped") {
    if (reason === "No active network node configured") {
      return isEn
        ? "No active MikroTik node is set as default: the step was skipped. Save an active default node, then run synchronization again (activate / suspend)."
        : "Aucun nœud MikroTik actif n'est défini comme défaut : l'étape a été ignorée. Enregistrez un nœud actif puis relancez une synchronisation (activer / suspendre).";
    }
    return reason
      ? isEn
        ? `Step skipped: ${reason}`
        : `Étape ignorée : ${reason}`
      : isEn
        ? "Step skipped (no change applied on the router)."
        : "Étape ignorée (aucun changement appliqué sur le routeur).";
  }
  if (ev.status === "failed") {
    return reason
      ? isEn
        ? `Failed: ${reason}`
        : `Échec : ${reason}`
      : isEn
        ? "Failed to reach the router REST API (check host, port, TLS and credentials)."
        : "Échec de communication avec l'API REST du routeur (vérifiez l'hôte, le port, TLS et les identifiants).";
  }
  if (ev.status === "success") {
    const node = d.node || "";
    if (node) {
      return isEn
        ? `Applied on node "${node}" (${d.mode || "updated"}).`
        : `Appliqué sur le nœud « ${node} » (${d.mode || "mis à jour"}).`;
    }
    return isEn ? "Settings applied on the MikroTik router." : "Paramètres appliqués sur le routeur MikroTik.";
  }
  return "";
}

function humanizeRadiusSyncEvent(ev, isEn) {
  const d = ev.details && typeof ev.details === "object" ? ev.details : {};
  const reason = String(d.reason || "");
  if (ev.status === "skipped" && reason.includes("FREERADIUS_SYNC_ENABLED")) {
    return isEn
      ? "FreeRADIUS sync is disabled on the server (FREERADIUS_SYNC_ENABLED≠true). RADIUS entries are not updated automatically here."
      : "Synchronisation FreeRADIUS désactivée sur le serveur (FREERADIUS_SYNC_ENABLED≠true). Les entrées RADIUS ne sont pas mises à jour automatiquement ici.";
  }
  if (ev.status === "skipped") {
    return reason
      ? isEn
        ? `Sync skipped: ${reason}`
        : `Synchronisation ignorée : ${reason}`
      : isEn
        ? "Sync skipped."
        : "Synchronisation ignorée.";
  }
  if (ev.status === "success") {
    return isEn
      ? "FreeRADIUS record updated (secret, profile or state)."
      : "Entrée FreeRADIUS mise à jour (secret, profil ou état).";
  }
  if (ev.status === "failed") {
    return d.message
      ? isEn
        ? `FreeRADIUS error: ${d.message}`
        : `Échec FreeRADIUS : ${d.message}`
      : isEn
        ? "Failed while writing to FreeRADIUS tables."
        : "Échec lors de l'écriture dans les tables FreeRADIUS.";
  }
  return "";
}

const LOAD_FAILURE_LABELS_FR = {
  isps: "FAI",
  platformPackages: "paquets plateforme",
  superDashboard: "super tableau de bord",
  dashboard: "tableau de bord",
  customers: "clients",
  users: "utilisateurs",
  plans: "formules",
  subscriptions: "abonnements",
  invoices: "factures",
  paymentMethods: "moyens de paiement",
  notificationProviders: "notifications",
  networkNodes: "nœuds réseau",
  provisioningEvents: "provisionnement",
  radiusSyncEvents: "sync RADIUS",
  roleProfiles: "profils de rôles",
  platformSubscriptions: "abonnements plateforme",
  auditLogs: "journal d'audit",
  notificationOutbox: "file notifications",
  branding: "image de marque",
  networkStats: "stats réseau",
  tidSubmissions: "TID",
  tidConflicts: "conflits TID",
  vouchers: "bons",
  telemetry: "télémétrie",
  radiusAccounting: "compta RADIUS",
onlineSessions: "abonnés en ligne",
expenses: "dépenses",
accountingPeriodClosures: "clôtures comptables"
};

function glossaryTooltip(isEn, token) {
  const row = DEFINITION_GLOSSARY[token];
  if (!row) return undefined;
  return isEn ? row.en : row.fr;
}

function App() {
  const [user, setUser] = useState(null);
  const [tenantContext, setTenantContext] = useState(null);
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [loginWorkspaces, setLoginWorkspaces] = useState(null);
  const [mfaLogin, setMfaLogin] = useState(null);
  const [mfaCode, setMfaCode] = useState("");
  const [loginAuthStep, setLoginAuthStep] = useState("signin");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotNotice, setForgotNotice] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);
  const [dashboardSidebarSearch, setDashboardSidebarSearch] = useState("");
  const [tenantTable, setTenantTable] = useState({
    q: "",
    page: 1,
    pageSize: 10,
    sort: { key: "name", dir: "asc" }
  });
  const [dashboardNavCompact, setDashboardNavCompact] = useState(readDashboardNavCompact);
  const [publicAuthCopyForgot, setPublicAuthCopyForgot] = useState({ fr: "", en: "" });
  const [resetTokenState, setResetTokenState] = useState("");
  const [resetPasswordForm, setResetPasswordForm] = useState({ password: "", confirm: "" });
  const [teamRowDraft, setTeamRowDraft] = useState({});
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "" });
  const [isps, setIsps] = useState([]);
  const [selectedIspId, setSelectedIspId] = useState("");
  const [superDashboard, setSuperDashboard] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [customerTable, setCustomerTable] = useState({
    q: "",
    page: 1,
    pageSize: 10,
    sort: { key: "fullName", dir: "asc" }
  });
  const [users, setUsers] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [notificationProviders, setNotificationProviders] = useState([]);
  const [roleProfiles, setRoleProfiles] = useState([]);
  const [platformPackages, setPlatformPackages] = useState([]);
  const [platformSubscriptions, setPlatformSubscriptions] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [notificationOutbox, setNotificationOutbox] = useState([]);
  const [branding, setBranding] = useState(null);
  const [ispAnnouncements, setIspAnnouncements] = useState([]);
  const [ispAnnouncementsManage, setIspAnnouncementsManage] = useState([]);
  const [networkStats, setNetworkStats] = useState(null);
  const [networkNodes, setNetworkNodes] = useState([]);
  const [networkNodeTable, setNetworkNodeTable] = useState({
    q: "",
    page: 1,
    pageSize: 10,
    sort: { key: "name", dir: "asc" }
  });
  const [provisioningEvents, setProvisioningEvents] = useState([]);
  const [radiusSyncEvents, setRadiusSyncEvents] = useState([]);
  const [telemetrySnapshots, setTelemetrySnapshots] = useState([]);
  const [radiusAccountingIngest, setRadiusAccountingIngest] = useState([]);
  const [onlineSessions, setOnlineSessions] = useState([]);
  const [onlineSessionsWindowMinutes, setOnlineSessionsWindowMinutes] = useState(30);
  const [tidSubmissions, setTidSubmissions] = useState([]);
  const [tidConflicts, setTidConflicts] = useState([]);
  const [paymentIntents, setPaymentIntents] = useState([]);
  const [paymentIntentTable, setPaymentIntentTable] = useState({
    q: "",
    status: "all",
    page: 1,
    pageSize: 10,
    sort: { key: "createdAt", dir: "desc" }
  });
  const [accountingLedger, setAccountingLedger] = useState([]);
  const [accountingLedgerTotals, setAccountingLedgerTotals] = useState({ totalDebitUsd: 0, totalCreditUsd: 0 });
  const [ledgerTable, setLedgerTable] = useState({
    q: "",
    page: 1,
    pageSize: 10,
    sort: { key: "entryDate", dir: "desc" }
  });
  const [vouchers, setVouchers] = useState([]);
  const [voucherTable, setVoucherTable] = useState({
    q: "",
    page: 1,
    pageSize: 10,
    sort: { key: "status", dir: "asc" }
  });
  const [expenses, setExpenses] = useState([]);
  const [expenseTable, setExpenseTable] = useState({
    q: "",
    status: "all",
    page: 1,
    pageSize: 10,
    sort: { key: "createdAt", dir: "desc" }
  });
  const [withdrawals, setWithdrawals] = useState([]);
  const [withdrawalTable, setWithdrawalTable] = useState({
    q: "",
    page: 1,
    pageSize: 10,
    sort: { key: "createdAt", dir: "desc" }
  });
  const [expenseSummary, setExpenseSummary] = useState(null);
  const [expenseFilter, setExpenseFilter] = useState(() => ({
    from: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10)
  }));
  const [expenseForm, setExpenseForm] = useState({
    amountUsd: "",
    category: "operations",
    description: "",
    periodStart: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    periodEnd: new Date().toISOString().slice(0, 10),
    fieldAgentId: "",
    agentPayoutPercent: "",
    revenueBasisUsd: ""
  });
  const [accountingPeriodClosures, setAccountingPeriodClosures] = useState([]);
  const [periodCloseForm, setPeriodCloseForm] = useState({
    periodStart: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    periodEnd: new Date().toISOString().slice(0, 10),
    note: ""
  });
  const [plans, setPlans] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [invoiceTable, setInvoiceTable] = useState({
    q: "",
    status: "all",
    page: 1,
    pageSize: 10,
    sort: { key: "status", dir: "asc" }
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mobilePwaMenuOpen, setMobilePwaMenuOpen] = useState(false);
  const [teamChatOpen, setTeamChatOpen] = useState(false);
  const [teamChatUnread, setTeamChatUnread] = useState(0);
  const teamChatUnreadPrevRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [authBootstrapPending, setAuthBootstrapPending] = useState(
    () => typeof window !== "undefined" && Boolean(window.localStorage.getItem("token"))
  );
  const [uiLang, setUiLang] = useState(getStoredUiLang);
  const isEn = uiLang === "en";
  const dashLocale = isEn ? "en-US" : "fr-FR";
  const t = (fr, en) => (isEn ? en : fr);
  const audienceErr = useCallback(
    (msg) => sanitizeApiErrorForAudience(String(msg ?? ""), user, isEn),
    [user, isEn]
  );

  const dashboardChatIspId = useMemo(
    () => tenantContext?.ispId || selectedIspId || user?.ispId || isps[0]?.id || "",
    [tenantContext?.ispId, selectedIspId, user?.ispId, isps]
  );

  const invoiceTableView = useMemo(() => {
    const q = String(invoiceTable.q || "").trim().toLowerCase();
    const statusFilter = String(invoiceTable.status || "all").toLowerCase();
    let list = Array.isArray(invoices) ? invoices : [];
    if (statusFilter !== "all") {
      list = list.filter((inv) => String(inv?.status || "").toLowerCase() === statusFilter);
    }
    if (q) {
      list = list.filter((inv) => {
        const id = String(inv?.id || "").toLowerCase();
        const invStatus = String(inv?.status || "").toLowerCase();
        return id.includes(q) || invStatus.includes(q);
      });
    }

    const sKey = invoiceTable.sort?.key;
    const sDir = invoiceTable.sort?.dir === "desc" ? -1 : 1;
    if (sKey) {
      list = [...list].sort((a, b) => {
        const av = a?.[sKey];
        const bv = b?.[sKey];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * sDir;
        return String(av).localeCompare(String(bv)) * sDir;
      });
    }

    const pageSize = Number(invoiceTable.pageSize) || 10;
    const page = Math.max(1, Number(invoiceTable.page) || 1);
    const start = (page - 1) * pageSize;
    const pageRows = list.slice(start, start + pageSize);
    return { pageRows, total: list.length };
  }, [invoices, invoiceTable]);

  const networkNodeTableView = useMemo(() => {
    const q = String(networkNodeTable.q || "").trim().toLowerCase();
    let list = Array.isArray(networkNodes) ? networkNodes : [];
    if (q) {
      list = list.filter((n) => {
        const hay = `${n?.name || ""} ${n?.host || ""} ${n?.apiPort || ""} ${n?.username || ""} ${n?.isActive ? "active" : ""} ${
          n?.isDefault ? "default" : ""
        }`.toLowerCase();
        return hay.includes(q);
      });
    }
    const sKey = networkNodeTable.sort?.key;
    const sDir = networkNodeTable.sort?.dir === "desc" ? -1 : 1;
    if (sKey) {
      list = [...list].sort((a, b) => {
        const av = a?.[sKey];
        const bv = b?.[sKey];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * sDir;
        return String(av).localeCompare(String(bv)) * sDir;
      });
    }
    const pageSize = Number(networkNodeTable.pageSize) || 10;
    const page = Math.max(1, Number(networkNodeTable.page) || 1);
    const start = (page - 1) * pageSize;
    const pageRows = list.slice(start, start + pageSize);
    return { pageRows, total: list.length };
  }, [networkNodes, networkNodeTable.page, networkNodeTable.pageSize, networkNodeTable.q, networkNodeTable.sort]);

  const voucherTableView = useMemo(() => {
    const q = String(voucherTable.q || "").trim().toLowerCase();
    let list = Array.isArray(vouchers) ? vouchers : [];
    if (q) {
      list = list.filter((v) => {
        const hay = `${v?.code || ""} ${v?.rateLimit || ""} ${v?.durationDays || ""} ${v?.maxDevices || ""} ${v?.status || ""}`.toLowerCase();
        return hay.includes(q);
      });
    }
    const sKey = voucherTable.sort?.key;
    const sDir = voucherTable.sort?.dir === "desc" ? -1 : 1;
    if (sKey) {
      list = [...list].sort((a, b) => {
        const av = a?.[sKey];
        const bv = b?.[sKey];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * sDir;
        return String(av).localeCompare(String(bv)) * sDir;
      });
    }
    const pageSize = Number(voucherTable.pageSize) || 10;
    const page = Math.max(1, Number(voucherTable.page) || 1);
    const start = (page - 1) * pageSize;
    const pageRows = list.slice(start, start + pageSize);
    return { pageRows, total: list.length };
  }, [vouchers, voucherTable.page, voucherTable.pageSize, voucherTable.q, voucherTable.sort]);

  const expenseTableView = useMemo(() => {
    const q = String(expenseTable.q || "").trim().toLowerCase();
    const stFilter = String(expenseTable.status || "all");
    let list = Array.isArray(expenses) ? expenses : [];
    if (stFilter !== "all") list = list.filter((ex) => String(ex?.status || "pending") === stFilter);
    if (q) {
      list = list.filter((ex) => {
        const hay = `${ex?.description || ""} ${ex?.category || ""} ${ex?.fieldAgentName || ""} ${ex?.createdByName || ""} ${ex?.approvedByName || ""} ${ex?.rejectedByName || ""} ${
          ex?.rejectionNote || ""
        } ${ex?.periodStart || ""} ${ex?.periodEnd || ""} ${ex?.amountUsd || ""} ${ex?.status || ""}`.toLowerCase();
        return hay.includes(q);
      });
    }
    const sKey = expenseTable.sort?.key;
    const sDir = expenseTable.sort?.dir === "asc" ? 1 : -1;
    if (sKey) {
      list = [...list].sort((a, b) => {
        const av = a?.[sKey];
        const bv = b?.[sKey];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * sDir;
        return String(av).localeCompare(String(bv)) * sDir;
      });
    }
    const pageSize = Number(expenseTable.pageSize) || 10;
    const page = Math.max(1, Number(expenseTable.page) || 1);
    const start = (page - 1) * pageSize;
    const pageRows = list.slice(start, start + pageSize);
    return { pageRows, total: list.length };
  }, [expenses, expenseTable.page, expenseTable.pageSize, expenseTable.q, expenseTable.sort, expenseTable.status]);

  const paymentIntentTableView = useMemo(() => {
    const q = String(paymentIntentTable.q || "").trim().toLowerCase();
    const stFilter = String(paymentIntentTable.status || "all");
    let list = Array.isArray(paymentIntents) ? paymentIntents : [];
    if (stFilter !== "all") list = list.filter((it) => String(it?.status || "pending") === stFilter);
    if (q) {
      list = list.filter((it) => {
        const hay = `${it?.channel || ""} ${it?.externalRef || ""} ${it?.payerContact || ""} ${it?.status || ""} ${it?.amountUsd || ""}`.toLowerCase();
        return hay.includes(q);
      });
    }
    const sKey = paymentIntentTable.sort?.key;
    const sDir = paymentIntentTable.sort?.dir === "asc" ? 1 : -1;
    if (sKey) {
      list = [...list].sort((a, b) => {
        const av = a?.[sKey];
        const bv = b?.[sKey];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * sDir;
        return String(av).localeCompare(String(bv)) * sDir;
      });
    }
    const pageSize = Number(paymentIntentTable.pageSize) || 10;
    const page = Math.max(1, Number(paymentIntentTable.page) || 1);
    const start = (page - 1) * pageSize;
    const pageRows = list.slice(start, start + pageSize);
    return { pageRows, total: list.length };
  }, [paymentIntents, paymentIntentTable.page, paymentIntentTable.pageSize, paymentIntentTable.q, paymentIntentTable.sort, paymentIntentTable.status]);

  const ledgerTableView = useMemo(() => {
    const q = String(ledgerTable.q || "").trim().toLowerCase();
    let list = Array.isArray(accountingLedger) ? accountingLedger : [];
    if (q) {
      list = list.filter((it) => {
        const hay = `${it?.entryDate || ""} ${it?.journalType || ""} ${it?.accountCode || ""} ${it?.accountLabel || ""} ${it?.memo || ""}`.toLowerCase();
        return hay.includes(q);
      });
    }
    const sKey = ledgerTable.sort?.key;
    const sDir = ledgerTable.sort?.dir === "asc" ? 1 : -1;
    if (sKey) {
      list = [...list].sort((a, b) => {
        const av = a?.[sKey];
        const bv = b?.[sKey];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * sDir;
        return String(av).localeCompare(String(bv)) * sDir;
      });
    }
    const pageSize = Number(ledgerTable.pageSize) || 10;
    const page = Math.max(1, Number(ledgerTable.page) || 1);
    const start = (page - 1) * pageSize;
    const pageRows = list.slice(start, start + pageSize);
    return { pageRows, total: list.length };
  }, [accountingLedger, ledgerTable.page, ledgerTable.pageSize, ledgerTable.q, ledgerTable.sort]);

  const withdrawalTableView = useMemo(() => {
    const q = String(withdrawalTable.q || "").trim().toLowerCase();
    let list = Array.isArray(withdrawals) ? withdrawals : [];
    if (q) {
      list = list.filter((w) => {
        const hay = `${w?.amountUsd || ""} ${w?.currency || ""} ${w?.phoneNumber || ""} ${w?.provider || ""} ${w?.status || ""} ${w?.failureMessage || ""}`.toLowerCase();
        return hay.includes(q);
      });
    }
    const sKey = withdrawalTable.sort?.key;
    const sDir = withdrawalTable.sort?.dir === "asc" ? 1 : -1;
    if (sKey) {
      list = [...list].sort((a, b) => {
        const av = a?.[sKey];
        const bv = b?.[sKey];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * sDir;
        return String(av).localeCompare(String(bv)) * sDir;
      });
    }
    const pageSize = Number(withdrawalTable.pageSize) || 10;
    const page = Math.max(1, Number(withdrawalTable.page) || 1);
    const start = (page - 1) * pageSize;
    const pageRows = list.slice(start, start + pageSize);
    return { pageRows, total: list.length };
  }, [withdrawals, withdrawalTable.page, withdrawalTable.pageSize, withdrawalTable.q, withdrawalTable.sort]);

  const customerTableView = useMemo(() => {
    const q = String(customerTable.q || "").trim().toLowerCase();
    let list = Array.isArray(customers) ? customers : [];
    if (q) {
      list = list.filter((c) => {
        const hay = `${c?.fullName || ""} ${c?.phone || ""} ${c?.email || ""} ${c?.fieldAgentName || ""}`.toLowerCase();
        return hay.includes(q);
      });
    }
    const sKey = customerTable.sort?.key;
    const sDir = customerTable.sort?.dir === "desc" ? -1 : 1;
    if (sKey) {
      list = [...list].sort((a, b) => {
        const av = a?.[sKey];
        const bv = b?.[sKey];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * sDir;
        return String(av).localeCompare(String(bv)) * sDir;
      });
    }
    const pageSize = Number(customerTable.pageSize) || 10;
    const page = Math.max(1, Number(customerTable.page) || 1);
    const start = (page - 1) * pageSize;
    const pageRows = list.slice(start, start + pageSize);
    return { pageRows, total: list.length };
  }, [customers, customerTable.page, customerTable.pageSize, customerTable.q, customerTable.sort]);

  const fetchTeamChatUnread = useCallback(async () => {
    if (!user) return;
    const cid = tenantContext?.ispId || selectedIspId || user.ispId || isps[0]?.id;
    if (!cid) return;
    try {
      const r = await api.getTeamChatUnread(cid);
      setTeamChatUnread(typeof r.count === "number" ? r.count : 0);
    } catch (_e) {
      /* low priority */
    }
  }, [user, tenantContext?.ispId, selectedIspId, isps]);

  useEffect(() => {
    teamChatUnreadPrevRef.current = null;
  }, [dashboardChatIspId]);

  useEffect(() => {
    if (!user) {
      clearPwaTeamChatBadge();
      teamChatUnreadPrevRef.current = null;
      return;
    }
    if (!dashboardChatIspId) return;
    const n =
      typeof teamChatUnread === "number" && Number.isFinite(teamChatUnread) ? Math.max(0, teamChatUnread) : 0;
    onTeamChatUnreadTick({
      nextCount: n,
      prevUnreadRef: teamChatUnreadPrevRef,
      teamChatPanelOpen: teamChatOpen,
      notificationStrings: {
        title: isEn ? "Team chat" : "Discussion équipe",
        body:
          n <= 1
            ? isEn
              ? "New team message."
              : "Nouveau message équipe."
            : isEn
              ? `${n} unread team messages.`
              : `${n} nouveaux messages équipe.`
      }
    });
  }, [user, dashboardChatIspId, teamChatUnread, teamChatOpen, isEn]);

  useEffect(() => {
    if (!user) return undefined;
    void fetchTeamChatUnread();
    const iv = typeof window !== "undefined" ? window.setInterval(() => void fetchTeamChatUnread(), 10000) : null;
    return () => {
      if (iv) window.clearInterval(iv);
    };
  }, [user, fetchTeamChatUnread]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    function syncChatHash() {
      if (window.location.hash === "#team-chat") setTeamChatOpen(true);
    }
    syncChatHash();
    window.addEventListener("hashchange", syncChatHash);
    return () => window.removeEventListener("hashchange", syncChatHash);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    function onDashboardNavSelect(event) {
      const href = event?.detail?.href;
      if (href === "#team-chat") setTeamChatOpen(true);
    }
    window.addEventListener("dashboard-nav-select", onDashboardNavSelect);
    return () => window.removeEventListener("dashboard-nav-select", onDashboardNavSelect);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!teamChatOpen && window.location.hash === "#team-chat") {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
  }, [teamChatOpen]);

  const [customerForm, setCustomerForm] = useState({
    fullName: "",
    phone: "",
    email: "",
    initialPassword: "",
    fieldAgentId: ""
  });
  const [planForm, setPlanForm] = useState({
    name: "",
    priceUsd: "",
    durationDays: "",
    rateLimit: "",
    speedLabel: "",
    defaultAccessType: "pppoe",
    maxDevices: "1",
    isPublished: false,
    availabilityStatus: "available",
    successRedirectUrl: ""
  });
  const [planEditForm, setPlanEditForm] = useState({
    planId: "",
    name: "",
    priceUsd: "",
    durationDays: "",
    rateLimit: "",
    speedLabel: "",
    defaultAccessType: "pppoe",
    maxDevices: "1",
    isPublished: false,
    availabilityStatus: "available",
    successRedirectUrl: ""
  });
  const [subForm, setSubForm] = useState({ customerId: "", planId: "", accessType: "pppoe" });
  const [ispForm, setIspForm] = useState({ name: "", location: "", contactPhone: "" });
  const [generatedInvite, setGeneratedInvite] = useState(null);
  const [paymentMethodForm, setPaymentMethodForm] = useState({
    methodType: "cash",
    providerName: "Guichet espèces",
    accountName: "",
    bankName: "",
    accountNumber: "",
    iban: "",
    swiftCode: "",
    mobileMoneyNumber: "",
    networkHints: "",
    walletAddress: "",
    walletNetwork: "",
    memoTag: "",
    processorName: "",
    merchantLabel: "",
    supportContact: "",
    collectionPoint: "",
    collectionContact: "",
    collectorPolicy: "",
    validationEtaMinutes: "15",
    note: ""
  });
  const [gatewayCallbackByMethod, setGatewayCallbackByMethod] = useState({});
  const [notificationProviderForm, setNotificationProviderForm] = useState({
    channel: "sms",
    providerKey: "webhook",
    webhookUrl: "",
    authHeaderName: "Authorization",
    authToken: "",
    twilioAccountSid: "",
    twilioAuthToken: "",
    twilioFrom: "",
    twilioMessagingServiceSid: "",
    smtpHost: "",
    smtpPort: "587",
    smtpSecure: false,
    smtpUser: "",
    smtpPass: "",
    smtpFrom: "",
    isActive: true
  });
  const [roleProfileForm, setRoleProfileForm] = useState({
    roleKey: "field_agent",
    accreditationLevel: "basic",
    permissions: ["collect_payment"]
  });
  const [platformSubForm, setPlatformSubForm] = useState({
    packageId: "",
    durationDays: 30
  });
  const [statsPeriod, setStatsPeriod] = useState({
    from: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10)
  });
  const [brandingForm, setBrandingForm] = useState({
    displayName: "",
    logoUrl: "",
    primaryColor: "#1565d8",
    secondaryColor: "#162030",
    invoiceFooter: "",
    address: "",
    contactEmail: "",
    contactPhone: "",
    customDomain: "",
    subdomain: "",
    wifiPortalRedirectUrl: "",
    portalFooterText: "",
    portalClientRefPrefix: "",
    wifiZonePublic: true
  });
  /** Local object URL for logo file picker preview (revoked when replaced or after upload). */
  const [brandingLogoPickPreview, setBrandingLogoPickPreview] = useState(null);
  const [wifiZonePublicSaving, setWifiZonePublicSaving] = useState(false);

  useEffect(() => {
    const url = brandingLogoPickPreview;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [brandingLogoPickPreview]);

  const [platformBannerSlots, setPlatformBannerSlots] = useState([]);
  const [platformBannerEdits, setPlatformBannerEdits] = useState({});

  const [userForm, setUserForm] = useState({
    fullName: "",
    email: "",
    password: "",
    role: "billing_agent",
    accreditationLevel: "basic",
    phone: "",
    address: "",
    assignedSite: ""
  });
  const [tidForm, setTidForm] = useState({
    invoiceId: "",
    tid: "",
    submittedByPhone: "",
    amountUsd: ""
  });
  const [paymentIntentForm, setPaymentIntentForm] = useState({
    invoiceId: "",
    channel: "cash_agent",
    externalRef: "",
    payerContact: "",
    amountUsd: "",
    bankName: "",
    accountName: "",
    accountNumber: "",
    processorName: "",
    cardLast4: "",
    authCode: "",
    walletNetwork: "",
    walletAddress: "",
    collectorName: "",
    receiptNumber: "",
    collectionLocation: "",
    collectedAt: ""
  });
  const [voucherForm, setVoucherForm] = useState({
    planId: "",
    quantity: 1,
    maxDevices: ""
  });
  const [voucherRedeemForm, setVoucherRedeemForm] = useState({
    code: "",
    customerId: "",
    redeemByPhone: false,
    phone: "",
    newPassword: ""
  });
  const [portalTokenForm, setPortalTokenForm] = useState({ customerId: "", expiresDays: 30 });
  const [customerEmailForm, setCustomerEmailForm] = useState({
    customerId: "",
    email: "",
    fieldAgentId: ""
  });
  const customerCsvInputRef = useRef(null);
  const teamCsvInputRef = useRef(null);
  const [customerImportPassword, setCustomerImportPassword] = useState("");
  const [teamImportPassword, setTeamImportPassword] = useState("");
  const [teamImportRole, setTeamImportRole] = useState("billing_agent");
  const [customerImportReport, setCustomerImportReport] = useState(null);
  const [teamImportReport, setTeamImportReport] = useState(null);
  const [lastPortalIssue, setLastPortalIssue] = useState(null);
  const [saasPayForm, setSaasPayForm] = useState({
    methodType: "mobile_money",
    currency: "CDF",
    phoneNumber: "",
    networkKey: "orange",
    packageId: "",
    externalRef: "",
    payerContact: "",
    amountUsd: "",
    collectorName: "",
    receiptNumber: "",
    collectionLocation: "",
    bankName: "",
    accountName: "",
    accountNumber: "",
    processorName: "",
    cardLast4: "",
    authCode: "",
    walletNetwork: "",
    walletAddress: ""
  });
  const [saasDepositResult, setSaasDepositResult] = useState(null);
  const [platformBillingMethods, setPlatformBillingMethods] = useState([]);
  const [pawapayNetworks, setPawapayNetworks] = useState(DEFAULT_PAWAPAY_NETWORKS);
  const [withdrawalForm, setWithdrawalForm] = useState({
    amountUsd: "",
    currency: "USD",
    phoneNumber: "",
    networkKey: "orange",
    mfaCode: ""
  });
  const [totpSetup, setTotpSetup] = useState(null);
  const [totpSetupCode, setTotpSetupCode] = useState("");
  const [totpSetupLoading, setTotpSetupLoading] = useState(false);
  const [upgradePackageId, setUpgradePackageId] = useState("");
  const [platformBillingStatus, setPlatformBillingStatus] = useState(null);
  const [networkNodeForm, setNetworkNodeForm] = useState({
    name: "",
    host: "",
    apiPort: 443,
    useTls: true,
    username: "",
    password: "",
    defaultPppoeProfile: "default",
    defaultHotspotProfile: "default",
    isDefault: false,
    isActive: true
  });
  const [notificationTestForm, setNotificationTestForm] = useState({
    channel: "sms",
    recipient: "",
    message: "Message de test McBuleli."
  });
  const availablePawapayNetworks = pawapayNetworks.length ? pawapayNetworks : DEFAULT_PAWAPAY_NETWORKS;
  useEffect(() => {
    if (!platformBillingMethods.length) return;
    const allowed = platformBillingMethods
      .map((m) => m.methodType)
      .filter((mt) => ["mobile_money", "cash", "bank_transfer", "visa_card", "crypto_wallet", "binance_pay"].includes(mt));
    if (!allowed.length) return;
    if (!allowed.includes(saasPayForm.methodType)) {
      setSaasPayForm((prev) => ({ ...prev, methodType: allowed[0] }));
    }
  }, [platformBillingMethods, saasPayForm.methodType]);

  const dashboardLayoutStacked = useMediaQuery("(max-width: 1200px)");
  const isMobileShell = useMediaQuery("(max-width: 899px)");
  const { mobileScreen, navigateMobileScreen } = useDashboardMobilePath(isMobileShell);
  const dashboardNavCompactEffective = Boolean(dashboardNavCompact && !dashboardLayoutStacked && !isMobileShell);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("dashboard_nav_compact", dashboardNavCompact ? "1" : "0");
  }, [dashboardNavCompact]);

  function isStaleSessionErrorMessage(msg) {
    const m = String(msg || "").trim().toLowerCase();
    return m === "invalid token" || m.includes("invalid token") || m === "missing bearer token";
  }

  /** On /login bootstrap, avoid showing a red banner when the token is fine but the API is briefly down. */
  function shouldSilentClearSessionOnLoginPath(msg) {
    if (isStaleSessionErrorMessage(msg)) return true;
    const m = String(msg || "");
    if (/\(502\)|\(503\)|\(504\)/.test(m)) return true;
    const low = m.toLowerCase();
    if (low.includes("service indisponible") || low.includes("service unavailable")) return true;
    if (low.includes("passerelle invalide") || low.includes("bad gateway")) return true;
    if (low.includes("délai dépassé") || low.includes("gateway timeout")) return true;
    if (low.includes("impossible de joindre l'api") || low.includes("failed to fetch")) return true;
    return false;
  }

  async function refresh(selectedTenantId = selectedIspId, options = {}) {
    const silentInvalidSession = Boolean(options.silentInvalidSession);
    syncAuthTokenFromStorage();
    setLoading(true);
    setError("");
    try {
      const currentUser = await api.me();
      setUser(currentUser);
      const blocked =
        !isPlatformSuperRole(currentUser.role) &&
        currentUser.ispId &&
        currentUser.platformBilling &&
        currentUser.platformBilling.accessAllowed === false;
      if (blocked) {
        const sid = currentUser.ispId;
        setIsps([]);
        setSelectedIspId(sid);
        try {
          const [packages, platformSubs, snap, networks, withdrawalData, billingMethodsData] = await Promise.all([
            api.getPlatformPackages(),
            api.getPlatformSubscriptions(sid),
            api.getPlatformBillingStatus(sid),
            api.getPawapayNetworks(),
            api.getWithdrawals(sid),
            api.getPlatformBillingPaymentMethods(sid).catch(() => [])
          ]);
          setPlatformPackages(packages);
          setPlatformSubscriptions(platformSubs);
          setPlatformBillingStatus(snap);
          setPawapayNetworks(Array.isArray(networks) && networks.length ? networks : DEFAULT_PAWAPAY_NETWORKS);
          setWithdrawals(Array.isArray(withdrawalData?.items) ? withdrawalData.items : []);
          setPlatformBillingMethods(Array.isArray(billingMethodsData) ? billingMethodsData : []);
        } catch (_e) {
          /* billing endpoints stay reachable */
        }
        setIspAnnouncements([]);
        setIspAnnouncementsManage([]);
        setLoading(false);
        return;
      }

      const loadFailures = [];
      const take = (settled, index, fallback, label) => {
        const r = settled[index];
        if (r.status === "rejected") loadFailures.push(label);
        return r.status === "fulfilled" ? r.value : fallback;
      };

      const [allIspsResult, packagesResult] = await Promise.allSettled([
        api.getIsps(),
        api.getPlatformPackages()
      ]);
      const allIsps = take([allIspsResult], 0, [], "isps");
      const packages = take([packagesResult], 0, [], "platformPackages");
      const [networkOptionsResult] = await Promise.allSettled([api.getPawapayNetworks()]);
      setPawapayNetworks(take([networkOptionsResult], 0, DEFAULT_PAWAPAY_NETWORKS, "pawapayNetworks"));

      const activeIspId =
        tenantContext?.ispId || selectedTenantId || currentUser.ispId || allIsps[0]?.id || "";

      let superDash;
      if (isPlatformSuperRole(currentUser.role)) {
        const [sd] = await Promise.allSettled([api.getSuperDashboard()]);
        superDash = take([sd], 0, {
          totalIsps: allIsps.length,
          totalCustomers: 0,
          totalActiveSubscriptions: 0,
          totalRevenueUsd: 0
        }, "superDashboard");
      } else {
        superDash = {
          totalIsps: allIsps.length,
          totalCustomers: 0,
          totalActiveSubscriptions: 0,
          totalRevenueUsd: 0
        };
      }

      let dash = {};
      let c = [];
      let u = [];
      let p = [];
      let s = [];
      let i = [];
      let payMethods = [];
      let notifProviders = [];
      let nodes = [];
      let provEvents = [];
      let radiusEvents = [];
      let roles = [];
      let platformSubs = [];
      let logs = [];
      let outbox = [];
      let brand = null;
      let stats = null;
      let tids = [];
      let conflicts = [];
      let vchs = [];
      let telemetry = [];
      let radiusAcct = [];
      let onlineSessionsPayload = { windowMinutes: 30, items: [] };
      let withdrawalData = { items: [] };
      let paymentIntentRows = [];
      let ledgerPayload = { totals: { totalDebitUsd: 0, totalCreditUsd: 0 }, rows: [] };

      if (activeIspId) {
        const dashOpts = {
          from: statsPeriod.from,
          to: statsPeriod.to,
          sessionWindowMinutes: 30
        };
        if (currentUser.role === "field_agent") {
          const settled = await Promise.allSettled([
            api.getDashboard(activeIspId, dashOpts),
            api.getCustomers(activeIspId),
            api.getPlans(activeIspId),
            api.getSubscriptions(activeIspId),
            api.getInvoices(activeIspId),
            api.getPaymentIntents(activeIspId)
          ]);
          dash = take(settled, 0, {}, "dashboard");
          c = take(settled, 1, [], "customers");
          p = take(settled, 2, [], "plans");
          s = take(settled, 3, [], "subscriptions");
          i = take(settled, 4, [], "invoices");
          paymentIntentRows = take(settled, 5, [], "paymentIntents");
          setPaymentIntents(Array.isArray(paymentIntentRows) ? paymentIntentRows : []);
          setAccountingLedger([]);
          setAccountingLedgerTotals({ totalDebitUsd: 0, totalCreditUsd: 0 });
          setExpenses([]);
          setExpenseSummary(null);
          setAccountingPeriodClosures([]);
          setWithdrawals([]);
        } else {
        const settled = await Promise.allSettled([
          api.getDashboard(activeIspId, dashOpts),
          api.getCustomers(activeIspId),
          api.getUsers(activeIspId),
          api.getPlans(activeIspId),
          api.getSubscriptions(activeIspId),
          api.getInvoices(activeIspId),
          api.getPaymentMethods(activeIspId),
          api.getNotificationProviders(activeIspId),
          api.getNetworkNodes(activeIspId),
          api.getProvisioningEvents(activeIspId),
          api.getFreeRadiusSyncEvents(activeIspId),
          api.getRoleProfiles(activeIspId),
          api.getPlatformSubscriptions(activeIspId),
            currentUser.role === "system_owner" && activeIspId
              ? api.getAuditLogs(activeIspId)
              : Promise.resolve([]),
          api.getNotificationOutbox(activeIspId),
          api.getBranding(activeIspId),
          api.getNetworkStats(activeIspId, statsPeriod.from, statsPeriod.to),
          api.getTidSubmissions(activeIspId),
          api.getTidConflicts(activeIspId),
          api.getVouchers(activeIspId),
          api.getTelemetrySnapshots(activeIspId),
          api.getRadiusAccountingIngest(activeIspId, 80),
api.getOnlineSessions(activeIspId, 80, 30),
api.getExpenses(activeIspId, expenseFilter.from, expenseFilter.to),
api.getAccountingPeriodClosures(activeIspId),
api.getWithdrawals(activeIspId),
api.getPaymentIntents(activeIspId),
api.getAccountingLedger(activeIspId, expenseFilter.from, expenseFilter.to)
        ]);
        dash = take(settled, 0, {}, "dashboard");
        c = take(settled, 1, [], "customers");
        u = take(settled, 2, [], "users");
        p = take(settled, 3, [], "plans");
        s = take(settled, 4, [], "subscriptions");
        i = take(settled, 5, [], "invoices");
        payMethods = take(settled, 6, [], "paymentMethods");
        notifProviders = take(settled, 7, [], "notificationProviders");
        nodes = take(settled, 8, [], "networkNodes");
        provEvents = take(settled, 9, [], "provisioningEvents");
        radiusEvents = take(settled, 10, [], "radiusSyncEvents");
        roles = take(settled, 11, [], "roleProfiles");
        platformSubs = take(settled, 12, [], "platformSubscriptions");
        logs = take(settled, 13, [], "auditLogs");
        outbox = take(settled, 14, [], "notificationOutbox");
        brand = take(settled, 15, null, "branding");
        stats = take(settled, 16, null, "networkStats");
        tids = take(settled, 17, [], "tidSubmissions");
        conflicts = take(settled, 18, [], "tidConflicts");
        vchs = take(settled, 19, [], "vouchers");
        telemetry = take(settled, 20, [], "telemetry");
        radiusAcct = take(settled, 21, [], "radiusAccounting");
        onlineSessionsPayload = take(settled, 22, { windowMinutes: 30, items: [] }, "onlineSessions");
        const expData = take(settled, 23, { items: [], summary: null }, "expenses");
        const closuresList = take(settled, 24, [], "accountingPeriodClosures");
        withdrawalData = take(settled, 25, { cashbox: null, items: [] }, "withdrawals");
        paymentIntentRows = take(settled, 26, [], "paymentIntents");
        ledgerPayload = take(
          settled,
          27,
          { totals: { totalDebitUsd: 0, totalCreditUsd: 0 }, rows: [] },
          "accountingLedger"
        );
        setExpenses(Array.isArray(expData?.items) ? expData.items : []);
        setExpenseSummary(expData?.summary || null);
        setAccountingPeriodClosures(Array.isArray(closuresList) ? closuresList : []);
        setWithdrawals(Array.isArray(withdrawalData?.items) ? withdrawalData.items : []);
        setPaymentIntents(Array.isArray(paymentIntentRows) ? paymentIntentRows : []);
        setAccountingLedger(Array.isArray(ledgerPayload?.rows) ? ledgerPayload.rows : []);
        setAccountingLedgerTotals(ledgerPayload?.totals || { totalDebitUsd: 0, totalCreditUsd: 0 });
        if (withdrawalData?.cashbox) {
          dash = { ...dash, cashbox: withdrawalData.cashbox };
          }
        }
      } else {
        setExpenses([]);
        setExpenseSummary(null);
        setAccountingPeriodClosures([]);
        setWithdrawals([]);
        setPaymentIntents([]);
        setAccountingLedger([]);
        setAccountingLedgerTotals({ totalDebitUsd: 0, totalCreditUsd: 0 });
      }

      if (loadFailures.length) {
        const max = 10;
        const head = loadFailures
          .slice(0, max)
          .map((l) => LOAD_FAILURE_LABELS_FR[l] || l)
          .join(", ");
        const tail = loadFailures.length > max ? ` (+${loadFailures.length - max} de plus)` : "";
        setNotice(`Certaines rubriques n'ont pas pu être chargées (${head}${tail}). Les autres données ci-dessous sont à jour.`);
      }

      let ann = [];
      if (activeIspId) {
        try {
          const ar = await api.getAnnouncements(activeIspId);
          ann = ar.items || [];
        } catch (_e) {
          ann = [];
        }
      }
      setIspAnnouncements(ann);

      const canManageAnn =
        currentUser.role === "system_owner" ||
        ["super_admin", "company_manager", "isp_admin"].includes(currentUser.role);
      let annM = [];
      if (activeIspId && canManageAnn) {
        try {
          const am = await api.getAnnouncementsManage(activeIspId);
          annM = am.items || [];
        } catch (_e) {
          annM = [];
        }
      }
      setIspAnnouncementsManage(annM);

      if (activeIspId) {
        try {
          const ur = await api.getTeamChatUnread(activeIspId);
          setTeamChatUnread(typeof ur.count === "number" ? ur.count : 0);
        } catch (_e) {
          /* optional */
        }
      } else {
        setTeamChatUnread(0);
      }

      setIsps(allIsps);
      setSelectedIspId(activeIspId);
      setSuperDashboard(superDash);
      setDashboard(dash);
      setCustomers(c);
      setUsers(u);
      setPlans(p);
      setSubscriptions(s);
      setInvoices(i);
      setPaymentMethods(payMethods);
      setNotificationProviders(notifProviders);
      setNetworkNodes(nodes);
      setProvisioningEvents(provEvents);
      setRadiusSyncEvents(radiusEvents);
      setTelemetrySnapshots(telemetry);
      setRadiusAccountingIngest(radiusAcct);
      setOnlineSessions(Array.isArray(onlineSessionsPayload?.items) ? onlineSessionsPayload.items : []);
      setOnlineSessionsWindowMinutes(Number(onlineSessionsPayload?.windowMinutes) || 30);
      setRoleProfiles(roles);
      setPlatformPackages(packages);
      setPlatformSubscriptions(platformSubs);
      setAuditLogs(logs);
      setNotificationOutbox(outbox);
      setBranding(brand);
      setNetworkStats(stats);
      setTidSubmissions(tids);
      setTidConflicts(conflicts);
      setVouchers(vchs);
      if (activeIspId) {
        try {
          const snap = await api.getPlatformBillingStatus(activeIspId);
          setPlatformBillingStatus(snap);
        } catch (_e) {
          setPlatformBillingStatus(null);
        }
        try {
          const methods = await api.getPlatformBillingPaymentMethods(activeIspId);
          setPlatformBillingMethods(Array.isArray(methods) ? methods : []);
        } catch (_e) {
          setPlatformBillingMethods([]);
        }
      } else {
        setPlatformBillingStatus(null);
        setPlatformBillingMethods([]);
      }
      if (brand) {
        setBrandingForm({
          displayName: brand.displayName || "",
          logoUrl: brand.logoUrl || "",
          primaryColor: brand.primaryColor || "#1565d8",
          secondaryColor: brand.secondaryColor || "#162030",
          invoiceFooter: brand.invoiceFooter || "",
          address: brand.address || "",
          contactEmail: brand.contactEmail || "",
          contactPhone: brand.contactPhone || "",
          customDomain: brand.customDomain || "",
          subdomain: brand.subdomain || "",
          wifiPortalRedirectUrl: brand.wifiPortalRedirectUrl || "",
          portalFooterText: brand.portalFooterText || "",
          portalClientRefPrefix: brand.portalClientRefPrefix || "",
          wifiZonePublic: brand.wifiZonePublic !== false
        });
      }
    } catch (err) {
      if (silentInvalidSession && shouldSilentClearSessionOnLoginPath(err.message)) {
        setAuthToken("");
        setUser(null);
        if (typeof window !== "undefined") localStorage.removeItem("token");
      } else {
      setError(audienceErr(err.message));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("ui_lang", uiLang);
      window.dispatchEvent(new Event(UI_LANG_SYNC_EVENT));
    }
  }, [uiLang]);

  useEffect(() => {
    const sync = () => {
      const next = getStoredUiLang();
      setUiLang((prev) => (prev !== next ? next : prev));
    };
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    window.addEventListener(UI_LANG_SYNC_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener(UI_LANG_SYNC_EVENT, sync);
    };
  }, []);

  useEffect(() => {
    if (user) return;
    if (loginAuthStep !== "forgot") return;
    let cancelled = false;
    api
      .getPublicAuthCopy()
      .then((data) => {
        if (cancelled) return;
        setPublicAuthCopyForgot({
          fr: data.forgotPasswordBodyFr || "",
          en: data.forgotPasswordBodyEn || ""
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user, loginAuthStep]);

  const filteredTenants = useMemo(() => {
    const list = superDashboard?.tenants;
    if (!Array.isArray(list)) return [];
    const s = String(tenantTable.q || "").trim().toLowerCase();
    if (!s) return list;
    return list.filter((tenant) => {
      const admins = (tenant.adminUsers || [])
        .map((a) => `${a.fullName || ""} ${a.email || ""}`)
        .join(" ");
      const hay = `${tenant.name || ""} ${tenant.location || ""} ${tenant.contactPhone || ""} ${
        tenant.subscriptionStatus || ""
      } ${tenant.packageName || ""} ${admins}`.toLowerCase();
      return hay.includes(s);
    });
  }, [superDashboard?.tenants, tenantTable.q]);

  const tenantTableView = useMemo(() => {
    const list = Array.isArray(filteredTenants) ? filteredTenants : [];
    const sKey = tenantTable.sort?.key;
    const sDir = tenantTable.sort?.dir === "desc" ? -1 : 1;
    let sorted = list;
    if (sKey) {
      sorted = [...list].sort((a, b) => {
        const av = a?.[sKey];
        const bv = b?.[sKey];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * sDir;
        return String(av).localeCompare(String(bv)) * sDir;
      });
    }
    const pageSize = Number(tenantTable.pageSize) || 10;
    const page = Math.max(1, Number(tenantTable.page) || 1);
    const start = (page - 1) * pageSize;
    const pageRows = sorted.slice(start, start + pageSize);
    return { pageRows, total: sorted.length };
  }, [filteredTenants, tenantTable.page, tenantTable.pageSize, tenantTable.sort]);

  useEffect(() => {
    async function bootstrap() {
      try {
        const tenant = await api.getTenantContext();
        if (tenant?.matched) {
          setTenantContext(tenant);
        }
      } catch (_err) {
        // Ignore tenant-context bootstrap failures.
      }
      if (localStorage.getItem("token")) {
        const path = typeof window !== "undefined" ? window.location.pathname || "" : "";
        const isLoginPath = path === "/login" || path.startsWith("/login/");
        try {
          await refresh(selectedIspId, { silentInvalidSession: isLoginPath });
        } catch (_err) {
          setAuthToken("");
          setUser(null);
          localStorage.removeItem("token");
        }
      }
      setAuthBootstrapPending(false);
    }
    bootstrap();
  }, []);

  useLayoutEffect(() => {
    if (!import.meta.env.PROD) return;
    const link = document.querySelector('link[rel="manifest"]');
    if (!user || user.mustChangePassword) {
      const tenantTitle = tenantContext?.matched
        ? workspaceHeaderTitle(null, tenantContext, [], tenantContext.ispId, null)
        : "";
      const t = tenantTitle && tenantTitle !== "AA" ? tenantTitle : "";
      if (t) {
        applyWorkspacePwaManifest(t);
      } else if (link) {
        link.href = "/api/public/pwa-manifest";
      }
      return;
    }
    if (loading || loginWorkspaces || mfaLogin) return;
    const title = workspaceHeaderTitle(branding, tenantContext, isps, selectedIspId, user);
    applyWorkspacePwaManifest(title);
  }, [
    user,
    loading,
    loginWorkspaces,
    mfaLogin,
    branding,
    tenantContext,
    isps,
    selectedIspId,
    user?.mustChangePassword,
    user?.workspaceDisplayName,
    tenantContext?.matched,
    tenantContext?.ispId,
    tenantContext?.displayName
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const path = window.location.pathname || "";
    if (path !== "/login" && !path.startsWith("/login/")) return;
    const token = new URLSearchParams(window.location.search).get("reset");
    if (token && token.length >= 32) {
      setResetTokenState(token);
      setLoginAuthStep("reset");
    }
  }, []);

  useEffect(() => {
    if (user?.role !== "system_owner") {
      setPlatformBannerSlots([]);
      setPlatformBannerEdits({});
      return;
    }
    let cancelled = false;
    api
      .getSystemOwnerDashboardBanners()
      .then((data) => {
        if (!cancelled) setPlatformBannerSlots(data.slots || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user?.role, user?.id]);

  useEffect(() => {
    const next = {};
    for (const u of users) {
      next[u.id] = {
        role: u.role,
        phone: u.phone || "",
        address: u.address || "",
        assignedSite: u.assignedSite || "",
        accreditationLevel: u.accreditationLevel || "basic"
      };
    }
    setTeamRowDraft(next);
  }, [users]);

  useEffect(() => {
    const next = {};
    for (const s of platformBannerSlots) {
      next[s.slotIndex] = {
        linkUrl: s.linkUrl ?? "",
        altText: s.altText ?? "",
        isActive: s.isActive !== false
      };
    }
    setPlatformBannerEdits(next);
  }, [platformBannerSlots]);

  async function completeLoginWithWorkspace(ispId) {
    setError("");
    try {
      const payload = await api.login({ ...loginForm, ispId });
      setLoginWorkspaces(null);
      if (payload.mfaRequired) {
        setMfaLogin(payload);
        setMfaCode("");
        setNotice(payload.message || "Code MFA requis.");
        return;
      }
      setAuthToken(payload.token);
      setUser(payload.user);
      refresh(payload.user.ispId || "");
    } catch (err) {
      setError(audienceErr(err.message));
    }
  }

  async function onForgotPassword(e) {
    e.preventDefault();
    setForgotBusy(true);
    setError("");
    setForgotNotice("");
    try {
      await api.forgotPassword(forgotEmail.trim());
      setForgotNotice(
        isEn
          ? "If this email is registered, you will receive a link within a few minutes (check spam). It expires in one hour."
          : "Si cette adresse est enregistrée, vous recevrez un lien sous peu (vérifiez les courriers indésirables). Il expire dans une heure."
      );
    } catch (err) {
      setError(audienceErr(err.message));
    } finally {
      setForgotBusy(false);
    }
  }

  async function onResetPasswordSubmit(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    const pwd = resetPasswordForm.password;
    if (pwd.length < 6) {
      setError(isEn ? "Password must be at least 6 characters." : "Le mot de passe doit faire au moins 6 caractères.");
      return;
    }
    if (pwd !== resetPasswordForm.confirm) {
      setError(isEn ? "Passwords do not match." : "Les mots de passe ne correspondent pas.");
      return;
    }
    try {
      await api.resetPasswordWithToken(resetTokenState, pwd);
      setNotice(
        isEn ? "Password updated. You can sign in below." : "Mot de passe mis à jour. Vous pouvez vous connecter ci-dessous."
      );
      setResetPasswordForm({ password: "", confirm: "" });
      setLoginAuthStep("signin");
      setResetTokenState("");
      if (typeof window !== "undefined") {
        window.history.replaceState({}, "", "/login");
      }
    } catch (err) {
      setError(audienceErr(err.message));
    }
  }

  async function onLogin(e) {
    e.preventDefault();
    setError("");
    setLoginWorkspaces(null);
    try {
      const payload = await api.login(loginForm);
      if (payload.needWorkspaceChoice && Array.isArray(payload.workspaces)) {
        setLoginWorkspaces(payload.workspaces);
        return;
      }
      if (payload.mfaRequired) {
        setMfaLogin(payload);
        setMfaCode("");
        setNotice(payload.message || "Code MFA requis.");
        return;
      }
      setAuthToken(payload.token);
      setUser(payload.user);
      refresh(payload.user.ispId || "");
    } catch (err) {
      setError(audienceErr(err.message));
    }
  }

  async function onVerifyLoginMfa(e) {
    e.preventDefault();
    setError("");
    try {
      const payload = await api.verifyLoginMfa({
        challengeId: mfaLogin?.challengeId,
        code: mfaCode
      });
      setAuthToken(payload.token);
      setUser(payload.user);
      setMfaLogin(null);
      setMfaCode("");
      setNotice("");
      refresh(payload.user.ispId || "");
    } catch (err) {
      setError(audienceErr(err.message || "Code MFA invalide."));
    }
  }

  function onLogout() {
    setAuthToken("");
    setLoginForm({ email: "", password: "" });
    setForgotEmail("");
    setForgotNotice("");
    setForgotBusy(false);
    setResetTokenState("");
    setLoginAuthStep("signin");
    setError("");
    setNotice("");
    setUser(null);
    setMfaLogin(null);
    setMfaCode("");
    setLoginWorkspaces(null);
    setIsps([]);
    setSelectedIspId("");
    setSuperDashboard(null);
    setDashboard(null);
    setCustomers([]);
    setUsers([]);
    setPaymentMethods([]);
    setNotificationProviders([]);
    setRoleProfiles([]);
    setPlatformPackages([]);
    setPlatformSubscriptions([]);
    setAuditLogs([]);
    setNotificationOutbox([]);
    setBranding(null);
    setNetworkStats(null);
    setNetworkNodes([]);
    setProvisioningEvents([]);
    setRadiusSyncEvents([]);
    setTelemetrySnapshots([]);
    setRadiusAccountingIngest([]);
    setOnlineSessions([]);
    setOnlineSessionsWindowMinutes(30);
    setTidSubmissions([]);
    setTidConflicts([]);
    setVouchers([]);
    setExpenses([]);
    setExpenseSummary(null);
    setWithdrawals([]);
    setWithdrawalMfa(null);
    setMfaLogin(null);
    setMfaCode("");
    setPlans([]);
    setSubscriptions([]);
    setInvoices([]);
    setPlatformBannerSlots([]);
    setPlatformBannerEdits({});
    setIspAnnouncements([]);
    setIspAnnouncementsManage([]);
  }

  async function reloadPlatformBannerSlots() {
    if (user?.role !== "system_owner") return;
    try {
      const data = await api.getSystemOwnerDashboardBanners();
      setPlatformBannerSlots(data.slots || []);
    } catch {
      /* ignore */
    }
  }

  async function onPlatformBannerUpload(slotIndex, e) {
    const input = e.target;
    const f = input.files?.[0];
    if (!f) return;
    setError("");
    setNotice("");
    try {
      await api.uploadSystemOwnerDashboardBanner(slotIndex, f);
      input.value = "";
      await reloadPlatformBannerSlots();
      await refresh();
      setNotice(t("Bannière enregistrée.", "Banner saved."));
    } catch (err) {
      setError(audienceErr(err.message));
    }
  }

  async function onPlatformBannerSaveMeta(slotIndex) {
    const ed = platformBannerEdits[slotIndex];
    if (!ed) return;
    setError("");
    setNotice("");
    try {
      await api.patchSystemOwnerDashboardBanner(slotIndex, {
        linkUrl: ed.linkUrl.trim() || null,
        altText: ed.altText.trim() || null,
        isActive: ed.isActive
      });
      await reloadPlatformBannerSlots();
      await refresh();
      setNotice(t("Paramètres de bannière enregistrés.", "Banner settings saved."));
    } catch (err) {
      setError(audienceErr(err.message));
    }
  }

  async function onPlatformBannerDeleteImage(slotIndex) {
    if (!window.confirm(t("Supprimer l'image de cette bannière ?", "Remove this banner image?"))) return;
    setError("");
    setNotice("");
    try {
      await api.deleteSystemOwnerDashboardBannerImage(slotIndex);
      await reloadPlatformBannerSlots();
      await refresh();
      setNotice(t("Image supprimée.", "Image removed."));
    } catch (err) {
      setError(audienceErr(err.message));
    }
  }

  async function onCreateIsp(e) {
    e.preventDefault();
    const created = await api.createIsp(ispForm);
    setIspForm({ name: "", location: "", contactPhone: "" });
    refresh(created.id);
  }

  async function onCreateCustomer(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!selectedIspId) {
      setError("Sélectionnez d'abord un espace FAI.");
      return;
    }
    const fullName = String(customerForm.fullName || "").trim();
    const phone = String(customerForm.phone || "").trim();
    const email = String(customerForm.email || "").trim();
    const initialPassword = String(customerForm.initialPassword || "");
    if (!fullName || !phone) {
      setError("Indiquez au minimum le nom complet et le téléphone du client.");
      return;
    }
    if (initialPassword && initialPassword.length > 0 && initialPassword.length < 6) {
      setError("Le mot de passe portail doit faire au moins 6 caractères (ou laissez vide).");
      return;
    }
    try {
      const body = {
        fullName,
        phone,
        email: email || undefined,
        initialPassword: initialPassword || undefined
      };
      if (customerForm.fieldAgentId) {
        body.fieldAgentId = customerForm.fieldAgentId;
      }
      await api.createCustomer(selectedIspId, body);
      setCustomerForm({ fullName: "", phone: "", email: "", initialPassword: "", fieldAgentId: "" });
      setNotice("Client enregistré.");
      refresh();
    } catch (err) {
      setError(audienceErr(err.message || "Impossible d'enregistrer le client."));
    }
  }

  async function onCreateExpense(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!selectedIspId) {
      setError("Sélectionnez d'abord un espace FAI.");
      return;
    }
    const amt = Number(expenseForm.amountUsd);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Indiquez un montant de dépense valide (USD).");
      return;
    }
    try {
      const payload = {
        amountUsd: amt,
        category: expenseForm.category,
        description: String(expenseForm.description || "").trim(),
        periodStart: expenseForm.periodStart,
        periodEnd: expenseForm.periodEnd
      };
      if (expenseForm.category === "field_agent_fixed" || expenseForm.category === "field_agent_percentage") {
        if (!expenseForm.fieldAgentId) {
          setError("Sélectionnez l'agent terrain pour ce versement.");
          return;
        }
        payload.fieldAgentId = expenseForm.fieldAgentId;
        if (expenseForm.category === "field_agent_percentage") {
          const pct = Number(expenseForm.agentPayoutPercent);
          if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
            setError("Le pourcentage de commission doit être entre 1 et 100.");
            return;
          }
          payload.agentPayoutPercent = pct;
        } else {
          payload.agentPayoutType = "fixed";
        }
      }
      const rbRaw = String(expenseForm.revenueBasisUsd || "").trim();
      if (rbRaw !== "") {
        const rb = Number(rbRaw);
        if (!Number.isFinite(rb) || rb < 0) {
          setError("La base de chiffre d'affaires doit être un nombre positif ou nul.");
          return;
        }
        payload.revenueBasisUsd = rb;
      }
      await api.createExpense(selectedIspId, payload);
      setExpenseForm((f) => ({
        ...f,
        amountUsd: "",
        description: "",
        agentPayoutPercent: "",
        revenueBasisUsd: ""
      }));
      setNotice("Dépense soumise — elle apparaît en « En attente » jusqu'à approbation par un autre administrateur (ou par vous-même si vous êtes seul validateur sur cet espace).");
      await refresh();
    } catch (err) {
      setError(audienceErr(err.message || "Impossible d'enregistrer la dépense."));
    }
  }

  async function onDeleteExpense(expenseId) {
    if (!selectedIspId || !expenseId) return;
    if (!window.confirm("Supprimer cette dépense ? Cette action est irréversible.")) return;
    setError("");
    setNotice("");
    try {
      await api.deleteExpense(selectedIspId, expenseId);
      setNotice("Dépense supprimée.");
      await refresh();
    } catch (err) {
      setError(audienceErr(err.message || "Impossible de supprimer la dépense."));
    }
  }

  async function onApproveExpense(expenseId) {
    if (!selectedIspId || !expenseId) return;
    setError("");
    setNotice("");
    try {
      await api.approveExpense(selectedIspId, expenseId);
      setNotice("Dépense approuvée — elle est prise en compte dans les totaux validés.");
      await refresh();
    } catch (err) {
      setError(audienceErr(err.message || "Impossible d'approuver cette dépense."));
    }
  }

  async function onRejectExpense(expenseId) {
    if (!selectedIspId || !expenseId) return;
    const note = window.prompt("Motif du rejet (facultatif) :");
    if (note === null) return;
    setError("");
    setNotice("");
    try {
      await api.rejectExpense(selectedIspId, expenseId, { rejectionNote: note });
      setNotice("Dépense rejetée — vous pouvez la supprimer ou la soumettre à nouveau après correction.");
      await refresh();
    } catch (err) {
      setError(audienceErr(err.message || "Impossible de rejeter cette dépense."));
    }
  }

  async function onCloseAccountingPeriod(e) {
    e.preventDefault();
    if (!selectedIspId) return;
    setError("");
    setNotice("");
    try {
      await api.createAccountingPeriodClosure(selectedIspId, {
        periodStart: periodCloseForm.periodStart,
        periodEnd: periodCloseForm.periodEnd,
        note: periodCloseForm.note
      });
      setNotice(
        "Période clôturée — les dépenses qui chevauchent ces dates ne pourront plus être créées, modifiées ou supprimées jusqu'à réouverture."
      );
      await refresh();
    } catch (err) {
      setError(audienceErr(err.message || "Impossible d'enregistrer la clôture comptable."));
    }
  }

  async function onReopenAccountingPeriod(closureId) {
    if (!selectedIspId || !closureId) return;
    if (
      !window.confirm(
        "Lever cette clôture ? Les dépenses sur la période concernée redeviennent modifiables. Cette action est tracée dans le journal d'audit."
      )
    ) {
      return;
    }
    setError("");
    setNotice("");
    try {
      await api.deleteAccountingPeriodClosure(selectedIspId, closureId);
      setNotice("Clôture levée.");
      await refresh();
    } catch (err) {
      setError(audienceErr(err.message || "Impossible de lever la clôture."));
    }
  }

  async function onIssuePortalToken(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!portalTokenForm.customerId) {
      setError("Sélectionnez un client pour générer un lien portail.");
      return;
    }
    try {
      const data = await api.createPortalToken(selectedIspId, {
        customerId: portalTokenForm.customerId,
        expiresDays: Number(portalTokenForm.expiresDays) || 30
      });
      setLastPortalIssue(data);
      setNotice("Lien portail généré — copiez-le et envoyez-le au client.");
    } catch (err) {
      setError(audienceErr(err.message || "Impossible de créer le lien portail."));
    }
  }

  async function onInitiatePlatformDeposit(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!selectedIspId) {
      setError("Sélectionnez d'abord un espace FAI.");
      return;
    }
    try {
      let data;
      if (saasPayForm.methodType === "mobile_money") {
        data = await api.initiatePlatformDeposit(selectedIspId, {
          methodType: "mobile_money",
          currency: saasPayForm.currency,
          phoneNumber: saasPayForm.phoneNumber,
          networkKey: saasPayForm.networkKey,
          packageId: saasPayForm.packageId || undefined
        });
      } else {
        const evidence = {};
        if (saasPayForm.methodType === "cash") {
          evidence.collectorName = saasPayForm.collectorName;
          evidence.receiptNumber = saasPayForm.receiptNumber;
          evidence.collectionLocation = saasPayForm.collectionLocation;
        }
        if (saasPayForm.methodType === "bank_transfer") {
          evidence.bankName = saasPayForm.bankName;
          evidence.accountName = saasPayForm.accountName;
          evidence.accountNumber = saasPayForm.accountNumber;
        }
        if (saasPayForm.methodType === "visa_card") {
          evidence.processorName = saasPayForm.processorName;
          evidence.cardLast4 = saasPayForm.cardLast4;
          evidence.authCode = saasPayForm.authCode;
        }
        if (saasPayForm.methodType === "crypto_wallet" || saasPayForm.methodType === "binance_pay") {
          evidence.walletNetwork = saasPayForm.walletNetwork;
          evidence.walletAddress = saasPayForm.walletAddress;
        }
        data = await api.createPlatformManualBillingIntent(selectedIspId, {
          packageId: saasPayForm.packageId || undefined,
          methodType: saasPayForm.methodType,
          externalRef: saasPayForm.externalRef,
          payerContact: saasPayForm.payerContact || undefined,
          amountUsd: saasPayForm.amountUsd || undefined,
          evidence
        });
      }
      setSaasDepositResult(data);
      setNotice(data.message || "Dépôt initié.");
    } catch (err) {
      setError(audienceErr(err.message || "Échec du démarrage du dépôt."));
    }
  }

  async function onConfirmManualPlatformDeposit() {
    setError("");
    setNotice("");
    if (!selectedIspId || !saasDepositResult?.depositId) return;
    try {
      await api.confirmPlatformManualBillingIntent(selectedIspId, saasDepositResult.depositId, {
        confirmReceived: true
      });
      setNotice(t("Paiement confirmé manuellement. Abonnement mis à jour.", "Manual payment confirmed. Subscription updated."));
      await refresh();
    } catch (err) {
      setError(audienceErr(err.message || "Impossible de confirmer ce paiement manuel."));
    }
  }

  async function onPollPlatformDeposit() {
    setError("");
    setNotice("");
    if (!selectedIspId || !saasDepositResult?.depositId) return;
    try {
      await api.getPlatformDepositStatus(selectedIspId, saasDepositResult.depositId);
      setNotice("Paiement vérifié. Actualisation de l'espace…");
      await refresh();
    } catch (err) {
      setError(audienceErr(err.message || "Impossible de lire le statut du dépôt."));
    }
  }

  async function onCreateWithdrawal(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!selectedIspId) {
      setError("Sélectionnez d'abord un espace FAI.");
      return;
    }
    if (!user?.mfaTotpEnabled) {
      setError("Configurez Google Authenticator avant de demander un retrait.");
      return;
    }
    try {
      const data = await api.createWithdrawal(selectedIspId, {
        amountUsd: withdrawalForm.amountUsd,
        currency: withdrawalForm.currency,
        phoneNumber: withdrawalForm.phoneNumber,
        networkKey: withdrawalForm.networkKey,
        mfaCode: withdrawalForm.mfaCode
      });
      setNotice(data.message || "Retrait demandé.");
      setWithdrawalForm({ ...withdrawalForm, amountUsd: "", mfaCode: "" });
      await refresh();
    } catch (err) {
      setError(audienceErr(err.message || "Impossible de créer le retrait."));
    }
  }

  async function onStartTotpSetup() {
    setError("");
    setNotice("");
    setTotpSetupLoading(true);
    try {
      const data = await api.startTotpSetup();
      setTotpSetup(data);
      setTotpSetupCode("");
      setNotice("Secret Google Authenticator généré.");
    } catch (err) {
      setError(audienceErr(err.message || "Impossible de démarrer la configuration MFA."));
    } finally {
      setTotpSetupLoading(false);
    }
  }

  async function onEnableTotp(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    try {
      await api.enableTotp({ code: totpSetupCode });
      setTotpSetup(null);
      setTotpSetupCode("");
      setNotice("Google Authenticator activé pour les retraits.");
      await refresh();
    } catch (err) {
      setError(audienceErr(err.message || "Code Google Authenticator invalide."));
    }
  }

  function onUpgradeTrialPlan(e) {
    e.preventDefault();
    setError("Le changement de formule se fait maintenant par paiement Mobile Money dans le formulaire ci-dessus.");
  }

  async function onCreatePlan(e) {
    e.preventDefault();
    await api.createPlan(selectedIspId, {
      ...planForm,
      maxDevices: Number(planForm.maxDevices) || 1
    });
    setPlanForm({
      name: "",
      priceUsd: "",
      durationDays: "",
      rateLimit: "",
      speedLabel: "",
      defaultAccessType: "pppoe",
      maxDevices: "1",
      isPublished: false,
      availabilityStatus: "available",
      successRedirectUrl: ""
    });
    refresh();
  }

  async function onSavePlanPatch(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!planEditForm.planId) {
      setError("Choisissez d'abord une formule dans la liste.");
      return;
    }
    try {
      await api.updatePlan(selectedIspId, planEditForm.planId, {
        name: planEditForm.name,
        priceUsd: Number(planEditForm.priceUsd),
        durationDays: Number(planEditForm.durationDays),
        rateLimit: planEditForm.rateLimit,
        speedLabel: planEditForm.speedLabel || null,
        defaultAccessType: planEditForm.defaultAccessType,
        maxDevices: Number(planEditForm.maxDevices) || 1,
        isPublished: planEditForm.isPublished,
        availabilityStatus: planEditForm.availabilityStatus,
        successRedirectUrl: planEditForm.successRedirectUrl || null
      });
      setNotice("Formule mise à jour.");
      refresh();
    } catch (err) {
      setError(audienceErr(err.message || "Impossible de mettre à jour la formule."));
    }
  }

  async function onCreateSubscription(e) {
    e.preventDefault();
    await api.createSubscription(selectedIspId, subForm);
    setSubForm({ customerId: "", planId: "", accessType: "pppoe" });
    refresh();
  }

  async function onSaveBranding(e) {
    e.preventDefault();
    if (!selectedIspId) return;
    setError("");
    setNotice("");
    try {
      const saved = await api.updateBranding(selectedIspId, brandingForm);
      setBranding(saved);
      if (saved) {
        setBrandingForm((prev) => ({
          ...prev,
          displayName: saved.displayName || "",
          logoUrl: saved.logoUrl || "",
          primaryColor: saved.primaryColor || "#1565d8",
          secondaryColor: saved.secondaryColor || "#162030",
          invoiceFooter: saved.invoiceFooter || "",
          address: saved.address || "",
          contactEmail: saved.contactEmail || "",
          contactPhone: saved.contactPhone || "",
          customDomain: saved.customDomain || "",
          subdomain: saved.subdomain || "",
          wifiPortalRedirectUrl: saved.wifiPortalRedirectUrl || "",
          portalFooterText: saved.portalFooterText || "",
          portalClientRefPrefix: saved.portalClientRefPrefix || "",
          wifiZonePublic: saved.wifiZonePublic !== false
        }));
      }
      setNotice(t("Image de marque enregistrée.", "Branding saved."));
    refresh();
    } catch (err) {
      setError(audienceErr(err.message || t("Échec de l'enregistrement.", "Save failed.")));
    }
  }

  async function onWifiZonePublicToggle(e) {
    const checked = Boolean(e.target.checked);
    setBrandingForm((prev) => ({ ...prev, wifiZonePublic: checked }));
    if (!selectedIspId) {
      setError(t("Choisissez d'abord un FAI dans « Espace FAI actif ».", "Select an ISP in Active ISP Workspace first."));
      return;
    }
    setError("");
    setNotice("");
    setWifiZonePublicSaving(true);
    try {
      const saved = await api.patchBrandingWifiZonePublic(selectedIspId, checked);
      setBranding(saved);
      if (saved) {
        setBrandingForm((prev) => ({
          ...prev,
          wifiZonePublic: saved.wifiZonePublic !== false
        }));
      }
      setNotice(
        t(
          "Visibilité sur la Zone WiFi enregistrée. La liste publique peut prendre quelques secondes à se mettre à jour.",
          "WiFi Zone visibility saved. The public list may take a few seconds to refresh."
        )
      );
    } catch (err) {
      setBrandingForm((prev) => ({ ...prev, wifiZonePublic: !checked }));
      setError(audienceErr(err.message || t("Échec de l'enregistrement.", "Save failed.")));
    } finally {
      setWifiZonePublicSaving(false);
    }
  }

  async function onBrandingLogoFile(e) {
    const input = e.target;
    const f = input.files?.[0];
    if (!f) return;
    setBrandingLogoPickPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
    if (!selectedIspId) {
      setError(t("Choisissez d'abord un FAI dans « Espace FAI actif ».", "Select an ISP in Active ISP Workspace first."));
      return;
    }
    setError("");
    setNotice("");
    try {
      const row = await api.uploadBrandingLogo(selectedIspId, f);
      setBrandingForm((prev) => ({ ...prev, logoUrl: row?.logoUrl || prev.logoUrl }));
      setNotice("Logo téléversé.");
      input.value = "";
      setBrandingLogoPickPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      refresh();
    } catch (err) {
      setError(audienceErr(err.message));
    }
  }

  async function onBrandingWifiBannerFile(e) {
    const input = e.target;
    const f = input.files?.[0];
    if (!f) return;
    if (!selectedIspId) {
      setError(t("Choisissez d'abord un FAI dans « Espace FAI actif ».", "Select an ISP in Active ISP Workspace first."));
      return;
    }
    setError("");
    setNotice("");
    try {
      const row = await api.uploadBrandingWifiPortalBanner(selectedIspId, f);
      if (row) setBranding(row);
      setNotice(t("Bannière Wi‑Fi invité enregistrée.", "Guest Wi‑Fi banner saved."));
      input.value = "";
      refresh();
    } catch (err) {
      setError(audienceErr(err.message));
    }
  }

  async function onClearBrandingWifiBanner() {
    if (!selectedIspId) return;
    if (
      !window.confirm(
        t("Retirer la bannière du portail Wi‑Fi invité ?", "Remove the guest Wi‑Fi portal banner?")
      )
    ) {
      return;
    }
    setError("");
    setNotice("");
    try {
      const row = await api.deleteBrandingWifiPortalBanner(selectedIspId);
      if (row) setBranding(row);
      setNotice(t("Bannière Wi‑Fi retirée.", "Wi‑Fi banner removed."));
      refresh();
    } catch (err) {
      setError(audienceErr(err.message));
    }
  }

  async function onDownloadCustomersCsv() {
    if (!selectedIspId) return;
    setError("");
    setNotice("");
    try {
      await api.downloadCustomersCsv(selectedIspId);
      setNotice("Téléchargement du CSV clients démarré.");
    } catch (err) {
      setError(audienceErr(err.message));
    }
  }

  async function onImportCustomersCsv(e) {
    e.preventDefault();
    if (!selectedIspId) return;
    const file = customerCsvInputRef.current?.files?.[0];
    if (!file) {
      setError("Choisissez un fichier CSV à importer.");
      return;
    }
    setError("");
    setNotice("");
    setCustomerImportReport(null);
    try {
      const res = await api.importCustomersCsv(selectedIspId, file, customerImportPassword);
      setCustomerImportReport({
        createdCount: res.createdCount ?? 0,
        skipped: res.skipped || [],
        errors: res.errors || []
      });
      setNotice(
        `Import clients terminé : ${res.createdCount ?? 0} créé(s), ${(res.skipped || []).length} ignorée(s), ${(res.errors || []).length} erreur(s).`
      );
      customerCsvInputRef.current.value = "";
      refresh();
    } catch (err) {
      setError(audienceErr(err.message));
    }
  }

  async function onDownloadTeamUsersCsv() {
    if (!selectedIspId) return;
    setError("");
    setNotice("");
    try {
      await api.downloadTeamUsersCsv(selectedIspId);
      setNotice("Téléchargement du CSV équipe démarré.");
    } catch (err) {
      setError(audienceErr(err.message));
    }
  }

  async function onImportTeamUsersCsv(e) {
    e.preventDefault();
    if (!selectedIspId) return;
    const file = teamCsvInputRef.current?.files?.[0];
    if (!file) {
      setError("Choisissez un fichier CSV à importer.");
      return;
    }
    setError("");
    setNotice("");
    setTeamImportReport(null);
    try {
      const res = await api.importTeamUsersCsv(
        selectedIspId,
        file,
        teamImportPassword,
        teamImportRole
      );
      setTeamImportReport({
        createdCount: res.createdCount ?? 0,
        skipped: res.skipped || [],
        errors: res.errors || []
      });
      setNotice(
        `Import équipe terminé : ${res.createdCount ?? 0} créé(s), ${(res.skipped || []).length} ignorée(s), ${(res.errors || []).length} erreur(s).`
      );
      teamCsvInputRef.current.value = "";
      refresh();
    } catch (err) {
      setError(audienceErr(err.message));
    }
  }

  async function onMarkPaid(invoiceId, amountUsd) {
    await api.simulatePayment(selectedIspId, {
      invoiceId,
      amountUsd,
      providerRef: `DEMO-${Date.now()}`,
      status: "confirmed",
      method: "mobile_money"
    });
    refresh();
  }

  async function onDownloadInvoiceProforma(invoiceId) {
    setError("");
    try {
      await api.downloadInvoiceProformaPdf(selectedIspId, invoiceId);
    } catch (err) {
      setError(audienceErr(err.message || "Impossible de télécharger la facture proforma (PDF)."));
    }
  }

  async function onCreateUser(e) {
    e.preventDefault();
    const payload = { ...userForm };
    if (!payload.password || !String(payload.password).trim()) {
      delete payload.password;
    }
    await api.createUser(selectedIspId, payload);
    setUserForm({
      fullName: "",
      email: "",
      password: "",
      role: "billing_agent",
      accreditationLevel: "basic",
      phone: "",
      address: "",
      assignedSite: ""
    });
    refresh();
  }

  async function onSaveTeamUser(userId) {
    setError("");
    setNotice("");
    const d = teamRowDraft[userId];
    if (!d || !selectedIspId) return;
    try {
      await api.patchTeamUser(selectedIspId, userId, {
        role: d.role,
        phone: d.phone,
        address: d.address,
        assignedSite: d.assignedSite,
        accreditationLevel: d.accreditationLevel
      });
      setNotice(t("Membre d'équipe enregistré.", "Team member saved."));
      refresh();
    } catch (err) {
      setError(audienceErr(err.message || t("Échec de la mise à jour.", "Update failed.")));
    }
  }

  async function onResetPassword(userId) {
    setError("");
    setNotice("");
    const newPassword = window.prompt("Nouveau mot de passe (min. 6 caractères)");
    if (!newPassword) return;
    if (newPassword.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    try {
      await api.resetUserPassword(selectedIspId, userId, newPassword);
      setNotice("Mot de passe réinitialisé. L'utilisateur devra le changer à la prochaine connexion.");
      refresh();
    } catch (err) {
      setError(audienceErr(err.message || "Échec de la réinitialisation du mot de passe."));
    }
  }

  async function onDeactivateUser(userId) {
    await api.deactivateUser(selectedIspId, userId);
    refresh();
  }

  async function onReactivateUser(userId) {
    await api.reactivateUser(selectedIspId, userId);
    refresh();
  }

  async function onSuspendUserGlobally(userId) {
    const ok = window.confirm(
      t(
        "Suspendre ce compte PARTOUT (toutes entreprises) ? La personne ne pourra plus se connecter jusqu'à réactivation globale. Les accès par FAI devront être réactivés si besoin.",
        "Suspend this account EVERYWHERE (all companies)? They cannot sign in until globally re-enabled. Per-ISP access may need to be re-enabled separately."
      )
    );
    if (!ok) return;
    setError("");
    try {
      await api.suspendUserGlobally(selectedIspId, userId);
      setNotice(t("Compte suspendu globalement.", "Account suspended globally."));
      refresh();
    } catch (err) {
      setError(audienceErr(err.message || t("Échec.", "Failed.")));
    }
  }

  async function onReactivateUserGlobally(userId) {
    setError("");
    try {
      await api.reactivateUserGlobally(selectedIspId, userId);
      setNotice(
        t(
          "Compte réactivé pour la connexion. Réactivez chaque FAI si nécessaire.",
          "Account re-enabled for sign-in. Re-enable each ISP workspace if needed."
        )
      );
      refresh();
    } catch (err) {
      setError(audienceErr(err.message || t("Échec.", "Failed.")));
    }
  }

  async function onCreateInvite(userId) {
    setError("");
    const payload = await api.createInvite(selectedIspId, userId);
    setGeneratedInvite(payload);
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(payload.inviteLink).catch(() => {});
    }
  }

  async function onCreatePaymentMethod(e) {
    e.preventDefault();
    const config = paymentMethodConfigFromForm(paymentMethodForm);
    await api.createPaymentMethod(selectedIspId, {
      methodType: paymentMethodForm.methodType,
      providerName: paymentMethodForm.providerName,
      config
    });
    setPaymentMethodForm({
      methodType: "cash",
      providerName: "Guichet espèces",
      accountName: "",
      bankName: "",
      accountNumber: "",
      iban: "",
      swiftCode: "",
      mobileMoneyNumber: "",
      networkHints: "",
      walletAddress: "",
      walletNetwork: "",
      memoTag: "",
      processorName: "",
      merchantLabel: "",
      supportContact: "",
      collectionPoint: "",
      collectionContact: "",
      collectorPolicy: "",
      validationEtaMinutes: "15",
      note: ""
    });
    refresh();
  }

  async function onTogglePaymentMethod(methodId, isActive) {
    await api.togglePaymentMethod(selectedIspId, methodId, isActive);
    refresh();
  }

  async function onGenerateGatewayCallback(methodId) {
    const payload = await api.generatePaymentMethodCallbackSecret(selectedIspId, methodId);
    setGatewayCallbackByMethod((prev) => ({ ...prev, [methodId]: payload }));
    setNotice(
      t(
        "Callback généré. Copiez l'URL et le secret dans votre dashboard agrégateur.",
        "Callback generated. Copy the URL and secret into your aggregator dashboard."
      )
    );
  }

  async function onTestGatewayCallback(methodId) {
    const payload = await api.testPaymentMethodCallback(selectedIspId, methodId, {});
    const activated = payload?.activated;
    setNotice(
      activated
        ? t(
            "Test callback réussi: paiement confirmé et connexion activée.",
            "Callback test succeeded: payment confirmed and internet access activated."
          )
        : t(
            "Test callback traité, mais pas d'activation (vérifiez la facture/statut).",
            "Callback test processed, but no activation occurred (check invoice/status)."
          )
    );
    refresh();
  }

  async function copyToClipboard(value) {
    if (!value) return;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(String(value)).catch(() => {});
      setNotice(t("Copié dans le presse-papiers.", "Copied to clipboard."));
    }
  }

  async function onCreateNetworkNode(e) {
    e.preventDefault();
    await api.createNetworkNode(selectedIspId, networkNodeForm);
    setNotice("Nœud réseau enregistré.");
    setNetworkNodeForm({
      name: "",
      host: "",
      apiPort: 443,
      useTls: true,
      username: "",
      password: "",
      defaultPppoeProfile: "default",
      defaultHotspotProfile: "default",
      isDefault: false,
      isActive: true
    });
    refresh();
  }

  async function onToggleNetworkNode(nodeId, isActive) {
    await api.toggleNetworkNode(selectedIspId, nodeId, isActive);
    refresh();
  }

  async function onSetDefaultNetworkNode(nodeId) {
    await api.setDefaultNetworkNode(selectedIspId, nodeId);
    refresh();
  }

  async function onCollectTelemetry(nodeId) {
    setError("");
    try {
      const res = await api.collectNetworkTelemetry(selectedIspId, nodeId);
      setNotice(
        `Télémétrie : PPPoE ${res.pppoeActive ?? 0}, Hotspot ${res.hotspotActive ?? 0}, connectés ${res.connectedDevices ?? 0}.`
      );
      refresh();
    } catch (err) {
      setError(audienceErr(err.message));
    }
  }

  async function onPatchCustomerEmail(e) {
    e.preventDefault();
    setError("");
    try {
      const patch = { email: customerEmailForm.email.trim() || null };
      if (
        user.role !== "field_agent" &&
        (isPlatformSuperRole(user.role) ||
          user.role === "company_manager" ||
          user.role === "isp_admin" ||
          user.role === "billing_agent")
      ) {
        patch.fieldAgentId = customerEmailForm.fieldAgentId || null;
      }
      await api.patchCustomer(selectedIspId, customerEmailForm.customerId, patch);
      setNotice("E-mail client mis à jour.");
      setCustomerEmailForm({ customerId: "", email: "", fieldAgentId: "" });
      refresh();
    } catch (err) {
      setError(audienceErr(err.message));
    }
  }

  async function onUpsertNotificationProvider(e) {
    e.preventDefault();
    let config;
    if (notificationProviderForm.providerKey === "twilio") {
      config = {
        accountSid: notificationProviderForm.twilioAccountSid,
        authToken: notificationProviderForm.twilioAuthToken,
        from: notificationProviderForm.twilioFrom,
        messagingServiceSid: notificationProviderForm.twilioMessagingServiceSid
      };
    } else if (notificationProviderForm.providerKey === "smtp") {
      config = {
        host: notificationProviderForm.smtpHost,
        port: Number(notificationProviderForm.smtpPort) || 587,
        secure: Boolean(notificationProviderForm.smtpSecure),
        user: notificationProviderForm.smtpUser || undefined,
        pass: notificationProviderForm.smtpPass || undefined,
        from: notificationProviderForm.smtpFrom
      };
    } else {
      config = {
        webhookUrl: notificationProviderForm.webhookUrl,
        authHeaderName: notificationProviderForm.authHeaderName,
        authToken: notificationProviderForm.authToken
      };
    }
    await api.upsertNotificationProvider(selectedIspId, {
      channel: notificationProviderForm.channel,
      providerKey: notificationProviderForm.providerKey,
      isActive: notificationProviderForm.isActive,
      config
    });
    setNotice(`Fournisseur de notification enregistré pour ${notificationProviderForm.channel}.`);
    refresh();
  }

  async function onUpsertRoleProfile(e) {
    e.preventDefault();
    await api.upsertRoleProfile(selectedIspId, {
      roleKey: roleProfileForm.roleKey,
      accreditationLevel: roleProfileForm.accreditationLevel,
      permissions: Array.isArray(roleProfileForm.permissions) ? roleProfileForm.permissions : []
    });
    refresh();
  }

  async function onCreatePlatformSubscription(e) {
    e.preventDefault();
    await api.createPlatformSubscription({
      ispId: selectedIspId,
      packageId: platformSubForm.packageId,
      durationDays: Number(platformSubForm.durationDays)
    });
    refresh();
  }

  async function onSubmitTid(e) {
    e.preventDefault();
    await api.submitTidPayment({
      invoiceId: tidForm.invoiceId,
      tid: tidForm.tid,
      submittedByPhone: tidForm.submittedByPhone,
      amountUsd: tidForm.amountUsd || undefined
    });
    setTidForm({ invoiceId: "", tid: "", submittedByPhone: "", amountUsd: "" });
    setNotice(
      t(
        "TID envoyée. En attente de vérification par l'administrateur.",
        "TID submitted. Awaiting verification by an administrator."
      )
    );
    refresh();
  }

  async function onReviewTid(submissionId, decision) {
    const note = window.prompt(
      t("Note facultative (audit) :", "Optional note (audit trail):"),
      ""
    );
    if (note === null) return;
    await api.reviewTidSubmission(selectedIspId, submissionId, { decision, note: note || "" });
    refresh();
  }

  async function onReviewPaymentIntent(intentId, decision) {
    const note = window.prompt(
      t("Note facultative (audit) :", "Optional note (audit trail):"),
      ""
    );
    if (note === null) return;
    await api.reviewPaymentIntent(selectedIspId, intentId, { decision, note: note || "" });
    refresh();
  }

  async function onCreatePaymentIntent(e) {
    e.preventDefault();
    const ev = {};
    if (paymentIntentForm.channel === "cash_agent") {
      ev.collectorName = paymentIntentForm.collectorName;
      ev.receiptNumber = paymentIntentForm.receiptNumber;
      ev.collectionLocation = paymentIntentForm.collectionLocation;
      ev.collectedAt = paymentIntentForm.collectedAt || undefined;
    }
    if (paymentIntentForm.channel === "bank_transfer") {
      ev.bankName = paymentIntentForm.bankName;
      ev.accountName = paymentIntentForm.accountName;
      ev.accountNumber = paymentIntentForm.accountNumber;
    }
    if (paymentIntentForm.channel === "card_manual") {
      ev.processorName = paymentIntentForm.processorName;
      ev.cardLast4 = paymentIntentForm.cardLast4;
      ev.authCode = paymentIntentForm.authCode;
    }
    if (paymentIntentForm.channel === "crypto_wallet") {
      ev.walletNetwork = paymentIntentForm.walletNetwork;
      ev.walletAddress = paymentIntentForm.walletAddress;
    }
    await api.createPaymentIntent(selectedIspId, {
      invoiceId: paymentIntentForm.invoiceId,
      channel: paymentIntentForm.channel,
      externalRef: paymentIntentForm.externalRef,
      payerContact: paymentIntentForm.payerContact || undefined,
      amountUsd: paymentIntentForm.amountUsd || undefined,
      evidence: ev
    });
    setNotice(t("Paiement manuel enregistré en attente de validation.", "Manual payment recorded and pending validation."));
    setPaymentIntentForm({
      invoiceId: "",
      channel: "cash_agent",
      externalRef: "",
      payerContact: "",
      amountUsd: "",
      bankName: "",
      accountName: "",
      accountNumber: "",
      processorName: "",
      cardLast4: "",
      authCode: "",
      walletNetwork: "",
      walletAddress: "",
      collectorName: "",
      receiptNumber: "",
      collectionLocation: "",
      collectedAt: ""
    });
    refresh();
  }

  async function onDownloadLedgerCsv() {
    if (!selectedIspId) return;
    await api.downloadAccountingLedgerCsv(selectedIspId, expenseFilter.from, expenseFilter.to);
  }

  async function onQueueTidReminders() {
    const payload = await api.queueTidReminders(selectedIspId);
    setNotice(
      t(
        `${payload.queued} rappel(s) mis en file pour ${payload.totalPending} TID en attente.`,
        `${payload.queued} reminder(s) queued for ${payload.totalPending} pending TID(s).`
      )
    );
    refresh();
  }

  async function onProcessNotificationOutbox() {
    setError("");
    try {
      const stats = await api.processNotificationOutbox();
      setNotice(
        `File notifications : ${stats.processed} élément(s) traités — envoyés ${stats.sent}, nouvel essai ${stats.retried}, échecs ${stats.failed}.`
      );
      refresh();
    } catch (err) {
      setError(audienceErr(err.message));
    }
  }

  async function onProcessBillingOverdue() {
    setError("");
    try {
      const stats = await api.processBillingOverdue(selectedIspId);
      setNotice(
        `Retard : ${stats.subscriptionsSuspended} abonnement(s) suspendu(s), ${stats.invoicesMarkedOverdue} facture(s) en retard (candidats : ${stats.overdueInvoiceCandidates}, délai ${stats.graceHours} h).`
      );
      refresh();
    } catch (err) {
      setError(audienceErr(err.message));
    }
  }

  async function onGenerateRenewalInvoices() {
    setError("");
    try {
      const stats = await api.generateRenewalInvoices(selectedIspId);
      setNotice(
        `Renouvellements : ${stats.invoicesCreated} facture(s) créée(s), ${stats.notificationsQueued} notification(s) en file (fenêtre ${stats.renewalWindowDays} j, analysés ${stats.candidatesScanned}).`
      );
      refresh();
    } catch (err) {
      setError(audienceErr(err.message));
    }
  }

  async function onSendTestNotification(e) {
    e.preventDefault();
    setError("");
    try {
      const payload = await api.sendTestNotification(selectedIspId, notificationTestForm);
      setNotice(
        `Test envoyé à ${payload.recipient} via ${payload.channel}. ID message fournisseur : ${payload.providerMessageId || "n/a"}`
      );
      refresh();
    } catch (err) {
      setError(audienceErr(err.message));
    }
  }

  async function onGenerateVouchers(e) {
    e.preventDefault();
    await api.generateVouchers(selectedIspId, {
      planId: voucherForm.planId,
      quantity: Number(voucherForm.quantity || 1),
      ...(voucherForm.maxDevices !== "" && voucherForm.maxDevices != null
        ? { maxDevices: Number(voucherForm.maxDevices) }
        : {})
    });
    setNotice("Bons générés avec succès.");
    setVoucherForm({ planId: "", quantity: 1, maxDevices: "" });
    refresh();
  }

  async function onSuspendSubscription(subscriptionId) {
    await api.suspendSubscription(selectedIspId, subscriptionId);
    setNotice("Abonnement suspendu — mise à jour d'accès réseau demandée.");
    refresh();
  }

  async function onReactivateSubscription(subscriptionId) {
    await api.reactivateSubscription(selectedIspId, subscriptionId);
    setNotice("Abonnement réactivé — mise à jour d'accès réseau demandée.");
    refresh();
  }

  async function onSyncSubscriptionNetwork(subscriptionId, action = "activate") {
    const result = await api.syncSubscriptionNetwork(selectedIspId, subscriptionId, action);
    setNotice(result.message || `Synchronisation réseau « ${action} » terminée.`);
    refresh();
  }

  async function onRedeemVoucher(e) {
    e.preventDefault();
    const body = { code: voucherRedeemForm.code };
    if (voucherRedeemForm.redeemByPhone) {
      body.ispId = selectedIspId;
      body.phone = voucherRedeemForm.phone;
    } else {
      body.customerId = voucherRedeemForm.customerId;
    }
    if (voucherRedeemForm.newPassword) {
      body.newPassword = voucherRedeemForm.newPassword;
    }
    const res = await api.redeemVoucher(body);
    setNotice(
      res.subscriberToken
        ? "Bon utilisé. Jeton de session abonné retourné — le client peut utiliser le portail client."
        : "Bon utilisé et accès prolongé."
    );
    setVoucherRedeemForm({
      code: "",
      customerId: "",
      redeemByPhone: false,
      phone: "",
      newPassword: ""
    });
    refresh();
  }

  async function onExportVouchers() {
    const payload = await api.exportVouchers(selectedIspId);
    const blob = new Blob([payload.content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = payload.filename || "vouchers.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function onPrintVouchers() {
    const printable = vouchers.filter((v) => v.status === "unused").slice(0, 24);
    if (printable.length === 0) {
      setError("Aucun bon inutilisé à imprimer.");
      return;
    }
    const brandTitle = resolvePublicBrandName(branding?.displayName);
    const mcLogoPrint =
      typeof window !== "undefined"
        ? new URL(mcbuleliLogoUrl, window.location.origin).href
        : mcbuleliLogoUrl;
    const html = `
      <html lang="fr">
      <head>
        <meta charset="utf-8"/>
        <title>Bons d'accès — McBuleli</title>
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet"/>
      </head>
      <body style="font-family:'Plus Jakarta Sans',system-ui,sans-serif;padding:16px;color:${branding?.secondaryColor || "#2d2420"};">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
          <img src="${mcLogoPrint}" alt="McBuleli" style="height:40px;width:auto;object-fit:contain;" />
          <h2 style="margin:0;color:${branding?.primaryColor || "#5d4037"};">${brandTitle} — bons d'accès Wi‑Fi</h2>
        </div>
        ${printable
          .map(
            (v) => `
          <div style="border:1px solid ${branding?.primaryColor || "#5d4037"}; border-radius:8px; padding:12px; margin:8px 0;">
            <strong style="color:${branding?.primaryColor || "#5d4037"};">${v.code}</strong><br/>
            Débit : ${v.rateLimit}<br/>
            Durée : ${v.durationDays} jour(s)<br/>
            Appareils : ${v.maxDevices ?? 1}<br/>
            Expire le : ${v.expiresAt ? new Date(v.expiresAt).toLocaleDateString("fr-FR") : "—"}
          </div>
        `
          )
          .join("")}
        <p style="margin-top:16px;">${branding?.invoiceFooter || ""}</p>
      </body>
      </html>
    `;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  }

  async function onChangePassword(e) {
    e.preventDefault();
    await api.changePassword(passwordForm);
    setPasswordForm({ currentPassword: "", newPassword: "" });
    refresh();
  }

  const tenantSurfaceLogoSrc =
    tenantContext?.logoUrl != null && String(tenantContext.logoUrl).trim()
      ? publicAssetUrl(tenantContext.logoUrl)
      : mcbuleliLogoUrl;
  const tenantSurfaceLogoAlt = resolvePublicBrandName(tenantContext?.displayName) || "McBuleli";

  const pwaPromptGateOk = import.meta.env.PROD && !user?.mustChangePassword;
  const workspaceTitleForPwa = user
    ? workspaceHeaderTitle(branding, tenantContext, isps, selectedIspId, user)
    : workspaceHeaderTitle(null, tenantContext, [], tenantContext?.ispId, null);

  const isFieldAgentForPwaNav = user?.role === "field_agent";
  const pwaNavCategories = useMemo(
    () => (user ? buildDashboardNavCategories(t, user, Boolean(isFieldAgentForPwaNav)) : []),
    [t, user, isFieldAgentForPwaNav]
  );

  useEffect(() => {
    if (!user) {
      setIndependentPublicPageTitle();
      return;
    }
    const name = workspaceHeaderTitle(branding, tenantContext, isps, selectedIspId, user).trim();
    setWorkspaceTabTitle(name);
  }, [user, branding, tenantContext, isps, selectedIspId]);

  if (authBootstrapPending) {
    return (
      <main className="global-loading-screen" role="status" aria-live="polite">
        <div className="global-loading-screen__card">
          <span className="global-loading-screen__spinner" aria-hidden="true" />
          <p>{t("Ouverture de votre session…", "Opening your session...")}</p>
        </div>
      </main>
    );
  }

  if (!user) {
    const forgotHintPlain = (isEn ? publicAuthCopyForgot.en : publicAuthCopyForgot.fr).trim();
    return (
      <>
        <main className="auth-simple auth-simple--dark">
        <div className="auth-simple-card">
          <img
            className="auth-simple-logo"
            src={tenantSurfaceLogoSrc}
            alt={tenantSurfaceLogoAlt}
            width={80}
            height={80}
          />
          <h1 className="auth-simple-title">{tenantSurfaceLogoAlt}</h1>
          {tenantSurfaceLogoAlt !== "McBuleli" ? (
            <PoweredByMcBuleli
              className="auth-simple-powered-by"
              poweredByLabel={isEn ? "Powered by" : "Propulsé par"}
            />
          ) : null}
          {notice ? (
            <div role="status" className="auth-simple-banner auth-simple-banner--info">
              {isEn ? translateToEnglish(notice) : notice}
            </div>
          ) : null}
          {error ? (
            <div role="alert" className="auth-simple-banner auth-simple-banner--error">
              {isEn ? translateToEnglish(error) : error}
            </div>
          ) : null}
          {forgotNotice && loginAuthStep === "forgot" ? (
            <div role="status" className="auth-simple-banner auth-simple-banner--info">
              {forgotNotice}
            </div>
          ) : null}
          {loginWorkspaces && !mfaLogin ? (
            <div className="panel auth-simple-panel" role="dialog" aria-label={isEn ? "Choose workspace" : "Choisir l'entreprise"}>
              <h2 className="auth-simple-panel-title">{isEn ? "Your workspace" : "Votre entreprise"}</h2>
              <p className="app-meta">
              {isEn
                  ? "This account is linked to several operators. Pick one to continue."
                  : "Ce compte est rattaché à plusieurs opérateurs. Choisissez l'espace à ouvrir."}
              </p>
              <ul className="auth-simple-workspace-list">
                {loginWorkspaces.map((w) => (
                  <li key={w.ispId}>
                    <button
                      type="button"
                      className="btn-secondary auth-simple-workspace-btn"
                      onClick={() => completeLoginWithWorkspace(w.ispId)}
                    >
                      <strong>{w.name}</strong>
                      <span className="auth-simple-workspace-role">{formatStaffRole(w.role, isEn)}</span>
                    </button>
                  </li>
                ))}
            </ul>
              <button
                type="button"
                className="btn-secondary-outline"
                onClick={() => {
                  setLoginWorkspaces(null);
                  setError("");
                }}
              >
                {isEn ? "Back" : "Retour"}
                </button>
              </div>
          ) : null}
            {mfaLogin ? (
            <form className="panel auth-simple-panel" onSubmit={onVerifyLoginMfa}>
              <h2 className="auth-simple-panel-title">{isEn ? "Security code" : "Code de sécurité"}</h2>
              <p className="app-meta">
                  {isEn
                  ? "Enter the 6-digit code from your authenticator or notification."
                  : "Saisissez le code à 6 chiffres (application ou notification)."}
                </p>
                {mfaLogin.devCode ? (
                <p className="app-meta">
                  {isEn ? "Dev code:" : "Code dev :"} <code>{mfaLogin.devCode}</code>
                  </p>
                ) : null}
                <input
                placeholder={isEn ? "6-digit code" : "Code à 6 chiffres"}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                autoComplete="one-time-code"
              />
              <button type="submit">{isEn ? "Continue" : "Continuer"}</button>
              <button type="button" className="btn-secondary-outline" onClick={() => setMfaLogin(null)}>
                {isEn ? "Cancel" : "Annuler"}
                </button>
              </form>
          ) : null}
          {!loginWorkspaces && !mfaLogin && loginAuthStep === "forgot" ? (
            <form className="panel auth-simple-panel" onSubmit={onForgotPassword}>
              <h2 className="auth-simple-panel-title">{isEn ? "Reset password" : "Mot de passe oublié"}</h2>
              {forgotHintPlain ? (
                <p className="auth-simple-forgot-hint">{forgotHintPlain}</p>
              ) : null}
              <input
                type="email"
                autoComplete="email"
                placeholder={isEn ? "Your login email" : "Votre e-mail de connexion"}
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                required
              />
              <button type="submit" disabled={forgotBusy}>
                {isEn ? "Send link" : "Envoyer le lien"}
              </button>
              <button
                type="button"
                className="auth-simple-link-btn"
                onClick={() => {
                  setLoginAuthStep("signin");
                  setForgotNotice("");
                  setError("");
                }}
              >
                {isEn ? "Back to sign in" : "Retour à la connexion"}
              </button>
            </form>
          ) : null}
          {!loginWorkspaces && !mfaLogin && loginAuthStep === "reset" ? (
            <form className="panel auth-simple-panel" onSubmit={onResetPasswordSubmit}>
              <h2 className="auth-simple-panel-title">{isEn ? "New password" : "Nouveau mot de passe"}</h2>
                <p className="app-meta">
                {isEn ? "Choose a new password for your account." : "Choisissez un nouveau mot de passe."}
                </p>
                <input
                type="password"
                autoComplete="new-password"
                placeholder={isEn ? "New password (min. 6)" : "Nouveau mot de passe (min. 6)"}
                value={resetPasswordForm.password}
                onChange={(e) =>
                  setResetPasswordForm({ ...resetPasswordForm, password: e.target.value })
                }
                required
                minLength={6}
              />
              <input
                type="password"
                autoComplete="new-password"
                placeholder={isEn ? "Confirm password" : "Confirmer le mot de passe"}
                value={resetPasswordForm.confirm}
                onChange={(e) =>
                  setResetPasswordForm({ ...resetPasswordForm, confirm: e.target.value })
                }
                required
                minLength={6}
              />
              <button type="submit">{isEn ? "Update password" : "Mettre à jour"}</button>
            </form>
          ) : null}
          {!loginWorkspaces && !mfaLogin && loginAuthStep === "signin" ? (
            <form className="panel auth-simple-panel" onSubmit={onLogin}>
              <input
                type="email"
                autoComplete="username"
                placeholder={isEn ? "Email" : "E-mail"}
                  value={loginForm.email}
                onChange={(e) => {
                  setLoginWorkspaces(null);
                  setLoginForm({ ...loginForm, email: e.target.value });
                }}
                required
                />
                <input
                  type="password"
                autoComplete="current-password"
                placeholder={isEn ? "Password" : "Mot de passe"}
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                required
              />
              <button type="submit">{isEn ? "Sign in" : "Se connecter"}</button>
              <button
                type="button"
                className="auth-simple-link-btn"
                onClick={() => {
                  setLoginAuthStep("forgot");
                  setForgotEmail(loginForm.email || "");
                  setForgotNotice("");
                  setError("");
                }}
              >
                {isEn ? "Forgot password?" : "Mot de passe oublié ?"}
              </button>
              <p className="auth-simple-footer-links">
                {isEn ? "No account yet?" : "Pas encore de compte ?"}{" "}
                <a href="/signup">{isEn ? "Create one" : "Créer un compte"}</a>
                </p>
              </form>
          ) : null}
          <a className="auth-simple-back" href="/?site=public">
            <IconArrowLeft width={20} height={20} aria-hidden />
            {isEn ? "Homepage" : "Accueil"}
          </a>
        </div>
      </main>
      <PwaInstallPrompt
        enabled={pwaPromptGateOk}
        workspaceLabel={workspaceTitleForPwa || tenantSurfaceLogoAlt}
        isEn={isEn}
      />
      </>
    );
  }

  if (user.mustChangePassword) {
    return (
      <main className="auth-simple auth-simple--dark">
        <div className="auth-simple-card">
          <img
            className="auth-simple-logo"
            src={tenantSurfaceLogoSrc}
            alt={tenantSurfaceLogoAlt}
            width={80}
            height={80}
          />
          <h1 className="auth-simple-title">{tenantSurfaceLogoAlt}</h1>
          {tenantSurfaceLogoAlt !== "McBuleli" ? (
            <PoweredByMcBuleli
              className="auth-simple-powered-by"
              poweredByLabel={isEn ? "Powered by" : "Propulsé par"}
            />
          ) : null}
          <p className="auth-simple-sub">
              {t(
                "Vous devez mettre à jour votre mot de passe avant de continuer.",
                "You must update your password before continuing."
              )}
            </p>
          {error ? (
            <div role="alert" className="auth-simple-banner auth-simple-banner--error">
              {isEn ? translateToEnglish(error) : error}
            </div>
          ) : null}
          <form className="panel auth-simple-panel" onSubmit={onChangePassword}>
            <h2 className="auth-simple-panel-title">{t("Nouveau mot de passe", "Change password")}</h2>
          <input
            type="password"
              autoComplete="current-password"
            placeholder={t("Mot de passe actuel", "Current password")}
            value={passwordForm.currentPassword}
            onChange={(e) =>
              setPasswordForm({ ...passwordForm, currentPassword: e.target.value })
            }
          />
          <input
            type="password"
              autoComplete="new-password"
            placeholder={t("Nouveau mot de passe", "New password")}
            value={passwordForm.newPassword}
            onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
          />
          <button type="submit">{t("Enregistrer", "Save")}</button>
        </form>
        </div>
      </main>
    );
  }

  const workspaceBillingForDomain = platformBillingStatus || user.platformBilling;
  const canPrivateCustomDomain = Boolean(workspaceBillingForDomain?.package?.featureFlags?.customDomain);
  const isFieldAgent = user.role === "field_agent";
  const fieldTeamUsers = users.filter((u) => u.role === "field_agent");
  const dashboardTenantLogoSrc =
    branding?.logoUrl != null && String(branding.logoUrl).trim()
      ? publicAssetUrl(branding.logoUrl)
      : null;
  const showDashboardHeaderPromos = !user?.dashboardBanners?.length && !user?.dashboardBannerHtml;

  const gateMobile = isMobileShell;

  return (
    <>
    <main className={`container app-shell app-shell--dashboard-dark${isMobileShell ? " app-shell--mobile-pwa" : ""}`}>
      <div className="dashboard-sticky-stack">
        <header className="mb-header">
          <DashboardTopBar
            t={t}
            user={user}
            isFieldAgent={isFieldAgent}
            dashboardChatIspId={dashboardChatIspId}
            teamChatUnread={teamChatUnread}
            onToggleChat={() => setTeamChatOpen((o) => !o)}
            onOpenSettings={() => {
              if (isMobileShell) {
                navigateMobileScreen("settings");
                window.requestAnimationFrame(() => {
                  window.location.hash = "workspace-settings";
                });
              } else if (typeof window !== "undefined") {
                window.location.hash = "#workspace-settings";
              }
            }}
            onGoHome={() => {
              if (typeof window !== "undefined") window.location.href = "/?site=public";
            }}
            onLogout={onLogout}
            onToggleSidebar={() => {
              if (isMobileShell) {
                setMobilePwaMenuOpen((o) => !o);
              } else {
                setDashboardNavCompact((v) => !v);
              }
            }}
            sidebarOpen={isMobileShell ? mobilePwaMenuOpen : !dashboardNavCompactEffective}
            isMobileShell={isMobileShell}
          />
          <DashboardStickyBanner
            t={t}
            slides={user?.dashboardBanners}
            html={user?.dashboardBannerHtml}
            fallback={showDashboardHeaderPromos ? <PublicHomePromos t={t} isEn={isEn} variant="dashboard" /> : null}
            variant={isMobileShell ? "compact" : "default"}
          />
        </header>
        {dashboardChatIspId ? (
          <TeamChatPanel
            open={teamChatOpen}
            onClose={() => setTeamChatOpen(false)}
            ispId={dashboardChatIspId}
            user={user}
            t={t}
            isEn={isEn}
            isMobileShell={isMobileShell}
            onMarkReadComplete={() => setTeamChatUnread(0)}
            onChatProfileSaved={(p) => setUser((u) => (u ? { ...u, ...p } : u))}
          />
        ) : null}
      </div>
      <div
        className={`dashboard-layout${
          dashboardNavCompactEffective ? " dashboard-layout--nav-compact" : ""
        }${isMobileShell ? " dashboard-layout--mobile" : ""}`}
      >
        {!isMobileShell ? (
          <DashboardSideNav
            t={t}
            user={user}
            workspaceTitle={
              workspaceHeaderTitle(branding, tenantContext, isps, selectedIspId, user) || t("Espace opérateur", "Operator workspace")
            }
            companyLogoSrc={dashboardTenantLogoSrc || mcbuleliLogoUrl}
            userRoleLabel={formatStaffRole(user.role, isEn)}
            isFieldAgent={isFieldAgent}
            compact={dashboardNavCompactEffective}
            navCompactEffective={dashboardNavCompactEffective}
            navCompactPreference={dashboardNavCompact}
            onToggleNavCompact={() => setDashboardNavCompact((v) => !v)}
            navSearch={dashboardSidebarSearch}
            setNavSearch={setDashboardSidebarSearch}
          />
        ) : null}
        <div className="dashboard-main-column">
      {loading && <p>{t("Chargement…", "Loading...")}</p>}
      {error ? (
        <div role="alert" className="auth-simple-banner auth-simple-banner--error app-dash-alert">
          {isEn ? translateToEnglish(error) : error}
        </div>
      ) : null}
      {notice ? (
        <div role="status" className="auth-simple-banner auth-simple-banner--info app-dash-alert">
          {isEn ? translateToEnglish(notice) : notice}
        </div>
      ) : null}

      {(() => {
        const billing = isPlatformSuperRole(user.role) ? platformBillingStatus : user.platformBilling;
        if (!selectedIspId || !billing || billing.legacyWorkspace) return null;
        if (user.role === "field_agent") return null;
        if (user.role === "system_owner") return null;
        const locked = billing.accessAllowed === false;
        return (
          <DashboardScreenGate mobile={gateMobile} active={mobileScreen} id="billing">
            <section className={`panel ${locked ? "error" : ""}`} id="mcbuleli-billing">
            <h2>{t("Abonnement McBuleli (paiements standards)", "McBuleli subscription (standard payments)")}</h2>
            {locked ? (
              <p>
                {t(
                  "Cet espace est verrouillé jusqu'au paiement mensuel. Choisissez une méthode de paiement configurée, puis suivez la validation étape par étape.",
                  "This workspace is locked until monthly payment is received. Choose a configured payment method, then follow the step-by-step validation."
                )}
              </p>
            ) : null}
            {billing.package ? (
              <p>
                {t("Formule :", "Plan:")} <strong>{billing.package.name}</strong> ({billing.package.code}) —{" "}
                {isEn
                  ? `$${billing.monthlyPriceUsd}/month, about ${billing.cdfEstimateForMonth} CDF/month (estimate). Billing period: ${billing.billingPeriodDays} days after each successful payment.`
                  : `${billing.monthlyPriceUsd} $ / mois, environ ${billing.cdfEstimateForMonth} CDF/mois (estimation). Période de facturation : ${billing.billingPeriodDays} jours après chaque paiement réussi.`}
              </p>
            ) : null}
            {billing.subscription ? (
              <p>
                {t("Statut :", "Status:")} <strong>{billing.subscription.status}</strong> {t("jusqu'au", "until")}{" "}
                {new Date(billing.subscription.endsAt).toLocaleString("fr-FR")}.
              </p>
            ) : null}
            {(isPlatformSuperRole(user.role) ||
              user.role === "company_manager" ||
              user.role === "isp_admin") && (
              <>
                <h3>{t("Initier le paiement de renouvellement", "Start renewal payment")}</h3>
                <form onSubmit={onInitiatePlatformDeposit}>
                  <select
                    value={saasPayForm.packageId}
                    onChange={(e) => setSaasPayForm({ ...saasPayForm, packageId: e.target.value })}
                  >
                    <option value="">
                      {billing.package
                        ? `${billing.package.name} (${billing.monthlyPriceUsd} $ / mois)`
                        : t("Formule actuelle", "Current plan")}
                    </option>
                    {platformPackages
                      .filter((p) => ["essential", "pro", "business"].includes(p.code))
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.monthlyPriceUsd}&nbsp;$ / mois)
                        </option>
                      ))}
                  </select>
                  <select
                    value={saasPayForm.methodType}
                    onChange={(e) => setSaasPayForm({ ...saasPayForm, methodType: e.target.value })}
                  >
                    {platformBillingMethods
                      .filter((m) =>
                        ["mobile_money", "cash", "bank_transfer", "visa_card", "crypto_wallet", "binance_pay"].includes(
                          m.methodType
                        )
                      )
                      .map((m) => (
                        <option key={`${m.methodType}-${m.providerName}`} value={m.methodType}>
                          {paymentMethodTypeText(m.methodType, t)} — {m.providerName}
                        </option>
                      ))}
                    {!platformBillingMethods.length ? (
                      <option value="mobile_money">
                        {t("Aucune méthode active (configurer dans Facturation)", "No active method (configure in Billing)")}
                      </option>
                    ) : null}
                  </select>
                  {saasPayForm.methodType === "mobile_money" ? (
                    <>
                  <select
                    value={saasPayForm.currency}
                    onChange={(e) => setSaasPayForm({ ...saasPayForm, currency: e.target.value })}
                  >
                    <option value="CDF">{t("CDF (franc congolais)", "CDF (Congolese Franc)")}</option>
                    <option value="USD">USD</option>
                  </select>
                  <input
                    placeholder={t("MSISDN payeur (chiffres, indicatif, sans +)", "Payer MSISDN (digits, country code, no +)")}
                    value={saasPayForm.phoneNumber}
                    onChange={(e) => setSaasPayForm({ ...saasPayForm, phoneNumber: e.target.value })}
                  />
                  <select
                    value={saasPayForm.networkKey}
                    onChange={(e) => setSaasPayForm({ ...saasPayForm, networkKey: e.target.value })}
                  >
                    {availablePawapayNetworks.map((network) => (
                      <option key={network.key} value={network.key}>
                        {network.label}
                      </option>
                    ))}
                  </select>
                    </>
                  ) : (
                    <>
                      <input
                        placeholder={t("Référence transaction / reçu", "Transaction / receipt reference")}
                        value={saasPayForm.externalRef}
                        onChange={(e) => setSaasPayForm({ ...saasPayForm, externalRef: e.target.value })}
                      />
                      <input
                        placeholder={t("Contact payeur (facultatif)", "Payer contact (optional)")}
                        value={saasPayForm.payerContact}
                        onChange={(e) => setSaasPayForm({ ...saasPayForm, payerContact: e.target.value })}
                      />
                      <input
                        placeholder={t("Montant USD (facultatif)", "Amount USD (optional)")}
                        value={saasPayForm.amountUsd}
                        onChange={(e) => setSaasPayForm({ ...saasPayForm, amountUsd: e.target.value })}
                      />
                      {saasPayForm.methodType === "cash" ? (
                        <>
                          <input placeholder={t("Nom agent collecteur", "Collector name")} value={saasPayForm.collectorName} onChange={(e) => setSaasPayForm({ ...saasPayForm, collectorName: e.target.value })} />
                          <input placeholder={t("N° reçu", "Receipt number")} value={saasPayForm.receiptNumber} onChange={(e) => setSaasPayForm({ ...saasPayForm, receiptNumber: e.target.value })} />
                        </>
                      ) : null}
                      {saasPayForm.methodType === "bank_transfer" ? (
                        <>
                          <input placeholder={t("Banque", "Bank")} value={saasPayForm.bankName} onChange={(e) => setSaasPayForm({ ...saasPayForm, bankName: e.target.value })} />
                          <input placeholder={t("Titulaire", "Account owner")} value={saasPayForm.accountName} onChange={(e) => setSaasPayForm({ ...saasPayForm, accountName: e.target.value })} />
                          <input placeholder={t("N° compte", "Account number")} value={saasPayForm.accountNumber} onChange={(e) => setSaasPayForm({ ...saasPayForm, accountNumber: e.target.value })} />
                        </>
                      ) : null}
                      {saasPayForm.methodType === "visa_card" ? (
                        <>
                          <input placeholder={t("Acquéreur / PSP", "Processor / PSP")} value={saasPayForm.processorName} onChange={(e) => setSaasPayForm({ ...saasPayForm, processorName: e.target.value })} />
                          <input placeholder={t("4 derniers chiffres carte", "Card last 4 digits")} value={saasPayForm.cardLast4} onChange={(e) => setSaasPayForm({ ...saasPayForm, cardLast4: e.target.value })} />
                          <input placeholder={t("Code autorisation", "Authorization code")} value={saasPayForm.authCode} onChange={(e) => setSaasPayForm({ ...saasPayForm, authCode: e.target.value })} />
                        </>
                      ) : null}
                      {(saasPayForm.methodType === "crypto_wallet" || saasPayForm.methodType === "binance_pay") ? (
                        <>
                          <input placeholder={t("Réseau wallet", "Wallet network")} value={saasPayForm.walletNetwork} onChange={(e) => setSaasPayForm({ ...saasPayForm, walletNetwork: e.target.value })} />
                          <input placeholder={t("Adresse wallet", "Wallet address")} value={saasPayForm.walletAddress} onChange={(e) => setSaasPayForm({ ...saasPayForm, walletAddress: e.target.value })} />
                        </>
                      ) : null}
                    </>
                  )}
                  <button type="submit" disabled={!selectedIspId}>
                    {t("Soumettre le paiement", "Submit payment")}
                  </button>
                </form>
                {saasDepositResult?.depositId ? (
                  <p>
                    {t("ID dépôt :", "Deposit ID:")} {saasDepositResult.depositId}{" "}
                    {saasPayForm.methodType === "mobile_money" ? (
                      <button type="button" onClick={onPollPlatformDeposit}>
                        {t("Vérifier le paiement", "Check payment status")}
                      </button>
                    ) : (
                      <button type="button" onClick={onConfirmManualPlatformDeposit}>
                        {t("Confirmer réception et activer", "Confirm receipt and activate")}
                      </button>
                    )}
                  </p>
                ) : null}
              </>
            )}
            {billing.subscription?.status === "trialing" ? (
              <p style={{ fontSize: "0.9rem", color: "var(--mb-muted)" }}>
                {t(
                  "Pour changer de formule, choisissez le nouveau plan puis une méthode de paiement configurée. L’activation est appliquée après validation du paiement.",
                  "To switch plan, select the new tier then a configured payment method. Activation is applied after payment validation."
                )}
              </p>
            ) : null}
          </section>
          </DashboardScreenGate>
        );
      })()}

      {!isFieldAgent ? (
        <DashboardScreenGate mobile={gateMobile} active={mobileScreen} id="dashboard">
          <>
            {user.role === "system_owner" ? (
              <section className="grid metrics dashboard-section-anchor" id="dashboard-overview">
                <Card title={t("FAI", "ISPs")} value={superDashboard?.totalIsps ?? 0} />
                <Card title={t("Clients (tous FAI)", "All Customers")} value={superDashboard?.totalCustomers ?? 0} />
                <Card
                  title={t("Abonnements actifs (tous)", "All Active Subscriptions")}
                  value={superDashboard?.totalActiveSubscriptions ?? 0}
                />
                <Card
                  title={t("CA factures payées cumulé (tous FAI)", "Lifetime paid-invoice revenue (all ISPs)")}
                  value={formatUsd(superDashboard?.totalRevenueUsd ?? 0, dashLocale)}
                />
              </section>
            ) : null}

            <section className="panel dashboard-analytics-period" id="reports">
              <h2>{t("Analyse — fenêtre temporelle", "Analytics — time window")}</h2>
              <p className="app-meta dashboard-analytics-period__lead">
                {t(
                  "Les indicateurs « flux » et caisse utilisent strictement l’intervalle ci‑dessous (paiements confirmés par date de paiement). Les stocks (clients, abonnements, facturation cumulée) sont des instantanés au dernier chargement.",
                  "Flow KPIs and cashbox use strictly the interval below (confirmed payments by payment date). Stock KPIs (customers, subscriptions, lifetime billed revenue) are snapshots from the latest refresh."
                )}
              </p>
              <div className="dashboard-analytics-period__controls">
                <label className="app-meta dashboard-analytics-period__control">
                  <span>{t("Du", "From")}</span>
                  <input
                    type="date"
                    value={statsPeriod.from}
                    onChange={(e) => setStatsPeriod((s) => ({ ...s, from: e.target.value }))}
                  />
                </label>
                <label className="app-meta dashboard-analytics-period__control">
                  <span>{t("Au", "To")}</span>
                  <input
                    type="date"
                    value={statsPeriod.to}
                    onChange={(e) => setStatsPeriod((s) => ({ ...s, to: e.target.value }))}
                  />
                </label>
                <button type="button" className="btn-secondary-outline" onClick={() => refresh()} disabled={!selectedIspId}>
                  {t("Mettre à jour les données", "Refresh data")}
                </button>
              </div>
              {networkStats?.computedAt ? (
                <p className="app-meta dashboard-analytics-period__fresh">
                  {t("Calcul agrégats réseau / paiements :", "Network / payments aggregates computed:")}{" "}
                  <time dateTime={networkStats.computedAt}>
                    {new Date(networkStats.computedAt).toLocaleString(dashLocale)}
                  </time>
                  {networkStats?.previousPeriod ? (
                    <>
                      {" "}
                      ·{" "}
                      {t("Comparaison Δ — fenêtre précédente :", "Δ comparison — previous window:")}{" "}
                      <span className="dashboard-analytics-period__iso-range">
                        {formatIsoRange(networkStats.previousPeriod.from, networkStats.previousPeriod.to)}
                      </span>
                    </>
                  ) : null}
                </p>
              ) : null}
              {networkStats?.quality?.flags?.includes("partial_daily_rollups") ? (
                <p className="dashboard-quality-flag" role="status">
                  {glossaryTooltip(isEn, "partial_daily_rollups")}
                </p>
              ) : null}
              <details className="dashboard-roadmap-details">
                <summary>{t("Feuille de route rapports avancés", "Advanced reporting roadmap")}</summary>
                <p className="app-meta">
                  {t(
                    "Exports CSV planifiés, seuils d’alerte, diagnostics qualité données — extensions prévues hors de ce tableau synthétique.",
                    "Scheduled CSV exports, alert thresholds, data-quality diagnostics — extensions planned beyond this executive summary."
                  )}
                </p>
              </details>
            </section>

            {selectedIspId ? (
              <>
                <h3 className="dashboard-analytics-block-title">{t("A — Stocks", "A — Stock")}</h3>
                <section className="grid analytic-metric-grid">
                  <AnalyticMetricCard
                    t={t}
                    title={t("Clients", "Customers")}
                    value={formatCount(dashboard?.totalCustomers ?? 0, dashLocale)}
                    timeframe={t("Instantané", "Snapshot")}
                    definitionTitle={glossaryTooltip(isEn, "stock_snapshot_count")}
                  />
                  <AnalyticMetricCard
                    t={t}
                    title={t("Abonnements actifs", "Active subscriptions")}
                    value={formatCount(dashboard?.activeSubscriptions ?? 0, dashLocale)}
                    timeframe={t("Instantané", "Snapshot")}
                    definitionTitle={glossaryTooltip(isEn, "stock_snapshot_count")}
                  />
                  <AnalyticMetricCard
                    t={t}
                    title={t("Factures ouvertes", "Open invoices")}
                    value={formatCount(dashboard?.unpaidInvoices ?? 0, dashLocale)}
                    timeframe={t("Instantané", "Snapshot")}
                    definitionTitle={glossaryTooltip(isEn, "open_unpaid_invoice_count")}
                  />
                  <AnalyticMetricCard
                    t={t}
                    title={t("CA factures « payées » (cumul historique)", "Lifetime paid invoice revenue")}
                    value={formatUsd(dashboard?.revenueUsd ?? 0, dashLocale)}
                    timeframe={t("Cumul tout temps", "All-time cumulative")}
                    definitionTitle={glossaryTooltip(isEn, "cumulative_paid_invoice_amount_all_time")}
                  />
                </section>

                <h3 className="dashboard-analytics-block-title">{t("B — Flux réseau & encaissements", "B — Network & collections")}</h3>
                <p className="app-meta dashboard-aggregation-notes">
                  {t(
                    "Agrégations réseau : Hotspot & PPPoE = somme des relevés journaliers ; appareils connectés = pic journalier maximal ; bande passante = somme Go/j sur la période.",
                    "Network aggregation: Hotspot & PPPoE = sum of daily rollups; connected devices = maximum daily peak; bandwidth = sum of GB/day over the interval."
                  )}
                </p>
                <section className="grid analytic-metric-grid">
                  <AnalyticMetricCard
                    t={t}
                    title={t("Utilisateurs hotspot (somme journalière)", "Hotspot users (sum of daily)")}
                    value={formatCount(networkStats?.hotspotUsers ?? 0, dashLocale)}
                    timeframe={formatIsoRange(statsPeriod.from, statsPeriod.to)}
                    comparison={networkStats?.comparison?.hotspotUsers}
                    deltaHint="up_good"
                    definitionTitle={glossaryTooltip(isEn, "network_daily_rollup_sum")}
                    locale={dashLocale}
                  />
                  <AnalyticMetricCard
                    t={t}
                    title={t("Utilisateurs PPPoE (somme journalière)", "PPPoE users (sum of daily)")}
                    value={formatCount(networkStats?.pppoeUsers ?? 0, dashLocale)}
                    timeframe={formatIsoRange(statsPeriod.from, statsPeriod.to)}
                    comparison={networkStats?.comparison?.pppoeUsers}
                    deltaHint="up_good"
                    definitionTitle={glossaryTooltip(isEn, "network_daily_rollup_sum")}
                    locale={dashLocale}
                  />
                  <AnalyticMetricCard
                    t={t}
                    title={t("Appareils connectés (pic journalier)", "Connected devices (daily peak)")}
                    value={formatCount(networkStats?.connectedDevices ?? 0, dashLocale)}
                    timeframe={formatIsoRange(statsPeriod.from, statsPeriod.to)}
                    comparison={networkStats?.comparison?.connectedDevices}
                    deltaHint="up_good"
                    definitionTitle={glossaryTooltip(isEn, "peak_connected_devices_max_over_days")}
                    locale={dashLocale}
                  />
                  <AnalyticMetricCard
                    t={t}
                    title={t("Bande passante agrégée", "Aggregated bandwidth")}
                    value={formatGb(networkStats?.bandwidthTotalGb ?? 0, 2, dashLocale)}
                    timeframe={formatIsoRange(statsPeriod.from, statsPeriod.to)}
                    comparison={networkStats?.comparison?.bandwidthTotalGb}
                    deltaHint="neutral"
                    definitionTitle={glossaryTooltip(isEn, "bandwidth_sum_daily_gb")}
                    locale={dashLocale}
                  />
                  <AnalyticMetricCard
                    t={t}
                    title={t("Encaissements confirmés", "Confirmed collections")}
                    value={formatUsd(networkStats?.revenueCollectedUsd ?? 0, dashLocale)}
                    timeframe={formatIsoRange(statsPeriod.from, statsPeriod.to)}
                    comparison={networkStats?.comparison?.revenueCollectedUsd}
                    deltaHint="up_good"
                    definitionTitle={glossaryTooltip(isEn, "confirmed_payments_by_paid_at_in_period")}
                    locale={dashLocale}
                  />
                </section>

                <h3 className="dashboard-analytics-block-title">{t("C — Caisse par canal", "C — Cashbox by channel")}</h3>
                <section className="grid analytic-metric-grid">
                  <AnalyticMetricCard
                    t={t}
                    title={t("Cash", "Cash")}
                    value={formatUsd(dashboard?.cashbox?.cashUsd ?? 0, dashLocale)}
                    timeframe={formatIsoRange(statsPeriod.from, statsPeriod.to)}
                    comparison={dashboard?.meta?.comparison?.cashUsd}
                    deltaHint="up_good"
                    definitionTitle={glossaryTooltip(isEn, "cashbox_by_method_period")}
                    locale={dashLocale}
                  />
                  <AnalyticMetricCard
                    t={t}
                    title={t("TID validés", "Validated TID")}
                    value={formatUsd(dashboard?.cashbox?.tidUsd ?? 0, dashLocale)}
                    timeframe={formatIsoRange(statsPeriod.from, statsPeriod.to)}
                    comparison={dashboard?.meta?.comparison?.tidUsd}
                    deltaHint="up_good"
                    definitionTitle={glossaryTooltip(isEn, "cashbox_by_method_period")}
                    locale={dashLocale}
                  />
                  <AnalyticMetricCard
                    t={t}
                    title={t("Mobile Money", "Mobile Money")}
                    value={formatUsd(dashboard?.cashbox?.mobileMoneyUsd ?? 0, dashLocale)}
                    timeframe={formatIsoRange(statsPeriod.from, statsPeriod.to)}
                    comparison={dashboard?.meta?.comparison?.mobileMoneyUsd}
                    deltaHint="up_good"
                    definitionTitle={glossaryTooltip(isEn, "cashbox_by_method_period")}
                    locale={dashLocale}
                  />
                  <AnalyticMetricCard
                    t={t}
                    title={t("Retirable Mobile Money", "Withdrawable Mobile Money")}
                    value={formatUsd(dashboard?.cashbox?.withdrawableMobileMoneyUsd ?? 0, dashLocale)}
                    timeframe={formatIsoRange(statsPeriod.from, statsPeriod.to)}
                    comparison={dashboard?.meta?.comparison?.withdrawableMobileMoneyUsd}
                    deltaHint="up_good"
                    definitionTitle={glossaryTooltip(isEn, "cashbox_by_method_period")}
                    locale={dashLocale}
                  />
                </section>

                <h3 className="dashboard-analytics-block-title">{t("D — Temps quasi réel RADIUS", "D — Near-real-time RADIUS")}</h3>
                <section className="panel dashboard-online-radar">
                  <div className="dashboard-online-radar__summary">
                    <p className="dashboard-online-radar__count-line">
                      <strong>{formatCount(dashboard?.networkSessions ?? onlineSessions.length, dashLocale)}</strong>{" "}
                      {t("sessions corrélées abonnés", "subscriber-correlated sessions")}
                    </p>
                    <p className="app-meta">
                      {t(
                        `Fenêtre active : ${dashboard?.networkSessionsWindowMinutes || onlineSessionsWindowMinutes} minutes.`,
                        `Active window: ${dashboard?.networkSessionsWindowMinutes || onlineSessionsWindowMinutes} minutes.`
                      )}{" "}
                      <span title={glossaryTooltip(isEn, "radius_live_correlated_window")}>ⓘ</span>
                    </p>
                  </div>
                  <h4>{t("Détail des sessions récentes", "Recent session rows")}</h4>
                  <p className="app-meta">
                    {t(
                      "Corrélation username RADIUS → client → abonnement actif (extrait).",
                      "Maps RADIUS username → customer → active subscription (sample)."
                    )}
                  </p>
                  {onlineSessions.length === 0 ? (
                    <p>
                      {t(
                        "Aucune session détectée dans la fenêtre courante.",
                        "No sessions detected in the current window."
                      )}
                    </p>
                  ) : (
                    onlineSessions.slice(0, 25).map((row) => (
                      <p key={row.ingestId}>
                        {new Date(row.seenAt).toLocaleString(dashLocale)} —{" "}
                        {row.customerName || row.customerPhone || row.username} ({row.username})
                        {row.planName ? ` · ${row.planName}` : ""}
                        {row.accessType ? ` · ${row.accessType}` : ""}
                        {row.framedIpAddress ? ` · IP ${row.framedIpAddress}` : ""}
                      </p>
                    ))
                  )}
                </section>

                <section className="panel dashboard-ratio-panel">
                  <h4>{t("Ratios indicatifs", "Indicative ratios")}</h4>
                  <ul className="dashboard-ratio-list">
                    <li>
                      {t("Factures ouvertes / client", "Open invoices / customer")}:{" "}
                      <strong>
                        {(
                          (dashboard?.unpaidInvoices ?? 0) / Math.max(dashboard?.totalCustomers ?? 0, 1)
                        ).toLocaleString(dashLocale, { maximumFractionDigits: 3 })}
                      </strong>
                    </li>
                    <li>
                      {t("Encaissements confirmés / client (période)", "Confirmed collections / customer (period)")}:{" "}
                      <strong>
                        {formatUsd(
                          (networkStats?.revenueCollectedUsd ?? 0) / Math.max(dashboard?.totalCustomers ?? 0, 1),
                          dashLocale
                        )}
                      </strong>
                    </li>
                    <li>
                      {t("Sessions en ligne / abonnement actif", "Online sessions / active subscription")}:{" "}
                      <strong>
                        {(
                          (dashboard?.networkSessions ?? onlineSessions.length) /
                          Math.max(dashboard?.activeSubscriptions ?? 0, 1)
                        ).toLocaleString(dashLocale, { maximumFractionDigits: 3 })}
                      </strong>
                    </li>
                  </ul>
                </section>
              </>
            ) : (
              <p className="app-meta">{t("Choisissez un espace FAI pour afficher les analyses.", "Pick an ISP workspace to load analytics.")}</p>
            )}

            {!loading && selectedIspId ? (
              <Suspense
                fallback={
                  <p className="app-meta dashboard-suspense-fallback">
                    {t("Préparation des graphiques…", "Preparing charts…")}
                  </p>
                }
              >
                <DashboardHistograms
                  t={t}
                  isEn={isEn}
                  globalSummary={user.role === "system_owner" ? superDashboard : null}
                  networkStats={networkStats}
                  users={users}
                  telemetrySnapshots={telemetrySnapshots}
                />
              </Suspense>
            ) : null}

            {user.role === "system_owner" ? (
        <section className="panel" id="platform-banners">
          <h2>{t("Bannières tableau de bord (3 visuels)", "Dashboard banners (3 slides)")}</h2>
          <p className="app-meta" style={{ maxWidth: "56rem", marginBottom: 12 }}>
            {t(
              "Préparez trois images au même format paysage pour un défilement homogène. Recommandé : 1200 × 400 px (ratio ~3:1) ou 1920 × 360 px ; PNG, JPEG ou WebP ; max. 2 Mo par fichier. Un format « 24 × 45 » très vertical convient mal à cette zone : préférez une largeur nettement plus grande que la hauteur. Lien optionnel : URL complète en https://…",
              "Use three images with the same landscape dimensions for a clean rotation. Recommended: 1200 × 400 px (~3:1) or 1920 × 360 px; PNG, JPEG or WebP; max 2 MB each. A very tall 24×45-style strip fits poorly here—keep width clearly larger than height. Optional link: full https://… URL."
            )}
          </p>
          <p className="app-meta" style={{ marginBottom: 16 }}>
            {t(
              "Défilement automatique toutes les 6 secondes pour les bannières actives avec image. Réservé au compte propriétaire plateforme (system_owner).",
              "Auto-rotation every 6 seconds for active slides that have an image. Managed by the platform owner (system_owner) account only."
            )}
          </p>
          <div className="grid">
            {platformBannerSlots.map((slot) => {
              const ed = platformBannerEdits[slot.slotIndex] || {
                linkUrl: "",
                altText: "",
                isActive: true
              };
              return (
                <div key={slot.slotIndex} className="panel" style={{ margin: 0 }}>
                  <h3 style={{ marginTop: 0 }}>
                    {t("Bannière", "Banner")} {slot.slotIndex + 1}
                  </h3>
                  {platformBannerHasStoredImage(slot) ? (
                    <p style={{ margin: "8px 0" }}>
                      <img
                        src={platformBannerThumbSrc(slot)}
                        alt={ed.altText || slot.altText || ""}
                        style={{ maxWidth: "100%", maxHeight: 120, objectFit: "contain" }}
                      />
                    </p>
                  ) : (
                    <p className="app-meta">{t("Aucune image", "No image yet")}</p>
                  )}
                  <label style={{ display: "block", marginBottom: 8 }}>
                    {t("Fichier image", "Image file")}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      onChange={(e) => onPlatformBannerUpload(slot.slotIndex, e)}
                      style={{ display: "block", marginTop: 6 }}
                    />
                  </label>
                  <input
                    placeholder="https://…"
                    value={ed.linkUrl}
                    onChange={(e) =>
                      setPlatformBannerEdits((prev) => ({
                        ...prev,
                        [slot.slotIndex]: { ...ed, linkUrl: e.target.value }
                      }))
                    }
                  />
                  <input
                    placeholder={t("Texte alternatif (accessibilité)", "Alt text (accessibility)")}
                    value={ed.altText}
                    onChange={(e) =>
                      setPlatformBannerEdits((prev) => ({
                        ...prev,
                        [slot.slotIndex]: { ...ed, altText: e.target.value }
                      }))
                    }
                  />
                  <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                    <input
                      type="checkbox"
                      checked={ed.isActive}
                      onChange={(e) =>
                        setPlatformBannerEdits((prev) => ({
                          ...prev,
                          [slot.slotIndex]: { ...ed, isActive: e.target.checked }
                        }))
                      }
                    />
                    {t("Afficher dans le carrousel", "Show in carousel")}
                  </label>
                  <div className="platform-banner-card__actions">
                    <button type="button" onClick={() => onPlatformBannerSaveMeta(slot.slotIndex)}>
                      {t("Enregistrer", "Save")}
                    </button>
                    {platformBannerHasStoredImage(slot) ? (
                      <button type="button" className="btn-secondary-outline" onClick={() => onPlatformBannerDeleteImage(slot.slotIndex)}>
                        {t("Supprimer l'image", "Remove image")}
                      </button>
                    ) : null}
                  </div>
                  <p className="app-meta" style={{ marginTop: 8, marginBottom: 0 }}>
                    {t(
                      "Enregistrer applique le lien WhatsApp, le texte alternatif et l’affichage dans le carrousel. Choisir un fichier envoie tout de suite l’image.",
                      "Save applies the WhatsApp link, alt text, and carousel visibility. Choosing a file uploads the image immediately."
                    )}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {user.role === "system_owner" ? <PlatformHomeMarketingPanel t={t} isEn={isEn} /> : null}

      {user.role === "system_owner" && superDashboard?.tenants ? (
        <section className="panel" id="system-tenants">
          <h2>Vue créateur système</h2>
          <p>
            Compte propriétaire global. Les mots de passe des entreprises sont stockés de façon chiffrée et ne sont pas
            affichables ; utilisez les invitations ou la réinitialisation pour donner un nouvel accès.
          </p>
          <DataTable
            t={t}
            title={t("Espaces entreprises", "Tenant workspaces")}
            description={t("Recherche, tri et pagination standardisés.", "Standardized search, sorting and pagination.")}
            rows={tenantTableView.pageRows}
            columns={[
              {
                key: "name",
                header: t("Nom", "Name"),
                sortKey: "name",
                cell: (ten) => `${ten.name || "—"}${ten.isDemo ? " (démo)" : ""}`
              },
              { key: "location", header: t("Localisation", "Location"), sortKey: "location", cell: (ten) => ten.location || "—" },
              {
                key: "contactPhone",
                header: t("Téléphone", "Phone"),
                sortKey: "contactPhone",
                cell: (ten) => ten.contactPhone || "—"
              },
              {
                key: "subscriptionStatus",
                header: t("Abonnement", "Subscription"),
                sortKey: "subscriptionStatus",
                cell: (ten) => ten.subscriptionStatus || t("sans abonnement", "no subscription")
              },
              { key: "packageName", header: t("Forfait", "Package"), sortKey: "packageName", cell: (ten) => ten.packageName || "—" },
              {
                key: "createdAt",
                header: t("Créé", "Created"),
                sortKey: "createdAt",
                cell: (ten) => (ten.createdAt ? new Date(ten.createdAt).toLocaleDateString("fr-FR") : "—")
              },
              {
                key: "actions",
                header: t("Actions", "Actions"),
                cell: (ten) => (
                  <button type="button" onClick={() => refresh(ten.id)}>
                    {t("Ouvrir", "Open")}
                  </button>
                )
              }
            ]}
            searchValue={tenantTable.q}
            onSearchValueChange={(q) => setTenantTable((s) => ({ ...s, q, page: 1 }))}
            page={tenantTable.page}
            pageSize={tenantTable.pageSize}
            totalRows={tenantTableView.total}
            onPageChange={(page) => setTenantTable((s) => ({ ...s, page }))}
            onPageSizeChange={(pageSize) => setTenantTable((s) => ({ ...s, pageSize, page: 1 }))}
            sort={tenantTable.sort}
            onSortChange={(sort) => setTenantTable((s) => ({ ...s, sort }))}
          />
        </section>
      ) : null}

          </>
        </DashboardScreenGate>
      ) : null}

      {(isPlatformSuperRole(user.role) ||
        user.role === "company_manager" ||
        user.role === "isp_admin" ||
        user.role === "noc_operator" ||
        user.role === "billing_agent") &&
        !isFieldAgent && (
        <DashboardScreenGate mobile={gateMobile} active={mobileScreen} id="billing">
        <section className="panel">
          <h2>{t("Facturation en retard", "Overdue billing")}</h2>
          <p>
            {t(
              "Les factures impayées en retard suspendent l'accès abonné (MikroTik / RADIUS) et passent en retard. Un traitement automatique s'exécute aussi selon un planning.",
              "Past-due unpaid invoices suspend subscriber access (MikroTik / RADIUS) and are marked overdue. A background job runs on a schedule as well."
            )}
          </p>
          <button type="button" disabled={!selectedIspId} onClick={onProcessBillingOverdue}>
            {t("Lancer le traitement retard maintenant", "Run overdue job now")}
          </button>
          <button type="button" disabled={!selectedIspId} onClick={onGenerateRenewalInvoices}>
            {t("Générer les factures de renouvellement maintenant", "Generate renewal invoices now")}
          </button>
        </section>
        </DashboardScreenGate>
      )}

      <DashboardScreenGate mobile={gateMobile} active={mobileScreen} always>
      <section className="grid" id="tenant-workspace">
        {isPlatformSuperRole(user.role) && (
          <form className="panel" onSubmit={onCreateIsp}>
            <h2>{t("Créer un FAI (locataire)", "Create ISP Tenant")}</h2>
            <input
              placeholder={t("Nom du FAI", "ISP name")}
              value={ispForm.name}
              onChange={(e) => setIspForm({ ...ispForm, name: e.target.value })}
            />
            <input
              placeholder={t("Localisation", "Location")}
              value={ispForm.location}
              onChange={(e) => setIspForm({ ...ispForm, location: e.target.value })}
            />
            <input
              placeholder={t("Téléphone de contact", "Contact phone")}
              value={ispForm.contactPhone}
              onChange={(e) => setIspForm({ ...ispForm, contactPhone: e.target.value })}
            />
            <button type="submit">{t("Créer le FAI", "Create ISP")}</button>
          </form>
        )}

        <section className="panel">
          <h2>{t("Espace FAI actif", "Active ISP Workspace")}</h2>
          <select
            value={selectedIspId}
            onChange={(e) => refresh(e.target.value)}
            disabled={!isPlatformSuperRole(user.role) || Boolean(tenantContext?.ispId)}
          >
            <option value="">{t("Choisir un FAI", "Select ISP")}</option>
            {isps.map((isp) => (
              <option key={isp.id} value={isp.id}>
                {isp.name} ({isp.location})
              </option>
            ))}
          </select>
        </section>
      </section>
      </DashboardScreenGate>

      {!isFieldAgent && (
        <>
      <DashboardScreenGate mobile={gateMobile} active={mobileScreen} id="settings">
      <section className="grid" id="workspace-settings">
        {(isPlatformSuperRole(user.role) ||
          user.role === "company_manager" ||
          user.role === "isp_admin") && (
          <form className="panel" onSubmit={onSaveBranding}>
            <h2>Image de marque / marque blanche</h2>
            <input
              placeholder="Nom affiché"
              value={brandingForm.displayName}
              onChange={(e) => setBrandingForm({ ...brandingForm, displayName: e.target.value })}
            />
            <p className="app-meta" style={{ margin: "4px 0 10px", maxWidth: "52ch" }}>
              {t(
                "Identifiant technique de votre espace (souvent *.tenant.local à la création). Sert au routage « marque blanche » si vous accédez au tableau de bord via ce nom d’hôte ; ce n’est pas un domaine public DNS tant que vous n’avez pas souscrit au Premium sur mesure.",
                "Technical hostname for your workspace (often *.tenant.local at signup). Used for white-label routing when you open the dashboard via that host; it is not public DNS until you use Premium custom domain."
              )}
            </p>
            <input
              placeholder={t(
                "Sous-domaine technique (ex. mon-isp.tenant.local)",
                "Technical subdomain (e.g. my-isp.tenant.local)"
              )}
              value={brandingForm.subdomain}
              onChange={(e) => setBrandingForm({ ...brandingForm, subdomain: e.target.value })}
            />
            <input
              placeholder={t("Domaine DNS privé (Premium sur mesure)", "Private DNS domain (Premium custom)")}
              value={brandingForm.customDomain}
              onChange={(e) => setBrandingForm({ ...brandingForm, customDomain: e.target.value })}
              disabled={!canPrivateCustomDomain}
              title={
                canPrivateCustomDomain
                  ? undefined
                  : t(
                      "Réservé au forfait Premium sur mesure (domaine sur votre marque).",
                      "Reserved for Premium custom (on-demand) — your own brand domain."
                    )
              }
            />
            {!canPrivateCustomDomain ? (
              <p className="app-meta" style={{ margin: "4px 0 0", fontSize: "0.88rem" }}>
                {t(
                  "Le domaine DNS personnalisé (ex. admin.votredomaine.com) est activé uniquement sur le forfait Premium sur mesure. Les formules Essential et Pro conservent le sous-domaine technique ou l’accès via l’app McBuleli.",
                  "A custom DNS domain (e.g. admin.yourbrand.com) is only available on the Premium custom (on-demand) plan. Essential and Pro keep the technical subdomain or access via the hosted McBuleli app."
                )}
              </p>
            ) : null}
            <p className="app-meta" style={{ marginTop: 8, maxWidth: "56ch" }}>
              {t(
                "L’en-tête du tableau de bord affiche le logo McBuleli. Le logo et les couleurs ci‑dessous servent surtout au portail client, au Wi‑Fi invité, aux factures et aux exports.",
                "The dashboard header shows the McBuleli logo. The logo and colors below mainly apply to the customer portal, guest Wi‑Fi, invoices and exports."
              )}
            </p>
            <label style={{ display: "block", marginTop: 8 }}>
              Logo entreprise (depuis votre appareil)
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={onBrandingLogoFile} />
            </label>
            {brandingLogoPickPreview || brandingForm.logoUrl ? (
              <p className="branding-logo-preview" style={{ margin: "8px 0" }}>
                <img
                  src={brandingLogoPickPreview || publicAssetUrl(brandingForm.logoUrl)}
                  alt={t("Aperçu du logo", "Logo preview")}
                  style={{ maxHeight: 64, maxWidth: 220, objectFit: "contain", display: "block" }}
                />
              </p>
            ) : null}
            <input
              placeholder="URL logo externe (facultatif, https://…)"
              value={brandingForm.logoUrl?.startsWith("http") ? brandingForm.logoUrl : ""}
              onChange={(e) => {
                const v = e.target.value.trim();
                setBrandingForm((prev) => {
                  if (!v) {
                    if (prev.logoUrl?.startsWith("http")) return { ...prev, logoUrl: "" };
                    return prev;
                  }
                  return { ...prev, logoUrl: v };
                });
              }}
            />
            <input
              placeholder="Couleur principale (#hex)"
              value={brandingForm.primaryColor}
              onChange={(e) => setBrandingForm({ ...brandingForm, primaryColor: e.target.value })}
            />
            <input
              placeholder="Couleur secondaire (#hex)"
              value={brandingForm.secondaryColor}
              onChange={(e) =>
                setBrandingForm({ ...brandingForm, secondaryColor: e.target.value })
              }
            />
            <input
              placeholder="Pied de facture"
              value={brandingForm.invoiceFooter}
              onChange={(e) => setBrandingForm({ ...brandingForm, invoiceFooter: e.target.value })}
            />
            <input
              placeholder="Adresse"
              value={brandingForm.address}
              onChange={(e) => setBrandingForm({ ...brandingForm, address: e.target.value })}
            />
            <input
              placeholder="E-mail de contact"
              value={brandingForm.contactEmail}
              onChange={(e) => setBrandingForm({ ...brandingForm, contactEmail: e.target.value })}
            />
            <input
              placeholder="Téléphone de contact"
              value={brandingForm.contactPhone}
              onChange={(e) => setBrandingForm({ ...brandingForm, contactPhone: e.target.value })}
            />
            <label style={{ display: "block", marginTop: 12, maxWidth: "62ch" }}>
              <input
                type="checkbox"
                checked={Boolean(brandingForm.wifiZonePublic)}
                disabled={!selectedIspId || wifiZonePublicSaving}
                onChange={onWifiZonePublicToggle}
              />{" "}
              {t(
                "Afficher mon entreprise sur la Zone WiFi publique McBuleli (/wifi-zone : logo, région, téléphone, lien Wi‑Fi invité). Décochez pour masquer l’annuaire public.",
                "List my company on McBuleli’s public WiFi Zone (/wifi-zone: logo, region, phone, guest Wi-Fi link). Uncheck to hide from the public directory."
              )}
            </label>
            <p className="app-meta" style={{ margin: "6px 0 0", maxWidth: "62ch" }}>
              {t(
                "Ce réglage est enregistré immédiatement (vous n’avez pas besoin de cliquer sur « Enregistrer l’image de marque »). Les autres champs de cette section utilisent encore ce bouton.",
                "This setting saves immediately (you don’t need to click “Save branding”). Other fields in this section still use that button."
              )}
            </p>
            <p className="app-meta" style={{ margin: "8px 0 0", maxWidth: "62ch" }}>
              {t(
                "La visibilité publique dépend de l’abonnement plateforme et peut être retirée par un administrateur ; sans renouvellement, l’annuaire et les ventes Wi‑Fi invité côté public sont suspendus jusqu’au rétablissement du paiement.",
                "Public listing depends on your platform subscription and can be hidden by an admin; if billing lapses, directory presence and public guest Wi‑Fi purchases pause until the subscription is active again."
              )}
            </p>
            <input
              placeholder="Redirection après paiement Wi‑Fi (https://…)"
              value={brandingForm.wifiPortalRedirectUrl}
              onChange={(e) =>
                setBrandingForm({ ...brandingForm, wifiPortalRedirectUrl: e.target.value })
              }
            />
            <p className="app-meta" style={{ margin: "12px 0 6px", maxWidth: "56ch" }}>
              {t(
                "Image large affichée en bas de la page Wi‑Fi invité (/buy/packages ou /wifi), sous les offres — visuel promo, partenaires, etc. (PNG, JPEG, WebP, GIF ; max. 5 Mo).",
                "Wide image at the bottom of the guest Wi‑Fi page (/buy/packages or /wifi), below the plans — promos, partners, etc. (PNG, JPEG, WebP, GIF; max 5 MB)."
              )}
            </p>
            <label style={{ display: "block", marginTop: 4 }}>
              {t("Bannière bas de page Wi‑Fi invité", "Guest Wi‑Fi bottom banner")}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                disabled={!selectedIspId}
                onChange={onBrandingWifiBannerFile}
                style={{ display: "block", marginTop: 6 }}
              />
            </label>
            {branding?.wifiPortalBannerUrl ? (
              <div style={{ margin: "10px 0 0" }}>
                <img
                  src={publicAssetUrl(branding.wifiPortalBannerUrl)}
                  alt=""
                  style={{
                    width: "100%",
                    maxWidth: 520,
                    maxHeight: 160,
                    objectFit: "cover",
                    borderRadius: 14,
                    display: "block",
                    border: "1px solid rgba(93, 64, 55, 0.12)"
                  }}
                />
                <button
                  type="button"
                  className="btn-secondary-outline"
                  style={{ marginTop: 8 }}
                  disabled={!selectedIspId}
                  onClick={onClearBrandingWifiBanner}
                >
                  {t("Retirer la bannière Wi‑Fi", "Remove Wi‑Fi banner")}
                </button>
              </div>
            ) : null}
            <textarea
              placeholder={t(
                "Texte de pied de page portail client (RCCM, mentions légales…)",
                "Customer portal footer text (company reg., legal line…)"
              )}
              rows={3}
              value={brandingForm.portalFooterText}
              onChange={(e) =>
                setBrandingForm({ ...brandingForm, portalFooterText: e.target.value })
              }
            />
            <input
              placeholder={t(
                "Préfixe n° client portail (ex. CLI-)",
                "Portal client ID prefix (e.g. CLI-)"
              )}
              value={brandingForm.portalClientRefPrefix}
              onChange={(e) =>
                setBrandingForm({ ...brandingForm, portalClientRefPrefix: e.target.value })
              }
            />
            <button type="submit" disabled={!selectedIspId}>
              Enregistrer l'image de marque
            </button>
          </form>
        )}

        <section className="panel" aria-label={t("Compte", "Account")}>
          <h2>{t("Compte", "Account")}</h2>
          <p className="app-meta">
            {t(
              "Déconnexion de cet appareil et fermeture de l’espace opérateur.",
              "Sign out from this device and close the operator workspace."
            )}
          </p>
          <button type="button" className="btn-expense-delete" onClick={onLogout}>
            {t("Déconnexion", "Logout")}
          </button>
        </section>
      </section>
      </DashboardScreenGate>

      <DashboardScreenGate mobile={gateMobile} active={mobileScreen} id="billing">
      <section className="grid" id="billing-ops">
        {(isPlatformSuperRole(user.role) || user.role === "company_manager" || user.role === "isp_admin") && (
          <form className="panel" onSubmit={onCreatePaymentMethod}>
            <h2>{t("Moyens de paiement FAI", "ISP payment methods")}</h2>
            <p className="app-meta">
              {t(
                "Catalogue standard disponible: Cash, Mobile Money, Binance Pay, Virement bancaire, Portefeuille crypto et Visa Card. Les autres méthodes sont réservées aux demandes Premium.",
                "Standard catalog enabled: Cash, Mobile Money, Binance Pay, Bank transfer, Crypto wallet and Visa Card. Other methods are reserved for Premium requests."
              )}
            </p>
            <select
              value={paymentMethodForm.methodType}
              onChange={(e) =>
                setPaymentMethodForm({ ...paymentMethodForm, methodType: e.target.value })
              }
            >
              {["cash", "mobile_money", "binance_pay", "bank_transfer", "crypto_wallet", "visa_card"].map((key) => (
                <option key={key} value={key}>
                  {paymentMethodTypeText(key, t)}
                </option>
              ))}
            </select>
            <input
              placeholder={t("Nom du fournisseur", "Provider name")}
              value={paymentMethodForm.providerName}
              onChange={(e) =>
                setPaymentMethodForm({ ...paymentMethodForm, providerName: e.target.value })
              }
            />
            <input
              placeholder={t("Délai de validation (minutes)", "Validation ETA (minutes)")}
              value={paymentMethodForm.validationEtaMinutes}
              onChange={(e) => setPaymentMethodForm({ ...paymentMethodForm, validationEtaMinutes: e.target.value })}
            />
            <input
              placeholder={t("Note visible côté client", "Customer-facing note")}
              value={paymentMethodForm.note}
              onChange={(e) => setPaymentMethodForm({ ...paymentMethodForm, note: e.target.value })}
            />
            {paymentMethodForm.methodType === "cash" ? (
              <>
                <input
                  placeholder={t("Point de collecte", "Collection point")}
                  value={paymentMethodForm.collectionPoint}
                  onChange={(e) => setPaymentMethodForm({ ...paymentMethodForm, collectionPoint: e.target.value })}
                />
                <input
                  placeholder={t("Contact collecte", "Collection contact")}
                  value={paymentMethodForm.collectionContact}
                  onChange={(e) => setPaymentMethodForm({ ...paymentMethodForm, collectionContact: e.target.value })}
                />
              </>
            ) : null}
            {paymentMethodForm.methodType === "mobile_money" ? (
              <>
                <input
                  placeholder={t("Numéro Mobile Money", "Mobile Money number")}
                  value={paymentMethodForm.mobileMoneyNumber}
                  onChange={(e) => setPaymentMethodForm({ ...paymentMethodForm, mobileMoneyNumber: e.target.value })}
                />
                <input
                  placeholder={t("Nom bénéficiaire", "Beneficiary name")}
                  value={paymentMethodForm.accountName}
                  onChange={(e) => setPaymentMethodForm({ ...paymentMethodForm, accountName: e.target.value })}
                />
              </>
            ) : null}
            {paymentMethodForm.methodType === "bank_transfer" ? (
              <>
                <input placeholder={t("Banque", "Bank")} value={paymentMethodForm.bankName} onChange={(e) => setPaymentMethodForm({ ...paymentMethodForm, bankName: e.target.value })} />
                <input placeholder={t("Titulaire", "Account owner")} value={paymentMethodForm.accountName} onChange={(e) => setPaymentMethodForm({ ...paymentMethodForm, accountName: e.target.value })} />
                <input placeholder={t("N° compte", "Account number")} value={paymentMethodForm.accountNumber} onChange={(e) => setPaymentMethodForm({ ...paymentMethodForm, accountNumber: e.target.value })} />
                <input placeholder="IBAN" value={paymentMethodForm.iban} onChange={(e) => setPaymentMethodForm({ ...paymentMethodForm, iban: e.target.value })} />
                <input placeholder="SWIFT/BIC" value={paymentMethodForm.swiftCode} onChange={(e) => setPaymentMethodForm({ ...paymentMethodForm, swiftCode: e.target.value })} />
              </>
            ) : null}
            {(paymentMethodForm.methodType === "crypto_wallet" || paymentMethodForm.methodType === "binance_pay") ? (
              <>
                <input placeholder={t("Adresse wallet", "Wallet address")} value={paymentMethodForm.walletAddress} onChange={(e) => setPaymentMethodForm({ ...paymentMethodForm, walletAddress: e.target.value })} />
                <input placeholder={t("Réseau wallet", "Wallet network")} value={paymentMethodForm.walletNetwork} onChange={(e) => setPaymentMethodForm({ ...paymentMethodForm, walletNetwork: e.target.value })} />
                <input placeholder={t("Memo/Tag (optionnel)", "Memo/Tag (optional)")} value={paymentMethodForm.memoTag} onChange={(e) => setPaymentMethodForm({ ...paymentMethodForm, memoTag: e.target.value })} />
              </>
            ) : null}
            {paymentMethodForm.methodType === "visa_card" ? (
              <>
                <input placeholder={t("Acquéreur / PSP", "Processor / PSP")} value={paymentMethodForm.processorName} onChange={(e) => setPaymentMethodForm({ ...paymentMethodForm, processorName: e.target.value })} />
                <input placeholder={t("Libellé commerçant", "Merchant label")} value={paymentMethodForm.merchantLabel} onChange={(e) => setPaymentMethodForm({ ...paymentMethodForm, merchantLabel: e.target.value })} />
                <input placeholder={t("Contact support", "Support contact")} value={paymentMethodForm.supportContact} onChange={(e) => setPaymentMethodForm({ ...paymentMethodForm, supportContact: e.target.value })} />
              </>
            ) : null}
            <button type="submit" disabled={!selectedIspId}>
              {t("Ajouter un moyen de paiement", "Add payment method")}
            </button>
            {paymentMethods
              .filter((pm) => ["cash", "mobile_money", "binance_pay", "bank_transfer", "crypto_wallet", "visa_card"].includes(pm.methodType))
              .map((pm) => (
              <p key={pm.id}>
                {paymentMethodTypeText(pm.methodType, t)} — {pm.providerName} [
                {pm.isActive ? t("actif", "active") : t("inactif", "inactive")}]{" "}
                <button type="button" onClick={() => onTogglePaymentMethod(pm.id, !pm.isActive)}>
                  {pm.isActive ? t("Désactiver", "Disable") : t("Activer", "Enable")}
                </button>
                {" "}
                <button type="button" onClick={() => onGenerateGatewayCallback(pm.id)} disabled={!pm.isActive}>
                  {t("Générer callback gateway", "Generate gateway callback")}
                </button>
                {" "}
                <button type="button" onClick={() => onTestGatewayCallback(pm.id)} disabled={!pm.isActive}>
                  {t("Tester callback (activation)", "Test callback (activation)")}
                </button>
                {gatewayCallbackByMethod[pm.id] ? (
                  <span>
                    {" "}
                    — {t("URL", "URL")}: <code>{gatewayCallbackByMethod[pm.id].callbackUrl}</code>{" "}
                    <button
                      type="button"
                      onClick={() => copyToClipboard(gatewayCallbackByMethod[pm.id].callbackUrl)}
                    >
                      {t("Copier URL", "Copy URL")}
                    </button>{" "}
                    — {t("Secret", "Secret")}: <code>{gatewayCallbackByMethod[pm.id].callbackSecret}</code>{" "}
                    <button
                      type="button"
                      onClick={() => copyToClipboard(gatewayCallbackByMethod[pm.id].callbackSecret)}
                    >
                      {t("Copier secret", "Copy secret")}
                    </button>
                  </span>
                ) : null}
              </p>
            ))}
          </form>
        )}

        {(isPlatformSuperRole(user.role) || user.role === "company_manager") && (
          <form className="panel" onSubmit={onUpsertRoleProfile}>
            <h2>{t("Profils d'habilitation", "Accreditation profiles")}</h2>
            <select
              value={roleProfileForm.roleKey}
              onChange={(e) => setRoleProfileForm({ ...roleProfileForm, roleKey: e.target.value })}
            >
              {ROLE_PROFILE_OPTIONS.map((r) => (
                <option key={r.key} value={r.key}>
                  {t(r.fr, r.en)}
                </option>
              ))}
            </select>
            <select
              value={roleProfileForm.accreditationLevel}
              onChange={(e) =>
                setRoleProfileForm({ ...roleProfileForm, accreditationLevel: e.target.value })
              }
            >
              <option value="basic">{t("Basique", "Basic")}</option>
              <option value="standard">{t("Standard", "Standard")}</option>
              <option value="senior">{t("Senior", "Senior")}</option>
              <option value="manager">{t("Manager", "Manager")}</option>
            </select>
            <fieldset style={{ border: "1px solid var(--mb-border, rgba(255,255,255,0.12))", borderRadius: 10, padding: 10 }}>
              <legend className="app-meta">{t("Droits accordés", "Granted permissions")}</legend>
              {ROLE_PERMISSION_OPTIONS.map((p) => {
                const checked = Array.isArray(roleProfileForm.permissions) && roleProfileForm.permissions.includes(p.key);
                return (
                  <label key={p.key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const next = new Set(Array.isArray(roleProfileForm.permissions) ? roleProfileForm.permissions : []);
                        if (e.target.checked) next.add(p.key);
                        else next.delete(p.key);
                        setRoleProfileForm({ ...roleProfileForm, permissions: Array.from(next) });
                      }}
                    />
                    <span>{t(p.fr, p.en)}</span>
                  </label>
                );
              })}
            </fieldset>
            <button type="submit" disabled={!selectedIspId}>
              {t("Enregistrer le profil de rôle", "Save role profile")}
            </button>
            {roleProfiles.map((profile) => (
              <p key={profile.id}>
                {roleProfileLabel(profile.roleKey, t)} — {accreditationLabel(profile.accreditationLevel, t)} —{" "}
                {Array.isArray(profile.permissions)
                  ? profile.permissions.map((perm) => rolePermissionLabel(perm, t)).join(", ")
                  : ""}
              </p>
            ))}
          </form>
        )}
      </section>
      </DashboardScreenGate>

      <DashboardScreenGate mobile={gateMobile} active={mobileScreen} id="network">
      <section className="grid" id="network-ops">
        {(isPlatformSuperRole(user.role) || user.role === "company_manager" || user.role === "isp_admin") && (
          <form className="panel" onSubmit={onCreateNetworkNode}>
            <h2>Nœud réseau MikroTik</h2>
            <p className="app-meta" style={{ maxWidth: "56rem", marginBottom: 12 }}>
              Connexion à l&apos;API REST RouterOS via{" "}
              <code>
                {networkNodeForm.useTls ? "https" : "http"}://hôte:port/rest
              </code>
              . Le port <strong>443</strong> avec <strong>TLS</strong> est l&apos;usage courant lorsque le service REST
              est exposé en HTTPS. Vérifiez que l&apos;utilisateur API existe sur le routeur, que le service REST/API est
              activé, et que le pare-feu autorise ce port depuis le serveur McBuleli.
            </p>
            <input
              placeholder="Nom du nœud"
              value={networkNodeForm.name}
              onChange={(e) => setNetworkNodeForm({ ...networkNodeForm, name: e.target.value })}
            />
            <input
              placeholder="Hôte routeur (IP ou domaine)"
              value={networkNodeForm.host}
              onChange={(e) => setNetworkNodeForm({ ...networkNodeForm, host: e.target.value })}
            />
            <input
              type="number"
              placeholder="Port API"
              value={networkNodeForm.apiPort}
              onChange={(e) => setNetworkNodeForm({ ...networkNodeForm, apiPort: e.target.value })}
            />
            <input
              placeholder="Utilisateur routeur"
              value={networkNodeForm.username}
              onChange={(e) => setNetworkNodeForm({ ...networkNodeForm, username: e.target.value })}
            />
            <input
              type="password"
              placeholder="Mot de passe routeur"
              value={networkNodeForm.password}
              onChange={(e) => setNetworkNodeForm({ ...networkNodeForm, password: e.target.value })}
            />
            <input
              placeholder="Profil PPPoE par défaut"
              value={networkNodeForm.defaultPppoeProfile}
              onChange={(e) =>
                setNetworkNodeForm({ ...networkNodeForm, defaultPppoeProfile: e.target.value })
              }
            />
            <input
              placeholder="Profil hotspot par défaut"
              value={networkNodeForm.defaultHotspotProfile}
              onChange={(e) =>
                setNetworkNodeForm({ ...networkNodeForm, defaultHotspotProfile: e.target.value })
              }
            />
            <label>
              <input
                type="checkbox"
                checked={networkNodeForm.useTls}
                onChange={(e) => setNetworkNodeForm({ ...networkNodeForm, useTls: e.target.checked })}
              />{" "}
              Utiliser TLS
            </label>
            <label>
              <input
                type="checkbox"
                checked={networkNodeForm.isDefault}
                onChange={(e) =>
                  setNetworkNodeForm({ ...networkNodeForm, isDefault: e.target.checked })
                }
              />{" "}
              Définir comme nœud par défaut
            </label>
            <button type="submit" disabled={!selectedIspId}>
              Enregistrer le nœud
            </button>
          </form>
        )}

        <DataTable
          t={t}
          title={t("Appareils MikroTik (nœuds)", "MikroTik devices (nodes)")}
          description={t("Liste standardisée avec actions rapides.", "Standardized list with quick actions.")}
          rows={networkNodeTableView.pageRows}
          columns={[
            { key: "name", header: t("Nom", "Name"), sortKey: "name", cell: (n) => n.name || "—" },
            { key: "host", header: t("Hôte", "Host"), sortKey: "host", cell: (n) => `${n.host || "—"}:${n.apiPort || "—"}` },
            {
              key: "status",
              header: t("Statut", "Status"),
              sortKey: "isActive",
              cell: (n) => (n.isActive ? t("En ligne", "Online") : t("Hors ligne", "Offline"))
            },
            { key: "default", header: t("Défaut", "Default"), sortKey: "isDefault", cell: (n) => (n.isDefault ? "✓" : "—") },
            {
              key: "actions",
              header: t("Actions", "Actions"),
              cell: (n) => (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <button type="button" onClick={() => onToggleNetworkNode(n.id, !n.isActive)}>
                    {n.isActive ? t("Désactiver", "Disable") : t("Activer", "Enable")}
                  </button>
                  {!n.isDefault ? (
                    <button type="button" className="btn-secondary-outline" onClick={() => onSetDefaultNetworkNode(n.id)}>
                      {t("Par défaut", "Set default")}
                    </button>
                  ) : null}
                  {(isPlatformSuperRole(user.role) ||
                    user.role === "company_manager" ||
                    user.role === "isp_admin" ||
                    user.role === "noc_operator") ? (
                    <button type="button" className="btn-secondary-outline" onClick={() => onCollectTelemetry(n.id)}>
                      {t("Télémétrie", "Telemetry")}
                    </button>
                  ) : null}
                </div>
              )
            }
          ]}
          searchValue={networkNodeTable.q}
          onSearchValueChange={(q) => setNetworkNodeTable((s) => ({ ...s, q, page: 1 }))}
          page={networkNodeTable.page}
          pageSize={networkNodeTable.pageSize}
          totalRows={networkNodeTableView.total}
          onPageChange={(page) => setNetworkNodeTable((s) => ({ ...s, page }))}
          onPageSizeChange={(pageSize) => setNetworkNodeTable((s) => ({ ...s, pageSize, page: 1 }))}
          sort={networkNodeTable.sort}
          onSortChange={(sort) => setNetworkNodeTable((s) => ({ ...s, sort }))}
        />

        <section className="panel">
          <h2>{t("Événements de provisionnement", "Provisioning events")}</h2>
          <p className="app-meta">
            {t(
              "Résumé lisible des tentatives d'activation ou de suspension sur MikroTik (PPPoE / hotspot). Un statut « Ignoré » indique souvent qu'aucun nœud par défaut n'était prêt, pas une erreur client.",
              "Readable summary of activation or suspension attempts on MikroTik (PPPoE / hotspot). “Skipped” usually means no default node was ready—not necessarily a subscriber error."
            )}
          </p>
          {provisioningEvents.slice(0, 12).map((event) => {
            const hint = humanizeProvisioningEvent(event, isEn);
            return (
              <p key={event.id} className="network-event-line">
                <span className="network-event-line__meta">
                  {new Date(event.createdAt).toLocaleString()} — {event.action} ({event.accessType || "n/a"}) [
                  {event.status}]
                </span>
                {hint ? <span className="network-event-line__hint">{hint}</span> : null}
              </p>
            );
          })}
        </section>

        <section className="panel">
          <h2>{t("Synchronisation FreeRADIUS", "FreeRADIUS synchronization")}</h2>
          <p className="app-meta">
            {t(
              "Quand la synchro est active, McBuleli écrit dans les tables RADIUS locales. Si elle est désactivée globalement, les événements restent visibles à titre d'historique avec le motif « ignoré ».",
              "When sync is enabled, McBuleli writes to local RADIUS tables. If it is disabled globally, events remain visible for history with an “ignored” reason."
            )}
          </p>
          {radiusSyncEvents.slice(0, 12).map((event) => {
            const hint = humanizeRadiusSyncEvent(event, isEn);
            return (
              <p key={event.id} className="network-event-line">
                <span className="network-event-line__meta">
                  {new Date(event.createdAt).toLocaleString()} — {event.action} {event.username} [{event.status}]
                </span>
                {hint ? <span className="network-event-line__hint">{hint}</span> : null}
              </p>
            );
          })}
        </section>

        <section className="panel">
          <h2>Télémétrie réseau (MikroTik)</h2>
          <p>
            Derniers instantanés depuis <strong>Collecter la télémétrie</strong> sur chaque nœud. Les compteurs
            alimentent le graphique du jour (sessions PPPoE / hotspot de pointe).
          </p>
          <p className="app-meta">
            Les valeurs reflètent l&apos;instant de la collecte : peu de sessions peut être normal hors heures de pointe.
            En cas de baisse brutale ou de zéro prolongé alors que le trafic attendu est élevé, vérifiez le nœud et la
            connectivité API avant d&apos;ouvrir un ticket matériel.
          </p>
          {telemetrySnapshots.length === 0 ? (
            <p>Aucun instantané pour le moment.</p>
          ) : (
            telemetrySnapshots.slice(0, 20).map((row) => (
              <p key={row.id}>
                {new Date(row.createdAt).toLocaleString()} — {row.nodeName || row.nodeId?.slice(0, 8)}: PPPoE{" "}
                {row.pppoeActive}, Hotspot {row.hotspotActive}, devices {row.connectedDevices}
                {row.details?.pppoeSessionsSample?.length ? (
                  <small>
                    {" "}
                    (noms PPPoE :{" "}
                    {row.details.pppoeSessionsSample
                      .map((x) => x.name)
                      .filter(Boolean)
                      .join(", ") || "—"}
                    )
                  </small>
                ) : null}
              </p>
            ))
          )}
        </section>

        <section className="panel">
          <h2>Comptabilité RADIUS (reçue)</h2>
          <p>
            Lignes issues de <code>POST /api/webhooks/radius-accounting</code> (configurez FreeRADIUS rlm_rest ou exec
            pour transférer le JSON ; définissez <code>RADIUS_ACCOUNTING_WEBHOOK_SECRET</code> en production).
          </p>
          {radiusAccountingIngest.length === 0 ? (
            <p>Aucun enregistrement de comptabilité pour ce locataire.</p>
          ) : (
            radiusAccountingIngest.slice(0, 25).map((row) => (
              <p key={row.id}>
                {new Date(row.createdAt).toLocaleString()} — {row.username || "?"} / {row.acctStatusType || "?"}{" "}
                {row.framedIpAddress ? `IP ${row.framedIpAddress}` : ""}
              </p>
            ))
          )}
        </section>
      </section>
      </DashboardScreenGate>

      <DashboardScreenGate mobile={gateMobile} active={mobileScreen} id="users">
      <section className="grid" id="team-settings">
        {(isPlatformSuperRole(user.role) || user.role === "company_manager" || user.role === "isp_admin") && (
          <form className="panel" onSubmit={onUpsertNotificationProvider}>
            <h2>{t("Fournisseurs de notifications", "Notification providers")}</h2>
            <select
              value={notificationProviderForm.channel}
              onChange={(e) =>
                setNotificationProviderForm({ ...notificationProviderForm, channel: e.target.value })
              }
            >
              <option value="sms">SMS</option>
              <option value="email">{t("E-mail", "Email")}</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
            <select
              value={notificationProviderForm.providerKey}
              onChange={(e) =>
                setNotificationProviderForm({
                  ...notificationProviderForm,
                  providerKey: e.target.value
                })
              }
            >
              <option value="webhook">{t("Webhook HTTP", "HTTP webhook")}</option>
              <option value="twilio">Twilio</option>
              <option value="smtp">SMTP</option>
            </select>
            {notificationProviderForm.providerKey === "twilio" ? (
              <>
                <input
                  placeholder="SID compte Twilio"
                  value={notificationProviderForm.twilioAccountSid}
                  onChange={(e) =>
                    setNotificationProviderForm({
                      ...notificationProviderForm,
                      twilioAccountSid: e.target.value
                    })
                  }
                />
                <input
                  placeholder="Jeton d'authentification Twilio"
                  value={notificationProviderForm.twilioAuthToken}
                  onChange={(e) =>
                    setNotificationProviderForm({
                      ...notificationProviderForm,
                      twilioAuthToken: e.target.value
                    })
                  }
                />
                <input
                  placeholder="Numéro expéditeur Twilio (ou whatsapp:+…)"
                  value={notificationProviderForm.twilioFrom}
                  onChange={(e) =>
                    setNotificationProviderForm({
                      ...notificationProviderForm,
                      twilioFrom: e.target.value
                    })
                  }
                />
                <input
                  placeholder="SID service de messagerie (facultatif)"
                  value={notificationProviderForm.twilioMessagingServiceSid}
                  onChange={(e) =>
                    setNotificationProviderForm({
                      ...notificationProviderForm,
                      twilioMessagingServiceSid: e.target.value
                    })
                  }
                />
              </>
            ) : notificationProviderForm.providerKey === "smtp" ? (
              <>
                <input
                  placeholder="Hôte SMTP"
                  value={notificationProviderForm.smtpHost}
                  onChange={(e) =>
                    setNotificationProviderForm({ ...notificationProviderForm, smtpHost: e.target.value })
                  }
                />
                <input
                  placeholder="Port (défaut 587)"
                  value={notificationProviderForm.smtpPort}
                  onChange={(e) =>
                    setNotificationProviderForm({ ...notificationProviderForm, smtpPort: e.target.value })
                  }
                />
                <label>
                  <input
                    type="checkbox"
                    checked={notificationProviderForm.smtpSecure}
                    onChange={(e) =>
                      setNotificationProviderForm({
                        ...notificationProviderForm,
                        smtpSecure: e.target.checked
                      })
                    }
                  />{" "}
                  TLS (sécurisé)
                </label>
                <input
                  placeholder="Utilisateur SMTP (facultatif)"
                  value={notificationProviderForm.smtpUser}
                  onChange={(e) =>
                    setNotificationProviderForm({ ...notificationProviderForm, smtpUser: e.target.value })
                  }
                />
                <input
                  type="password"
                  placeholder="Mot de passe SMTP (facultatif)"
                  value={notificationProviderForm.smtpPass}
                  onChange={(e) =>
                    setNotificationProviderForm({ ...notificationProviderForm, smtpPass: e.target.value })
                  }
                />
                <input
                  placeholder="Adresse expéditrice (obligatoire)"
                  value={notificationProviderForm.smtpFrom}
                  onChange={(e) =>
                    setNotificationProviderForm({ ...notificationProviderForm, smtpFrom: e.target.value })
                  }
                />
              </>
            ) : (
              <>
                <input
                  placeholder="URL du webhook"
                  value={notificationProviderForm.webhookUrl}
                  onChange={(e) =>
                    setNotificationProviderForm({
                      ...notificationProviderForm,
                      webhookUrl: e.target.value
                    })
                  }
                />
                <input
                  placeholder="Nom d'en-tête d'authentification (facultatif)"
                  value={notificationProviderForm.authHeaderName}
                  onChange={(e) =>
                    setNotificationProviderForm({
                      ...notificationProviderForm,
                      authHeaderName: e.target.value
                    })
                  }
                />
                <input
                  placeholder="Jeton d'authentification (facultatif)"
                  value={notificationProviderForm.authToken}
                  onChange={(e) =>
                    setNotificationProviderForm({
                      ...notificationProviderForm,
                      authToken: e.target.value
                    })
                  }
                />
              </>
            )}
            <label>
              <input
                type="checkbox"
                checked={notificationProviderForm.isActive}
                onChange={(e) =>
                  setNotificationProviderForm({
                    ...notificationProviderForm,
                    isActive: e.target.checked
                  })
                }
              />{" "}
              Actif
            </label>
            <button type="submit" disabled={!selectedIspId}>
              Enregistrer le fournisseur
            </button>
            {notificationProviders.map((provider) => (
              <p key={provider.id}>
                {provider.channel} — {provider.providerKey} [{provider.isActive ? "actif" : "inactif"}]
              </p>
            ))}
          </form>
        )}
      </section>

      <section className="grid">
        <form className="panel" onSubmit={onCreatePaymentIntent}>
          <h2>{t("Encaissement manuel standard", "Standard manual collection")}</h2>
          <p className="app-meta">
            {t(
              "Procédure: 1) collecte preuve client, 2) validation financière FAI, 3) activation internet après confirmation.",
              "Procedure: 1) capture customer proof, 2) FAI finance validation, 3) internet activation after confirmation."
            )}
          </p>
          <select
            value={paymentIntentForm.invoiceId}
            onChange={(e) => setPaymentIntentForm({ ...paymentIntentForm, invoiceId: e.target.value })}
          >
            <option value="">
              {t("Choisir une facture ouverte (impayée / en retard)", "Select an open invoice (unpaid / overdue)")}
            </option>
            {invoices
              .filter((inv) => inv.status === "unpaid" || inv.status === "overdue")
              .map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.id.slice(0, 8)} — ${inv.amountUsd} ({invoiceStatusShort(inv.status, isEn)})
                </option>
              ))}
          </select>
          <select
            value={paymentIntentForm.channel}
            onChange={(e) => setPaymentIntentForm({ ...paymentIntentForm, channel: e.target.value })}
          >
            <option value="cash_agent">{t("Cash agent terrain", "Field cash collection")}</option>
            <option value="bank_transfer">{t("Virement bancaire", "Bank transfer")}</option>
            <option value="card_manual">{t("Visa Card (manuel)", "Visa Card (manual)")}</option>
            <option value="crypto_wallet">{t("Portefeuille crypto / Binance", "Crypto wallet / Binance")}</option>
            <option value="mobile_money_manual">{t("Mobile Money manuel", "Manual Mobile Money")}</option>
          </select>
          <input
            placeholder={t("Référence transaction / hash / reçu", "Transaction ref / hash / receipt")}
            value={paymentIntentForm.externalRef}
            onChange={(e) => setPaymentIntentForm({ ...paymentIntentForm, externalRef: e.target.value })}
          />
          <input
            placeholder={t("Téléphone ou contact payeur", "Payer phone or contact")}
            value={paymentIntentForm.payerContact}
            onChange={(e) => setPaymentIntentForm({ ...paymentIntentForm, payerContact: e.target.value })}
          />
          <input
            placeholder={t("Montant USD (facultatif)", "Amount USD (optional)")}
            value={paymentIntentForm.amountUsd}
            onChange={(e) => setPaymentIntentForm({ ...paymentIntentForm, amountUsd: e.target.value })}
          />
          {paymentIntentForm.channel === "cash_agent" ? (
            <>
              <input placeholder={t("Nom agent collecteur", "Collector agent name")} value={paymentIntentForm.collectorName} onChange={(e) => setPaymentIntentForm({ ...paymentIntentForm, collectorName: e.target.value })} />
              <input placeholder={t("N° reçu cash", "Cash receipt number")} value={paymentIntentForm.receiptNumber} onChange={(e) => setPaymentIntentForm({ ...paymentIntentForm, receiptNumber: e.target.value })} />
              <input placeholder={t("Lieu de collecte", "Collection location")} value={paymentIntentForm.collectionLocation} onChange={(e) => setPaymentIntentForm({ ...paymentIntentForm, collectionLocation: e.target.value })} />
              <input type="datetime-local" value={paymentIntentForm.collectedAt} onChange={(e) => setPaymentIntentForm({ ...paymentIntentForm, collectedAt: e.target.value })} />
            </>
          ) : null}
          {paymentIntentForm.channel === "bank_transfer" ? (
            <>
              <input placeholder={t("Banque", "Bank name")} value={paymentIntentForm.bankName} onChange={(e) => setPaymentIntentForm({ ...paymentIntentForm, bankName: e.target.value })} />
              <input placeholder={t("Nom du titulaire", "Account owner name")} value={paymentIntentForm.accountName} onChange={(e) => setPaymentIntentForm({ ...paymentIntentForm, accountName: e.target.value })} />
              <input placeholder={t("Numéro de compte", "Account number")} value={paymentIntentForm.accountNumber} onChange={(e) => setPaymentIntentForm({ ...paymentIntentForm, accountNumber: e.target.value })} />
            </>
          ) : null}
          {paymentIntentForm.channel === "card_manual" ? (
            <>
              <input placeholder={t("Acquéreur / PSP", "Processor / PSP")} value={paymentIntentForm.processorName} onChange={(e) => setPaymentIntentForm({ ...paymentIntentForm, processorName: e.target.value })} />
              <input placeholder={t("4 derniers chiffres carte", "Card last 4 digits")} value={paymentIntentForm.cardLast4} onChange={(e) => setPaymentIntentForm({ ...paymentIntentForm, cardLast4: e.target.value })} />
              <input placeholder={t("Code autorisation", "Authorization code")} value={paymentIntentForm.authCode} onChange={(e) => setPaymentIntentForm({ ...paymentIntentForm, authCode: e.target.value })} />
            </>
          ) : null}
          {paymentIntentForm.channel === "crypto_wallet" ? (
            <>
              <input placeholder={t("Réseau (TRC20, BEP20, etc.)", "Network (TRC20, BEP20, etc.)")} value={paymentIntentForm.walletNetwork} onChange={(e) => setPaymentIntentForm({ ...paymentIntentForm, walletNetwork: e.target.value })} />
              <input placeholder={t("Adresse wallet destinataire", "Destination wallet address")} value={paymentIntentForm.walletAddress} onChange={(e) => setPaymentIntentForm({ ...paymentIntentForm, walletAddress: e.target.value })} />
            </>
          ) : null}
          <button type="submit" disabled={!selectedIspId}>
            {t("Enregistrer l'encaissement manuel", "Record manual collection")}
          </button>
        </form>

        <form className="panel" onSubmit={onSubmitTid}>
          <h2>{t("Mobile Money manuel (TID)", "Manual Mobile Money (TID)")}</h2>
          <select
            value={tidForm.invoiceId}
            onChange={(e) => setTidForm({ ...tidForm, invoiceId: e.target.value })}
          >
            <option value="">
              {t("Choisir une facture ouverte (impayée / en retard)", "Select an open invoice (unpaid / overdue)")}
            </option>
            {invoices
              .filter((inv) => inv.status === "unpaid" || inv.status === "overdue")
              .map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.id.slice(0, 8)} — ${inv.amountUsd} ({invoiceStatusShort(inv.status, isEn)})
                </option>
              ))}
          </select>
          <input
            placeholder={t("Référence de transaction (TID)", "Transaction reference (TID)")}
            value={tidForm.tid}
            onChange={(e) => setTidForm({ ...tidForm, tid: e.target.value })}
          />
          <input
            placeholder={t("Téléphone payeur", "Payer phone")}
            value={tidForm.submittedByPhone}
            onChange={(e) => setTidForm({ ...tidForm, submittedByPhone: e.target.value })}
          />
          <input
            placeholder={t("Montant (facultatif)", "Amount (optional)")}
            value={tidForm.amountUsd}
            onChange={(e) => setTidForm({ ...tidForm, amountUsd: e.target.value })}
          />
          <button type="submit" disabled={!selectedIspId}>
            {t("Envoyer la TID", "Submit TID")}
          </button>
        </form>

        <section className="panel">
          <h2>{t("File de vérification des TID", "TID verification queue")}</h2>
          <button type="button" onClick={onQueueTidReminders} disabled={!selectedIspId}>
            {t("Mettre en file les rappels TID en attente", "Queue pending TID reminders")}
          </button>
          {tidSubmissions.map((row) => (
            <p key={row.id}>
              {row.tid} — {tidSubmissionStatusLabel(row.status, isEn)} — {t("facture", "invoice")}{" "}
              {row.invoiceId?.slice(0, 8)}{" "}
              {(isPlatformSuperRole(user.role) ||
                user.role === "company_manager" ||
                user.role === "isp_admin" ||
                user.role === "billing_agent") &&
                row.status === "pending" && (
                  <>
                    <button type="button" onClick={() => onReviewTid(row.id, "approved")}>
                      {t("Approuver", "Approve")}
                    </button>{" "}
                    <button type="button" onClick={() => onReviewTid(row.id, "rejected")}>
                      {t("Rejeter", "Reject")}
                    </button>
                  </>
                )}
            </p>
          ))}
          {tidConflicts.length > 0 && (
            <>
              <h3>{t("Conflits TID en double", "Duplicate TID conflicts")}</h3>
              {tidConflicts.map((c) => (
                <p key={c.tid}>
                  {c.tid} — {c.duplicates} {t("envoi(s)", "submission(s)")} — {c.statuses?.join(", ")}
                </p>
              ))}
            </>
          )}
        </section>

        <section className="panel">
          <h2>{t("Paiements manuels à valider", "Manual payments to validate")}</h2>
          <DataTable
            t={t}
            title={null}
            rows={paymentIntentTableView.pageRows}
            columns={[
              { key: "channel", header: t("Canal", "Channel"), sortKey: "channel", cell: (r) => r.channel || "—" },
              { key: "externalRef", header: t("Référence", "Reference"), sortKey: "externalRef", cell: (r) => r.externalRef || "—" },
              { key: "amountUsd", header: "USD", sortKey: "amountUsd", cell: (r) => Number(r.amountUsd || 0).toFixed(2) },
              { key: "status", header: t("Statut", "Status"), sortKey: "status", cell: (r) => paymentIntentStatusLabel(r.status, isEn) },
              { key: "createdAt", header: t("Créé", "Created"), sortKey: "createdAt", cell: (r) => (r.createdAt ? new Date(r.createdAt).toLocaleString(isEn ? "en-GB" : "fr-FR") : "—") },
              {
                key: "actions",
                header: t("Actions", "Actions"),
                cell: (r) =>
                  (isPlatformSuperRole(user.role) || user.role === "company_manager" || user.role === "isp_admin" || user.role === "billing_agent") &&
                  (r.status === "pending" || r.status === "approved_l1") ? (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" onClick={() => onReviewPaymentIntent(r.id, "approved")}>{t("Approuver", "Approve")}</button>
                      <button type="button" className="btn-secondary-outline" onClick={() => onReviewPaymentIntent(r.id, "rejected")}>{t("Rejeter", "Reject")}</button>
                    </div>
                  ) : "—"
              }
            ]}
            searchValue={paymentIntentTable.q}
            onSearchValueChange={(q) => setPaymentIntentTable((s) => ({ ...s, q, page: 1 }))}
            filters={
              <label className="app-meta" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                <span>{t("Statut", "Status")}</span>
                <select
                  value={paymentIntentTable.status}
                  onChange={(e) => setPaymentIntentTable((s) => ({ ...s, status: e.target.value, page: 1 }))}
                >
                  <option value="all">{t("Tous", "All")}</option>
                  <option value="pending">{t("En attente", "Pending")}</option>
                  <option value="approved_l1">{t("Niveau 1", "Level 1")}</option>
                  <option value="approved">{t("Approuvé", "Approved")}</option>
                  <option value="rejected">{t("Rejeté", "Rejected")}</option>
                </select>
              </label>
            }
            page={paymentIntentTable.page}
            pageSize={paymentIntentTable.pageSize}
            totalRows={paymentIntentTableView.total}
            onPageChange={(page) => setPaymentIntentTable((s) => ({ ...s, page }))}
            onPageSizeChange={(pageSize) => setPaymentIntentTable((s) => ({ ...s, pageSize, page: 1 }))}
            sort={paymentIntentTable.sort}
            onSortChange={(sort) => setPaymentIntentTable((s) => ({ ...s, sort }))}
          />
        </section>
      </section>

      <section className="grid">
        <form className="panel" onSubmit={onGenerateVouchers}>
          <h2>{t("Générer des bons d'accès", "Generate access vouchers")}</h2>
          <select
            value={voucherForm.planId}
            onChange={(e) => setVoucherForm({ ...voucherForm, planId: e.target.value })}
          >
            <option value="">{t("Choisir une formule", "Select a plan")}</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} ({plan.rateLimit}, {plan.durationDays} {t("jours", "days")})
              </option>
            ))}
          </select>
          <input
            type="number"
            min="1"
            max="100"
            value={voucherForm.quantity}
            onChange={(e) => setVoucherForm({ ...voucherForm, quantity: e.target.value })}
          />
          <label style={{ display: "block", marginTop: 8 }}>
            {t(
              "Appareils max par bon (défaut = limite de la formule)",
              "Max devices per voucher (defaults to plan limit)"
            )}
            <input
              type="number"
              min="1"
              max="100"
              placeholder={t("Défaut formule", "Plan default")}
              value={voucherForm.maxDevices}
              onChange={(e) => setVoucherForm({ ...voucherForm, maxDevices: e.target.value })}
              style={{ marginLeft: 8, width: 120 }}
            />
          </label>
          <button type="submit" disabled={!selectedIspId}>
            {t("Générer les bons", "Generate vouchers")}
          </button>
          <button type="button" onClick={onPrintVouchers} disabled={!selectedIspId}>
            {t("Imprimer les bons inutilisés", "Print unused vouchers")}
          </button>
          <button type="button" onClick={onExportVouchers} disabled={!selectedIspId}>
            {t("Exporter CSV", "Export CSV")}
          </button>
        </form>

        <form className="panel" onSubmit={onRedeemVoucher}>
          <h2>{t("Utiliser un bon", "Redeem voucher")}</h2>
          <input
            placeholder={t("Code du bon", "Voucher code")}
            value={voucherRedeemForm.code}
            onChange={(e) => setVoucherRedeemForm({ ...voucherRedeemForm, code: e.target.value })}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <input
              type="checkbox"
              checked={voucherRedeemForm.redeemByPhone}
              onChange={(e) =>
                setVoucherRedeemForm({ ...voucherRedeemForm, redeemByPhone: e.target.checked })
              }
            />
            {t(
              "Utiliser par téléphone (FAI = locataire sélectionné)",
              "Redeem by phone (ISP = selected tenant)"
            )}
          </label>
          {voucherRedeemForm.redeemByPhone ? (
            <input
              placeholder={t("Téléphone client (chiffres, indicatif)", "Customer phone (digits, country code)")}
              value={voucherRedeemForm.phone}
              onChange={(e) => setVoucherRedeemForm({ ...voucherRedeemForm, phone: e.target.value })}
            />
          ) : (
            <select
              value={voucherRedeemForm.customerId}
              onChange={(e) =>
                setVoucherRedeemForm({ ...voucherRedeemForm, customerId: e.target.value })
              }
            >
              <option value="">{t("Choisir un client", "Select a customer")}</option>
              {customers.map((cst) => (
                <option key={cst.id} value={cst.id}>
                  {cst.fullName}
                </option>
              ))}
            </select>
          )}
          <input
            type="password"
            placeholder={t(
              "Mot de passe portail (obligatoire si absent, min. 6 car.)",
              "Portal password (required if none, min. 6 chars)"
            )}
            value={voucherRedeemForm.newPassword}
            onChange={(e) => setVoucherRedeemForm({ ...voucherRedeemForm, newPassword: e.target.value })}
          />
          <button type="submit" disabled={!selectedIspId}>
            {t("Utiliser le bon", "Redeem voucher")}
          </button>
          <DataTable
            t={t}
            title={t("Derniers bons", "Latest vouchers")}
            rows={voucherTableView.pageRows}
            columns={[
              { key: "code", header: t("Code", "Code"), sortKey: "code", cell: (v) => v.code || "—" },
              { key: "rateLimit", header: t("Débit", "Speed"), sortKey: "rateLimit", cell: (v) => v.rateLimit || "—" },
              {
                key: "durationDays",
                header: t("Durée", "Duration"),
                sortKey: "durationDays",
                cell: (v) => (v.durationDays != null ? `${v.durationDays}d` : "—")
              },
              {
                key: "maxDevices",
                header: t("Appareils", "Devices"),
                sortKey: "maxDevices",
                cell: (v) => (v.maxDevices != null ? String(v.maxDevices) : "—")
              },
              { key: "status", header: t("Statut", "Status"), sortKey: "status", cell: (v) => v.status || "—" }
            ]}
            searchValue={voucherTable.q}
            onSearchValueChange={(q) => setVoucherTable((s) => ({ ...s, q, page: 1 }))}
            page={voucherTable.page}
            pageSize={voucherTable.pageSize}
            totalRows={voucherTableView.total}
            onPageChange={(page) => setVoucherTable((s) => ({ ...s, page }))}
            onPageSizeChange={(pageSize) => setVoucherTable((s) => ({ ...s, pageSize, page: 1 }))}
            sort={voucherTable.sort}
            onSortChange={(sort) => setVoucherTable((s) => ({ ...s, sort }))}
          />
        </form>
      </section>

      <section className="grid">
        <section className="panel">
          <h2>{t("Formule plateforme (facturation SaaS)", "Platform plan (SaaS billing)")}</h2>
          <form onSubmit={onCreatePlatformSubscription}>
            <select
              value={platformSubForm.packageId}
              onChange={(e) => setPlatformSubForm({ ...platformSubForm, packageId: e.target.value })}
            >
              <option value="">{t("Choisir une formule", "Select a plan")}</option>
              {platformPackages.map((pkg) => (
                <option key={pkg.id} value={pkg.id}>
                  {`${pkg.name} ($${pkg.monthlyPriceUsd}${t(" / mois", " / month")})`}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={platformSubForm.durationDays}
              onChange={(e) =>
                setPlatformSubForm({ ...platformSubForm, durationDays: e.target.value })
              }
            />
            <button type="submit" disabled={!selectedIspId || !isPlatformSuperRole(user.role)}>
              {t("Attribuer la formule", "Assign plan")}
            </button>
          </form>
          {platformSubscriptions.map((sub) => (
            <p key={sub.id}>
              {sub.packageName} ({sub.status}) {t("jusqu'au", "until")}{" "}
              {new Date(sub.endsAt).toLocaleDateString(isEn ? "en-GB" : "fr-FR")}
            </p>
          ))}
        </section>
      </section>

      <section className="grid">
        {(isPlatformSuperRole(user.role) || user.role === "company_manager" || user.role === "isp_admin") && (
          <form className="panel" onSubmit={onCreateUser}>
            <h2>{t("Créer un utilisateur équipe", "Create team user")}</h2>
            <input
              placeholder={t("Nom complet", "Full name")}
              value={userForm.fullName}
              onChange={(e) => setUserForm({ ...userForm, fullName: e.target.value })}
            />
            <input
              placeholder={t("E-mail", "Email")}
              value={userForm.email}
              onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
            />
            <input
              placeholder={t(
                "Mot de passe (obligatoire seulement pour un nouvel e-mail)",
                "Password (required only for a new email)"
              )}
              type="password"
              value={userForm.password}
              onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
            />
            <p className="app-meta">
              {t(
                "Si l’e-mail existe déjà sur McBuleli, le compte est rattaché à ce FAI sans changer le mot de passe.",
                "If the email already exists on McBuleli, the account is linked to this ISP without changing the password."
              )}
            </p>
            <input
              placeholder={t("Téléphone (facultatif)", "Phone (optional)")}
              value={userForm.phone}
              onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
            />
            <input
              placeholder={t("Adresse (facultatif)", "Address (optional)")}
              value={userForm.address}
              onChange={(e) => setUserForm({ ...userForm, address: e.target.value })}
            />
            <input
              placeholder={t("Site / zone affectée (facultatif)", "Site / zone (optional)")}
              value={userForm.assignedSite}
              onChange={(e) => setUserForm({ ...userForm, assignedSite: e.target.value })}
            />
            <select
              value={userForm.role}
              onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
            >
              {isPlatformSuperRole(user.role) && (
                <option value="company_manager">{t("Dirigeant entreprise", "Company manager")}</option>
              )}
              <option value="isp_admin">{t("Administrateur FAI", "ISP administrator")}</option>
              <option value="billing_agent">{t("Agent facturation", "Billing agent")}</option>
              <option value="noc_operator">{t("Opérateur NOC", "NOC operator")}</option>
              <option value="field_agent">{t("Agent terrain", "Field agent")}</option>
            </select>
            <select
              value={userForm.accreditationLevel}
              onChange={(e) =>
                setUserForm({ ...userForm, accreditationLevel: e.target.value })
              }
            >
              <option value="basic">{t("Accréditation : basique", "Accreditation: basic")}</option>
              <option value="standard">{t("Accréditation : standard", "Accreditation: standard")}</option>
              <option value="senior">{t("Accréditation : senior", "Accreditation: senior")}</option>
              <option value="manager">{t("Accréditation : manager", "Accreditation: manager")}</option>
            </select>
            <button type="submit" disabled={!selectedIspId}>
              {t("Créer l'utilisateur", "Create user")}
            </button>
          </form>
        )}

        <section className="panel">
          <h2>{t("Équipe du FAI", "ISP team")}</h2>
          {(isPlatformSuperRole(user.role) || user.role === "company_manager" || user.role === "isp_admin") && (
            <div style={{ marginBottom: 16 }}>
              <h3>{t("Import / export équipe (CSV)", "Import / export team (CSV)")}</h3>
              <p>
                {t(
                  "Téléchargez les comptes pour sauvegarde ou importez avec les colonnes : fullName, email, role, mot de passe facultatif. Les lignes sans mot de passe utilisent le défaut ci-dessous (min. 6 caractères).",
                  "Download accounts for backup or import with columns: fullName, email, role, optional password. Rows without a password use the default below (min. 6 characters)."
                )}
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <button type="button" onClick={onDownloadTeamUsersCsv} disabled={!selectedIspId}>
                  {t("Télécharger le CSV équipe", "Download team users CSV")}
                </button>
                <button type="button" onClick={() => api.downloadTeamImportTemplate()}>
                  {t("Télécharger le modèle d'import", "Download import template")}
                </button>
              </div>
              <p className="app-meta" style={{ marginTop: 8, fontSize: "0.9em" }}>
                {t("Modèle : ligne d'en-tête uniquement —", "Template: header row only —")}{" "}
                <code>fullName,email,role,password,accreditationLevel</code>.{" "}
                {t(
                  "Mot de passe vide = défaut ci-dessous ; rôle vide = rôle par défaut.",
                  "Empty password = default below; empty role = default role."
                )}
              </p>
              <form onSubmit={onImportTeamUsersCsv} style={{ marginTop: 12 }}>
                <input ref={teamCsvInputRef} type="file" accept=".csv,text/csv" />
                <input
                  type="password"
                  placeholder={t(
                    "Mot de passe par défaut pour les lignes sans (min. 6)",
                    "Default password for rows without one (min. 6)"
                  )}
                  value={teamImportPassword}
                  onChange={(e) => setTeamImportPassword(e.target.value)}
                />
                <select value={teamImportRole} onChange={(e) => setTeamImportRole(e.target.value)}>
                  {isPlatformSuperRole(user.role) && (
                    <option value="company_manager">{t("Dirigeant entreprise", "Company manager")}</option>
                  )}
                  <option value="isp_admin">{t("Administrateur FAI", "ISP administrator")}</option>
                  <option value="billing_agent">{t("Agent facturation", "Billing agent")}</option>
                  <option value="noc_operator">{t("Opérateur NOC", "NOC operator")}</option>
                  <option value="field_agent">{t("Agent terrain", "Field agent")}</option>
                </select>
                <button type="submit" disabled={!selectedIspId}>
                  {t("Importer le CSV équipe", "Import team CSV")}
                </button>
              </form>
              {teamImportReport ? (
                <CsvImportResultBlock
                  t={t}
                  createdCount={teamImportReport.createdCount}
                  skipped={teamImportReport.skipped}
                  errors={teamImportReport.errors}
                  onDismiss={() => setTeamImportReport(null)}
                />
              ) : null}
            </div>
          )}
          {generatedInvite && (
            <div>
              <p>
                {t("Dernier lien d'invitation :", "Latest invite link:")}{" "}
                <code>{generatedInvite.inviteLink}</code>
              </p>
              <p>
                {t("Jeton :", "Token:")} <code>{generatedInvite.token}</code>
              </p>
              <p>
                {t("Expire :", "Expires:")} {generatedInvite.expiresIn}
              </p>
            </div>
          )}
          {users.map((item) => {
            const d =
              teamRowDraft[item.id] || {
                role: item.role,
                phone: item.phone || "",
                address: item.address || "",
                assignedSite: item.assignedSite || "",
                accreditationLevel: item.accreditationLevel || "basic"
              };
            const canManageTeam =
              isPlatformSuperRole(user.role) || user.role === "company_manager" || user.role === "isp_admin";
            return (
              <div key={item.id} className="panel" style={{ marginBottom: 12 }}>
                <p style={{ marginTop: 0 }}>
                  <strong>{item.fullName}</strong> — {item.email}{" "}
                  <span className="app-meta">
                    [
                    {item.isActive
                      ? t("actif dans ce FAI", "active in this ISP")
                      : t("inactif dans ce FAI", "inactive in this ISP")}
                    {item.userAccountActive === false
                      ? t(" · compte global suspendu", " · account suspended globally")
                      : ""}
                    ]
                  </span>
                </p>
                {canManageTeam ? (
                  <div className="grid" style={{ gap: 8 }}>
                    <select
                      value={d.role}
                      onChange={(e) =>
                        setTeamRowDraft({
                          ...teamRowDraft,
                          [item.id]: { ...d, role: e.target.value }
                        })
                      }
                    >
                      {isPlatformSuperRole(user.role) && (
                        <option value="company_manager">{t("Dirigeant entreprise", "Company manager")}</option>
                      )}
                      <option value="isp_admin">{t("Administrateur FAI", "ISP administrator")}</option>
                      <option value="billing_agent">{t("Agent facturation", "Billing agent")}</option>
                      <option value="noc_operator">{t("Opérateur NOC", "NOC operator")}</option>
                      <option value="field_agent">{t("Agent terrain", "Field agent")}</option>
                    </select>
                    <select
                      value={d.accreditationLevel}
                      onChange={(e) =>
                        setTeamRowDraft({
                          ...teamRowDraft,
                          [item.id]: { ...d, accreditationLevel: e.target.value }
                        })
                      }
                    >
                      <option value="basic">{t("Accréditation : basique", "Accreditation: basic")}</option>
                      <option value="standard">{t("Accréditation : standard", "Accreditation: standard")}</option>
                      <option value="senior">{t("Accréditation : senior", "Accreditation: senior")}</option>
                      <option value="manager">{t("Accréditation : manager", "Accreditation: manager")}</option>
                    </select>
                    <input
                      placeholder={t("Téléphone", "Phone")}
                      value={d.phone}
                      onChange={(e) =>
                        setTeamRowDraft({ ...teamRowDraft, [item.id]: { ...d, phone: e.target.value } })
                      }
                    />
                    <input
                      placeholder={t("Adresse", "Address")}
                      value={d.address}
                      onChange={(e) =>
                        setTeamRowDraft({ ...teamRowDraft, [item.id]: { ...d, address: e.target.value } })
                      }
                    />
                    <input
                      placeholder={t("Site / zone", "Site / zone")}
                      value={d.assignedSite}
                      onChange={(e) =>
                        setTeamRowDraft({
                          ...teamRowDraft,
                          [item.id]: { ...d, assignedSite: e.target.value }
                        })
                      }
                    />
                    <button type="button" onClick={() => onSaveTeamUser(item.id)}>
                      {t("Enregistrer fiche & rôle", "Save profile & role")}
                    </button>
                  </div>
                ) : null}
                {canManageTeam ? (
                  <p style={{ marginBottom: 0 }}>
                    <button type="button" onClick={() => onResetPassword(item.id)}>
                      {t("Réinitialiser le mot de passe", "Reset password")}
                    </button>{" "}
                    <button type="button" onClick={() => onCreateInvite(item.id)}>
                      {t("Créer une invitation", "Create invite")}
                    </button>{" "}
                    {item.isActive ? (
                      <button type="button" onClick={() => onDeactivateUser(item.id)}>
                        {t("Désactiver dans ce FAI", "Disable in this ISP")}
                      </button>
                    ) : (
                      <button type="button" onClick={() => onReactivateUser(item.id)}>
                        {t("Réactiver dans ce FAI", "Reactivate in this ISP")}
                      </button>
                    )}{" "}
                    <button type="button" onClick={() => onSuspendUserGlobally(item.id)}>
                      {t("Suspendre compte (toutes entreprises)", "Suspend account (all companies)")}
                    </button>{" "}
                    {item.userAccountActive === false ? (
                      <button type="button" onClick={() => onReactivateUserGlobally(item.id)}>
                        {t("Réactiver connexion (global)", "Reactivate login (global)")}
                      </button>
                    ) : null}
                  </p>
                ) : null}
              </div>
            );
          })}
        </section>
      </section>
      </DashboardScreenGate>

      <DashboardScreenGate mobile={gateMobile} active={mobileScreen} id="settings">
      {user.role === "system_owner" ? (
        <section className="panel" id="audit">
          <h2>{t("Journal d'audit récent", "Recent audit log")}</h2>
          <p className="app-meta">
            {t(
              "Réservé au propriétaire plateforme : historique des actions pour le FAI sélectionné.",
              "Platform owner only: action history for the selected ISP."
            )}
          </p>
        {auditLogs.slice(0, 12).map((log) => (
          <p key={log.id}>
              {new Date(log.createdAt).toLocaleString()} — {log.action} ({log.entityType})
          </p>
        ))}
      </section>
      ) : null}

      <section className="panel">
        <h2>{t("File d'attente des notifications", "Notification outbox")}</h2>
        <p>
          {t("En file :", "Queued:")}{" "}
          {notificationOutbox.filter((row) => row.status === "queued").length} | {t("Envoyé :", "Sent:")}{" "}
          {notificationOutbox.filter((row) => row.status === "sent").length} | {t("Échec :", "Failed:")}{" "}
          {notificationOutbox.filter((row) => row.status === "failed").length}
        </p>
        <button onClick={onProcessNotificationOutbox} disabled={!selectedIspId}>
          {t("Traiter la file maintenant", "Process outbox now")}
        </button>
        {notificationOutbox.slice(0, 12).map((row) => (
          <p key={row.id}>
            {new Date(row.createdAt).toLocaleString()} - {row.templateKey} via {row.channel} ({row.status})
            {row.lastError ? ` - ${row.lastError}` : ""}
          </p>
        ))}
      </section>

      <section className="panel">
        <h2>{t("Envoyer une notification de test", "Send test notification")}</h2>
        <form onSubmit={onSendTestNotification}>
          <select
            value={notificationTestForm.channel}
            onChange={(e) =>
              setNotificationTestForm({ ...notificationTestForm, channel: e.target.value })
            }
          >
            <option value="sms">SMS</option>
            <option value="email">{t("E-mail", "Email")}</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
          <input
            placeholder={t("Destinataire (téléphone ou e-mail)", "Recipient (phone or email)")}
            value={notificationTestForm.recipient}
            onChange={(e) =>
              setNotificationTestForm({ ...notificationTestForm, recipient: e.target.value })
            }
          />
          <input
            placeholder={t("Message", "Message")}
            value={notificationTestForm.message}
            onChange={(e) =>
              setNotificationTestForm({ ...notificationTestForm, message: e.target.value })
            }
          />
          <button type="submit" disabled={!selectedIspId}>
            {t("Envoyer le test", "Send test")}
          </button>
        </form>
      </section>
      </DashboardScreenGate>

        </>
      )}

      {isFieldAgent ? (
        <DashboardScreenGate mobile={gateMobile} active={mobileScreen} id="dashboard">
          <section className="panel dashboard-field-agent-dash">
            <h2>{t("Synthèse terrain", "Field snapshot")}</h2>
            <p className="app-meta">
              {t(
                "Les graphiques multi‑sources et la vue réseau détaillée sont réservés aux rôles d’administration ; vos filtres de période alignent toutefois la caisse sur vos clients attribués.",
                "Multi-source charts and the detailed network view are for administrator roles; your period filters still align cashbox totals to your assigned customers."
              )}
            </p>
          </section>
          <section className="grid analytic-metric-grid">
            <AnalyticMetricCard
              t={t}
              title={t("Clients (attribués)", "Customers (assigned)")}
              value={formatCount(dashboard?.totalCustomers ?? 0, dashLocale)}
              timeframe={t("Instantané", "Snapshot")}
              definitionTitle={glossaryTooltip(isEn, "stock_snapshot_count")}
            />
            <AnalyticMetricCard
              t={t}
              title={t("Abonnements actifs", "Active subscriptions")}
              value={formatCount(dashboard?.activeSubscriptions ?? 0, dashLocale)}
              timeframe={t("Instantané", "Snapshot")}
              definitionTitle={glossaryTooltip(isEn, "stock_snapshot_count")}
            />
            <AnalyticMetricCard
              t={t}
              title={t("Factures ouvertes", "Open invoices")}
              value={formatCount(dashboard?.unpaidInvoices ?? 0, dashLocale)}
              timeframe={t("Instantané", "Snapshot")}
              definitionTitle={glossaryTooltip(isEn, "open_unpaid_invoice_count")}
            />
            <AnalyticMetricCard
              t={t}
              title={t("CA factures payées (cumul)", "Paid invoice revenue (cumulative)")}
              value={formatUsd(dashboard?.revenueUsd ?? 0, dashLocale)}
              timeframe={t("Cumul tout temps", "All-time cumulative")}
              definitionTitle={glossaryTooltip(isEn, "cumulative_paid_invoice_amount_all_time")}
            />
          </section>
          <section className="grid analytic-metric-grid">
            <AnalyticMetricCard
              t={t}
              title={t("Cash (période)", "Cash (period)")}
              value={formatUsd(dashboard?.cashbox?.cashUsd ?? 0, dashLocale)}
              timeframe={formatIsoRange(statsPeriod.from, statsPeriod.to)}
              comparison={dashboard?.meta?.comparison?.cashUsd}
              deltaHint="up_good"
              definitionTitle={glossaryTooltip(isEn, "cashbox_by_method_period")}
              locale={dashLocale}
            />
            <AnalyticMetricCard
              t={t}
              title={t("TID (période)", "TID (period)")}
              value={formatUsd(dashboard?.cashbox?.tidUsd ?? 0, dashLocale)}
              timeframe={formatIsoRange(statsPeriod.from, statsPeriod.to)}
              comparison={dashboard?.meta?.comparison?.tidUsd}
              deltaHint="up_good"
              definitionTitle={glossaryTooltip(isEn, "cashbox_by_method_period")}
              locale={dashLocale}
            />
            <AnalyticMetricCard
              t={t}
              title={t("Mobile Money (période)", "Mobile Money (period)")}
              value={formatUsd(dashboard?.cashbox?.mobileMoneyUsd ?? 0, dashLocale)}
              timeframe={formatIsoRange(statsPeriod.from, statsPeriod.to)}
              comparison={dashboard?.meta?.comparison?.mobileMoneyUsd}
              deltaHint="up_good"
              definitionTitle={glossaryTooltip(isEn, "cashbox_by_method_period")}
              locale={dashLocale}
            />
            <AnalyticMetricCard
              t={t}
              title={t("Retirable MM", "Withdrawable MM")}
              value={formatUsd(dashboard?.cashbox?.withdrawableMobileMoneyUsd ?? 0, dashLocale)}
              timeframe={formatIsoRange(statsPeriod.from, statsPeriod.to)}
              comparison={dashboard?.meta?.comparison?.withdrawableMobileMoneyUsd}
              deltaHint="up_good"
              definitionTitle={glossaryTooltip(isEn, "cashbox_by_method_period")}
              locale={dashLocale}
            />
          </section>
        </DashboardScreenGate>
      ) : null}

      {isFieldAgent ? (
        <DashboardScreenGate mobile={gateMobile} active={mobileScreen} id="network">
          <section className="panel">
            <h2>{t("Réseau", "Network")}</h2>
            <p className="app-meta">
              {t(
                "La configuration réseau (routeurs, RADIUS, télémétrie) est réservée aux administrateurs. En cas de panne d’accès abonné, contactez votre NOC ou votre responsable FAI.",
                "Network configuration (routers, RADIUS, telemetry) is managed by administrators. If a subscriber cannot connect, contact your NOC or ISP manager."
              )}
            </p>
          </section>
        </DashboardScreenGate>
      ) : null}

      {isFieldAgent ? (
        <DashboardScreenGate mobile={gateMobile} active={mobileScreen} id="settings">
          <section className="grid" id="workspace-settings">
            <section className="panel">
              <h2>{t("Réglages", "Settings")}</h2>
              <p className="app-meta">
                {t(
                  "L’image de marque, les intégrations et la sécurité des retraits sont gérées par les administrateurs. Les contacts d’aide figurent en bas de l’application.",
                  "Branding, integrations, and withdrawal security are managed by administrators. Support contacts are listed at the bottom of the app."
                )}
              </p>
            </section>
            <section className="panel" aria-label={t("Compte", "Account")}>
              <h2>{t("Compte", "Account")}</h2>
              <p className="app-meta">
                {t(
                  "Déconnexion de cet appareil et fermeture de l’espace opérateur.",
                  "Sign out from this device and close the operator workspace."
                )}
              </p>
              <button type="button" className="btn-expense-delete" onClick={onLogout}>
                {t("Déconnexion", "Logout")}
              </button>
            </section>
          </section>
        </DashboardScreenGate>
      ) : null}

      <DashboardScreenGate mobile={gateMobile} active={mobileScreen} id="settings">
      {(isPlatformSuperRole(user.role) || user.role === "company_manager" || user.role === "isp_admin") && (
        <section className="panel" id="security-settings">
          <h2>{t("Retrait Mobile Money sécurisé", "Secure Mobile Money withdrawal")}</h2>
          <p>
            {t(
              "Les retraits sont limités aux paiements Mobile Money confirmés via Pawapay. Les encaissements cash et TID manuel restent visibles dans les statistiques, mais ne sont pas retirables depuis le compte Pawapay.",
              "Withdrawals are limited to Mobile Money payments confirmed via Pawapay. Cash and manual TID collections still appear in statistics but cannot be withdrawn from the Pawapay account."
            )}
          </p>
          <section className="panel dashboard-totp-setup-card">
            <h3>{t("Google Authenticator", "Google Authenticator")}</h3>
            <p>
              {t("Statut :", "Status:")}{" "}
              {user.mfaTotpEnabled
                ? t("configuré", "enabled")
                : t("non configuré", "not configured")}
              .{" "}
              {t(
                "Scannez l'URL otpauth avec Google Authenticator/Authy, puis validez avec le code à 6 chiffres.",
                "Scan the otpauth URL with Google Authenticator or Authy, then confirm with the 6-digit code."
              )}
            </p>
            <button type="button" onClick={onStartTotpSetup} disabled={totpSetupLoading}>
              {user.mfaTotpEnabled
                ? t("Regénérer le secret MFA", "Regenerate MFA secret")
                : t("Configurer Google Authenticator", "Set up Google Authenticator")}
            </button>
            {totpSetup ? (
              <form onSubmit={onEnableTotp}>
                <input readOnly value={totpSetup.secret || ""} />
                <input readOnly value={totpSetup.otpauthUrl || ""} />
                <input
                  placeholder={t("Code Google Authenticator", "Google Authenticator code")}
                  value={totpSetupCode}
                  onChange={(e) => setTotpSetupCode(e.target.value)}
                />
                <button type="submit">{t("Activer MFA", "Enable MFA")}</button>
              </form>
            ) : null}
          </section>
          <form onSubmit={onCreateWithdrawal}>
            <input
              type="number"
              min={withdrawalForm.currency === "CDF" ? "1000" : "0.5"}
              step="0.01"
              placeholder={
                withdrawalForm.currency === "CDF"
                  ? t("Montant à retirer (CDF)", "Amount to withdraw (CDF)")
                  : t("Montant à retirer (USD)", "Amount to withdraw (USD)")
              }
              value={withdrawalForm.amountUsd}
              onChange={(e) => setWithdrawalForm({ ...withdrawalForm, amountUsd: e.target.value })}
            />
            <select
              value={withdrawalForm.currency}
              onChange={(e) => setWithdrawalForm({ ...withdrawalForm, currency: e.target.value })}
            >
              <option value="USD">USD</option>
              <option value="CDF">CDF</option>
            </select>
            <p style={{ fontSize: "0.85rem", color: "var(--mb-muted)" }}>
              {t(
                "Le solde retirable est suivi en USD. Si vous choisissez CDF, le montant est converti au taux plateforme avant comparaison, puis envoyé à Pawapay en CDF.",
                "Withdrawable balance is tracked in USD. If you choose CDF, the amount is converted at the platform rate before validation, then sent to Pawapay in CDF."
              )}
            </p>
            <input
              placeholder={t("Téléphone bénéficiaire", "Beneficiary phone")}
              value={withdrawalForm.phoneNumber}
              onChange={(e) => setWithdrawalForm({ ...withdrawalForm, phoneNumber: e.target.value })}
            />
            <select
              value={withdrawalForm.networkKey}
              onChange={(e) => setWithdrawalForm({ ...withdrawalForm, networkKey: e.target.value })}
            >
              {availablePawapayNetworks.map((n) => (
                <option key={n.key} value={n.key}>
                  {n.label}
                </option>
              ))}
            </select>
            <input
              placeholder={t("Code Google Authenticator", "Google Authenticator code")}
              value={withdrawalForm.mfaCode}
              onChange={(e) => setWithdrawalForm({ ...withdrawalForm, mfaCode: e.target.value })}
            />
            <button type="submit" disabled={!selectedIspId || !user.mfaTotpEnabled}>
              {t("Valider le retrait", "Submit withdrawal")}
            </button>
          </form>
          <DataTable
            t={t}
            title={t("Historique des retraits", "Withdrawal history")}
            rows={withdrawalTableView.pageRows}
            columns={[
              {
                key: "createdAt",
                header: t("Date", "Date"),
                sortKey: "createdAt",
                cell: (w) => (w.createdAt ? new Date(w.createdAt).toLocaleString(isEn ? "en-GB" : "fr-FR") : "—")
              },
              {
                key: "amount",
                header: t("Montant", "Amount"),
                sortKey: "amountUsd",
                cell: (w) => `${w.amountUsd ?? "—"} ${w.currency || ""}`.trim()
              },
              { key: "phoneNumber", header: t("Destination", "Destination"), sortKey: "phoneNumber", cell: (w) => w.phoneNumber || "—" },
              { key: "provider", header: t("Réseau", "Network"), sortKey: "provider", cell: (w) => w.provider || "—" },
              {
                key: "status",
                header: t("Statut", "Status"),
                sortKey: "status",
                cell: (w) => `${withdrawalStatusLabel(w.status, isEn)}${w.failureMessage ? ` — ${w.failureMessage}` : ""}`
              }
            ]}
            searchValue={withdrawalTable.q}
            onSearchValueChange={(q) => setWithdrawalTable((s) => ({ ...s, q, page: 1 }))}
            page={withdrawalTable.page}
            pageSize={withdrawalTable.pageSize}
            totalRows={withdrawalTableView.total}
            onPageChange={(page) => setWithdrawalTable((s) => ({ ...s, page }))}
            onPageSizeChange={(pageSize) => setWithdrawalTable((s) => ({ ...s, pageSize, page: 1 }))}
            sort={withdrawalTable.sort}
            onSortChange={(sort) => setWithdrawalTable((s) => ({ ...s, sort }))}
          />
        </section>
      )}
      </DashboardScreenGate>

      <DashboardScreenGate mobile={gateMobile} active={mobileScreen} id="billing">
      {!isFieldAgent &&
        (isPlatformSuperRole(user.role) ||
        user.role === "company_manager" ||
        user.role === "isp_admin" ||
        user.role === "billing_agent" ||
        user.role === "noc_operator") && (
        <section className="expenses-section">
          <h2>{t("Dépenses & suivi des fonds", "Expenses & fund reporting")}</h2>
          <p className="expenses-lead">
            {t(
              "Dépenses types d'un FAI : liaisons et transit (fibre, radio, location de tours), énergie sur sites, équipement (CPE, baies, onduleurs), salaires NOC et terrain, véhicule et carburant, licences et outils, marketing, impôts et cotisations, cloud et prestataires. Chaque catégorie sert à documenter les sorties de caisse pour les agents et la direction.",
              "Typical ISP costs: backhaul and transit (fiber, radio, tower rent), on-site power, equipment (CPE, racks, UPS), NOC and field payroll, vehicle and fuel, licenses and tools, marketing, taxes and social contributions, cloud and vendors. Each category documents cash outflows for staff and management."
            )}
          </p>
          <p className="expenses-lead app-meta">
            <strong>{t("Validation en deux étapes :", "Two-step validation:")}</strong>{" "}
            {t(
              "une fois la saisie enregistrée, la ligne est « En attente ». Un autre super administrateur, gestionnaire ou administrateur FAI doit l'approuver pour qu'elle entre dans les totaux « dépenses validées » utilisés pour le net (encaissements − dépenses). Si au moins deux validateurs sont inscrits sur l'espace, le demandeur ne peut pas approuver ni rejeter sa propre demande. Avec un seul validateur, l'auto-approbation reste possible (voir journal d'audit). Rejet : motif optionnel ; ligne retirée des totaux jusqu'à nouvelle soumission. Les rôles facturation et NOC consultent ; ils ne valident pas. Création, approbation, rejet et suppression tracent une opération d'audit. Les clôtures de période (bloc ci-dessous) figent les dépenses après inventaire ou révision.",
              "once recorded, the line stays pending. Another super admin, company manager or ISP admin must approve it before it counts toward validated expenses used for net cash (collections − validated expenses). If at least two approvers are registered on the workspace, the requester cannot approve or reject their own request. With a single approver, self-approval may still apply (see audit log). Rejection: optional reason; the line is excluded from totals until resubmitted. Billing and NOC roles can view but cannot approve. Create, approve, reject and delete actions are audit-logged. Period closures (below) lock expenses after inventory or review."
            )}
            {user.role === "system_owner" ? (
              <>
                {" "}
                {t("Détail :", "Detail:")}{" "}
                <a href="#audit">{t("Journal d'audit récent", "Recent audit log")}</a>.
              </>
            ) : null}
          </p>
          <div className="panel accounting-closures-panel">
            <h3>
              {t("Clôtures comptables (révision / inventaire)", "Accounting closures (review / inventory)")}
            </h3>
            <p className="app-meta" style={{ maxWidth: "52rem" }}>
              {t(
                "Après inventaire ou contrôle, enregistrez une clôture sur une plage de dates. Toute dépense dont la période chevauche une clôture est figée : pas de nouvelle saisie, approbation, rejet ni suppression tant que la clôture existe. Aucune dépense « en attente » ne doit rester sur la plage au moment de la clôture. La levée d'une clôture est possible pour correction exceptionnelle et est inscrite au journal d'audit.",
                "After inventory or controls, record a closure on a date range. Any expense whose period overlaps a closure is frozen: no new entry, approval, rejection or deletion while the closure exists. No pending expenses should remain on the range when you close. Reopening a closure is allowed for exceptional corrections and is audit-logged."
              )}
            </p>
            {(isPlatformSuperRole(user.role) ||
              user.role === "company_manager" ||
              user.role === "isp_admin") && (
              <form className="accounting-close-form" onSubmit={onCloseAccountingPeriod}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
                  <label style={{ fontSize: "0.85rem", color: "var(--mb-muted)" }}>
                    {t("Début (clôture)", "Start date")}
                    <input
                      type="date"
                      style={{ display: "block", marginTop: 4 }}
                      value={periodCloseForm.periodStart}
                      onChange={(e) => setPeriodCloseForm({ ...periodCloseForm, periodStart: e.target.value })}
                    />
                  </label>
                  <label style={{ fontSize: "0.85rem", color: "var(--mb-muted)" }}>
                    {t("Fin (inclus)", "End date (inclusive)")}
                    <input
                      type="date"
                      style={{ display: "block", marginTop: 4 }}
                      value={periodCloseForm.periodEnd}
                      onChange={(e) => setPeriodCloseForm({ ...periodCloseForm, periodEnd: e.target.value })}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn-secondary-outline"
                    onClick={() =>
                      setPeriodCloseForm({
                        ...periodCloseForm,
                        periodStart: expenseFilter.from,
                        periodEnd: expenseFilter.to
                      })
                    }
                  >
                    {t("Aligner sur le filtre du rapport", "Match report filter dates")}
                  </button>
                </div>
                <input
                  placeholder={t(
                    "Référence inventaire ou commentaire (facultatif)",
                    "Inventory reference or note (optional)"
                  )}
                  value={periodCloseForm.note}
                  onChange={(e) => setPeriodCloseForm({ ...periodCloseForm, note: e.target.value })}
                  style={{ marginTop: 10, width: "100%", maxWidth: "36rem" }}
                />
                <button type="submit" disabled={!selectedIspId} style={{ marginTop: 12 }}>
                  {t("Clôturer cette période", "Close this period")}
                </button>
              </form>
            )}
            <h4 style={{ marginTop: 18, marginBottom: 8, fontSize: "0.95rem" }}>
              {t("Clôtures enregistrées", "Recorded closures")}
            </h4>
            {accountingPeriodClosures.length === 0 ? (
              <p className="app-meta">
                {t(
                  "Aucune clôture pour cet espace — toutes les périodes sont ouvertes à la saisie.",
                  "No closures for this workspace — all periods are open for entry."
                )}
              </p>
            ) : (
              <ul className="accounting-closures-list">
                {accountingPeriodClosures.map((c) => (
                  <li key={c.id}>
                    <strong>
                      {c.periodStart} → {c.periodEnd}
                    </strong>
                    {c.note ? ` — ${c.note}` : ""}
                    <span className="app-meta">
                      {" "}
                      (
                      {t("clôturée le", "closed on")}{" "}
                      {c.closedAt ? new Date(c.closedAt).toLocaleString(isEn ? "en-GB" : "fr-FR") : "—"}
                      {c.closedByName ? ` ${t("· par", "· by")} ${c.closedByName}` : ""})
                    </span>
                    {(isPlatformSuperRole(user.role) ||
                      user.role === "company_manager" ||
                      user.role === "isp_admin") && (
                      <button
                        type="button"
                        className="btn-secondary-outline accounting-closure-reopen"
                        onClick={() => onReopenAccountingPeriod(c.id)}
                      >
                        {t("Lever la clôture", "Reopen closure")}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="expenses-filter">
            <label>
              {t("Du", "From")}
              <input
                type="date"
                value={expenseFilter.from}
                onChange={(e) => setExpenseFilter({ ...expenseFilter, from: e.target.value })}
              />
            </label>
            <label>
              {t("Au", "To")}
              <input
                type="date"
                value={expenseFilter.to}
                onChange={(e) => setExpenseFilter({ ...expenseFilter, to: e.target.value })}
              />
            </label>
            <button type="button" disabled={!selectedIspId} onClick={() => refresh()}>
              {t("Appliquer la période", "Apply range")}
            </button>
          </div>
          {expenseSummary ? (
            <div className="expenses-summary">
              <div className="expenses-summary-card expenses-summary-card--green">
                <span>{t("Encaissé (paiements confirmés)", "Collected (confirmed payments)")}</span>
                <strong>
                  {(expenseSummary.collectionsInPeriodUsd ?? 0).toLocaleString(undefined, {
                    style: "currency",
                    currency: "USD"
                  })}
                </strong>
              </div>
              <div className="expenses-summary-card">
                <span>{t("Dépenses validées (approuvées)", "Validated expenses (approved)")}</span>
                <strong>
                  {(expenseSummary.totalExpensesUsd ?? 0).toLocaleString(undefined, {
                    style: "currency",
                    currency: "USD"
                  })}
                </strong>
              </div>
              <div className="expenses-summary-card">
                <span>{t("En attente de validation", "Pending approval")}</span>
                <strong>
                  {(expenseSummary.pendingExpensesUsd ?? 0).toLocaleString(undefined, {
                    style: "currency",
                    currency: "USD"
                  })}
                </strong>
              </div>
              <div className="expenses-summary-card">
                <span>
                  {t("Net (encaissements − dépenses validées)", "Net (collections − validated expenses)")}
                </span>
                <strong>
                  {(
                    (expenseSummary.collectionsInPeriodUsd ?? 0) - (expenseSummary.totalExpensesUsd ?? 0)
                  ).toLocaleString(undefined, {
                    style: "currency",
                    currency: "USD"
                  })}
                </strong>
              </div>
              <div className="expenses-summary-card">
                <span>{t("Grand livre - Débit", "Ledger - Debit")}</span>
                <strong>
                  {(accountingLedgerTotals.totalDebitUsd ?? 0).toLocaleString(undefined, {
                    style: "currency",
                    currency: "USD"
                  })}
                </strong>
              </div>
              <div className="expenses-summary-card">
                <span>{t("Grand livre - Crédit", "Ledger - Credit")}</span>
                <strong>
                  {(accountingLedgerTotals.totalCreditUsd ?? 0).toLocaleString(undefined, {
                    style: "currency",
                    currency: "USD"
                  })}
                </strong>
              </div>
            </div>
          ) : null}
          <div className="panel" style={{ marginBottom: 12 }}>
            <DataTable
              t={t}
              title={t("Grand livre comptable", "Accounting ledger")}
              description={t(
                "Écritures automatiques des encaissements (caisse/banque) et compte client.",
                "Automatic receipt entries (cash/bank) and customer account balancing."
              )}
              rows={ledgerTableView.pageRows}
              actions={
                <button type="button" className="btn-secondary-outline" onClick={onDownloadLedgerCsv} disabled={!selectedIspId}>
                  {t("Exporter CSV", "Export CSV")}
                </button>
              }
              columns={[
                { key: "entryDate", header: t("Date", "Date"), sortKey: "entryDate", cell: (r) => r.entryDate || "—" },
                { key: "journalType", header: t("Journal", "Journal"), sortKey: "journalType", cell: (r) => r.journalType || "—" },
                { key: "accountCode", header: t("Compte", "Account"), sortKey: "accountCode", cell: (r) => `${r.accountCode || "—"} ${r.accountLabel || ""}`.trim() },
                { key: "debitUsd", header: t("Débit USD", "Debit USD"), sortKey: "debitUsd", cell: (r) => Number(r.debitUsd || 0).toFixed(2) },
                { key: "creditUsd", header: t("Crédit USD", "Credit USD"), sortKey: "creditUsd", cell: (r) => Number(r.creditUsd || 0).toFixed(2) },
                { key: "memo", header: t("Mémo", "Memo"), sortKey: "memo", cell: (r) => r.memo || "—" }
              ]}
              searchValue={ledgerTable.q}
              onSearchValueChange={(q) => setLedgerTable((s) => ({ ...s, q, page: 1 }))}
              page={ledgerTable.page}
              pageSize={ledgerTable.pageSize}
              totalRows={ledgerTableView.total}
              onPageChange={(page) => setLedgerTable((s) => ({ ...s, page }))}
              onPageSizeChange={(pageSize) => setLedgerTable((s) => ({ ...s, pageSize, page: 1 }))}
              sort={ledgerTable.sort}
              onSortChange={(sort) => setLedgerTable((s) => ({ ...s, sort }))}
            />
          </div>
          <div className="expenses-layout">
            {(isPlatformSuperRole(user.role) ||
              user.role === "company_manager" ||
              user.role === "isp_admin") && (
              <form className="panel expenses-form" onSubmit={onCreateExpense}>
                <h3>{t("Nouvelle dépense", "New expense")}</h3>
                <label style={{ display: "block", marginBottom: 8, fontSize: "0.85rem", color: "var(--mb-muted)" }}>
                  {t("Catégorie", "Category")}
                  <select
                    style={{ display: "block", width: "100%", marginTop: 4 }}
                    value={expenseForm.category}
                    onChange={(e) =>
                      setExpenseForm({
                        ...expenseForm,
                        category: e.target.value,
                        fieldAgentId:
                          e.target.value === "field_agent_fixed" || e.target.value === "field_agent_percentage"
                            ? expenseForm.fieldAgentId
                            : ""
                      })
                    }
                  >
                    {EXPENSE_CATEGORY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {isEn ? o.labelEn : o.labelFr}
                      </option>
                    ))}
                  </select>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={t("Montant (USD)", "Amount (USD)")}
                  value={expenseForm.amountUsd}
                  onChange={(e) => setExpenseForm({ ...expenseForm, amountUsd: e.target.value })}
                />
                <input
                  placeholder={t("Description (facultatif)", "Description (optional)")}
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
                  <label style={{ flex: "1 1 140px", fontSize: "0.85rem", color: "var(--mb-muted)" }}>
                    {t("Début de période", "Period start")}
                    <input
                      type="date"
                      style={{ display: "block", width: "100%", marginTop: 4 }}
                      value={expenseForm.periodStart}
                      onChange={(e) => setExpenseForm({ ...expenseForm, periodStart: e.target.value })}
                    />
                  </label>
                  <label style={{ flex: "1 1 140px", fontSize: "0.85rem", color: "var(--mb-muted)" }}>
                    {t("Fin de période", "Period end")}
                    <input
                      type="date"
                      style={{ display: "block", width: "100%", marginTop: 4 }}
                      value={expenseForm.periodEnd}
                      onChange={(e) => setExpenseForm({ ...expenseForm, periodEnd: e.target.value })}
                    />
                  </label>
                  <button
                    type="button"
                    style={{ margin: 0, width: "auto" }}
                    onClick={() =>
                      setExpenseForm({
                        ...expenseForm,
                        periodStart: expenseFilter.from,
                        periodEnd: expenseFilter.to
                      })
                    }
                  >
                    {t("Aligner sur le rapport", "Match report")}
                  </button>
                </div>
                {(expenseForm.category === "field_agent_fixed" ||
                  expenseForm.category === "field_agent_percentage") && (
                  <>
                    <label style={{ display: "block", marginTop: 10, fontSize: "0.85rem", color: "var(--mb-muted)" }}>
                      {t("Agent terrain", "Field agent")}
                      <select
                        style={{ display: "block", width: "100%", marginTop: 4 }}
                        value={expenseForm.fieldAgentId}
                        onChange={(e) => setExpenseForm({ ...expenseForm, fieldAgentId: e.target.value })}
                      >
                        <option value="">{t("Choisir un agent", "Choose an agent")}</option>
                        {users
                          .filter((u) => u.role === "field_agent")
                          .map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.fullName || u.email || u.id}
                            </option>
                          ))}
                      </select>
                    </label>
                    {expenseForm.category === "field_agent_percentage" ? (
                      <input
                        type="number"
                        min="0.01"
                        max="100"
                        step="0.01"
                        placeholder={t(
                          "Commission % (base CA ou encaissements)",
                          "Commission % (revenue or collections basis)"
                        )}
                        value={expenseForm.agentPayoutPercent}
                        onChange={(e) => setExpenseForm({ ...expenseForm, agentPayoutPercent: e.target.value })}
                      />
                    ) : null}
                  </>
                )}
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={t(
                    "Base CA USD (facultatif, traçabilité)",
                    "Revenue basis USD (optional, for audit trail)"
                  )}
                  value={expenseForm.revenueBasisUsd}
                  onChange={(e) => setExpenseForm({ ...expenseForm, revenueBasisUsd: e.target.value })}
                />
                <button type="submit" disabled={!selectedIspId}>
                  {t("Enregistrer la dépense", "Save expense")}
                </button>
              </form>
            )}
            <div className="panel expenses-list">
              <h3>{t("Lignes sur la période", "Lines in this period")}</h3>
              {expenses.length === 0 ? (
                <p style={{ color: "var(--mb-muted)", fontSize: "0.9rem" }}>
                  {t(
                    "Aucune dépense ne chevauche ces dates, ou les données se chargent encore.",
                    "No expenses overlap these dates, or data is still loading."
                  )}
                </p>
              ) : (
                <DataTable
                  t={t}
                  title={null}
                  rows={expenseTableView.pageRows}
                  columns={[
                    {
                      key: "amountUsd",
                      header: t("Montant", "Amount"),
                      sortKey: "amountUsd",
                      cell: (ex) =>
                        (ex.amountUsd ?? 0).toLocaleString(undefined, { style: "currency", currency: "USD" })
                    },
                    {
                      key: "status",
                      header: t("Statut", "Status"),
                      sortKey: "status",
                      cell: (ex) => {
                        const st = ex.status || "pending";
                        return (
                          <span className={`expense-status-badge expense-status-badge--${st}`}>
                            {expenseApprovalStatusLabel(st, isEn)}
                          </span>
                        );
                      }
                    },
                    {
                      key: "category",
                      header: t("Catégorie", "Category"),
                      sortKey: "category",
                      cell: (ex) => expenseCategoryLabel(ex.category, isEn)
                    },
                    {
                      key: "period",
                      header: t("Période", "Period"),
                      cell: (ex) => `${ex.periodStart || "—"} → ${ex.periodEnd || "—"}`
                    },
                    {
                      key: "meta",
                      header: t("Traçabilité", "Trace"),
                      cell: (ex) => {
                        const st = ex.status || "pending";
                        return (
                          <div style={{ display: "grid", gap: 4, minWidth: 220 }}>
                            {ex.description ? <div>{ex.description}</div> : <div className="app-meta">—</div>}
                            <div className="app-meta" style={{ margin: 0 }}>
                              {ex.createdByName ? `${t("Saisi par", "Entered by")} ${ex.createdByName}` : "—"}
                              {ex.fieldAgentName ? ` · ${t("Agent", "Agent")}: ${ex.fieldAgentName}` : ""}
                            </div>
                            {st === "approved" && (ex.approvedByName || ex.approvedAt) ? (
                              <div className="app-meta" style={{ margin: 0 }}>
                                {t("Approuvé", "Approved")}
                                {ex.approvedByName ? ` ${t("par", "by")} ${ex.approvedByName}` : ""}
                                {ex.approvedAt
                                  ? ` — ${new Date(ex.approvedAt).toLocaleString(isEn ? "en-GB" : "fr-FR")}`
                                  : ""}
                              </div>
                            ) : null}
                            {st === "rejected" ? (
                              <div className="app-meta expenses-row-meta--warn" style={{ margin: 0 }}>
                                {t("Rejet", "Rejected")}
                                {ex.rejectedByName ? ` ${t("par", "by")} ${ex.rejectedByName}` : ""}
                                {ex.rejectionNote ? ` · ${ex.rejectionNote}` : ""}
                              </div>
                            ) : null}
                            {ex.periodClosed ? (
                              <div className="app-meta" style={{ margin: 0 }}>
                                {t("Période clôturée", "Period closed")}
                              </div>
                            ) : null}
                          </div>
                        );
                      }
                    },
                    {
                      key: "actions",
                      header: t("Actions", "Actions"),
                      cell: (ex) => {
                        const st = ex.status || "pending";
                        return (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, minWidth: 220 }}>
                            {ex.canApprove ? (
                              <button
                                type="button"
                                className="btn-expense-approve"
                                disabled={!selectedIspId}
                                onClick={() => onApproveExpense(ex.id)}
                              >
                                {t("Approuver", "Approve")}
                              </button>
                            ) : null}
                            {ex.canReject ? (
                              <button
                                type="button"
                                className="btn-expense-reject"
                                disabled={!selectedIspId}
                                onClick={() => onRejectExpense(ex.id)}
                              >
                                {t("Rejeter", "Reject")}
                              </button>
                            ) : null}
                            {(isPlatformSuperRole(user.role) ||
                              user.role === "company_manager" ||
                              user.role === "isp_admin") &&
                            (st === "pending" || st === "rejected") &&
                            !ex.periodClosed ? (
                              <button
                                type="button"
                                className="btn-expense-delete"
                                disabled={!selectedIspId}
                                onClick={() => onDeleteExpense(ex.id)}
                              >
                                {t("Supprimer", "Delete")}
                              </button>
                            ) : null}
                          </div>
                        );
                      }
                    }
                  ]}
                  searchValue={expenseTable.q}
                  onSearchValueChange={(q) => setExpenseTable((s) => ({ ...s, q, page: 1 }))}
                  filters={
                    <label className="app-meta" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                      <span>{t("Statut", "Status")}</span>
                      <select
                        value={expenseTable.status}
                        onChange={(e) => setExpenseTable((s) => ({ ...s, status: e.target.value, page: 1 }))}
                      >
                        <option value="all">{t("Tous", "All")}</option>
                        <option value="pending">{t("En attente", "Pending")}</option>
                        <option value="approved">{t("Approuvé", "Approved")}</option>
                        <option value="rejected">{t("Rejeté", "Rejected")}</option>
                      </select>
                    </label>
                  }
                  page={expenseTable.page}
                  pageSize={expenseTable.pageSize}
                  totalRows={expenseTableView.total}
                  onPageChange={(page) => setExpenseTable((s) => ({ ...s, page }))}
                  onPageSizeChange={(pageSize) => setExpenseTable((s) => ({ ...s, pageSize, page: 1 }))}
                  sort={expenseTable.sort}
                  onSortChange={(sort) => setExpenseTable((s) => ({ ...s, sort }))}
                />
              )}
            </div>
          </div>
        </section>
      )}
      </DashboardScreenGate>

      <section className="grid" id="field-clients">
      <DashboardScreenGate mobile={gateMobile} active={mobileScreen} id="users">
        {!isFieldAgent ? (
          <>
        <form className="panel" onSubmit={onCreateCustomer}>
          <h2>{t("Créer un client", "Create customer")}</h2>
          <input
            placeholder={t("Nom complet", "Full name")}
            value={customerForm.fullName}
            onChange={(e) => setCustomerForm({ ...customerForm, fullName: e.target.value })}
          />
          <input
            placeholder={t("Téléphone (+243…)", "Phone (+243…)")}
            value={customerForm.phone}
            onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
          />
          <input
            placeholder={t("E-mail pour les renouvellements (facultatif)", "Email for renewals (optional)")}
            value={customerForm.email}
            onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
          />
          <input
            type="password"
            placeholder={t(
              "Mot de passe portail initial (facultatif, min. 6 car.)",
              "Initial portal password (optional, min. 6 chars)"
            )}
            value={customerForm.initialPassword}
            onChange={(e) => setCustomerForm({ ...customerForm, initialPassword: e.target.value })}
          />
          <label className="app-meta" style={{ display: "block", marginBottom: 8 }}>
            {t("Agent terrain (facultatif)", "Field agent (optional)")}
            <select
              value={customerForm.fieldAgentId}
              onChange={(e) => setCustomerForm({ ...customerForm, fieldAgentId: e.target.value })}
              style={{ display: "block", width: "100%", marginTop: 4 }}
            >
              <option value="">{t("— Aucun —", "— None —")}</option>
              {fieldTeamUsers.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.fullName}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={!selectedIspId}>
            {t("Enregistrer le client", "Save customer")}
          </button>
        </form>

        <div className="panel">
          <h2>{t("Import / export clients (CSV)", "Import / export customers (CSV)")}</h2>
          <p>
            {t(
              "Téléchargez votre liste d'abonnés ou importez depuis un autre outil ou un export MikroTik (colonnes du type nom, secret → nom abonné et mot de passe portail facultatif). Les doublons de téléphone pour ce FAI sont ignorés.",
              "Download your subscriber list or import from another tool or a MikroTik export (e.g. name, secret → subscriber name and optional portal password). Duplicate phone numbers for this ISP are skipped."
            )}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <button type="button" onClick={onDownloadCustomersCsv} disabled={!selectedIspId}>
              {t("Télécharger le CSV clients", "Download customers CSV")}
            </button>
            <button type="button" onClick={() => api.downloadCustomerImportTemplate()}>
              {t("Télécharger le modèle d'import", "Download import template")}
            </button>
          </div>
          <p className="app-meta" style={{ marginTop: 8, fontSize: "0.9em" }}>
            {t("Modèle : ligne d'en-tête uniquement —", "Template: header row only —")}{" "}
            <code>fullName,phone,email,password</code>.{" "}
            {t(
              "E-mail et mot de passe facultatifs par ligne (utilisez le mot de passe par défaut ci-dessous si vide). MikroTik exporte souvent name — copiez dans fullName et phone ou renommez l'en-tête pour correspondre.",
              "Email and password are optional per row (use the default password below if empty). MikroTik often exports name — copy into fullName and phone, or rename the header to match."
            )}
          </p>
          <form onSubmit={onImportCustomersCsv} style={{ marginTop: 12 }}>
            <input ref={customerCsvInputRef} type="file" accept=".csv,text/csv" />
            <input
              type="password"
              placeholder={t(
                "Mot de passe portail par défaut pour les lignes sans (facultatif, min. 6 car.)",
                "Default portal password for rows without one (optional, min. 6 chars)"
              )}
              value={customerImportPassword}
              onChange={(e) => setCustomerImportPassword(e.target.value)}
            />
            <button type="submit" disabled={!selectedIspId}>
              {t("Importer CSV", "Import CSV")}
            </button>
          </form>
          {customerImportReport ? (
            <CsvImportResultBlock
              t={t}
              createdCount={customerImportReport.createdCount}
              skipped={customerImportReport.skipped}
              errors={customerImportReport.errors}
              onDismiss={() => setCustomerImportReport(null)}
            />
          ) : null}
        </div>

        <div className="panel">
          <h2>{t("Utilisateurs", "Users")}</h2>
          <DataTable
            t={t}
            title={t("Clients", "Clients")}
            description={t("Liste standardisée (recherche, tri, pagination).", "Standardized list (search, sort, pagination).")}
            rows={customerTableView.pageRows}
            columns={[
              { key: "fullName", header: t("Nom", "Name"), sortKey: "fullName", cell: (c) => c.fullName || "—" },
              { key: "phone", header: t("Téléphone", "Phone"), sortKey: "phone", cell: (c) => c.phone || "—" },
              { key: "email", header: "Email", sortKey: "email", cell: (c) => c.email || "—" },
              {
                key: "fieldAgentName",
                header: t("Agent", "Agent"),
                sortKey: "fieldAgentName",
                cell: (c) => c.fieldAgentName || "—"
              },
              {
                key: "actions",
                header: t("Actions", "Actions"),
                cell: (c) => (
                  <button
                    type="button"
                    className="btn-secondary-outline"
                    onClick={() =>
                      setCustomerEmailForm({
                        customerId: c.id,
                        email: c.email || "",
                        fieldAgentId: c.fieldAgentId || ""
                      })
                    }
                  >
                    {t("Modifier", "Edit")}
                  </button>
                )
              }
            ]}
            searchValue={customerTable.q}
            onSearchValueChange={(q) => setCustomerTable((s) => ({ ...s, q, page: 1 }))}
            page={customerTable.page}
            pageSize={customerTable.pageSize}
            totalRows={customerTableView.total}
            onPageChange={(page) => setCustomerTable((s) => ({ ...s, page }))}
            onPageSizeChange={(pageSize) => setCustomerTable((s) => ({ ...s, pageSize, page: 1 }))}
            sort={customerTable.sort}
            onSortChange={(sort) => setCustomerTable((s) => ({ ...s, sort }))}
          />
        </div>
          </>
        ) : null}

        <form className="panel" onSubmit={onPatchCustomerEmail}>
          <h2>
            {isFieldAgent
              ? t("E-mail client (clients assignés)", "Customer email (assigned customers)")
              : t("E-mail et agent terrain", "Email and field agent")}
          </h2>
          <p>
            {isFieldAgent
              ? t(
                  "Vous pouvez mettre à jour l’adresse e-mail des abonnés qui vous sont assignés.",
                  "You can update the email address of subscribers assigned to you."
                )
              : t(
                  "E-mail pour les renouvellements (SMTP) et attribution d’un agent terrain pour le suivi sur le terrain.",
                  "Email for renewals (SMTP) and assigning a field agent for on-site follow-up."
                )}
          </p>
          <select
            value={customerEmailForm.customerId}
            onChange={(e) => {
              const id = e.target.value;
              const cst = customers.find((c) => c.id === id);
              setCustomerEmailForm({
                customerId: id,
                email: cst?.email || "",
                fieldAgentId: cst?.fieldAgentId || ""
              });
            }}
          >
            <option value="">{t("Choisir un client", "Select a customer")}</option>
            {customers.map((cst) => (
              <option key={cst.id} value={cst.id}>
                {cst.fullName}
                {cst.email ? ` (${cst.email})` : ""}
              </option>
            ))}
          </select>
          <input
            placeholder={t("E-mail (vide = effacer)", "Email (empty = clear)")}
            value={customerEmailForm.email}
            onChange={(e) => setCustomerEmailForm({ ...customerEmailForm, email: e.target.value })}
          />
          {!isFieldAgent &&
          (isPlatformSuperRole(user.role) ||
            user.role === "company_manager" ||
            user.role === "isp_admin" ||
            user.role === "billing_agent") ? (
            <label className="app-meta" style={{ display: "block", marginBottom: 8 }}>
              {t("Agent terrain", "Field agent")}
              <select
                value={customerEmailForm.fieldAgentId || ""}
                onChange={(e) =>
                  setCustomerEmailForm({ ...customerEmailForm, fieldAgentId: e.target.value })
                }
                style={{ display: "block", width: "100%", marginTop: 4 }}
              >
                <option value="">{t("— Aucun —", "— None —")}</option>
                {fieldTeamUsers.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.fullName}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button type="submit" disabled={!selectedIspId || !customerEmailForm.customerId}>
            {isFieldAgent
              ? t("Enregistrer l'e-mail", "Save email")
              : t("Enregistrer e-mail et agent", "Save email and agent")}
          </button>
        </form>
      </DashboardScreenGate>

      <DashboardScreenGate
        mobile={gateMobile}
        active={mobileScreen}
        ids={isFieldAgent ? ["billing"] : ["users"]}
      >
        {(isPlatformSuperRole(user.role) ||
          user.role === "company_manager" ||
          user.role === "isp_admin" ||
          user.role === "billing_agent" ||
          user.role === "field_agent") && (
          <form className="panel" onSubmit={onIssuePortalToken}>
            <h2>{t("Portail libre-service client", "Customer self-service portal")}</h2>
            <p>
              {t(
                "Générez un lien limité dans le temps pour consulter les factures et envoyer une TID Mobile Money.",
                "Generate a time-limited link to view invoices and submit a Mobile Money TID."
              )}
            </p>
            <select
              value={portalTokenForm.customerId}
              onChange={(e) =>
                setPortalTokenForm({ ...portalTokenForm, customerId: e.target.value })
              }
            >
              <option value="">{t("Choisir un client", "Select a customer")}</option>
              {customers.map((cst) => (
                <option key={cst.id} value={cst.id}>
                  {cst.fullName}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              max={365}
              title={t("Validité du lien en jours", "Link validity in days")}
              value={portalTokenForm.expiresDays}
              onChange={(e) =>
                setPortalTokenForm({ ...portalTokenForm, expiresDays: e.target.value })
              }
            />
            <button type="submit" disabled={!selectedIspId}>
              {t("Générer le lien portail", "Generate portal link")}
            </button>
            {lastPortalIssue?.portalUrl && (
              <p>
                <strong>{t("Lien :", "Link:")}</strong>{" "}
                <a href={lastPortalIssue.portalUrl} target="_blank" rel="noreferrer">
                  {lastPortalIssue.portalUrl}
                </a>
              </p>
            )}
            {lastPortalIssue?.expiresAt && (
              <p>
                <small>
                  {t("Expire le", "Expires")}{" "}
                  {new Date(lastPortalIssue.expiresAt).toLocaleString(isEn ? "en-GB" : "fr-FR")}
                </small>
              </p>
            )}
          </form>
        )}
      </DashboardScreenGate>

      {!isFieldAgent ? (
        <DashboardScreenGate mobile={gateMobile} active={mobileScreen} id="users">
        <>
        <form className="panel" onSubmit={onCreatePlan}>
          <h2>{t("Créer une formule Wi‑Fi / accès", "Create Wi‑Fi / access plan")}</h2>
          <input
            placeholder={t("Nom", "Name")}
            value={planForm.name}
            onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
          />
          <input
            type="number"
            placeholder={t("Prix (USD)", "Price (USD)")}
            value={planForm.priceUsd}
            onChange={(e) => setPlanForm({ ...planForm, priceUsd: e.target.value })}
          />
          <input
            type="number"
            placeholder={t("Durée (jours)", "Duration (days)")}
            value={planForm.durationDays}
            onChange={(e) => setPlanForm({ ...planForm, durationDays: e.target.value })}
          />
          <input
            placeholder={t(
              "Libellé débit affiché aux clients (ex. 20 Mbps)",
              "Speed label shown to customers (e.g. 20 Mbps)"
            )}
            value={planForm.speedLabel}
            onChange={(e) => setPlanForm({ ...planForm, speedLabel: e.target.value })}
          />
          <input
            placeholder={t("Limite technique (ex. 10M/10M)", "Technical limit (e.g. 10M/10M)")}
            value={planForm.rateLimit}
            onChange={(e) => setPlanForm({ ...planForm, rateLimit: e.target.value })}
          />
          <select
            value={planForm.defaultAccessType}
            onChange={(e) => setPlanForm({ ...planForm, defaultAccessType: e.target.value })}
          >
            <option value="pppoe">PPPoE</option>
            <option value="hotspot">{t("Hotspot", "Hotspot")}</option>
          </select>
          <input
            type="number"
            min={1}
            placeholder={t("Nombre max d'appareils", "Max devices")}
            value={planForm.maxDevices}
            onChange={(e) => setPlanForm({ ...planForm, maxDevices: e.target.value })}
          />
          <select
            value={planForm.availabilityStatus}
            onChange={(e) => setPlanForm({ ...planForm, availabilityStatus: e.target.value })}
          >
            <option value="available">{t("Disponible (pas épuisé)", "Available (not sold out)")}</option>
            <option value="unavailable">{t("Indisponible (masqué à l'achat)", "Unavailable (hidden from buy page)")}</option>
          </select>
          <label>
            <input
              type="checkbox"
              checked={planForm.isPublished}
              onChange={(e) => setPlanForm({ ...planForm, isPublished: e.target.checked })}
            />{" "}
            {t("Afficher sur la page d'achat Wi‑Fi publique", "Show on public Wi‑Fi purchase page")}
          </label>
          <input
            placeholder={t(
              "URL après paiement (facultatif, sinon défaut FAI ou Google)",
              "After-pay redirect URL (optional, else ISP default or Google)"
            )}
            value={planForm.successRedirectUrl}
            onChange={(e) => setPlanForm({ ...planForm, successRedirectUrl: e.target.value })}
          />
          <button type="submit" disabled={!selectedIspId}>
            {t("Enregistrer la formule", "Save plan")}
          </button>
        </form>

        <form className="panel" onSubmit={onSavePlanPatch}>
          <h2>{t("Modifier une formule", "Edit plan")}</h2>
          <select
            value={planEditForm.planId}
            onChange={(e) => {
              const id = e.target.value;
              const p = plans.find((x) => x.id === id);
              if (!p) {
                setPlanEditForm((prev) => ({ ...prev, planId: "" }));
                return;
              }
              setPlanEditForm({
                planId: p.id,
                name: p.name || "",
                priceUsd: String(p.priceUsd ?? ""),
                durationDays: String(p.durationDays ?? ""),
                rateLimit: p.rateLimit || "",
                speedLabel: p.speedLabel || "",
                defaultAccessType: p.defaultAccessType || "pppoe",
                maxDevices: String(p.maxDevices ?? 1),
                isPublished: Boolean(p.isPublished),
                availabilityStatus: p.availabilityStatus || "available",
                successRedirectUrl: p.successRedirectUrl || ""
              });
            }}
          >
            <option value="">{t("Choisir une formule à modifier…", "Select a plan to edit…")}</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </select>
          <input
            placeholder={t("Nom", "Name")}
            value={planEditForm.name}
            onChange={(e) => setPlanEditForm({ ...planEditForm, name: e.target.value })}
          />
          <input
            type="number"
            placeholder={t("Prix USD", "Price USD")}
            value={planEditForm.priceUsd}
            onChange={(e) => setPlanEditForm({ ...planEditForm, priceUsd: e.target.value })}
          />
          <input
            type="number"
            placeholder={t("Durée (jours)", "Duration (days)")}
            value={planEditForm.durationDays}
            onChange={(e) => setPlanEditForm({ ...planEditForm, durationDays: e.target.value })}
          />
          <input
            placeholder={t("Libellé débit", "Speed label")}
            value={planEditForm.speedLabel}
            onChange={(e) => setPlanEditForm({ ...planEditForm, speedLabel: e.target.value })}
          />
          <input
            placeholder={t("Limite de débit", "Rate limit")}
            value={planEditForm.rateLimit}
            onChange={(e) => setPlanEditForm({ ...planEditForm, rateLimit: e.target.value })}
          />
          <select
            value={planEditForm.defaultAccessType}
            onChange={(e) => setPlanEditForm({ ...planEditForm, defaultAccessType: e.target.value })}
          >
            <option value="pppoe">PPPoE</option>
            <option value="hotspot">{t("Hotspot", "Hotspot")}</option>
          </select>
          <input
            type="number"
            min={1}
            placeholder={t("Appareils max", "Max devices")}
            value={planEditForm.maxDevices}
            onChange={(e) => setPlanEditForm({ ...planEditForm, maxDevices: e.target.value })}
          />
          <select
            value={planEditForm.availabilityStatus}
            onChange={(e) => setPlanEditForm({ ...planEditForm, availabilityStatus: e.target.value })}
          >
            <option value="available">{t("Disponible", "Available")}</option>
            <option value="unavailable">{t("Indisponible", "Unavailable")}</option>
          </select>
          <label>
            <input
              type="checkbox"
              checked={planEditForm.isPublished}
              onChange={(e) => setPlanEditForm({ ...planEditForm, isPublished: e.target.checked })}
            />{" "}
            {t("Publié sur la page Wi‑Fi", "Published on Wi‑Fi page")}
          </label>
          <input
            placeholder={t("URL après paiement", "After-pay redirect URL")}
            value={planEditForm.successRedirectUrl}
            onChange={(e) => setPlanEditForm({ ...planEditForm, successRedirectUrl: e.target.value })}
          />
          <button type="submit" disabled={!selectedIspId || !planEditForm.planId}>
            {t("Enregistrer les modifications", "Save changes")}
          </button>
        </form>

        {selectedIspId ? (
          <div className="panel">
            <h2>{t("Page d’achat Wi‑Fi invité", "Guest Wi‑Fi purchase page")}</h2>
            <p className="app-meta" style={{ marginTop: 0 }}>
              {t(
                "Même lien pour toutes les formules publiées : partagez-le ou le QR code près du point d’accès.",
                "Same link for all published plans—share it or the QR code near the access point."
              )}
            </p>
            <GuestWifiShare ispId={selectedIspId} caption={t("Lien invité Wi‑Fi", "Wi‑Fi guest link")} t={t} />
          </div>
        ) : null}

        <form className="panel" onSubmit={onCreateSubscription}>
          <h2>{t("Créer un abonnement", "Create subscription")}</h2>
          <select
            value={subForm.customerId}
            onChange={(e) => setSubForm({ ...subForm, customerId: e.target.value })}
          >
            <option value="">{t("Choisir un client", "Select a customer")}</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.fullName}
              </option>
            ))}
          </select>
          <select
            value={subForm.planId}
            onChange={(e) => setSubForm({ ...subForm, planId: e.target.value })}
          >
            <option value="">{t("Choisir une formule", "Select a plan")}</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </select>
          <select
            value={subForm.accessType}
            onChange={(e) => setSubForm({ ...subForm, accessType: e.target.value })}
          >
            <option value="pppoe">PPPoE</option>
            <option value="hotspot">{t("Hotspot", "Hotspot")}</option>
          </select>
          <button type="submit" disabled={!selectedIspId}>
            {t("Activer l'abonnement", "Activate subscription")}
          </button>
        </form>
          </>
        </DashboardScreenGate>
        ) : null}
      </section>

      <DashboardScreenGate mobile={gateMobile} active={mobileScreen} id="billing">
      <section className="panel billing-invoices-panel">
        <h2>{t("Factures", "Invoices")}</h2>
        <DataTable
          t={t}
          title={null}
          rows={invoiceTableView.pageRows}
          columns={[
            {
              key: "id",
              header: "ID",
              cell: (inv) => String(inv.id || "").slice(0, 8)
            },
            {
              key: "amountUsd",
              header: t("Montant", "Amount"),
              sortKey: "amountUsd",
              cell: (inv) => `$${inv.amountUsd ?? "—"}`
            },
            {
              key: "status",
              header: t("Statut", "Status"),
              sortKey: "status",
              cell: (inv) => invoiceStatusShort(inv.status, isEn)
            },
            {
              key: "payment",
              header: t("Paiement", "Payment"),
              cell: (inv) =>
                inv.status === "unpaid" || inv.status === "overdue" ? (
                  !isFieldAgent ? (
                    <button type="button" onClick={() => onMarkPaid(inv.id, inv.amountUsd)}>
                      {t("Marquer payée", "Mark paid")}
                    </button>
                  ) : (
                    "—"
                  )
                ) : (
                  t("Payée", "Paid")
                )
            },
            {
              key: "pdf",
              header: "PDF",
              cell: (inv) => (
                <button type="button" className="btn-secondary-outline" onClick={() => onDownloadInvoiceProforma(inv.id)}>
                  {t("Proforma", "Proforma")}
                </button>
              )
            }
          ]}
          searchValue={invoiceTable.q}
          onSearchValueChange={(q) => setInvoiceTable((s) => ({ ...s, q, page: 1 }))}
          filters={
            <label className="app-meta" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <span>{t("Statut", "Status")}</span>
              <select
                value={invoiceTable.status || "all"}
                onChange={(e) => setInvoiceTable((s) => ({ ...s, status: e.target.value, page: 1 }))}
              >
                <option value="all">{t("Tous", "All")}</option>
                <option value="unpaid">{t("Impayée", "Unpaid")}</option>
                <option value="overdue">{t("En retard", "Overdue")}</option>
                <option value="paid">{t("Payée", "Paid")}</option>
              </select>
            </label>
          }
          page={invoiceTable.page}
          pageSize={invoiceTable.pageSize}
          totalRows={invoiceTableView.total}
          onPageChange={(page) => setInvoiceTable((s) => ({ ...s, page }))}
          onPageSizeChange={(pageSize) => setInvoiceTable((s) => ({ ...s, pageSize, page: 1 }))}
          sort={invoiceTable.sort}
          onSortChange={(sort) => setInvoiceTable((s) => ({ ...s, sort }))}
        />
      </section>

      <section className="panel">
        <h2>{t("Abonnements", "Subscriptions")}</h2>
        {subscriptions.map((subscription) => (
          <p key={subscription.id}>
            {subscription.id.slice(0, 8)} - {subscription.status} ({subscription.accessType || "pppoe"})
            {subscription.maxSimultaneousDevices != null
              ? ` — appareils ${subscription.maxSimultaneousDevices}`
              : ""}{" "}
            {!isFieldAgent ? (
              <>
            {subscription.status !== "suspended" ? (
              <button onClick={() => onSuspendSubscription(subscription.id)}>Suspendre</button>
            ) : (
              <button onClick={() => onReactivateSubscription(subscription.id)}>Réactiver</button>
            )}{" "}
            <button onClick={() => onSyncSubscriptionNetwork(subscription.id, "activate")}>
              Sync activer
            </button>{" "}
            <button onClick={() => onSyncSubscriptionNetwork(subscription.id, "suspend")}>
              Sync suspendre
            </button>
              </>
            ) : null}
          </p>
        ))}
      </section>
      </DashboardScreenGate>

        </div>
      </div>

      <footer className="app-footer app-footer--dashboard" id="dashboard-support-hub">
        <div className="app-footer-inner">
          {(() => {
            const orgTitle =
              workspaceHeaderTitle(branding, tenantContext, isps, selectedIspId, user) ||
              String(branding?.displayName || "").trim();
            const addr = String(branding?.address || "").trim();
            const portalLeg = String(branding?.portalFooterText || "").trim();
            const invFoot = String(branding?.invoiceFooter || "").trim();
            const email = String(branding?.contactEmail || "").trim();
            const phone = String(branding?.contactPhone || "").trim();
            const telHref = telHrefFromBrandingPhone(phone);
            return (
              <>
                {orgTitle ? (
                  <div className="app-footer-row app-footer-row--brand">
                    <span className="app-footer-brand">{orgTitle}</span>
                  </div>
                ) : null}
                {addr ? <p className="app-footer-address">{addr}</p> : null}
                {portalLeg ? (
                  <p className="app-footer-legal app-footer-legal--pre">{portalLeg}</p>
                ) : null}
                {invFoot ? (
                  <p
                    className={`app-footer-legal app-footer-legal--pre${
                      portalLeg ? " app-footer-legal--secondary" : ""
                    }`}
                  >
                    {invFoot}
                  </p>
                ) : null}
                {email || telHref ? (
                  <div className="app-footer-contact-row">
                    {telHref ? (
                      <a className="app-footer-contact-pill" href={telHref}>
                        <IconPhone width={18} height={18} aria-hidden />
                        <span>{phone}</span>
                      </a>
                    ) : null}
                    {email ? (
                      <a className="app-footer-contact-pill" href={`mailto:${email}`}>
                        <IconMail width={18} height={18} aria-hidden />
                        <span>{email}</span>
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </>
            );
          })()}
          <PoweredByMcBuleli
            className="app-footer-powered"
            poweredByLabel={isEn ? "Powered by" : "Propulsé par"}
          />
        </div>
      </footer>
    </main>
    {isMobileShell ? (
      <DashboardMobileSheetMenu
        open={mobilePwaMenuOpen}
        onClose={() => setMobilePwaMenuOpen(false)}
        categories={pwaNavCategories}
        navigateMobileScreen={navigateMobileScreen}
        t={t}
      />
    ) : null}
    <PwaInstallPrompt enabled={pwaPromptGateOk} workspaceLabel={workspaceTitleForPwa} isEn={isEn} />
    </>
  );
}

function Card({ title, value }) {
  return (
    <article className="panel metric">
      <h3>{title}</h3>
      <p>{value}</p>
    </article>
  );
}

export default App;
