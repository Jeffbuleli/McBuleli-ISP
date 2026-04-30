import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const brandingUploadDir = process.env.BRANDING_UPLOAD_DIR
  ? path.resolve(process.env.BRANDING_UPLOAD_DIR)
  : path.join(__dirname, "..", "uploads", "branding");

/** Platform-wide dashboard banners (slots 0–2), managed by system_owner. */
export const platformBannerUploadDir = process.env.PLATFORM_BANNER_UPLOAD_DIR
  ? path.resolve(process.env.PLATFORM_BANNER_UPLOAD_DIR)
  : path.join(__dirname, "..", "uploads", "platform-banners");

export function ensureBrandingUploadDir() {
  fs.mkdirSync(brandingUploadDir, { recursive: true });
}

export function ensurePlatformBannerUploadDir() {
  fs.mkdirSync(platformBannerUploadDir, { recursive: true });
}

/** @param {string} ispId */
export async function clearBrandingLogoFiles(ispId) {
  ensureBrandingUploadDir();
  const files = await fs.promises.readdir(brandingUploadDir);
  await Promise.all(
    files
      .filter((f) => f.startsWith(`${ispId}.`))
      .map((f) => fs.promises.unlink(path.join(brandingUploadDir, f)).catch(() => {}))
  );
}

/** @param {number} slot 0 | 1 | 2 */
export async function clearPlatformBannerFiles(slot) {
  ensurePlatformBannerUploadDir();
  const files = await fs.promises.readdir(platformBannerUploadDir);
  const prefix = `${slot}.`;
  await Promise.all(
    files
      .filter((f) => f.startsWith(prefix))
      .map((f) => fs.promises.unlink(path.join(platformBannerUploadDir, f)).catch(() => {}))
  );
}
