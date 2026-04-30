import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { query } from "./db.js";
import { clearBrandingLogoFiles } from "./uploadsConfig.js";

export function isS3BrandingConfigured() {
  return (
    String(process.env.BRANDING_LOGO_STORAGE || "").toLowerCase() === "s3" &&
    Boolean(process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY)
  );
}

let _client;

function getClient() {
  if (_client) return _client;
  const endpoint = process.env.S3_ENDPOINT?.trim() || undefined;
  _client = new S3Client({
    region: process.env.S3_REGION || "auto",
    ...(endpoint ? { endpoint } : {}),
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
    },
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true"
  });
  return _client;
}

function objectKeyFor(ispId, ext) {
  const raw = (process.env.S3_BRANDING_PREFIX || "branding").replace(/^\/+|\/+$/g, "");
  return `${raw}/${ispId}${ext}`;
}

/**
 * @param {{ ispId: string; ext: string; buffer: Buffer; contentType: string }} opts
 * @returns {Promise<string>} object key stored in DB
 */
export async function putBrandingLogoInS3(opts) {
  const { ispId, ext, buffer, contentType } = opts;
  const client = getClient();
  const Key = objectKeyFor(ispId, ext);
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: "public, max-age=86400"
    })
  );
  return Key;
}

/**
 * @param {string} objectKey
 * @returns {Promise<{ stream: import("stream").Readable; contentType: string }>}
 */
export async function getBrandingLogoStreamFromS3(objectKey) {
  const client = getClient();
  const out = await client.send(
    new GetObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: objectKey
    })
  );
  if (!out.Body) {
    const err = new Error("Empty S3 object body");
    err.code = "S3_EMPTY_BODY";
    throw err;
  }
  return {
    stream: /** @type {import("stream").Readable} */ (out.Body),
    contentType: out.ContentType || "application/octet-stream"
  };
}

/** @param {string | null | undefined} objectKey */
export async function deleteBrandingObjectInS3(objectKey) {
  if (!objectKey || !isS3BrandingConfigured()) return;
  const client = getClient();
  await client
    .send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: objectKey }))
    .catch(() => {});
}

/** Remove S3 object, local files, and clear logo_object_key (logo_url updated separately by caller if needed). */
export async function purgeHostedBrandingAssets(ispId) {
  const row = await query("SELECT logo_object_key FROM isp_branding WHERE isp_id = $1", [ispId]);
  const key = row.rows[0]?.logo_object_key;
  if (key) await deleteBrandingObjectInS3(key);
  await clearBrandingLogoFiles(ispId);
  await query(
    "UPDATE isp_branding SET logo_object_key = NULL, logo_bytes = NULL, logo_mime = NULL WHERE isp_id = $1",
    [ispId]
  );
}
