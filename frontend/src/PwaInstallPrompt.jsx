import { useEffect, useState } from "react";

const DISMISS_KEY = "mcbuleli_pwa_install_dismissed";

/**
 * Barre discrète « Installer l’application » (beforeinstallprompt).
 * Ne s’affiche pas si l’app est déjà en mode standalone ou si l’utilisateur a refusé.
 */
export default function PwaInstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [visible, setVisible] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    if (typeof window === "undefined") return;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    setIsStandalone(standalone);

    if (standalone || window.localStorage.getItem(DISMISS_KEY) === "1") {
      return;
    }

    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferred(e);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  async function onInstallClick() {
    if (!deferred) return;
    deferred.prompt();
    try {
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") {
        setVisible(false);
        setDeferred(null);
      }
    } catch {
      /* ignore */
    }
  }

  function onDismiss() {
    window.localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
    setDeferred(null);
  }

  if (!import.meta.env.PROD || isStandalone || !visible || !deferred) {
    return null;
  }

  return (
    <div className="pwa-install-bar" role="region" aria-label="Installation application">
      <div className="pwa-install-bar__inner">
        <p className="pwa-install-bar__text">
          <strong>McBuleli</strong> — Installez l’application sur votre écran d’accueil pour un accès rapide (mode hors
          ligne partiel).
        </p>
        <div className="pwa-install-bar__actions">
          <button type="button" className="pwa-install-bar__btn pwa-install-bar__btn--primary" onClick={onInstallClick}>
            Installer
          </button>
          <button type="button" className="pwa-install-bar__btn" onClick={onDismiss}>
            Plus tard
          </button>
        </div>
      </div>
    </div>
  );
}
