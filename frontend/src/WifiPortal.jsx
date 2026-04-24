import { useCallback, useEffect, useMemo, useState } from "react";
import { API_URL, publicAssetUrl, publicRequest } from "./api";

function wifiDisplayName(name) {
  const s = name != null ? String(name).trim() : "";
  if (!s || s === "AA") return "McBuleli — Wi‑Fi invité";
  return s;
}

export default function WifiPortal() {
  const ispIdFromQuery = useMemo(() => {
    const q = new URLSearchParams(window.location.search).get("ispId");
    return q ? q.trim() : "";
  }, []);

  const [ispIdInput, setIspIdInput] = useState(ispIdFromQuery);
  const [activeIspId, setActiveIspId] = useState(ispIdFromQuery);
  const [branding, setBranding] = useState(null);
  const [plans, setPlans] = useState([]);
  const [networks, setNetworks] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [checkout, setCheckout] = useState({
    phone: "",
    networkKey: "orange"
  });
  const [depositId, setDepositId] = useState(null);
  const [redirectUrl, setRedirectUrl] = useState(null);
  const [polling, setPolling] = useState(false);
  const [postPaySetup, setPostPaySetup] = useState(null);

  const loadCatalog = useCallback(async (isp) => {
    setError("");
    const [p, n] = await Promise.all([
      publicRequest(`/public/wifi-plans?ispId=${encodeURIComponent(isp)}`),
      publicRequest("/public/wifi-networks")
    ]);
    setBranding(p.branding || {});
    setPlans(p.plans || []);
    setNetworks(n || []);
    setActiveIspId(isp);
    const url = new URL(window.location.href);
    url.searchParams.set("ispId", isp);
    window.history.replaceState({}, "", url.toString());
  }, []);

  useEffect(() => {
    publicRequest("/public/wifi-networks")
      .then(setNetworks)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!ispIdFromQuery) return;
    loadCatalog(ispIdFromQuery).catch((e) => setError(e.message));
  }, [ispIdFromQuery, loadCatalog]);

  async function onOpenCatalog(e) {
    e.preventDefault();
    try {
      await loadCatalog(ispIdInput.trim());
    } catch (err) {
      setError(err.message);
    }
  }

  async function onStartPayment(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!selectedPlan || !activeIspId) return;
    const phone = checkout.phone.replace(/\s+/g, "").replace(/^\+/, "");
    if (phone.length < 9) {
      setError("Indiquez un numéro mobile valide (indicatif pays, chiffres uniquement).");
      return;
    }
    try {
      const res = await publicRequest("/public/wifi-purchase/initiate", {
        method: "POST",
        body: JSON.stringify({
          ispId: activeIspId,
          planId: selectedPlan.id,
          phoneNumber: phone,
          networkKey: checkout.networkKey
        })
      });
      setDepositId(res.depositId);
      setRedirectUrl(res.redirectUrlAfterPayment || "https://www.google.com");
      setNotice(res.message || "Vérifiez votre téléphone : une demande de validation peut apparaître.");
      setPolling(true);
    } catch (err) {
      setError(err.message || "Impossible de démarrer le paiement.");
    }
  }

  useEffect(() => {
    if (!polling || !depositId) return;
    let cancelled = false;
    let ticks = 0;
    const t = setInterval(async () => {
      ticks += 1;
      if (ticks > 120) {
        clearInterval(t);
        if (!cancelled) setPolling(false);
        return;
      }
      try {
        const st = await publicRequest(
          `/public/wifi-purchase/status/${encodeURIComponent(depositId)}`
        );
        if (st.status === "completed") {
          clearInterval(t);
          if (!cancelled) {
            setPolling(false);
            const nextUrl = st.redirectUrl || redirectUrl || "https://www.google.com";
            if (st.setupToken) {
              setPostPaySetup({ setupToken: st.setupToken, redirectUrl: nextUrl });
              setNotice(
                "Paiement confirmé. Copiez le jeton ci-dessous, ouvrez le portail client de votre opérateur et définissez un mot de passe avant de quitter cette page."
              );
            } else {
              window.location.href = nextUrl;
            }
          }
        }
        if (st.status === "failed") {
          clearInterval(t);
          if (!cancelled) {
            setPolling(false);
            setError("Paiement refusé ou annulé. Vous pouvez réessayer.");
          }
        }
      } catch (_e) {
        /* keep polling */
      }
    }, 3500);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [polling, depositId, redirectUrl]);

  return (
    <main className="container">
      <section className="login-poster" style={{ marginBottom: 20 }} aria-label="Présentation">
        <div className="login-poster-logo">McBuleli</div>
        <p className="login-poster-lead" style={{ margin: 0 }}>
          Achetez un pass Wi‑Fi en Mobile Money, sans compte : choisissez une offre, payez sur votre téléphone, puis
          suivez les instructions de votre opérateur.
        </p>
      </section>
      <header style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        {branding?.logoUrl ? (
          <img src={publicAssetUrl(branding.logoUrl)} alt="" style={{ height: 40 }} />
        ) : null}
        <h1 style={{ margin: 0 }}>{wifiDisplayName(branding?.displayName)}</h1>
      </header>
      <p>Choisissez une formule et payez par Mobile Money — aucun compte n'est requis.</p>

      {!activeIspId && (
        <form className="panel" onSubmit={onOpenCatalog}>
          <h2>Accéder à votre FAI</h2>
          <p className="wifi-lead">
            Wi‑Fi invité McBuleli — saisissez l'identifiant FAI (UUID) communiqué par votre opérateur.
          </p>
          <input
            placeholder="Identifiant FAI (UUID fourni par l'opérateur)"
            value={ispIdInput}
            onChange={(e) => setIspIdInput(e.target.value)}
            style={{ width: "100%", maxWidth: 400 }}
          />
          <button type="submit">Afficher les offres</button>
        </form>
      )}

      {error && <p className="error">{error}</p>}
      {notice && <p>{notice}</p>}

      {postPaySetup && (
        <section className="panel" style={{ marginTop: 16 }}>
          <h2>Créer votre mot de passe portail</h2>
          <p>
            Sur la page portail client, utilisez <strong>Première connexion</strong>, collez ce jeton, puis définissez
            un mot de passe pour vous connecter plus tard avec votre téléphone.
          </p>
          <textarea
            readOnly
            rows={3}
            value={postPaySetup.setupToken}
            style={{ width: "100%", maxWidth: 560, fontFamily: "monospace" }}
          />
          <p>
            <button type="button" onClick={() => window.open("/portal", "_blank", "noopener,noreferrer")}>
              Ouvrir le portail client
            </button>{" "}
            <button
              type="button"
              onClick={() => {
                window.location.href = postPaySetup.redirectUrl;
              }}
            >
              Continuer vers le Wi‑Fi / redirection
            </button>
          </p>
        </section>
      )}

      {activeIspId && plans.length === 0 && !error && (
        <p>Aucune offre publique pour le moment. Demandez à l'opérateur de publier une formule.</p>
      )}

      <section className="grid">
        {plans.map((plan) => (
          <button
            key={plan.id}
            type="button"
            className="panel"
            style={{ textAlign: "left", cursor: "pointer" }}
            onClick={() => {
              setSelectedPlan(plan);
              setDepositId(null);
              setNotice("");
              setError("");
            }}
          >
            <h2>{plan.name}</h2>
            <p>
              <strong>{plan.priceUsd}&nbsp;$</strong> — {plan.durationDays} jour(s)
            </p>
            <p>
              Débit : {plan.speedLabel || plan.rateLimit} · Type : {plan.defaultAccessType} · Appareils :{" "}
              {plan.maxDevices}
            </p>
          </button>
        ))}
      </section>

      {selectedPlan && (
        <div
          role="presentation"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 40
          }}
          onClick={() => setSelectedPlan(null)}
        />
      )}
      {selectedPlan && (
        <div
          className="panel"
          style={{
            position: "fixed",
            inset: 0,
            margin: "auto",
            maxWidth: 420,
            maxHeight: "90vh",
            overflow: "auto",
            zIndex: 50,
            boxShadow: "0 8px 32px rgba(0,0,0,0.25)"
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h2>{selectedPlan.name}</h2>
          <p>
            {selectedPlan.priceUsd}&nbsp;$ · {selectedPlan.durationDays} jour(s)
          </p>
          <button type="button" onClick={() => setSelectedPlan(null)}>
            Fermer
          </button>

          <h3>Payer par Mobile Money</h3>
          <form onSubmit={onStartPayment}>
            <p>📱 Numéro de téléphone (chiffres, indicatif pays, sans +)</p>
            <input
              placeholder="243…"
              value={checkout.phone}
              onChange={(e) => setCheckout({ ...checkout, phone: e.target.value })}
            />
            <p>Réseau</p>
            <select
              value={checkout.networkKey}
              onChange={(e) => setCheckout({ ...checkout, networkKey: e.target.value })}
            >
              {networks.map((n) => (
                <option key={n.key} value={n.key}>
                  {n.label}
                </option>
              ))}
            </select>
            <button type="submit" disabled={polling || !checkout.phone}>
              {polling ? "En attente du paiement…" : "Payer et valider"}
            </button>
          </form>
          <p>
            <small>
              Après validation vous serez redirigé (par défaut vers Google). Votre FAI peut définir un lien personnalisé
              dans McBuleli ou par formule.
            </small>
          </p>
          {import.meta.env.DEV ? (
            <p>
              <small>API: {API_URL}</small>
            </p>
          ) : null}
        </div>
      )}
    </main>
  );
}
