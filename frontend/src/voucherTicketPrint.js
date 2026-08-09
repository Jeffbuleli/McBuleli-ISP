import QRCode from "qrcode";
import { mcbuleliLogoUrl } from "./brandAssets.js";
import { wifiGuestBaseUrl } from "./wifiPortalUrls.js";

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

/**
 * QR with high ECC + McBuleli mark centered on a white pad (keeps codes scannable).
 */
export async function buildVoucherQrDataUrl(payload, {
  size = 280,
  logoUrl = mcbuleliLogoUrl
} = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  await QRCode.toCanvas(canvas, String(payload), {
    errorCorrectionLevel: "H",
    margin: 3,
    width: size,
    color: { dark: "#0b1f12", light: "#ffffff" }
  });
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas.toDataURL("image/png");

  try {
    const logo = await loadImage(logoUrl);
    const pad = Math.round(size * 0.28);
    const logoBox = Math.round(size * 0.2);
    const x = (size - pad) / 2;
    const y = (size - pad) / 2;
    const lx = (size - logoBox) / 2;
    const ly = (size - logoBox) / 2;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    const r = pad / 2;
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + pad, y, x + pad, y + pad, r);
    ctx.arcTo(x + pad, y + pad, x, y + pad, r);
    ctx.arcTo(x, y + pad, x, y, r);
    ctx.arcTo(x, y, x + pad, y, r);
    ctx.closePath();
    ctx.fill();
    ctx.drawImage(logo, lx, ly, logoBox, logoBox);
  } catch {
    /* logo optional — QR alone still works */
  }
  return canvas.toDataURL("image/png");
}

export function voucherScanUrl(origin, ispId, code) {
  const base = wifiGuestBaseUrl(origin, ispId);
  if (!base) return String(code || "");
  return `${base}&v=${encodeURIComponent(String(code || "").trim())}`;
}

/**
 * Build print/PDF HTML: hackathon-badge style cards, dense grid, scannable QRs.
 */
export async function buildVoucherTicketsHtml({
  vouchers,
  ispId,
  brandTitle,
  brandLogoUrl,
  mcbuleliLogoAbsolute,
  isEn = false
}) {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://isp.mcbuleli.org";
  const mark = mcbuleliLogoAbsolute || mcbuleliLogoUrl;
  const title = isEn
    ? `${vouchers.length} Wi‑Fi vouchers`
    : `${vouchers.length} vouchers Wi‑Fi`;
  const hint = isEn
    ? "Print → Save as PDF. Cut along guides. QR opens guest page with code."
    : "Imprimer → Enregistrer en PDF. Découpez le long des guides. Le QR ouvre la page invité avec le code.";

  const cards = [];
  for (let i = 0; i < vouchers.length; i += 1) {
    const v = vouchers[i];
    const code = String(v.code || "").trim();
    const days = Math.max(1, Number(v.durationDays) || 1);
    const price = v.priceUsd != null ? Number(v.priceUsd).toFixed(0) : "-";
    const plan = v.planName || brandTitle;
    const dayLabel = days === 1 ? (isEn ? "1 DAY" : "1 JOUR") : isEn ? `${days} DAYS` : `${days} JOURS`;
    const scanUrl = voucherScanUrl(origin, ispId, code);
    const qrUrl = await buildVoucherQrDataUrl(scanUrl, {
      size: 300,
      logoUrl: mark
    });
    cards.push(`
      <article class="badge">
        <div class="badge__rail" aria-hidden="true"></div>
        <header class="badge__head">
          <span class="badge__chip">${esc(dayLabel)}</span>
          <span class="badge__price">${esc(price)}$</span>
        </header>
        <div class="badge__brand">
          <img class="badge__isp-logo" src="${esc(brandLogoUrl)}" alt="" />
          <div>
            <p class="badge__isp">${esc(brandTitle)}</p>
            <p class="badge__plan">${esc(plan)}</p>
          </div>
        </div>
        <div class="badge__qr-wrap">
          <img class="badge__qr" src="${esc(qrUrl)}" alt="QR ${esc(code)}" width="132" height="132" />
        </div>
        <div class="badge__code-box">
          <span class="badge__code-label">Voucher code</span>
          <code class="badge__code">${esc(code)}</code>
        </div>
        <div class="badge__meta">
          <span>${esc(v.speedLabel || v.rateLimit || "-")}</span>
          <span>${esc(v.maxDevices ?? 1)} ${isEn ? "device(s)" : "app."}</span>
        </div>
        <footer class="badge__foot">
          <span>${isEn ? `Valid ${days}d after activation` : `Valide ${days}j après activation`}</span>
          <div class="powered">
            <span>Powered by</span>
            <span class="powered__mark"><img src="${esc(mark)}" alt="" width="16" height="16"/></span>
            <a href="https://x.com/McBuleli" target="_blank" rel="noopener noreferrer">McBuleli</a>
          </div>
        </footer>
      </article>`);
  }

  return `<!doctype html>
<html lang="${isEn ? "en" : "fr"}">
<head>
  <meta charset="utf-8"/>
  <title>${esc(brandTitle)} - Wi‑Fi vouchers</title>
  <style>
    @page { size: A4; margin: 8mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", system-ui, sans-serif;
      color: #102018;
      background: #fff;
    }
    .no-print {
      padding: 10px 12px;
      background: #eef6f0;
      border-bottom: 1px solid #c5e4c7;
      font-size: 12px;
      color: #305f33;
    }
    h1 {
      font-size: 13px;
      margin: 10px 12px 8px;
      font-weight: 800;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }
    .sheet {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0;
      padding: 0 4px;
    }
    .badge {
      position: relative;
      border: 1px dashed #9bb5a3;
      margin: 0;
      padding: 10px 10px 8px 14px;
      min-height: 268px;
      background:
        linear-gradient(180deg, #f4fbf6 0%, #ffffff 42%, #ffffff 100%);
      break-inside: avoid;
      page-break-inside: avoid;
      overflow: hidden;
    }
    .badge__rail {
      position: absolute;
      left: 0; top: 0; bottom: 0;
      width: 5px;
      background: linear-gradient(180deg, #2f7439 0%, #63b38f 55%, #b98b66 100%);
    }
    .badge__head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 6px;
    }
    .badge__chip {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 999px;
      background: #0f2a18;
      color: #d8f3e4;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.06em;
    }
    .badge__price {
      font-size: 14px;
      font-weight: 800;
      color: #2f7439;
    }
    .badge__brand {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 8px 0 6px;
    }
    .badge__isp-logo {
      width: 32px;
      height: 32px;
      object-fit: contain;
      border-radius: 8px;
      background: #fff;
      border: 1px solid rgba(47,116,57,0.2);
    }
    .badge__isp {
      margin: 0;
      font-size: 12px;
      font-weight: 800;
      line-height: 1.15;
    }
    .badge__plan {
      margin: 1px 0 0;
      font-size: 10px;
      color: #5a6b60;
    }
    .badge__qr-wrap {
      display: flex;
      justify-content: center;
      margin: 4px 0 6px;
      padding: 4px;
      background: #fff;
      border-radius: 10px;
      border: 1px solid #d7e5db;
    }
    .badge__qr {
      width: 118px;
      height: 118px;
      display: block;
      image-rendering: pixelated;
    }
    .badge__code-box {
      border: 1.5px solid #2f7439;
      border-radius: 8px;
      padding: 6px 8px;
      text-align: center;
      background: #f7fcf8;
    }
    .badge__code-label {
      display: block;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #5a6b60;
      margin-bottom: 2px;
      font-weight: 700;
    }
    .badge__code {
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.05em;
      font-family: ui-monospace, Menlo, Consolas, monospace;
      color: #0b1f12;
    }
    .badge__meta {
      display: flex;
      justify-content: space-between;
      gap: 6px;
      margin-top: 6px;
      font-size: 9px;
      color: #405348;
      font-weight: 600;
    }
    .badge__foot {
      margin-top: 6px;
      font-size: 9px;
      color: #6a7a70;
      text-align: center;
    }
    .powered {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      margin-top: 4px;
      font-size: 9px;
      color: #555;
    }
    .powered__mark {
      display: inline-flex;
      width: 16px;
      height: 16px;
      border-radius: 999px;
      overflow: hidden;
      background: #eaf5ee;
    }
    .powered__mark img { width: 16px; height: 16px; object-fit: contain; display: block; }
    .powered a {
      font-weight: 800;
      color: #305f33;
      text-decoration: none;
    }
    .sheet-powered {
      margin: 10px 12px 16px;
      padding-top: 8px;
      border-top: 1px solid #d7e5db;
    }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
      .badge { border-color: #b8c9be; }
    }
    @media (max-width: 720px) {
      .sheet { grid-template-columns: repeat(2, 1fr); }
    }
  </style>
</head>
<body>
  <p class="no-print">${esc(hint)}</p>
  <h1>${esc(brandTitle)} · ${esc(title)}</h1>
  <div class="sheet">${cards.join("")}</div>
  <div class="sheet-powered">
    <div class="powered">
      <span>Powered by</span>
      <span class="powered__mark"><img src="${esc(mark)}" alt="" width="16" height="16"/></span>
      <a href="https://x.com/McBuleli" target="_blank" rel="noopener noreferrer">McBuleli</a>
    </div>
  </div>
  <script>window.onload = function () { window.focus(); setTimeout(function(){ window.print(); }, 250); };</script>
</body>
</html>`;
}

export async function openVoucherTicketsPrint(options) {
  const html = await buildVoucherTicketsHtml(options);
  const win = window.open("", "_blank");
  if (!win) throw new Error("Popup blocked");
  win.document.write(html);
  win.document.close();
  return win;
}
