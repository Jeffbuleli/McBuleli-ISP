/** Keep in sync with backend/src/transactionFees.js — 5% like mcbuleli.org/wallet. */
export const TRANSACTION_FEE_RATE = 0.05;
export const TRANSACTION_FEE_PERCENT = 5;

export function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function feeOnAmount(amount) {
  return roundMoney(Number(amount) * TRANSACTION_FEE_RATE);
}

export function amountWithDepositFee(amount) {
  return roundMoney(Number(amount) + feeOnAmount(amount));
}

export function withdrawalDebit(amount) {
  const principal = roundMoney(amount);
  const fee = feeOnAmount(principal);
  return { principal, fee, total: roundMoney(principal + fee) };
}
