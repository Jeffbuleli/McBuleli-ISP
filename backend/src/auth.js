import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "change_me";

export function signToken(user, opts = {}) {
  const mfaOk = Boolean(opts.mfaOk);
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      ispId: user.isp_id || null,
      email: user.email,
      typ: "session",
      mfaOk
    },
    JWT_SECRET,
    { expiresIn: "8h" }
  );
}

export function signMfaPendingToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      ispId: user.isp_id || null,
      email: user.email,
      typ: "mfa_pending",
      mfaOk: false
    },
    JWT_SECRET,
    { expiresIn: "15m" }
  );
}

export function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const [, token] = header.split(" ");
  if (!token) {
    return res.status(401).json({ message: "Missing bearer token" });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch (_err) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

export function requireMfaCompleted(req, res, next) {
  if (!req.user) return res.status(401).json({ message: "Missing bearer token" });
  if (req.user.typ === "mfa_pending") {
    return res.status(403).json({ code: "MFA_REQUIRED", message: "MFA verification required" });
  }
  if (req.user.typ && req.user.typ !== "session") {
    return res.status(403).json({ message: "Invalid session token" });
  }
  if (!req.user.mfaOk) {
    return res.status(403).json({ code: "MFA_REQUIRED", message: "MFA verification required" });
  }
  return next();
}

export function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    return next();
  };
}

export function resolveIspId(req, res) {
  if (req.user.role === "system_owner" || req.user.role === "super_admin") {
    const requested =
      req.query.ispId || req.body.ispId || req.headers["x-isp-id"] || req.tenantIspId;
    if (!requested) {
      res.status(400).json({ message: "ispId is required for super admin context" });
      return null;
    }
    return requested;
  }
  return req.user.ispId || req.tenantIspId;
}
