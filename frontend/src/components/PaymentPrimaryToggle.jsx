/**
 * Compact payment surface note for ISP operators.
 */
export function PaymentPrimaryToggle({ t }) {
  return (
    <div className="panel" style={{ marginBottom: 12 }}>
      <h2 style={{ marginBottom: 8 }}>{t("Paiements", "Payments")}</h2>
      <p className="app-meta" style={{ marginBottom: 0 }}>
        {t(
          "Manuel + Pawapay (USD/CDF) via le portail client. Frais réseau 4%.",
          "Manual + Pawapay (USD/CDF) via the customer portal. Network fee 4%."
        )}
      </p>
    </div>
  );
}
