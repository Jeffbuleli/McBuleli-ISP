import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "change_me";
/** Operator dashboard session lifetime (default 7 days). */
const SESSION_TTL = process.env.JWT_SESSION_TTL || "7d";
const MFA_PENDING_TTL = process.env.JWT_MFA_PENDING_TTL || "15m";

export function signToken(user, opts = {}) {
  /** Completed operator sessions are MFA-ok unless explicitly marked otherwise. */
  const mfaOk = opts.mfaOk === undefined ? true : Boolean(opts.mfaOk);
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
    { expiresIn: SESSION_TTL }
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
    { expiresIn: MFA_PENDING_TTL }
  );
}

export function readBearerToken(req) {
  const header = req.headers.authorization || "";
  const [, token] = header.split(" ");
  return token || "";
}

export function authenticate(req, res, next) {
  const token = readBearerToken(req);
  if (!token) {
    return res.status(401).json({ message: "Missing bearer token", code: "SESSION_MISSING" });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch (err) {
    if (err?.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Session expired", code: "SESSION_EXPIRED" });
    }
    return res.status(401).json({ message: "Invalid token", code: "SESSION_INVALID" });
  }
}

/**
 * Re-issue a session JWT when the current one is still valid.
 * Used for sliding sessions from the dashboard.
 */
export function refreshSessionToken(req, res) {
  const token = readBearerToken(req);
  if (!token) {
    return res.status(401).json({ message: "Missing bearer token", code: "SESSION_MISSING" });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.typ === "mfa_pending") {
      return res.status(403).json({ code: "MFA_REQUIRED", message: "MFA verification required" });
    }
    if (payload.typ && payload.typ !== "session") {
      return res.status(403).json({ message: "Invalid session token", code: "SESSION_INVALID" });
    }
    const next = signToken(
      {
        id: payload.sub,
        role: payload.role,
        isp_id: payload.ispId || null,
        email: payload.email
      },
      { mfaOk: payload.mfaOk !== false }
    );
    return res.json({ token: next });
  } catch (err) {
    if (err?.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Session expired", code: "SESSION_EXPIRED" });
    }
    return res.status(401).json({ message: "Invalid token", code: "SESSION_INVALID" });
  }
}

export function requireMfaCompleted(req, res, next) {
  if (!req.user) return res.status(401).json({ message: "Missing bearer token", code: "SESSION_MISSING" });
  if (req.user.typ === "mfa_pending") {
    return res.status(403).json({ code: "MFA_REQUIRED", message: "MFA verification required" });
  }
  if (req.user.typ && req.user.typ !== "session") {
    return res.status(403).json({ message: "Invalid session token", code: "SESSION_INVALID" });
  }
  if (!req.user.mfaOk) {
    return res.status(403).json({ code: "MFA_REQUIRED", message: "MFA verification required" });
  }
  return next();
}

export function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(403).json({ message: "Forbidden" });
    }
    /** Global platform owner: same access as role-gated tenant routes when `ispId` is supplied. */
    if (req.user.role === "system_owner") {
      return next();
    }
    if (!allowedRoles.includes(req.user.role)) {
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
