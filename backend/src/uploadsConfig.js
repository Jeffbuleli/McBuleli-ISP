import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const brandingUploadDir = process.env.BRANDING_UPLOAD_DIR
  ? path.resolve(process.env.BRANDING_UPLOAD_DIR)
  : path.join(__dirname, "..", "uploads", "branding");

export function ensureBrandingUploadDir() {
  fs.mkdirSync(brandingUploadDir, { recursive: true });
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
