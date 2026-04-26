import { useEffect, useState } from "react";
import QRCode from "qrcode";

export default function GuestWifiShare({ ispId, caption }) {
  const [dataUrl, setDataUrl] = useState("");
  const [copyDone, setCopyDone] = useState(false);
  const url =
    typeof window !== "undefined" && ispId
      ? `${window.location.origin}/wifi?ispId=${encodeURIComponent(ispId)}`
      : "";

  useEffect(() => {
    if (!url) {
      setDataUrl("");
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(url, { width: 176, margin: 2, errorCorrectionLevel: "M" })
      .then((u) => {
        if (!cancelled) setDataUrl(u);
      })
      .catch(() => {
        if (!cancelled) setDataUrl("");
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  async function copyLink() {
    if (!url || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopyDone(true);
      window.setTimeout(() => setCopyDone(false), 2000);
    } catch (_e) {
      setCopyDone(false);
    }
  }

  if (!ispId) return null;

  return (
    <div className="guest-wifi-share">
      {caption ? <p className="guest-wifi-share__title">{caption}</p> : null}
      <div className="guest-wifi-share__row">
        {dataUrl ? (
          <a href={url} target="_blank" rel="noreferrer" className="guest-wifi-share__qr-wrap">
            <img src={dataUrl} width={176} height={176} alt="" />
            <span className="guest-wifi-share__qr-hint">Ouvrir / tester</span>
          </a>
        ) : (
          <div className="guest-wifi-share__qr-placeholder" aria-hidden="true" />
        )}
        <div className="guest-wifi-share__actions">
          <code className="guest-wifi-share__url">{url}</code>
          <button type="button" className="guest-wifi-share__copy" onClick={copyLink}>
            {copyDone ? "Copié" : "Copier le lien"}
          </button>
          <p className="guest-wifi-share__hint">
            Partagez le QR code ou le lien court copié pour l’achat Wi‑Fi invité.
          </p>
        </div>
      </div>
    </div>
  );
}
