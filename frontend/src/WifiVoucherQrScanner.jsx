import { useEffect, useId, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

/** Extract voucher code from QR payload (URL ?v=… or raw code). */
export function parseVoucherQrPayload(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";
  try {
    const u = new URL(text);
    const v = u.searchParams.get("v") || u.searchParams.get("voucher") || u.searchParams.get("code");
    if (v) return v.trim();
  } catch {
    /* not a URL */
  }
  const m = text.match(/[?&]v=([^&]+)/i);
  if (m?.[1]) {
    try {
      return decodeURIComponent(m[1]).trim();
    } catch {
      return m[1].trim();
    }
  }
  return text.replace(/\s+/g, "").slice(0, 64);
}

export default function WifiVoucherQrScanner({ onDetected, scanLabel = "Scanner le QR", stopLabel = "Stop" }) {
  const reactId = useId().replace(/:/g, "");
  const regionId = `wifi-voucher-qr-${reactId}`;
  const scannerRef = useRef(null);
  const [scanning, setScanning] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    return () => {
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s) {
        s.stop().catch(() => {}).finally(() => {
          try {
            s.clear();
          } catch {
            /* ignore */
          }
        });
      }
    };
  }, []);

  async function stopScan() {
    const s = scannerRef.current;
    scannerRef.current = null;
    setScanning(false);
    if (!s) return;
    try {
      await s.stop();
      s.clear();
    } catch {
      /* ignore */
    }
  }

  async function startScan() {
    setErr("");
    await stopScan();
    try {
      const scanner = new Html5Qrcode(regionId);
      scannerRef.current = scanner;
      setScanning(true);
      await scanner.start(
        { facingMode: "environment" },
        { fps: 8, qrbox: { width: 220, height: 220 }, aspectRatio: 1 },
        async (decoded) => {
          const code = parseVoucherQrPayload(decoded);
          if (!code) return;
          await stopScan();
          onDetected?.(code);
        },
        () => {}
      );
    } catch (e) {
      setScanning(false);
      scannerRef.current = null;
      setErr(e?.message || "Camera unavailable");
    }
  }

  return (
    <div className="wifi-qr-scanner">
      <div className="wifi-qr-scanner__actions">
        {!scanning ? (
          <button type="button" className="wifi-pay-submit wifi-pay-submit--secondary" onClick={startScan}>
            {scanLabel}
          </button>
        ) : (
          <button type="button" className="wifi-pay-submit wifi-pay-submit--secondary" onClick={stopScan}>
            {stopLabel}
          </button>
        )}
      </div>
      <div id={regionId} className={`wifi-qr-scanner__view${scanning ? " is-on" : ""}`} />
      {err ? <p className="wifi-qr-scanner__err">{err}</p> : null}
    </div>
  );
}
