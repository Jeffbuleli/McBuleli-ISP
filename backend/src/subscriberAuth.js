import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "change_me";

export function normalizeSubscriberPhone(phone) {
  return String(phone || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/^\+/, "");
}

export function signSubscriberToken(customer) {
  return jwt.sign(
    { sub: customer.id, role: "subscriber", ispId: customer.isp_id },
    JWT_SECRET,
    { expiresIn: "30d" }
  );
}

export function signCustomerSetupToken({ customerId, ispId }) {
  return jwt.sign({ sub: customerId, ispId, typ: "cust_setup" }, JWT_SECRET, { expiresIn: "72h" });
}

export function verifyCustomerSetupToken(token) {
  const p = jwt.verify(token, JWT_SECRET);
  if (p.typ !== "cust_setup" || !p.sub || !p.ispId) {
    const err = new Error("Invalid setup token");
    err.code = "INVALID_SETUP";
    throw err;
  }
  return p;
}
