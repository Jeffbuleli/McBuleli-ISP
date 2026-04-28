import { useEffect, useState } from "react";

const DISMISS_KEY = "mcbuleli_pwa_install_dismissed";

function isStandaloneDisplay() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    window.navigator.standalone === true
  );
}

function isLikelyIOS() {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/**
 * Production only. Encourages PWA install on first visits; detects likely-already-installed
 * (getInstalledRelatedApps); on iOS suggests “Add to Home Screen”.
 * `workspaceLabel` : company name from tenant or session (shown with McBuleli).
 */
export default function PwaInstallPrompt({ enabled = false, workspaceLabel = "", isEn = false }) {
  const [deferred, setDeferred] = useState(null);
  const [isStandalone, setIsStandalone] = useState(() =>
    typeof window !== "undefined" ? isStandaloneDisplay() : false
  );
  const [relatedInstalled, setRelatedInstalled] = useState(false);
  const [checkedRelated, setCheckedRelated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !import.meta.env.PROD) return undefined;
    const mq = window.matchMedia("(display-mode: standalone)");
    function onChange() {
      setIsStandalone(isStandaloneDisplay());
    }
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  useEffect(() => {
    if (!import.meta.env.PROD || typeof navigator === "undefined") {
      setCheckedRelated(true);
      return;
    }
    if (!("getInstalledRelatedApps" in navigator)) {
      setCheckedRelated(true);
      return;
    }
    let cancelled = false;
    navigator
      .getInstalledRelatedApps()
      .then((apps) => {
        if (!cancelled && apps.length > 0) setRelatedInstalled(true);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setCheckedRelated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!import.meta.env.PROD || typeof window === "undefined") return;
    if (!enabled) {
      setDeferred(null);
      return;
    }
    if (isStandaloneDisplay() || window.localStorage.getItem(DISMISS_KEY) === "1") {
      return;
    }
    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferred(e);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, [enabled]);

  async function onInstallClick() {
    if (!deferred) return;
    deferred.prompt();
    try {
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") {
        setDeferred(null);
      }
    } catch {
      /* ignore */
    }
  }

  function onDismiss() {
    window.localStorage.setItem(DISMISS_KEY, "1");
    setDeferred(null);
  }

  const label = workspaceLabel != null ? String(workspaceLabel).trim() : "";

  if (!import.meta.env.PROD || isStandalone || !enabled) {
    return null;
  }
  if (typeof window !== "undefined" && window.localStorage.getItem(DISMISS_KEY) === "1") {
    return null;
  }

  const showInstall = Boolean(deferred);
  const showOpenInstalled = relatedInstalled && !showInstall;
  const showIosHint = !showInstall && !showOpenInstalled && isLikelyIOS() && checkedRelated;

  if (!showInstall && !showOpenInstalled && !showIosHint) {
    return null;
  }

  let body;
  let primary;
  let secondary;

  if (showInstall) {
    body = label ? (
      isEn ? (
        <>
          Install <strong>{label}</strong> — McBuleli on your home screen for quick access and a more app-like
          experience.
        </>
      ) : (
        <>
          Installez <strong>{label}</strong> — McBuleli sur votre écran d’accueil (accès rapide, expérience
          proche de l’app).
        </>
      )
    ) : isEn ? (
      <>
        Install <strong>McBuleli</strong> on your home screen for quick access and a more app-like experience.
      </>
    ) : (
      <>
        Installez <strong>McBuleli</strong> sur votre écran d’accueil (accès rapide, expérience proche de l’app).
      </>
    );
    primary = (
      <button type="button" className="pwa-install-bar__btn pwa-install-bar__btn--primary" onClick={onInstallClick}>
        {isEn ? "Install" : "Installer"}
      </button>
    );
    secondary = (
      <button type="button" className="pwa-install-bar__btn" onClick={onDismiss}>
        {isEn ? "Not now" : "Plus tard"}
      </button>
    );
  } else if (showOpenInstalled) {
    body = isEn ? (
      <>
        {label ? (
          <>
            An installed app for <strong>{label}</strong> (McBuleli) may be on this device — open it from your home
            screen or app drawer. You can keep using this tab in the browser if you prefer.
          </>
        ) : (
          <>
            The <strong>McBuleli</strong> app may already be installed — open it from your home screen or app drawer.
            You can keep using this tab in the browser if you prefer.
          </>
        )}
      </>
    ) : (
      <>
        {label ? (
          <>
            Une application pour <strong>{label}</strong> (McBuleli) semble déjà installée : ouvrez-la depuis l’icône
            sur votre écran d’accueil ou le tiroir d’apps. Vous pouvez aussi continuer dans cet onglet.
          </>
        ) : (
          <>
            L’application <strong>McBuleli</strong> semble déjà installée : ouvrez-la depuis l’icône sur votre écran
            d’accueil ou le tiroir d’apps. Vous pouvez aussi continuer dans cet onglet.
          </>
        )}
      </>
    );
    primary = (
      <button type="button" className="pwa-install-bar__btn pwa-install-bar__btn--primary" onClick={onDismiss}>
        {isEn ? "OK" : "OK"}
      </button>
    );
    secondary = null;
  } else {
    body = isEn ? (
      <>
        {label ? (
          <>
            Add <strong>{label}</strong> — McBuleli to your home screen: tap <strong>Share</strong>, then{" "}
            <strong>Add to Home Screen</strong>.
          </>
        ) : (
          <>
            Add <strong>McBuleli</strong> to your home screen: tap <strong>Share</strong>, then{" "}
            <strong>Add to Home Screen</strong>.
          </>
        )}
      </>
    ) : (
      <>
        {label ? (
          <>
            Ajoutez <strong>{label}</strong> — McBuleli à l’écran d’accueil : touchez <strong>Partager</strong>, puis{" "}
            <strong>Sur l’écran d’accueil</strong>.
          </>
        ) : (
          <>
            Ajoutez <strong>McBuleli</strong> à l’écran d’accueil : touchez <strong>Partager</strong>, puis{" "}
            <strong>Sur l’écran d’accueil</strong>.
          </>
        )}
      </>
    );
    primary = (
      <button type="button" className="pwa-install-bar__btn pwa-install-bar__btn--primary" onClick={onDismiss}>
        {isEn ? "Got it" : "Compris"}
      </button>
    );
    secondary = (
      <button type="button" className="pwa-install-bar__btn" onClick={onDismiss}>
        {isEn ? "Dismiss" : "Masquer"}
      </button>
    );
  }

  return (
    <div className="pwa-install-bar" role="region" aria-label={isEn ? "Install web app" : "Installation application"}>
      <div className="pwa-install-bar__inner">
        <p className="pwa-install-bar__text">{body}</p>
        <div className="pwa-install-bar__actions">
          {primary}
          {secondary}
        </div>
      </div>
    </div>
  );
}
