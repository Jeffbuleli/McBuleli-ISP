# Incremental page extraction from App.jsx
# Live modules still render inside App.jsx anchors; these files mark the target split.

# - ClientsPage  -> #field-clients
# - BillingPage  -> #billing-ops (+ PaymentPrimaryToggle)
# - NetworkPage  -> #network-ops (+ NetworkHappyPath)
# - SettingsPage -> #workspace-settings / #security-settings

export { default as NetworkHappyPath } from "../components/NetworkHappyPath.jsx";
export { PaymentPrimaryToggle } from "../components/PaymentPrimaryToggle.jsx";
