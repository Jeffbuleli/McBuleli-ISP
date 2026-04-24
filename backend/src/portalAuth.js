import jwt from "jsonwebtoken";
import { query } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET || "change_me";

/**
 * Customer portal: Bearer JWT with role "subscriber", or an opaque portal token.
 * Opaque token: X-Portal-Token, query portalToken, or JSON body.portalToken.
 */
export async function authenticatePortal(req, res, next) {
  const header = req.headers.authorization || "";
  const [, bearer] = header.split(/\s+/);
  if (bearer) {
    try {
      const payload = jwt.verify(bearer, JWT_SECRET);
      if (payload.role === "subscriber" && payload.sub && payload.ispId) {
        const chk = await query("SELECT id FROM customers WHERE id = $1 AND isp_id = $2", [
          payload.sub,
          payload.ispId
        ]);
        if (chk.rows[0]) {
          req.portal = { ispId: payload.ispId, customerId: payload.sub };
          return next();
        }
      }
    } catch (_e) {
      /* fall through to opaque portal token */
    }
  }

  const token =
    req.headers["x-portal-token"] ||
    req.query.portalToken ||
    (req.body && typeof req.body.portalToken === "string" ? req.body.portalToken : null);
  if (!token || String(token).trim().length < 16) {
    return res.status(401).json({ message: "Portal access required (subscriber session or portal token)" });
  }
  const trimmed = String(token).trim();
  const result = await query(
    `SELECT isp_id AS "ispId", customer_id AS "customerId"
     FROM customer_portal_tokens
     WHERE token = $1 AND expires_at > NOW()`,
    [trimmed]
  );
  if (!result.rows[0]) {
    return res.status(401).json({ message: "Invalid or expired portal token" });
  }
  req.portal = result.rows[0];
  return next();
}
