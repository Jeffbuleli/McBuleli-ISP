import { useCallback, useEffect, useMemo, useState } from "react";
import { API_URL, api, publicAssetUrl } from "./api";

const SUBSCRIBER_JWT_KEY = "subscriberJwt";
const DEFAULT_PAWAPAY_NETWORKS = [
  { key: "orange", label: "Orange Money" },
  { key: "airtel", label: "Airtel Money" },
  { key: "mpesa", label: "M-Pesa (Vodacom)" }
];

function portalBrandTitle(displayName) {
  const s = displayName != null ? String(displayName).trim() : "";
  if (!s || s === "AA") return "McBuleli — portail client";
  return `${displayName} — portail client`;
}

function money(value, currency = "USD") {
  return Number(value || 0).toLocaleString("fr-FR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  });
}

function daysUntil(dateValue) {
  const t = new Date(dateValue).getTime();
  if (!Number.isFinite(t)) return "—";
  return Math.max(0, Math.ceil((t - Date.now()) / 86400000));
}

async function portalFetch(path, auth, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  if (auth?.type === "subscriber" && auth.jwt) {
    headers.Authorization = `Bearer ${auth.jwt}`;
  } else if (auth?.type === "opaque" && auth.token) {
    headers["X-Portal-Token"] = auth.token;
  }
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Request failed");
  }
  return response.json();
}

export default function Portal() {
  const initialOpaque = useMemo(() => {
    const q = new URLSearchParams(window.location.search).get("token");
    return q ? q.trim() : "";
  }, []);

  const [auth, setAuth] = useState(() => {
    if (initialOpaque && initialOpaque.length >= 16) {
      return { type: "opaque", token: initialOpaque };
    }
    const sj = typeof localStorage !== "undefined" ? localStorage.getItem(SUBSCRIBER_JWT_KEY) : "";
    if (sj) return { type: "subscriber", jwt: sj };
    return null;
  });

  const [tokenInput, setTokenInput] = useState(initialOpaque);
  const [ispIdInput, setIspIdInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [setupTokenInput, setSetupTokenInput] = useState("");
  const [setupPasswordInput, setSetupPasswordInput] = useState("");
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tidForm, setTidForm] = useState({ invoiceId: "", tid: "", submittedByPhone: "", amountUsd: "" });
  const [networks, setNetworks] = useState(DEFAULT_PAWAPAY_NETWORKS);
  const [mobilePayForm, setMobilePayForm] = useState({
    invoiceId: "",
    currency: "CDF",
    phoneNumber: "",
    networkKey: "orange"
  });
  const [mobilePaySession, setMobilePaySession] = useState(null);

  const loadSession = useCallback(async (a) => {
    setError("");
    setNotice("");
    if (!a || (a.type === "opaque" && (!a.token || a.token.length < 16))) {
      setSession(null);
      setError(
        "Connectez-vous avec le téléphone et le mot de passe, collez un jeton de portail, ou terminez la création du mot de passe."
      );
      return;
    }
    if (a.type === "subscriber" && !a.jwt) {
      setSession(null);
      setError("Session abonné introuvable.");
      return;
    }
    const data = await portalFetch("/portal/session", a);
    setSession(data);
    if (a.type === "opaque" && a.token) {
      const url = new URL(window.location.href);
      url.searchParams.set("token", a.token);
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  useEffect(() => {
    if (!auth) return;
    if (auth.type === "opaque" && auth.token.length < 16) return;
    if (auth.type === "subscriber" && !auth.jwt) return;
    loadSession(auth).catch((e) => setError(e.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- bootstrap from URL or stored subscriber JWT

  useEffect(() => {
    api.getPawapayNetworks().then((rows) => {
      if (Array.isArray(rows) && rows.length > 0) setNetworks(rows);
    }).catch(() => {});
  }, []);

  async function onOpenPortal(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    try {
      const t = tokenInput.trim();
      localStorage.removeItem(SUBSCRIBER_JWT_KEY);
      const next = t.length >= 16 ? { type: "opaque", token: t } : null;
      setAuth(next);
      if (!next) {
        setSession(null);
        setError("Collez un jeton de portail valide (au moins 16 caractères).");
        return;
      }
      await loadSession(next);
    } catch (err) {
      setError(err.message);
      setSession(null);
    }
  }

  async function onSubscriberLogin(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    try {
      const res = await api.subscriberLogin({
        ispId: ispIdInput.trim(),
        phone: phoneInput,
        password: passwordInput
      });
      localStorage.setItem(SUBSCRIBER_JWT_KEY, res.token);
      const next = { type: "subscriber", jwt: res.token };
      setAuth(next);
      setPasswordInput("");
      await loadSession(next);
      if (res.mustSetPassword) {
        setNotice("Connecté. Contactez votre opérateur si vous devez encore mettre à jour votre mot de passe.");
      }
    } catch (err) {
      setError(err.message);
      setSession(null);
    }
  }

  async function onSetupPassword(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    try {
      const res = await api.subscriberSetupPassword({
        setupToken: setupTokenInput.trim(),
        newPassword: setupPasswordInput
      });
      localStorage.setItem(SUBSCRIBER_JWT_KEY, res.token);
      const next = { type: "subscriber", jwt: res.token };
      setAuth(next);
      setSetupTokenInput("");
      setSetupPasswordInput("");
      setNotice("Mot de passe enregistré. Vous êtes connecté.");
      await loadSession(next);
    } catch (err) {
      setError(err.message);
    }
  }

  async function onSubmitTid(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!auth) {
      setError("Connectez-vous d'abord.");
      return;
    }
    try {
      await portalFetch("/portal/tid-submissions", auth, {
        method: "POST",
        body: JSON.stringify({
          invoiceId: tidForm.invoiceId,
          tid: tidForm.tid,
          submittedByPhone: tidForm.submittedByPhone || undefined,
          amountUsd: tidForm.amountUsd || undefined
        })
      });
      setNotice("Référence de transaction envoyée. Votre opérateur la vérifiera sous peu.");
      setTidForm({ invoiceId: "", tid: "", submittedByPhone: "", amountUsd: "" });
      await loadSession(auth);
    } catch (err) {
      setError(err.message);
    }
  }

  async function onStartMobileMoneyPayment(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!auth) return setError("Connectez-vous d'abord.");
    try {
      const res = await portalFetch("/portal/mobile-money/initiate", auth, {
        method: "POST",
        body: JSON.stringify(mobilePayForm)
      });
      setMobilePaySession(res);
      setNotice(res.message || "Demande envoyée au téléphone. Validez le PIN.");
    } catch (err) {
      setError(err.message || "Impossible de démarrer le paiement Mobile Money.");
    }
  }

  async function onCheckMobileMoneyPayment() {
    setError("");
    setNotice("");
    if (!auth || !mobilePaySession?.depositId) return;
    try {
      const res = await portalFetch(`/portal/mobile-money/status/${encodeURIComponent(mobilePaySession.depositId)}`, auth);
      setNotice(`Statut paiement : ${res.status}`);
      if (res.status === "completed") {
        setMobilePaySession(null);
        setMobilePayForm({ invoiceId: "", currency: "CDF", phoneNumber: "", networkKey: "orange" });
        await loadSession(auth);
      }
    } catch (err) {
      setError(err.message || "Impossible de vérifier le paiement Mobile Money.");
    }
  }

  function onSignOut() {
    localStorage.removeItem(SUBSCRIBER_JWT_KEY);
    setAuth(null);
    setSession(null);
    setTokenInput("");
    const url = new URL(window.location.href);
    url.searchParams.delete("token");
    window.history.replaceState({}, "", url.toString());
  }

  const brand = session?.branding;

  return (
    <main
      className="container portal-page"
      style={{
        color: brand?.secondaryColor || "#162030"
      }}
    >
      <header className="portal-hero">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {brand?.logoUrl ? (
            <img src={publicAssetUrl(brand.logoUrl)} alt="" style={{ height: 48 }} />
          ) : null}
          <div>
            <p className="eyebrow">Portail client</p>
            <h1 style={{ color: brand?.primaryColor || "#5d4037", margin: 0 }}>{portalBrandTitle(brand?.displayName)}</h1>
          </div>
        </div>
        <p>
          Consultez votre service internet, payez vos factures par Mobile Money et envoyez votre référence TID dans un
          espace simple, sécurisé et professionnel.
        </p>
      </header>

      {!session && (
        <section className="portal-login-grid">
          <form className="panel" onSubmit={onSubscriberLogin}>
            <h2>Connexion par téléphone</h2>
            <p>
              Indiquez l'identifiant FAI communiqué par votre opérateur, votre numéro enregistré (chiffres, indicatif
              pays) et votre mot de passe.
            </p>
            <input
              placeholder="Identifiant FAI (UUID)"
              value={ispIdInput}
              onChange={(e) => setIspIdInput(e.target.value)}
              style={{ width: "100%", maxWidth: 560 }}
            />
            <input
              placeholder="Téléphone (ex. 243990000111)"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              style={{ width: "100%", maxWidth: 560 }}
            />
            <input
              type="password"
              placeholder="Mot de passe"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              style={{ width: "100%", maxWidth: 560 }}
            />
            <button type="submit">Se connecter</button>
          </form>

          <form className="panel" onSubmit={onSetupPassword}>
            <h2>Première connexion (achat Wi‑Fi ou bon)</h2>
            <p>
              Collez le jeton reçu après paiement ou indiqué sur votre bon, puis choisissez un mot de passe pour accéder
              au portail.
            </p>
            <input
              placeholder="Jeton de configuration"
              value={setupTokenInput}
              onChange={(e) => setSetupTokenInput(e.target.value)}
              style={{ width: "100%", maxWidth: 560 }}
            />
            <input
              type="password"
              placeholder="Nouveau mot de passe (min. 6 caractères)"
              value={setupPasswordInput}
              onChange={(e) => setSetupPasswordInput(e.target.value)}
              style={{ width: "100%", maxWidth: 560 }}
            />
            <button type="submit">Enregistrer le mot de passe et se connecter</button>
          </form>

          <form className="panel" onSubmit={onOpenPortal}>
            <h2>Lien de portail</h2>
            <p>Collez le lien envoyé par votre opérateur, ou uniquement la partie jeton.</p>
            <input
              placeholder="Jeton de portail"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              style={{ width: "100%", maxWidth: 560 }}
            />
            <button type="submit">Ouvrir avec le jeton</button>
          </form>
        </section>
      )}

      {session && (
        <p style={{ marginBottom: 12 }}>
          <button type="button" onClick={onSignOut}>
            Déconnexion
          </button>
        </p>
      )}

      {error && <p className="error">{error}</p>}
      {notice && <p>{notice}</p>}

      {session && (
        <>
          <section className="public-section public-section--split">
            <div>
              <p className="eyebrow">Espace abonné</p>
              <h2>Bonjour, {session.customer.fullName}</h2>
              <p>Téléphone enregistré : {session.customer.phone}</p>
              {session.customer.email ? <p>E-mail enregistré : {session.customer.email}</p> : null}
            </div>
            <div className="demo-board">
              <div className="demo-board-row">
                <span>Abonnements</span>
                <b>{session.subscriptions.length}</b>
              </div>
              <div className="demo-board-row">
                <span>Factures</span>
                <b>{session.invoices.length}</b>
              </div>
            </div>
          </section>

          <section className="portal-login-grid">
            <div className="panel">
              <h2>Abonnements</h2>
              {session.subscriptions.length === 0 ? (
                <p>Aucun abonnement pour le moment.</p>
              ) : (
                session.subscriptions.map((s) => (
                  <p key={s.id}>
                    {s.id.slice(0, 8)} — {s.status} ({s.accessType}) jusqu'au{" "}
                    {new Date(s.endDate).toLocaleDateString("fr-FR")}
                    {s.maxSimultaneousDevices != null ? ` — jusqu'à ${s.maxSimultaneousDevices} appareil(s)` : ""}
                  </p>
                ))
              )}
            </div>

            <div className="panel">
              <h2>Factures</h2>
              {session.invoices.length === 0 ? (
                <p>Aucune facture.</p>
              ) : (
                session.invoices.map((inv) => (
                  <p key={inv.id}>
                    {inv.id.slice(0, 8)} — {inv.amountUsd}&nbsp;$ — {inv.status} — échéance{" "}
                    {new Date(inv.dueDate).toLocaleDateString("fr-FR")}
                  </p>
                ))
              )}
            </div>
          </section>

          <form className="panel" onSubmit={onStartMobileMoneyPayment}>
            <h2>Payer cette facture par Mobile Money</h2>
            <select
              value={mobilePayForm.invoiceId}
              onChange={(e) => setMobilePayForm({ ...mobilePayForm, invoiceId: e.target.value })}
            >
              <option value="">Choisir une facture ouverte</option>
              {session.invoices
                .filter((inv) => inv.status === "unpaid" || inv.status === "overdue")
                .map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.id.slice(0, 8)} — {inv.amountUsd}&nbsp;$ ({inv.status})
                  </option>
                ))}
            </select>
            <select
              value={mobilePayForm.currency}
              onChange={(e) => setMobilePayForm({ ...mobilePayForm, currency: e.target.value })}
            >
              <option value="CDF">CDF (franc congolais)</option>
              <option value="USD">USD</option>
            </select>
            <input
              placeholder="Téléphone payeur (ex. 243990000111)"
              value={mobilePayForm.phoneNumber}
              onChange={(e) => setMobilePayForm({ ...mobilePayForm, phoneNumber: e.target.value })}
            />
            <select
              value={mobilePayForm.networkKey}
              onChange={(e) => setMobilePayForm({ ...mobilePayForm, networkKey: e.target.value })}
            >
              {networks.map((network) => (
                <option key={network.key} value={network.key}>
                  {network.label}
                </option>
              ))}
            </select>
            <button type="submit" disabled={!mobilePayForm.invoiceId || !mobilePayForm.phoneNumber}>
              Payer cette facture par Mobile Money
            </button>
            {mobilePaySession?.depositId ? (
              <p>
                Deposit ID: <code>{mobilePaySession.depositId}</code>{" "}
                <button type="button" onClick={onCheckMobileMoneyPayment}>
                  Vérifier le paiement
                </button>
              </p>
            ) : null}
          </form>

          <form className="panel" onSubmit={onSubmitTid}>
            <h2>Envoyer la référence Mobile Money (TID)</h2>
            <select
              value={tidForm.invoiceId}
              onChange={(e) => setTidForm({ ...tidForm, invoiceId: e.target.value })}
            >
              <option value="">Choisir une facture ouverte</option>
              {session.invoices
                .filter((inv) => inv.status === "unpaid" || inv.status === "overdue")
                .map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.id.slice(0, 8)} — {inv.amountUsd}&nbsp;$ ({inv.status})
                  </option>
                ))}
            </select>
            <input
              placeholder="Référence de transaction (TID)"
              value={tidForm.tid}
              onChange={(e) => setTidForm({ ...tidForm, tid: e.target.value })}
            />
            <input
              placeholder="Votre téléphone (facultatif)"
              value={tidForm.submittedByPhone}
              onChange={(e) => setTidForm({ ...tidForm, submittedByPhone: e.target.value })}
            />
            <input
              placeholder="Montant USD (facultatif)"
              value={tidForm.amountUsd}
              onChange={(e) => setTidForm({ ...tidForm, amountUsd: e.target.value })}
            />
            <button type="submit" disabled={!tidForm.invoiceId || !tidForm.tid}>
              Envoyer la TID
            </button>
          </form>
        </>
      )}
    </main>
  );
}
