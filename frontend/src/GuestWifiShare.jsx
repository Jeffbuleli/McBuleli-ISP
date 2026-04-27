import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { wifiGuestBaseUrl, wifiHotspotExampleUrl, wifiHotspotLoginTemplate } from "./wifiPortalUrls.js";

export default function GuestWifiShare({ ispId, caption, t }) {
  const [dataUrl, setDataUrl] = useState("");
  const [copyBase, setCopyBase] = useState(false);
  const [copyTemplate, setCopyTemplate] = useState(false);
  const [copyExample, setCopyExample] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const baseUrl = ispId ? wifiGuestBaseUrl(origin, ispId) : "";
  const hotspotTemplate = ispId ? wifiHotspotLoginTemplate(origin, ispId) : "";
  const exampleUrl = ispId ? wifiHotspotExampleUrl(origin, ispId) : "";

  const tr = (fr, en) => (t ? t(fr, en) : fr);

  useEffect(() => {
    if (!baseUrl) {
      setDataUrl("");
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(baseUrl, { width: 176, margin: 2, errorCorrectionLevel: "M" })
      .then((u) => {
        if (!cancelled) setDataUrl(u);
      })
      .catch(() => {
        if (!cancelled) setDataUrl("");
      });
    return () => {
      cancelled = true;
    };
  }, [baseUrl]);

  async function copyText(text, setDone) {
    if (!text || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      window.setTimeout(() => setDone(false), 2000);
    } catch (_e) {
      setDone(false);
    }
  }

  if (!ispId) return null;

  return (
    <div className="guest-wifi-share">
      {caption ? <p className="guest-wifi-share__title">{caption}</p> : null}

      <p className="guest-wifi-share__section-label">
        {tr("Lien court (partage & QR)", "Short link (share & QR)")}
      </p>
      <div className="guest-wifi-share__row">
        {dataUrl ? (
          <a href={baseUrl} target="_blank" rel="noreferrer" className="guest-wifi-share__qr-wrap">
            <img src={dataUrl} width={176} height={176} alt="" />
            <span className="guest-wifi-share__qr-hint">{tr("Ouvrir / tester", "Open / test")}</span>
          </a>
        ) : (
          <div className="guest-wifi-share__qr-placeholder" aria-hidden="true" />
        )}
        <div className="guest-wifi-share__actions">
          <code className="guest-wifi-share__url">{baseUrl}</code>
          <button type="button" className="guest-wifi-share__copy" onClick={() => copyText(baseUrl, setCopyBase)}>
            {copyBase ? tr("Copié", "Copied") : tr("Copier le lien", "Copy link")}
          </button>
          <p className="guest-wifi-share__hint">
            {tr(
              "Sans paramètres client : utile pour affiche, SMS ou test manuel avec ispId.",
              "Without client parameters: good for posters, SMS, or manual tests with ispId."
            )}
          </p>
        </div>
      </div>

      <p className="guest-wifi-share__section-label" style={{ marginTop: 20 }}>
        {tr(
          "URL portail captif (comme ip, router, mac) — MikroTik Hotspot",
          "Captive portal URL (ip, router, mac) — MikroTik Hotspot"
        )}
      </p>
      <p className="guest-wifi-share__hint">
        {tr(
          "À coller dans le routeur (profil Hotspot → URL de connexion / walled garden). Les variables $(ip), $(identity), $(mac-esc) sont remplacées par le routeur pour chaque client. Remplacez $(identity) par un identifiant fixe (ex. 52164) si vous n’utilisez pas l’identité MikroTik.",
          "Paste into the router (Hotspot profile → login / walled-garden URL). Variables $(ip), $(identity), $(mac-esc) are expanded per client. Replace $(identity) with a fixed site id (e.g. 52164) if you do not use MikroTik identity."
        )}
      </p>
      <div className="guest-wifi-share__code-block">
        <code className="guest-wifi-share__url guest-wifi-share__url--multiline">{hotspotTemplate}</code>
        <button
          type="button"
          className="guest-wifi-share__copy"
          onClick={() => copyText(hotspotTemplate, setCopyTemplate)}
        >
          {copyTemplate ? tr("Copié", "Copied") : tr("Copier le modèle routeur", "Copy router template")}
        </button>
      </div>

      <p className="guest-wifi-share__section-label" style={{ marginTop: 16 }}>
        {tr("Exemple d’URL complète (valeurs fictives)", "Example full URL (sample values)")}
      </p>
      <div className="guest-wifi-share__code-block">
        <code className="guest-wifi-share__url guest-wifi-share__url--multiline">{exampleUrl}</code>
        <button
          type="button"
          className="guest-wifi-share__copy"
          onClick={() => copyText(exampleUrl, setCopyExample)}
        >
          {copyExample ? tr("Copié", "Copied") : tr("Copier l’exemple", "Copy example")}
        </button>
      </div>
    </div>
  );
}
