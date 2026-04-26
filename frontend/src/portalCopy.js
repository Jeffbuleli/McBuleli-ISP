const STR = {
  fr: {
    eyebrow: "Portail client",
    heroLead:
      "Consultez votre service internet, payez vos factures par Mobile Money et envoyez votre référence TID dans un espace simple, sécurisé et professionnel.",
    loginPhoneTitle: "Connexion par téléphone",
    loginPhoneHelp:
      "Indiquez l'identifiant FAI communiqué par votre opérateur, votre numéro enregistré (chiffres, indicatif pays) et votre mot de passe.",
    ispPlaceholder: "Identifiant FAI (UUID)",
    phonePlaceholder: "Téléphone (ex. 243990000111)",
    passwordPlaceholder: "Mot de passe",
    signIn: "Se connecter",
    firstSetupTitle: "Première connexion (achat Wi‑Fi ou bon)",
    firstSetupHelp:
      "Collez le jeton reçu après paiement ou indiqué sur votre bon, puis choisissez un mot de passe pour accéder au portail.",
    setupTokenPh: "Jeton de configuration",
    newPasswordPh: "Nouveau mot de passe (min. 6 caractères)",
    savePasswordSignIn: "Enregistrer le mot de passe et se connecter",
    linkTitle: "Lien de portail",
    linkHelp: "Collez le lien envoyé par votre opérateur, ou uniquement la partie jeton.",
    tokenPh: "Jeton de portail",
    openWithToken: "Ouvrir avec le jeton",
    signOut: "Déconnexion",
    subscriberSpace: "Espace abonné",
    hello: "Bonjour",
    phoneRegistered: "Téléphone enregistré",
    emailRegistered: "E-mail enregistré",
    clientRef: "Votre n° client",
    subscriptions: "Abonnements",
    invoices: "Factures",
    noSubscriptions: "Aucun abonnement pour le moment.",
    noInvoices: "Aucune facture.",
    until: "jusqu'au",
    due: "échéance",
    devicesUpTo: "jusqu'à",
    devicesSuffix: "appareil(s)",
    payMobileTitle: "Payer cette facture par Mobile Money",
    chooseOpenInvoice: "Choisir une facture ouverte",
    payerPhonePh: "Téléphone payeur (ex. 243990000111)",
    payInvoiceBtn: "Payer cette facture par Mobile Money",
    checkPayment: "Vérifier le paiement",
    tidTitle: "Envoyer la référence Mobile Money (TID)",
    tidPh: "Référence de transaction (TID)",
    yourPhoneOpt: "Votre téléphone (facultatif)",
    amountUsdOpt: "Montant USD (facultatif)",
    sendTid: "Envoyer la TID",
    errBootstrap:
      "Connectez-vous avec le téléphone et le mot de passe, collez un jeton de portail, ou terminez la création du mot de passe.",
    errNoSession: "Session abonné introuvable.",
    errTokenShort: "Collez un jeton de portail valide (au moins 16 caractères).",
    errNeedLogin: "Connectez-vous d'abord.",
    noticeTidSent: "Référence de transaction envoyée. Votre opérateur la vérifiera sous peu.",
    noticeMobileSent: "Demande envoyée au téléphone. Validez le PIN.",
    noticePwdSaved: "Mot de passe enregistré. Vous êtes connecté.",
    noticeMustPwd:
      "Connecté. Contactez votre opérateur si vous devez encore mettre à jour votre mot de passe.",
    paymentStatus: "Statut paiement",
    errMobileStart: "Impossible de démarrer le paiement Mobile Money.",
    errMobileCheck: "Impossible de vérifier le paiement Mobile Money.",
    brandFallbackTitle: "McBuleli — portail client"
  },
  en: {
    eyebrow: "Customer portal",
    heroLead:
      "Manage your internet service, pay invoices via Mobile Money and submit your payment reference (TID) in a simple, secure, professional space.",
    loginPhoneTitle: "Sign in with phone",
    loginPhoneHelp:
      "Enter the ISP ID from your provider, your registered phone number (digits, country code) and your password.",
    ispPlaceholder: "ISP ID (UUID)",
    phonePlaceholder: "Phone (e.g. 243990000111)",
    passwordPlaceholder: "Password",
    signIn: "Sign in",
    firstSetupTitle: "First-time setup (Wi‑Fi purchase or voucher)",
    firstSetupHelp:
      "Paste the token you received after payment (or on your voucher), then choose a password to access the portal.",
    setupTokenPh: "Setup token",
    newPasswordPh: "New password (min. 6 characters)",
    savePasswordSignIn: "Save password and sign in",
    linkTitle: "Portal link",
    linkHelp: "Paste the link from your provider, or only the token part.",
    tokenPh: "Portal token",
    openWithToken: "Open with token",
    signOut: "Sign out",
    subscriberSpace: "Subscriber area",
    hello: "Hello",
    phoneRegistered: "Registered phone",
    emailRegistered: "Registered email",
    clientRef: "Your client ID",
    subscriptions: "Subscriptions",
    invoices: "Invoices",
    noSubscriptions: "No subscriptions yet.",
    noInvoices: "No invoices.",
    until: "until",
    due: "due",
    devicesUpTo: "up to",
    devicesSuffix: "device(s)",
    payMobileTitle: "Pay this invoice with Mobile Money",
    chooseOpenInvoice: "Choose an open invoice",
    payerPhonePh: "Payer phone (e.g. 243990000111)",
    payInvoiceBtn: "Pay with Mobile Money",
    checkPayment: "Check payment",
    tidTitle: "Submit Mobile Money reference (TID)",
    tidPh: "Transaction reference (TID)",
    yourPhoneOpt: "Your phone (optional)",
    amountUsdOpt: "Amount USD (optional)",
    sendTid: "Submit TID",
    errBootstrap:
      "Sign in with phone and password, paste a portal token, or complete password setup.",
    errNoSession: "Subscriber session not found.",
    errTokenShort: "Paste a valid portal token (at least 16 characters).",
    errNeedLogin: "Please sign in first.",
    noticeTidSent: "Transaction reference sent. Your provider will verify it shortly.",
    noticeMobileSent: "Request sent to your phone. Approve with your PIN.",
    noticePwdSaved: "Password saved. You are signed in.",
    noticeMustPwd: "Signed in. Contact your provider if you still need to update your password.",
    paymentStatus: "Payment status",
    errMobileStart: "Could not start Mobile Money payment.",
    errMobileCheck: "Could not check Mobile Money payment.",
    brandFallbackTitle: "McBuleli — customer portal"
  }
};

export function portalT(lang, key) {
  const k = lang === "en" ? "en" : "fr";
  return STR[k][key] ?? STR.fr[key] ?? key;
}

export function portalBrandTitle(displayName, lang) {
  const s = displayName != null ? String(displayName).trim() : "";
  if (!s || s === "AA") return portalT(lang, "brandFallbackTitle");
  const suffix = lang === "en" ? " — customer portal" : " — portail client";
  return `${displayName}${suffix}`;
}
