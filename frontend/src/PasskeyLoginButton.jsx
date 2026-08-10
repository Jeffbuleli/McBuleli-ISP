import { useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { api } from "./api";

function PasskeyIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M7 11v1a5 5 0 0 0 10 0v-1" />
      <rect x="3" y="11" width="18" height="10" rx="2.5" />
    </svg>
  );
}

/**
 * Passwordless sign-in with a registered Passkey (same flow as mcbuleli.org).
 */
export default function PasskeyLoginButton({ email, isEn, disabled, onResult, onError }) {
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (busy || disabled) return;
    setBusy(true);
    try {
      if (!window.PublicKeyCredential) {
        throw new Error(
          isEn ? "Passkeys are not supported in this browser." : "Passkeys non supportes sur ce navigateur."
        );
      }
      const emailTrim = String(email || "").trim();
      const { options, challengeId } = await api.passkeyLoginOptions(
        emailTrim ? { email: emailTrim } : {}
      );
      const assertion = await startAuthentication({ optionsJSON: options });
      const payload = await api.passkeyLoginVerify({ challengeId, response: assertion });
      onResult?.(payload);
    } catch (err) {
      const name = err?.name || "";
      if (name === "NotAllowedError") {
        onError?.(
          isEn ? "Passkey cancelled or timed out." : "Passkey annulee ou expiree."
        );
      } else {
        onError?.(err?.message || (isEn ? "Passkey login failed." : "Echec de connexion Passkey."));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="auth-passkey-btn"
      onClick={() => void onClick()}
      disabled={busy || disabled}
    >
      <PasskeyIcon className="auth-passkey-btn__icon" />
      <span>
        {busy
          ? isEn
            ? "Confirm on your device…"
            : "Confirmez sur votre appareil…"
          : isEn
            ? "Passkey"
            : "Passkey"}
      </span>
    </button>
  );
}
