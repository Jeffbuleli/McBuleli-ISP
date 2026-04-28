/** Short, humane HTTP error tones for dashboards (French + English). */
function looksInfrastructureNoise(msg) {
  const s = String(msg || "");
  return (
    s.length > 140 ||
    /\b(Render|Vercel|nginx|DATABASE_URL|JWT_SECRET|proxy|logs du backend)\b/i.test(s)
  );
}

/** Calm copy for dashboards (login, chat, banners). Respects short server validation messages. */
export function friendlyTransientError(raw, isEn) {
  const r0 = String(raw || "").trim();
  if (!r0) return isEn ? "Something went wrong." : "Une erreur s’est produite.";
  const r = r0.toLowerCase();

  if (!looksInfrastructureNoise(r0)) {
    return r0.length > 280 ? `${r0.slice(0, 277).trim()}…` : r0;
  }

  if (/\b503\b|\(503\)|503\)|offline| hors ligne/i.test(raw) || /indisponible|unavailable/i.test(r)) {
    return isEn
      ? "We couldn’t reach the service. Try again in a few seconds."
      : "Impossible de joindre le service pour l’instant. Réessayez dans quelques secondes.";
  }
  if (/\b502\b|\(502\)|bad gateway/i.test(raw) || /passerelle/i.test(r)) {
    return isEn
      ? "Connection glitch. Try again in a moment."
      : "Connexion momentanément instable. Réessayez tout à l’heure.";
  }
  if (/\b504\b|\(504\)|timeout/i.test(raw) || /délai dépassé/i.test(r)) {
    return isEn ? "That took too long. Try again." : "Temps dépassé. Réessayez.";
  }
  if (/failed to fetch|networkerror|réseau|impossible de joindre l'api/i.test(r)) {
    return isEn
      ? "Check your connection, then try again."
      : "Vérifiez votre connexion internet, puis réessayez.";
  }
  if (/\b500\b|\(500\)/i.test(raw) || /erreur serveur/i.test(r)) {
    return isEn
      ? "Something broke on our side. Try again later."
      : "Un souci technique de notre côté. Réessayez plus tard.";
  }

  const t = r0.length > 120 ? `${r0.slice(0, 117)}…` : r0;
  return t;
}

/** Fallback when API returns JSON without `message`. */
export function defaultHttpStatusMessage(status, isEn) {
  if (status === 503 || status === 502) {
    return isEn
      ? "The service isn’t responding. Try again in a moment."
      : "Le service ne répond pas pour l’instant. Réessayez dans un instant.";
  }
  if (status === 504) return isEn ? "Request timed out. Try again." : "Temps dépassé. Réessayez.";
  if (status === 500)
    return isEn ? "Server error — try again later." : "Erreur serveur — réessayez plus tard.";
  return isEn ? `Something went wrong (${status}).` : `Une erreur s’est produite (${status}).`;
}
