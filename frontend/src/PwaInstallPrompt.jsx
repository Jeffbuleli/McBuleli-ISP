import { useEffect, useState } from "react";

const DISMISS_KEY = "mcbuleli_pwa_install_dismissed";

/**
 * Installation PWA — uniquement lorsque `enabled` (ex. après connexion et choix d’espace).
 * `workspaceLabel` : nom de l’entreprise (affiché avec McBuleli).
 */
export default function PwaInstallPrompt({ enabled = false, workspaceLabel = "" }) {
  const [deferred, setDeferred] = useState(null);
  const [visible, setVisible] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    if (!import.meta.env.PROD || typeof window === "undefined") return;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    setIsStandalone(standalone);
  }, []);

  useEffect(() => {
    if (!import.meta.env.PROD || typeof window === "undefined") return;
    if (!enabled) {
      setDeferred(null);
      setVisible(false);
      return;
    }

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
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
  }, [enabled]);

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

  const label = workspaceLabel != null ? String(workspaceLabel).trim() : "";

  if (!import.meta.env.PROD || isStandalone || !enabled || !visible || !deferred) {
    return null;
  }

  return (
    <div className="pwa-install-bar" role="region" aria-label="Installation application">
      <div className="pwa-install-bar__inner">
        <p className="pwa-install-bar__text">
          {label ? (
            <>
              <strong>{label}</strong> — McBuleli — Installez l’application sur votre écran d’accueil (accès rapide, mode
              hors ligne partiel).
            </>
          ) : (
            <>
              <strong>McBuleli</strong> — Installez l’application sur votre écran d’accueil (accès rapide, mode hors ligne
              partiel).
            </>
          )}
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
