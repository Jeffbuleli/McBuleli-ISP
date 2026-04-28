import { useEffect, useState } from "react";

export const UI_LANG_SYNC_EVENT = "mcbuleli:ui_lang";

export function getStoredUiLang() {
  if (typeof window === "undefined") return "fr";
  return window.localStorage.getItem("ui_lang") === "en" ? "en" : "fr";
}

/** Language follows homepage choice only: read localStorage, sync on focus / other tabs / after homepage toggle. */
export function useReadOnlyUiLang() {
  const [uiLang, setUiLang] = useState(getStoredUiLang);
  useEffect(() => {
    const sync = () => setUiLang(getStoredUiLang());
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    window.addEventListener(UI_LANG_SYNC_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener(UI_LANG_SYNC_EVENT, sync);
    };
  }, []);
  return uiLang;
}
