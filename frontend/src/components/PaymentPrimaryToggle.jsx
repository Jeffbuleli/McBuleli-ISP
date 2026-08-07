/**
 * Primary payment surface for ISP operators.
 * Keep TID or Pawapay as the main path; hide intents/unified under Advanced.
 */
export function PaymentPrimaryToggle({ t, showAdvanced, onToggle }) {
  return (
    <div className="panel" style={{ marginBottom: 12 }}>
      <h2 style={{ marginBottom: 8 }}>{t("Paiements", "Payments")}</h2>
      <p className="app-meta" style={{ marginBottom: 10 }}>
        {t(
          "Flux principal : TID Mobile Money ou Pawapay. Le reste est avance.",
          "Primary flow: Mobile Money TID or Pawapay. Everything else is advanced."
        )}
      </p>
      <button type="button" className="btn-secondary" onClick={onToggle}>
        {showAdvanced
          ? t("Masquer avance", "Hide advanced")
          : t("Afficher avance", "Show advanced")}
      </button>
    </div>
  );
}
