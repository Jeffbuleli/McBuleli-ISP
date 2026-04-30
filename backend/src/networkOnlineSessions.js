import { query } from "./db.js";

function toPositiveInt(value, fallback, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  if (i < 1) return fallback;
  return Math.min(i, max);
}

function normalizeWindowMinutes(value) {
  return toPositiveInt(value, 30, 24 * 60);
}

function normalizeLimit(value) {
  return toPositiveInt(value, 80, 500);
}

const ONLINE_SESSIONS_CTE = `
  WITH latest_events AS (
    SELECT DISTINCT ON (
      COALESCE(NULLIF(BTRIM(acct_session_id), ''), CONCAT('user:', LOWER(username)))
    )
      id,
      username,
      acct_session_id,
      acct_status_type,
      nas_ip_address,
      framed_ip_address,
      acct_input_octets,
      acct_output_octets,
      COALESCE(event_time, created_at) AS seen_at
    FROM radius_accounting_ingest
    WHERE isp_id = $1
      AND username IS NOT NULL
      AND BTRIM(username) <> ''
    ORDER BY
      COALESCE(NULLIF(BTRIM(acct_session_id), ''), CONCAT('user:', LOWER(username))),
      COALESCE(event_time, created_at) DESC,
      id DESC
  ),
  active_sessions AS (
    SELECT *
    FROM latest_events
    WHERE seen_at >= NOW() - make_interval(mins => GREATEST($2::int, 1))
      AND LOWER(COALESCE(acct_status_type, '')) NOT IN ('stop', 'accounting-off', 'off')
  ),
  matched_sessions AS (
    SELECT
      a.id AS ingest_id,
      a.username,
      a.acct_session_id,
      a.acct_status_type,
      a.nas_ip_address,
      a.framed_ip_address,
      a.acct_input_octets,
      a.acct_output_octets,
      a.seen_at,
      c.id AS customer_id,
      c.full_name AS customer_name,
      c.phone AS customer_phone,
      c.status AS customer_status,
      s.id AS subscription_id,
      s.access_type,
      s.start_date,
      s.end_date,
      p.id AS plan_id,
      p.name AS plan_name
    FROM active_sessions a
    JOIN customers c
      ON c.isp_id = $1
      AND ('c' || LEFT(REPLACE(c.id::text, '-', ''), 10)) = a.username
    JOIN LATERAL (
      SELECT id, access_type, start_date, end_date, plan_id
      FROM subscriptions
      WHERE isp_id = $1
        AND customer_id = c.id
        AND status = 'active'
      ORDER BY end_date DESC, start_date DESC
      LIMIT 1
    ) s ON TRUE
    LEFT JOIN plans p ON p.id = s.plan_id
  )
`;

export async function listOnlineSubscriberSessions({ ispId, windowMinutes = 30, limit = 80 }) {
  const normalizedWindow = normalizeWindowMinutes(windowMinutes);
  const normalizedLimit = normalizeLimit(limit);
  const result = await query(
    `
      ${ONLINE_SESSIONS_CTE}
      SELECT
        ingest_id AS "ingestId",
        username,
        acct_session_id AS "acctSessionId",
        acct_status_type AS "acctStatusType",
        nas_ip_address AS "nasIpAddress",
        framed_ip_address AS "framedIpAddress",
        acct_input_octets AS "acctInputOctets",
        acct_output_octets AS "acctOutputOctets",
        seen_at AS "seenAt",
        customer_id AS "customerId",
        customer_name AS "customerName",
        customer_phone AS "customerPhone",
        customer_status AS "customerStatus",
        subscription_id AS "subscriptionId",
        access_type AS "accessType",
        start_date AS "startDate",
        end_date AS "endDate",
        plan_id AS "planId",
        plan_name AS "planName"
      FROM matched_sessions
      ORDER BY seen_at DESC
      LIMIT $3
    `,
    [ispId, normalizedWindow, normalizedLimit]
  );
  return {
    windowMinutes: normalizedWindow,
    items: result.rows
  };
}

export async function countOnlineSubscriberSessions({ ispId, windowMinutes = 30 }) {
  const normalizedWindow = normalizeWindowMinutes(windowMinutes);
  const result = await query(
    `
      ${ONLINE_SESSIONS_CTE}
      SELECT COUNT(*)::int AS value
      FROM matched_sessions
    `,
    [ispId, normalizedWindow]
  );
  return {
    windowMinutes: normalizedWindow,
    count: result.rows[0]?.value || 0
  };
}
