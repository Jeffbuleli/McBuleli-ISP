/**
 * Tenant Pawapay withdrawal (USD/CDF) with 4% fee — Facturation.
 */
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
  const withdrawable = Number(cashbox?.withdrawableMobileMoneyUsd) || 0;
  const feeRate = Number(cashbox?.feeRate) || 0.04;
  const amount = Number(withdrawalForm.amountUsd) || 0;
  const feePreview =
    withdrawalForm.currency === "CDF"
      ? null
      : Math.round(amount * feeRate * 100) / 100;
  const totalPreview = feePreview != null ? Math.round((amount + feePreview) * 100) / 100 : null;

  return (
    <section className="panel billing-withdrawals">
      <h2>{t("Retrait Pawapay", "Pawapay withdrawal")}</h2>
      <p className="app-meta">
        {t(
          `Solde retirable : ${formatUsd ? formatUsd(withdrawable, isEn ? "en-GB" : "fr-FR") : `$${withdrawable.toFixed(2)}`} · frais 4%.`,
          `Withdrawable: ${formatUsd ? formatUsd(withdrawable, isEn ? "en-GB" : "fr-FR") : `$${withdrawable.toFixed(2)}`} · 4% fee.`
        )}
      </p>
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
              ? t("Montant (CDF)", "Amount (CDF)")
              : t("Montant (USD)", "Amount (USD)")
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
        {totalPreview != null && amount > 0 ? (
          <p className="app-meta">
            {t(
              `Frais 4% : $${feePreview.toFixed(2)} · débit total : $${totalPreview.toFixed(2)}`,
              `4% fee: $${feePreview.toFixed(2)} · total debit: $${totalPreview.toFixed(2)}`
            )}
          </p>
        ) : null}
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
        <button type="submit" disabled={!selectedIspId || !user?.mfaTotpEnabled}>
          {t("Retirer", "Withdraw")}
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
            cell: (w) => (w.createdAt ? new Date(w.createdAt).toLocaleString(isEn ? "en-GB" : "fr-FR") : "-")
          },
          {
            key: "amount",
            header: t("Montant", "Amount"),
            sortKey: "amountUsd",
            cell: (w) => `${w.amountUsd ?? "-"} ${w.currency || ""}`.trim()
          },
          {
            key: "feeUsd",
            header: t("Frais", "Fee"),
            sortKey: "feeUsd",
            cell: (w) => (w.feeUsd != null ? `$${Number(w.feeUsd).toFixed(2)}` : "-")
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
