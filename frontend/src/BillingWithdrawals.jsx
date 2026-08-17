/**
 * Tenant wallet: receive Mobile Money payments, withdraw to MoMo (5% fee each way).
 */
import { useEffect, useMemo } from "react";
import { TRANSACTION_FEE_PERCENT, TRANSACTION_FEE_RATE, withdrawalDebit } from "./transactionFees.js";

export default function BillingWithdrawals({
  t,
  isEn,
  user,
  selectedIspId,
  cashbox,
  withdrawalForm,
  setWithdrawalForm,
  availablePawapayNetworks,
  onCreateWithdrawal,
  withdrawalTableView,
  withdrawalTable,
  setWithdrawalTable,
  withdrawalStatusLabel,
  DataTable,
  formatUsd
}) {
  const feeRate = Number(cashbox?.feeRate) || TRANSACTION_FEE_RATE;
  const feePct = Math.round(feeRate * 100) || TRANSACTION_FEE_PERCENT;
  const withdrawable = Number(cashbox?.withdrawableMobileMoneyUsd) || 0;
  const collected = Number(cashbox?.mobileMoneyUsd) || 0;
  const withdrawn = Number(cashbox?.withdrawnMobileMoneyUsd) || 0;
  const loc = isEn ? "en-GB" : "fr-FR";
  const money = (n) =>
    formatUsd ? formatUsd(Number(n) || 0, loc) : `$${(Number(n) || 0).toFixed(2)}`;

  const preview = useMemo(() => {
    const raw = Number(withdrawalForm.amountUsd);
    if (!Number.isFinite(raw) || raw <= 0) return null;
    const debit = withdrawalDebit(raw);
    return debit;
  }, [withdrawalForm.amountUsd]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash === "#billing-wallet") {
      document.getElementById("billing-wallet")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  return (
    <section className="panel billing-withdrawals isp-wallet-panel" id="billing-wallet">
      <h2>{t("Portefeuille entreprise", "Business wallet")}</h2>
      <p className="app-meta">
        {t(
          `Les paiements Mobile Money des clients arrivent ici. Frais ${feePct} % à l'encaissement (payés par le client) et ${feePct} % au retrait vers votre numéro.`,
          `Customer Mobile Money payments land here. ${feePct}% fee on deposit (paid by the customer) and ${feePct}% on withdrawal to your number.`
        )}
      </p>
      <div className="isp-wallet-kpis">
        <div className="isp-wallet-kpi">
          <span>{t("Encaissé MM", "MM collected")}</span>
          <strong>{money(collected)}</strong>
        </div>
        <div className="isp-wallet-kpi">
          <span>{t("Déjà retiré", "Already withdrawn")}</span>
          <strong>{money(withdrawn)}</strong>
        </div>
        <div className="isp-wallet-kpi isp-wallet-kpi--accent">
          <span>{t("Solde retirable", "Withdrawable")}</span>
          <strong>{money(withdrawable)}</strong>
        </div>
      </div>
      {!user?.mfaTotpEnabled ? (
        <p className="app-meta">
          {t("Activez Google Authenticator (Sécurité) pour retirer.", "Enable Google Authenticator (Security) to withdraw.")}
        </p>
      ) : null}
      <form onSubmit={onCreateWithdrawal}>
        <input
          type="number"
          min={withdrawalForm.currency === "CDF" ? "1000" : "0.5"}
          step="0.01"
          placeholder={
            withdrawalForm.currency === "CDF"
              ? t("Montant à recevoir (CDF)", "Amount to receive (CDF)")
              : t("Montant à recevoir (USD)", "Amount to receive (USD)")
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
        {preview ? (
          <p className="isp-wallet-fee">
            {t(
              `Vous recevez ${preview.principal.toFixed(2)} ${withdrawalForm.currency} · Frais ${feePct} % : ${preview.fee.toFixed(2)} · Débit : ${preview.total.toFixed(2)} ${withdrawalForm.currency}`,
              `You receive ${preview.principal.toFixed(2)} ${withdrawalForm.currency} · ${feePct}% fee: ${preview.fee.toFixed(2)} · Debit: ${preview.total.toFixed(2)} ${withdrawalForm.currency}`
            )}
          </p>
        ) : (
          <p className="isp-wallet-fee">
            {t(
              `Frais de retrait ${feePct} % (comme mcbuleli.org/wallet). Le cash et les TID ne sont pas retirables.`,
              `${feePct}% withdrawal fee (same as mcbuleli.org/wallet). Cash and TID are not withdrawable.`
            )}
          </p>
        )}
        <button type="submit" disabled={!selectedIspId || !user?.mfaTotpEnabled}>
          {t("Retirer vers Mobile Money", "Withdraw to Mobile Money")}
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
            cell: (w) => (w.createdAt ? new Date(w.createdAt).toLocaleString(loc) : "-")
          },
          {
            key: "amount",
            header: t("Reçu", "Received"),
            sortKey: "amountUsd",
            cell: (w) => `${w.amountUsd ?? "-"} ${w.currency || ""}`.trim()
          },
          {
            key: "feeUsd",
            header: t(`Frais ${feePct} %`, `${feePct}% fee`),
            sortKey: "feeUsd",
            cell: (w) => (w.feeUsd != null ? String(w.feeUsd) : "-")
          },
          {
            key: "phoneNumber",
            header: t("Destination", "Destination"),
            sortKey: "phoneNumber",
            cell: (w) => w.phoneNumber || "-"
          },
          { key: "provider", header: t("Réseau", "Network"), sortKey: "provider", cell: (w) => w.provider || "-" },
          {
            key: "status",
            header: t("Statut", "Status"),
            sortKey: "status",
            cell: (w) =>
              `${withdrawalStatusLabel(w.status, isEn)}${w.failureMessage ? ` - ${w.failureMessage}` : ""}`
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
  );
}
