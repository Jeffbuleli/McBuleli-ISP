/**
 * Primary operator payment methods (others stay behind Advanced UI).
 */
export const PRIMARY_PAYMENT_METHODS = ["cash", "mobile_money"];

export function isPrimaryPaymentMethod(methodType) {
  return PRIMARY_PAYMENT_METHODS.includes(String(methodType || "").toLowerCase());
}
