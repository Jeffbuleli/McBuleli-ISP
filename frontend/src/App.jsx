import { useEffect, useRef, useState } from "react";
import { api, publicAssetUrl, setAuthToken } from "./api";

/** Replace placeholder tenant names (e.g. "AA") with McBuleli for public-facing titles. */
function resolvePublicBrandName(displayName) {
  const s = displayName != null ? String(displayName).trim() : "";
  if (!s || s === "AA") return "McBuleli";
  return displayName;
}

function getStoredUiLang() {
  if (typeof window === "undefined") return "fr";
  const saved = window.localStorage.getItem("ui_lang");
  return saved === "en" ? "en" : "fr";
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

function CsvImportResultBlock({ createdCount, skipped, errors, maxRows = 40, onDismiss }) {
  const sk = skipped || [];
  const er = errors || [];
  if (sk.length === 0 && er.length === 0 && !createdCount) return null;
  return (
    <div style={{ marginTop: 12, padding: 12, background: "#f8f9fb", fontSize: "0.9rem", borderRadius: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <strong>Résultat de l'import</strong>
        {onDismiss ? (
          <button type="button" onClick={onDismiss}>
            Fermer
          </button>
        ) : null}
      </div>
      <p style={{ margin: "8px 0" }}>
        <strong>{createdCount}</strong> ligne{createdCount === 1 ? "" : "s"} importée{createdCount === 1 ? "" : "s"}.
        {sk.length ? (
          <>
            {" "}
            <strong>{sk.length}</strong> ignorée{sk.length === 1 ? "" : "s"}.
          </>
        ) : null}
        {er.length ? (
          <>
            {" "}
            <strong>{er.length}</strong> erreur{er.length === 1 ? "" : "s"}.
          </>
        ) : null}
      </p>
      {sk.length > 0 ? (
        <details open={sk.length <= 15} style={{ marginTop: 8 }}>
          <summary>Lignes ignorées (premières {Math.min(sk.length, maxRows)})</summary>
          <ul style={{ margin: "8px 0", paddingLeft: 20 }}>
            {sk.slice(0, maxRows).map((s, i) => (
              <li key={i}>
                Ligne {s.line} : {s.reason || "ignorée"}
                {s.phone != null ? ` — tél. ${s.phone}` : ""}
                {s.email != null ? ` — ${s.email}` : ""}
              </li>
            ))}
          </ul>
          {sk.length > maxRows ? <p>… et {sk.length - maxRows} autres ignorées.</p> : null}
        </details>
      ) : null}
      {er.length > 0 ? (
        <details open style={{ marginTop: 8 }}>
          <summary>Erreurs (premières {Math.min(er.length, maxRows)})</summary>
          <ul style={{ margin: "8px 0", paddingLeft: 20 }}>
            {er.slice(0, maxRows).map((e, i) => (
              <li key={i}>
                Ligne {e.line} : {e.message || "Erreur inconnue"}
              </li>
            ))}
          </ul>
          {er.length > maxRows ? <p>… et {er.length - maxRows} autres erreurs.</p> : null}
        </details>
      ) : null}
    </div>
  );
}

const EXPENSE_CATEGORY_OPTIONS = [
  { value: "field_agent_fixed", label: "Agent terrain — paiement fixe" },
  { value: "field_agent_percentage", label: "Agent terrain — pourcentage / commission" },
  { value: "equipment", label: "Équipement" },
  { value: "operations", label: "Exploitation" },
  { value: "marketing", label: "Marketing" },
  { value: "utilities", label: "Charges & services" },
  { value: "transport", label: "Transport" },
  { value: "salaries", label: "Salaires" },
  { value: "taxes", label: "Impôts & taxes" },
  { value: "other", label: "Autre" }
];

function expenseCategoryLabel(value) {
  return EXPENSE_CATEGORY_OPTIONS.find((o) => o.value === value)?.label || value;
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
  expenses: "dépenses"
};

function App() {
  const [user, setUser] = useState(null);
  const [tenantContext, setTenantContext] = useState(null);
  const [loginForm, setLoginForm] = useState({ email: "admin@isp.local", password: "admin123" });
  const [mfaLogin, setMfaLogin] = useState(null);
  const [mfaCode, setMfaCode] = useState("");
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "" });
  const [isps, setIsps] = useState([]);
  const [selectedIspId, setSelectedIspId] = useState("");
  const [superDashboard, setSuperDashboard] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [users, setUsers] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [notificationProviders, setNotificationProviders] = useState([]);
  const [roleProfiles, setRoleProfiles] = useState([]);
  const [platformPackages, setPlatformPackages] = useState([]);
  const [platformSubscriptions, setPlatformSubscriptions] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [notificationOutbox, setNotificationOutbox] = useState([]);
  const [branding, setBranding] = useState(null);
  const [networkStats, setNetworkStats] = useState(null);
  const [networkNodes, setNetworkNodes] = useState([]);
  const [provisioningEvents, setProvisioningEvents] = useState([]);
  const [radiusSyncEvents, setRadiusSyncEvents] = useState([]);
  const [telemetrySnapshots, setTelemetrySnapshots] = useState([]);
  const [radiusAccountingIngest, setRadiusAccountingIngest] = useState([]);
  const [tidSubmissions, setTidSubmissions] = useState([]);
  const [tidConflicts, setTidConflicts] = useState([]);
  const [vouchers, setVouchers] = useState([]);
  const [expenses, setExpenses] = useState([]);
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
  const [plans, setPlans] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [uiLang, setUiLang] = useState(getStoredUiLang);
  const isEn = uiLang === "en";
  const t = (fr, en) => (isEn ? en : fr);

  const [customerForm, setCustomerForm] = useState({ fullName: "", phone: "", email: "", initialPassword: "" });
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
    configText: "{}"
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
    permissionsText: "[\"collect_payment\"]"
  });
  const [platformSubForm, setPlatformSubForm] = useState({
    packageId: "",
    durationDays: 30
  });
  const [statsPeriod, setStatsPeriod] = useState({
    from: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
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
    wifiPortalRedirectUrl: ""
  });
  const [userForm, setUserForm] = useState({
    fullName: "",
    email: "",
    password: "",
    role: "billing_agent",
    accreditationLevel: "basic"
  });
  const [tidForm, setTidForm] = useState({
    invoiceId: "",
    tid: "",
    submittedByPhone: "",
    amountUsd: ""
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
  const [customerEmailForm, setCustomerEmailForm] = useState({ customerId: "", email: "" });
  const customerCsvInputRef = useRef(null);
  const teamCsvInputRef = useRef(null);
  const [customerImportPassword, setCustomerImportPassword] = useState("");
  const [teamImportPassword, setTeamImportPassword] = useState("");
  const [teamImportRole, setTeamImportRole] = useState("billing_agent");
  const [customerImportReport, setCustomerImportReport] = useState(null);
  const [teamImportReport, setTeamImportReport] = useState(null);
  const [lastPortalIssue, setLastPortalIssue] = useState(null);
  const [saasPayForm, setSaasPayForm] = useState({
    currency: "CDF",
    phoneNumber: "",
    networkKey: "orange",
    packageId: ""
  });
  const [saasDepositResult, setSaasDepositResult] = useState(null);
  const [pawapayNetworks, setPawapayNetworks] = useState(DEFAULT_PAWAPAY_NETWORKS);
  const [withdrawals, setWithdrawals] = useState([]);
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

  async function refresh(selectedTenantId = selectedIspId) {
    setLoading(true);
    setError("");
    try {
      const currentUser = await api.me();
      setUser(currentUser);
      const blocked =
        currentUser.role !== "super_admin" &&
        currentUser.ispId &&
        currentUser.platformBilling &&
        currentUser.platformBilling.accessAllowed === false;
      if (blocked) {
        const sid = currentUser.ispId;
        setIsps([]);
        setSelectedIspId(sid);
        try {
          const [packages, platformSubs, snap, networks, withdrawalData] = await Promise.all([
            api.getPlatformPackages(),
            api.getPlatformSubscriptions(sid),
            api.getPlatformBillingStatus(sid),
            api.getPawapayNetworks(),
            api.getWithdrawals(sid)
          ]);
          setPlatformPackages(packages);
          setPlatformSubscriptions(platformSubs);
          setPlatformBillingStatus(snap);
          setPawapayNetworks(Array.isArray(networks) && networks.length ? networks : DEFAULT_PAWAPAY_NETWORKS);
          setWithdrawals(Array.isArray(withdrawalData?.items) ? withdrawalData.items : []);
        } catch (_e) {
          /* billing endpoints stay reachable */
        }
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
      if (currentUser.role === "super_admin") {
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
      let withdrawalData = { items: [] };

      if (activeIspId) {
        const settled = await Promise.allSettled([
          api.getDashboard(activeIspId),
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
          api.getAuditLogs(activeIspId),
          api.getNotificationOutbox(activeIspId),
          api.getBranding(activeIspId),
          api.getNetworkStats(activeIspId, statsPeriod.from, statsPeriod.to),
          api.getTidSubmissions(activeIspId),
          api.getTidConflicts(activeIspId),
          api.getVouchers(activeIspId),
          api.getTelemetrySnapshots(activeIspId),
          api.getRadiusAccountingIngest(activeIspId, 80),
          api.getExpenses(activeIspId, expenseFilter.from, expenseFilter.to),
          api.getWithdrawals(activeIspId)
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
        const expData = take(settled, 22, { items: [], summary: null }, "expenses");
        withdrawalData = take(settled, 23, { cashbox: null, items: [] }, "withdrawals");
        setExpenses(Array.isArray(expData?.items) ? expData.items : []);
        setExpenseSummary(expData?.summary || null);
        setWithdrawals(Array.isArray(withdrawalData?.items) ? withdrawalData.items : []);
        if (withdrawalData?.cashbox) {
          dash = { ...dash, cashbox: withdrawalData.cashbox };
        }
      } else {
        setExpenses([]);
        setExpenseSummary(null);
        setWithdrawals([]);
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
      } else {
        setPlatformBillingStatus(null);
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
          wifiPortalRedirectUrl: brand.wifiPortalRedirectUrl || ""
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("ui_lang", uiLang);
    }
  }, [uiLang]);

  useEffect(() => {
    if (typeof window === "undefined" || !user || !isEn) return;
    const root = document.querySelector("main.container.app-shell");
    if (!root) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let n = walker.nextNode();
    while (n) {
      textNodes.push(n);
      n = walker.nextNode();
    }
    for (const node of textNodes) {
      const v = node.nodeValue || "";
      const nv = translateToEnglish(v);
      if (nv !== v) node.nodeValue = nv;
    }

    const elems = root.querySelectorAll("input, textarea, button, option, label, h1, h2, h3, p, span, a, small");
    for (const el of elems) {
      if (el.getAttribute("placeholder")) {
        el.setAttribute("placeholder", translateToEnglish(el.getAttribute("placeholder")));
      }
      if (el.getAttribute("title")) {
        el.setAttribute("title", translateToEnglish(el.getAttribute("title")));
      }
    }
  }, [user, isEn, notice, error, loading, selectedIspId, expenses.length, customers.length, plans.length, users.length]);

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
        refresh();
      }
    }
    bootstrap();
  }, []);

  async function onLogin(e) {
    e.preventDefault();
    setError("");
    try {
      const payload = await api.login(loginForm);
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
      setError(err.message);
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
      setError(err.message || "Code MFA invalide.");
    }
  }

  function onLogout() {
    setAuthToken("");
    setUser(null);
    setMfaLogin(null);
    setMfaCode("");
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
      await api.createCustomer(selectedIspId, {
        fullName,
        phone,
        email: email || undefined,
        initialPassword: initialPassword || undefined
      });
      setCustomerForm({ fullName: "", phone: "", email: "", initialPassword: "" });
      setNotice("Client enregistré.");
      refresh();
    } catch (err) {
      setError(err.message || "Impossible d'enregistrer le client.");
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
      setNotice("Dépense enregistrée.");
      await refresh();
    } catch (err) {
      setError(err.message || "Impossible d'enregistrer la dépense.");
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
      setError(err.message || "Impossible de supprimer la dépense.");
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
      setError(err.message || "Impossible de créer le lien portail.");
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
      const data = await api.initiatePlatformDeposit(selectedIspId, {
        currency: saasPayForm.currency,
        phoneNumber: saasPayForm.phoneNumber,
        networkKey: saasPayForm.networkKey,
        packageId: saasPayForm.packageId || undefined
      });
      setSaasDepositResult(data);
      setNotice(data.message || "Dépôt initié.");
    } catch (err) {
      setError(err.message || "Échec du démarrage du dépôt.");
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
      setError(err.message || "Impossible de lire le statut du dépôt.");
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
      setError(err.message || "Impossible de créer le retrait.");
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
      setError(err.message || "Impossible de démarrer la configuration MFA.");
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
      setError(err.message || "Code Google Authenticator invalide.");
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
      setError(err.message || "Impossible de mettre à jour la formule.");
    }
  }

  async function onCreateSubscription(e) {
    e.preventDefault();
    await api.createSubscription(selectedIspId, subForm);
    setSubForm({ customerId: "", planId: "", accessType: "pppoe" });
    refresh();
  }

  async function onRefreshStats(e) {
    e.preventDefault();
    refresh();
  }

  async function onSaveBranding(e) {
    e.preventDefault();
    await api.updateBranding(selectedIspId, brandingForm);
    setNotice("Image de marque enregistrée.");
    refresh();
  }

  async function onBrandingLogoFile(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !selectedIspId) return;
    setError("");
    setNotice("");
    try {
      const row = await api.uploadBrandingLogo(selectedIspId, f);
      setBrandingForm((prev) => ({ ...prev, logoUrl: row?.logoUrl || prev.logoUrl }));
      setNotice("Logo téléversé.");
      refresh();
    } catch (err) {
      setError(err.message);
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
      setError(err.message);
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
      setError(err.message);
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
      setError(err.message);
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
      setError(err.message);
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

  async function onCreateUser(e) {
    e.preventDefault();
    await api.createUser(selectedIspId, userForm);
    setUserForm({
      fullName: "",
      email: "",
      password: "",
      role: "billing_agent",
      accreditationLevel: "basic"
    });
    refresh();
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
      setError(err.message || "Échec de la réinitialisation du mot de passe.");
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
    await api.createPaymentMethod(selectedIspId, {
      methodType: paymentMethodForm.methodType,
      providerName: paymentMethodForm.providerName,
      config: JSON.parse(paymentMethodForm.configText || "{}")
    });
    setPaymentMethodForm({
      methodType: "cash",
      providerName: "Guichet espèces",
      configText: "{}"
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
      setError(err.message);
    }
  }

  async function onPatchCustomerEmail(e) {
    e.preventDefault();
    setError("");
    try {
      await api.patchCustomer(selectedIspId, customerEmailForm.customerId, {
        email: customerEmailForm.email.trim() || null
      });
      setNotice("E-mail client mis à jour.");
      setCustomerEmailForm({ customerId: "", email: "" });
      refresh();
    } catch (err) {
      setError(err.message);
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
      permissions: JSON.parse(roleProfileForm.permissionsText || "[]")
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
    setNotice("TID envoyée. En attente de vérification par l'administrateur.");
    refresh();
  }

  async function onReviewTid(submissionId, decision) {
    const note = window.prompt(`Note facultative pour ${decision}`, "");
    await api.reviewTidSubmission(selectedIspId, submissionId, { decision, note: note || "" });
    refresh();
  }

  async function onQueueTidReminders() {
    const payload = await api.queueTidReminders(selectedIspId);
    setNotice(`${payload.queued} rappel(s) mis en file pour ${payload.totalPending} TID en attente.`);
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
      setError(err.message);
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
      setError(err.message);
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
      setError(err.message);
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
      setError(err.message);
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
          ${branding?.logoUrl ? `<img src="${publicAssetUrl(branding.logoUrl)}" alt="" style="height:40px;" />` : ""}
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

  if (!user) {
    const loginTitle = resolvePublicBrandName(tenantContext?.displayName);
    return (
      <main className="container container--login">
        <div className="login-layout">
          <section className="login-poster" aria-label="Présentation">
            <div className="login-poster-logo">McBuleli</div>
            <p className="login-poster-lead">
              Facturation abonnés, factures, encaissements Mobile Money, portail client et suivi réseau — une
              seule plateforme pour votre FAI. Connectez-vous ci-contre pour gérer votre espace.
            </p>
          </section>
          <div className="login-stack">
            <header className="app-header app-header--login">
              <div>
                <h1>{loginTitle}</h1>
                <p className="app-meta">
                  {tenantContext?.displayName
                    ? isEn
                      ? "Sign in to your workspace."
                      : "Connexion à votre espace opérateur."
                    : isEn
                      ? "McBuleli team workspace — enter your credentials below."
                      : "Espace équipe McBuleli — saisissez vos identifiants ci-dessous."}
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
            {mfaLogin ? (
              <form className="panel" onSubmit={onVerifyLoginMfa}>
                <h2>{isEn ? "MFA verification" : "Vérification MFA"}</h2>
                <p>
                  {isEn
                    ? "Enter the 6-digit code sent to the internal notification outbox or SMS provider."
                    : "Saisissez le code à 6 chiffres envoyé dans la file de notifications interne ou par SMS."}
                </p>
                {mfaLogin.devCode ? (
                  <p style={{ fontSize: "0.9rem", color: "var(--mb-muted)" }}>
                    {isEn ? "Development code:" : "Code développement :"} <code>{mfaLogin.devCode}</code>
                  </p>
                ) : null}
                <input
                  placeholder={isEn ? "MFA code" : "Code MFA"}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                />
                <button type="submit">{isEn ? "Verify" : "Valider"}</button>
                <button type="button" onClick={() => setMfaLogin(null)}>
                  {isEn ? "Back to login" : "Retour connexion"}
                </button>
              </form>
            ) : (
              <form className="panel" onSubmit={onLogin}>
                <h2>{isEn ? "Login" : "Connexion"}</h2>
                <input
                  placeholder={isEn ? "Email address" : "Adresse e-mail"}
                  value={loginForm.email}
                  onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                />
                <input
                  placeholder={isEn ? "Password" : "Mot de passe"}
                  type="password"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                />
                <button type="submit">{isEn ? "Login" : "Se connecter"}</button>
                <p>
                  <a href="/signup">{isEn ? "Create a McBuleli account" : "Créer un compte entreprise McBuleli"}</a>{" "}
                  ({isEn ? "1-month trial, Mobile Money billing" : "essai 1 mois, facturation Mobile Money"})
                </p>
                <p style={{ fontSize: "0.88rem", color: "var(--mb-muted)" }}>
                  {isEn ? "Demo admin:" : "Démo admin :"} admin@isp.local / admin123
                </p>
              </form>
            )}
          </div>
        </div>
      </main>
    );
  }

  if (user.mustChangePassword) {
    return (
      <main className="container">
        <header className="app-header app-header--login">
          <div>
            <h1>McBuleli</h1>
            <p className="app-meta">
              {t(
                "Vous devez mettre à jour votre mot de passe avant de continuer.",
                "You must update your password before continuing."
              )}
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
        <form className="panel" onSubmit={onChangePassword}>
          <h2>{t("Nouveau mot de passe", "Change password")}</h2>
          <input
            type="password"
            placeholder={t("Mot de passe actuel", "Current password")}
            value={passwordForm.currentPassword}
            onChange={(e) =>
              setPasswordForm({ ...passwordForm, currentPassword: e.target.value })
            }
          />
          <input
            type="password"
            placeholder={t("Nouveau mot de passe", "New password")}
            value={passwordForm.newPassword}
            onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
          />
          <button type="submit">{t("Enregistrer", "Save")}</button>
        </form>
      </main>
    );
  }

  return (
    <main className="container app-shell">
      <header className="app-header">
        <div>
          <h1>{resolvePublicBrandName(branding?.displayName || tenantContext?.displayName)}</h1>
          <p className="app-meta">
            {t("Connecté :", "Logged in as")} <strong>{user.fullName}</strong> ({user.role})
          </p>
        </div>
        <div>
          <button type="button" onClick={() => setUiLang("fr")} disabled={uiLang === "fr"}>
            FR
          </button>{" "}
          <button type="button" onClick={() => setUiLang("en")} disabled={uiLang === "en"}>
            EN
          </button>{" "}
        <button type="button" className="btn-logout" onClick={onLogout}>
          {t("Déconnexion", "Logout")}
        </button>
        </div>
      </header>
      {loading && <p>{t("Chargement…", "Loading...")}</p>}
      {error && <p className="error">{isEn ? translateToEnglish(error) : error}</p>}
      {notice && <p>{isEn ? translateToEnglish(notice) : notice}</p>}

      {(() => {
        const billing = user.role === "super_admin" ? platformBillingStatus : user.platformBilling;
        if (!selectedIspId || !billing || billing.legacyWorkspace) return null;
        const locked = billing.accessAllowed === false;
        return (
          <section className={`panel ${locked ? "error" : ""}`} id="mcbuleli-billing">
            <h2>{t("Abonnement McBuleli (Mobile Money)", "McBuleli subscription (Mobile Money)")}</h2>
            {locked ? (
              <p>
                {t(
                  "Cet espace est verrouillé jusqu'au paiement mensuel. Utilisez le formulaire ci-dessous (CDF ou USD), puis cliquez sur « Vérifier le paiement » après avoir payé.",
                  "This workspace is locked until monthly payment is received. Use the form below (CDF or USD), then click \"Check payment status\" after payment."
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
            {(user.role === "super_admin" ||
              user.role === "company_manager" ||
              user.role === "isp_admin") && (
              <>
                <h3>{t("Payer par Mobile Money", "Pay with Mobile Money")}</h3>
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
                  <button type="submit" disabled={!selectedIspId}>
                    {t("Payer l'abonnement mensuel", "Pay monthly subscription")}
                  </button>
                </form>
                {saasDepositResult?.depositId ? (
                  <p>
                    {t("ID dépôt :", "Deposit ID:")} {saasDepositResult.depositId}{" "}
                    <button type="button" onClick={onPollPlatformDeposit}>
                      {t("Vérifier le paiement", "Check payment status")}
                    </button>
                  </p>
                ) : null}
              </>
            )}
            {billing.subscription?.status === "trialing" ? (
              <p style={{ fontSize: "0.9rem", color: "var(--mb-muted)" }}>
                {t(
                  "Pour changer de formule, choisissez le nouveau plan dans le formulaire de paiement Mobile Money. La formule sera appliquée seulement après confirmation Pawapay.",
                  "To change plan, select the new tier in the Mobile Money payment form. The tier is applied only after Pawapay confirms payment."
                )}
              </p>
            ) : null}
          </section>
        );
      })()}

      <section className="grid metrics">
        <Card title={t("FAI", "ISPs")} value={superDashboard?.totalIsps ?? 0} />
        <Card title={t("Clients (tous FAI)", "All Customers")} value={superDashboard?.totalCustomers ?? 0} />
        <Card
          title={t("Abonnements actifs (tous)", "All Active Subscriptions")}
          value={superDashboard?.totalActiveSubscriptions ?? 0}
        />
        <Card title={t("Chiffre d'affaires global (USD)", "Global Revenue (USD)")} value={superDashboard?.totalRevenueUsd ?? 0} />
      </section>

      <section className="grid metrics">
        <Card title={t("Utilisateurs hotspot", "Hotspot Users")} value={networkStats?.hotspotUsers ?? 0} />
        <Card title={t("Utilisateurs PPPoE", "PPPoE Users")} value={networkStats?.pppoeUsers ?? 0} />
        <Card title={t("Appareils connectés", "Connected Devices")} value={networkStats?.connectedDevices ?? 0} />
        <Card title={t("Bande passante (Go)", "Bandwidth (GB)")} value={networkStats?.bandwidthTotalGb ?? 0} />
        <Card title={t("Encaissements sur la période (USD)", "Revenue In Period (USD)")} value={networkStats?.revenueCollectedUsd ?? 0} />
      </section>

      <section className="grid metrics">
        <Card title={t("Caisse cash (USD)", "Cash till (USD)")} value={networkStats?.cashbox?.cashUsd ?? dashboard?.cashbox?.cashUsd ?? 0} />
        <Card title={t("Caisse TID (USD)", "TID till (USD)")} value={networkStats?.cashbox?.tidUsd ?? dashboard?.cashbox?.tidUsd ?? 0} />
        <Card title={t("Mobile Money (USD)", "Mobile Money (USD)")} value={networkStats?.cashbox?.mobileMoneyUsd ?? dashboard?.cashbox?.mobileMoneyUsd ?? 0} />
        <Card title={t("Retirable Mobile Money (USD)", "Withdrawable Mobile Money (USD)")} value={networkStats?.cashbox?.withdrawableMobileMoneyUsd ?? dashboard?.cashbox?.withdrawableMobileMoneyUsd ?? 0} />
      </section>

      <section className="panel">
        <h2>{t("Période des statistiques", "Statistics Period")}</h2>
        <form onSubmit={onRefreshStats}>
          <input
            type="date"
            value={statsPeriod.from}
            onChange={(e) => setStatsPeriod({ ...statsPeriod, from: e.target.value })}
          />
          <input
            type="date"
            value={statsPeriod.to}
            onChange={(e) => setStatsPeriod({ ...statsPeriod, to: e.target.value })}
          />
          <button type="submit" disabled={!selectedIspId}>
            {t("Actualiser les stats", "Refresh stats")}
          </button>
        </form>
      </section>

      {(user.role === "super_admin" ||
        user.role === "company_manager" ||
        user.role === "isp_admin" ||
        user.role === "noc_operator" ||
        user.role === "billing_agent") && (
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
      )}

      <section className="grid">
        {user.role === "super_admin" && (
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
            disabled={user.role !== "super_admin" || Boolean(tenantContext?.ispId)}
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

      <section className="grid">
        {(user.role === "super_admin" || user.role === "company_manager" || user.role === "isp_admin") && (
          <form className="panel" onSubmit={onSaveBranding}>
            <h2>Image de marque / marque blanche</h2>
            <input
              placeholder="Nom affiché"
              value={brandingForm.displayName}
              onChange={(e) => setBrandingForm({ ...brandingForm, displayName: e.target.value })}
            />
            <input
              placeholder="Sous-domaine (ex. admin1.votredomaine.com)"
              value={brandingForm.subdomain}
              onChange={(e) => setBrandingForm({ ...brandingForm, subdomain: e.target.value })}
            />
            <input
              placeholder="Domaine personnalisé (facultatif)"
              value={brandingForm.customDomain}
              onChange={(e) => setBrandingForm({ ...brandingForm, customDomain: e.target.value })}
            />
            <label style={{ display: "block", marginTop: 8 }}>
              Logo entreprise (depuis votre appareil)
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={onBrandingLogoFile} />
            </label>
            {brandingForm.logoUrl ? (
              <p style={{ margin: "8px 0" }}>
                <img
                  src={publicAssetUrl(brandingForm.logoUrl)}
                  alt="Aperçu du logo"
                  style={{ maxHeight: 48, maxWidth: 200, objectFit: "contain" }}
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
            <input
              placeholder="Redirection après paiement Wi‑Fi (https://…)"
              value={brandingForm.wifiPortalRedirectUrl}
              onChange={(e) =>
                setBrandingForm({ ...brandingForm, wifiPortalRedirectUrl: e.target.value })
              }
            />
            <button type="submit" disabled={!selectedIspId}>
              Enregistrer l'image de marque
            </button>
          </form>
        )}
      </section>

      <section className="grid">
        {(user.role === "super_admin" || user.role === "company_manager" || user.role === "isp_admin") && (
          <form className="panel" onSubmit={onCreatePaymentMethod}>
            <h2>Moyens de paiement FAI</h2>
            <select
              value={paymentMethodForm.methodType}
              onChange={(e) =>
                setPaymentMethodForm({ ...paymentMethodForm, methodType: e.target.value })
              }
            >
              <option value="cash">Espèces (cash)</option>
              <option value="pawapay">Mobile Money</option>
              <option value="onafriq">ONAFRIQ</option>
              <option value="paypal">PayPal</option>
              <option value="binance_pay">Binance Pay</option>
              <option value="mobile_money">Mobile Money (générique)</option>
              <option value="gateway">Gateway personnalisé</option>
              <option value="bank_transfer">Virement bancaire</option>
              <option value="crypto_wallet">Portefeuille crypto</option>
              <option value="other">Autre</option>
            </select>
            <input
              placeholder="Nom du fournisseur"
              value={paymentMethodForm.providerName}
              onChange={(e) =>
                setPaymentMethodForm({ ...paymentMethodForm, providerName: e.target.value })
              }
            />
            <input
              placeholder='Configuration JSON (ex : {"apiKey":"xxx"})'
              value={paymentMethodForm.configText}
              onChange={(e) =>
                setPaymentMethodForm({ ...paymentMethodForm, configText: e.target.value })
              }
            />
            <button type="submit" disabled={!selectedIspId}>
              Ajouter un moyen de paiement
            </button>
            {paymentMethods.map((pm) => (
              <p key={pm.id}>
                {pm.methodType} — {pm.providerName} [{pm.isActive ? "actif" : "inactif"}]{" "}
                <button type="button" onClick={() => onTogglePaymentMethod(pm.id, !pm.isActive)}>
                  {pm.isActive ? "Désactiver" : "Activer"}
                </button>
                {" "}
                <button type="button" onClick={() => onGenerateGatewayCallback(pm.id)} disabled={!pm.isActive}>
                  Générer callback gateway
                </button>
                {" "}
                <button type="button" onClick={() => onTestGatewayCallback(pm.id)} disabled={!pm.isActive}>
                  Tester callback (activation)
                </button>
                {gatewayCallbackByMethod[pm.id] ? (
                  <span>
                    {" "}— URL: <code>{gatewayCallbackByMethod[pm.id].callbackUrl}</code>{" "}
                    <button
                      type="button"
                      onClick={() => copyToClipboard(gatewayCallbackByMethod[pm.id].callbackUrl)}
                    >
                      Copier URL
                    </button>{" "}
                    — Secret: <code>{gatewayCallbackByMethod[pm.id].callbackSecret}</code>{" "}
                    <button
                      type="button"
                      onClick={() => copyToClipboard(gatewayCallbackByMethod[pm.id].callbackSecret)}
                    >
                      Copier secret
                    </button>
                  </span>
                ) : null}
              </p>
            ))}
          </form>
        )}

        {(user.role === "super_admin" || user.role === "company_manager") && (
          <form className="panel" onSubmit={onUpsertRoleProfile}>
            <h2>Profils d'habilitation</h2>
            <input
              placeholder="Clé de rôle (ex. field_agent)"
              value={roleProfileForm.roleKey}
              onChange={(e) => setRoleProfileForm({ ...roleProfileForm, roleKey: e.target.value })}
            />
            <select
              value={roleProfileForm.accreditationLevel}
              onChange={(e) =>
                setRoleProfileForm({ ...roleProfileForm, accreditationLevel: e.target.value })
              }
            >
              <option value="basic">Basique</option>
              <option value="standard">Standard</option>
              <option value="senior">Senior</option>
              <option value="manager">Manager</option>
            </select>
            <input
              placeholder='Permissions JSON (ex : ["collect_payment"])'
              value={roleProfileForm.permissionsText}
              onChange={(e) =>
                setRoleProfileForm({ ...roleProfileForm, permissionsText: e.target.value })
              }
            />
            <button type="submit" disabled={!selectedIspId}>
              Enregistrer le profil de rôle
            </button>
            {roleProfiles.map((profile) => (
              <p key={profile.id}>
                {profile.roleKey} — {profile.accreditationLevel} —{" "}
                {Array.isArray(profile.permissions) ? profile.permissions.join(", ") : ""}
              </p>
            ))}
          </form>
        )}
      </section>

      <section className="grid">
        {(user.role === "super_admin" || user.role === "company_manager" || user.role === "isp_admin") && (
          <form className="panel" onSubmit={onCreateNetworkNode}>
            <h2>Nœud réseau MikroTik</h2>
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
            {networkNodes.map((node) => (
              <p key={node.id}>
                {node.name} ({node.host}:{node.apiPort}) [{node.isActive ? "actif" : "inactif"}]
                {node.isDefault ? " [défaut]" : ""}{" "}
                <button type="button" onClick={() => onToggleNetworkNode(node.id, !node.isActive)}>
                  {node.isActive ? "Désactiver" : "Activer"}
                </button>{" "}
                {!node.isDefault && (
                  <button type="button" onClick={() => onSetDefaultNetworkNode(node.id)}>
                    Par défaut
                  </button>
                )}{" "}
                {(user.role === "super_admin" ||
                  user.role === "company_manager" ||
                  user.role === "isp_admin" ||
                  user.role === "noc_operator") && (
                  <button type="button" onClick={() => onCollectTelemetry(node.id)}>
                    Collecter la télémétrie
                  </button>
                )}
              </p>
            ))}
          </form>
        )}

        <section className="panel">
          <h2>Événements de provisionnement</h2>
          {provisioningEvents.slice(0, 12).map((event) => (
            <p key={event.id}>
              {new Date(event.createdAt).toLocaleString()} - {event.action} ({event.accessType || "n/a"}){" "}
              [{event.status}]
            </p>
          ))}
        </section>

        <section className="panel">
          <h2>Synchronisation FreeRADIUS</h2>
          {radiusSyncEvents.slice(0, 12).map((event) => (
            <p key={event.id}>
              {new Date(event.createdAt).toLocaleString()} - {event.action} {event.username} [{event.status}]
            </p>
          ))}
        </section>

        <section className="panel">
          <h2>Télémétrie réseau (MikroTik)</h2>
          <p>
            Derniers instantanés depuis <strong>Collecter la télémétrie</strong> sur chaque nœud. Les compteurs
            alimentent le graphique du jour (sessions PPPoE / hotspot de pointe).
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

      <section className="grid">
        {(user.role === "super_admin" || user.role === "company_manager" || user.role === "isp_admin") && (
          <form className="panel" onSubmit={onUpsertNotificationProvider}>
            <h2>Fournisseurs de notifications</h2>
            <select
              value={notificationProviderForm.channel}
              onChange={(e) =>
                setNotificationProviderForm({ ...notificationProviderForm, channel: e.target.value })
              }
            >
              <option value="sms">SMS</option>
              <option value="email">E-mail</option>
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
              <option value="webhook">Webhook HTTP</option>
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
        <form className="panel" onSubmit={onSubmitTid}>
          <h2>Mobile Money manuel (TID)</h2>
          <select
            value={tidForm.invoiceId}
            onChange={(e) => setTidForm({ ...tidForm, invoiceId: e.target.value })}
          >
            <option value="">Choisir une facture ouverte (impayée / en retard)</option>
            {invoices
              .filter((inv) => inv.status === "unpaid" || inv.status === "overdue")
              .map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.id.slice(0, 8)} - ${inv.amountUsd}
                </option>
              ))}
          </select>
          <input
            placeholder="Référence de transaction (TID)"
            value={tidForm.tid}
            onChange={(e) => setTidForm({ ...tidForm, tid: e.target.value })}
          />
          <input
            placeholder="Téléphone payeur"
            value={tidForm.submittedByPhone}
            onChange={(e) => setTidForm({ ...tidForm, submittedByPhone: e.target.value })}
          />
          <input
            placeholder="Montant (facultatif)"
            value={tidForm.amountUsd}
            onChange={(e) => setTidForm({ ...tidForm, amountUsd: e.target.value })}
          />
          <button type="submit" disabled={!selectedIspId}>
            Envoyer la TID
          </button>
        </form>

        <section className="panel">
          <h2>File de vérification des TID</h2>
          <button onClick={onQueueTidReminders} disabled={!selectedIspId}>
            Mettre en file les rappels TID en attente
          </button>
          {tidSubmissions.map((row) => (
            <p key={row.id}>
              {row.tid} — {row.status} — facture {row.invoiceId?.slice(0, 8)}{" "}
              {(user.role === "super_admin" ||
                user.role === "company_manager" ||
                user.role === "isp_admin" ||
                user.role === "billing_agent") &&
                row.status === "pending" && (
                  <>
                    <button onClick={() => onReviewTid(row.id, "approved")}>Approuver</button>{" "}
                    <button onClick={() => onReviewTid(row.id, "rejected")}>Rejeter</button>
                  </>
                )}
            </p>
          ))}
          {tidConflicts.length > 0 && (
            <>
              <h3>Conflits TID en double</h3>
              {tidConflicts.map((c) => (
                <p key={c.tid}>
                  {c.tid} — {c.duplicates} envoi(s) — {c.statuses?.join(", ")}
                </p>
              ))}
            </>
          )}
        </section>
      </section>

      <section className="grid">
        <form className="panel" onSubmit={onGenerateVouchers}>
          <h2>Générer des bons d'accès</h2>
          <select
            value={voucherForm.planId}
            onChange={(e) => setVoucherForm({ ...voucherForm, planId: e.target.value })}
          >
            <option value="">Choisir une formule</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} ({plan.rateLimit}, {plan.durationDays} days)
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
            Appareils max par bon (défaut = limite de la formule)
            <input
              type="number"
              min="1"
              max="100"
              placeholder="Défaut formule"
              value={voucherForm.maxDevices}
              onChange={(e) => setVoucherForm({ ...voucherForm, maxDevices: e.target.value })}
              style={{ marginLeft: 8, width: 120 }}
            />
          </label>
          <button type="submit" disabled={!selectedIspId}>
            Générer les bons
          </button>
          <button type="button" onClick={onPrintVouchers} disabled={!selectedIspId}>
            Imprimer les bons inutilisés
          </button>
          <button type="button" onClick={onExportVouchers} disabled={!selectedIspId}>
            Exporter CSV
          </button>
        </form>

        <form className="panel" onSubmit={onRedeemVoucher}>
          <h2>Utiliser un bon</h2>
          <input
            placeholder="Code du bon"
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
            Utiliser par téléphone (FAI = locataire sélectionné)
          </label>
          {voucherRedeemForm.redeemByPhone ? (
            <input
              placeholder="Téléphone client (chiffres, indicatif)"
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
              <option value="">Choisir un client</option>
              {customers.map((cst) => (
                <option key={cst.id} value={cst.id}>
                  {cst.fullName}
                </option>
              ))}
            </select>
          )}
          <input
            type="password"
            placeholder="Mot de passe portail (obligatoire si absent, min. 6 car.)"
            value={voucherRedeemForm.newPassword}
            onChange={(e) => setVoucherRedeemForm({ ...voucherRedeemForm, newPassword: e.target.value })}
          />
          <button type="submit" disabled={!selectedIspId}>
            Utiliser le bon
          </button>
          <h3>Derniers bons</h3>
          {vouchers.slice(0, 12).map((v) => (
            <p key={v.id}>
              {v.code} - {v.rateLimit} - {v.durationDays}d - devices {v.maxDevices ?? 1} - {v.status}
            </p>
          ))}
        </form>
      </section>

      <section className="grid">
        <section className="panel">
          <h2>Formule plateforme (facturation SaaS)</h2>
          <form onSubmit={onCreatePlatformSubscription}>
            <select
              value={platformSubForm.packageId}
              onChange={(e) => setPlatformSubForm({ ...platformSubForm, packageId: e.target.value })}
            >
              <option value="">Choisir une formule</option>
              {platformPackages.map((pkg) => (
                <option key={pkg.id} value={pkg.id}>
                  {pkg.name} (${pkg.monthlyPriceUsd}/month)
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
            <button type="submit" disabled={!selectedIspId || user.role !== "super_admin"}>
              Attribuer la formule
            </button>
          </form>
          {platformSubscriptions.map((sub) => (
            <p key={sub.id}>
              {sub.packageName} ({sub.status}) jusqu'au {new Date(sub.endsAt).toLocaleDateString("fr-FR")}
            </p>
          ))}
        </section>
      </section>

      <section className="grid">
        {(user.role === "super_admin" || user.role === "company_manager" || user.role === "isp_admin") && (
          <form className="panel" onSubmit={onCreateUser}>
            <h2>Créer un utilisateur équipe</h2>
            <input
              placeholder="Nom complet"
              value={userForm.fullName}
              onChange={(e) => setUserForm({ ...userForm, fullName: e.target.value })}
            />
            <input
              placeholder="E-mail"
              value={userForm.email}
              onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
            />
            <input
              placeholder="Mot de passe temporaire"
              type="password"
              value={userForm.password}
              onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
            />
            <select
              value={userForm.role}
              onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
            >
              {user.role === "super_admin" && (
                <option value="company_manager">Dirigeant entreprise (company_manager)</option>
              )}
              <option value="isp_admin">Administrateur FAI (isp_admin)</option>
              <option value="billing_agent">Agent facturation (billing_agent)</option>
              <option value="noc_operator">Opérateur NOC (noc_operator)</option>
              <option value="field_agent">Agent terrain (field_agent)</option>
            </select>
            <select
              value={userForm.accreditationLevel}
              onChange={(e) =>
                setUserForm({ ...userForm, accreditationLevel: e.target.value })
              }
            >
              <option value="basic">Basique</option>
              <option value="standard">Standard</option>
              <option value="senior">Senior</option>
              <option value="manager">Manager</option>
            </select>
            <button type="submit" disabled={!selectedIspId}>
              Créer l'utilisateur
            </button>
          </form>
        )}

        <section className="panel">
          <h2>Équipe du FAI</h2>
          {(user.role === "super_admin" || user.role === "company_manager" || user.role === "isp_admin") && (
            <div style={{ marginBottom: 16 }}>
              <h3>Import / export équipe (CSV)</h3>
              <p>
                Téléchargez les comptes pour sauvegarde ou importez avec les colonnes : fullName, email, role, mot de
                passe facultatif. Les lignes sans mot de passe utilisent le défaut ci-dessous (min. 6 caractères).
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <button type="button" onClick={onDownloadTeamUsersCsv} disabled={!selectedIspId}>
                  Télécharger le CSV équipe
                </button>
                <button type="button" onClick={() => api.downloadTeamImportTemplate()}>
                  Télécharger le modèle d'import
                </button>
              </div>
              <p style={{ marginTop: 8, fontSize: "0.9em", color: "#444" }}>
                Modèle : ligne d'en-tête uniquement — <code>fullName,email,role,password,accreditationLevel</code>.
                Mot de passe vide = défaut ci-dessous ; rôle vide = rôle par défaut.
              </p>
              <form onSubmit={onImportTeamUsersCsv} style={{ marginTop: 12 }}>
                <input ref={teamCsvInputRef} type="file" accept=".csv,text/csv" />
                <input
                  type="password"
                  placeholder="Mot de passe par défaut pour les lignes sans (min. 6)"
                  value={teamImportPassword}
                  onChange={(e) => setTeamImportPassword(e.target.value)}
                />
                <select value={teamImportRole} onChange={(e) => setTeamImportRole(e.target.value)}>
                  {user.role === "super_admin" && (
                    <option value="company_manager">Dirigeant entreprise (company_manager)</option>
                  )}
                  <option value="isp_admin">Administrateur FAI (isp_admin)</option>
                  <option value="billing_agent">Agent facturation (billing_agent)</option>
                  <option value="noc_operator">Opérateur NOC (noc_operator)</option>
                  <option value="field_agent">Agent terrain (field_agent)</option>
                </select>
                <button type="submit" disabled={!selectedIspId}>
                  Importer le CSV équipe
                </button>
              </form>
              {teamImportReport ? (
                <CsvImportResultBlock
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
                Dernier lien d'invitation : <code>{generatedInvite.inviteLink}</code>
              </p>
              <p>
                Jeton : <code>{generatedInvite.token}</code>
              </p>
              <p>Expire : {generatedInvite.expiresIn}</p>
            </div>
          )}
          {users.map((item) => (
            <p key={item.id}>
              {item.fullName} ({item.role}) — {item.email} [{item.isActive ? "actif" : "inactif"}]{" "}
              {item.accreditationLevel ? `(${item.accreditationLevel})` : ""}{" "}
              {(user.role === "super_admin" || user.role === "company_manager" || user.role === "isp_admin") && (
                <>
                  <button onClick={() => onResetPassword(item.id)}>Réinitialiser le mot de passe</button>{" "}
                  <button onClick={() => onCreateInvite(item.id)}>Créer une invitation</button>{" "}
                  {item.isActive && (
                    <button onClick={() => onDeactivateUser(item.id)}>Désactiver</button>
                  )}
                  {!item.isActive && (
                    <button onClick={() => onReactivateUser(item.id)}>Réactiver</button>
                  )}
                </>
              )}
            </p>
          ))}
        </section>
      </section>

      <section className="panel">
        <h2>Journal d'audit récent</h2>
        {auditLogs.slice(0, 12).map((log) => (
          <p key={log.id}>
            {new Date(log.createdAt).toLocaleString()} - {log.action} ({log.entityType})
          </p>
        ))}
      </section>

      <section className="panel">
        <h2>File d'attente des notifications</h2>
        <p>
          En file : {notificationOutbox.filter((row) => row.status === "queued").length} | Envoyé :{" "}
          {notificationOutbox.filter((row) => row.status === "sent").length} | Échec :{" "}
          {notificationOutbox.filter((row) => row.status === "failed").length}
        </p>
        <button onClick={onProcessNotificationOutbox} disabled={!selectedIspId}>
          Traiter la file maintenant
        </button>
        {notificationOutbox.slice(0, 12).map((row) => (
          <p key={row.id}>
            {new Date(row.createdAt).toLocaleString()} - {row.templateKey} via {row.channel} ({row.status})
            {row.lastError ? ` - ${row.lastError}` : ""}
          </p>
        ))}
      </section>

      <section className="panel">
        <h2>Envoyer une notification de test</h2>
        <form onSubmit={onSendTestNotification}>
          <select
            value={notificationTestForm.channel}
            onChange={(e) =>
              setNotificationTestForm({ ...notificationTestForm, channel: e.target.value })
            }
          >
            <option value="sms">SMS</option>
            <option value="email">E-mail</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
          <input
            placeholder="Destinataire (téléphone ou e-mail)"
            value={notificationTestForm.recipient}
            onChange={(e) =>
              setNotificationTestForm({ ...notificationTestForm, recipient: e.target.value })
            }
          />
          <input
            placeholder="Message"
            value={notificationTestForm.message}
            onChange={(e) =>
              setNotificationTestForm({ ...notificationTestForm, message: e.target.value })
            }
          />
          <button type="submit" disabled={!selectedIspId}>
            Envoyer le test
          </button>
        </form>
      </section>

      <section className="grid metrics">
        <Card title="Clients" value={dashboard?.totalCustomers ?? 0} />
        <Card title="Abonnements actifs" value={dashboard?.activeSubscriptions ?? 0} />
        <Card title="Factures impayées" value={dashboard?.unpaidInvoices ?? 0} />
        <Card title="Chiffre d'affaires (USD)" value={dashboard?.revenueUsd ?? 0} />
      </section>

      <section className="grid metrics">
        <Card title="Cash encaissé (USD)" value={dashboard?.cashbox?.cashUsd ?? 0} />
        <Card title="TID validés (USD)" value={dashboard?.cashbox?.tidUsd ?? 0} />
        <Card title="Mobile Money Pawapay (USD)" value={dashboard?.cashbox?.mobileMoneyUsd ?? 0} />
        <Card title="Retirable Mobile Money (USD)" value={dashboard?.cashbox?.withdrawableMobileMoneyUsd ?? 0} />
      </section>

      {(user.role === "super_admin" || user.role === "company_manager" || user.role === "isp_admin") && (
        <section className="panel">
          <h2>Retrait Mobile Money sécurisé</h2>
          <p>
            Les retraits sont limités aux paiements Mobile Money confirmés via Pawapay. Les encaissements cash et TID
            manuel restent visibles dans les statistiques, mais ne sont pas retirables depuis le compte Pawapay.
          </p>
          <section className="panel" style={{ background: "#f8f9fb" }}>
            <h3>Google Authenticator</h3>
            <p>
              Statut : {user.mfaTotpEnabled ? "configuré" : "non configuré"}. Scannez l'URL otpauth avec Google
              Authenticator/Authy, puis validez avec le code à 6 chiffres.
            </p>
            <button type="button" onClick={onStartTotpSetup} disabled={totpSetupLoading}>
              {user.mfaTotpEnabled ? "Regénérer le secret MFA" : "Configurer Google Authenticator"}
            </button>
            {totpSetup ? (
              <form onSubmit={onEnableTotp}>
                <input readOnly value={totpSetup.secret || ""} />
                <input readOnly value={totpSetup.otpauthUrl || ""} />
                <input
                  placeholder="Code Google Authenticator"
                  value={totpSetupCode}
                  onChange={(e) => setTotpSetupCode(e.target.value)}
                />
                <button type="submit">Activer MFA</button>
              </form>
            ) : null}
          </section>
          <form onSubmit={onCreateWithdrawal}>
            <input
              type="number"
              min={withdrawalForm.currency === "CDF" ? "1000" : "0.5"}
              step="0.01"
              placeholder={withdrawalForm.currency === "CDF" ? "Montant à retirer (CDF)" : "Montant à retirer (USD)"}
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
              Le solde retirable est suivi en USD. Si vous choisissez CDF, le montant est converti au taux plateforme
              avant comparaison, puis envoyé à Pawapay en CDF.
            </p>
            <input
              placeholder="Téléphone bénéficiaire"
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
              placeholder="Code Google Authenticator"
              value={withdrawalForm.mfaCode}
              onChange={(e) => setWithdrawalForm({ ...withdrawalForm, mfaCode: e.target.value })}
            />
            <button type="submit" disabled={!selectedIspId || !user.mfaTotpEnabled}>
              Valider le retrait
            </button>
          </form>
          {withdrawals.slice(0, 8).map((w) => (
            <p key={w.id}>
              {new Date(w.createdAt).toLocaleString()} — {w.amountUsd} {w.currency} vers {w.phoneNumber} ({w.provider}) —{" "}
              {w.status}
              {w.failureMessage ? ` — ${w.failureMessage}` : ""}
            </p>
          ))}
        </section>
      )}

      {(user.role === "super_admin" ||
        user.role === "company_manager" ||
        user.role === "isp_admin" ||
        user.role === "billing_agent" ||
        user.role === "noc_operator") && (
        <section className="expenses-section">
          <h2>Dépenses &amp; suivi des fonds</h2>
          <p className="expenses-lead">
            Enregistrez les dépenses par rapport aux encaissements sur une période. Catégories : versements agents
            (fixe ou pourcentage), équipement, exploitation, etc., pour une vision claire des sorties de trésorerie.
          </p>
          <div className="expenses-filter">
            <label>
              Du
              <input
                type="date"
                value={expenseFilter.from}
                onChange={(e) => setExpenseFilter({ ...expenseFilter, from: e.target.value })}
              />
            </label>
            <label>
              Au
              <input
                type="date"
                value={expenseFilter.to}
                onChange={(e) => setExpenseFilter({ ...expenseFilter, to: e.target.value })}
              />
            </label>
            <button type="button" disabled={!selectedIspId} onClick={() => refresh()}>
              Appliquer la période
            </button>
          </div>
          {expenseSummary ? (
            <div className="expenses-summary">
              <div className="expenses-summary-card expenses-summary-card--green">
                <span>Encaissé (paiements confirmés)</span>
                <strong>
                  {(expenseSummary.collectionsInPeriodUsd ?? 0).toLocaleString(undefined, {
                    style: "currency",
                    currency: "USD"
                  })}
                </strong>
              </div>
              <div className="expenses-summary-card">
                <span>Total dépenses (saisies)</span>
                <strong>
                  {(expenseSummary.totalExpensesUsd ?? 0).toLocaleString(undefined, {
                    style: "currency",
                    currency: "USD"
                  })}
                </strong>
              </div>
              <div className="expenses-summary-card">
                <span>Net (encaissements − dépenses)</span>
                <strong>
                  {(
                    (expenseSummary.collectionsInPeriodUsd ?? 0) - (expenseSummary.totalExpensesUsd ?? 0)
                  ).toLocaleString(undefined, {
                    style: "currency",
                    currency: "USD"
                  })}
                </strong>
              </div>
            </div>
          ) : null}
          <div className="expenses-layout">
            {(user.role === "super_admin" ||
              user.role === "company_manager" ||
              user.role === "isp_admin") && (
              <form className="panel expenses-form" onSubmit={onCreateExpense}>
                <h3>Nouvelle dépense</h3>
                <label style={{ display: "block", marginBottom: 8, fontSize: "0.85rem", color: "var(--mb-muted)" }}>
                  Catégorie
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
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Montant (USD)"
                  value={expenseForm.amountUsd}
                  onChange={(e) => setExpenseForm({ ...expenseForm, amountUsd: e.target.value })}
                />
                <input
                  placeholder="Description (facultatif)"
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
                  <label style={{ flex: "1 1 140px", fontSize: "0.85rem", color: "var(--mb-muted)" }}>
                    Début de période
                    <input
                      type="date"
                      style={{ display: "block", width: "100%", marginTop: 4 }}
                      value={expenseForm.periodStart}
                      onChange={(e) => setExpenseForm({ ...expenseForm, periodStart: e.target.value })}
                    />
                  </label>
                  <label style={{ flex: "1 1 140px", fontSize: "0.85rem", color: "var(--mb-muted)" }}>
                    Fin de période
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
                    Aligner sur le rapport
                  </button>
                </div>
                {(expenseForm.category === "field_agent_fixed" ||
                  expenseForm.category === "field_agent_percentage") && (
                  <>
                    <label style={{ display: "block", marginTop: 10, fontSize: "0.85rem", color: "var(--mb-muted)" }}>
                      Agent terrain
                      <select
                        style={{ display: "block", width: "100%", marginTop: 4 }}
                        value={expenseForm.fieldAgentId}
                        onChange={(e) => setExpenseForm({ ...expenseForm, fieldAgentId: e.target.value })}
                      >
                        <option value="">Choisir un agent</option>
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
                        placeholder="Commission % (base CA ou encaissements)"
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
                  placeholder="Base CA USD (facultatif, traçabilité)"
                  value={expenseForm.revenueBasisUsd}
                  onChange={(e) => setExpenseForm({ ...expenseForm, revenueBasisUsd: e.target.value })}
                />
                <button type="submit" disabled={!selectedIspId}>
                  Enregistrer la dépense
                </button>
              </form>
            )}
            <div className="panel expenses-list">
              <h3>Lignes sur la période</h3>
              {expenses.length === 0 ? (
                <p style={{ color: "var(--mb-muted)", fontSize: "0.9rem" }}>
                  Aucune dépense ne chevauche ces dates, ou les données se chargent encore.
                </p>
              ) : (
                expenses.map((ex) => (
                  <div key={ex.id} className="expenses-row">
                    <div>
                      <strong>
                        {(ex.amountUsd ?? 0).toLocaleString(undefined, { style: "currency", currency: "USD" })}
                      </strong>{" "}
                      — {expenseCategoryLabel(ex.category)}
                    </div>
                    {ex.description ? <div>{ex.description}</div> : null}
                    <div className="expenses-row-meta">
                      Période {ex.periodStart} → {ex.periodEnd}
                      {ex.fieldAgentName ? ` · Agent : ${ex.fieldAgentName}` : ""}
                      {ex.category === "field_agent_percentage" && ex.agentPayoutPercent != null
                        ? ` · ${ex.agentPayoutPercent}%`
                        : ""}
                      {ex.revenueBasisUsd != null
                        ? ` · Base CA ${Number(ex.revenueBasisUsd).toLocaleString(undefined, {
                            style: "currency",
                            currency: "USD"
                          })}`
                        : ""}
                      {ex.createdByName ? ` · Saisi par ${ex.createdByName}` : ""}
                    </div>
                    {(user.role === "super_admin" ||
                      user.role === "company_manager" ||
                      user.role === "isp_admin") && (
                      <button
                        type="button"
                        className="btn-expense-delete"
                        disabled={!selectedIspId}
                        onClick={() => onDeleteExpense(ex.id)}
                      >
                        Supprimer
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      )}

      <section className="grid">
        <form className="panel" onSubmit={onCreateCustomer}>
          <h2>Créer un client</h2>
          <input
            placeholder="Nom complet"
            value={customerForm.fullName}
            onChange={(e) => setCustomerForm({ ...customerForm, fullName: e.target.value })}
          />
          <input
            placeholder="Téléphone (+243…)"
            value={customerForm.phone}
            onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
          />
          <input
            placeholder="E-mail pour les renouvellements (facultatif)"
            value={customerForm.email}
            onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
          />
          <input
            type="password"
            placeholder="Mot de passe portail initial (facultatif, min. 6 car.)"
            value={customerForm.initialPassword}
            onChange={(e) => setCustomerForm({ ...customerForm, initialPassword: e.target.value })}
          />
          <button type="submit" disabled={!selectedIspId}>
            Enregistrer le client
          </button>
        </form>

        <div className="panel">
          <h2>Import / export clients (CSV)</h2>
          <p>
            Téléchargez votre liste d'abonnés ou importez depuis un autre outil ou un export MikroTik (colonnes du
            type nom, secret → nom abonné et mot de passe portail facultatif). Les doublons de téléphone pour ce FAI
            sont ignorés.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <button type="button" onClick={onDownloadCustomersCsv} disabled={!selectedIspId}>
              Télécharger le CSV clients
            </button>
            <button type="button" onClick={() => api.downloadCustomerImportTemplate()}>
              Télécharger le modèle d'import
            </button>
          </div>
          <p style={{ marginTop: 8, fontSize: "0.9em", color: "#444" }}>
            Modèle : ligne d'en-tête uniquement — <code>fullName,phone,email,password</code>. E-mail et mot de passe
            facultatifs par ligne (utilisez le mot de passe par défaut ci-dessous si vide). MikroTik exporte souvent{" "}
            <code>name</code> — copiez dans <code>fullName</code> et <code>phone</code> ou renommez l'en-tête pour
            correspondre.
          </p>
          <form onSubmit={onImportCustomersCsv} style={{ marginTop: 12 }}>
            <input ref={customerCsvInputRef} type="file" accept=".csv,text/csv" />
            <input
              type="password"
              placeholder="Mot de passe portail par défaut pour les lignes sans (facultatif, min. 6 car.)"
              value={customerImportPassword}
              onChange={(e) => setCustomerImportPassword(e.target.value)}
            />
            <button type="submit" disabled={!selectedIspId}>
              Importer CSV
            </button>
          </form>
          {customerImportReport ? (
            <CsvImportResultBlock
              createdCount={customerImportReport.createdCount}
              skipped={customerImportReport.skipped}
              errors={customerImportReport.errors}
              onDismiss={() => setCustomerImportReport(null)}
            />
          ) : null}
        </div>

        <form className="panel" onSubmit={onPatchCustomerEmail}>
          <h2>Mettre à jour l'e-mail client</h2>
          <p>Pour les e-mails de facturation de renouvellement lorsque le canal utilise SMTP.</p>
          <select
            value={customerEmailForm.customerId}
            onChange={(e) => setCustomerEmailForm({ ...customerEmailForm, customerId: e.target.value })}
          >
            <option value="">Choisir un client</option>
            {customers.map((cst) => (
              <option key={cst.id} value={cst.id}>
                {cst.fullName}
                {cst.email ? ` (${cst.email})` : ""}
              </option>
            ))}
          </select>
          <input
            placeholder="E-mail (vide = effacer)"
            value={customerEmailForm.email}
            onChange={(e) => setCustomerEmailForm({ ...customerEmailForm, email: e.target.value })}
          />
          <button type="submit" disabled={!selectedIspId || !customerEmailForm.customerId}>
            Enregistrer l'e-mail
          </button>
        </form>

        {(user.role === "super_admin" ||
          user.role === "company_manager" ||
          user.role === "isp_admin" ||
          user.role === "billing_agent" ||
          user.role === "field_agent") && (
          <form className="panel" onSubmit={onIssuePortalToken}>
            <h2>Portail libre-service client</h2>
            <p>
              Générez un lien limité dans le temps pour consulter les factures et envoyer une TID Mobile Money.
            </p>
            <select
              value={portalTokenForm.customerId}
              onChange={(e) =>
                setPortalTokenForm({ ...portalTokenForm, customerId: e.target.value })
              }
            >
              <option value="">Choisir un client</option>
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
              title="Validité du lien en jours"
              value={portalTokenForm.expiresDays}
              onChange={(e) =>
                setPortalTokenForm({ ...portalTokenForm, expiresDays: e.target.value })
              }
            />
            <button type="submit" disabled={!selectedIspId}>
              Générer le lien portail
            </button>
            {lastPortalIssue?.portalUrl && (
              <p>
                <strong>Lien :</strong>{" "}
                <a href={lastPortalIssue.portalUrl} target="_blank" rel="noreferrer">
                  {lastPortalIssue.portalUrl}
                </a>
              </p>
            )}
            {lastPortalIssue?.expiresAt && (
              <p>
                <small>Expire le {new Date(lastPortalIssue.expiresAt).toLocaleString("fr-FR")}</small>
              </p>
            )}
          </form>
        )}

        <form className="panel" onSubmit={onCreatePlan}>
          <h2>Créer une formule Wi‑Fi / accès</h2>
          <input
            placeholder="Nom"
            value={planForm.name}
            onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
          />
          <input
            type="number"
            placeholder="Prix (USD)"
            value={planForm.priceUsd}
            onChange={(e) => setPlanForm({ ...planForm, priceUsd: e.target.value })}
          />
          <input
            type="number"
            placeholder="Durée (jours)"
            value={planForm.durationDays}
            onChange={(e) => setPlanForm({ ...planForm, durationDays: e.target.value })}
          />
          <input
            placeholder="Libellé débit affiché aux clients (ex. 20 Mbps)"
            value={planForm.speedLabel}
            onChange={(e) => setPlanForm({ ...planForm, speedLabel: e.target.value })}
          />
          <input
            placeholder="Limite technique (ex. 10M/10M)"
            value={planForm.rateLimit}
            onChange={(e) => setPlanForm({ ...planForm, rateLimit: e.target.value })}
          />
          <select
            value={planForm.defaultAccessType}
            onChange={(e) => setPlanForm({ ...planForm, defaultAccessType: e.target.value })}
          >
            <option value="pppoe">PPPoE</option>
            <option value="hotspot">Hotspot</option>
          </select>
          <input
            type="number"
            min={1}
            placeholder="Nombre max d'appareils"
            value={planForm.maxDevices}
            onChange={(e) => setPlanForm({ ...planForm, maxDevices: e.target.value })}
          />
          <select
            value={planForm.availabilityStatus}
            onChange={(e) => setPlanForm({ ...planForm, availabilityStatus: e.target.value })}
          >
            <option value="available">Disponible (pas épuisé)</option>
            <option value="unavailable">Indisponible (masqué à l'achat)</option>
          </select>
          <label>
            <input
              type="checkbox"
              checked={planForm.isPublished}
              onChange={(e) => setPlanForm({ ...planForm, isPublished: e.target.checked })}
            />{" "}
            Afficher sur la page d'achat Wi‑Fi publique
          </label>
          <input
            placeholder="URL après paiement (facultatif, sinon défaut FAI ou Google)"
            value={planForm.successRedirectUrl}
            onChange={(e) => setPlanForm({ ...planForm, successRedirectUrl: e.target.value })}
          />
          <button type="submit" disabled={!selectedIspId}>
            Enregistrer la formule
          </button>
          {selectedIspId && (
            <p>
              <small>
                Lien invité :{" "}
                <code>
                  {typeof window !== "undefined"
                    ? `${window.location.origin}/wifi?ispId=${selectedIspId}`
                    : "/wifi?ispId=…"}
                </code>
              </small>
            </p>
          )}
        </form>

        <form className="panel" onSubmit={onSavePlanPatch}>
          <h2>Modifier une formule</h2>
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
            <option value="">Choisir une formule à modifier…</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </select>
          <input
            placeholder="Nom"
            value={planEditForm.name}
            onChange={(e) => setPlanEditForm({ ...planEditForm, name: e.target.value })}
          />
          <input
            type="number"
            placeholder="Prix USD"
            value={planEditForm.priceUsd}
            onChange={(e) => setPlanEditForm({ ...planEditForm, priceUsd: e.target.value })}
          />
          <input
            type="number"
            placeholder="Durée (jours)"
            value={planEditForm.durationDays}
            onChange={(e) => setPlanEditForm({ ...planEditForm, durationDays: e.target.value })}
          />
          <input
            placeholder="Libellé débit"
            value={planEditForm.speedLabel}
            onChange={(e) => setPlanEditForm({ ...planEditForm, speedLabel: e.target.value })}
          />
          <input
            placeholder="Limite de débit"
            value={planEditForm.rateLimit}
            onChange={(e) => setPlanEditForm({ ...planEditForm, rateLimit: e.target.value })}
          />
          <select
            value={planEditForm.defaultAccessType}
            onChange={(e) => setPlanEditForm({ ...planEditForm, defaultAccessType: e.target.value })}
          >
            <option value="pppoe">PPPoE</option>
            <option value="hotspot">Hotspot</option>
          </select>
          <input
            type="number"
            min={1}
            placeholder="Appareils max"
            value={planEditForm.maxDevices}
            onChange={(e) => setPlanEditForm({ ...planEditForm, maxDevices: e.target.value })}
          />
          <select
            value={planEditForm.availabilityStatus}
            onChange={(e) => setPlanEditForm({ ...planEditForm, availabilityStatus: e.target.value })}
          >
            <option value="available">Disponible</option>
            <option value="unavailable">Indisponible</option>
          </select>
          <label>
            <input
              type="checkbox"
              checked={planEditForm.isPublished}
              onChange={(e) => setPlanEditForm({ ...planEditForm, isPublished: e.target.checked })}
            />{" "}
            Publié sur la page Wi‑Fi
          </label>
          <input
            placeholder="URL après paiement"
            value={planEditForm.successRedirectUrl}
            onChange={(e) => setPlanEditForm({ ...planEditForm, successRedirectUrl: e.target.value })}
          />
          <button type="submit" disabled={!selectedIspId || !planEditForm.planId}>
            Enregistrer les modifications
          </button>
        </form>

        <form className="panel" onSubmit={onCreateSubscription}>
          <h2>Créer un abonnement</h2>
          <select
            value={subForm.customerId}
            onChange={(e) => setSubForm({ ...subForm, customerId: e.target.value })}
          >
            <option value="">Choisir un client</option>
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
            <option value="">Choisir une formule</option>
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
            <option value="hotspot">Hotspot</option>
          </select>
          <button type="submit" disabled={!selectedIspId}>
            Activer l'abonnement
          </button>
        </form>
      </section>

      <section className="panel">
        <h2>Factures</h2>
        <div className="table">
          <div className="row header">
            <span>ID</span>
            <span>Montant</span>
            <span>Statut</span>
            <span>Action</span>
          </div>
          {invoices.map((invoice) => (
            <div className="row" key={invoice.id}>
              <span>{invoice.id.slice(0, 8)}</span>
              <span>${invoice.amountUsd}</span>
              <span>{invoice.status}</span>
              <span>
                {invoice.status === "unpaid" || invoice.status === "overdue" ? (
                  <button onClick={() => onMarkPaid(invoice.id, invoice.amountUsd)}>Marquer payée</button>
                ) : (
                  "Payée"
                )}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Abonnements</h2>
        {subscriptions.map((subscription) => (
          <p key={subscription.id}>
            {subscription.id.slice(0, 8)} - {subscription.status} ({subscription.accessType || "pppoe"})
            {subscription.maxSimultaneousDevices != null
              ? ` — appareils ${subscription.maxSimultaneousDevices}`
              : ""}{" "}
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
          </p>
        ))}
      </section>

      <footer className="app-footer">
        <span className="app-footer-brand">McBuleli</span>
        <span className="app-footer-note">Facturation FAI &amp; opérations réseau</span>
      </footer>
    </main>
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
