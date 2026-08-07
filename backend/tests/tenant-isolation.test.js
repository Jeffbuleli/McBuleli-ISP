import assert from "node:assert/strict";
import { assertNoCrossTenantQuery, assertRowBelongsToTenant } from "../src/tenantScope.js";
import { isPrimaryPaymentMethod } from "../src/paymentsPrimary.js";

function mockRes() {
  const out = { statusCode: 200, body: null };
  return {
    out,
    status(code) {
      out.statusCode = code;
      return this;
    },
    json(body) {
      out.body = body;
      return this;
    }
  };
}

// Tenant staff cannot query another ISP
{
  const req = { user: { role: "isp_admin", ispId: "tenant-a" }, tenantIspId: "tenant-a" };
  assert.equal(assertNoCrossTenantQuery(req, "tenant-a"), true);
  assert.equal(assertNoCrossTenantQuery(req, "tenant-b"), false);
}

// Super admin may cross tenants when ispId provided
{
  const req = { user: { role: "super_admin", ispId: null } };
  assert.equal(assertNoCrossTenantQuery(req, "tenant-b"), true);
}

// Row isolation
{
  const res = mockRes();
  assert.equal(assertRowBelongsToTenant(res, { isp_id: "a" }, "a"), true);
  const res2 = mockRes();
  assert.equal(assertRowBelongsToTenant(res2, { isp_id: "a" }, "b"), false);
  assert.equal(res2.out.statusCode, 404);
}

// Primary payments
assert.equal(isPrimaryPaymentMethod("mobile_money"), true);
assert.equal(isPrimaryPaymentMethod("binance_pay"), false);

console.log("tenant-isolation + paymentsPrimary: ok");
