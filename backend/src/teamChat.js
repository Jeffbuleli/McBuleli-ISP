import { authenticate as authenticateJwt, requireRoles, resolveIspId } from "./auth.js";
import { enforcePlatformAccess } from "./platformAccess.js";
import { query } from "./db.js";

function authenticate(req, res, next) {
  authenticateJwt(req, res, () => enforcePlatformAccess(req, res, next));
}

function isUuidString(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

export const TEAM_CHAT_ROLES = [
  "system_owner",
  "super_admin",
  "company_manager",
  "isp_admin",
  "billing_agent",
  "noc_operator",
  "field_agent"
];

const MAX_MESSAGE_LEN = 500;
const CHAT_USERNAME_RE = /^[a-z0-9_]{3,30}$/;

function normalizeMessageContent(raw) {
  const s = String(raw ?? "")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
  return s.length > MAX_MESSAGE_LEN ? s.slice(0, MAX_MESSAGE_LEN) : s;
}

async function assertWorkspaceChatAccess(user, ispId) {
  const uid = user.sub;
  const role = user.role;
  const mem = await query(
    `SELECT 1 FROM user_isp_memberships WHERE user_id = $1::uuid AND isp_id = $2::uuid AND is_active = TRUE`,
    [uid, ispId]
  );
  if (mem.rows[0]) return true;
  if (role === "system_owner") {
    const ex = await query(`SELECT 1 FROM isps WHERE id = $1::uuid`, [ispId]);
    return Boolean(ex.rows[0]);
  }
  if (role === "super_admin" && !user.ispId) {
    const ex = await query(`SELECT 1 FROM isps WHERE id = $1::uuid`, [ispId]);
    return Boolean(ex.rows[0]);
  }
  return false;
}

async function resolveChatIsp(req, res) {
  const ispId = resolveIspId(req, res);
  if (!ispId) return null;
  const ok = await assertWorkspaceChatAccess(req.user, ispId);
  if (!ok) {
    res.status(403).json({ message: "Not a member of this workspace or access denied." });
    return null;
  }
  return ispId;
}

function mapMessageRow(row) {
  return {
    id: row.id,
    ispId: row.isp_id,
    senderId: row.sender_id,
    content: row.content,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    sender: {
      chatUsername: row.chat_username || "user",
      chatAvatarUrl: row.chat_avatar_url || null,
      role: row.sender_role || null,
      fullName: row.full_name || null
    },
    seenByCount:
      typeof row.seen_by_count === "number" || typeof row.seen_by_count === "string"
        ? Number(row.seen_by_count)
        : null
  };
}

async function fetchSeenCounts(ispId, messageIds, senderIds, viewerId) {
  const ownIds = [];
  for (let i = 0; i < messageIds.length; i += 1) {
    if (senderIds[i] === viewerId) ownIds.push(messageIds[i]);
  }
  if (ownIds.length === 0) return new Map();

  const r = await query(
    `SELECT m.id,
            COUNT(DISTINCT memb.user_id)::int AS c
       FROM team_chat_messages m
       JOIN user_isp_memberships memb ON memb.isp_id = m.isp_id AND memb.is_active IS TRUE AND memb.user_id <> m.sender_id
       LEFT JOIN team_chat_member_state st ON st.user_id = memb.user_id AND st.isp_id = memb.isp_id
       WHERE m.isp_id = $1::uuid
         AND m.id = ANY($2::uuid[])
         AND COALESCE(st.last_read_at, TIMESTAMP WITH TIME ZONE 'epoch') >= m.created_at
       GROUP BY m.id`,
    [ispId, ownIds]
  );
  const out = new Map();
  for (const row of r.rows) out.set(row.id, row.c);
  return out;
}

/**
 * Registers team chat REST routes under /api (same auth + platform middleware as dashboard).
 */
export function registerTeamChatRoutes(app) {
  app.patch(
    "/api/auth/chat-profile",
    authenticate,
    requireRoles(...TEAM_CHAT_ROLES),
    async (req, res) => {
      const uid = req.user.sub;
      const body = req.body || {};
      const hasUser = Object.prototype.hasOwnProperty.call(body, "chatUsername");
      const hasAv = Object.prototype.hasOwnProperty.call(body, "chatAvatarUrl");

      if (!hasUser && !hasAv) {
        return res.status(400).json({ message: "chatUsername and/or chatAvatarUrl required" });
      }

      const cur = await query(
        `SELECT chat_username, chat_avatar_url FROM users WHERE id = $1::uuid`,
        [uid]
      );
      if (!cur.rows[0]) return res.status(404).json({ message: "User not found" });

      let nextUser = hasUser ? String(body.chatUsername || "").trim().toLowerCase() : cur.rows[0].chat_username;
      let nextAv = hasAv ? body.chatAvatarUrl : cur.rows[0].chat_avatar_url;

      if (hasUser) {
        if (!CHAT_USERNAME_RE.test(nextUser)) {
          return res.status(400).json({
            message: "chatUsername must be 3–30 characters: lowercase letters, digits, underscore only."
          });
        }
        const clash = await query(
          `SELECT id FROM users WHERE lower(btrim(chat_username)) = $1 AND id <> $2::uuid`,
          [nextUser, uid]
        );
        if (clash.rows[0]) {
          return res.status(409).json({ message: "This chat username is already taken." });
        }
      }

      if (hasAv) {
        if (nextAv == null || nextAv === "") {
          nextAv = null;
        } else {
          const u = String(nextAv).trim().slice(0, 2048);
          if (!/^https:\/\//i.test(u)) {
            return res.status(400).json({ message: "chatAvatarUrl must be an https URL." });
          }
          nextAv = u;
        }
      }

      await query(
        `UPDATE users SET chat_username = COALESCE($1, chat_username), chat_avatar_url = $2 WHERE id = $3::uuid`,
        [hasUser ? nextUser : null, hasAv ? nextAv : cur.rows[0].chat_avatar_url, uid]
      );

      const again = await query(
        `SELECT chat_username AS "chatUsername", chat_avatar_url AS "chatAvatarUrl" FROM users WHERE id = $1::uuid`,
        [uid]
      );
      return res.json(again.rows[0]);
    }
  );

  app.get(
    "/api/team-chat/unread",
    authenticate,
    requireRoles(...TEAM_CHAT_ROLES),
    async (req, res) => {
      const ispId = await resolveChatIsp(req, res);
      if (!ispId) return;
      const uid = req.user.sub;
      const r = await query(
        `SELECT COUNT(*)::int AS c
         FROM team_chat_messages m
         WHERE m.isp_id = $1::uuid
           AND m.sender_id <> $2::uuid
           AND m.created_at > COALESCE(
             (SELECT last_read_at FROM team_chat_member_state WHERE user_id = $2::uuid AND isp_id = $1::uuid),
             TIMESTAMP WITH TIME ZONE 'epoch'
           )`,
        [ispId, uid]
      );
      return res.json({ count: r.rows[0]?.c ?? 0 });
    }
  );

  app.get(
    "/api/team-chat/members",
    authenticate,
    requireRoles(...TEAM_CHAT_ROLES),
    async (req, res) => {
      const ispId = await resolveChatIsp(req, res);
      if (!ispId) return;
      const r = await query(
        `SELECT u.id AS "userId",
                u.chat_username AS "chatUsername",
                u.full_name AS "fullName",
                m.role AS "role"
           FROM user_isp_memberships m
           JOIN users u ON u.id = m.user_id
          WHERE m.isp_id = $1::uuid
            AND m.is_active IS TRUE
            AND u.is_active IS TRUE
            AND COALESCE(trim(u.chat_username), '') <> ''
          ORDER BY lower(u.chat_username) ASC`,
        [ispId]
      );
      return res.json({ members: r.rows });
    }
  );

  app.get(
    "/api/team-chat/messages",
    authenticate,
    requireRoles(...TEAM_CHAT_ROLES),
    async (req, res) => {
      const ispId = await resolveChatIsp(req, res);
      if (!ispId) return;
      const uid = req.user.sub;
      const limitRaw = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
      const before = req.query.before ? String(req.query.before).trim() : "";
      if (before && !isUuidString(before)) {
        return res.status(400).json({ message: "Invalid before (message id)" });
      }

      let beforeCreated = null;
      let beforeId = null;
      if (before) {
        const br = await query(
          `SELECT created_at, id FROM team_chat_messages WHERE id = $1::uuid AND isp_id = $2::uuid`,
          [before, ispId]
        );
        if (!br.rows[0]) return res.status(400).json({ message: "before message not found in this workspace" });
        beforeCreated = br.rows[0].created_at;
        beforeId = br.rows[0].id;
      }

      const extra = beforeCreated
        ? ` AND (m.created_at, m.id) < ($2::timestamptz, $3::uuid)`
        : "";
      const params = beforeCreated ? [ispId, beforeCreated, beforeId, limitRaw] : [ispId, limitRaw];
      const limitIdx = beforeCreated ? 4 : 2;

      const r = await query(
        `WITH page AS (
           SELECT m.id, m.isp_id, m.sender_id, m.content, m.created_at,
                  u.chat_username, u.chat_avatar_url, u.full_name,
                  memb.role AS sender_role
             FROM team_chat_messages m
             JOIN users u ON u.id = m.sender_id
             LEFT JOIN user_isp_memberships memb
               ON memb.user_id = m.sender_id AND memb.isp_id = m.isp_id AND memb.is_active = TRUE
            WHERE m.isp_id = $1::uuid ${extra}
            ORDER BY m.created_at DESC, m.id DESC
            LIMIT $${limitIdx}::int
         )
         SELECT * FROM page ORDER BY created_at ASC, id ASC`,
        params
      );

      const rows = r.rows;
      const ids = rows.map((row) => row.id);
      const senders = rows.map((row) => row.sender_id);
      const seenMap = await fetchSeenCounts(ispId, ids, senders, uid);
      const items = rows.map((row) => {
        const m = mapMessageRow(row);
        if (row.sender_id === uid) {
          m.seenByCount = seenMap.get(row.id) ?? 0;
        }
        return m;
      });

      return res.json({ items, hasMore: rows.length === limitRaw });
    }
  );

  app.post(
    "/api/team-chat/messages",
    authenticate,
    requireRoles(...TEAM_CHAT_ROLES),
    async (req, res) => {
      const ispId = await resolveChatIsp(req, res);
      if (!ispId) return;
      const uid = req.user.sub;
      const content = normalizeMessageContent((req.body || {}).content);
      if (!content.length) {
        return res.status(400).json({ message: "Message content is required (max 500 characters)." });
      }

      const ins = await query(
        `INSERT INTO team_chat_messages (isp_id, sender_id, content)
         VALUES ($1::uuid, $2::uuid, $3)
         RETURNING id, isp_id, sender_id, content, created_at`,
        [ispId, uid, content]
      );
      const row = ins.rows[0];
      const u = await query(
        `SELECT u.chat_username, u.chat_avatar_url, u.full_name,
                memb.role AS sender_role
           FROM users u
           LEFT JOIN user_isp_memberships memb
             ON memb.user_id = u.id AND memb.isp_id = $2::uuid AND memb.is_active = TRUE
          WHERE u.id = $1::uuid`,
        [uid, ispId]
      );
      const merged = { ...row, ...u.rows[0] };
      const message = mapMessageRow(merged);
      message.seenByCount = 0;
      return res.status(201).json(message);
    }
  );

  app.post(
    "/api/team-chat/read",
    authenticate,
    requireRoles(...TEAM_CHAT_ROLES),
    async (req, res) => {
      const ispId = await resolveChatIsp(req, res);
      if (!ispId) return;
      const uid = req.user.sub;

      const maxR = await query(
        `SELECT COALESCE(MAX(created_at), NOW()) AS t FROM team_chat_messages WHERE isp_id = $1::uuid`,
        [ispId]
      );
      const maxAt = maxR.rows[0]?.t || new Date();

      await query(
        `INSERT INTO team_chat_member_state (user_id, isp_id, last_read_at)
         VALUES ($1::uuid, $2::uuid, $3::timestamptz)
         ON CONFLICT (user_id, isp_id) DO UPDATE SET
           last_read_at = GREATEST(team_chat_member_state.last_read_at, EXCLUDED.last_read_at)`,
        [uid, ispId, maxAt]
      );

      return res.json({
        ok: true,
        lastReadAt: (maxAt instanceof Date ? maxAt : new Date(maxAt)).toISOString()
      });
    }
  );
}
