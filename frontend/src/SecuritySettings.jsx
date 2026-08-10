import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { startRegistration } from "@simplewebauthn/browser";
import { api } from "./api";
import { IconCopy, IconKey, IconMail, IconShield, IconSmartphone } from "./icons.jsx";

/**
 * Account security: Passkey (FIDO), email verification, Google Authenticator.
 */
export default function SecuritySettings({ t, isEn, user, onUserRefresh, audienceErr, setError, setNotice }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [totpSetup, setTotpSetup] = useState(null);
  const [totpCode, setTotpCode] = useState("");
  const [totpQr, setTotpQr] = useState("");

  async function refreshStatus() {
    const s = await api.getSecurityStatus();
    setStatus(s);
    return s;
  }

  useEffect(() => {
    refreshStatus().catch(() => {});
  }, []);

  useEffect(() => {
    if (!totpSetup?.otpauthUrl) {
      setTotpQr("");
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(totpSetup.otpauthUrl, { width: 180, margin: 1, errorCorrectionLevel: "M" })
      .then((u) => {
        if (!cancelled) setTotpQr(u);
      })
      .catch(() => {
        if (!cancelled) setTotpQr("");
      });
    return () => {
      cancelled = true;
    };
  }, [totpSetup?.otpauthUrl]);

  async function onAddPasskey() {
    setError("");
    setNotice("");
    setBusy("passkey");
    try {
      if (!window.PublicKeyCredential) {
        throw new Error(isEn ? "Passkeys not supported in this browser." : "Passkeys non supportes sur ce navigateur.");
      }
      const options = await api.webauthnRegisterOptions();
      const credential = await startRegistration({ optionsJSON: options });
      const next = await api.webauthnRegisterVerify({ credential, deviceName: "Passkey" });
      setStatus(next);
      setNotice(t("Passkey ajoutée.", "Passkey added."));
      onUserRefresh?.();
    } catch (err) {
      setError(audienceErr(err.message || t("Échec Passkey.", "Passkey failed.")));
    } finally {
      setBusy("");
    }
  }

  async function onRemovePasskey(id) {
    setError("");
    try {
      const next = await api.deletePasskey(id);
      setStatus(next);
      setNotice(t("Passkey supprimée.", "Passkey removed."));
    } catch (err) {
      setError(audienceErr(err.message || t("Suppression impossible.", "Could not remove.")));
    }
  }

  async function onSendEmailCode() {
    setError("");
    setNotice("");
    setBusy("email");
    try {
      const res = await api.sendSecurityEmailCode();
      setNotice(
        res.skipped
          ? t("Code généré (e-mail non configuré sur le serveur).", "Code generated (mail not configured on server).")
          : t("Code envoyé par e-mail.", "Code sent by email.")
      );
      if (res.devCode) setEmailCode(String(res.devCode));
    } catch (err) {
      setError(audienceErr(err.message || t("Envoi impossible.", "Could not send.")));
    } finally {
      setBusy("");
    }
  }

  async function onVerifyEmail(e) {
    e.preventDefault();
    setError("");
    setBusy("email-verify");
    try {
      const next = await api.verifySecurityEmailCode({ code: emailCode });
      setStatus(next);
      setEmailCode("");
      setNotice(t("E-mail vérifié.", "Email verified."));
      onUserRefresh?.();
    } catch (err) {
      setError(audienceErr(err.message || t("Code invalide.", "Invalid code.")));
    } finally {
      setBusy("");
    }
  }

  async function onStartTotp() {
    setError("");
    setBusy("totp");
    try {
      const data = await api.startTotpSetup();
      setTotpSetup(data);
      setTotpCode("");
      setNotice(t("Scannez le QR avec Google Authenticator.", "Scan the QR with Google Authenticator."));
    } catch (err) {
      setError(audienceErr(err.message || t("Configuration impossible.", "Setup failed.")));
    } finally {
      setBusy("");
    }
  }

  async function onEnableTotp(e) {
    e.preventDefault();
    setError("");
    setBusy("totp-enable");
    try {
      const next = await api.enableTotp({ code: totpCode });
      setStatus((prev) => ({ ...(prev || {}), ...next, mfaTotpEnabled: true }));
      setTotpSetup(null);
      setTotpCode("");
      setNotice(t("Google Authenticator activé.", "Google Authenticator enabled."));
      onUserRefresh?.();
    } catch (err) {
      setError(audienceErr(err.message || t("Code invalide.", "Invalid code.")));
    } finally {
      setBusy("");
    }
  }

  const passkeys = status?.passkeys || [];
  const emailOn = Boolean(status?.mfaEmailEnabled || status?.emailVerified);
  const totpOn = Boolean(status?.mfaTotpEnabled ?? user?.mfaTotpEnabled);

  return (
    <section className="panel security-settings" id="security-settings">
      <h2>{t("Sécurité", "Security")}</h2>

      <div className="security-methods">
        <article className="security-method">
          <header className="security-method__head">
            <IconKey width={20} height={20} aria-hidden />
            <strong>Passkey (FIDO)</strong>
            <span className={`security-method__badge${passkeys.length ? " is-on" : ""}`}>
              {passkeys.length ? t("Activé", "On") : t("Désactivé", "Off")}
            </span>
          </header>
          <button type="button" onClick={onAddPasskey} disabled={busy === "passkey"}>
            {busy === "passkey"
              ? t("Attente appareil…", "Waiting for device…")
              : t("Ajouter une Passkey", "Add a Passkey")}
          </button>
          {passkeys.length ? (
            <ul className="security-method__list">
              {passkeys.map((p) => (
                <li key={p.id}>
                  <span>{p.deviceName || "Passkey"}</span>
                  <button type="button" className="btn-secondary-outline" onClick={() => onRemovePasskey(p.id)}>
                    {t("Retirer", "Remove")}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </article>

        <article className="security-method">
          <header className="security-method__head">
            <IconMail width={20} height={20} aria-hidden />
            <strong>{t("Vérification e-mail", "Email verification")}</strong>
            <span className={`security-method__badge${emailOn ? " is-on" : ""}`}>
              {emailOn ? t("Vérifié", "Verified") : t("Non vérifié", "Off")}
            </span>
          </header>
          <p className="security-method__meta">{status?.email || user?.email || "-"}</p>
          <div className="security-method__row">
            <button type="button" onClick={onSendEmailCode} disabled={busy === "email"}>
              {t("Envoyer un code", "Send a code")}
            </button>
          </div>
          <form className="security-method__row" onSubmit={onVerifyEmail}>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder={t("Code à 6 chiffres", "6-digit code")}
              value={emailCode}
              onChange={(e) => setEmailCode(e.target.value)}
              required
            />
            <button type="submit" disabled={busy === "email-verify"}>
              {t("Vérifier", "Verify")}
            </button>
          </form>
        </article>

        <article className="security-method">
          <header className="security-method__head">
            <IconSmartphone width={20} height={20} aria-hidden />
            <strong>Google Authenticator</strong>
            <span className={`security-method__badge${totpOn ? " is-on" : ""}`}>
              {totpOn ? t("Activé", "On") : t("Désactivé", "Off")}
            </span>
          </header>
          <button type="button" onClick={onStartTotp} disabled={busy === "totp"}>
            {totpOn
              ? t("Régénérer", "Regenerate")
              : t("Configurer", "Set up")}
          </button>
          {totpSetup ? (
            <form className="security-totp-setup" onSubmit={onEnableTotp}>
              {totpQr ? <img src={totpQr} width={180} height={180} alt="QR" /> : null}
              <div className="security-method__row">
                <input readOnly value={totpSetup.secret || ""} />
                <button
                  type="button"
                  className="tenant-link-field__btn"
                  onClick={() => navigator.clipboard?.writeText(totpSetup.secret || "")}
                  title={t("Copier", "Copy")}
                >
                  <IconCopy width={16} height={16} aria-hidden />
                </button>
              </div>
              <input
                inputMode="numeric"
                placeholder={t("Code à 6 chiffres", "6-digit code")}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                required
              />
              <button type="submit" disabled={busy === "totp-enable"}>
                {t("Activer", "Enable")}
              </button>
            </form>
          ) : null}
        </article>
      </div>

      <p className="security-settings__hint">
        <IconShield width={16} height={16} aria-hidden />{" "}
        {t(
          "Utilisez au moins une méthode pour sécuriser votre compte.",
          "Use at least one method to secure your account."
        )}
      </p>
    </section>
  );
}
