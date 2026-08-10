/** Platform network / transaction fee on Pawapay deposits and withdrawals. */
export const TRANSACTION_FEE_RATE = 0.04;

export function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Fee amount for a principal (4%). */
export function feeOnAmount(amount) {
  return roundMoney(Number(amount) * TRANSACTION_FEE_RATE);
}

/** Client pays invoice + fee (deposit). */
export function amountWithDepositFee(amount) {
  return roundMoney(Number(amount) + feeOnAmount(amount));
}

/** Net credited to tenant after deposit fee. */
export function netAfterDepositFee(gross) {
  return roundMoney(Number(gross) - feeOnAmount(gross));
}

/** Total debit from withdrawable balance for a payout principal. */
export function withdrawalDebit(amount) {
  const principal = roundMoney(amount);
  const fee = feeOnAmount(principal);
  return { principal, fee, total: roundMoney(principal + fee) };
}
