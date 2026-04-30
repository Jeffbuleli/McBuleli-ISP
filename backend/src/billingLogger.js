/**
 * One JSON line per event for grep-friendly billing / automation logs.
 */
export function billingJobLog(event, fields = {}) {
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      component: "billing_automation",
      event,
      ...fields
    })
  );
}
