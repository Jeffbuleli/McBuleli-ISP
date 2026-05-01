/**
 * Canonical metric definitions for dashboard analytics (semantic layer).
 * Copy / titles are resolved via `t(fr, en)` at render time where needed.
 */

export const METRIC_TIMECLASS = {
  SNAPSHOT_STOCK: "snapshot_stock",
  PERIOD_FLOW: "period_flow",
  REALTIME_WINDOW: "realtime_window"
};

/** Stable IDs used by components + backend meta.definitions keys alignment */
export const METRIC_IDS = {
  customersStock: "totalCustomers",
  activeSubsStock: "activeSubscriptions",
  unpaidStock: "unpaidInvoices",
  revenueLifetimeInvoices: "revenueUsd",
  paymentsConfirmedPeriod: "revenueCollectedUsd",
  hotspotUsersPeriodAgg: "hotspotUsers",
  pppoeUsersPeriodAgg: "pppoeUsers",
  peakConnectedDevicesPeriod: "connectedDevices",
  bandwidthPeriodSumGb: "bandwidthTotalGb",
  cashboxCashUsdPeriod: "cashboxCashUsd",
  cashboxTidUsdPeriod: "cashboxTidUsd",
  cashboxMmUsdPeriod: "cashboxMobileMoneyUsd",
  cashboxWithdrawableMmUsd: "cashboxWithdrawableMobileMoneyUsd",
  onlineSessionsRealtime: "networkSessions",
  ratioUnpaidPerCustomer: "ratio_unpaid_per_customer",
  ratioPaymentsPerCustomer: "ratio_payments_per_customer_period",
  ratioOnlinePerActiveSub: "ratio_online_sessions_per_active_sub"
};

/** Backend meta.definition tokens → FR/EN glossary lines for tooltips */
export const DEFINITION_GLOSSARY = {
  stock_snapshot_count: {
    fr: "Stock à l’instant T : décompte d’entités existantes dans l’espace (pas un flux sur la période).",
    en: "Stock at time T: count of entities in the workspace (not a flow over the selected period)."
  },
  cumulative_paid_invoice_amount_all_time: {
    fr: "Somme des montants des factures au statut « payé », toutes périodes confondues (cumul historique).",
    en: "Sum of invoice amounts marked paid, across all time (historical cumulative)."
  },
  open_unpaid_invoice_count: {
    fr: "Nombre de factures ouvertes (impayées ou en retard) à l’instant T.",
    en: "Count of open invoices (unpaid or overdue) at time T."
  },
  confirmed_payments_by_paid_at_in_period: {
    fr: "Somme des paiements confirmés dont la date `paid_at` tombe dans l’intervalle sélectionné (flux de trésorerie).",
    en: "Sum of confirmed payments whose `paid_at` date falls in the selected interval (cash-flow view)."
  },
  network_daily_rollup_sum: {
    fr: "Agrégation quotidienne réseau : somme des relevés journaliers sur l’intervalle (voir note d’agrégation côté API).",
    en: "Daily network rollup: sum of daily observations over the interval (see API aggregation notes)."
  },
  peak_connected_devices_max_over_days: {
    fr: "Maximum journalier des « appareils connectés » sur l’intervalle (pas une somme temporelle).",
    en: "Maximum daily connected-device count over the interval (not a sum over time)."
  },
  bandwidth_sum_daily_gb: {
    fr: "Somme du trafic quotidien (download + upload) en gigaoctets sur l’intervalle.",
    en: "Sum of daily traffic (download + upload) in gigabytes over the interval."
  },
  cashbox_by_method_period: {
    fr: "Répartition des paiements confirmés par canal sur l’intervalle (cash / TID / Mobile Money). Retirable MM = MM − demandes de retrait.",
    en: "Confirmed payments split by channel over the interval (cash / TID / mobile money). Withdrawable MM = MM − withdrawal requests."
  },
  radius_live_correlated_window: {
    fr: "Sessions abonnés dédupliquées dans une fenêtre glissante RADIUS (durée configurable).",
    en: "De-duplicated subscriber sessions seen inside a sliding RADIUS window (configurable duration)."
  },
  partial_daily_rollups: {
    fr: "Couverture quotidienne partielle : certains jours manquent dans les agrégats réseau pour cet intervalle.",
    en: "Partial daily coverage: some days are missing from network rollups for this interval."
  }
};
