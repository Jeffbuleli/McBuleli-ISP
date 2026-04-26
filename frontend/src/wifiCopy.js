const STR = {
  fr: {
    eyebrow: "Wi‑Fi invité McBuleli",
    heroTitle: "Achetez un pass internet en quelques secondes.",
    heroLead:
      "Choisissez une offre, payez par Mobile Money, puis profitez de l'accès Hotspot ou PPPoE de votre opérateur.",
    stepPick: "Choisir l'offre",
    stepPay: "Valider Mobile Money",
    stepOn: "Accès activé",
    catalogLead: "Catalogue Wi‑Fi invité, paiement Mobile Money et redirection automatique.",
    accessTitle: "Accéder à votre FAI",
    accessLead: "Saisissez l'identifiant FAI (UUID) communiqué par votre opérateur.",
    ispPh: "Identifiant FAI (UUID fourni par l'opérateur)",
    showPlans: "Afficher les offres",
    postPayTitle: "Créer votre mot de passe portail",
    postPayHelp:
      "Sur la page portail client, utilisez Première connexion, collez ce jeton, puis définissez un mot de passe pour vous connecter plus tard avec votre téléphone.",
    openPortal: "Ouvrir le portail client",
    continueWifi: "Continuer vers le Wi‑Fi / redirection",
    noPlans: "Aucune offre publique pour le moment. Demandez à l'opérateur de publier une formule.",
    close: "Fermer",
    payMobileTitle: "Payer par Mobile Money",
    phoneLabel: "Numéro de téléphone (chiffres, indicatif pays, sans +)",
    phonePh: "243…",
    network: "Réseau",
    paySubmit: "Payer et valider",
    paying: "En attente du paiement…",
    payFoot:
      "Après validation vous serez redirigé (par défaut vers Google). Votre FAI peut définir un lien personnalisé dans McBuleli ou par formule.",
    daySingular: "jour",
    dayPlural: "jours",
    speed: "Débit",
    type: "Type",
    devices: "Appareils",
    errPhone: "Indiquez un numéro mobile valide (indicatif pays, chiffres uniquement).",
    noticePhone: "Vérifiez votre téléphone : une demande de validation peut apparaître.",
    noticePostPay:
      "Paiement confirmé. Copiez le jeton ci-dessous, ouvrez le portail client de votre opérateur et définissez un mot de passe avant de quitter cette page.",
    errPayFailed: "Paiement refusé ou annulé. Vous pouvez réessayer.",
    errPayStart: "Impossible de démarrer le paiement."
  },
  en: {
    eyebrow: "McBuleli guest Wi‑Fi",
    heroTitle: "Buy an internet pass in seconds.",
    heroLead:
      "Pick a plan, pay with Mobile Money, then enjoy Hotspot or PPPoE access from your provider.",
    stepPick: "Choose a plan",
    stepPay: "Confirm Mobile Money",
    stepOn: "Access enabled",
    catalogLead: "Guest Wi‑Fi catalog, Mobile Money checkout and automatic redirect.",
    accessTitle: "Open your ISP catalog",
    accessLead: "Enter the ISP ID (UUID) shared by your provider.",
    ispPh: "ISP ID (UUID from your provider)",
    showPlans: "Show plans",
    postPayTitle: "Create your portal password",
    postPayHelp:
      "On the customer portal page, use First-time setup, paste this token, then set a password so you can sign in later with your phone.",
    openPortal: "Open customer portal",
    continueWifi: "Continue to Wi‑Fi / redirect",
    noPlans: "No public plans yet. Ask your provider to publish a package.",
    close: "Close",
    payMobileTitle: "Pay with Mobile Money",
    phoneLabel: "Phone number (digits, country code, no +)",
    phonePh: "243…",
    network: "Network",
    paySubmit: "Pay and confirm",
    paying: "Waiting for payment…",
    payFoot:
      "After confirmation you will be redirected (default: Google). Your ISP can set a custom link in McBuleli or per plan.",
    daySingular: "day",
    dayPlural: "days",
    speed: "Speed",
    type: "Type",
    devices: "Devices",
    errPhone: "Enter a valid mobile number (country code, digits only).",
    noticePhone: "Check your phone—a confirmation prompt may appear.",
    noticePostPay:
      "Payment confirmed. Copy the token below, open your provider's customer portal and set a password before leaving this page.",
    errPayFailed: "Payment declined or cancelled. You can try again.",
    errPayStart: "Could not start payment."
  }
};

export function wifiT(lang, key) {
  const k = lang === "en" ? "en" : "fr";
  return STR[k][key] ?? STR.fr[key] ?? key;
}
