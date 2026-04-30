import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { query, pool } from "./db.js";
import { authenticate as authenticateJwt, requireRoles, resolveIspId, signToken } from "./auth.js";
import { enforcePlatformAccess } from "./platformAccess.js";
import {
  applySuccessfulSaasDeposit,
  cdfAmountForUsd,
  getLatestPlatformSubscription,
  getPlatformBillingSnapshot,
  getPlatformFeatureLimits,
  markSaasDepositFailed,
  usdAmountForCdf,
  usdAmountString
} from "./platformBilling.js";
import { fetchPawapayDepositStatus, initiatePawapayDeposit, initiatePawapayPayout } from "./pawapayClient.js";
import { processNotificationOutboxBatch, sendNotificationDirect } from "./notifications.js";
import { provisionSubscriptionAccess } from "./networkProvisioning.js";
import { collectAndStoreNetworkTelemetry } from "./networkTelemetry.js";
import { encryptSecret } from "./secrets.js";
import {
  processExpiredSubscriptions,
  processOverdueInvoices,
  processRenewalInvoices
} from "./billingJobs.js";
import { applyInvoicePayment, applyInvoicePaymentTx } from "./invoicePayments.js";
import { authenticatePortal } from "./portalAuth.js";
import {
  normalizeSubscriberPhone,
  signSubscriberToken,
  verifyCustomerSetupToken
} from "./subscriberAuth.js";
import {
  getPawapayCallbackDocumentation,
  processPawapayCallback,
  verifyPawapayCallbackSecret
} from "./pawapayWebhooks.js";
import {
  completeWifiGuestPurchase,
  defaultRedirectUrl,
  markWifiGuestPurchaseFailed
} from "./wifiGuestCheckout.js";
import { WIFI_GUEST_NETWORK_OPTIONS, resolveWifiGuestPawapayProvider } from "./wifiGuestProviders.js";
import { createPublicRateLimiter } from "./publicRateLimit.js";
import { insertRadiusAccountingRecord } from "./radiusAccountingIngest.js";
import { countOnlineSubscriberSessions, listOnlineSubscriberSessions } from "./networkOnlineSessions.js";
import { generateTotpSecret, totpAuthUrl, verifyTotpCode } from "./totp.js";
import fs from "fs";
import path from "path";
import multer from "multer";
import { parseCsv, rowsToCsv } from "./csvUtils.js";
import {
  brandingUploadDir,
  clearBrandingLogoFiles,
  clearPlatformBannerFiles,
  ensureBrandingUploadDir,
  ensurePlatformBannerUploadDir,
  platformBannerUploadDir
} from "./uploadsConfig.js";
import {
  deleteBrandingObjectInS3,
  getBrandingLogoStreamFromS3,
  isS3BrandingConfigured,
  purgeHostedBrandingAssets,
  putBrandingLogoInS3
} from "./brandingLogoStorage.js";
import { validateAnnouncementContent, validatePublicPageSlot } from "./announcementHtml.js";
import { registerTeamChatRoutes } from "./teamChat.js";
import { streamInvoiceProformaPdf } from "./proformaPdf.js";

function authenticate(req, res, next) {
  authenticateJwt(req, res, () => enforcePlatformAccess(req, res, next));
}

const app = express();
app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : 0);

function configuredCorsOrigins() {
  return String(process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

const corsOrigins = configuredCorsOrigins();

function isUuidString(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

const PAYMENT_METHOD_TYPES = new Set([
  "pawapay",
  "onafriq",
  "paypal",
  "binance_pay",
  "crypto_wallet",
  "bank_transfer",
  "cash",
  "mobile_money",
  "gateway",
  "other"
]);

function normalizeMethodType(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function resolvePublicApiBase(req) {
  const explicit = process.env.PUBLIC_API_BASE_URL || process.env.APP_PUBLIC_URL;
  if (explicit) return String(explicit).replace(/\/$/, "");
  const proto = (req.headers["x-forwarded-proto"] || req.protocol || "https").toString().split(",")[0].trim();
  const host = req.headers["x-forwarded-host"] || req.get("host");
  return `${proto}://${host}`;
}

function resolveGatewayCallbackSecret(req) {
  const auth = String(req.get("authorization") || "");
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return (
    req.get("x-gateway-callback-secret") ||
    req.get("x-callback-secret") ||
    req.query.secret ||
    req.body?.secret ||
    ""
  )
    .toString()
    .trim();
}

/** Map CSV row keys (already lowercased / underscored headers) to customer fields. */
function customerImportCells(row) {
  const r = row || {};
  const pick = (...keys) => {
    for (const k of keys) {
      const v = r[k];
      if (v != null && String(v).trim()) return String(v).trim();
    }
    return "";
  };
  const nameCol = pick("name");
  const fullName =
    pick("full_name", "fullname", "customer", "display_name", "displayname") || nameCol;
  const phoneRaw =
    pick("phone", "mobile", "msisdn", "username", "user", "login") || nameCol || fullName;
  const emailRaw = pick("email", "e-mail", "e_mail", "mail");
  const passRaw = pick("password", "secret", "initial_password", "portal_password");
  return { fullName, phoneRaw, emailRaw, passRaw };
}

function teamUserImportCells(row) {
  const r = row || {};
  const pick = (...keys) => {
    for (const k of keys) {
      const v = r[k];
      if (v != null && String(v).trim()) return String(v).trim();
    }
    return "";
  };
  const fullName = pick("full_name", "fullname", "name");
  const email = pick("email", "mail");
  const role = pick("role");
  const password = pick("password", "pass", "secret");
  const accreditationLevel =
    pick("accreditation_level", "accreditationlevel", "accreditation") || "basic";
  return { fullName, email, role, password, accreditationLevel };
}

function allowedRolesForUserImport(requesterRole) {
  const map = {
    super_admin: ["company_manager", "isp_admin", "billing_agent", "noc_operator", "field_agent"],
    company_manager: ["isp_admin", "billing_agent", "noc_operator", "field_agent"],
    isp_admin: ["billing_agent", "noc_operator", "field_agent"]
  };
  return map[requesterRole] || [];
}

const uploadLogoMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }
});

const uploadWifiPortalBannerMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

const uploadCsvMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 }
});

const rlPublicRead = createPublicRateLimiter("public_read", {
  windowMs: Number(process.env.PUBLIC_RL_READ_WINDOW_MS) || 60_000,
  max: Number(process.env.PUBLIC_RL_READ_MAX) || 120
});
const rlSignup = createPublicRateLimiter("signup", {
  windowMs: Number(process.env.PUBLIC_RL_SIGNUP_WINDOW_MS) || 3_600_000,
  max: Number(process.env.PUBLIC_RL_SIGNUP_MAX) || 10
});
const rlWifiInit = createPublicRateLimiter("wifi_init", {
  windowMs: Number(process.env.PUBLIC_RL_WIFI_INIT_WINDOW_MS) || 600_000,
  max: Number(process.env.PUBLIC_RL_WIFI_INIT_MAX) || 25
});
const rlWifiStatus = createPublicRateLimiter("wifi_status", {
  windowMs: Number(process.env.PUBLIC_RL_WIFI_STATUS_WINDOW_MS) || 600_000,
  max: Number(process.env.PUBLIC_RL_WIFI_STATUS_MAX) || 240
});
const rlSubscriberAuth = createPublicRateLimiter("subscriber_auth", {
  windowMs: Number(process.env.PUBLIC_RL_SUBSCRIBER_AUTH_WINDOW_MS) || 900_000,
  max: Number(process.env.PUBLIC_RL_SUBSCRIBER_AUTH_MAX) || 45
});
const rlForgotPassword = createPublicRateLimiter("forgot_password", {
  windowMs: Number(process.env.PUBLIC_RL_FORGOT_PASSWORD_WINDOW_MS) || 3_600_000,
  max: Number(process.env.PUBLIC_RL_FORGOT_PASSWORD_MAX) || 8
});
const rlResetPasswordToken = createPublicRateLimiter("reset_password_token", {
  windowMs: Number(process.env.PUBLIC_RL_RESET_PASSWORD_WINDOW_MS) || 3_600_000,
  max: Number(process.env.PUBLIC_RL_RESET_PASSWORD_MAX) || 24
});
const rlRadiusAcct = createPublicRateLimiter("radius_acct_webhook", {
  windowMs: Number(process.env.PUBLIC_RL_RADIUS_ACCT_WINDOW_MS) || 60_000,
  max: Number(process.env.PUBLIC_RL_RADIUS_ACCT_MAX) || 400
});

app.use(helmet());
app.use(
  cors({
    /** When CORS_ORIGINS is unset, reflect the request Origin so SPA ↔ API on different hosts works (e.g. direct Render URL). */
    origin: corsOrigins.length > 0 ? corsOrigins : true,
    allowedHeaders: ["Content-Type", "Authorization", "X-Portal-Token", "X-ISP-ID", "x-isp-id"]
  })
);
app.use(express.json());
app.use(morgan("dev"));

const PLATFORM_PUBLIC_BASE_URL =
  process.env.PLATFORM_PUBLIC_BASE_URL || "http://localhost:5173";

function extractTenantHost(req) {
  const explicit = req.headers["x-tenant-host"];
  const forwarded = req.headers["x-forwarded-host"];
  const raw = explicit || forwarded || req.headers.host || "";
  const first = Array.isArray(raw) ? raw[0] : String(raw).split(",")[0];
  return first.trim().split(":")[0].toLowerCase();
}

async function logAudit({ ispId = null, actorUserId = null, action, entityType, entityId = null, details = {} }) {
  await query(
    "INSERT INTO audit_logs (id, isp_id, actor_user_id, action, entity_type, entity_id, details) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6::jsonb)",
    [ispId, actorUserId, action, entityType, entityId, JSON.stringify(details)]
  );
}

function resolvePlatformPublicOrigin() {
  const raw = String(
    process.env.PLATFORM_PUBLIC_BASE_URL || process.env.PLATFORM_PUBLIC_APP_URL || PLATFORM_PUBLIC_BASE_URL || ""
  ).trim();
  return raw.replace(/\/$/, "") || "http://localhost:5173";
}

/** Optional PLATFORM_SMTP_* env — no third-party API; link is logged in dev if SMTP is unset. */
async function sendPlatformPasswordResetEmail(toEmail, resetUrl) {
  const host = String(process.env.PLATFORM_SMTP_HOST || "").trim();
  const from = String(process.env.PLATFORM_SMTP_FROM || "").trim();
  if (!host || !from) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.info("[password-reset] Set PLATFORM_SMTP_HOST and PLATFORM_SMTP_FROM to send email; URL:", resetUrl);
    } else {
      // eslint-disable-next-line no-console
      console.warn("[password-reset] PLATFORM_SMTP_* not set — reset email not sent. Configure SMTP or check logs.");
    }
    return { ok: false, skipped: true };
  }
  let nodemailer;
  try {
    nodemailer = await import("nodemailer");
  } catch (_e) {
    return { ok: false, error: "nodemailer unavailable" };
  }
  const transport = nodemailer.createTransport({
    host,
    port: Number(process.env.PLATFORM_SMTP_PORT) || 587,
    secure: String(process.env.PLATFORM_SMTP_SECURE || "").toLowerCase() === "true",
    auth:
      process.env.PLATFORM_SMTP_USER && process.env.PLATFORM_SMTP_PASS
        ? {
            user: String(process.env.PLATFORM_SMTP_USER).trim(),
            pass: String(process.env.PLATFORM_SMTP_PASS).trim()
          }
        : undefined
  });
  const subject = "McBuleli — password reset / réinitialisation du mot de passe";
  const text = `McBuleli — password reset\n\nOpen this link (valid 1 hour):\n${resetUrl}\n\nIf you did not request this, ignore this email.\n\n---\nMcBuleli — réinitialisation\nOuvrez ce lien (valable 1 h) :\n${resetUrl}\n\nSi vous n'avez pas demandé cette réinitialisation, ignorez ce message.`;
  await transport.sendMail({
    from,
    to: toEmail,
    subject,
    text: String(text).slice(0, 50000)
  });
  return { ok: true };
}

app.use(async (req, _res, next) => {
  const host = extractTenantHost(req);
  req.tenantHost = host;
  if (!host || host === "localhost" || host === "127.0.0.1") return next();
  try {
    const tenant = await query(
      `SELECT i.id AS "ispId", i.name, i.subdomain, b.display_name AS "displayName",
              b.logo_url AS "logoUrl", b.logo_bytes AS "logoBytes", b.logo_mime AS "logoMime",
              b.primary_color AS "primaryColor", b.secondary_color AS "secondaryColor"
       FROM isps i
       LEFT JOIN isp_branding b ON b.isp_id = i.id
       WHERE LOWER(i.subdomain) = LOWER($1) OR LOWER(COALESCE(b.custom_domain, '')) = LOWER($1)
       LIMIT 1`,
      [host]
    );
    if (tenant.rows[0]) {
      const r = tenant.rows[0];
      const dataUrl = bufferToDataUrl(r.logoMime, r.logoBytes);
      req.tenantIspId = r.ispId;
      req.tenantContext = {
        ispId: r.ispId,
        name: r.name,
        subdomain: r.subdomain,
        displayName: r.displayName || r.name,
        logoUrl: dataUrl || r.logoUrl || null,
        primaryColor: r.primaryColor,
        secondaryColor: r.secondaryColor
      };
    }
  } catch (_err) {
    // Ignore tenant resolution failures and continue.
  }
  return next();
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

const BRANDING_LOGO_MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif"
};

function bufferToDataUrl(mime, buf) {
  if (!buf || !mime) return null;
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  if (!b.length) return null;
  return `data:${mime};base64,${b.toString("base64")}`;
}

/** Logo in API JSON: data URL when bytes are stored (no separate HTTP fetch; works Vercel + Render). */
function mapPublicBrandingRow(row) {
  if (!row) return null;
  const mime = row.logo_mime ?? row.logoMime;
  const bytes = row.logo_bytes ?? row.logoBytes;
  const dataUrl = bufferToDataUrl(mime, bytes);
  const bannerMime = row.wifi_portal_banner_mime ?? row.wifiPortalBannerMime;
  const bannerBytes = row.wifi_portal_banner_bytes ?? row.wifiPortalBannerBytes;
  const bannerDataUrl = bufferToDataUrl(bannerMime, bannerBytes);
  const out = { ...row };
  delete out.logo_bytes;
  delete out.logo_mime;
  delete out.logoBytes;
  delete out.logoMime;
  delete out.logo_url;
  delete out.wifi_portal_banner_bytes;
  delete out.wifi_portal_banner_mime;
  delete out.wifiPortalBannerBytes;
  delete out.wifiPortalBannerMime;
  const prev = row.logoUrl;
  out.logoUrl = dataUrl || prev || null;
  out.wifiPortalBannerUrl = bannerDataUrl || null;
  return out;
}

function mapPlatformBannerSlideRow(row) {
  if (!row) return null;
  const mime = row.image_mime ?? row.imageMime;
  const bytes = row.image_bytes ?? row.imageBytes;
  const byteLen = Buffer.isBuffer(bytes)
    ? bytes.length
    : bytes == null
      ? 0
      : typeof bytes.length === "number"
        ? bytes.length
        : 0;
  const dataUrl = bufferToDataUrl(mime, bytes);
  const legacyStr =
    row.imageUrl != null || row.image_url != null
      ? String(row.imageUrl ?? row.image_url ?? "").trim()
      : "";
  const imageUrl = dataUrl || (legacyStr || null);
  const slotIndex = row.slot_index ?? row.slotIndex;
  const hasImage = byteLen > 0 || Boolean(legacyStr);
  const rawActive = row.is_active ?? row.isActive;
  const out = {
    slotIndex,
    imageUrl,
    linkUrl: row.link_url ?? row.linkUrl ?? null,
    altText: row.alt_text ?? row.altText ?? null,
    hasImage,
    isActive: rawActive !== false
  };
  if (row.updated_at != null || row.updatedAt != null) {
    out.updatedAt = row.updated_at ?? row.updatedAt;
  }
  return out;
}

function mapAnnouncementRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    ispId: row.isp_id ?? row.ispId,
    title: row.title,
    bodyHtml: row.body_html ?? row.bodyHtml,
    audience: row.audience,
    isActive: row.is_active ?? row.isActive,
    sortOrder: Number(row.sort_order ?? row.sortOrder ?? 0),
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt
  };
}

function mapHomePromoRow(row) {
  if (!row) return null;
  const mime = row.image_mime ?? row.imageMime;
  const bytes = row.image_bytes ?? row.imageBytes;
  const dataUrl = bufferToDataUrl(mime, bytes);
  return {
    slotIndex: row.slot_index ?? row.slotIndex,
    imageUrl: dataUrl,
    linkUrl: row.link_url ?? row.linkUrl ?? null,
    altTextFr: row.alt_text_fr ?? row.altTextFr ?? null,
    altTextEn: row.alt_text_en ?? row.altTextEn ?? null,
    captionFr: normalizePromoAlt(row.caption_fr ?? row.captionFr),
    captionEn: normalizePromoAlt(row.caption_en ?? row.captionEn),
    orientation: row.orientation === "square" ? "square" : "landscape",
    isActive: row.is_active ?? row.isActive !== false,
    updatedAt: row.updated_at ?? row.updatedAt
  };
}

function normalizePublicFooterLayout(raw) {
  return String(raw || "").trim() === "wide" ? "wide" : "card";
}

function normalizePublicFooterPlacement(raw) {
  return String(raw || "").trim() === "after_why" ? "after_why" : "pre_footer";
}

function mapFooterBlockRow(row) {
  if (!row) return null;
  const mime = row.image_mime ?? row.imageMime;
  const bytes = row.image_bytes ?? row.imageBytes;
  const dataUrl = bufferToDataUrl(mime, bytes);
  return {
    id: row.id,
    sortOrder: Number(row.sort_order ?? row.sortOrder ?? 0),
    title: row.title != null ? String(row.title) : "",
    bodyHtml: row.body_html ?? row.bodyHtml ?? "",
    imageUrl: dataUrl,
    linkUrl: row.link_url ?? row.linkUrl ?? null,
    layout: normalizePublicFooterLayout(row.layout),
    placement: normalizePublicFooterPlacement(row.placement),
    isActive: row.is_active ?? row.isActive !== false,
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt
  };
}

function normalizeFounderCaption(raw) {
  const s = raw != null ? String(raw).trim() : "";
  return s.slice(0, 320);
}

function mapFounderShowcaseRow(row) {
  if (!row) return { caption: "", imageUrl: null, updatedAt: null };
  const mime = row.image_mime ?? row.imageMime;
  const bytes = row.image_bytes ?? row.imageBytes;
  return {
    caption: normalizeFounderCaption(row.caption),
    imageUrl: bufferToDataUrl(mime, bytes),
    updatedAt: row.updated_at ?? row.updatedAt ?? null
  };
}

function mapFaqAdRow(row) {
  if (!row) return null;
  const mime = row.image_mime ?? row.imageMime;
  const bytes = row.image_bytes ?? row.imageBytes;
  return {
    id: row.id,
    sortOrder: Number(row.sort_order ?? row.sortOrder ?? 0),
    internalLabel: row.internal_label != null ? String(row.internal_label).slice(0, 160) : "",
    linkUrl: row.link_url ?? row.linkUrl ?? null,
    altTextFr: normalizePromoAlt(row.alt_text_fr ?? row.altTextFr),
    altTextEn: normalizePromoAlt(row.alt_text_en ?? row.altTextEn),
    captionFr: normalizePromoAlt(row.caption_fr ?? row.captionFr),
    captionEn: normalizePromoAlt(row.caption_en ?? row.captionEn),
    imageUrl: bufferToDataUrl(mime, bytes),
    isActive: row.is_active ?? row.isActive !== false,
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt
  };
}

function mapFaqAdRowPublic(row) {
  const m = mapFaqAdRow(row);
  if (!m?.imageUrl) return null;
  return {
    id: m.id,
    linkUrl: m.linkUrl,
    altTextFr: m.altTextFr,
    altTextEn: m.altTextEn,
    captionFr: m.captionFr,
    captionEn: m.captionEn,
    imageUrl: m.imageUrl
  };
}

function normalizePromoAlt(raw) {
  const s = raw != null ? String(raw).trim() : "";
  return s ? s.slice(0, 400) : null;
}

app.get("/api/public/branding-logo/:ispId", rlPublicRead, async (req, res) => {
  const { ispId } = req.params;
  if (!isUuidString(ispId)) return res.status(400).end();
  try {
    const row = await query(
      "SELECT logo_object_key, logo_bytes, logo_mime FROM isp_branding WHERE isp_id = $1",
      [ispId]
    );
    const hosted = row.rows[0];
    if (hosted?.logo_bytes?.length && hosted?.logo_mime) {
      res.type(hosted.logo_mime);
      res.set("Cache-Control", "public, max-age=86400");
      return res.send(hosted.logo_bytes);
    }
    const objectKey = hosted?.logo_object_key;
    if (objectKey && isS3BrandingConfigured()) {
      const { stream, contentType } = await getBrandingLogoStreamFromS3(objectKey);
      res.type(contentType);
      res.set("Cache-Control", "public, max-age=86400");
      stream.on("error", () => {
        try {
          if (!res.headersSent) res.sendStatus(502);
          else res.destroy();
        } catch {
          /* ignore */
        }
      });
      stream.pipe(res);
      return;
    }
  } catch (_err) {
    /* fall through to local disk */
  }
  ensureBrandingUploadDir();
  for (const ext of Object.keys(BRANDING_LOGO_MIME)) {
    const fp = path.join(brandingUploadDir, `${ispId}${ext}`);
    try {
      await fs.promises.access(fp, fs.constants.R_OK);
      res.type(BRANDING_LOGO_MIME[ext]);
      res.set("Cache-Control", "public, max-age=86400");
      return res.sendFile(path.resolve(fp));
    } catch {
      /* try next extension */
    }
  }
  return res.status(404).end();
});

function parsePlatformBannerSlot(param) {
  const n = Number(param);
  if (!Number.isInteger(n) || n < 0 || n > 2) return null;
  return n;
}

app.get("/api/public/platform-banner/:slot", rlPublicRead, async (req, res) => {
  const slot = parsePlatformBannerSlot(req.params.slot);
  if (slot == null) return res.status(400).end();
  const dbRow = await query(
    "SELECT image_bytes, image_mime FROM platform_dashboard_banners WHERE slot_index = $1",
    [slot]
  );
  const b = dbRow.rows[0];
  if (b?.image_bytes?.length && b?.image_mime) {
    res.type(b.image_mime);
    res.set("Cache-Control", "public, max-age=3600");
    return res.send(b.image_bytes);
  }
  ensurePlatformBannerUploadDir();
  for (const ext of Object.keys(BRANDING_LOGO_MIME)) {
    const fp = path.join(platformBannerUploadDir, `${slot}${ext}`);
    try {
      await fs.promises.access(fp, fs.constants.R_OK);
      res.type(BRANDING_LOGO_MIME[ext]);
      res.set("Cache-Control", "public, max-age=3600");
      return res.sendFile(path.resolve(fp));
    } catch {
      /* try next extension */
    }
  }
  return res.status(404).end();
});

app.get("/api/public/home-marketing", rlPublicRead, async (_req, res) => {
  try {
    const [promosR, blocksR, founderR, faqAdsR] = await Promise.all([
      query(
        `SELECT slot_index, link_url, alt_text_fr, alt_text_en, caption_fr, caption_en, orientation, image_bytes, image_mime, is_active, updated_at
         FROM platform_home_promos
         WHERE slot_index BETWEEN 0 AND 2 AND is_active = TRUE
         ORDER BY slot_index`
      ),
      query(
        `SELECT id, sort_order, title, body_html, image_bytes, image_mime, link_url, layout, placement, updated_at
         FROM platform_public_footer_blocks
         WHERE is_active = TRUE
         ORDER BY sort_order ASC, updated_at DESC
         LIMIT 24`
      ),
      query(
        `SELECT caption, image_bytes, image_mime, updated_at FROM platform_public_founder_showcase WHERE id = 1`
      ),
      query(
        `SELECT id, sort_order, internal_label, link_url, alt_text_fr, alt_text_en, caption_fr, caption_en, image_bytes, image_mime, is_active, updated_at
         FROM platform_public_faq_ads
         WHERE is_active = TRUE AND image_bytes IS NOT NULL AND octet_length(image_bytes) > 0
         ORDER BY sort_order ASC, updated_at DESC
         LIMIT 12`
      )
    ]);
    const homePromos = promosR.rows.map(mapHomePromoRow);
    const footerBlocks = blocksR.rows
      .map(mapFooterBlockRow)
      .filter((b) => {
        if (!b) return false;
        const plain = String(b.bodyHtml || "").replace(/<[^>]+>/g, " ").trim();
        return Boolean(plain.length || b.imageUrl || String(b.title || "").trim());
      });
    const founderShowcase = mapFounderShowcaseRow(founderR.rows[0]);
    const faqAds = faqAdsR.rows.map(mapFaqAdRowPublic).filter(Boolean);
    res.json({ homePromos, footerBlocks, founderShowcase, faqAds });
  } catch (_err) {
    res.status(500).json({ message: "Could not load public marketing content." });
  }
});

const TRIAL_DAYS = Math.min(Math.max(Number(process.env.PLATFORM_TRIAL_DAYS || 30), 1), 90);
const SAAS_PLAN_CODES = ["essential", "pro"];
const MFA_REQUIRED_ROLES = new Set(["super_admin", "company_manager", "isp_admin", "field_agent"]);
const MFA_OTP_TTL_MINUTES = Math.min(Math.max(Number(process.env.MFA_OTP_TTL_MINUTES || 10), 1), 60);
const MOBILE_MONEY_WITHDRAWAL_METHODS = ["pawapay"];

function generateOtpCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashOtpCode(code) {
  return crypto.createHash("sha256").update(String(code)).digest("hex");
}

function publicUserPayload(user, extra = {}) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
    ispId: user.isp_id,
    isActive: user.is_active,
    mustChangePassword: user.must_change_password,
    mfaRequired: MFA_REQUIRED_ROLES.has(user.role),
    mfaTotpEnabled: Boolean(user.mfa_totp_enabled),
    chatUsername: user.chat_username ?? null,
    chatAvatarUrl: user.chat_avatar_url ?? null,
    ...extra
  };
}

async function fetchLoginWorkspaceRows(userId) {
  const r = await query(
    `SELECT m.isp_id AS "ispId", m.role,
            m.accreditation_level AS "accreditationLevel", m.phone AS "membershipPhone",
            m.address AS "membershipAddress", m.assigned_site AS "membershipAssignedSite",
            i.name AS "ispName", b.display_name AS "ispDisplayName"
     FROM user_isp_memberships m
     JOIN isps i ON i.id = m.isp_id
     LEFT JOIN isp_branding b ON b.isp_id = m.isp_id
     WHERE m.user_id = $1 AND m.is_active = TRUE
     ORDER BY COALESCE(b.display_name, i.name) ASC`,
    [userId]
  );
  return r.rows;
}

/** Fusionne la ligne user (table users) et le contexte espace (membership) pour JWT + payload. */
function sessionUserFromWorkspaceRow(user, ws) {
  return {
    ...user,
    role: ws.role,
    isp_id: ws.ispId,
    phone: ws.membershipPhone != null ? ws.membershipPhone : user.phone,
    address: ws.membershipAddress != null ? ws.membershipAddress : user.address,
    assigned_site:
      ws.membershipAssignedSite != null ? ws.membershipAssignedSite : user.assigned_site,
    accreditation_level: ws.accreditationLevel || user.accreditation_level
  };
}

async function countActiveStaffInIsp(ispId) {
  const r = await query(
    `SELECT COUNT(DISTINCT m.user_id)::int AS count
     FROM user_isp_memberships m
     JOIN users u ON u.id = m.user_id
     WHERE m.isp_id = $1 AND m.is_active = TRUE AND u.is_active = TRUE`,
    [ispId]
  );
  return r.rows[0]?.count ?? 0;
}

async function fetchTeamUserRow(ispId, userId) {
  const r = await query(
    `SELECT u.id,
            m.isp_id AS "ispId",
            u.full_name AS "fullName",
            u.email,
            m.role,
            m.accreditation_level AS "accreditationLevel",
            m.is_active AS "isActive",
            u.is_active AS "userAccountActive",
            u.must_change_password AS "mustChangePassword",
            m.phone AS "phone",
            m.address AS "address",
            m.assigned_site AS "assignedSite",
            u.created_at AS "createdAt"
     FROM user_isp_memberships m
     JOIN users u ON u.id = m.user_id
     WHERE m.isp_id = $1 AND u.id = $2`,
    [ispId, userId]
  );
  return r.rows[0] || null;
}

async function dashboardPayloadFromDb() {
  const r = await query(
    `SELECT slot_index AS "slotIndex", image_url AS "imageUrl", image_bytes AS "imageBytes", image_mime AS "imageMime",
            link_url AS "linkUrl", alt_text AS "altText", is_active AS "isActive"
     FROM platform_dashboard_banners
     WHERE slot_index BETWEEN 0 AND 2
     ORDER BY slot_index`
  );
  const slides = r.rows
    .filter((row) => row.isActive !== false && (row.imageBytes?.length || row.imageUrl))
    .map((row) => mapPlatformBannerSlideRow(row))
    .filter((s) => s?.imageUrl);
  return slides.length ? { dashboardBanners: slides } : {};
}

async function enrichPayloadWorkspaceDisplayName(basePayload) {
  if (!basePayload.ispId) return basePayload;
  try {
    const r = await query(
      `SELECT i.name AS "ispName", b.display_name AS "ispDisplayName"
       FROM isps i
       LEFT JOIN isp_branding b ON b.isp_id = i.id
       WHERE i.id = $1::uuid`,
      [basePayload.ispId]
    );
    const row = r.rows[0];
    if (!row) return basePayload;
    const label = String(row.ispDisplayName || row.ispName || "").trim();
    if (!label) return basePayload;
    return { ...basePayload, workspaceDisplayName: label };
  } catch (_e) {
    return basePayload;
  }
}

async function attachDashboardPayload(basePayload) {
  const enriched = await enrichPayloadWorkspaceDisplayName(basePayload);
  const fromDb = await dashboardPayloadFromDb();
  if (fromDb.dashboardBanners?.length) return { ...enriched, ...fromDb };
  const dashboardBannerHtml = String(process.env.PLATFORM_DASHBOARD_BANNER_HTML || "").trim();
  return dashboardBannerHtml ? { ...enriched, dashboardBannerHtml } : enriched;
}

function normalizeBannerLinkUrl(raw) {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) return undefined;
  return s.slice(0, 2048);
}

function normalizeBannerAltText(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  return s ? s.slice(0, 240) : null;
}

async function verifyTotpForUser(userId, code) {
  const result = await query(
    "SELECT mfa_totp_secret, mfa_totp_enabled FROM users WHERE id = $1",
    [userId]
  );
  const user = result.rows[0];
  if (!user?.mfa_totp_enabled || !user?.mfa_totp_secret) {
    return { ok: false, message: "Configure Google Authenticator before requesting withdrawals." };
  }
  if (!verifyTotpCode({ secret: user.mfa_totp_secret, code })) {
    return { ok: false, message: "Invalid authenticator code." };
  }
  return { ok: true };
}

async function createMfaChallenge({ user, purpose, metadata = {} }) {
  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + MFA_OTP_TTL_MINUTES * 60 * 1000);
  const inserted = await query(
    `INSERT INTO user_mfa_challenges (id, user_id, purpose, code_hash, metadata, expires_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4::jsonb, $5)
     RETURNING id, purpose, expires_at AS "expiresAt"`,
    [user.id, purpose, hashOtpCode(code), JSON.stringify(metadata), expiresAt.toISOString()]
  );
  const outboxIspId = metadata.ispId || user.isp_id;
  if (outboxIspId) {
    await query(
      `INSERT INTO notification_outbox (id, isp_id, channel, recipient, template_key, payload, status)
       VALUES (gen_random_uuid(), $1, 'internal', $2, $3, $4::jsonb, 'queued')`,
      [
        outboxIspId,
        user.email,
        purpose === "withdrawal" ? "withdrawal_mfa_code" : "login_mfa_code",
        JSON.stringify({
          userId: user.id,
          code,
          purpose,
          expiresAt: expiresAt.toISOString()
        })
      ]
    );
  }
  const delivery = outboxIspId ? "notification_outbox" : "response_dev";
  return {
    ...inserted.rows[0],
    delivery,
    code: process.env.NODE_ENV === "production" ? undefined : code
  };
}

async function verifyMfaChallenge({ userId = null, challengeId, purpose, code }) {
  const params = [challengeId, purpose, hashOtpCode(code)];
  let userPredicate = "";
  if (userId) {
    params.push(userId);
    userPredicate = `AND user_id = $${params.length}`;
  }
  const result = await query(
    `UPDATE user_mfa_challenges
     SET status = 'verified', verified_at = NOW()
     WHERE id = $1::uuid
       ${userPredicate}
       AND purpose = $2
       AND status = 'pending'
       AND expires_at >= NOW()
       AND code_hash = $3
     RETURNING id, user_id AS "userId", metadata`,
    params
  );
  if (result.rows[0]) {
    return {
      ok: true,
      userId: result.rows[0].userId,
      challenge: result.rows[0],
      metadata: result.rows[0].metadata || {}
    };
  }
  const expireParams = [challengeId, purpose];
  let expireUserPredicate = "";
  if (userId) {
    expireParams.push(userId);
    expireUserPredicate = `AND user_id = $${expireParams.length}`;
  }
  await query(
    `UPDATE user_mfa_challenges SET status = 'expired'
     WHERE id = $1::uuid AND purpose = $2 ${expireUserPredicate} AND status = 'pending' AND expires_at < NOW()`,
    expireParams
  );
  return { ok: false };
}

function normalizeRevenueMethod(method) {
  const m = String(method || "").toLowerCase();
  if (m === "cash") return "cash";
  if (m === "manual_mobile_money") return "tid";
  if (MOBILE_MONEY_WITHDRAWAL_METHODS.includes(m)) return "mobileMoney";
  return "other";
}

async function getCashboxSummary(
  ispId,
  from = "1970-01-01",
  to = new Date().toISOString().slice(0, 10),
  fieldAgentUserId = null
) {
  let rows;
  if (fieldAgentUserId) {
    rows = await query(
      `SELECT p.method, COALESCE(SUM(p.amount_usd), 0)::float AS total
       FROM payments p
       INNER JOIN invoices i ON i.id = p.invoice_id AND i.isp_id = p.isp_id
       INNER JOIN customers c ON c.id = i.customer_id AND c.isp_id = i.isp_id
       WHERE p.isp_id = $1 AND p.status = 'confirmed' AND p.paid_at::date BETWEEN $2::date AND $3::date
         AND c.field_agent_id = $4
       GROUP BY p.method`,
      [ispId, from, to, fieldAgentUserId]
    );
  } else {
    rows = await query(
      `SELECT method, COALESCE(SUM(amount_usd), 0)::float AS total
       FROM payments
       WHERE isp_id = $1 AND status = 'confirmed' AND paid_at::date BETWEEN $2::date AND $3::date
       GROUP BY method`,
      [ispId, from, to]
    );
  }
  const breakdown = {
    cashUsd: 0,
    tidUsd: 0,
    mobileMoneyUsd: 0,
    otherUsd: 0,
    totalUsd: 0
  };
  for (const row of rows.rows) {
    const amount = Number(row.total) || 0;
    breakdown.totalUsd += amount;
    const bucket = normalizeRevenueMethod(row.method);
    if (bucket === "cash") breakdown.cashUsd += amount;
    else if (bucket === "tid") breakdown.tidUsd += amount;
    else if (bucket === "mobileMoney") breakdown.mobileMoneyUsd += amount;
    else breakdown.otherUsd += amount;
  }
  if (fieldAgentUserId) {
    return {
      ...breakdown,
      withdrawnMobileMoneyUsd: 0,
      withdrawableMobileMoneyUsd: 0
    };
  }
  const withdrawals = await query(
    `SELECT COALESCE(SUM(amount_usd), 0)::float AS total
     FROM isp_withdrawal_requests
     WHERE isp_id = $1 AND status IN ('requested', 'processing', 'completed')`,
    [ispId]
  );
  const withdrawnUsd = Number(withdrawals.rows[0]?.total) || 0;
  return {
    ...breakdown,
    withdrawnMobileMoneyUsd: withdrawnUsd,
    withdrawableMobileMoneyUsd: Math.max(0, breakdown.mobileMoneyUsd - withdrawnUsd)
  };
}

app.get("/api/public/platform-packages", rlPublicRead, async (_req, res) => {
  const result = await query(
    `SELECT id, code, name, monthly_price_usd AS "monthlyPriceUsd", feature_flags AS "featureFlags"
     FROM platform_packages
     WHERE code = ANY($1::text[])
     ORDER BY monthly_price_usd ASC`,
    [SAAS_PLAN_CODES]
  );
  return res.json(result.rows);
});

app.post("/api/public/signup", rlSignup, async (req, res) => {
  const {
    companyName,
    location,
    contactPhone,
    adminFullName,
    adminEmail,
    adminPassword,
    packageCode,
    subdomain: requestedSubdomain
  } = req.body;
  if (!companyName || !location || !contactPhone || !adminFullName || !adminEmail || !adminPassword) {
    return res.status(400).json({
      message: "companyName, location, contactPhone, adminFullName, adminEmail and adminPassword are required"
    });
  }
  if (!packageCode || !SAAS_PLAN_CODES.includes(String(packageCode))) {
    return res.status(400).json({ message: `packageCode must be one of: ${SAAS_PLAN_CODES.join(", ")}` });
  }
  if (String(adminPassword).length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters" });
  }
  const pkg = await query("SELECT id FROM platform_packages WHERE code = $1", [packageCode]);
  if (!pkg.rows[0]) return res.status(400).json({ message: "Unknown package" });

  const email = String(adminEmail).toLowerCase().trim();
  const dup = await query("SELECT id FROM users WHERE email = $1", [email]);
  if (dup.rows[0]) return res.status(409).json({ message: "An account with this email already exists" });

  const safeSubdomain =
    requestedSubdomain ||
    `${String(companyName)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "tenant"}-${crypto.randomBytes(2).toString("hex")}.tenant.local`;

  const startsAt = new Date();
  const endsAt = new Date(startsAt);
  endsAt.setDate(endsAt.getDate() + TRIAL_DAYS);

  try {
    const insertedIsp = await query(
      "INSERT INTO isps (id, name, location, contact_phone, subdomain) VALUES (gen_random_uuid(), $1, $2, $3, $4) RETURNING id, name, location, subdomain, contact_phone AS \"contactPhone\", created_at AS \"createdAt\"",
      [companyName, location, contactPhone, safeSubdomain]
    );
    const ispId = insertedIsp.rows[0].id;
    await query(
      "INSERT INTO isp_branding (id, isp_id, display_name, contact_phone) VALUES (gen_random_uuid(), $1, $2, $3)",
      [ispId, companyName, contactPhone]
    );
    const hash = await bcrypt.hash(adminPassword, 10);
    const insertedUser = await query(
      `INSERT INTO users (id, isp_id, full_name, email, password_hash, role, accreditation_level, is_active, must_change_password)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'isp_admin', 'basic', TRUE, FALSE)
       RETURNING id, isp_id AS "ispId", full_name AS "fullName", email, role`,
      [ispId, adminFullName, email, hash]
    );
    await query(
      `INSERT INTO user_isp_memberships (user_id, isp_id, role, is_active, accreditation_level)
       VALUES ($1, $2, 'isp_admin', TRUE, 'basic')
       ON CONFLICT (user_id, isp_id) DO NOTHING`,
      [insertedUser.rows[0].id, ispId]
    );
    const insertedSub = await query(
      `INSERT INTO isp_platform_subscriptions (id, isp_id, package_id, status, starts_at, ends_at)
       VALUES (gen_random_uuid(), $1, $2, 'trialing', $3, $4)
       RETURNING id, status, starts_at AS "startsAt", ends_at AS "endsAt"`,
      [ispId, pkg.rows[0].id, startsAt.toISOString(), endsAt.toISOString()]
    );
    await logAudit({
      ispId,
      actorUserId: insertedUser.rows[0].id,
      action: "platform.tenant_self_signup",
      entityType: "isp",
      entityId: ispId,
      details: { packageCode, trialDays: TRIAL_DAYS }
    });
    const userRow = insertedUser.rows[0];
    const token = signToken({
      id: userRow.id,
      role: userRow.role,
      isp_id: userRow.ispId,
      email: userRow.email
    });
    return res.status(201).json({
      token,
      user: {
        id: userRow.id,
        email: userRow.email,
        fullName: userRow.fullName,
        role: userRow.role,
        ispId: userRow.ispId,
        isActive: true,
        mustChangePassword: false
      },
      isp: insertedIsp.rows[0],
      platformSubscription: insertedSub.rows[0],
      trialDays: TRIAL_DAYS
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("signup error", err?.message || err);
    return res.status(500).json({ message: "Could not complete signup. Please try again." });
  }
});

app.post("/api/public/forgot-password", rlForgotPassword, async (req, res) => {
  const email = req.body?.email != null ? String(req.body.email).toLowerCase().trim() : "";
  if (!email || !email.includes("@")) {
    return res.status(400).json({ message: "A valid email address is required." });
  }
  try {
    const result = await query("SELECT id FROM users WHERE email = $1 AND is_active = TRUE", [email]);
    const user = result.rows[0];
    if (user) {
      await query("DELETE FROM password_reset_tokens WHERE user_id = $1", [user.id]);
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
        [user.id, tokenHash, expiresAt.toISOString()]
      );
      const origin = resolvePlatformPublicOrigin();
      const resetUrl = `${origin}/login?reset=${encodeURIComponent(rawToken)}`;
      try {
        await sendPlatformPasswordResetEmail(email, resetUrl);
      } catch (mailErr) {
        // eslint-disable-next-line no-console
        console.error("password reset mail error", mailErr?.message || mailErr);
      }
    }
  } catch (_err) {
    /* generic response below */
  }
  return res.json({
    ok: true,
    message:
      "If an account exists for this email, we sent a link to choose a new password (check spam). The link expires in one hour."
  });
});

app.post("/api/public/reset-password", rlResetPasswordToken, async (req, res) => {
  const token = req.body?.token != null ? String(req.body.token).trim() : "";
  const newPassword = req.body?.newPassword != null ? String(req.body.newPassword) : "";
  if (!token || token.length < 32) {
    return res.status(400).json({ message: "Invalid or missing reset token." });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters." });
  }
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const row = await query(
    `SELECT id, user_id FROM password_reset_tokens WHERE token_hash = $1 AND expires_at > NOW()`,
    [tokenHash]
  );
  const t = row.rows[0];
  if (!t) {
    return res.status(400).json({
      message: "This reset link is invalid or has expired. Request a new password reset from the login page."
    });
  }
  const hash = await bcrypt.hash(newPassword, 10);
  await query(`UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2`, [
    hash,
    t.user_id
  ]);
  await query(`DELETE FROM password_reset_tokens WHERE user_id = $1`, [t.user_id]);
  await logAudit({
    actorUserId: t.user_id,
    action: "user.password_reset_via_token",
    entityType: "user",
    entityId: t.user_id,
    details: {}
  });
  return res.json({ ok: true, message: "Password updated. You can sign in with your new password." });
});

function normalizeAuthCopyBody(raw) {
  const s = raw != null ? String(raw).trim() : "";
  return s.slice(0, 4000);
}

app.get("/api/public/auth-copy", rlPublicRead, async (_req, res) => {
  try {
    const r = await query(
      `SELECT forgot_password_body_fr, forgot_password_body_en FROM platform_auth_copy WHERE id = 1`
    );
    const row = r.rows[0] || {};
    return res.json({
      forgotPasswordBodyFr: row.forgot_password_body_fr ?? "",
      forgotPasswordBodyEn: row.forgot_password_body_en ?? ""
    });
  } catch (_err) {
    return res.json({ forgotPasswordBodyFr: "", forgotPasswordBodyEn: "" });
  }
});

function resolveRequestPublicOrigin(req) {
  const host = extractTenantHost(req) || "localhost";
  const xf = req.headers["x-forwarded-proto"];
  const protoRaw = Array.isArray(xf) ? xf[0] : xf;
  const proto = protoRaw === "https" || protoRaw === "http" ? protoRaw : req.secure ? "https" : "http";
  return `${proto}://${host}`;
}

function buildPwaWebManifest(req) {
  const origin = resolveRequestPublicOrigin(req);
  const icons = [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
  ];

  let partner = null;
  if (req.tenantContext) {
    const raw = req.tenantContext.displayName || req.tenantContext.name;
    const s = raw != null ? String(raw).trim() : "";
    if (s && s !== "AA") partner = s;
  }

  const name = partner ? `${partner} — McBuleli` : "McBuleli ISP";
  const short_name = partner ? (partner.length > 16 ? `${partner.slice(0, 15)}…` : partner) : "McBuleli";

  return {
    id: `${origin}/`,
    name,
    short_name,
    description:
      "Plateforme d'exploitation pour opérateurs FAI : facturation, réseau, portail abonnés.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    dir: "ltr",
    lang: "fr",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    categories: ["business", "finance", "productivity"],
    icons
  };
}

app.get("/api/public/pwa-manifest", rlPublicRead, (req, res) => {
  res.type("application/manifest+json; charset=utf-8");
  res.set("Cache-Control", "public, max-age=600");
  res.json(buildPwaWebManifest(req));
});

app.get("/api/system-owner/auth-copy", authenticate, requireRoles("system_owner"), async (_req, res) => {
  const r = await query(
    `SELECT forgot_password_body_fr, forgot_password_body_en, updated_at FROM platform_auth_copy WHERE id = 1`
  );
  const row = r.rows[0] || {};
  res.json({
    forgotPasswordBodyFr: row.forgot_password_body_fr ?? "",
    forgotPasswordBodyEn: row.forgot_password_body_en ?? "",
    updatedAt: row.updated_at ?? null
  });
});

app.patch("/api/system-owner/auth-copy", authenticate, requireRoles("system_owner"), async (req, res) => {
  const b = req.body || {};
  const cur = await query(
    `SELECT forgot_password_body_fr, forgot_password_body_en FROM platform_auth_copy WHERE id = 1`
  );
  let nextFr = cur.rows[0]?.forgot_password_body_fr ?? "";
  let nextEn = cur.rows[0]?.forgot_password_body_en ?? "";
  if (Object.prototype.hasOwnProperty.call(b, "forgotPasswordBodyFr")) {
    nextFr = normalizeAuthCopyBody(b.forgotPasswordBodyFr);
  }
  if (Object.prototype.hasOwnProperty.call(b, "forgotPasswordBodyEn")) {
    nextEn = normalizeAuthCopyBody(b.forgotPasswordBodyEn);
  }
  await query(
    `INSERT INTO platform_auth_copy (id, forgot_password_body_fr, forgot_password_body_en, updated_at)
     VALUES (1, $1, $2, NOW())
     ON CONFLICT (id) DO UPDATE SET
       forgot_password_body_fr = EXCLUDED.forgot_password_body_fr,
       forgot_password_body_en = EXCLUDED.forgot_password_body_en,
       updated_at = NOW()`,
    [nextFr, nextEn]
  );
  await logAudit({
    actorUserId: req.user.sub,
    action: "platform_auth_copy.updated",
    entityType: "platform_auth_copy",
    entityId: "1",
    details: {}
  });
  const out = await query(
    `SELECT forgot_password_body_fr, forgot_password_body_en, updated_at FROM platform_auth_copy WHERE id = 1`
  );
  const row = out.rows[0] || {};
  res.json({
    forgotPasswordBodyFr: row.forgot_password_body_fr ?? "",
    forgotPasswordBodyEn: row.forgot_password_body_en ?? "",
    updatedAt: row.updated_at ?? null
  });
});

async function handleUnifiedPawapayWebhook(req, res) {
  if (!verifyPawapayCallbackSecret(req)) {
    return res.status(401).json({ message: "Invalid or missing callback secret" });
  }
  try {
    const body = req.body || {};
    const result = await processPawapayCallback(body);
    if (body?.depositId && body?.status === "COMPLETED") {
      const portal = await completePortalInvoicePayment(String(body.depositId));
      if (portal.ok) {
        return res.status(200).json({ ok: true, kind: "deposit", status: body.status, result: portal, handled: "portal_invoice_deposit" });
      }
    }
    if (body?.depositId && body?.status === "FAILED") {
      await markPortalInvoicePaymentFailed(String(body.depositId));
    }
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("pawapay webhook", err?.message || err);
    return res.status(500).json({ message: "Webhook handling failed" });
  }
}

async function completePortalInvoicePayment(depositId) {
  const local = await query(
    `SELECT id, isp_id, invoice_id, customer_id, subscription_id, status
     FROM portal_invoice_payment_sessions
     WHERE deposit_id = $1::uuid`,
    [depositId]
  );
  const session = local.rows[0];
  if (!session) return { ok: false, reason: "unknown_portal_invoice" };
  if (session.status === "completed") return { ok: true, duplicate: true, invoiceId: session.invoice_id };
  if (session.status !== "pending") return { ok: false, reason: "not_pending" };
  const result = await applyInvoicePayment({
    ispId: session.isp_id,
    invoiceId: session.invoice_id,
    providerRef: `pawapay-deposit-${depositId}`,
    status: "confirmed",
    methodType: "pawapay"
  });
  if (!result.ok) return result;
  await query(
    `UPDATE portal_invoice_payment_sessions
     SET status = 'completed', completed_at = NOW()
     WHERE id = $1`,
    [session.id]
  );
  return { ok: true, invoiceId: session.invoice_id, payment: result.payment };
}

async function markPortalInvoicePaymentFailed(depositId) {
  await query(
    `UPDATE portal_invoice_payment_sessions
     SET status = 'failed', completed_at = NOW()
     WHERE deposit_id = $1::uuid AND status = 'pending'`,
    [depositId]
  );
}

app.get("/api/webhooks/pawapay", (_req, res) => {
  return res.json(getPawapayCallbackDocumentation());
});

app.post("/api/webhooks/pawapay", handleUnifiedPawapayWebhook);
app.post("/api/webhooks/pawapay-platform", handleUnifiedPawapayWebhook);

app.post("/api/webhooks/radius-accounting", rlRadiusAcct, async (req, res) => {
  const secret = process.env.RADIUS_ACCOUNTING_WEBHOOK_SECRET;
  if (secret) {
    const headerSecret = req.headers["x-radius-accounting-secret"];
    const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
    if (headerSecret !== secret && bearer !== secret) {
      return res.status(401).json({ message: "Invalid RADIUS accounting webhook credentials" });
    }
  } else if (process.env.NODE_ENV === "production") {
    return res.status(503).json({
      message: "Set RADIUS_ACCOUNTING_WEBHOOK_SECRET to accept accounting webhooks in production"
    });
  }
  const ispId = req.body?.ispId || req.query?.ispId || null;
  if (ispId) {
    const chk = await query("SELECT id FROM isps WHERE id = $1", [ispId]);
    if (!chk.rows[0]) return res.status(400).json({ message: "Unknown ispId" });
  }
  try {
    await insertRadiusAccountingRecord({ ispId, body: req.body || {} });
    return res.status(204).send();
  } catch (err) {
    return res.status(400).json({ message: err?.message || "Could not store accounting record" });
  }
});

app.get("/api/public/mobile-money-networks", rlPublicRead, (_req, res) => {
  return res.json(WIFI_GUEST_NETWORK_OPTIONS.map(({ key, label }) => ({ key, label })));
});

app.get("/api/public/pawapay-networks", rlPublicRead, (_req, res) => {
  return res.json(WIFI_GUEST_NETWORK_OPTIONS.map(({ key, label }) => ({ key, label })));
});

app.get("/api/public/wifi-networks", rlPublicRead, (_req, res) => {
  return res.json(WIFI_GUEST_NETWORK_OPTIONS.map(({ key, label }) => ({ key, label })));
});

app.get("/api/public/wifi-plans", rlPublicRead, async (req, res) => {
  const ispId = req.query.ispId;
  if (!ispId) return res.status(400).json({ message: "ispId query parameter is required" });
  const isp = await query("SELECT id FROM isps WHERE id = $1", [ispId]);
  if (!isp.rows[0]) return res.status(404).json({ message: "ISP not found" });
  const brand = await query(
    `SELECT display_name AS "displayName", logo_url AS "logoUrl", logo_bytes AS "logoBytes", logo_mime AS "logoMime",
            primary_color AS "primaryColor", secondary_color AS "secondaryColor",
            wifi_portal_redirect_url AS "wifiPortalRedirectUrl",
            wifi_portal_banner_bytes AS "wifiPortalBannerBytes", wifi_portal_banner_mime AS "wifiPortalBannerMime",
            contact_email AS "contactEmail", contact_phone AS "contactPhone", address
     FROM isp_branding WHERE isp_id = $1`,
    [ispId]
  );
  const plans = await query(
    `SELECT id, name, price_usd AS "priceUsd", duration_days AS "durationDays", rate_limit AS "rateLimit",
            speed_label AS "speedLabel", default_access_type AS "defaultAccessType", max_devices AS "maxDevices",
            availability_status AS "availabilityStatus", is_published AS "isPublished"
     FROM plans WHERE isp_id = $1 AND is_published = TRUE AND availability_status = 'available'
     ORDER BY price_usd ASC`,
    [ispId]
  );
  return res.json({
    ispId,
    branding: mapPublicBrandingRow(brand.rows[0]) || {},
    plans: plans.rows
  });
});

app.post("/api/public/wifi-purchase/initiate", rlWifiInit, async (req, res) => {
  const { ispId, planId, phoneNumber, networkKey, captiveContext } = req.body || {};
  if (!ispId || !planId || !phoneNumber || !networkKey) {
    return res.status(400).json({ message: "ispId, planId, phoneNumber and networkKey are required" });
  }
  const captive =
    captiveContext && typeof captiveContext === "object"
      ? {
          ip: captiveContext.ip != null ? String(captiveContext.ip).slice(0, 64) : null,
          router: captiveContext.router != null ? String(captiveContext.router).slice(0, 64) : null,
          mac: captiveContext.mac != null ? String(captiveContext.mac).slice(0, 64) : null
        }
      : null;
  const pawapayProvider = resolveWifiGuestPawapayProvider(networkKey);
  if (!pawapayProvider) {
    return res.status(400).json({ message: "networkKey must be one of: orange, airtel, mpesa" });
  }
  const phone = String(phoneNumber).replace(/\s+/g, "").replace(/^\+/, "");
  const planRow = await query(
    `SELECT p.id, p.isp_id AS "ispId", p.name, p.price_usd AS "priceUsd", p.duration_days AS "durationDays",
            p.success_redirect_url AS "successRedirectUrl"
     FROM plans p
     WHERE p.id = $1 AND p.isp_id = $2 AND p.is_published = TRUE AND p.availability_status = 'available'`,
    [planId, ispId]
  );
  const plan = planRow.rows[0];
  if (!plan) return res.status(404).json({ message: "Plan not found or not offered on the public portal" });
  const brandRow = await query(
    'SELECT wifi_portal_redirect_url AS "wifiPortalRedirectUrl" FROM isp_branding WHERE isp_id = $1',
    [ispId]
  );
  const redirectUrl = defaultRedirectUrl(plan, brandRow.rows[0] || {});
  const amount = usdAmountString(plan.priceUsd);
  const depositId = uuidv4();
  const body = {
    depositId,
    amount,
    currency: "USD",
    payer: {
      type: "MMO",
      accountDetails: {
        phoneNumber: phone,
        provider: pawapayProvider
      }
    },
    clientReferenceId: `wifi-guest-${depositId}`.slice(0, 200),
    customerMessage: String(plan.name || "WiFi").replace(/[^a-zA-Z0-9 ]/g, "").slice(0, 22) || "WiFi access"
  };
  try {
    const pw = await initiatePawapayDeposit(body);
    if (pw.status !== "ACCEPTED" && pw.status !== "DUPLICATE_IGNORED") {
      return res.status(400).json({
        message: pw.failureReason?.failureMessage || "Pawapay did not accept this deposit",
        pawapay: pw
      });
    }
    if (pw.status === "ACCEPTED") {
      await query(
        `INSERT INTO wifi_guest_purchases
         (id, isp_id, plan_id, deposit_id, phone, pawapay_provider, currency, amount, status, redirect_url)
         VALUES (gen_random_uuid(), $1, $2, $3::uuid, $4, $5, 'USD', $6, 'pending', $7)`,
        [ispId, planId, depositId, phone, pawapayProvider, amount, redirectUrl]
      );
    }
    await logAudit({
      ispId,
      action: "wifi_guest.purchase_initiated",
      entityType: "wifi_guest_purchase",
      entityId: depositId,
      details: {
        planId,
        networkKey,
        captive:
          captive && (captive.ip || captive.router || captive.mac)
            ? { ip: captive.ip || undefined, router: captive.router || undefined, mac: captive.mac || undefined }
            : undefined
      }
    });
    return res.status(201).json({
      depositId,
      pawapay: pw,
      amount,
      currency: "USD",
      redirectUrlAfterPayment: redirectUrl,
      message:
        pw.status === "ACCEPTED"
          ? "Confirm the payment on your phone. This page will redirect when payment is confirmed."
          : "Duplicate request ignored by Pawapay."
    });
  } catch (err) {
    return res.status(400).json({ message: err.message || "Pawapay initiation failed" });
  }
});

app.get("/api/public/wifi-purchase/status/:depositId", rlWifiStatus, async (req, res) => {
  const { depositId } = req.params;
  const local = await query(
    `SELECT id, status, redirect_url AS "redirectUrl", subscription_id AS "subscriptionId",
            subscriber_setup_token AS "setupToken"
     FROM wifi_guest_purchases WHERE deposit_id = $1::uuid`,
    [depositId]
  );
  const row = local.rows[0];
  if (!row) return res.status(404).json({ message: "Purchase not found" });
  if (row.status === "completed") {
    return res.json({
      status: "completed",
      redirectUrl: row.redirectUrl,
      subscriptionId: row.subscriptionId,
      setupToken: row.setupToken || null
    });
  }
  if (row.status === "failed") {
    return res.json({ status: "failed" });
  }
  try {
    const pw = await fetchPawapayDepositStatus(depositId);
    if (pw.status === "COMPLETED") {
      try {
        const done = await completeWifiGuestPurchase(depositId);
        return res.json({
          status: "completed",
          pawapay: pw,
          redirectUrl: done.redirectUrl || row.redirectUrl,
          subscriptionId: done.subscriptionId,
          setupToken: done.setupToken || null
        });
      } catch (err) {
        return res.status(500).json({ message: err.message || "Could not activate access" });
      }
    }
    if (pw.status === "FAILED") {
      await markWifiGuestPurchaseFailed(depositId);
      return res.json({ status: "failed", pawapay: pw });
    }
    return res.json({ status: "pending", pawapay: pw });
  } catch (err) {
    return res.json({ status: "pending", pawapayError: err.message });
  }
});

app.post("/api/subscriber/auth/login", rlSubscriberAuth, async (req, res) => {
  const { ispId, phone, password } = req.body || {};
  if (!ispId || !phone || !password) {
    return res.status(400).json({ message: "ispId, phone and password are required" });
  }
  const norm = normalizeSubscriberPhone(phone);
  const c = await query(
    `SELECT id, isp_id AS "ispId", password_hash AS "passwordHash", must_set_password AS "mustSetPassword"
     FROM customers WHERE isp_id = $1 AND phone = $2 ORDER BY created_at DESC LIMIT 1`,
    [ispId, norm]
  );
  const row = c.rows[0];
  if (!row?.passwordHash) {
    return res.status(401).json({ message: "Invalid phone or password" });
  }
  const ok = await bcrypt.compare(String(password), row.passwordHash);
  if (!ok) {
    return res.status(401).json({ message: "Invalid phone or password" });
  }
  const token = signSubscriberToken({ id: row.id, isp_id: row.ispId });
  return res.json({ token, mustSetPassword: row.mustSetPassword });
});

app.post("/api/subscriber/auth/setup-password", rlSubscriberAuth, async (req, res) => {
  const { setupToken, newPassword } = req.body || {};
  if (!setupToken || !newPassword) {
    return res.status(400).json({ message: "setupToken and newPassword are required" });
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters" });
  }
  let payload;
  try {
    payload = verifyCustomerSetupToken(setupToken);
  } catch (_e) {
    return res.status(400).json({ message: "Invalid or expired setup link" });
  }
  const hash = await bcrypt.hash(String(newPassword), 10);
  const up = await query(
    `UPDATE customers SET password_hash = $1, must_set_password = FALSE WHERE id = $2 AND isp_id = $3
     RETURNING id, isp_id AS "ispId"`,
    [hash, payload.sub, payload.ispId]
  );
  if (!up.rows[0]) {
    return res.status(404).json({ message: "Customer not found" });
  }
  await query(`UPDATE wifi_guest_purchases SET subscriber_setup_token = NULL WHERE customer_id = $1`, [
    up.rows[0].id
  ]);
  const token = signSubscriberToken({ id: up.rows[0].id, isp_id: up.rows[0].ispId });
  return res.json({ token });
});

app.get("/api/portal/session", authenticatePortal, async (req, res) => {
  const { ispId, customerId } = req.portal;
  const [customer, invoices, subscriptions, brand] = await Promise.all([
    query(
      `SELECT id, full_name AS "fullName", phone, email, status FROM customers WHERE id = $1 AND isp_id = $2`,
      [customerId, ispId]
    ),
    query(
      "SELECT id, subscription_id AS \"subscriptionId\", amount_usd AS \"amountUsd\", status, due_date AS \"dueDate\", created_at AS \"createdAt\" FROM invoices WHERE isp_id = $1 AND customer_id = $2 ORDER BY created_at DESC LIMIT 50",
      [ispId, customerId]
    ),
    query(
      `SELECT s.id, s.plan_id AS "planId", p.name AS "planName", p.price_usd AS "priceUsd",
              p.duration_days AS "durationDays", p.rate_limit AS "rateLimit", p.speed_label AS "speedLabel",
              p.default_access_type AS "defaultAccessType", s.status, s.access_type AS "accessType",
              s.start_date AS "startDate", s.end_date AS "endDate",
              s.max_simultaneous_devices AS "maxSimultaneousDevices"
       FROM subscriptions s
       JOIN plans p ON p.id = s.plan_id
       WHERE s.isp_id = $1 AND s.customer_id = $2
       ORDER BY s.end_date DESC, s.start_date DESC
       LIMIT 20`,
      [ispId, customerId]
    ),
    query(
      `SELECT display_name AS "displayName", logo_url AS "logoUrl", logo_bytes AS "logoBytes", logo_mime AS "logoMime",
              primary_color AS "primaryColor", secondary_color AS "secondaryColor",
              portal_footer_text AS "portalFooterText", portal_client_ref_prefix AS "portalClientRefPrefix",
              wifi_portal_banner_bytes AS "wifiPortalBannerBytes", wifi_portal_banner_mime AS "wifiPortalBannerMime",
              contact_email AS "contactEmail", contact_phone AS "contactPhone", address
       FROM isp_branding WHERE isp_id = $1`,
      [ispId]
    )
  ]);
  const c = customer.rows[0];
  if (!c) return res.status(404).json({ message: "Customer not found" });
  return res.json({
    customer: c,
    invoices: invoices.rows,
    subscriptions: subscriptions.rows,
    branding: mapPublicBrandingRow(brand.rows[0] || null)
  });
});

app.get("/api/portal/announcements", authenticatePortal, async (req, res) => {
  const { ispId } = req.portal;
  const r = await query(
    `SELECT id, isp_id, title, body_html, audience, is_active, sort_order, created_at, updated_at
     FROM isp_announcements
     WHERE isp_id = $1 AND is_active = TRUE AND audience IN ('portal','both')
     ORDER BY sort_order ASC, updated_at DESC LIMIT 10`,
    [ispId]
  );
  res.json({ items: r.rows.map(mapAnnouncementRow) });
});

app.post("/api/portal/tid-submissions", authenticatePortal, async (req, res) => {
  const { ispId, customerId } = req.portal;
  const { invoiceId, tid, submittedByPhone, amountUsd } = req.body;
  if (!invoiceId || !tid) {
    return res.status(400).json({ message: "invoiceId and tid are required" });
  }
  const inv = await query(
    "SELECT id, isp_id, customer_id, subscription_id, amount_usd, status FROM invoices WHERE id = $1 AND isp_id = $2 AND customer_id = $3",
    [invoiceId, ispId, customerId]
  );
  const invoice = inv.rows[0];
  if (!invoice) return res.status(404).json({ message: "Invoice not found" });
  if (!["unpaid", "overdue"].includes(invoice.status)) {
    return res.status(400).json({ message: "This invoice is not open for payment" });
  }
  const duplicateTid = await query(
    "SELECT id, status FROM payment_tid_submissions WHERE isp_id = $1 AND tid = $2 ORDER BY created_at DESC LIMIT 1",
    [invoice.isp_id, tid]
  );
  if (duplicateTid.rows[0] && duplicateTid.rows[0].status !== "rejected") {
    return res.status(409).json({
      message: "This TID is already submitted and awaiting/approved verification."
    });
  }
  const inserted = await query(
    "INSERT INTO payment_tid_submissions (id, isp_id, invoice_id, customer_id, subscription_id, tid, submitted_by_phone, amount_usd, status) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'pending') RETURNING id, isp_id AS \"ispId\", invoice_id AS \"invoiceId\", tid, submitted_by_phone AS \"submittedByPhone\", amount_usd AS \"amountUsd\", status, created_at AS \"createdAt\"",
    [
      invoice.isp_id,
      invoice.id,
      invoice.customer_id,
      invoice.subscription_id,
      tid,
      submittedByPhone || null,
      Number(amountUsd || invoice.amount_usd)
    ]
  );
  await logAudit({
    ispId: invoice.isp_id,
    action: "payment.tid_submitted_portal",
    entityType: "payment_tid_submission",
    entityId: inserted.rows[0].id,
    details: { invoiceId: invoice.id, tid, source: "customer_portal" }
  });
  return res.status(201).json(inserted.rows[0]);
});

app.post("/api/portal/mobile-money/initiate", authenticatePortal, async (req, res) => {
  const { ispId, customerId } = req.portal;
  const { invoiceId, phoneNumber, networkKey, currency = "CDF" } = req.body || {};
  if (!invoiceId || !phoneNumber || !networkKey) {
    return res.status(400).json({ message: "invoiceId, phoneNumber and networkKey are required" });
  }
  const pawapayProvider = resolveWifiGuestPawapayProvider(networkKey);
  if (!pawapayProvider) return res.status(400).json({ message: "networkKey must be one of: orange, airtel, mpesa" });
  const cur = String(currency).toUpperCase();
  if (cur !== "USD" && cur !== "CDF") return res.status(400).json({ message: "currency must be USD or CDF" });
  const invoiceResult = await query(
    `SELECT id, isp_id, customer_id, subscription_id, amount_usd, status
     FROM invoices WHERE id = $1 AND isp_id = $2 AND customer_id = $3`,
    [invoiceId, ispId, customerId]
  );
  const invoice = invoiceResult.rows[0];
  if (!invoice) return res.status(404).json({ message: "Invoice not found" });
  if (!["unpaid", "overdue"].includes(invoice.status)) {
    return res.status(400).json({ message: "This invoice is not open for Mobile Money payment" });
  }
  const depositId = uuidv4();
  const phone = String(phoneNumber).replace(/\s+/g, "").replace(/^\+/, "");
  const amount = cur === "USD" ? usdAmountString(invoice.amount_usd) : cdfAmountForUsd(invoice.amount_usd);
  try {
    await query(
      `INSERT INTO portal_invoice_payment_sessions
       (id, isp_id, customer_id, invoice_id, subscription_id, deposit_id, phone, pawapay_provider, currency, amount, status)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::uuid, $6, $7, $8, $9, 'pending')
       ON CONFLICT (deposit_id) DO NOTHING`,
      [ispId, customerId, invoice.id, invoice.subscription_id, depositId, phone, pawapayProvider, cur, amount]
    );
    const pw = await initiatePawapayDeposit({
      depositId,
      amount,
      currency: cur,
      payer: {
        type: "MMO",
        accountDetails: {
          phoneNumber: phone,
          provider: pawapayProvider
        }
      },
      clientReferenceId: `portal-invoice-${invoiceId}-${depositId}`.slice(0, 200),
      customerMessage: "McBuleli invoice"
    });
    if (pw.status !== "ACCEPTED" && pw.status !== "DUPLICATE_IGNORED") {
      return res.status(400).json({
        message: pw.failureReason?.failureMessage || "Pawapay did not accept this invoice payment",
        pawapay: pw
      });
    }
    await logAudit({
      ispId,
      action: "portal.invoice_mobile_money_initiated",
      entityType: "invoice",
      entityId: invoice.id,
      details: { depositId, currency: cur, amount, networkKey, provider: pawapayProvider }
    });
    return res.status(201).json({
      depositId,
      amount,
      currency: cur,
      pawapay: pw,
      message: "Demande envoyée au téléphone. Validez le PIN Mobile Money."
    });
  } catch (err) {
    return res.status(400).json({ message: err.message || "Pawapay initiation failed" });
  }
});

app.get("/api/portal/mobile-money/status/:depositId", authenticatePortal, async (req, res) => {
  const { ispId, customerId } = req.portal;
  const { depositId } = req.params;
  const local = await query(
    `SELECT id, deposit_id AS "depositId", invoice_id AS "invoiceId", status, amount, currency
     FROM portal_invoice_payment_sessions
     WHERE deposit_id = $1::uuid AND isp_id = $2 AND customer_id = $3`,
    [depositId, ispId, customerId]
  );
  const row = local.rows[0];
  if (!row) return res.status(404).json({ message: "Payment session not found" });
  if (row.status === "completed" || row.status === "failed") return res.json(row);
  try {
    const pw = await fetchPawapayDepositStatus(depositId);
    if (pw.status === "COMPLETED") {
      await completePortalInvoicePayment(depositId);
      return res.json({ ...row, status: "completed", pawapay: pw });
    }
    if (pw.status === "FAILED") {
      await markPortalInvoicePaymentFailed(depositId);
      return res.json({ ...row, status: "failed", pawapay: pw });
    }
    return res.json({ ...row, status: "pending", pawapay: pw });
  } catch (err) {
    return res.json({ ...row, status: "pending", pawapayError: err.message });
  }
});

app.post(
  "/api/portal/tokens",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin", "billing_agent", "field_agent"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const { customerId, expiresDays = 30 } = req.body;
    if (!customerId) return res.status(400).json({ message: "customerId is required" });
    const days = Math.min(Math.max(Number(expiresDays) || 30, 1), 365);
    const cust = await query("SELECT id FROM customers WHERE id = $1 AND isp_id = $2", [customerId, ispId]);
    if (!cust.rows[0]) return res.status(404).json({ message: "Customer not found" });
    const token = crypto.randomBytes(32).toString("hex");
    const inserted = await query(
      `INSERT INTO customer_portal_tokens (id, isp_id, customer_id, token, expires_at, created_by)
       VALUES (gen_random_uuid(), $1, $2, $3, NOW() + ($4::text || ' days')::interval, $5)
       RETURNING id, expires_at AS "expiresAt"`,
      [ispId, customerId, token, String(days), req.user.sub]
    );
    const portalUrl = `${PLATFORM_PUBLIC_BASE_URL}/portal?token=${encodeURIComponent(token)}`;
    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: "portal.token_issued",
      entityType: "customer_portal_token",
      entityId: inserted.rows[0].id,
      details: { customerId, expiresDays: days }
    });
    return res.status(201).json({
      token,
      portalUrl,
      expiresAt: inserted.rows[0].expiresAt
    });
  }
);

app.get("/api/tenant/context", async (req, res) => {
  if (!req.tenantContext) {
    return res.json({ matched: false, host: req.tenantHost || null });
  }
  return res.json({
    matched: true,
    host: req.tenantHost,
    ispId: req.tenantContext.ispId,
    displayName: req.tenantContext.displayName || req.tenantContext.name,
    logoUrl: req.tenantContext.logoUrl || null,
    primaryColor: req.tenantContext.primaryColor || "#1565d8",
    secondaryColor: req.tenantContext.secondaryColor || "#162030"
  });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password, ispId: requestedIspIdRaw } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: "email and password are required" });
  const requestedIspId =
    requestedIspIdRaw != null && String(requestedIspIdRaw).trim() ? String(requestedIspIdRaw).trim() : null;

  const result = await query("SELECT * FROM users WHERE email = $1", [String(email).toLowerCase()]);
  const user = result.rows[0];
  if (!user) return res.status(401).json({ message: "Invalid credentials" });
  const okPass = await bcrypt.compare(password, user.password_hash);
  if (!okPass) return res.status(401).json({ message: "Invalid credentials" });
  if (!user.is_active) return res.status(403).json({ message: "User account is deactivated" });

  if (user.role === "system_owner") {
    if (req.tenantIspId) {
      return res.status(403).json({ message: "This account does not belong to this ISP workspace." });
    }
    if (MFA_REQUIRED_ROLES.has(user.role) && user.mfa_totp_enabled) {
      const challenge = await createMfaChallenge({ user, purpose: "login", metadata: {} });
      return res.status(202).json({
        mfaRequired: true,
        challengeId: challenge.id,
        delivery: challenge.delivery,
        expiresAt: challenge.expiresAt,
        devCode: challenge.code,
        message: "MFA code required. Check the notification outbox or configured SMS provider."
      });
    }
    const token = signToken(user);
    return res.json({ token, user: await attachDashboardPayload(publicUserPayload(user)) });
  }

  const workspaces = await fetchLoginWorkspaceRows(user.id);
  if (!workspaces.length && user.role === "super_admin" && !user.isp_id) {
    if (req.tenantIspId) {
      return res.status(403).json({ message: "This account does not belong to this ISP workspace." });
    }
    if (MFA_REQUIRED_ROLES.has(user.role) && user.mfa_totp_enabled) {
      const challenge = await createMfaChallenge({
        user,
        purpose: "login",
        metadata: { superAdminGlobal: true }
      });
      return res.status(202).json({
        mfaRequired: true,
        challengeId: challenge.id,
        delivery: challenge.delivery,
        expiresAt: challenge.expiresAt,
        devCode: challenge.code,
        message: "MFA code required. Check the notification outbox or configured SMS provider."
      });
    }
    const token = signToken(user);
    return res.json({ token, user: await attachDashboardPayload(publicUserPayload(user)) });
  }

  if (!workspaces.length) {
    return res.status(403).json({ message: "No active workspace for this account." });
  }

  let selected = null;
  if (requestedIspId) {
    selected = workspaces.find((m) => String(m.ispId) === requestedIspId);
    if (!selected) {
      return res.status(403).json({ message: "This account is not part of the selected workspace." });
    }
  } else if (req.tenantIspId) {
    selected = workspaces.find((m) => String(m.ispId) === String(req.tenantIspId));
    if (!selected) {
      return res.status(403).json({ message: "This account does not belong to this ISP workspace." });
    }
  } else if (workspaces.length === 1) {
    selected = workspaces[0];
  } else {
    return res.status(200).json({
      needWorkspaceChoice: true,
      workspaces: workspaces.map((m) => ({
        ispId: m.ispId,
        role: m.role,
        name: m.ispDisplayName || m.ispName || m.ispId
      }))
    });
  }

  const sessionUser = sessionUserFromWorkspaceRow(user, selected);
  if (MFA_REQUIRED_ROLES.has(sessionUser.role) && user.mfa_totp_enabled) {
    const challenge = await createMfaChallenge({
      user: { ...user, isp_id: selected.ispId },
      purpose: "login",
      metadata: { ispId: selected.ispId, role: selected.role }
    });
    return res.status(202).json({
      mfaRequired: true,
      challengeId: challenge.id,
      delivery: challenge.delivery,
      expiresAt: challenge.expiresAt,
      devCode: challenge.code,
      message: "MFA code required. Check the notification outbox or configured SMS provider."
    });
  }

  await query(`UPDATE users SET isp_id = $1, role = $2 WHERE id = $3`, [
    selected.ispId,
    selected.role,
    user.id
  ]);
  const token = signToken(sessionUser);
  return res.json({ token, user: await attachDashboardPayload(publicUserPayload(sessionUser)) });
});

app.post("/api/auth/mfa/verify-login", async (req, res) => {
  const { challengeId, code } = req.body;
  const lookup = await query(
    "SELECT user_id AS \"userId\" FROM user_mfa_challenges WHERE id = $1::uuid AND purpose = 'login'",
    [challengeId]
  );
  const userId = lookup.rows[0]?.userId;
  if (!userId) return res.status(400).json({ message: "Invalid MFA challenge" });
  const verified = await verifyMfaChallenge({ userId, challengeId, code, purpose: "login" });
  if (!verified.ok) return res.status(400).json({ message: "Invalid or expired MFA code" });
  const meta = verified.metadata || verified.challenge?.metadata || {};
  const result = await query("SELECT * FROM users WHERE id = $1", [verified.userId]);
  const user = result.rows[0];
  if (!user || !user.is_active) return res.status(403).json({ message: "User account is inactive" });

  if (user.role === "system_owner" || meta.superAdminGlobal) {
    const token = signToken(user);
    return res.json({ token, user: await attachDashboardPayload(publicUserPayload(user)) });
  }

  const ispId = meta.ispId;
  const roleFromChallenge = meta.role;
  if (!ispId || !roleFromChallenge) {
    return res.status(400).json({ message: "Workspace context missing; please sign in again." });
  }
  const mem = await query(
    `SELECT isp_id AS "ispId", role, accreditation_level AS "accreditationLevel",
            phone AS "membershipPhone", address AS "membershipAddress", assigned_site AS "membershipAssignedSite"
     FROM user_isp_memberships WHERE user_id = $1 AND isp_id = $2::uuid AND is_active = TRUE`,
    [user.id, ispId]
  );
  if (!mem.rows[0]) {
    return res.status(403).json({ message: "Workspace access is no longer active." });
  }
  const ws = mem.rows[0];
  if (String(ws.role) !== String(roleFromChallenge)) {
    return res.status(400).json({ message: "Workspace context outdated; please sign in again." });
  }
  const sessionUser = sessionUserFromWorkspaceRow(user, ws);
  await query(`UPDATE users SET isp_id = $1, role = $2 WHERE id = $3`, [ws.ispId, ws.role, user.id]);
  const token = signToken(sessionUser);
  return res.json({ token, user: await attachDashboardPayload(publicUserPayload(sessionUser)) });
});

app.get("/api/auth/me", authenticate, async (req, res) => {
  const result = await query("SELECT * FROM users WHERE id = $1", [req.user.sub]);
  const user = result.rows[0];
  if (!user) return res.status(404).json({ message: "User not found" });

  let sessionUser = user;
  if (
    user.role !== "system_owner" &&
    !(user.role === "super_admin" && !req.user.ispId) &&
    req.user.ispId
  ) {
    const mem = await query(
      `SELECT isp_id AS "ispId", role, accreditation_level AS "accreditationLevel",
              phone AS "membershipPhone", address AS "membershipAddress", assigned_site AS "membershipAssignedSite"
       FROM user_isp_memberships
       WHERE user_id = $1 AND isp_id = $2::uuid AND is_active = TRUE`,
      [user.id, req.user.ispId]
    );
    if (!mem.rows[0]) {
      return res.status(403).json({ message: "Workspace access revoked or inactive." });
    }
    sessionUser = sessionUserFromWorkspaceRow(user, mem.rows[0]);
  }

  let platformBilling = null;
  if (sessionUser.isp_id) {
    platformBilling = await getPlatformBillingSnapshot(sessionUser.isp_id);
  }
  return res.json(await attachDashboardPayload(publicUserPayload(sessionUser, { platformBilling })));
});

app.post("/api/auth/mfa/totp/setup", authenticate, async (req, res) => {
  const result = await query(
    "SELECT id, email, role, mfa_totp_enabled FROM users WHERE id = $1",
    [req.user.sub]
  );
  const user = result.rows[0];
  if (!user) return res.status(404).json({ message: "User not found" });
  if (!MFA_REQUIRED_ROLES.has(user.role)) {
    return res.status(400).json({ message: "MFA setup is required only for protected roles." });
  }
  const secret = generateTotpSecret();
  await query("UPDATE users SET mfa_totp_secret = $1, mfa_totp_enabled = FALSE WHERE id = $2", [
    secret,
    req.user.sub
  ]);
  return res.json({
    secret,
    otpauthUrl: totpAuthUrl({
      secret,
      accountName: user.email,
      issuer: "McBuleli"
    }),
    enabled: false
  });
});

app.post("/api/auth/mfa/totp/enable", authenticate, async (req, res) => {
  const { code } = req.body;
  const result = await query("SELECT id, mfa_totp_secret FROM users WHERE id = $1", [req.user.sub]);
  const user = result.rows[0];
  if (!user?.mfa_totp_secret) return res.status(400).json({ message: "Start TOTP setup first." });
  if (!verifyTotpCode({ secret: user.mfa_totp_secret, code })) {
    return res.status(400).json({ message: "Invalid authenticator code." });
  }
  await query("UPDATE users SET mfa_totp_enabled = TRUE WHERE id = $1", [req.user.sub]);
  return res.json({ enabled: true });
});

app.post("/api/auth/change-password", authenticate, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ message: "currentPassword and valid newPassword are required" });
  }
  const result = await query("SELECT id, password_hash FROM users WHERE id = $1", [req.user.sub]);
  const user = result.rows[0];
  if (!user) return res.status(404).json({ message: "User not found" });
  const ok = await bcrypt.compare(currentPassword, user.password_hash);
  if (!ok) return res.status(401).json({ message: "Current password is incorrect" });
  const hash = await bcrypt.hash(newPassword, 10);
  await query("UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2", [
    hash,
    req.user.sub
  ]);
  return res.json({ message: "Password changed successfully" });
});

app.post("/api/auth/accept-invite", async (req, res) => {
  const { token, password, fullName } = req.body;
  if (!token || !password || password.length < 6) {
    return res.status(400).json({ message: "token and valid password are required" });
  }
  const inviteResult = await query(
    "SELECT it.id, it.user_id, it.expires_at, it.used_at, u.email FROM invite_tokens it JOIN users u ON u.id = it.user_id WHERE it.token = $1",
    [token]
  );
  const invite = inviteResult.rows[0];
  if (!invite) return res.status(404).json({ message: "Invalid invite token" });
  if (invite.used_at) return res.status(400).json({ message: "Invite token already used" });
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ message: "Invite token expired" });
  }
  const hash = await bcrypt.hash(password, 10);
  await query(
    "UPDATE users SET password_hash = $1, must_change_password = FALSE, is_active = TRUE, full_name = COALESCE($2, full_name) WHERE id = $3",
    [hash, fullName || null, invite.user_id]
  );
  await query("UPDATE invite_tokens SET used_at = NOW() WHERE id = $1", [invite.id]);
  return res.json({ message: "Invite accepted. You can now login.", email: invite.email });
});

app.get("/api/isps", authenticate, async (_req, res) => {
  const result = await query(
    "SELECT id, name, location, subdomain, contact_phone AS \"contactPhone\", is_demo AS \"isDemo\", created_at AS \"createdAt\" FROM isps ORDER BY created_at DESC"
  );
  res.json(result.rows);
});

app.post("/api/isps", authenticate, requireRoles("system_owner", "super_admin"), async (req, res) => {
  const { name, location, contactPhone, subdomain } = req.body;
  if (!name || !location || !contactPhone) return res.status(400).json({ message: "name, location and contactPhone are required" });
  const safeSubdomain =
    subdomain ||
    `${name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "tenant"}-${crypto.randomBytes(2).toString("hex")}.tenant.local`;
  const inserted = await query(
    "INSERT INTO isps (id, name, location, contact_phone, subdomain) VALUES (gen_random_uuid(), $1, $2, $3, $4) RETURNING id, name, location, subdomain, contact_phone AS \"contactPhone\", created_at AS \"createdAt\"",
    [name, location, contactPhone, safeSubdomain]
  );
  await query(
    "INSERT INTO isp_branding (id, isp_id, display_name, contact_phone) VALUES (gen_random_uuid(), $1, $2, $3)",
    [inserted.rows[0].id, name, contactPhone]
  );
  await logAudit({
    action: "isp.created",
    entityType: "isp",
    entityId: inserted.rows[0].id,
    actorUserId: req.user.sub,
    details: { name, location }
  });
  res.status(201).json(inserted.rows[0]);
});

app.get("/api/branding", authenticate, async (req, res) => {
  const ispId = resolveIspId(req, res);
  if (!ispId) return;
  const result = await query(
    "SELECT b.id, b.isp_id AS \"ispId\", b.display_name AS \"displayName\", b.logo_url AS \"logoUrl\", b.logo_bytes AS \"logoBytes\", b.logo_mime AS \"logoMime\", b.primary_color AS \"primaryColor\", b.secondary_color AS \"secondaryColor\", b.invoice_footer AS \"invoiceFooter\", b.address, b.contact_email AS \"contactEmail\", b.contact_phone AS \"contactPhone\", b.custom_domain AS \"customDomain\", b.wifi_portal_redirect_url AS \"wifiPortalRedirectUrl\", b.portal_footer_text AS \"portalFooterText\", b.portal_client_ref_prefix AS \"portalClientRefPrefix\", b.wifi_portal_banner_bytes AS \"wifiPortalBannerBytes\", b.wifi_portal_banner_mime AS \"wifiPortalBannerMime\", i.subdomain FROM isp_branding b JOIN isps i ON i.id = b.isp_id WHERE b.isp_id = $1",
    [ispId]
  );
  res.json(mapPublicBrandingRow(result.rows[0] || null));
});

app.post(
  "/api/branding",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const {
      displayName,
      logoUrl,
      primaryColor,
      secondaryColor,
      invoiceFooter,
      address,
      contactEmail,
      contactPhone,
      customDomain,
      subdomain,
      wifiPortalRedirectUrl,
      portalFooterText,
      portalClientRefPrefix
    } = req.body;
    const limits = await getPlatformFeatureLimits(ispId);
    const allowsPrivateCustomDomain = Boolean(limits?.customDomain);

    const prevBrandingRow = await query("SELECT custom_domain FROM isp_branding WHERE isp_id = $1", [ispId]);
    const prevCustomDomain = (prevBrandingRow.rows[0]?.custom_domain || "").trim();

    if (!allowsPrivateCustomDomain && customDomain !== undefined) {
      const requested = String(customDomain || "").trim();
      if (
        requested &&
        requested.toLowerCase() !== prevCustomDomain.toLowerCase()
      ) {
        return res.status(403).json({
          message:
            "Le domaine DNS privé (marque blanche sur votre propre nom de domaine) est réservé au forfait Premium sur mesure. Les formules Essential et Pro utilisent le sous-domaine technique fourni par la plateforme (ex. *.tenant.local) ou l’accès via l’application hébergée."
        });
      }
    }

    let customDomainForSql = prevCustomDomain || null;
    if (allowsPrivateCustomDomain && customDomain !== undefined) {
      const t = String(customDomain || "").trim();
      customDomainForSql = t.length ? t : null;
    }
    const trimmedLogo =
      logoUrl !== undefined && logoUrl !== null ? String(logoUrl).trim() : null;
    /** Only purge hosted files when replacing with a non-empty logo that is not the hosted path. */
    const clearsStoredLogo =
      trimmedLogo !== null &&
      trimmedLogo.length > 0 &&
      !trimmedLogo.startsWith("/api/public/branding-logo/");
    if (clearsStoredLogo) {
      await purgeHostedBrandingAssets(ispId);
    }
    const logoSqlValue = trimmedLogo === null ? null : trimmedLogo || null;
    const updated = await query(
      `UPDATE isp_branding SET display_name = COALESCE($1, display_name),
        logo_url = COALESCE($2, logo_url),
        primary_color = COALESCE($3, primary_color), secondary_color = COALESCE($4, secondary_color),
        invoice_footer = $5, address = $6, contact_email = $7, contact_phone = $8, custom_domain = $9,
        wifi_portal_redirect_url = COALESCE($10, wifi_portal_redirect_url),
        portal_footer_text = $11, portal_client_ref_prefix = $12, updated_at = NOW() WHERE isp_id = $13 RETURNING id`,
      [
        displayName || null,
        logoSqlValue,
        primaryColor || null,
        secondaryColor || null,
        invoiceFooter || null,
        address || null,
        contactEmail || null,
        contactPhone || null,
        customDomainForSql,
        wifiPortalRedirectUrl !== undefined ? wifiPortalRedirectUrl || null : null,
        portalFooterText || null,
        portalClientRefPrefix || null,
        ispId
      ]
    );
    if (subdomain !== undefined && subdomain !== null) {
      const sd = String(subdomain).trim().toLowerCase();
      if (sd) {
        if (sd.length > 190 || !/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(sd)) {
          return res.status(400).json({
            message:
              "Sous-domaine technique invalide : lettres minuscules, chiffres, points et tirets uniquement (ex. mon-isp.tenant.local)."
          });
        }
        const clash = await query(
          "SELECT id FROM isps WHERE LOWER(subdomain) = LOWER($1) AND id <> $2 LIMIT 1",
          [sd, ispId]
        );
        if (clash.rows[0]) {
          return res.status(409).json({ message: "Ce sous-domaine technique est déjà utilisé par un autre espace." });
        }
        await query("UPDATE isps SET subdomain = $1 WHERE id = $2", [sd, ispId]);
      }
    }
    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: "branding.updated",
      entityType: "branding",
      entityId: updated.rows[0]?.id || null
    });
    const finalResult = await query(
      "SELECT b.id, b.isp_id AS \"ispId\", b.display_name AS \"displayName\", b.logo_url AS \"logoUrl\", b.logo_bytes AS \"logoBytes\", b.logo_mime AS \"logoMime\", b.primary_color AS \"primaryColor\", b.secondary_color AS \"secondaryColor\", b.invoice_footer AS \"invoiceFooter\", b.address, b.contact_email AS \"contactEmail\", b.contact_phone AS \"contactPhone\", b.custom_domain AS \"customDomain\", b.wifi_portal_redirect_url AS \"wifiPortalRedirectUrl\", b.portal_footer_text AS \"portalFooterText\", b.portal_client_ref_prefix AS \"portalClientRefPrefix\", b.wifi_portal_banner_bytes AS \"wifiPortalBannerBytes\", b.wifi_portal_banner_mime AS \"wifiPortalBannerMime\", i.subdomain FROM isp_branding b JOIN isps i ON i.id = b.isp_id WHERE b.isp_id = $1",
      [ispId]
    );
    return res.json(mapPublicBrandingRow(finalResult.rows[0] || null));
  }
);

app.post(
  "/api/branding/logo",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  uploadLogoMemory.single("logo"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    if (!req.file?.buffer) {
      return res.status(400).json({ message: "Choose an image file (logo field)." });
    }
    const mimeToExt = {
      "image/png": ".png",
      "image/jpeg": ".jpg",
      "image/jpg": ".jpg",
      "image/webp": ".webp",
      "image/gif": ".gif"
    };
    const ext = mimeToExt[req.file.mimetype];
    if (!ext) {
      return res.status(400).json({ message: "Logo must be PNG, JPEG, WebP or GIF." });
    }
    const existing = await query("SELECT logo_object_key FROM isp_branding WHERE isp_id = $1", [ispId]);
    const oldKey = existing.rows[0]?.logo_object_key;
    if (oldKey) await deleteBrandingObjectInS3(oldKey);
    await clearBrandingLogoFiles(ispId);

    const publicPath = `/api/public/branding-logo/${ispId}`;
    if (isS3BrandingConfigured()) {
      const objectKey = await putBrandingLogoInS3({
        ispId,
        ext,
        buffer: req.file.buffer,
        contentType: req.file.mimetype
      });
      await query(
        `UPDATE isp_branding SET logo_url = $1, logo_object_key = $2, logo_bytes = $4, logo_mime = $5, updated_at = NOW()
         WHERE isp_id = $3`,
        [publicPath, objectKey, ispId, req.file.buffer, req.file.mimetype]
      );
    } else {
      ensureBrandingUploadDir();
      const fp = path.join(brandingUploadDir, `${ispId}${ext}`);
      await fs.promises.writeFile(fp, req.file.buffer);
      await query(
        `UPDATE isp_branding SET logo_url = $1, logo_object_key = NULL, logo_bytes = $3, logo_mime = $4, updated_at = NOW()
         WHERE isp_id = $2`,
        [publicPath, ispId, req.file.buffer, req.file.mimetype]
      );
    }
    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: "branding.logo_uploaded",
      entityType: "branding",
      entityId: ispId,
      details: { mime: req.file.mimetype }
    });
    const finalResult = await query(
      "SELECT b.id, b.isp_id AS \"ispId\", b.display_name AS \"displayName\", b.logo_url AS \"logoUrl\", b.logo_bytes AS \"logoBytes\", b.logo_mime AS \"logoMime\", b.primary_color AS \"primaryColor\", b.secondary_color AS \"secondaryColor\", b.invoice_footer AS \"invoiceFooter\", b.address, b.contact_email AS \"contactEmail\", b.contact_phone AS \"contactPhone\", b.custom_domain AS \"customDomain\", b.wifi_portal_redirect_url AS \"wifiPortalRedirectUrl\", b.portal_footer_text AS \"portalFooterText\", b.portal_client_ref_prefix AS \"portalClientRefPrefix\", b.wifi_portal_banner_bytes AS \"wifiPortalBannerBytes\", b.wifi_portal_banner_mime AS \"wifiPortalBannerMime\", i.subdomain FROM isp_branding b JOIN isps i ON i.id = b.isp_id WHERE b.isp_id = $1",
      [ispId]
    );
    return res.json(mapPublicBrandingRow(finalResult.rows[0] || null));
  }
);

app.post(
  "/api/branding/wifi-portal-banner",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  uploadWifiPortalBannerMemory.single("banner"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    if (!req.file?.buffer) {
      return res.status(400).json({ message: "Choose an image file (form field name: banner)." });
    }
    const allowed = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);
    if (!allowed.has(req.file.mimetype)) {
      return res.status(400).json({ message: "Image must be PNG, JPEG, WebP or GIF." });
    }
    const ex = await query(`SELECT id FROM isp_branding WHERE isp_id = $1`, [ispId]);
    if (!ex.rows[0]) return res.status(404).json({ message: "Branding not found." });
    await query(
      `UPDATE isp_branding SET wifi_portal_banner_bytes = $1, wifi_portal_banner_mime = $2, updated_at = NOW() WHERE isp_id = $3`,
      [req.file.buffer, req.file.mimetype, ispId]
    );
    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: "branding.wifi_portal_banner_uploaded",
      entityType: "branding",
      entityId: ispId,
      details: { mime: req.file.mimetype }
    });
    const finalResult = await query(
      "SELECT b.id, b.isp_id AS \"ispId\", b.display_name AS \"displayName\", b.logo_url AS \"logoUrl\", b.logo_bytes AS \"logoBytes\", b.logo_mime AS \"logoMime\", b.primary_color AS \"primaryColor\", b.secondary_color AS \"secondaryColor\", b.invoice_footer AS \"invoiceFooter\", b.address, b.contact_email AS \"contactEmail\", b.contact_phone AS \"contactPhone\", b.custom_domain AS \"customDomain\", b.wifi_portal_redirect_url AS \"wifiPortalRedirectUrl\", b.portal_footer_text AS \"portalFooterText\", b.portal_client_ref_prefix AS \"portalClientRefPrefix\", b.wifi_portal_banner_bytes AS \"wifiPortalBannerBytes\", b.wifi_portal_banner_mime AS \"wifiPortalBannerMime\", i.subdomain FROM isp_branding b JOIN isps i ON i.id = b.isp_id WHERE b.isp_id = $1",
      [ispId]
    );
    return res.json(mapPublicBrandingRow(finalResult.rows[0] || null));
  }
);

app.delete("/api/branding/wifi-portal-banner", authenticate, requireRoles("super_admin", "company_manager", "isp_admin"), async (req, res) => {
  const ispId = resolveIspId(req, res);
  if (!ispId) return;
  await query(
    `UPDATE isp_branding SET wifi_portal_banner_bytes = NULL, wifi_portal_banner_mime = NULL, updated_at = NOW() WHERE isp_id = $1`,
    [ispId]
  );
  await logAudit({
    ispId,
    actorUserId: req.user.sub,
    action: "branding.wifi_portal_banner_cleared",
    entityType: "branding",
    entityId: ispId,
    details: {}
  });
  const finalResult = await query(
    "SELECT b.id, b.isp_id AS \"ispId\", b.display_name AS \"displayName\", b.logo_url AS \"logoUrl\", b.logo_bytes AS \"logoBytes\", b.logo_mime AS \"logoMime\", b.primary_color AS \"primaryColor\", b.secondary_color AS \"secondaryColor\", b.invoice_footer AS \"invoiceFooter\", b.address, b.contact_email AS \"contactEmail\", b.contact_phone AS \"contactPhone\", b.custom_domain AS \"customDomain\", b.wifi_portal_redirect_url AS \"wifiPortalRedirectUrl\", b.portal_footer_text AS \"portalFooterText\", b.portal_client_ref_prefix AS \"portalClientRefPrefix\", b.wifi_portal_banner_bytes AS \"wifiPortalBannerBytes\", b.wifi_portal_banner_mime AS \"wifiPortalBannerMime\", i.subdomain FROM isp_branding b JOIN isps i ON i.id = b.isp_id WHERE b.isp_id = $1",
    [ispId]
  );
  if (!finalResult.rows[0]) return res.status(404).json({ message: "Branding not found." });
  return res.json(mapPublicBrandingRow(finalResult.rows[0]));
});

app.get(
  "/api/announcements",
  authenticate,
  requireRoles(
    "system_owner",
    "super_admin",
    "company_manager",
    "isp_admin",
    "billing_agent",
    "noc_operator",
    "field_agent"
  ),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const scope = String(req.query.scope || "");
    const canManage =
      req.user.role === "system_owner" ||
      ["super_admin", "company_manager", "isp_admin"].includes(req.user.role);
    if (scope === "manage") {
      if (!canManage) return res.status(403).json({ message: "Not allowed to manage announcements." });
      const r = await query(
        `SELECT id, isp_id, title, body_html, audience, is_active, sort_order, created_at, updated_at
         FROM isp_announcements WHERE isp_id = $1 ORDER BY sort_order ASC, updated_at DESC`,
        [ispId]
      );
      return res.json({ items: r.rows.map(mapAnnouncementRow) });
    }
    const r = await query(
      `SELECT id, isp_id, title, body_html, audience, is_active, sort_order, created_at, updated_at
       FROM isp_announcements
       WHERE isp_id = $1 AND is_active = TRUE AND audience IN ('staff','both')
       ORDER BY sort_order ASC, updated_at DESC LIMIT 20`,
      [ispId]
    );
    res.json({ items: r.rows.map(mapAnnouncementRow) });
  }
);

app.post(
  "/api/announcements",
  authenticate,
  requireRoles("system_owner", "super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const { title, bodyHtml, audience, sortOrder, isActive } = req.body || {};
    const aud = ["staff", "portal", "both"].includes(audience) ? audience : "staff";
    const v = validateAnnouncementContent(title, bodyHtml);
    if (!v.ok) return res.status(400).json({ message: v.message });
    const sort = Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0;
    const active = isActive !== false;
    const ins = await query(
      `INSERT INTO isp_announcements (isp_id, created_by, title, body_html, audience, is_active, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, isp_id, title, body_html, audience, is_active, sort_order, created_at, updated_at`,
      [ispId, req.user.sub, v.title, v.bodyHtml, aud, active, sort]
    );
    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: "announcement.created",
      entityType: "isp_announcement",
      entityId: ins.rows[0].id,
      details: { audience: aud }
    });
    res.status(201).json(mapAnnouncementRow(ins.rows[0]));
  }
);

app.patch(
  "/api/announcements/:id",
  authenticate,
  requireRoles("system_owner", "super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const { id } = req.params;
    if (!isUuidString(id)) return res.status(400).json({ message: "Invalid id" });
    const own = await query(`SELECT id FROM isp_announcements WHERE id = $1 AND isp_id = $2`, [id, ispId]);
    if (!own.rows[0]) return res.status(404).json({ message: "Announcement not found" });
    const b = req.body || {};
    const pieces = [];
    const vals = [];
    let i = 1;
    if (Object.prototype.hasOwnProperty.call(b, "title") || Object.prototype.hasOwnProperty.call(b, "bodyHtml")) {
      const title = Object.prototype.hasOwnProperty.call(b, "title") ? b.title : undefined;
      const bodyHtml = Object.prototype.hasOwnProperty.call(b, "bodyHtml") ? b.bodyHtml : undefined;
      const cur = await query(`SELECT title, body_html FROM isp_announcements WHERE id = $1`, [id]);
      const row = cur.rows[0];
      const t = title !== undefined ? title : row.title;
      const body = bodyHtml !== undefined ? bodyHtml : row.body_html;
      const v = validateAnnouncementContent(t, body);
      if (!v.ok) return res.status(400).json({ message: v.message });
      pieces.push(`title = $${i++}`, `body_html = $${i++}`);
      vals.push(v.title, v.bodyHtml);
    }
    if (Object.prototype.hasOwnProperty.call(b, "audience")) {
      const aud = ["staff", "portal", "both"].includes(b.audience) ? b.audience : "staff";
      pieces.push(`audience = $${i++}`);
      vals.push(aud);
    }
    if (Object.prototype.hasOwnProperty.call(b, "isActive")) {
      pieces.push(`is_active = $${i++}`);
      vals.push(Boolean(b.isActive));
    }
    if (Object.prototype.hasOwnProperty.call(b, "sortOrder")) {
      pieces.push(`sort_order = $${i++}`);
      vals.push(Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : 0);
    }
    if (pieces.length === 0) return res.status(400).json({ message: "No fields to update" });
    pieces.push("updated_at = NOW()");
    vals.push(id);
    await query(`UPDATE isp_announcements SET ${pieces.join(", ")} WHERE id = $${vals.length}`, vals);
    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: "announcement.updated",
      entityType: "isp_announcement",
      entityId: id,
      details: { fields: Object.keys(b) }
    });
    const r = await query(
      `SELECT id, isp_id, title, body_html, audience, is_active, sort_order, created_at, updated_at
       FROM isp_announcements WHERE id = $1`,
      [id]
    );
    res.json(mapAnnouncementRow(r.rows[0]));
  }
);

app.delete(
  "/api/announcements/:id",
  authenticate,
  requireRoles("system_owner", "super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const { id } = req.params;
    if (!isUuidString(id)) return res.status(400).json({ message: "Invalid id" });
    const del = await query(`DELETE FROM isp_announcements WHERE id = $1 AND isp_id = $2 RETURNING id`, [id, ispId]);
    if (!del.rows[0]) return res.status(404).json({ message: "Announcement not found" });
    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: "announcement.deleted",
      entityType: "isp_announcement",
      entityId: id
    });
    res.status(204).end();
  }
);

registerTeamChatRoutes(app);

app.get("/api/platform/packages", authenticate, async (_req, res) => {
  const result = await query(
    "SELECT id, code, name, monthly_price_usd AS \"monthlyPriceUsd\", feature_flags AS \"featureFlags\" FROM platform_packages ORDER BY monthly_price_usd ASC"
  );
  res.json(result.rows);
});

app.get("/api/platform/subscriptions", authenticate, async (req, res) => {
  const ispId = resolveIspId(req, res);
  if (!ispId) return;
  const result = await query(
    "SELECT s.id, s.isp_id AS \"ispId\", s.package_id AS \"packageId\", p.name AS \"packageName\", p.code AS \"packageCode\", s.status, s.starts_at AS \"startsAt\", s.ends_at AS \"endsAt\" FROM isp_platform_subscriptions s JOIN platform_packages p ON p.id = s.package_id WHERE s.isp_id = $1 ORDER BY s.created_at DESC",
    [ispId]
  );
  res.json(result.rows);
});

app.post("/api/platform/subscriptions", authenticate, requireRoles("super_admin"), async (req, res) => {
  const { ispId, packageId, durationDays = 30 } = req.body;
  if (!ispId || !packageId) return res.status(400).json({ message: "ispId and packageId are required" });
  const startsAt = new Date();
  const endsAt = new Date(startsAt);
  endsAt.setDate(endsAt.getDate() + Number(durationDays));
  const inserted = await query(
    "INSERT INTO isp_platform_subscriptions (id, isp_id, package_id, status, starts_at, ends_at) VALUES (gen_random_uuid(), $1, $2, 'active', $3, $4) RETURNING id, isp_id AS \"ispId\", package_id AS \"packageId\", status, starts_at AS \"startsAt\", ends_at AS \"endsAt\"",
    [ispId, packageId, startsAt.toISOString(), endsAt.toISOString()]
  );
  await logAudit({
    ispId,
    actorUserId: req.user.sub,
    action: "platform.subscription.assigned",
    entityType: "platform_subscription",
    entityId: inserted.rows[0].id,
    details: { packageId, durationDays: Number(durationDays) }
  });
  res.status(201).json(inserted.rows[0]);
});

app.get("/api/platform/billing/status", authenticate, async (req, res) => {
  const ispId = resolveIspId(req, res);
  if (!ispId) return;
  const snapshot = await getPlatformBillingSnapshot(ispId);
  return res.json(snapshot);
});

app.get("/api/platform/billing/networks", authenticate, (_req, res) => {
  return res.json(WIFI_GUEST_NETWORK_OPTIONS.map(({ key, label }) => ({ key, label })));
});

app.post(
  "/api/platform/billing/initiate-deposit",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const { currency, phoneNumber, networkKey, provider, packageId } = req.body;
    const pawapayProvider = provider ? String(provider).trim() : resolveWifiGuestPawapayProvider(networkKey);
    if (!currency || !phoneNumber || !pawapayProvider) {
      return res.status(400).json({ message: "currency, phoneNumber and networkKey are required" });
    }
    const cur = String(currency).toUpperCase();
    if (cur !== "USD" && cur !== "CDF") {
      return res.status(400).json({ message: "currency must be USD or CDF" });
    }
    const sub = await getLatestPlatformSubscription(ispId);
    if (!sub) return res.status(400).json({ message: "No platform subscription on file for this workspace" });
    const targetPackageId = packageId || sub.packageId;
    const pkgRow = await query(
      `SELECT id, code, monthly_price_usd AS "monthlyPriceUsd"
       FROM platform_packages
       WHERE id = $1 AND code = ANY($2::text[])`,
      [targetPackageId, SAAS_PLAN_CODES]
    );
    const monthlyUsd = pkgRow.rows[0]?.monthlyPriceUsd;
    if (monthlyUsd == null) return res.status(400).json({ message: "Package not found" });
    const amount = cur === "USD" ? usdAmountString(monthlyUsd) : cdfAmountForUsd(monthlyUsd);
    const depositId = uuidv4();
    const phone = String(phoneNumber).replace(/\s+/g, "").replace(/^\+/, "");
    const body = {
      depositId,
      amount,
      currency: cur,
      payer: {
        type: "MMO",
        accountDetails: {
          phoneNumber: phone,
          provider: pawapayProvider
        }
      },
      clientReferenceId: `saas-${ispId}-${sub.id}-${pkgRow.rows[0].code}`.slice(0, 200),
      customerMessage: "McBuleli plan"
    };
    try {
      const pw = await initiatePawapayDeposit(body);
      if (pw.status !== "ACCEPTED" && pw.status !== "DUPLICATE_IGNORED") {
        return res.status(400).json({
          message: pw.failureReason?.failureMessage || "Pawapay did not accept this deposit request",
          pawapay: pw
        });
      }
      if (pw.status === "ACCEPTED" || pw.status === "DUPLICATE_IGNORED") {
        await query(
          `INSERT INTO platform_saas_deposit_sessions
           (id, isp_id, platform_subscription_id, target_package_id, deposit_id, amount, currency, provider, phone_number, status, pawapay_init_status)
           VALUES (gen_random_uuid(), $1, $2, $3, $4::uuid, $5, $6, $7, $8, 'initiated', $9)
           ON CONFLICT (deposit_id) DO NOTHING`,
          [ispId, sub.id, targetPackageId, depositId, amount, cur, pawapayProvider, phone, pw.status || null]
        );
      }
      await logAudit({
        ispId,
        actorUserId: req.user.sub,
        action: "platform.billing.deposit_initiated",
        entityType: "platform_saas_deposit",
        entityId: depositId,
        details: { currency: cur, amount, networkKey, provider: pawapayProvider, targetPackageId }
      });
      return res.status(201).json({
        depositId,
        pawapay: pw,
        amount,
        currency: cur,
        message:
          pw.status === "ACCEPTED"
            ? "Payment prompt sent to the handset. Complete the PIN step; we will extend your subscription when Pawapay confirms."
            : pw.failureReason?.failureMessage || "See pawapay.status"
      });
    } catch (err) {
      return res.status(400).json({ message: err.message || "Pawapay initiation failed" });
    }
  }
);

app.get(
  "/api/withdrawals",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const rows = await query(
      `SELECT id, amount_usd AS "amountUsd", currency, phone_number AS "phoneNumber", provider,
              status, payout_id AS "payoutId", pawapay_init_status AS "pawapayInitStatus",
              mobile_money_basis_usd AS "mobileMoneyBasisUsd", failure_message AS "failureMessage",
              requested_by AS "requestedBy", created_at AS "createdAt", completed_at AS "completedAt"
       FROM isp_withdrawal_requests
       WHERE isp_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [ispId]
    );
    return res.json({
      cashbox: await getCashboxSummary(ispId),
      items: rows.rows
    });
  }
);

app.post(
  "/api/withdrawals",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const { amountUsd, currency = "USD", phoneNumber, networkKey, provider, mfaCode } = req.body;
    const requestedAmount = Number(amountUsd);
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      return res.status(400).json({ message: "Withdrawal amount must be greater than 0. Test amounts like 0.50 USD or 1000 CDF are allowed." });
    }
    const cur = String(currency).toUpperCase();
    if (cur !== "USD" && cur !== "CDF") return res.status(400).json({ message: "currency must be USD or CDF" });
    const amountUsdForBalance = cur === "CDF" ? usdAmountForCdf(requestedAmount) : requestedAmount;
    const pawapayProvider = provider ? String(provider).trim() : resolveWifiGuestPawapayProvider(networkKey);
    if (!phoneNumber || !pawapayProvider || !mfaCode) {
      return res.status(400).json({ message: "phoneNumber, networkKey and mfaCode are required" });
    }
    const mfa = await verifyTotpForUser(req.user.sub, mfaCode);
    if (!mfa.ok) return res.status(400).json({ message: mfa.message || "Invalid authenticator code" });
    const cashbox = await getCashboxSummary(ispId);
    if (amountUsdForBalance > cashbox.withdrawableMobileMoneyUsd) {
      return res.status(400).json({
        message:
          "Withdrawal amount exceeds confirmed Pawapay balance after currency conversion. Cash and TID payments are not withdrawable.",
        requestedAmount,
        requestedCurrency: cur,
        requestedAmountUsd: amountUsdForBalance,
        cashbox
      });
    }
    const payoutId = uuidv4();
    const phone = String(phoneNumber).replace(/\s+/g, "").replace(/^\+/, "");
    const payoutAmount = cur === "USD" ? usdAmountString(requestedAmount) : String(Math.round(requestedAmount));
    let pawapay = null;
    let status = "requested";
    let failureMessage = null;
    try {
      pawapay = await initiatePawapayPayout({
        payoutId,
        amount: payoutAmount,
        currency: cur,
        recipient: {
          type: "MMO",
          accountDetails: {
            phoneNumber: phone,
            provider: pawapayProvider
          }
        },
        clientReferenceId: `withdrawal-${ispId}-${payoutId}`.slice(0, 200),
        customerMessage: "McBuleli withdrawal"
      });
      status = pawapay.status === "ACCEPTED" || pawapay.status === "DUPLICATE_IGNORED" ? "processing" : "failed";
      failureMessage =
        pawapay.status === "ACCEPTED" || pawapay.status === "DUPLICATE_IGNORED"
          ? null
          : pawapay.failureReason?.failureMessage || "Pawapay did not accept payout request";
    } catch (err) {
      status = "failed";
      failureMessage = err.message || "Pawapay payout initiation failed";
    }
    const inserted = await query(
      `INSERT INTO isp_withdrawal_requests
       (id, isp_id, amount_usd, currency, phone_number, provider, status, payout_id, pawapay_init_status,
        mobile_money_basis_usd, failure_message, requested_by, mfa_challenge_id)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7::uuid, $8, $9, $10, $11, NULL)
       RETURNING id, amount_usd AS "amountUsd", currency, phone_number AS "phoneNumber", provider, status,
                 payout_id AS "payoutId", pawapay_init_status AS "pawapayInitStatus",
                 mobile_money_basis_usd AS "mobileMoneyBasisUsd", failure_message AS "failureMessage",
                 created_at AS "createdAt"`,
      [
        ispId,
        amountUsdForBalance,
        cur,
        phone,
        pawapayProvider,
        status,
        payoutId,
        pawapay?.status || null,
        cashbox.mobileMoneyUsd,
        failureMessage,
        req.user.sub
      ]
    );
    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: "withdrawal.requested",
      entityType: "withdrawal",
      entityId: inserted.rows[0].id,
      details: {
        requestedAmount,
        requestedCurrency: cur,
        amountUsd: amountUsdForBalance,
        networkKey,
        provider: pawapayProvider,
        payoutId,
        status
      }
    });
    return res.status(201).json({ withdrawal: inserted.rows[0], pawapay, cashbox: await getCashboxSummary(ispId) });
  }
);

app.get(
  "/api/platform/billing/deposit-status/:depositId",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const { depositId } = req.params;
    const local = await query(
      "SELECT id, deposit_id AS \"depositId\", status, amount, currency, provider FROM platform_saas_deposit_sessions WHERE deposit_id = $1::uuid AND isp_id = $2",
      [depositId, ispId]
    );
    if (!local.rows[0]) return res.status(404).json({ message: "Deposit session not found" });
    try {
      const pw = await fetchPawapayDepositStatus(depositId);
      if (pw.status === "COMPLETED") {
        await applySuccessfulSaasDeposit(depositId);
      } else if (pw.status === "FAILED") {
        await markSaasDepositFailed(depositId);
      }
      return res.json({ pawapay: pw, local: local.rows[0] });
    } catch (err) {
      return res.status(400).json({ message: err.message || "Status check failed", local: local.rows[0] });
    }
  }
);

app.post(
  "/api/platform/billing/upgrade-plan",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (_req, res) =>
    res.status(410).json({
      message:
        "Plan changes must be paid through Mobile Money. Call /api/platform/billing/initiate-deposit with packageId."
    })
);

app.get("/api/payment-methods", authenticate, async (req, res) => {
  const ispId = resolveIspId(req, res);
  if (!ispId) return;
  const result = await query(
    "SELECT id, isp_id AS \"ispId\", method_type AS \"methodType\", provider_name AS \"providerName\", config_json AS \"config\", is_active AS \"isActive\", created_at AS \"createdAt\" FROM isp_payment_methods WHERE isp_id = $1 ORDER BY created_at DESC",
    [ispId]
  );
  res.json(result.rows);
});

app.post(
  "/api/payment-methods",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const { methodType, providerName, config = {}, isActive = true } = req.body;
    if (!methodType || !providerName) {
      return res.status(400).json({ message: "methodType and providerName are required" });
    }
    const normalizedMethodType = normalizeMethodType(methodType);
    if (!PAYMENT_METHOD_TYPES.has(normalizedMethodType)) {
      return res.status(400).json({
        message: `Unsupported methodType. Allowed: ${Array.from(PAYMENT_METHOD_TYPES).join(", ")}`
      });
    }
    const limits = await getPlatformFeatureLimits(ispId);
    const customGatewayTypes = new Set(["pawapay", "onafriq", "paypal", "binance_pay", "crypto_wallet", "gateway"]);
    if (customGatewayTypes.has(normalizedMethodType) && !limits?.customPaymentGateway) {
      return res.status(403).json({
        message: "Votre formule actuelle utilise le compte Pawapay McBuleli. Passez à Pro ou Premium pour ajouter votre propre agrégateur."
      });
    }
    const inserted = await query(
      "INSERT INTO isp_payment_methods (id, isp_id, method_type, provider_name, config_json, is_active, created_by) VALUES (gen_random_uuid(), $1, $2, $3, $4::jsonb, $5, $6) RETURNING id, isp_id AS \"ispId\", method_type AS \"methodType\", provider_name AS \"providerName\", config_json AS \"config\", is_active AS \"isActive\", created_at AS \"createdAt\"",
      [ispId, normalizedMethodType, providerName, JSON.stringify(config), Boolean(isActive), req.user.sub]
    );
    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: "payment_method.created",
      entityType: "payment_method",
      entityId: inserted.rows[0].id,
      details: { methodType, providerName }
    });
    return res.status(201).json(inserted.rows[0]);
  }
);

app.post(
  "/api/payment-methods/:methodId/callback-secret",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const { methodId } = req.params;
    const method = await query(
      "SELECT id, method_type AS \"methodType\", provider_name AS \"providerName\", config_json AS \"config\" FROM isp_payment_methods WHERE id = $1 AND isp_id = $2",
      [methodId, ispId]
    );
    if (!method.rows[0]) {
      return res.status(404).json({ message: "Payment method not found" });
    }
    const secret = crypto.randomBytes(24).toString("hex");
    await query(
      `UPDATE isp_payment_methods
       SET config_json = COALESCE(config_json, '{}'::jsonb) || jsonb_build_object('callbackSecret', $1, 'callbackEnabled', true)
       WHERE id = $2 AND isp_id = $3`,
      [secret, methodId, ispId]
    );
    const callbackUrl = `${resolvePublicApiBase(req)}/api/public/payment-gateways/${methodId}/callback`;
    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: "payment_method.callback_secret_rotated",
      entityType: "payment_method",
      entityId: methodId,
      details: { methodType: method.rows[0].methodType, providerName: method.rows[0].providerName }
    });
    return res.json({
      methodId,
      methodType: method.rows[0].methodType,
      providerName: method.rows[0].providerName,
      callbackUrl,
      callbackSecret: secret,
      expectedHeader: "x-gateway-callback-secret",
      examplePayload: {
        invoiceId: "uuid-de-la-facture",
        providerRef: "txn-12345",
        amountUsd: 10,
        status: "confirmed"
      }
    });
  }
);

app.post(
  "/api/payment-methods/:methodId/test-callback",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const { methodId } = req.params;
    const method = await query(
      `SELECT id, method_type AS "methodType", provider_name AS "providerName", is_active AS "isActive"
       FROM isp_payment_methods WHERE id = $1 AND isp_id = $2`,
      [methodId, ispId]
    );
    const pm = method.rows[0];
    if (!pm) return res.status(404).json({ message: "Payment method not found" });
    if (!pm.isActive) return res.status(400).json({ message: "Payment method is inactive" });

    const body = req.body || {};
    let invoiceId = body.invoiceId || body.invoice_id;
    if (!invoiceId) {
      const inv = await query(
        `SELECT id FROM invoices
         WHERE isp_id = $1 AND status IN ('unpaid', 'overdue')
         ORDER BY created_at ASC
         LIMIT 1`,
        [ispId]
      );
      invoiceId = inv.rows[0]?.id || null;
    }
    if (!invoiceId) {
      return res.status(404).json({ message: "No unpaid invoice found. Provide invoiceId to test callback." });
    }

    const result = await applyInvoicePayment({
      ispId,
      invoiceId,
      providerRef:
        body.providerRef ||
        body.provider_ref ||
        `test-${pm.methodType}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
      amountUsd: body.amountUsd ?? body.amount_usd,
      status: body.status || "confirmed",
      methodType: pm.methodType
    });
    if (!result.ok) return res.status(result.code || 400).json({ message: result.message || "Test callback rejected" });
    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: "payment_method.test_callback",
      entityType: "payment_method",
      entityId: methodId,
      details: { methodType: pm.methodType, invoiceId, activated: Boolean(result.activated) }
    });
    return res.json({
      ok: true,
      methodType: pm.methodType,
      providerName: pm.providerName,
      invoiceId,
      activated: Boolean(result.activated),
      duplicate: Boolean(result.duplicate),
      payment: result.payment
    });
  }
);

app.post(
  "/api/payment-methods/:methodId/toggle",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const { methodId } = req.params;
    const { isActive } = req.body;
    const updated = await query(
      "UPDATE isp_payment_methods SET is_active = $1 WHERE id = $2 AND isp_id = $3 RETURNING id, is_active AS \"isActive\"",
      [Boolean(isActive), methodId, ispId]
    );
    if (!updated.rows[0]) return res.status(404).json({ message: "Payment method not found" });
    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: "payment_method.toggled",
      entityType: "payment_method",
      entityId: methodId,
      details: { isActive: Boolean(isActive) }
    });
    return res.json(updated.rows[0]);
  }
);

app.get("/api/role-profiles", authenticate, async (req, res) => {
  const ispId = resolveIspId(req, res);
  if (!ispId) return;
  const result = await query(
    "SELECT id, isp_id AS \"ispId\", role_key AS \"roleKey\", accreditation_level AS \"accreditationLevel\", permissions, is_active AS \"isActive\" FROM isp_role_profiles WHERE isp_id = $1 ORDER BY role_key ASC",
    [ispId]
  );
  res.json(result.rows);
});

app.post(
  "/api/role-profiles",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const { roleKey, accreditationLevel = "basic", permissions = [] } = req.body;
    if (!roleKey) return res.status(400).json({ message: "roleKey is required" });
    const upsert = await query(
      "INSERT INTO isp_role_profiles (id, isp_id, role_key, accreditation_level, permissions, is_active) VALUES (gen_random_uuid(), $1, $2, $3, $4::jsonb, TRUE) ON CONFLICT (isp_id, role_key) DO UPDATE SET accreditation_level = EXCLUDED.accreditation_level, permissions = EXCLUDED.permissions RETURNING id, isp_id AS \"ispId\", role_key AS \"roleKey\", accreditation_level AS \"accreditationLevel\", permissions, is_active AS \"isActive\"",
      [ispId, roleKey, accreditationLevel, JSON.stringify(permissions)]
    );
    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: "role_profile.upserted",
      entityType: "role_profile",
      entityId: upsert.rows[0].id,
      details: { roleKey, accreditationLevel }
    });
    res.json(upsert.rows[0]);
  }
);

app.get("/api/audit-logs", authenticate, requireRoles("system_owner"), async (req, res) => {
  const ispId = resolveIspId(req, res);
  if (!ispId) return res.json([]);
  const result = await query(
    "SELECT id, action, entity_type AS \"entityType\", entity_id AS \"entityId\", details, created_at AS \"createdAt\" FROM audit_logs WHERE isp_id = $1 ORDER BY created_at DESC LIMIT 100",
    [ispId]
  );
  res.json(result.rows);
});

app.get(
  "/api/notifications/outbox",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const result = await query(
      "SELECT id, isp_id AS \"ispId\", channel, recipient, template_key AS \"templateKey\", payload, status, attempts, last_error AS \"lastError\", sent_at AS \"sentAt\", next_attempt_at AS \"nextAttemptAt\", created_at AS \"createdAt\" FROM notification_outbox WHERE isp_id = $1 ORDER BY created_at DESC LIMIT 200",
      [ispId]
    );
    res.json(result.rows);
  }
);

app.get(
  "/api/notification-providers",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const result = await query(
      "SELECT id, isp_id AS \"ispId\", channel, provider_key AS \"providerKey\", config_json AS config, is_active AS \"isActive\", updated_at AS \"updatedAt\" FROM isp_notification_providers WHERE isp_id = $1 ORDER BY channel ASC",
      [ispId]
    );
    res.json(result.rows);
  }
);

app.post(
  "/api/notification-providers",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const { channel, providerKey = "webhook", config = {}, isActive = true } = req.body;
    if (!["sms", "email", "whatsapp"].includes(channel)) {
      return res.status(400).json({ message: "channel must be sms, email, or whatsapp" });
    }
    if (!["webhook", "twilio", "smtp"].includes(providerKey)) {
      return res.status(400).json({ message: "providerKey must be webhook, twilio, or smtp" });
    }
    if (providerKey === "twilio" && !["sms", "whatsapp"].includes(channel)) {
      return res.status(400).json({ message: "Twilio supports sms and whatsapp channels only" });
    }
    if (providerKey === "smtp" && channel !== "email") {
      return res.status(400).json({ message: "SMTP provider is only valid for the email channel" });
    }
    const result = await query(
      "INSERT INTO isp_notification_providers (id, isp_id, channel, provider_key, config_json, is_active, created_by, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, $4::jsonb, $5, $6, NOW()) ON CONFLICT (isp_id, channel) DO UPDATE SET provider_key = EXCLUDED.provider_key, config_json = EXCLUDED.config_json, is_active = EXCLUDED.is_active, updated_at = NOW() RETURNING id, isp_id AS \"ispId\", channel, provider_key AS \"providerKey\", config_json AS config, is_active AS \"isActive\", updated_at AS \"updatedAt\"",
      [ispId, channel, providerKey, JSON.stringify(config || {}), Boolean(isActive), req.user.sub]
    );
    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: "notification_provider.upserted",
      entityType: "notification_provider",
      entityId: result.rows[0].id,
      details: { channel, providerKey, isActive: Boolean(isActive) }
    });
    res.json(result.rows[0]);
  }
);

app.post(
  "/api/notifications/process",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const stats = await processNotificationOutboxBatch({
      ispId,
      limit: 50,
      maxAttempts: Number(process.env.NOTIFICATION_MAX_ATTEMPTS || 5)
    });
    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: "notification.worker.trigger",
      entityType: "notification_outbox",
      entityId: null,
      details: stats
    });
    res.json(stats);
  }
);

app.post(
  "/api/notifications/test",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const { channel, recipient, message } = req.body;
    if (!["sms", "email", "whatsapp"].includes(channel)) {
      return res.status(400).json({ message: "channel must be sms, email, or whatsapp" });
    }
    if (!recipient || String(recipient).trim().length < 3) {
      return res.status(400).json({ message: "recipient is required" });
    }
    const result = await sendNotificationDirect({
      ispId,
      channel,
      recipient: String(recipient).trim(),
      templateKey: "notification_test",
      payload: {
        message: String(message || "This is a test notification from your ISP platform."),
        source: "manual-test"
      }
    });
    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: "notification.test.sent",
      entityType: "notification_provider",
      entityId: null,
      details: {
        channel,
        recipient: String(recipient).trim(),
        ok: Boolean(result.ok),
        error: result.error || null
      }
    });
    if (!result.ok) {
      return res.status(400).json({ message: result.error || "Test notification failed" });
    }
    return res.json({
      ok: true,
      channel,
      recipient: String(recipient).trim(),
      providerMessageId: result.providerMessageId || null
    });
  }
);

app.get(
  "/api/network/nodes",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin", "noc_operator"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const result = await query(
      "SELECT id, isp_id AS \"ispId\", name, host, api_port AS \"apiPort\", use_tls AS \"useTls\", username, default_pppoe_profile AS \"defaultPppoeProfile\", default_hotspot_profile AS \"defaultHotspotProfile\", is_default AS \"isDefault\", is_active AS \"isActive\", created_at AS \"createdAt\" FROM isp_network_nodes WHERE isp_id = $1 ORDER BY is_default DESC, created_at ASC",
      [ispId]
    );
    res.json(result.rows);
  }
);

app.post(
  "/api/network/nodes",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const {
      name,
      host,
      apiPort = 443,
      useTls = true,
      username,
      password,
      defaultPppoeProfile = "default",
      defaultHotspotProfile = "default",
      isDefault = false,
      isActive = true
    } = req.body;
    if (!name || !host || !username || !password) {
      return res.status(400).json({ message: "name, host, username and password are required" });
    }
    const limits = await getPlatformFeatureLimits(ispId);
    const maxNodes = limits?.maxNetworkNodes;
    if (Number.isFinite(maxNodes)) {
      const count = await query("SELECT COUNT(*)::int AS c FROM isp_network_nodes WHERE isp_id = $1", [ispId]);
      if (count.rows[0].c >= maxNodes) {
        return res.status(403).json({
          message: `Your McBuleli plan allows up to ${maxNodes} network node(s). Upgrade to Business to add more.`
        });
      }
    }
    const encryptedPassword = encryptSecret(password);
    const inserted = await query(
      "INSERT INTO isp_network_nodes (id, isp_id, name, host, api_port, use_tls, username, password, password_enc, default_pppoe_profile, default_hotspot_profile, is_default, is_active, created_by) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id, isp_id AS \"ispId\", name, host, api_port AS \"apiPort\", use_tls AS \"useTls\", username, default_pppoe_profile AS \"defaultPppoeProfile\", default_hotspot_profile AS \"defaultHotspotProfile\", is_default AS \"isDefault\", is_active AS \"isActive\", created_at AS \"createdAt\"",
      [
        ispId,
        name,
        host,
        Number(apiPort || 443),
        Boolean(useTls),
        username,
        encryptedPassword,
        encryptedPassword,
        defaultPppoeProfile,
        defaultHotspotProfile,
        Boolean(isDefault),
        Boolean(isActive),
        req.user.sub
      ]
    );
    if (Boolean(isDefault)) {
      await query("UPDATE isp_network_nodes SET is_default = FALSE WHERE isp_id = $1 AND id <> $2", [
        ispId,
        inserted.rows[0].id
      ]);
    }
    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: "network_node.created",
      entityType: "network_node",
      entityId: inserted.rows[0].id,
      details: { host, useTls: Boolean(useTls), isDefault: Boolean(isDefault), isActive: Boolean(isActive) }
    });
    res.status(201).json(inserted.rows[0]);
  }
);

app.get(
  "/api/network/freeradius-sync-events",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin", "noc_operator"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const result = await query(
      "SELECT id, subscription_id AS \"subscriptionId\", username, action, status, details, created_at AS \"createdAt\" FROM freeradius_sync_events WHERE isp_id = $1 ORDER BY created_at DESC LIMIT 200",
      [ispId]
    );
    return res.json(result.rows);
  }
);

app.post(
  "/api/network/nodes/:nodeId/toggle",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const { nodeId } = req.params;
    const { isActive } = req.body;
    const updated = await query(
      "UPDATE isp_network_nodes SET is_active = $1 WHERE id = $2 AND isp_id = $3 RETURNING id, isp_id AS \"ispId\", name, host, api_port AS \"apiPort\", use_tls AS \"useTls\", username, default_pppoe_profile AS \"defaultPppoeProfile\", default_hotspot_profile AS \"defaultHotspotProfile\", is_default AS \"isDefault\", is_active AS \"isActive\", created_at AS \"createdAt\"",
      [Boolean(isActive), nodeId, ispId]
    );
    if (!updated.rows[0]) return res.status(404).json({ message: "Node not found" });
    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: "network_node.toggled",
      entityType: "network_node",
      entityId: nodeId,
      details: { isActive: Boolean(isActive) }
    });
    res.json(updated.rows[0]);
  }
);

app.post(
  "/api/network/nodes/:nodeId/default",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const { nodeId } = req.params;
    const exists = await query("SELECT id FROM isp_network_nodes WHERE id = $1 AND isp_id = $2", [nodeId, ispId]);
    if (!exists.rows[0]) return res.status(404).json({ message: "Node not found" });
    await query("UPDATE isp_network_nodes SET is_default = (id = $1) WHERE isp_id = $2", [nodeId, ispId]);
    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: "network_node.default_set",
      entityType: "network_node",
      entityId: nodeId
    });
    return res.json({ message: "Default node updated" });
  }
);

app.get(
  "/api/network/provisioning-events",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin", "noc_operator"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const result = await query(
      "SELECT id, node_id AS \"nodeId\", subscription_id AS \"subscriptionId\", action, access_type AS \"accessType\", status, details, created_at AS \"createdAt\" FROM network_provisioning_events WHERE isp_id = $1 ORDER BY created_at DESC LIMIT 200",
      [ispId]
    );
    return res.json(result.rows);
  }
);

app.post(
  "/api/network/subscriptions/:subscriptionId/sync",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin", "noc_operator"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const { subscriptionId } = req.params;
    const { action = "activate" } = req.body;
    if (!["activate", "suspend"].includes(action)) {
      return res.status(400).json({ message: "action must be activate or suspend" });
    }
    const result = await provisionSubscriptionAccess({ ispId, subscriptionId, action });
    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: "network_subscription.sync",
      entityType: "subscription",
      entityId: subscriptionId,
      details: { action, ok: result.ok, skipped: Boolean(result.skipped), message: result.message || null }
    });
    if (!result.ok) return res.status(400).json({ message: result.message || "Provisioning failed" });
    return res.json(result);
  }
);

app.get(
  "/api/network/telemetry-snapshots",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin", "noc_operator", "billing_agent", "field_agent"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const limit = Math.min(Math.max(Number(req.query.limit) || 80, 1), 500);
    const result = await query(
      `SELECT t.id, t.isp_id AS "ispId", t.node_id AS "nodeId", n.name AS "nodeName",
              t.pppoe_active AS "pppoeActive", t.hotspot_active AS "hotspotActive",
              t.connected_devices AS "connectedDevices", t.details, t.created_at AS "createdAt"
       FROM network_telemetry_snapshots t
       JOIN isp_network_nodes n ON n.id = t.node_id
       WHERE t.isp_id = $1
       ORDER BY t.created_at DESC
       LIMIT $2`,
      [ispId, limit]
    );
    return res.json(result.rows);
  }
);

app.get(
  "/api/network/radius-accounting-ingest",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin", "noc_operator", "billing_agent", "field_agent"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const result = await query(
      `SELECT id, isp_id AS "ispId", username, acct_session_id AS "acctSessionId", acct_status_type AS "acctStatusType",
              nas_ip_address AS "nasIpAddress", framed_ip_address AS "framedIpAddress",
              acct_input_octets AS "acctInputOctets", acct_output_octets AS "acctOutputOctets",
              event_time AS "eventTime", created_at AS "createdAt"
       FROM radius_accounting_ingest
       WHERE isp_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [ispId, limit]
    );
    return res.json(result.rows);
  }
);

app.get(
  "/api/network/online-sessions",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin", "noc_operator", "billing_agent", "field_agent"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const limit = Math.min(Math.max(Number(req.query.limit) || 80, 1), 500);
    const windowMinutes = Math.min(Math.max(Number(req.query.windowMinutes) || 30, 1), 24 * 60);
    const result = await listOnlineSubscriberSessions({
      ispId,
      limit,
      windowMinutes
    });
    return res.json(result);
  }
);

app.post(
  "/api/network/nodes/:nodeId/collect-telemetry",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin", "noc_operator"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const { nodeId } = req.params;
    try {
      const result = await collectAndStoreNetworkTelemetry({ ispId, nodeId });
      await logAudit({
        ispId,
        actorUserId: req.user.sub,
        action: "network.telemetry_collected",
        entityType: "network_node",
        entityId: nodeId,
        details: result
      });
      if (!result.ok) {
        return res.status(400).json({ message: result.message || "Telemetry collection failed" });
      }
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ message: err?.message || "Telemetry collection failed" });
    }
  }
);

app.post(
  "/api/billing/process-overdue",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin", "noc_operator", "billing_agent"),
  async (req, res) => {
    const stats = await processOverdueInvoices();
    const subscriptionExpiry = await processExpiredSubscriptions();
    const auditIspId =
      req.user.role === "super_admin"
        ? req.query.ispId || req.body.ispId || null
        : req.user.ispId || req.tenantIspId || null;
    await logAudit({
      ispId: auditIspId,
      actorUserId: req.user.sub,
      action: "billing.overdue_processed",
      entityType: "billing_job",
      entityId: null,
      details: { ...stats, subscriptionExpiry }
    });
    return res.json({ ...stats, subscriptionExpiry });
  }
);

app.post(
  "/api/billing/generate-renewals",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin", "noc_operator", "billing_agent"),
  async (req, res) => {
    const stats = await processRenewalInvoices();
    const auditIspId =
      req.user.role === "super_admin"
        ? req.query.ispId || req.body.ispId || null
        : req.user.ispId || req.tenantIspId || null;
    await logAudit({
      ispId: auditIspId,
      actorUserId: req.user.sub,
      action: "billing.renewals_generated",
      entityType: "billing_job",
      entityId: null,
      details: stats
    });
    return res.json(stats);
  }
);

app.get(
  "/api/users",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
  const ispId = resolveIspId(req, res);
  if (!ispId) return;
  const result = await query(
    `SELECT u.id,
            m.isp_id AS "ispId",
            u.full_name AS "fullName",
            u.email,
            m.role,
            m.accreditation_level AS "accreditationLevel",
            m.is_active AS "isActive",
            u.is_active AS "userAccountActive",
            u.must_change_password AS "mustChangePassword",
            m.phone AS "phone",
            m.address AS "address",
            m.assigned_site AS "assignedSite",
            u.created_at AS "createdAt"
     FROM user_isp_memberships m
     JOIN users u ON u.id = m.user_id
     WHERE m.isp_id = $1
     ORDER BY u.created_at DESC`,
    [ispId]
  );
    return res.json(result.rows);
  }
);

app.get(
  "/api/users/export",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const result = await query(
      `SELECT u.full_name AS "fullName", u.email, m.role, m.accreditation_level AS "accreditationLevel",
              m.is_active AS "isActive", u.created_at AS "createdAt"
       FROM user_isp_memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.isp_id = $1
       ORDER BY u.created_at DESC`,
      [ispId]
    );
    const headers = ["fullName", "email", "role", "accreditationLevel", "isActive", "createdAt"];
    const csv = rowsToCsv(headers, result.rows);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="team-users-export-${String(ispId).slice(0, 8)}.csv"`
    );
    res.send(csv);
  }
);

app.post(
  "/api/users/import",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  uploadCsvMemory.fields([
    { name: "file", maxCount: 1 },
    { name: "defaultPassword", maxCount: 1 },
    { name: "defaultRole", maxCount: 1 }
  ]),
  async (req, res) => {
    const targetIspId = resolveIspId(req, res);
    if (!targetIspId) return;
    const fileBuf = req.files?.file?.[0]?.buffer;
    if (!fileBuf) {
      return res.status(400).json({ message: "CSV file is required (form field name: file)." });
    }
    const allowed = allowedRolesForUserImport(req.user.role);
    const defaultRoleRaw =
      req.body?.defaultRole != null ? String(req.body.defaultRole).trim() : "billing_agent";
    const roleDefault = allowed.includes(defaultRoleRaw) ? defaultRoleRaw : null;
    if (!roleDefault) {
      return res.status(400).json({
        message: `defaultRole must be one of: ${allowed.join(", ")}`
      });
    }
    const defPass = req.body?.defaultPassword != null ? String(req.body.defaultPassword).trim() : "";

    const limits = await query(
      "SELECT p.feature_flags AS \"featureFlags\" FROM isp_platform_subscriptions s JOIN platform_packages p ON p.id = s.package_id WHERE s.isp_id = $1 AND s.status IN ('trialing', 'active') AND s.ends_at >= NOW() ORDER BY s.ends_at DESC LIMIT 1",
      [targetIspId]
    );
    const maxUsers = limits.rows[0]?.featureFlags?.maxUsers;

    const csvText = fileBuf.toString("utf8");
    const { rows } = parseCsv(csvText);
    if (!rows.length) {
      return res.status(400).json({ message: "CSV has no data rows below the header." });
    }

    const created = [];
    const skipped = [];
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const lineNo = i + 2;
      const c = teamUserImportCells(rows[i]);
      if (!c.fullName || !c.email) {
        errors.push({ line: lineNo, message: "fullName and email are required." });
        continue;
      }
      const emailLower = c.email.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLower)) {
        errors.push({ line: lineNo, message: "Invalid email." });
        continue;
      }
      const role = (c.role && allowed.includes(c.role) ? c.role : roleDefault) || roleDefault;
      if (!allowed.includes(role)) {
        errors.push({ line: lineNo, message: `Role not allowed for your account: ${c.role || ""}` });
        continue;
      }
      const exists = await query("SELECT id FROM users WHERE LOWER(email) = LOWER($1)", [emailLower]);
      if (exists.rows[0]) {
        const uid = exists.rows[0].id;
        const memExists = await query(
          "SELECT 1 FROM user_isp_memberships WHERE user_id = $1 AND isp_id = $2",
          [uid, targetIspId]
        );
        if (memExists.rows[0]) {
          skipped.push({ line: lineNo, email: emailLower, reason: "already_in_workspace" });
          continue;
        }
        if (Number.isFinite(maxUsers) && (await countActiveStaffInIsp(targetIspId)) >= maxUsers) {
          errors.push({ line: lineNo, message: `Active user limit reached (${maxUsers}).` });
          continue;
        }
        try {
          await query("UPDATE users SET full_name = $1 WHERE id = $2", [c.fullName, uid]);
          await query(
            `INSERT INTO user_isp_memberships (user_id, isp_id, role, accreditation_level, is_active)
             VALUES ($1, $2, $3, $4, TRUE)`,
            [uid, targetIspId, role, c.accreditationLevel || "basic"]
          );
          const row = await fetchTeamUserRow(targetIspId, uid);
          if (row) created.push(row);
        } catch (err) {
          errors.push({ line: lineNo, message: err?.message || "Insert failed" });
        }
        continue;
      }

      const password = c.password && c.password.length >= 6 ? c.password : defPass;
      if (!password || password.length < 6) {
        errors.push({
          line: lineNo,
          message: "Set a password column (min 6 chars) or send defaultPassword for rows without one."
        });
        continue;
      }

      if (Number.isFinite(maxUsers) && (await countActiveStaffInIsp(targetIspId)) >= maxUsers) {
        errors.push({ line: lineNo, message: `Active user limit reached (${maxUsers}).` });
        continue;
      }

      try {
        const hash = await bcrypt.hash(password, 10);
        const inserted = await query(
          "INSERT INTO users (id, isp_id, full_name, email, password_hash, role, accreditation_level, is_active, must_change_password) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, TRUE, TRUE) RETURNING id",
          [targetIspId, c.fullName, emailLower, hash, role, c.accreditationLevel || "basic"]
        );
        const newId = inserted.rows[0].id;
        await query(
          `INSERT INTO user_isp_memberships (user_id, isp_id, role, accreditation_level, is_active)
           VALUES ($1, $2, $3, $4, TRUE)`,
          [newId, targetIspId, role, c.accreditationLevel || "basic"]
        );
        const row = await fetchTeamUserRow(targetIspId, newId);
        if (row) created.push(row);
      } catch (err) {
        errors.push({ line: lineNo, message: err?.message || "Insert failed" });
      }
    }

    await logAudit({
      ispId: targetIspId,
      actorUserId: req.user.sub,
      action: "users.imported",
      entityType: "user",
      entityId: null,
      details: { created: created.length, skipped: skipped.length, errors: errors.length }
    });

    return res.json({
      createdCount: created.length,
      skipped,
      errors,
      sample: created.slice(0, 5)
    });
  }
);

app.post(
  "/api/users",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
  const targetIspId = resolveIspId(req, res);
  if (!targetIspId) return;

  const { fullName, email, password, role, accreditationLevel = "basic", phone, address, assignedSite } = req.body;
  if (!fullName || !email || !role) {
    return res.status(400).json({ message: "fullName, email and role are required" });
  }

  const allowedRolesByRequester = {
    super_admin: ["company_manager", "isp_admin", "billing_agent", "noc_operator", "field_agent"],
    company_manager: ["isp_admin", "billing_agent", "noc_operator", "field_agent"],
    isp_admin: ["billing_agent", "noc_operator", "field_agent"]
  };

  const allowed = allowedRolesByRequester[req.user.role] || [];
  if (!allowed.includes(role)) {
    return res.status(403).json({ message: "You cannot create this role" });
  }

  if (req.user.role !== "super_admin" && role === "super_admin") {
    return res.status(403).json({ message: "Forbidden role assignment" });
  }

  const emailLower = String(email).toLowerCase();
  const limits = await query(
    "SELECT p.feature_flags AS \"featureFlags\" FROM isp_platform_subscriptions s JOIN platform_packages p ON p.id = s.package_id WHERE s.isp_id = $1 AND s.status IN ('trialing', 'active') AND s.ends_at >= NOW() ORDER BY s.ends_at DESC LIMIT 1",
    [targetIspId]
  );
  const maxUsers = limits.rows[0]?.featureFlags?.maxUsers;

  const existingUser = await query("SELECT id FROM users WHERE email = $1", [emailLower]);
  if (existingUser.rows[0]) {
    const uid = existingUser.rows[0].id;
    const dupMem = await query(
      "SELECT 1 FROM user_isp_memberships WHERE user_id = $1 AND isp_id = $2",
      [uid, targetIspId]
    );
    if (dupMem.rows[0]) {
      return res.status(409).json({ message: "This user is already in this workspace." });
    }
    if (Number.isFinite(maxUsers) && (await countActiveStaffInIsp(targetIspId)) >= maxUsers) {
      return res.status(403).json({
        message: `User limit reached for current package (${maxUsers} active users).`
      });
    }
    await query("UPDATE users SET full_name = $1 WHERE id = $2", [fullName, uid]);
    await query(
      `INSERT INTO user_isp_memberships (user_id, isp_id, role, accreditation_level, phone, address, assigned_site, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)`,
      [uid, targetIspId, role, accreditationLevel, phone || null, address || null, assignedSite || null]
    );
    await logAudit({
      ispId: targetIspId,
      actorUserId: req.user.sub,
      action: "user.workspace_linked",
      entityType: "user",
      entityId: uid,
      details: { role, accreditationLevel, email: emailLower }
    });
    const row = await fetchTeamUserRow(targetIspId, uid);
    return res.status(201).json(row);
  }

  if (!password || String(password).length < 6) {
    return res.status(400).json({ message: "password is required (min 6 characters) for new accounts" });
  }
  if (Number.isFinite(maxUsers) && (await countActiveStaffInIsp(targetIspId)) >= maxUsers) {
    return res.status(403).json({
      message: `User limit reached for current package (${maxUsers} active users).`
    });
  }

  const hash = await bcrypt.hash(password, 10);
  const inserted = await query(
    `INSERT INTO users
     (id, isp_id, full_name, email, password_hash, role, accreditation_level, phone, address, assigned_site, is_active, must_change_password)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, TRUE)
     RETURNING id`,
    [
      targetIspId,
      fullName,
      emailLower,
      hash,
      role,
      accreditationLevel,
      phone || null,
      address || null,
      assignedSite || null
    ]
  );
  const newId = inserted.rows[0].id;
  await query(
    `INSERT INTO user_isp_memberships (user_id, isp_id, role, accreditation_level, phone, address, assigned_site, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)`,
    [newId, targetIspId, role, accreditationLevel, phone || null, address || null, assignedSite || null]
  );
  await logAudit({
    ispId: targetIspId,
    actorUserId: req.user.sub,
    action: "user.created",
    entityType: "user",
    entityId: newId,
    details: { role, accreditationLevel, email: emailLower }
  });
  const row = await fetchTeamUserRow(targetIspId, newId);
  return res.status(201).json(row);
  }
);

app.post(
  "/api/users/:userId/reset-password",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
  const targetIspId = resolveIspId(req, res);
  if (!targetIspId) return;
  const { userId } = req.params;
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ message: "newPassword must be at least 6 characters" });
  }

  const existing = await query(
    `SELECT u.id, m.role FROM users u
     JOIN user_isp_memberships m ON m.user_id = u.id AND m.isp_id = $2
     WHERE u.id = $1`,
    [userId, targetIspId]
  );
  const targetUser = existing.rows[0];
  if (!targetUser) return res.status(404).json({ message: "User not found" });
  if (req.user.role !== "super_admin" && targetUser.role === "super_admin") {
    return res.status(403).json({ message: "Forbidden target user" });
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await query("UPDATE users SET password_hash = $1, must_change_password = TRUE WHERE id = $2", [
    hash,
    userId
  ]);
  await logAudit({
    ispId: targetIspId,
    actorUserId: req.user.sub,
    action: "user.password_reset",
    entityType: "user",
    entityId: userId
  });
  return res.json({ message: "Password reset successful" });
  }
);

app.post(
  "/api/users/:userId/deactivate",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
  const targetIspId = resolveIspId(req, res);
  if (!targetIspId) return;
  const { userId } = req.params;
  const existing = await query(
    `SELECT m.role FROM user_isp_memberships m WHERE m.user_id = $1 AND m.isp_id = $2`,
    [userId, targetIspId]
  );
  const targetMem = existing.rows[0];
  if (!targetMem) return res.status(404).json({ message: "User not found" });
  if (targetMem.role === "super_admin") {
    return res.status(403).json({ message: "Cannot deactivate super admin" });
  }
  await query(
    `UPDATE user_isp_memberships SET is_active = FALSE WHERE user_id = $1 AND isp_id = $2`,
    [userId, targetIspId]
  );
  await logAudit({
    ispId: targetIspId,
    actorUserId: req.user.sub,
    action: "user.deactivated",
    entityType: "user",
    entityId: userId
  });
  return res.json({ message: "User deactivated for this workspace" });
  }
);

app.post(
  "/api/users/:userId/reactivate",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const targetIspId = resolveIspId(req, res);
    if (!targetIspId) return;
    const { userId } = req.params;
    const existing = await query(
      `SELECT 1 FROM user_isp_memberships m WHERE m.user_id = $1 AND m.isp_id = $2`,
      [userId, targetIspId]
    );
    if (!existing.rows[0]) return res.status(404).json({ message: "User not found" });
    await query(
      `UPDATE user_isp_memberships SET is_active = TRUE WHERE user_id = $1 AND isp_id = $2`,
      [userId, targetIspId]
    );
    await logAudit({
      ispId: targetIspId,
      actorUserId: req.user.sub,
      action: "user.reactivated",
      entityType: "user",
      entityId: userId
    });
    return res.json({ message: "User reactivated for this workspace" });
  }
);

/** Désactive le compte partout (licenciement) : `users.is_active` + toutes les memberships. L’acteur doit voir la cible dans son FAI courant. */
app.post(
  "/api/users/:userId/suspend-globally",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const targetIspId = resolveIspId(req, res);
    if (!targetIspId) return;
    const { userId } = req.params;
    if (String(userId) === String(req.user.sub)) {
      return res.status(400).json({ message: "You cannot suspend your own account." });
    }
    const memOk = await query(
      `SELECT 1 FROM user_isp_memberships m WHERE m.user_id = $1 AND m.isp_id = $2`,
      [userId, targetIspId]
    );
    if (!memOk.rows[0]) return res.status(404).json({ message: "User not found" });
    const u = await query("SELECT id, role FROM users WHERE id = $1", [userId]);
    const target = u.rows[0];
    if (!target) return res.status(404).json({ message: "User not found" });
    if (target.role === "system_owner") {
      return res.status(403).json({ message: "Cannot suspend this account type." });
    }
    if (target.role === "super_admin" && req.user.role !== "system_owner") {
      return res.status(403).json({ message: "Forbidden target user" });
    }
    await query("UPDATE users SET is_active = FALSE WHERE id = $1", [userId]);
    await query("UPDATE user_isp_memberships SET is_active = FALSE WHERE user_id = $1", [userId]);
    await logAudit({
      ispId: targetIspId,
      actorUserId: req.user.sub,
      action: "user.suspended_globally",
      entityType: "user",
      entityId: userId,
      details: {}
    });
    return res.json({ message: "Account suspended globally; user cannot sign in." });
  }
);

/** Réactive le compte au niveau `users` ; les accès par FAI restent à réactiver par espace si besoin. */
app.post(
  "/api/users/:userId/reactivate-globally",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const targetIspId = resolveIspId(req, res);
    if (!targetIspId) return;
    const { userId } = req.params;
    const memOk = await query(
      `SELECT 1 FROM user_isp_memberships m WHERE m.user_id = $1 AND m.isp_id = $2`,
      [userId, targetIspId]
    );
    if (!memOk.rows[0]) return res.status(404).json({ message: "User not found" });
    const u = await query("SELECT id, role FROM users WHERE id = $1", [userId]);
    if (!u.rows[0]) return res.status(404).json({ message: "User not found" });
    if (u.rows[0].role === "system_owner") {
      return res.status(403).json({ message: "Cannot modify this account type." });
    }
    if (u.rows[0].role === "super_admin" && req.user.role !== "system_owner") {
      return res.status(403).json({ message: "Forbidden target user" });
    }
    await query("UPDATE users SET is_active = TRUE WHERE id = $1", [userId]);
    await logAudit({
      ispId: targetIspId,
      actorUserId: req.user.sub,
      action: "user.reactivated_globally",
      entityType: "user",
      entityId: userId,
      details: {}
    });
    return res.json({
      message: "Account re-enabled for sign-in. Re-activate each workspace if access should be restored there."
    });
  }
);

app.patch(
  "/api/users/:userId",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const targetIspId = resolveIspId(req, res);
    if (!targetIspId) return;
    const { userId } = req.params;
    const body = req.body || {};
    const { fullName, role, phone, address, assignedSite, accreditationLevel } = body;

    const memRow = await query(
      `SELECT m.role FROM user_isp_memberships m WHERE m.user_id = $1 AND m.isp_id = $2`,
      [userId, targetIspId]
    );
    if (!memRow.rows[0]) return res.status(404).json({ message: "User not found" });
    const currentRole = memRow.rows[0].role;

    const allowedRolesByRequester = {
      super_admin: ["company_manager", "isp_admin", "billing_agent", "noc_operator", "field_agent"],
      company_manager: ["isp_admin", "billing_agent", "noc_operator", "field_agent"],
      isp_admin: ["billing_agent", "noc_operator", "field_agent"]
    };
    const allowed = allowedRolesByRequester[req.user.role] || [];

    if (role != null && String(role).trim()) {
      const nextRole = String(role).trim();
      if (!allowed.includes(nextRole)) {
        return res.status(403).json({ message: "You cannot assign this role" });
      }
      if (req.user.role !== "super_admin" && nextRole === "super_admin") {
        return res.status(403).json({ message: "Forbidden role assignment" });
      }
      if (req.user.role !== "super_admin" && currentRole === "super_admin") {
        return res.status(403).json({ message: "Forbidden target user" });
      }
    }

    if (fullName != null && String(fullName).trim()) {
      await query("UPDATE users SET full_name = $1 WHERE id = $2", [String(fullName).trim(), userId]);
    }

    const mSets = [];
    const mVals = [];
    let pi = 1;
    if (role != null && String(role).trim()) {
      mSets.push(`role = $${pi++}`);
      mVals.push(String(role).trim());
    }
    if (accreditationLevel != null && String(accreditationLevel).trim()) {
      mSets.push(`accreditation_level = $${pi++}`);
      mVals.push(String(accreditationLevel).trim());
    }
    if (phone !== undefined) {
      mSets.push(`phone = $${pi++}`);
      mVals.push(phone != null && String(phone).trim() ? String(phone).trim() : null);
    }
    if (address !== undefined) {
      mSets.push(`address = $${pi++}`);
      mVals.push(address != null && String(address).trim() ? String(address).trim() : null);
    }
    if (assignedSite !== undefined) {
      mSets.push(`assigned_site = $${pi++}`);
      mVals.push(assignedSite != null && String(assignedSite).trim() ? String(assignedSite).trim() : null);
    }

    if (mSets.length) {
      const uidPos = pi;
      const ispPos = pi + 1;
      await query(
        `UPDATE user_isp_memberships SET ${mSets.join(", ")} WHERE user_id = $${uidPos}::uuid AND isp_id = $${ispPos}::uuid`,
        [...mVals, userId, targetIspId]
      );
    }

    await logAudit({
      ispId: targetIspId,
      actorUserId: req.user.sub,
      action: "user.updated",
      entityType: "user",
      entityId: userId,
      details: { fields: Object.keys(body) }
    });

    const row = await fetchTeamUserRow(targetIspId, userId);
    return res.json(row);
  }
);

app.post(
  "/api/users/:userId/invite",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
  const targetIspId = resolveIspId(req, res);
  if (!targetIspId) return;
  const { userId } = req.params;
  const existing = await query(
    `SELECT u.id FROM users u
     JOIN user_isp_memberships m ON m.user_id = u.id AND m.isp_id = $2
     WHERE u.id = $1`,
    [userId, targetIspId]
  );
  const targetUser = existing.rows[0];
  if (!targetUser) return res.status(404).json({ message: "User not found" });
  const token = crypto.randomBytes(24).toString("hex");
  await query(
    "INSERT INTO invite_tokens (id, user_id, token, expires_at, created_by) VALUES (gen_random_uuid(), $1, $2, NOW() + INTERVAL '7 days', $3)",
    [userId, token, req.user.sub]
  );
  await logAudit({
    ispId: targetIspId,
    actorUserId: req.user.sub,
    action: "user.invite_created",
    entityType: "user",
    entityId: userId
  });
  return res.json({
    token,
    inviteLink: `${PLATFORM_PUBLIC_BASE_URL}/invite?token=${token}`,
    expiresIn: "7 days"
  });
  }
);

app.get("/api/customers", authenticate, async (req, res) => {
  const ispId = resolveIspId(req, res);
  if (!ispId) return;
  const faId = req.user.role === "field_agent" ? req.user.sub : null;
  const result = faId
    ? await query(
        `SELECT id, isp_id AS "ispId", full_name AS "fullName", phone, email, status,
                field_agent_id AS "fieldAgentId", created_at AS "createdAt"
         FROM customers WHERE isp_id = $1 AND field_agent_id = $2 ORDER BY created_at DESC`,
        [ispId, faId]
      )
    : await query(
        `SELECT id, isp_id AS "ispId", full_name AS "fullName", phone, email, status,
                field_agent_id AS "fieldAgentId", created_at AS "createdAt"
         FROM customers WHERE isp_id = $1 ORDER BY created_at DESC`,
        [ispId]
      );
  res.json(result.rows);
});

app.get("/api/customers/export", authenticate, async (req, res) => {
  const ispId = resolveIspId(req, res);
  if (!ispId) return;
  const faId = req.user.role === "field_agent" ? req.user.sub : null;
  const result = faId
    ? await query(
        `SELECT full_name AS "fullName", phone, email, status, field_agent_id AS "fieldAgentId", created_at AS "createdAt"
         FROM customers WHERE isp_id = $1 AND field_agent_id = $2 ORDER BY created_at DESC`,
        [ispId, faId]
      )
    : await query(
        `SELECT full_name AS "fullName", phone, email, status, field_agent_id AS "fieldAgentId", created_at AS "createdAt"
         FROM customers WHERE isp_id = $1 ORDER BY created_at DESC`,
        [ispId]
      );
  const headers = ["fullName", "phone", "email", "status", "fieldAgentId", "createdAt"];
  const csv = rowsToCsv(headers, result.rows);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="customers-export-${String(ispId).slice(0, 8)}.csv"`
  );
  res.send(csv);
});

app.post(
  "/api/customers/import",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin", "billing_agent", "noc_operator"),
  uploadCsvMemory.fields([
    { name: "file", maxCount: 1 },
    { name: "defaultPassword", maxCount: 1 }
  ]),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const fileBuf = req.files?.file?.[0]?.buffer;
    if (!fileBuf) {
      return res.status(400).json({ message: "CSV file is required (form field name: file)." });
    }
    const csvText = fileBuf.toString("utf8");
    const { rows } = parseCsv(csvText);
    if (!rows.length) {
      return res.status(400).json({ message: "CSV has no data rows below the header." });
    }
    const dpRaw = req.body?.defaultPassword != null ? String(req.body.defaultPassword).trim() : "";
    const defaultPassword = dpRaw.length >= 6 ? dpRaw : "";

    const created = [];
    const skipped = [];
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const lineNo = i + 2;
      const { fullName, phoneRaw, emailRaw, passRaw } = customerImportCells(rows[i]);
      if (!fullName) {
        errors.push({ line: lineNo, message: "Missing name (use fullName, full_name, or name)." });
        continue;
      }
      const phoneNorm = normalizeSubscriberPhone(phoneRaw);
      if (!phoneNorm) {
        errors.push({ line: lineNo, message: "Missing phone/username (use phone, mobile, or MikroTik name)." });
        continue;
      }
      const dup = await query("SELECT id FROM customers WHERE isp_id = $1 AND phone = $2 LIMIT 1", [
        ispId,
        phoneNorm
      ]);
      if (dup.rows[0]) {
        skipped.push({ line: lineNo, phone: phoneNorm, reason: "duplicate_phone" });
        continue;
      }
      const emailTrim =
        emailRaw && String(emailRaw).trim() ? String(emailRaw).trim().slice(0, 320) : null;
      if (emailTrim && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
        errors.push({ line: lineNo, message: "Invalid email format." });
        continue;
      }
      const rowPass = passRaw && String(passRaw).length >= 6 ? String(passRaw) : defaultPassword;
      if (rowPass && String(rowPass).length < 6) {
        errors.push({
          line: lineNo,
          message: "Password must be at least 6 characters, or leave blank and set defaultPassword."
        });
        continue;
      }
      try {
        let inserted;
        if (rowPass) {
          const hash = await bcrypt.hash(String(rowPass), 10);
          inserted = await query(
            `INSERT INTO customers (id, isp_id, full_name, phone, email, status, password_hash, must_set_password)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, 'active', $5, FALSE)
             RETURNING id, isp_id AS "ispId", full_name AS "fullName", phone, email, status, created_at AS "createdAt"`,
            [ispId, fullName, phoneNorm, emailTrim, hash]
          );
        } else {
          inserted = await query(
            `INSERT INTO customers (id, isp_id, full_name, phone, email, status)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, 'active')
             RETURNING id, isp_id AS "ispId", full_name AS "fullName", phone, email, status, created_at AS "createdAt"`,
            [ispId, fullName, phoneNorm, emailTrim]
          );
        }
        created.push(inserted.rows[0]);
      } catch (err) {
        errors.push({ line: lineNo, message: err?.message || "Insert failed" });
      }
    }

    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: "customers.imported",
      entityType: "customer",
      entityId: null,
      details: { created: created.length, skipped: skipped.length, errors: errors.length }
    });

    return res.json({
      createdCount: created.length,
      skipped,
      errors,
      sample: created.slice(0, 5)
    });
  }
);

app.post(
  "/api/customers",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin", "billing_agent", "noc_operator"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const { fullName, phone, initialPassword, email, fieldAgentId } = req.body;
    if (!fullName || !phone) return res.status(400).json({ message: "fullName and phone are required" });
    const phoneNorm = normalizeSubscriberPhone(phone);
    if (!phoneNorm) return res.status(400).json({ message: "phone is required" });
    const emailTrim =
      email != null && String(email).trim() ? String(email).trim().slice(0, 320) : null;
    if (emailTrim && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
      return res.status(400).json({ message: "Invalid email format" });
    }
    if (initialPassword != null && String(initialPassword).length > 0 && String(initialPassword).length < 6) {
      return res.status(400).json({ message: "initialPassword must be at least 6 characters when provided" });
    }
    let fieldAgentUuid = null;
    if (fieldAgentId != null && String(fieldAgentId).trim() !== "") {
      if (!isUuidString(fieldAgentId)) {
        return res.status(400).json({ message: "Invalid fieldAgentId" });
      }
      const u = await query(`SELECT id, role FROM users WHERE id = $1 AND isp_id = $2`, [
        fieldAgentId,
        ispId
      ]);
      if (!u.rows[0] || u.rows[0].role !== "field_agent") {
        return res.status(400).json({ message: "fieldAgentId must reference a field_agent user for this ISP" });
      }
      fieldAgentUuid = fieldAgentId;
    }
    let inserted;
    if (initialPassword && String(initialPassword).length >= 6) {
      const hash = await bcrypt.hash(String(initialPassword), 10);
      inserted = await query(
        `INSERT INTO customers (id, isp_id, full_name, phone, email, status, password_hash, must_set_password, field_agent_id)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 'active', $5, FALSE, $6)
         RETURNING id, isp_id AS "ispId", full_name AS "fullName", phone, email, status,
                   field_agent_id AS "fieldAgentId", created_at AS "createdAt"`,
        [ispId, fullName, phoneNorm, emailTrim, hash, fieldAgentUuid]
      );
    } else {
      inserted = await query(
        `INSERT INTO customers (id, isp_id, full_name, phone, email, status, field_agent_id)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 'active', $5)
         RETURNING id, isp_id AS "ispId", full_name AS "fullName", phone, email, status,
                   field_agent_id AS "fieldAgentId", created_at AS "createdAt"`,
        [ispId, fullName, phoneNorm, emailTrim, fieldAgentUuid]
      );
    }
    res.status(201).json(inserted.rows[0]);
  }
);

app.patch(
  "/api/customers/:customerId",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin", "billing_agent", "field_agent"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const { customerId } = req.params;
    const body = req.body || {};
    const hasEmail = Object.prototype.hasOwnProperty.call(body, "email");
    const hasFieldAgentId = Object.prototype.hasOwnProperty.call(body, "fieldAgentId");

    if (req.user.role === "field_agent") {
      const extraKeys = Object.keys(body).filter((k) => k !== "email");
      if (!hasEmail || extraKeys.length) {
        return res.status(400).json({ message: "Field agents may only update email for assigned customers" });
      }
    } else if (!hasEmail && !hasFieldAgentId) {
      return res.status(400).json({ message: "Provide email and/or fieldAgentId" });
    }

    const ex = await query("SELECT id FROM customers WHERE id = $1 AND isp_id = $2", [customerId, ispId]);
    if (!ex.rows[0]) return res.status(404).json({ message: "Customer not found" });

    let emailTrim = null;
    if (hasEmail) {
      const { email } = body;
      emailTrim = email === null || email === "" ? null : String(email).trim().slice(0, 320);
      if (emailTrim && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
        return res.status(400).json({ message: "Invalid email format" });
      }
    }

    let fieldAgentUuid = undefined;
    if (hasFieldAgentId && req.user.role !== "field_agent") {
      const raw = body.fieldAgentId;
      if (raw === null || raw === "") {
        fieldAgentUuid = null;
      } else {
        if (!isUuidString(raw)) {
          return res.status(400).json({ message: "Invalid fieldAgentId" });
        }
        const u = await query(`SELECT id, role FROM users WHERE id = $1 AND isp_id = $2`, [raw, ispId]);
        if (!u.rows[0] || u.rows[0].role !== "field_agent") {
          return res.status(400).json({ message: "fieldAgentId must reference a field_agent user for this ISP" });
        }
        fieldAgentUuid = raw;
      }
    }

    let updated;
    if (req.user.role === "field_agent") {
      updated = await query(
        `UPDATE customers SET email = $1
         WHERE id = $2 AND isp_id = $3 AND field_agent_id = $4
         RETURNING id, isp_id AS "ispId", full_name AS "fullName", phone, email, status,
                   field_agent_id AS "fieldAgentId", created_at AS "createdAt"`,
        [emailTrim, customerId, ispId, req.user.sub]
      );
      if (!updated.rows[0]) {
        return res.status(404).json({ message: "Customer not found or not assigned to you" });
      }
    } else {
      const sets = [];
      const vals = [];
      let i = 1;
      if (hasEmail) {
        sets.push(`email = $${i++}`);
        vals.push(emailTrim);
      }
      if (fieldAgentUuid !== undefined) {
        sets.push(`field_agent_id = $${i++}`);
        vals.push(fieldAgentUuid);
      }
      if (!sets.length) {
        return res.status(400).json({ message: "No changes" });
      }
      vals.push(customerId, ispId);
      updated = await query(
        `UPDATE customers SET ${sets.join(", ")} WHERE id = $${i++} AND isp_id = $${i++}
         RETURNING id, isp_id AS "ispId", full_name AS "fullName", phone, email, status,
                   field_agent_id AS "fieldAgentId", created_at AS "createdAt"`,
        vals
      );
    }

    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: "customer.updated",
      entityType: "customer",
      entityId: customerId,
      details: {
        email: hasEmail ? emailTrim : undefined,
        fieldAgentId: fieldAgentUuid !== undefined ? fieldAgentUuid : undefined
      }
    });
    return res.json(updated.rows[0]);
  }
);

app.get("/api/plans", authenticate, async (req, res) => {
  const ispId = resolveIspId(req, res);
  if (!ispId) return;
  const result = await query(
    `SELECT id, isp_id AS "ispId", name, price_usd AS "priceUsd", duration_days AS "durationDays", rate_limit AS "rateLimit",
            speed_label AS "speedLabel", default_access_type AS "defaultAccessType", max_devices AS "maxDevices",
            is_published AS "isPublished", availability_status AS "availabilityStatus", success_redirect_url AS "successRedirectUrl",
            created_at AS "createdAt"
     FROM plans WHERE isp_id = $1 ORDER BY created_at DESC`,
    [ispId]
  );
  res.json(result.rows);
});

app.post(
  "/api/plans",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
  const ispId = resolveIspId(req, res);
  if (!ispId) return;
  const {
    name,
    priceUsd,
    durationDays,
    rateLimit,
    speedLabel,
    defaultAccessType = "pppoe",
    maxDevices = 1,
    isPublished = false,
    availabilityStatus = "available",
    successRedirectUrl
  } = req.body;
  if (!name || !priceUsd || !durationDays || !rateLimit) return res.status(400).json({ message: "name, priceUsd, durationDays and rateLimit are required" });
  const access = defaultAccessType === "hotspot" ? "hotspot" : "pppoe";
  const avail = availabilityStatus === "unavailable" ? "unavailable" : "available";
  const inserted = await query(
    `INSERT INTO plans (id, isp_id, name, price_usd, duration_days, rate_limit, speed_label, default_access_type, max_devices, is_published, availability_status, success_redirect_url)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, isp_id AS "ispId", name, price_usd AS "priceUsd", duration_days AS "durationDays", rate_limit AS "rateLimit",
               speed_label AS "speedLabel", default_access_type AS "defaultAccessType", max_devices AS "maxDevices",
               is_published AS "isPublished", availability_status AS "availabilityStatus", success_redirect_url AS "successRedirectUrl", created_at AS "createdAt"`,
    [
      ispId,
      name,
      Number(priceUsd),
      Number(durationDays),
      rateLimit,
      speedLabel || null,
      access,
      Math.max(1, Number(maxDevices) || 1),
      Boolean(isPublished),
      avail,
      successRedirectUrl || null
    ]
  );
  res.status(201).json(inserted.rows[0]);
  }
);

app.patch(
  "/api/plans/:planId",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const { planId } = req.params;
    const existing = await query("SELECT id FROM plans WHERE id = $1 AND isp_id = $2", [planId, ispId]);
    if (!existing.rows[0]) return res.status(404).json({ message: "Plan not found" });
    const {
      name,
      priceUsd,
      durationDays,
      rateLimit,
      speedLabel,
      defaultAccessType,
      maxDevices,
      isPublished,
      availabilityStatus,
      successRedirectUrl
    } = req.body;
    const access =
      defaultAccessType === undefined ? undefined : defaultAccessType === "hotspot" ? "hotspot" : "pppoe";
    const avail =
      availabilityStatus === undefined
        ? undefined
        : availabilityStatus === "unavailable"
          ? "unavailable"
          : "available";
    const updated = await query(
      `UPDATE plans SET
         name = COALESCE($1, name),
         price_usd = COALESCE($2, price_usd),
         duration_days = COALESCE($3, duration_days),
         rate_limit = COALESCE($4, rate_limit),
         speed_label = COALESCE($5, speed_label),
         default_access_type = COALESCE($6, default_access_type),
         max_devices = COALESCE($7, max_devices),
         is_published = COALESCE($8, is_published),
         availability_status = COALESCE($9, availability_status),
         success_redirect_url = COALESCE($10, success_redirect_url)
       WHERE id = $11 AND isp_id = $12
       RETURNING id, isp_id AS "ispId", name, price_usd AS "priceUsd", duration_days AS "durationDays", rate_limit AS "rateLimit",
                 speed_label AS "speedLabel", default_access_type AS "defaultAccessType", max_devices AS "maxDevices",
                 is_published AS "isPublished", availability_status AS "availabilityStatus", success_redirect_url AS "successRedirectUrl", created_at AS "createdAt"`,
      [
        name || null,
        priceUsd != null ? Number(priceUsd) : null,
        durationDays != null ? Number(durationDays) : null,
        rateLimit || null,
        speedLabel !== undefined ? speedLabel || null : null,
        access || null,
        maxDevices != null ? Math.max(1, Number(maxDevices)) : null,
        isPublished !== undefined ? Boolean(isPublished) : null,
        avail || null,
        successRedirectUrl !== undefined ? successRedirectUrl || null : null,
        planId,
        ispId
      ]
    );
    return res.json(updated.rows[0]);
  }
);

app.get("/api/subscriptions", authenticate, async (req, res) => {
  const ispId = resolveIspId(req, res);
  if (!ispId) return;
  const faId = req.user.role === "field_agent" ? req.user.sub : null;
  const result = faId
    ? await query(
        `SELECT s.id, s.isp_id AS "ispId", s.customer_id AS "customerId", s.plan_id AS "planId", s.status,
                s.access_type AS "accessType", s.start_date AS "startDate", s.end_date AS "endDate",
                s.max_simultaneous_devices AS "maxSimultaneousDevices"
         FROM subscriptions s
         INNER JOIN customers c ON c.id = s.customer_id AND c.isp_id = s.isp_id
         WHERE s.isp_id = $1 AND c.field_agent_id = $2
         ORDER BY s.start_date DESC`,
        [ispId, faId]
      )
    : await query(
        `SELECT id, isp_id AS "ispId", customer_id AS "customerId", plan_id AS "planId", status, access_type AS "accessType",
            start_date AS "startDate", end_date AS "endDate", max_simultaneous_devices AS "maxSimultaneousDevices"
     FROM subscriptions WHERE isp_id = $1 ORDER BY start_date DESC`,
        [ispId]
      );
  res.json(result.rows);
});

app.post(
  "/api/subscriptions",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin", "billing_agent", "noc_operator"),
  async (req, res) => {
  const ispId = resolveIspId(req, res);
  if (!ispId) return;
  const { customerId, planId, accessType = "pppoe" } = req.body;
  const customer = await query("SELECT id FROM customers WHERE id = $1 AND isp_id = $2", [customerId, ispId]);
  const plan = await query(
    "SELECT id, price_usd, duration_days, max_devices FROM plans WHERE id = $1 AND isp_id = $2",
    [planId, ispId]
  );
  if (!customer.rows[0] || !plan.rows[0]) return res.status(404).json({ message: "Customer or plan not found" });

  const networkOnCreate =
    String(process.env.SUBSCRIPTION_NETWORK_ACCESS_ON_CREATE ?? "true").toLowerCase() !== "false";
  const initialStatus = networkOnCreate ? "active" : "suspended";

  const now = new Date();
  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() + Number(plan.rows[0].duration_days));
  const maxDev = Math.max(1, Number(plan.rows[0].max_devices) || 1);

  const subInsert = await query(
    "INSERT INTO subscriptions (id, isp_id, customer_id, plan_id, status, access_type, start_date, end_date, max_simultaneous_devices) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, isp_id AS \"ispId\", customer_id AS \"customerId\", plan_id AS \"planId\", status, access_type AS \"accessType\", start_date AS \"startDate\", end_date AS \"endDate\"",
    [ispId, customerId, planId, initialStatus, accessType, now.toISOString(), endDate.toISOString(), maxDev]
  );
  const subscription = subInsert.rows[0];
  const invoiceInsert = await query(
    "INSERT INTO invoices (id, isp_id, subscription_id, customer_id, amount_usd, status, due_date) VALUES (gen_random_uuid(), $1, $2, $3, $4, 'unpaid', $5) RETURNING id, isp_id AS \"ispId\", subscription_id AS \"subscriptionId\", customer_id AS \"customerId\", amount_usd AS \"amountUsd\", status, due_date AS \"dueDate\", created_at AS \"createdAt\"",
    [ispId, subscription.id, customerId, Number(plan.rows[0].price_usd), endDate.toISOString()]
  );
  if (networkOnCreate) {
    await provisionSubscriptionAccess({
      ispId,
      subscriptionId: subscription.id,
      action: "activate"
    });
  }
  res.status(201).json({ subscription, invoice: invoiceInsert.rows[0] });
  }
);

app.post(
  "/api/subscriptions/:subscriptionId/suspend",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin", "noc_operator"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const { subscriptionId } = req.params;
    const updated = await query(
      "UPDATE subscriptions SET status = 'suspended' WHERE id = $1 AND isp_id = $2 RETURNING id, isp_id AS \"ispId\", customer_id AS \"customerId\", plan_id AS \"planId\", status, access_type AS \"accessType\", start_date AS \"startDate\", end_date AS \"endDate\"",
      [subscriptionId, ispId]
    );
    if (!updated.rows[0]) return res.status(404).json({ message: "Subscription not found" });
    const provisioning = await provisionSubscriptionAccess({
      ispId,
      subscriptionId,
      action: "suspend"
    });
    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: "subscription.suspended",
      entityType: "subscription",
      entityId: subscriptionId,
      details: { provisioning }
    });
    return res.json({ subscription: updated.rows[0], provisioning });
  }
);

app.post(
  "/api/subscriptions/:subscriptionId/reactivate",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin", "noc_operator"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const { subscriptionId } = req.params;
    const updated = await query(
      "UPDATE subscriptions SET status = 'active' WHERE id = $1 AND isp_id = $2 RETURNING id, isp_id AS \"ispId\", customer_id AS \"customerId\", plan_id AS \"planId\", status, access_type AS \"accessType\", start_date AS \"startDate\", end_date AS \"endDate\"",
      [subscriptionId, ispId]
    );
    if (!updated.rows[0]) return res.status(404).json({ message: "Subscription not found" });
    const provisioning = await provisionSubscriptionAccess({
      ispId,
      subscriptionId,
      action: "activate"
    });
    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: "subscription.reactivated",
      entityType: "subscription",
      entityId: subscriptionId,
      details: { provisioning }
    });
    return res.json({ subscription: updated.rows[0], provisioning });
  }
);

app.get("/api/invoices", authenticate, async (req, res) => {
  const ispId = resolveIspId(req, res);
  if (!ispId) return;
  const faId = req.user.role === "field_agent" ? req.user.sub : null;
  const result = faId
    ? await query(
        `SELECT i.id, i.isp_id AS "ispId", i.subscription_id AS "subscriptionId", i.customer_id AS "customerId",
                i.amount_usd AS "amountUsd", i.status, i.due_date AS "dueDate", i.created_at AS "createdAt"
         FROM invoices i
         INNER JOIN customers c ON c.id = i.customer_id AND c.isp_id = i.isp_id
         WHERE i.isp_id = $1 AND c.field_agent_id = $2
         ORDER BY i.created_at DESC`,
        [ispId, faId]
      )
    : await query(
        "SELECT id, isp_id AS \"ispId\", subscription_id AS \"subscriptionId\", customer_id AS \"customerId\", amount_usd AS \"amountUsd\", status, due_date AS \"dueDate\", created_at AS \"createdAt\" FROM invoices WHERE isp_id = $1 ORDER BY created_at DESC",
        [ispId]
      );
  res.json(result.rows);
});

app.get("/api/invoices/:invoiceId/proforma-pdf", authenticate, async (req, res) => {
  const ispId = resolveIspId(req, res);
  if (!ispId) return;
  const { invoiceId } = req.params;
  if (!isUuidString(invoiceId)) return res.status(400).json({ message: "Invalid invoice id" });

  const faId = req.user.role === "field_agent" ? req.user.sub : null;
  const invSql = faId
    ? `SELECT i.id, i.amount_usd AS "amountUsd", i.status, i.due_date AS "dueDate",
              c.full_name AS "customerName", c.phone AS "customerPhone"
       FROM invoices i
       INNER JOIN customers c ON c.id = i.customer_id AND c.isp_id = i.isp_id
       WHERE i.id = $1 AND i.isp_id = $2 AND c.field_agent_id = $3`
    : `SELECT i.id, i.amount_usd AS "amountUsd", i.status, i.due_date AS "dueDate",
              c.full_name AS "customerName", c.phone AS "customerPhone"
       FROM invoices i
       INNER JOIN customers c ON c.id = i.customer_id AND c.isp_id = i.isp_id
       WHERE i.id = $1 AND i.isp_id = $2`;
  const inv = await query(invSql, faId ? [invoiceId, ispId, faId] : [invoiceId, ispId]);
  const invRow = inv.rows[0];
  if (!invRow) return res.status(404).json({ message: "Invoice not found" });

  const [brandR, ispR] = await Promise.all([
    query(
      `SELECT b.display_name AS "displayName", b.address, b.contact_email AS "contactEmail",
              b.contact_phone AS "contactPhone", b.invoice_footer AS "invoiceFooter"
       FROM isp_branding b WHERE b.isp_id = $1`,
      [ispId]
    ),
    query(`SELECT name FROM isps WHERE id = $1`, [ispId])
  ]);
  const brand = brandR.rows[0] || {};
  const ispName = ispR.rows[0]?.name || "";

  await logAudit({
    ispId,
    actorUserId: req.user.sub,
    action: "invoice.proforma_pdf_downloaded",
    entityType: "invoice",
    entityId: invoiceId,
    details: {}
  });

  streamInvoiceProformaPdf(res, { invoice: invRow, brand, ispName });
});

app.post("/api/payments/webhook", authenticate, async (req, res) => {
  const ispId = resolveIspId(req, res);
  if (!ispId) return;
  const { invoiceId, providerRef, amountUsd, status, method } = req.body || {};
  const methodType = normalizeMethodType(method || "cash");
  const paymentMethod = await query(
    "SELECT id FROM isp_payment_methods WHERE isp_id = $1 AND method_type = $2 AND is_active = TRUE LIMIT 1",
    [ispId, methodType]
  );
  if (!paymentMethod.rows[0]) {
    return res.status(400).json({
      message: `No active ${methodType} payment method configured by this ISP.`
    });
  }
  const result = await applyInvoicePayment({
    ispId,
    invoiceId,
    providerRef,
    amountUsd,
    status,
    methodType
  });
  if (!result.ok) return res.status(result.code || 400).json({ message: result.message || "Webhook rejected" });
  return res.json({
    message: result.duplicate ? "Duplicate callback ignored" : "Webhook processed",
    payment: result.payment,
    activated: Boolean(result.activated)
  });
});

app.post("/api/public/payment-gateways/:methodId/callback", async (req, res) => {
  const { methodId } = req.params;
  if (!isUuidString(methodId)) {
    return res.status(400).json({ message: "Invalid payment method id" });
  }
  const method = await query(
    `SELECT id, isp_id AS "ispId", method_type AS "methodType", provider_name AS "providerName",
            config_json AS "config", is_active AS "isActive"
     FROM isp_payment_methods WHERE id = $1`,
    [methodId]
  );
  const row = method.rows[0];
  if (!row || !row.isActive) {
    return res.status(404).json({ message: "Payment method not found or inactive" });
  }
  const expectedSecret = String(row.config?.callbackSecret || "").trim();
  if (!expectedSecret) {
    return res.status(409).json({ message: "Callback secret is not configured for this payment method" });
  }
  const providedSecret = resolveGatewayCallbackSecret(req);
  if (!providedSecret || providedSecret !== expectedSecret) {
    return res.status(401).json({ message: "Invalid callback secret" });
  }
  const payload = req.body || {};
  const invoiceId = payload.invoiceId || payload.invoice_id || payload?.data?.invoiceId || payload?.data?.invoice_id;
  const providerRef =
    payload.providerRef ||
    payload.provider_ref ||
    payload.transactionId ||
    payload.transaction_id ||
    payload.reference ||
    payload.id;
  const result = await applyInvoicePayment({
    ispId: row.ispId,
    invoiceId,
    providerRef,
    amountUsd: payload.amountUsd ?? payload.amount_usd ?? payload.amount,
    status: payload.status || payload.paymentStatus || payload.payment_status,
    methodType: row.methodType
  });
  if (!result.ok) return res.status(result.code || 400).json({ message: result.message || "Callback rejected" });
  await logAudit({
    ispId: row.ispId,
    action: "payment_gateway.callback_received",
    entityType: "payment_method",
    entityId: methodId,
    details: {
      providerName: row.providerName,
      methodType: row.methodType,
      invoiceId,
      providerRef: String(providerRef || "")
    }
  });
  return res.json({
    ok: true,
    methodType: row.methodType,
    providerName: row.providerName,
    activated: Boolean(result.activated),
    duplicate: Boolean(result.duplicate),
    payment: result.payment
  });
});

app.post("/api/payments/tid-submissions", async (req, res) => {
  const { invoiceId, tid, submittedByPhone, amountUsd } = req.body;
  if (!invoiceId || !tid) {
    return res.status(400).json({ message: "invoiceId and tid are required" });
  }
  const inv = await query(
    "SELECT id, isp_id, customer_id, subscription_id, amount_usd, status FROM invoices WHERE id = $1 AND status IN ('unpaid', 'overdue')",
    [invoiceId]
  );
  const invoice = inv.rows[0];
  if (!invoice) return res.status(404).json({ message: "Invoice not found or not open for payment" });
  const duplicateTid = await query(
    "SELECT id, status FROM payment_tid_submissions WHERE isp_id = $1 AND tid = $2 ORDER BY created_at DESC LIMIT 1",
    [invoice.isp_id, tid]
  );
  if (duplicateTid.rows[0] && duplicateTid.rows[0].status !== "rejected") {
    return res.status(409).json({
      message: "This TID is already submitted and awaiting/approved verification."
    });
  }
  const inserted = await query(
    "INSERT INTO payment_tid_submissions (id, isp_id, invoice_id, customer_id, subscription_id, tid, submitted_by_phone, amount_usd, status) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'pending') RETURNING id, isp_id AS \"ispId\", invoice_id AS \"invoiceId\", tid, submitted_by_phone AS \"submittedByPhone\", amount_usd AS \"amountUsd\", status, created_at AS \"createdAt\"",
    [
      invoice.isp_id,
      invoice.id,
      invoice.customer_id,
      invoice.subscription_id,
      tid,
      submittedByPhone || null,
      Number(amountUsd || invoice.amount_usd)
    ]
  );
  await logAudit({
    ispId: invoice.isp_id,
    action: "payment.tid_submitted",
    entityType: "payment_tid_submission",
    entityId: inserted.rows[0].id,
    details: { invoiceId: invoice.id, tid }
  });
  return res.status(201).json(inserted.rows[0]);
});

app.get(
  "/api/payments/tid-submissions",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin", "billing_agent"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const result = await query(
      "SELECT id, invoice_id AS \"invoiceId\", customer_id AS \"customerId\", subscription_id AS \"subscriptionId\", tid, submitted_by_phone AS \"submittedByPhone\", amount_usd AS \"amountUsd\", status, review_note AS \"reviewNote\", created_at AS \"createdAt\" FROM payment_tid_submissions WHERE isp_id = $1 ORDER BY created_at DESC",
      [ispId]
    );
    return res.json(result.rows);
  }
);

app.get(
  "/api/payments/tid-conflicts",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin", "billing_agent"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const result = await query(
      "SELECT tid, COUNT(*)::int AS duplicates, ARRAY_AGG(id ORDER BY created_at DESC) AS submission_ids, ARRAY_AGG(status ORDER BY created_at DESC) AS statuses, MIN(created_at) AS first_seen, MAX(created_at) AS last_seen FROM payment_tid_submissions WHERE isp_id = $1 GROUP BY tid HAVING COUNT(*) > 1 ORDER BY last_seen DESC",
      [ispId]
    );
    return res.json(result.rows);
  }
);

app.post(
  "/api/payments/tid-submissions/:submissionId/review",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin", "billing_agent"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const { submissionId } = req.params;
    const { decision, note } = req.body;
    if (!["approved", "rejected"].includes(decision)) {
      return res.status(400).json({ message: "decision must be approved or rejected" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const submissionResult = await client.query(
        "SELECT * FROM payment_tid_submissions WHERE id = $1 AND isp_id = $2 FOR UPDATE",
        [submissionId, ispId]
      );
      const submission = submissionResult.rows[0];
      if (!submission) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Submission not found" });
      }
      if (submission.status !== "pending") {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "Submission already reviewed" });
      }

      if (decision === "rejected") {
        await client.query(
          "UPDATE payment_tid_submissions SET status = $1, reviewed_by = $2, reviewed_at = NOW(), review_note = $3 WHERE id = $4",
          ["rejected", req.user.sub, note || null, submissionId]
        );
        await client.query("COMMIT");
        await logAudit({
          ispId,
          actorUserId: req.user.sub,
          action: "payment.tid_rejected",
          entityType: "payment_tid_submission",
          entityId: submissionId,
          details: { note: note || null }
        });
        return res.json({ message: "Submission rejected" });
      }

      const pay = await applyInvoicePaymentTx(client, {
        ispId,
        invoiceId: submission.invoice_id,
        providerRef: submission.tid,
        amountUsd: submission.amount_usd,
        status: "confirmed",
        methodType: "manual_mobile_money"
      });
      if (!pay.ok) {
        await client.query("ROLLBACK");
        return res.status(pay.code || 400).json({ message: pay.message || "Payment failed" });
      }

      await client.query(
        "UPDATE payment_tid_submissions SET status = $1, reviewed_by = $2, reviewed_at = NOW(), review_note = $3 WHERE id = $4",
        ["approved", req.user.sub, note || null, submissionId]
      );
      await client.query("COMMIT");

      if (pay.activated) {
        await provisionSubscriptionAccess({
          ispId,
          subscriptionId: submission.subscription_id,
          action: "activate"
        });
      }

      await logAudit({
        ispId,
        actorUserId: req.user.sub,
        action: "payment.tid_approved",
        entityType: "payment_tid_submission",
        entityId: submissionId,
        details: {
          note: note || null,
          duplicate: Boolean(pay.duplicate),
          invoiceAlreadyPaid: Boolean(pay.invoiceAlreadyPaid),
          activated: Boolean(pay.activated)
        }
      });
      return res.json({
        message: "Submission approved",
        activated: Boolean(pay.activated),
        duplicate: Boolean(pay.duplicate)
      });
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch (_e) {
        /* ignore */
      }
      throw err;
    } finally {
      client.release();
    }
  }
);

app.post(
  "/api/payments/tid-submissions/reminders",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin", "billing_agent"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const pending = await query(
      "SELECT id, tid, submitted_by_phone, created_at FROM payment_tid_submissions WHERE isp_id = $1 AND status = 'pending' ORDER BY created_at ASC",
      [ispId]
    );
    let queued = 0;
    for (const row of pending.rows) {
      const dedupe = await query(
        "SELECT id FROM notification_outbox WHERE isp_id = $1 AND template_key = 'tid_pending_reminder' AND payload->>'submissionId' = $2 AND created_at::date = CURRENT_DATE LIMIT 1",
        [ispId, row.id]
      );
      if (dedupe.rows[0]) continue;
      await query(
        "INSERT INTO notification_outbox (id, isp_id, channel, recipient, template_key, payload, status) VALUES (gen_random_uuid(), $1, 'internal', $2, 'tid_pending_reminder', $3::jsonb, 'queued')",
        [
          ispId,
          row.submitted_by_phone || null,
          JSON.stringify({
            submissionId: row.id,
            tid: row.tid,
            pendingSince: row.created_at
          })
        ]
      );
      queued += 1;
    }
    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: "payment.tid_reminders_queued",
      entityType: "notification_batch",
      details: { queued }
    });
    return res.json({ queued, totalPending: pending.rows.length });
  }
);

app.post(
  "/api/vouchers/generate",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin", "billing_agent", "field_agent"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const { planId, quantity = 1, maxDevices: maxDevicesBody } = req.body;
    if (!planId) return res.status(400).json({ message: "planId is required" });
    const planResult = await query(
      "SELECT id, rate_limit, duration_days, max_devices FROM plans WHERE id = $1 AND isp_id = $2",
      [planId, ispId]
    );
    const plan = planResult.rows[0];
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    const planCap = Math.max(1, Number(plan.max_devices) || 1);
    const requested = maxDevicesBody != null ? Number(maxDevicesBody) : planCap;
    const maxDevices = Math.min(planCap, Math.max(1, Number.isFinite(requested) ? requested : planCap));
    const qty = Math.min(Math.max(Number(quantity), 1), 100);
    const created = [];
    for (let i = 0; i < qty; i += 1) {
      const code = `VCH-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
      const row = await query(
        `INSERT INTO access_vouchers (id, isp_id, plan_id, code, rate_limit, duration_days, status, created_by, expires_at, max_devices)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'unused', $6, NOW() + INTERVAL '90 days', $7)
         RETURNING id, code, rate_limit AS "rateLimit", duration_days AS "durationDays", max_devices AS "maxDevices",
                   status, expires_at AS "expiresAt"`,
        [ispId, plan.id, code, plan.rate_limit, plan.duration_days, req.user.sub, maxDevices]
      );
      created.push(row.rows[0]);
    }
    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: "voucher.generated",
      entityType: "voucher_batch",
      details: { planId, quantity: qty, rateLimit: plan.rate_limit, maxDevices }
    });
    return res.status(201).json(created);
  }
);

app.get("/api/vouchers", authenticate, async (req, res) => {
  const ispId = resolveIspId(req, res);
  if (!ispId) return;
  const result = await query(
    `SELECT id, code, rate_limit AS "rateLimit", duration_days AS "durationDays", max_devices AS "maxDevices",
            status, expires_at AS "expiresAt", used_at AS "usedAt"
     FROM access_vouchers WHERE isp_id = $1 ORDER BY created_at DESC LIMIT 200`,
    [ispId]
  );
  return res.json(result.rows);
});

app.get("/api/vouchers/export", authenticate, async (req, res) => {
  const ispId = resolveIspId(req, res);
  if (!ispId) return;
  const result = await query(
    `SELECT code, rate_limit AS "rateLimit", duration_days AS "durationDays", max_devices AS "maxDevices",
            status, expires_at AS "expiresAt", used_at AS "usedAt"
     FROM access_vouchers WHERE isp_id = $1 ORDER BY created_at DESC`,
    [ispId]
  );
  const header = "code,rate_limit,duration_days,max_devices,status,expires_at,used_at";
  const rows = result.rows.map((r) =>
    [r.code, r.rateLimit, r.durationDays, r.maxDevices, r.status, r.expiresAt || "", r.usedAt || ""]
      .map((v) => `"${String(v).replaceAll('"', '""')}"`)
      .join(",")
  );
  return res.json({
    filename: `vouchers-${new Date().toISOString().slice(0, 10)}.csv`,
    content: [header, ...rows].join("\n")
  });
});

app.post("/api/vouchers/redeem", async (req, res) => {
  const { code, customerId, ispId: bodyIspId, phone, newPassword } = req.body || {};
  if (!code) return res.status(400).json({ message: "code is required" });
  if (!customerId && !(bodyIspId && phone)) {
    return res.status(400).json({ message: "Provide customerId, or ispId and phone" });
  }
  const voucherResult = await query(
    "SELECT * FROM access_vouchers WHERE code = $1 AND status = 'unused'",
    [code]
  );
  const voucher = voucherResult.rows[0];
  if (!voucher) return res.status(404).json({ message: "Voucher not found or already used" });
  if (voucher.expires_at && new Date(voucher.expires_at).getTime() < Date.now()) {
    await query("UPDATE access_vouchers SET status = 'expired' WHERE id = $1", [voucher.id]);
    return res.status(400).json({ message: "Voucher expired" });
  }
  const voucherIsp = voucher.isp_id;
  let resolvedCustomerId = customerId || null;
  let customerRow = null;
  if (resolvedCustomerId) {
    const c = await query(
      `SELECT id, password_hash AS "passwordHash" FROM customers WHERE id = $1 AND isp_id = $2`,
      [resolvedCustomerId, voucherIsp]
    );
    if (!c.rows[0]) return res.status(404).json({ message: "Customer not found for this ISP" });
    customerRow = c.rows[0];
  } else {
    if (String(bodyIspId) !== String(voucherIsp)) {
      return res.status(400).json({ message: "ispId does not match this voucher" });
    }
    const norm = normalizeSubscriberPhone(phone);
    const c = await query(
      `SELECT id, password_hash AS "passwordHash" FROM customers WHERE isp_id = $1 AND phone = $2 ORDER BY created_at DESC LIMIT 1`,
      [voucherIsp, norm]
    );
    if (!c.rows[0]) return res.status(404).json({ message: "Customer not found for this phone" });
    resolvedCustomerId = c.rows[0].id;
    customerRow = c.rows[0];
  }

  const hasPw = Boolean(customerRow.passwordHash);
  if (!hasPw && !newPassword) {
    return res.status(400).json({
      message: "Set newPassword on first redeem for this account so you can log in later."
    });
  }
  if (newPassword != null && String(newPassword).length > 0) {
    if (String(newPassword).length < 6) {
      return res.status(400).json({ message: "newPassword must be at least 6 characters" });
    }
    const hash = await bcrypt.hash(String(newPassword), 10);
    await query(`UPDATE customers SET password_hash = $1, must_set_password = FALSE WHERE id = $2`, [
      hash,
      resolvedCustomerId
    ]);
  }

  await query(
    "UPDATE access_vouchers SET status = 'used', assigned_customer_id = $1, used_at = NOW() WHERE id = $2",
    [resolvedCustomerId, voucher.id]
  );

  const planRow = await query(
    `SELECT duration_days, default_access_type, max_devices, price_usd
     FROM plans WHERE id = $1 AND isp_id = $2`,
    [voucher.plan_id, voucherIsp]
  );
  const plan = planRow.rows[0];
  if (!plan) return res.status(500).json({ message: "Voucher plan is missing" });
  const voucherDeviceCap = Math.max(1, Number(voucher.max_devices) || 1);
  const planDeviceCap = Math.max(1, Number(plan.max_devices) || 1);
  const effectiveDevices = Math.min(voucherDeviceCap, planDeviceCap);
  const durationDays = Number(voucher.duration_days) || 0;
  const extendMs = durationDays * 86400000;
  const now = new Date();

  const activeSub = await query(
    `SELECT id, end_date AS "endDate" FROM subscriptions
     WHERE customer_id = $1 AND isp_id = $2 AND status = 'active'
     ORDER BY end_date DESC LIMIT 1`,
    [resolvedCustomerId, voucherIsp]
  );
  let subscriptionId = null;
  if (activeSub.rows[0]) {
    subscriptionId = activeSub.rows[0].id;
    const curEnd = new Date(activeSub.rows[0].endDate);
    const base = curEnd.getTime() > now.getTime() ? curEnd : now;
    const newEnd = new Date(base.getTime() + extendMs);
    await query(
      `UPDATE subscriptions
       SET end_date = $1, max_simultaneous_devices = $2, plan_id = $3, status = 'active'
       WHERE id = $4`,
      [newEnd.toISOString(), effectiveDevices, voucher.plan_id, subscriptionId]
    );
  } else {
    const accessType =
      String(plan.default_access_type || "").toLowerCase() === "hotspot" ? "hotspot" : "pppoe";
    const endDate = new Date(now.getTime() + extendMs);
    const subIns = await query(
      `INSERT INTO subscriptions (id, isp_id, customer_id, plan_id, status, access_type, start_date, end_date, max_simultaneous_devices)
       VALUES (gen_random_uuid(), $1, $2, $3, 'active', $4, $5, $6, $7)
       RETURNING id`,
      [voucherIsp, resolvedCustomerId, voucher.plan_id, accessType, now.toISOString(), endDate.toISOString(), effectiveDevices]
    );
    subscriptionId = subIns.rows[0].id;
    const invIns = await query(
      `INSERT INTO invoices (id, isp_id, subscription_id, customer_id, amount_usd, status, due_date)
       VALUES (gen_random_uuid(), $1, $2, $3, 0, 'paid', $4)
       RETURNING id`,
      [voucherIsp, subscriptionId, resolvedCustomerId, endDate.toISOString()]
    );
    await query(
      `INSERT INTO payments (id, isp_id, invoice_id, provider_ref, amount_usd, status, method)
       VALUES (gen_random_uuid(), $1, $2, $3, 0, 'confirmed', 'voucher')`,
      [voucherIsp, invIns.rows[0].id, `voucher-${voucher.id}`]
    );
  }

  if (subscriptionId) {
    await provisionSubscriptionAccess({
      ispId: voucherIsp,
      subscriptionId,
      action: "activate"
    });
  }

  const cred = await query(`SELECT password_hash AS "passwordHash" FROM customers WHERE id = $1`, [
    resolvedCustomerId
  ]);
  let subscriberToken = null;
  if (cred.rows[0]?.passwordHash) {
    subscriberToken = signSubscriberToken({ id: resolvedCustomerId, isp_id: voucherIsp });
  }

  await logAudit({
    ispId: voucherIsp,
    action: "voucher.redeemed",
    entityType: "voucher",
    entityId: voucher.id,
    details: { customerId: resolvedCustomerId, code }
  });
  return res.json({
    message: "Voucher redeemed",
    rateLimit: voucher.rate_limit,
    durationDays: voucher.duration_days,
    maxDevices: effectiveDevices,
    subscriberToken
  });
});

app.get("/api/network/stats", authenticate, async (req, res) => {
  const ispId = resolveIspId(req, res);
  if (!ispId) return;
  const from = req.query.from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = req.query.to || new Date().toISOString().slice(0, 10);

  const usage = await query(
    "SELECT COALESCE(SUM(hotspot_users),0)::int AS \"hotspotUsers\", COALESCE(SUM(pppoe_users),0)::int AS \"pppoeUsers\", COALESCE(MAX(connected_devices),0)::int AS \"connectedDevices\", COALESCE(SUM(bandwidth_down_gb + bandwidth_up_gb),0)::float AS \"bandwidthTotalGb\" FROM network_usage_daily WHERE isp_id = $1 AND metric_date BETWEEN $2::date AND $3::date",
    [ispId, from, to]
  );
  const revenue = await query(
    "SELECT COALESCE(SUM(amount_usd),0)::float AS \"revenueCollectedUsd\" FROM payments WHERE isp_id = $1 AND status = 'confirmed' AND paid_at::date BETWEEN $2::date AND $3::date",
    [ispId, from, to]
  );
  const cashbox = await getCashboxSummary(ispId, from, to);
  const dailyUsage = await query(
    `SELECT metric_date::text AS date, hotspot_users AS "hotspotUsers", pppoe_users AS "pppoeUsers",
            connected_devices AS "connectedDevices",
            (bandwidth_down_gb + bandwidth_up_gb)::float AS "bandwidthGb"
     FROM network_usage_daily
     WHERE isp_id = $1 AND metric_date BETWEEN $2::date AND $3::date
     ORDER BY metric_date ASC`,
    [ispId, from, to]
  );
  return res.json({
    period: { from, to },
    hotspotUsers: usage.rows[0].hotspotUsers,
    pppoeUsers: usage.rows[0].pppoeUsers,
    connectedDevices: usage.rows[0].connectedDevices,
    bandwidthTotalGb: usage.rows[0].bandwidthTotalGb,
    revenueCollectedUsd: revenue.rows[0].revenueCollectedUsd,
    cashbox,
    dailyUsage: dailyUsage.rows
  });
});

app.get("/api/dashboard", authenticate, async (req, res) => {
  const ispId = resolveIspId(req, res);
  if (!ispId) return;
const sessionWindowMinutes = Math.min(
  Math.max(Number(req.query.sessionWindowMinutes) || 30, 1),
  24 * 60
);

const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
const to = new Date().toISOString().slice(0, 10);
const faId = req.user.role === "field_agent" ? req.user.sub : null;

const [customers, active, unpaid, revenue, sessionCount, cashbox] = await Promise.all([
  faId
    ? query(
        "SELECT COUNT(*)::int AS value FROM customers WHERE isp_id = $1 AND field_agent_id = $2",
        [ispId, faId]
      )
    : query("SELECT COUNT(*)::int AS value FROM customers WHERE isp_id = $1", [ispId]),

  faId
    ? query(
        `SELECT COUNT(*)::int AS value FROM subscriptions s
         INNER JOIN customers c ON c.id = s.customer_id AND c.isp_id = s.isp_id
         WHERE s.isp_id = $1 AND s.status = 'active' AND c.field_agent_id = $2`,
        [ispId, faId]
      )
    : query("SELECT COUNT(*)::int AS value FROM subscriptions WHERE isp_id = $1 AND status = 'active'", [ispId]),

  faId
    ? query(
        `SELECT COUNT(*)::int AS value FROM invoices i
         INNER JOIN customers c ON c.id = i.customer_id AND c.isp_id = i.isp_id
         WHERE i.isp_id = $1 AND i.status IN ('unpaid', 'overdue') AND c.field_agent_id = $2`,
        [ispId, faId]
      )
    : query(
        "SELECT COUNT(*)::int AS value FROM invoices WHERE isp_id = $1 AND status IN ('unpaid', 'overdue')",
        [ispId]
      ),

  faId
    ? query(
        `SELECT COALESCE(SUM(i.amount_usd), 0)::float AS value FROM invoices i
         INNER JOIN customers c ON c.id = i.customer_id AND c.isp_id = i.isp_id
         WHERE i.isp_id = $1 AND i.status = 'paid' AND c.field_agent_id = $2`,
        [ispId, faId]
      )
    : query(
        "SELECT COALESCE(SUM(amount_usd), 0)::float AS value FROM invoices WHERE isp_id = $1 AND status = 'paid'",
        [ispId]
      ),

  countOnlineSubscriberSessions({ ispId, windowMinutes: sessionWindowMinutes }),

  getCashboxSummary(ispId, from, to, faId)
]);
  ]);
  res.json({
    totalCustomers: customers.rows[0].value,
    activeSubscriptions: active.rows[0].value,
    unpaidInvoices: unpaid.rows[0].value,
    revenueUsd: revenue.rows[0].value,
networkSessions: sessionCount.count,
networkSessionsWindowMinutes: sessionCount.windowMinutes,
cashboxPeriod: { from, to },
cashbox
  });
});

app.get("/api/super/dashboard", authenticate, requireRoles("system_owner", "super_admin"), async (_req, res) => {
  const [isps, customers, active, revenue, tenants] = await Promise.all([
    query("SELECT COUNT(*)::int AS value FROM isps"),
    query("SELECT COUNT(*)::int AS value FROM customers"),
    query("SELECT COUNT(*)::int AS value FROM subscriptions WHERE status = 'active'"),
    query("SELECT COALESCE(SUM(amount_usd), 0)::float AS value FROM invoices WHERE status = 'paid'"),
    query(
      `SELECT i.id, i.name, i.location, i.contact_phone AS "contactPhone", i.is_demo AS "isDemo",
              i.created_at AS "createdAt", ps.status AS "subscriptionStatus", ps.ends_at AS "subscriptionEndsAt",
              pp.name AS "packageName",
              COALESCE(
                json_agg(
                  json_build_object('id', u.id, 'fullName', u.full_name, 'email', u.email, 'role', u.role)
                ) FILTER (WHERE u.id IS NOT NULL),
                '[]'::json
              ) AS "adminUsers"
       FROM isps i
       LEFT JOIN LATERAL (
         SELECT s.package_id, s.status, s.ends_at
         FROM isp_platform_subscriptions s
         WHERE s.isp_id = i.id
         ORDER BY s.ends_at DESC, s.created_at DESC
         LIMIT 1
       ) ps ON TRUE
       LEFT JOIN platform_packages pp ON pp.id = ps.package_id
       LEFT JOIN users u ON u.isp_id = i.id AND u.role IN ('company_manager', 'isp_admin')
       GROUP BY i.id, ps.status, ps.ends_at, pp.name
       ORDER BY i.created_at DESC
       LIMIT 3000`
    )
  ]);
  res.json({
    totalIsps: isps.rows[0].value,
    totalCustomers: customers.rows[0].value,
    totalActiveSubscriptions: active.rows[0].value,
    totalRevenueUsd: revenue.rows[0].value,
    tenants: tenants.rows
  });
});

app.get("/api/system-owner/dashboard-banners", authenticate, requireRoles("system_owner"), async (_req, res) => {
  const r = await query(
    `SELECT slot_index AS "slotIndex", image_url AS "imageUrl", image_bytes AS "imageBytes", image_mime AS "imageMime",
            link_url AS "linkUrl", alt_text AS "altText", is_active AS "isActive", updated_at AS "updatedAt"
     FROM platform_dashboard_banners
     WHERE slot_index BETWEEN 0 AND 2
     ORDER BY slot_index`
  );
  res.json({ slots: r.rows.map((row) => mapPlatformBannerSlideRow(row)) });
});

app.post(
  "/api/system-owner/dashboard-banners/:slot/image",
  authenticate,
  requireRoles("system_owner"),
  uploadLogoMemory.single("banner"),
  async (req, res) => {
    const slot = parsePlatformBannerSlot(req.params.slot);
    if (slot == null) return res.status(400).json({ message: "slot must be 0, 1, or 2" });
    if (!req.file?.buffer) {
      return res.status(400).json({ message: "Choose an image file (form field name: banner)." });
    }
    const mimeToExt = {
      "image/png": ".png",
      "image/jpeg": ".jpg",
      "image/jpg": ".jpg",
      "image/webp": ".webp",
      "image/gif": ".gif"
    };
    const ext = mimeToExt[req.file.mimetype];
    if (!ext) {
      return res.status(400).json({ message: "Banner must be PNG, JPEG, WebP or GIF." });
    }
    await clearPlatformBannerFiles(slot);
    await query(
      `UPDATE platform_dashboard_banners SET image_bytes = $1, image_mime = $2, image_url = NULL, updated_at = NOW()
       WHERE slot_index = $3`,
      [req.file.buffer, req.file.mimetype, slot]
    );
    await logAudit({
      actorUserId: req.user.sub,
      action: "platform_dashboard_banner.image_uploaded",
      entityType: "platform_dashboard_banner",
      entityId: null,
      details: { slot, mime: req.file.mimetype }
    });
    const row = await query(
      `SELECT slot_index AS "slotIndex", image_url AS "imageUrl", image_bytes AS "imageBytes", image_mime AS "imageMime",
              link_url AS "linkUrl", alt_text AS "altText", is_active AS "isActive", updated_at AS "updatedAt"
       FROM platform_dashboard_banners WHERE slot_index = $1`,
      [slot]
    );
    res.json(mapPlatformBannerSlideRow(row.rows[0]));
  }
);

app.patch("/api/system-owner/dashboard-banners/:slot", authenticate, requireRoles("system_owner"), async (req, res) => {
  const slot = parsePlatformBannerSlot(req.params.slot);
  if (slot == null) return res.status(400).json({ message: "slot must be 0, 1, or 2" });
  const b = req.body || {};
  const pieces = [];
  const vals = [];
  let i = 1;
  if (Object.prototype.hasOwnProperty.call(b, "linkUrl")) {
    const norm = normalizeBannerLinkUrl(b.linkUrl);
    if (norm === undefined) {
      return res.status(400).json({ message: "linkUrl must be a valid http(s) URL or empty." });
    }
    pieces.push(`link_url = $${i++}`);
    vals.push(norm);
  }
  if (Object.prototype.hasOwnProperty.call(b, "altText")) {
    pieces.push(`alt_text = $${i++}`);
    vals.push(normalizeBannerAltText(b.altText));
  }
  if (Object.prototype.hasOwnProperty.call(b, "isActive")) {
    pieces.push(`is_active = $${i++}`);
    vals.push(Boolean(b.isActive));
  }
  if (pieces.length === 0) {
    return res.status(400).json({ message: "Provide linkUrl, altText, and/or isActive." });
  }
  pieces.push("updated_at = NOW()");
  vals.push(slot);
  await query(`UPDATE platform_dashboard_banners SET ${pieces.join(", ")} WHERE slot_index = $${i}`, vals);
  await logAudit({
    actorUserId: req.user.sub,
    action: "platform_dashboard_banner.updated",
    entityType: "platform_dashboard_banner",
    entityId: null,
    details: { slot, fields: Object.keys(b) }
  });
  const row = await query(
    `SELECT slot_index AS "slotIndex", image_url AS "imageUrl", image_bytes AS "imageBytes", image_mime AS "imageMime",
            link_url AS "linkUrl", alt_text AS "altText", is_active AS "isActive", updated_at AS "updatedAt"
     FROM platform_dashboard_banners WHERE slot_index = $1`,
    [slot]
  );
  res.json(mapPlatformBannerSlideRow(row.rows[0]));
});

app.delete(
  "/api/system-owner/dashboard-banners/:slot/image",
  authenticate,
  requireRoles("system_owner"),
  async (req, res) => {
    const slot = parsePlatformBannerSlot(req.params.slot);
    if (slot == null) return res.status(400).json({ message: "slot must be 0, 1, or 2" });
    await clearPlatformBannerFiles(slot);
    await query(
      `UPDATE platform_dashboard_banners SET image_bytes = NULL, image_mime = NULL, image_url = NULL, updated_at = NOW()
       WHERE slot_index = $1`,
      [slot]
    );
    await logAudit({
      actorUserId: req.user.sub,
      action: "platform_dashboard_banner.image_cleared",
      entityType: "platform_dashboard_banner",
      entityId: null,
      details: { slot }
    });
    const row = await query(
      `SELECT slot_index AS "slotIndex", image_url AS "imageUrl", image_bytes AS "imageBytes", image_mime AS "imageMime",
              link_url AS "linkUrl", alt_text AS "altText", is_active AS "isActive", updated_at AS "updatedAt"
       FROM platform_dashboard_banners WHERE slot_index = $1`,
      [slot]
    );
    res.json(mapPlatformBannerSlideRow(row.rows[0]));
  }
);

app.get("/api/system-owner/home-promos", authenticate, requireRoles("system_owner"), async (_req, res) => {
  const r = await query(
    `SELECT slot_index, link_url, alt_text_fr, alt_text_en, caption_fr, caption_en, orientation, image_bytes, image_mime, is_active, updated_at
     FROM platform_home_promos
     WHERE slot_index BETWEEN 0 AND 2
     ORDER BY slot_index`
  );
  res.json({ slots: r.rows.map(mapHomePromoRow) });
});

app.patch("/api/system-owner/home-promos/:slot", authenticate, requireRoles("system_owner"), async (req, res) => {
  const slot = parsePlatformBannerSlot(req.params.slot);
  if (slot == null) return res.status(400).json({ message: "slot must be 0, 1, or 2" });
  const b = req.body || {};
  const pieces = [];
  const vals = [];
  let i = 1;
  if (Object.prototype.hasOwnProperty.call(b, "linkUrl")) {
    const norm = normalizeBannerLinkUrl(b.linkUrl);
    if (norm === undefined) {
      return res.status(400).json({ message: "linkUrl must be a valid http(s) URL or empty." });
    }
    pieces.push(`link_url = $${i++}`);
    vals.push(norm);
  }
  if (Object.prototype.hasOwnProperty.call(b, "altTextFr")) {
    pieces.push(`alt_text_fr = $${i++}`);
    vals.push(normalizePromoAlt(b.altTextFr));
  }
  if (Object.prototype.hasOwnProperty.call(b, "altTextEn")) {
    pieces.push(`alt_text_en = $${i++}`);
    vals.push(normalizePromoAlt(b.altTextEn));
  }
  if (Object.prototype.hasOwnProperty.call(b, "captionFr")) {
    pieces.push(`caption_fr = $${i++}`);
    vals.push(normalizePromoAlt(b.captionFr));
  }
  if (Object.prototype.hasOwnProperty.call(b, "captionEn")) {
    pieces.push(`caption_en = $${i++}`);
    vals.push(normalizePromoAlt(b.captionEn));
  }
  if (Object.prototype.hasOwnProperty.call(b, "orientation")) {
    const o = String(b.orientation || "").toLowerCase() === "square" ? "square" : "landscape";
    pieces.push(`orientation = $${i++}`);
    vals.push(o);
  }
  if (Object.prototype.hasOwnProperty.call(b, "isActive")) {
    pieces.push(`is_active = $${i++}`);
    vals.push(Boolean(b.isActive));
  }
  if (pieces.length === 0) {
    return res
      .status(400)
      .json({ message: "Provide linkUrl, altTextFr, altTextEn, captionFr, captionEn, orientation, and/or isActive." });
  }
  pieces.push("updated_at = NOW()");
  vals.push(slot);
  await query(`UPDATE platform_home_promos SET ${pieces.join(", ")} WHERE slot_index = $${i}`, vals);
  await logAudit({
    actorUserId: req.user.sub,
    action: "platform_home_promo.updated",
    entityType: "platform_home_promo",
    entityId: String(slot),
    details: { fields: Object.keys(b) }
  });
  const row = await query(
    `SELECT slot_index, link_url, alt_text_fr, alt_text_en, caption_fr, caption_en, orientation, image_bytes, image_mime, is_active, updated_at
     FROM platform_home_promos WHERE slot_index = $1`,
    [slot]
  );
  res.json(mapHomePromoRow(row.rows[0]));
});

app.post(
  "/api/system-owner/home-promos/:slot/image",
  authenticate,
  requireRoles("system_owner"),
  uploadLogoMemory.single("banner"),
  async (req, res) => {
    const slot = parsePlatformBannerSlot(req.params.slot);
    if (slot == null) return res.status(400).json({ message: "slot must be 0, 1, or 2" });
    if (!req.file?.buffer) {
      return res.status(400).json({ message: "Choose an image file (form field name: banner)." });
    }
    const allowed = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);
    if (!allowed.has(req.file.mimetype)) {
      return res.status(400).json({ message: "Image must be PNG, JPEG, WebP or GIF." });
    }
    await query(
      `UPDATE platform_home_promos SET image_bytes = $1, image_mime = $2, updated_at = NOW() WHERE slot_index = $3`,
      [req.file.buffer, req.file.mimetype, slot]
    );
    await logAudit({
      actorUserId: req.user.sub,
      action: "platform_home_promo.image_uploaded",
      entityType: "platform_home_promo",
      entityId: String(slot),
      details: { mime: req.file.mimetype }
    });
    const row = await query(
      `SELECT slot_index, link_url, alt_text_fr, alt_text_en, caption_fr, caption_en, orientation, image_bytes, image_mime, is_active, updated_at
       FROM platform_home_promos WHERE slot_index = $1`,
      [slot]
    );
    res.json(mapHomePromoRow(row.rows[0]));
  }
);

app.delete("/api/system-owner/home-promos/:slot/image", authenticate, requireRoles("system_owner"), async (req, res) => {
  const slot = parsePlatformBannerSlot(req.params.slot);
  if (slot == null) return res.status(400).json({ message: "slot must be 0, 1, or 2" });
  await query(
    `UPDATE platform_home_promos SET image_bytes = NULL, image_mime = NULL, updated_at = NOW() WHERE slot_index = $1`,
    [slot]
  );
  await logAudit({
    actorUserId: req.user.sub,
    action: "platform_home_promo.image_cleared",
    entityType: "platform_home_promo",
    entityId: String(slot),
    details: {}
  });
  const row = await query(
    `SELECT slot_index, link_url, alt_text_fr, alt_text_en, caption_fr, caption_en, orientation, image_bytes, image_mime, is_active, updated_at
     FROM platform_home_promos WHERE slot_index = $1`,
    [slot]
  );
  res.json(mapHomePromoRow(row.rows[0]));
});

app.get("/api/system-owner/founder-showcase", authenticate, requireRoles("system_owner"), async (_req, res) => {
  const r = await query(
    `SELECT caption, image_bytes, image_mime, updated_at FROM platform_public_founder_showcase WHERE id = 1`
  );
  res.json(mapFounderShowcaseRow(r.rows[0]));
});

app.patch("/api/system-owner/founder-showcase", authenticate, requireRoles("system_owner"), async (req, res) => {
  const b = req.body || {};
  if (!Object.prototype.hasOwnProperty.call(b, "caption")) {
    return res.status(400).json({ message: "Provide caption." });
  }
  const caption = normalizeFounderCaption(b.caption);
  await query(
    `INSERT INTO platform_public_founder_showcase (id, caption, updated_at) VALUES (1, $1, NOW())
     ON CONFLICT (id) DO UPDATE SET caption = EXCLUDED.caption, updated_at = NOW()`,
    [caption]
  );
  await logAudit({
    actorUserId: req.user.sub,
    action: "platform_founder_showcase.updated",
    entityType: "platform_public_founder_showcase",
    entityId: "1",
    details: { fields: ["caption"] }
  });
  const row = await query(
    `SELECT caption, image_bytes, image_mime, updated_at FROM platform_public_founder_showcase WHERE id = 1`
  );
  res.json(mapFounderShowcaseRow(row.rows[0]));
});

app.post(
  "/api/system-owner/founder-showcase/image",
  authenticate,
  requireRoles("system_owner"),
  uploadLogoMemory.single("banner"),
  async (req, res) => {
    if (!req.file?.buffer) {
      return res.status(400).json({ message: "Choose an image file (form field name: banner)." });
    }
    const allowed = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);
    if (!allowed.has(req.file.mimetype)) {
      return res.status(400).json({ message: "Image must be PNG, JPEG, WebP or GIF." });
    }
    const shouldPatchCaption = req.body != null && Object.prototype.hasOwnProperty.call(req.body, "caption");
    const nextCaption = shouldPatchCaption ? normalizeFounderCaption(req.body.caption) : null;
    if (shouldPatchCaption) {
      await query(
        `INSERT INTO platform_public_founder_showcase (id, caption, image_bytes, image_mime, updated_at)
         VALUES (1, $3, $1, $2, NOW())
         ON CONFLICT (id) DO UPDATE SET
           caption = EXCLUDED.caption,
           image_bytes = EXCLUDED.image_bytes,
           image_mime = EXCLUDED.image_mime,
           updated_at = NOW()`,
        [req.file.buffer, req.file.mimetype, nextCaption]
      );
    } else {
      await query(
        `INSERT INTO platform_public_founder_showcase (id, image_bytes, image_mime, updated_at)
         VALUES (1, $1, $2, NOW())
         ON CONFLICT (id) DO UPDATE SET image_bytes = EXCLUDED.image_bytes, image_mime = EXCLUDED.image_mime, updated_at = NOW()`,
        [req.file.buffer, req.file.mimetype]
      );
    }
    await logAudit({
      actorUserId: req.user.sub,
      action: "platform_founder_showcase.image_uploaded",
      entityType: "platform_public_founder_showcase",
      entityId: "1",
      details: { mime: req.file.mimetype }
    });
    const row = await query(
      `SELECT caption, image_bytes, image_mime, updated_at FROM platform_public_founder_showcase WHERE id = 1`
    );
    res.json(mapFounderShowcaseRow(row.rows[0]));
  }
);

app.delete("/api/system-owner/founder-showcase/image", authenticate, requireRoles("system_owner"), async (_req, res) => {
  await query(
    `INSERT INTO platform_public_founder_showcase (id, updated_at) VALUES (1, NOW())
     ON CONFLICT (id) DO UPDATE SET image_bytes = NULL, image_mime = NULL, updated_at = NOW()`
  );
  await logAudit({
    actorUserId: req.user.sub,
    action: "platform_founder_showcase.image_cleared",
    entityType: "platform_public_founder_showcase",
    entityId: "1",
    details: {}
  });
  const row = await query(
    `SELECT caption, image_bytes, image_mime, updated_at FROM platform_public_founder_showcase WHERE id = 1`
  );
  res.json(mapFounderShowcaseRow(row.rows[0]));
});

app.get("/api/system-owner/footer-blocks", authenticate, requireRoles("system_owner"), async (_req, res) => {
  const r = await query(
    `SELECT id, sort_order, title, body_html, image_bytes, image_mime, link_url, layout, placement, is_active, created_at, updated_at
     FROM platform_public_footer_blocks
     ORDER BY sort_order ASC, updated_at DESC
     LIMIT 100`
  );
  res.json({ items: r.rows.map(mapFooterBlockRow) });
});

app.post("/api/system-owner/footer-blocks", authenticate, requireRoles("system_owner"), async (req, res) => {
  const b = req.body || {};
  const v = validatePublicPageSlot(b.title || "", b.bodyHtml || "");
  if (!v.ok) return res.status(400).json({ message: v.message });
  const normLink = normalizeBannerLinkUrl(b.linkUrl);
  if (normLink === undefined) {
    return res.status(400).json({ message: "linkUrl must be a valid http(s) URL or empty." });
  }
  const sortOrder = Number(b.sortOrder) || 0;
  const layout = normalizePublicFooterLayout(b.layout);
  const placement = normalizePublicFooterPlacement(b.placement);
  const inserted = await query(
    `INSERT INTO platform_public_footer_blocks (id, sort_order, title, body_html, link_url, layout, placement, is_active)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)
     RETURNING id, sort_order, title, body_html, image_bytes, image_mime, link_url, layout, placement, is_active, created_at, updated_at`,
    [sortOrder, v.title, v.bodyHtml, normLink, layout, placement, b.isActive !== false]
  );
  await logAudit({
    actorUserId: req.user.sub,
    action: "platform_footer_block.created",
    entityType: "platform_public_footer_block",
    entityId: inserted.rows[0].id,
    details: {}
  });
  res.status(201).json(mapFooterBlockRow(inserted.rows[0]));
});

app.patch("/api/system-owner/footer-blocks/:id", authenticate, requireRoles("system_owner"), async (req, res) => {
  const { id } = req.params;
  if (!isUuidString(id)) return res.status(400).json({ message: "Invalid id." });
  const b = req.body || {};
  const cur = await query(`SELECT title, body_html FROM platform_public_footer_blocks WHERE id = $1`, [id]);
  if (!cur.rows[0]) return res.status(404).json({ message: "Not found." });
  let nextTitle = cur.rows[0].title;
  let nextBody = cur.rows[0].body_html;
  if (Object.prototype.hasOwnProperty.call(b, "title")) nextTitle = b.title;
  if (Object.prototype.hasOwnProperty.call(b, "bodyHtml")) nextBody = b.bodyHtml;
  const pieces = [];
  const vals = [];
  let i = 1;
  if (Object.prototype.hasOwnProperty.call(b, "title") || Object.prototype.hasOwnProperty.call(b, "bodyHtml")) {
    const v = validatePublicPageSlot(nextTitle, nextBody);
    if (!v.ok) return res.status(400).json({ message: v.message });
    pieces.push(`title = $${i++}`);
    vals.push(v.title);
    pieces.push(`body_html = $${i++}`);
    vals.push(v.bodyHtml);
  }
  if (Object.prototype.hasOwnProperty.call(b, "linkUrl")) {
    const norm = normalizeBannerLinkUrl(b.linkUrl);
    if (norm === undefined) {
      return res.status(400).json({ message: "linkUrl must be a valid http(s) URL or empty." });
    }
    pieces.push(`link_url = $${i++}`);
    vals.push(norm);
  }
  if (Object.prototype.hasOwnProperty.call(b, "sortOrder")) {
    pieces.push(`sort_order = $${i++}`);
    vals.push(Number(b.sortOrder) || 0);
  }
  if (Object.prototype.hasOwnProperty.call(b, "isActive")) {
    pieces.push(`is_active = $${i++}`);
    vals.push(Boolean(b.isActive));
  }
  if (Object.prototype.hasOwnProperty.call(b, "layout")) {
    pieces.push(`layout = $${i++}`);
    vals.push(normalizePublicFooterLayout(b.layout));
  }
  if (Object.prototype.hasOwnProperty.call(b, "placement")) {
    pieces.push(`placement = $${i++}`);
    vals.push(normalizePublicFooterPlacement(b.placement));
  }
  if (pieces.length === 0) {
    return res.status(400).json({ message: "Nothing to update." });
  }
  pieces.push("updated_at = NOW()");
  vals.push(id);
  await query(`UPDATE platform_public_footer_blocks SET ${pieces.join(", ")} WHERE id = $${i}`, vals);
  await logAudit({
    actorUserId: req.user.sub,
    action: "platform_footer_block.updated",
    entityType: "platform_public_footer_block",
    entityId: id,
    details: { fields: Object.keys(b) }
  });
  const row = await query(
    `SELECT id, sort_order, title, body_html, image_bytes, image_mime, link_url, layout, placement, is_active, created_at, updated_at
     FROM platform_public_footer_blocks WHERE id = $1`,
    [id]
  );
  res.json(mapFooterBlockRow(row.rows[0]));
});

app.delete("/api/system-owner/footer-blocks/:id", authenticate, requireRoles("system_owner"), async (req, res) => {
  const { id } = req.params;
  if (!isUuidString(id)) return res.status(400).json({ message: "Invalid id." });
  const del = await query(`DELETE FROM platform_public_footer_blocks WHERE id = $1 RETURNING id`, [id]);
  if (!del.rows[0]) return res.status(404).json({ message: "Not found." });
  await logAudit({
    actorUserId: req.user.sub,
    action: "platform_footer_block.deleted",
    entityType: "platform_public_footer_block",
    entityId: id,
    details: {}
  });
  res.status(204).end();
});

app.post(
  "/api/system-owner/footer-blocks/:id/image",
  authenticate,
  requireRoles("system_owner"),
  uploadLogoMemory.single("banner"),
  async (req, res) => {
    const { id } = req.params;
    if (!isUuidString(id)) return res.status(400).json({ message: "Invalid id." });
    if (!req.file?.buffer) {
      return res.status(400).json({ message: "Choose an image file (form field name: banner)." });
    }
    const allowed = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);
    if (!allowed.has(req.file.mimetype)) {
      return res.status(400).json({ message: "Image must be PNG, JPEG, WebP or GIF." });
    }
    const ex = await query(`SELECT id FROM platform_public_footer_blocks WHERE id = $1`, [id]);
    if (!ex.rows[0]) return res.status(404).json({ message: "Not found." });
    await query(
      `UPDATE platform_public_footer_blocks SET image_bytes = $1, image_mime = $2, updated_at = NOW() WHERE id = $3`,
      [req.file.buffer, req.file.mimetype, id]
    );
    await logAudit({
      actorUserId: req.user.sub,
      action: "platform_footer_block.image_uploaded",
      entityType: "platform_public_footer_block",
      entityId: id,
      details: { mime: req.file.mimetype }
    });
    const row = await query(
      `SELECT id, sort_order, title, body_html, image_bytes, image_mime, link_url, layout, placement, is_active, created_at, updated_at
       FROM platform_public_footer_blocks WHERE id = $1`,
      [id]
    );
    res.json(mapFooterBlockRow(row.rows[0]));
  }
);

app.delete("/api/system-owner/footer-blocks/:id/image", authenticate, requireRoles("system_owner"), async (req, res) => {
  const { id } = req.params;
  if (!isUuidString(id)) return res.status(400).json({ message: "Invalid id." });
  await query(
    `UPDATE platform_public_footer_blocks SET image_bytes = NULL, image_mime = NULL, updated_at = NOW() WHERE id = $1`,
    [id]
  );
  await logAudit({
    actorUserId: req.user.sub,
    action: "platform_footer_block.image_cleared",
    entityType: "platform_public_footer_block",
    entityId: id,
    details: {}
  });
  const row = await query(
    `SELECT id, sort_order, title, body_html, image_bytes, image_mime, link_url, layout, placement, is_active, created_at, updated_at
     FROM platform_public_footer_blocks WHERE id = $1`,
    [id]
  );
  if (!row.rows[0]) return res.status(404).json({ message: "Not found." });
  res.json(mapFooterBlockRow(row.rows[0]));
});

function normalizeFaqAdInternalLabel(raw) {
  return String(raw ?? "").trim().slice(0, 160);
}

app.get("/api/system-owner/faq-ads", authenticate, requireRoles("system_owner"), async (_req, res) => {
  const r = await query(
    `SELECT id, sort_order, internal_label, link_url, alt_text_fr, alt_text_en, caption_fr, caption_en, image_bytes, image_mime, is_active, created_at, updated_at
     FROM platform_public_faq_ads
     ORDER BY sort_order ASC, updated_at DESC
     LIMIT 100`
  );
  res.json({ items: r.rows.map(mapFaqAdRow) });
});

app.post("/api/system-owner/faq-ads", authenticate, requireRoles("system_owner"), async (req, res) => {
  const b = req.body || {};
  const internalLabel = normalizeFaqAdInternalLabel(b.internalLabel);
  const sortOrder = Number(b.sortOrder) || 0;
  const normLink = normalizeBannerLinkUrl(b.linkUrl);
  if (normLink === undefined) {
    return res.status(400).json({ message: "linkUrl must be a valid http(s) URL or empty." });
  }
  const inserted = await query(
    `INSERT INTO platform_public_faq_ads (id, sort_order, internal_label, link_url, alt_text_fr, alt_text_en, caption_fr, caption_en, is_active)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, sort_order, internal_label, link_url, alt_text_fr, alt_text_en, caption_fr, caption_en, image_bytes, image_mime, is_active, created_at, updated_at`,
    [
      sortOrder,
      internalLabel,
      normLink,
      normalizePromoAlt(b.altTextFr),
      normalizePromoAlt(b.altTextEn),
      normalizePromoAlt(b.captionFr),
      normalizePromoAlt(b.captionEn),
      b.isActive !== false
    ]
  );
  await logAudit({
    actorUserId: req.user.sub,
    action: "platform_faq_ad.created",
    entityType: "platform_public_faq_ad",
    entityId: inserted.rows[0].id,
    details: {}
  });
  res.status(201).json(mapFaqAdRow(inserted.rows[0]));
});

app.patch("/api/system-owner/faq-ads/:id", authenticate, requireRoles("system_owner"), async (req, res) => {
  const { id } = req.params;
  if (!isUuidString(id)) return res.status(400).json({ message: "Invalid id." });
  const b = req.body || {};
  const pieces = [];
  const vals = [];
  let i = 1;
  if (Object.prototype.hasOwnProperty.call(b, "internalLabel")) {
    pieces.push(`internal_label = $${i++}`);
    vals.push(normalizeFaqAdInternalLabel(b.internalLabel));
  }
  if (Object.prototype.hasOwnProperty.call(b, "sortOrder")) {
    pieces.push(`sort_order = $${i++}`);
    vals.push(Number(b.sortOrder) || 0);
  }
  if (Object.prototype.hasOwnProperty.call(b, "linkUrl")) {
    const norm = normalizeBannerLinkUrl(b.linkUrl);
    if (norm === undefined) {
      return res.status(400).json({ message: "linkUrl must be a valid http(s) URL or empty." });
    }
    pieces.push(`link_url = $${i++}`);
    vals.push(norm);
  }
  if (Object.prototype.hasOwnProperty.call(b, "altTextFr")) {
    pieces.push(`alt_text_fr = $${i++}`);
    vals.push(normalizePromoAlt(b.altTextFr));
  }
  if (Object.prototype.hasOwnProperty.call(b, "altTextEn")) {
    pieces.push(`alt_text_en = $${i++}`);
    vals.push(normalizePromoAlt(b.altTextEn));
  }
  if (Object.prototype.hasOwnProperty.call(b, "captionFr")) {
    pieces.push(`caption_fr = $${i++}`);
    vals.push(normalizePromoAlt(b.captionFr));
  }
  if (Object.prototype.hasOwnProperty.call(b, "captionEn")) {
    pieces.push(`caption_en = $${i++}`);
    vals.push(normalizePromoAlt(b.captionEn));
  }
  if (Object.prototype.hasOwnProperty.call(b, "isActive")) {
    pieces.push(`is_active = $${i++}`);
    vals.push(Boolean(b.isActive));
  }
  if (pieces.length === 0) {
    return res.status(400).json({ message: "Nothing to update." });
  }
  pieces.push("updated_at = NOW()");
  vals.push(id);
  await query(`UPDATE platform_public_faq_ads SET ${pieces.join(", ")} WHERE id = $${i}`, vals);
  await logAudit({
    actorUserId: req.user.sub,
    action: "platform_faq_ad.updated",
    entityType: "platform_public_faq_ad",
    entityId: id,
    details: { fields: Object.keys(b) }
  });
  const row = await query(
    `SELECT id, sort_order, internal_label, link_url, alt_text_fr, alt_text_en, caption_fr, caption_en, image_bytes, image_mime, is_active, created_at, updated_at
     FROM platform_public_faq_ads WHERE id = $1`,
    [id]
  );
  if (!row.rows[0]) return res.status(404).json({ message: "Not found." });
  res.json(mapFaqAdRow(row.rows[0]));
});

app.delete("/api/system-owner/faq-ads/:id", authenticate, requireRoles("system_owner"), async (req, res) => {
  const { id } = req.params;
  if (!isUuidString(id)) return res.status(400).json({ message: "Invalid id." });
  const del = await query(`DELETE FROM platform_public_faq_ads WHERE id = $1 RETURNING id`, [id]);
  if (!del.rows[0]) return res.status(404).json({ message: "Not found." });
  await logAudit({
    actorUserId: req.user.sub,
    action: "platform_faq_ad.deleted",
    entityType: "platform_public_faq_ad",
    entityId: id,
    details: {}
  });
  res.status(204).end();
});

app.post(
  "/api/system-owner/faq-ads/:id/image",
  authenticate,
  requireRoles("system_owner"),
  uploadLogoMemory.single("banner"),
  async (req, res) => {
    const { id } = req.params;
    if (!isUuidString(id)) return res.status(400).json({ message: "Invalid id." });
    if (!req.file?.buffer) {
      return res.status(400).json({ message: "Choose an image file (form field name: banner)." });
    }
    const allowed = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);
    if (!allowed.has(req.file.mimetype)) {
      return res.status(400).json({ message: "Image must be PNG, JPEG, WebP or GIF." });
    }
    const ex = await query(`SELECT id FROM platform_public_faq_ads WHERE id = $1`, [id]);
    if (!ex.rows[0]) return res.status(404).json({ message: "Not found." });
    await query(
      `UPDATE platform_public_faq_ads SET image_bytes = $1, image_mime = $2, updated_at = NOW() WHERE id = $3`,
      [req.file.buffer, req.file.mimetype, id]
    );
    await logAudit({
      actorUserId: req.user.sub,
      action: "platform_faq_ad.image_uploaded",
      entityType: "platform_public_faq_ad",
      entityId: id,
      details: { mime: req.file.mimetype }
    });
    const row = await query(
      `SELECT id, sort_order, internal_label, link_url, alt_text_fr, alt_text_en, caption_fr, caption_en, image_bytes, image_mime, is_active, created_at, updated_at
       FROM platform_public_faq_ads WHERE id = $1`,
      [id]
    );
    res.json(mapFaqAdRow(row.rows[0]));
  }
);

app.delete("/api/system-owner/faq-ads/:id/image", authenticate, requireRoles("system_owner"), async (req, res) => {
  const { id } = req.params;
  if (!isUuidString(id)) return res.status(400).json({ message: "Invalid id." });
  await query(
    `UPDATE platform_public_faq_ads SET image_bytes = NULL, image_mime = NULL, updated_at = NOW() WHERE id = $1`,
    [id]
  );
  await logAudit({
    actorUserId: req.user.sub,
    action: "platform_faq_ad.image_cleared",
    entityType: "platform_public_faq_ad",
    entityId: id,
    details: {}
  });
  const row = await query(
    `SELECT id, sort_order, internal_label, link_url, alt_text_fr, alt_text_en, caption_fr, caption_en, image_bytes, image_mime, is_active, created_at, updated_at
     FROM platform_public_faq_ads WHERE id = $1`,
    [id]
  );
  if (!row.rows[0]) return res.status(404).json({ message: "Not found." });
  res.json(mapFaqAdRow(row.rows[0]));
});

const EXPENSE_CATEGORIES = [
  "field_agent_fixed",
  "field_agent_percentage",
  "equipment",
  "operations",
  "marketing",
  "utilities",
  "transport",
  "salaries",
  "taxes",
  "other"
];

async function countExpenseApproversForIsp(ispId) {
  const r = await query(
    `SELECT COUNT(DISTINCT user_id)::int AS c
     FROM user_isp_memberships
     WHERE isp_id = $1 AND is_active = TRUE
       AND role IN ('super_admin', 'company_manager', 'isp_admin')`,
    [ispId]
  );
  return Number(r.rows[0]?.c || 0);
}

function attachExpenseWorkflowFlags(row, actorUserId, approverCount, actorRole) {
  const status = row.status;
  const createdBy = row.createdBy;
  const multi = approverCount >= 2;
  const sameAsCreator = Boolean(createdBy && createdBy === actorUserId);
  const blockedSelf = multi && sameAsCreator;
  const isApprover = ["super_admin", "company_manager", "isp_admin"].includes(actorRole);
  const periodClosed = Boolean(row.periodClosed);
  const canApprove =
    isApprover &&
    !blockedSelf &&
    !periodClosed &&
    (status === "pending" || status === "rejected");
  const canReject = isApprover && !blockedSelf && !periodClosed && status === "pending";
  return {
    ...row,
    periodClosed,
    canApprove,
    canReject,
    approvalBlockedSelf: blockedSelf
  };
}

async function findAccountingClosureOverlappingExpensePeriod(ispId, periodStart, periodEnd) {
  const ps = String(periodStart || "").slice(0, 10);
  const pe = String(periodEnd || "").slice(0, 10);
  if (!ps || !pe || pe < ps) return null;
  const r = await query(
    `SELECT id, period_start AS "periodStart", period_end AS "periodEnd", note
     FROM isp_accounting_period_closures
     WHERE isp_id = $1 AND period_start <= $3::date AND period_end >= $2::date
     LIMIT 1`,
    [ispId, ps, pe]
  );
  return r.rows[0] || null;
}

function closedAccountingPeriodUserMessage(closure) {
  const a = closure.periodStart;
  const b = closure.periodEnd;
  return `Période comptable clôturée (révision / inventaire) du ${a} au ${b}. Aucune modification des dépenses n'est autorisée sur ce créneau. Rouvrez la clôture depuis la section « Clôtures comptables » si une correction est indispensable.`;
}

app.get(
  "/api/expenses",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin", "billing_agent", "noc_operator"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const from = String(req.query.from || "").slice(0, 10) || new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const to = String(req.query.to || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
    const approverCount = await countExpenseApproversForIsp(ispId);
    const [rows, sumApproved, sumPending, sumPay, closuresRes] = await Promise.all([
      query(
        `SELECT e.id, e.isp_id AS "ispId", e.amount_usd AS "amountUsd", e.category, e.description,
                e.period_start::text AS "periodStart", e.period_end::text AS "periodEnd",
                e.field_agent_id AS "fieldAgentId", u.full_name AS "fieldAgentName",
                e.agent_payout_type AS "agentPayoutType", e.agent_payout_percent AS "agentPayoutPercent",
                e.revenue_basis_usd AS "revenueBasisUsd", e.metadata, e.created_at AS "createdAt",
                e.created_by AS "createdBy", cu.full_name AS "createdByName",
                e.expense_status AS "status",
                e.approved_by AS "approvedBy", e.approved_at AS "approvedAt",
                e.rejected_by AS "rejectedBy", e.rejected_at AS "rejectedAt", e.rejection_note AS "rejectionNote",
                au.full_name AS "approvedByName", ru.full_name AS "rejectedByName"
         FROM isp_expenses e
         LEFT JOIN users u ON u.id = e.field_agent_id
         LEFT JOIN users cu ON cu.id = e.created_by
         LEFT JOIN users au ON au.id = e.approved_by
         LEFT JOIN users ru ON ru.id = e.rejected_by
         WHERE e.isp_id = $1 AND e.period_start <= $2::date AND e.period_end >= $3::date
         ORDER BY e.period_start DESC, e.created_at DESC
         LIMIT 500`,
        [ispId, to, from]
      ),
      query(
        `SELECT COALESCE(SUM(amount_usd), 0)::float AS t FROM isp_expenses
         WHERE isp_id = $1 AND expense_status = 'approved'
           AND period_start <= $2::date AND period_end >= $3::date`,
        [ispId, to, from]
      ),
      query(
        `SELECT COALESCE(SUM(amount_usd), 0)::float AS t FROM isp_expenses
         WHERE isp_id = $1 AND expense_status = 'pending'
           AND period_start <= $2::date AND period_end >= $3::date`,
        [ispId, to, from]
      ),
      query(
        `SELECT COALESCE(SUM(p.amount_usd), 0)::float AS t FROM payments p
         JOIN invoices i ON i.id = p.invoice_id
         WHERE i.isp_id = $1 AND p.status = 'confirmed'
         AND p.paid_at::date BETWEEN $2::date AND $3::date`,
        [ispId, from, to]
      ),
      query(
        `SELECT period_start::text AS "periodStart", period_end::text AS "periodEnd"
         FROM isp_accounting_period_closures WHERE isp_id = $1`,
        [ispId]
      )
    ]);
    const closureRows = closuresRes.rows || [];
    const items = rows.rows.map((row) => {
      const locked = closureRows.some(
        (c) =>
          String(c.periodStart) <= String(row.periodEnd) && String(c.periodEnd) >= String(row.periodStart)
      );
      return attachExpenseWorkflowFlags(
        { ...row, periodClosed: locked },
        req.user.sub,
        approverCount,
        req.user.role
      );
    });
    return res.json({
      items,
      summary: {
        totalExpensesUsd: sumApproved.rows[0].t,
        pendingExpensesUsd: sumPending.rows[0].t,
        collectionsInPeriodUsd: sumPay.rows[0].t,
        filterFrom: from,
        filterTo: to
      }
    });
  }
);

app.post(
  "/api/expenses",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const {
      amountUsd,
      category,
      description = "",
      periodStart,
      periodEnd,
      fieldAgentId = null,
      agentPayoutType = null,
      agentPayoutPercent = null,
      revenueBasisUsd = null,
      metadata = {}
    } = req.body || {};
    if (amountUsd == null || category == null || !periodStart || !periodEnd) {
      return res.status(400).json({ message: "amountUsd, category, periodStart and periodEnd are required" });
    }
    const amt = Number(amountUsd);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ message: "amountUsd must be a positive number" });
    }
    if (!EXPENSE_CATEGORIES.includes(String(category))) {
      return res.status(400).json({ message: `category must be one of: ${EXPENSE_CATEGORIES.join(", ")}` });
    }
    const ps = String(periodStart).slice(0, 10);
    const pe = String(periodEnd).slice(0, 10);
    if (pe < ps) return res.status(400).json({ message: "periodEnd must be on or after periodStart" });
    const closureHit = await findAccountingClosureOverlappingExpensePeriod(ispId, ps, pe);
    if (closureHit) {
      return res.status(409).json({ message: closedAccountingPeriodUserMessage(closureHit) });
    }
    let faid = fieldAgentId || null;
    if (faid) {
      const chk = await query(
        "SELECT id, role, isp_id FROM users WHERE id = $1",
        [faid]
      );
      const u = chk.rows[0];
      if (!u || u.isp_id !== ispId) return res.status(400).json({ message: "fieldAgentId must belong to this ISP" });
      if (u.role !== "field_agent") {
        return res.status(400).json({ message: "fieldAgentId must reference a field_agent user" });
      }
    }
    let apt = agentPayoutType ? String(agentPayoutType) : null;
    if (apt && !["fixed", "percentage"].includes(apt)) {
      return res.status(400).json({ message: "agentPayoutType must be fixed or percentage" });
    }
    if (category === "field_agent_fixed" || category === "field_agent_percentage") {
      if (!faid) return res.status(400).json({ message: "fieldAgentId is required for field agent expense categories" });
      if (category === "field_agent_fixed" && apt && apt !== "fixed") {
        return res.status(400).json({ message: "field_agent_fixed expects agentPayoutType fixed or null" });
      }
      if (category === "field_agent_percentage") {
        apt = "percentage";
        const pct = Number(agentPayoutPercent);
        if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
          return res.status(400).json({
            message: "field_agent_percentage requires agentPayoutPercent greater than 0 and at most 100"
          });
        }
      }
      if (category === "field_agent_fixed") {
        apt = apt || "fixed";
      }
    } else {
      faid = null;
      apt = null;
    }
    const revBasis =
      revenueBasisUsd != null && revenueBasisUsd !== ""
        ? Number(revenueBasisUsd)
        : null;
    if (revBasis != null && (!Number.isFinite(revBasis) || revBasis < 0)) {
      return res.status(400).json({ message: "revenueBasisUsd must be a non-negative number when provided" });
    }
    let pctVal =
      agentPayoutPercent != null && agentPayoutPercent !== ""
        ? Number(agentPayoutPercent)
        : null;
    if (category !== "field_agent_percentage") {
      pctVal = null;
    }
    const inserted = await query(
      `INSERT INTO isp_expenses (id, isp_id, amount_usd, category, description, period_start, period_end,
          field_agent_id, agent_payout_type, agent_payout_percent, revenue_basis_usd, metadata, created_by, expense_status)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::date, $6::date, $7, $8, $9, $10, $11::jsonb, $12, 'pending')
       RETURNING id, isp_id AS "ispId", amount_usd AS "amountUsd", category, description,
         period_start AS "periodStart", period_end AS "periodEnd",
         field_agent_id AS "fieldAgentId", agent_payout_type AS "agentPayoutType",
         agent_payout_percent AS "agentPayoutPercent", revenue_basis_usd AS "revenueBasisUsd",
         metadata, created_at AS "createdAt", created_by AS "createdBy",
         expense_status AS "status", approved_by AS "approvedBy", approved_at AS "approvedAt",
         rejected_by AS "rejectedBy", rejected_at AS "rejectedAt", rejection_note AS "rejectionNote"`,
      [
        ispId,
        amt,
        String(category),
        String(description || "").slice(0, 2000),
        ps,
        pe,
        faid,
        apt,
        pctVal,
        revBasis,
        JSON.stringify(metadata && typeof metadata === "object" ? metadata : {}),
        req.user.sub
      ]
    );
    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: "expense.created",
      entityType: "expense",
      entityId: inserted.rows[0].id,
      details: { category, amountUsd: amt, periodStart: ps, periodEnd: pe, status: "pending" }
    });
    return res.status(201).json(inserted.rows[0]);
  }
);

app.post(
  "/api/expenses/:expenseId/approve",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const { expenseId } = req.params;
    if (!isUuidString(expenseId)) return res.status(400).json({ message: "Identifiant de dépense invalide." });
    const approverCount = await countExpenseApproversForIsp(ispId);
    const existing = await query(
      `SELECT id, created_by AS "createdBy", expense_status AS "status",
              period_start::text AS "periodStart", period_end::text AS "periodEnd"
       FROM isp_expenses WHERE id = $1 AND isp_id = $2`,
      [expenseId, ispId]
    );
    const ex = existing.rows[0];
    if (!ex) return res.status(404).json({ message: "Dépense introuvable." });
    if (ex.status === "approved") {
      return res.status(409).json({ message: "Cette dépense est déjà approuvée." });
    }
    if (!["pending", "rejected"].includes(ex.status)) {
      return res.status(400).json({ message: "Statut de dépense inattendu." });
    }
    if (approverCount >= 2 && ex.createdBy && ex.createdBy === req.user.sub) {
      return res.status(403).json({
        message:
          "Au moins deux validateurs sont configurés : une autre personne doit approuver cette dépense (pas le demandeur)."
      });
    }
    const closureApr = await findAccountingClosureOverlappingExpensePeriod(
      ispId,
      ex.periodStart,
      ex.periodEnd
    );
    if (closureApr) {
      return res.status(409).json({ message: closedAccountingPeriodUserMessage(closureApr) });
    }
    const updated = await query(
      `UPDATE isp_expenses SET expense_status = 'approved', approved_by = $2, approved_at = NOW(),
        rejected_by = NULL, rejected_at = NULL, rejection_note = NULL
       WHERE id = $1 AND isp_id = $3
       RETURNING id, isp_id AS "ispId", amount_usd AS "amountUsd", category, description,
         period_start::text AS "periodStart", period_end::text AS "periodEnd",
         field_agent_id AS "fieldAgentId", agent_payout_type AS "agentPayoutType",
         agent_payout_percent AS "agentPayoutPercent", revenue_basis_usd AS "revenueBasisUsd",
         metadata, created_at AS "createdAt", created_by AS "createdBy",
         expense_status AS "status", approved_by AS "approvedBy", approved_at AS "approvedAt",
         rejected_by AS "rejectedBy", rejected_at AS "rejectedAt", rejection_note AS "rejectionNote"`,
      [expenseId, req.user.sub, ispId]
    );
    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: "expense.approved",
      entityType: "expense",
      entityId: expenseId,
      details: {}
    });
    return res.json(updated.rows[0]);
  }
);

app.post(
  "/api/expenses/:expenseId/reject",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const { expenseId } = req.params;
    if (!isUuidString(expenseId)) return res.status(400).json({ message: "Identifiant de dépense invalide." });
    const approverCount = await countExpenseApproversForIsp(ispId);
    const existing = await query(
      `SELECT id, created_by AS "createdBy", expense_status AS "status",
              period_start::text AS "periodStart", period_end::text AS "periodEnd"
       FROM isp_expenses WHERE id = $1 AND isp_id = $2`,
      [expenseId, ispId]
    );
    const ex = existing.rows[0];
    if (!ex) return res.status(404).json({ message: "Dépense introuvable." });
    if (ex.status !== "pending") {
      return res.status(400).json({
        message: "Seules les dépenses en attente peuvent être rejetées (supprimez ou corrigez autrement une dépense approuvée)."
      });
    }
    if (approverCount >= 2 && ex.createdBy && ex.createdBy === req.user.sub) {
      return res.status(403).json({
        message:
          "Au moins deux validateurs : une autre personne doit rejeter ou approuver cette demande (pas le demandeur)."
      });
    }
    const closureRej = await findAccountingClosureOverlappingExpensePeriod(
      ispId,
      ex.periodStart,
      ex.periodEnd
    );
    if (closureRej) {
      return res.status(409).json({ message: closedAccountingPeriodUserMessage(closureRej) });
    }
    const rejectionNote = String(req.body?.rejectionNote || "").trim().slice(0, 2000);
    const updated = await query(
      `UPDATE isp_expenses SET expense_status = 'rejected', rejected_by = $2, rejected_at = NOW(),
        rejection_note = $3, approved_by = NULL, approved_at = NULL
       WHERE id = $1 AND isp_id = $4
       RETURNING id, isp_id AS "ispId", amount_usd AS "amountUsd", category, description,
         period_start::text AS "periodStart", period_end::text AS "periodEnd",
         field_agent_id AS "fieldAgentId", agent_payout_type AS "agentPayoutType",
         agent_payout_percent AS "agentPayoutPercent", revenue_basis_usd AS "revenueBasisUsd",
         metadata, created_at AS "createdAt", created_by AS "createdBy",
         expense_status AS "status", approved_by AS "approvedBy", approved_at AS "approvedAt",
         rejected_by AS "rejectedBy", rejected_at AS "rejectedAt", rejection_note AS "rejectionNote"`,
      [expenseId, req.user.sub, rejectionNote || null, ispId]
    );
    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: "expense.rejected",
      entityType: "expense",
      entityId: expenseId,
      details: { rejectionNote: rejectionNote || null }
    });
    return res.json(updated.rows[0]);
  }
);

app.delete(
  "/api/expenses/:expenseId",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const { expenseId } = req.params;
    const ex = await query(
      `SELECT id, expense_status, period_start::text AS "periodStart", period_end::text AS "periodEnd"
       FROM isp_expenses WHERE id = $1 AND isp_id = $2`,
      [expenseId, ispId]
    );
    const row = ex.rows[0];
    if (!row) return res.status(404).json({ message: "Expense not found" });
    if (!["pending", "rejected"].includes(row.expense_status)) {
      return res.status(400).json({
        message: "Seules les dépenses en attente ou rejetées peuvent être supprimées. Retirez d’abord l’approbation si besoin."
      });
    }
    const closureDel = await findAccountingClosureOverlappingExpensePeriod(
      ispId,
      row.periodStart,
      row.periodEnd
    );
    if (closureDel) {
      return res.status(409).json({ message: closedAccountingPeriodUserMessage(closureDel) });
    }
    await query("DELETE FROM isp_expenses WHERE id = $1", [expenseId]);
    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: "expense.deleted",
      entityType: "expense",
      entityId: expenseId,
      details: {}
    });
    return res.json({ message: "Deleted" });
  }
);

app.get(
  "/api/accounting/period-closures",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin", "billing_agent", "noc_operator"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const r = await query(
      `SELECT c.id, c.isp_id AS "ispId", c.period_start::text AS "periodStart", c.period_end::text AS "periodEnd",
              c.note, c.closed_at AS "closedAt", c.closed_by AS "closedBy", u.full_name AS "closedByName"
       FROM isp_accounting_period_closures c
       LEFT JOIN users u ON u.id = c.closed_by
       WHERE c.isp_id = $1
       ORDER BY c.period_start DESC
       LIMIT 200`,
      [ispId]
    );
    return res.json(r.rows);
  }
);

app.post(
  "/api/accounting/period-closures",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const { periodStart, periodEnd, note = "" } = req.body || {};
    const ps = String(periodStart || "").slice(0, 10);
    const pe = String(periodEnd || "").slice(0, 10);
    if (!ps || !pe) {
      return res.status(400).json({ message: "periodStart et periodEnd sont requis (YYYY-MM-DD)." });
    }
    if (pe < ps) return res.status(400).json({ message: "periodEnd doit être postérieur ou égal à periodStart." });
    const overlap = await query(
      `SELECT id FROM isp_accounting_period_closures
       WHERE isp_id = $1 AND period_start <= $3::date AND period_end >= $2::date
       LIMIT 1`,
      [ispId, ps, pe]
    );
    if (overlap.rows[0]) {
      return res.status(409).json({
        message: "Cette plage chevauche une clôture déjà enregistrée pour cet espace."
      });
    }
    const pending = await query(
      `SELECT EXISTS (
        SELECT 1 FROM isp_expenses
        WHERE isp_id = $1 AND expense_status = 'pending'
          AND period_start <= $3::date AND period_end >= $2::date
      ) AS x`,
      [ispId, ps, pe]
    );
    if (pending.rows[0]?.x) {
      return res.status(409).json({
        message:
          "Des dépenses sont encore en attente de validation sur cette période. Approuvez-les ou rejetez-les avant la clôture (inventaire / révision)."
      });
    }
    try {
      const ins = await query(
        `INSERT INTO isp_accounting_period_closures (isp_id, period_start, period_end, note, closed_by)
         VALUES ($1, $2::date, $3::date, $4, $5)
         RETURNING id, isp_id AS "ispId", period_start::text AS "periodStart", period_end::text AS "periodEnd",
           note, closed_at AS "closedAt", closed_by AS "closedBy"`,
        [ispId, ps, pe, String(note || "").slice(0, 2000), req.user.sub]
      );
      const row = ins.rows[0];
      await logAudit({
        ispId,
        actorUserId: req.user.sub,
        action: "accounting.period_closed",
        entityType: "accounting_period_closure",
        entityId: row.id,
        details: { periodStart: ps, periodEnd: pe }
      });
      return res.status(201).json(row);
    } catch (err) {
      if (String(err?.code) === "23505") {
        return res.status(409).json({
          message: "Une clôture identique (mêmes dates) existe déjà."
        });
      }
      throw err;
    }
  }
);

app.delete(
  "/api/accounting/period-closures/:closureId",
  authenticate,
  requireRoles("super_admin", "company_manager", "isp_admin"),
  async (req, res) => {
    const ispId = resolveIspId(req, res);
    if (!ispId) return;
    const { closureId } = req.params;
    if (!isUuidString(closureId)) return res.status(400).json({ message: "Identifiant de clôture invalide." });
    const del = await query(
      `DELETE FROM isp_accounting_period_closures WHERE id = $1 AND isp_id = $2 RETURNING id, period_start::text AS "periodStart", period_end::text AS "periodEnd"`,
      [closureId, ispId]
    );
    if (!del.rows[0]) return res.status(404).json({ message: "Clôture introuvable." });
    await logAudit({
      ispId,
      actorUserId: req.user.sub,
      action: "accounting.period_reopened",
      entityType: "accounting_period_closure",
      entityId: closureId,
      details: del.rows[0]
    });
    return res.json({ message: "Clôture levée — les dépenses sur cette plage peuvent à nouveau être modifiées.", ...del.rows[0] });
  }
);

export default app;
