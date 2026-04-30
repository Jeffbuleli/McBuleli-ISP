import { useEffect, useMemo, useState } from "react";
import DashboardBannerCarousel from "./DashboardBannerCarousel.jsx";

function readDismissed() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem("mb_banner_dismissed") === "1";
}

export default function DashboardStickyBanner({
  t,
  slides,
  html,
  fallback,
  dismissible = true,
  variant = "default"
}) {
  const hasContent = Boolean((Array.isArray(slides) && slides.length) || (html && String(html).trim()) || fallback);
  const [dismissed, setDismissed] = useState(() => readDismissed());

  useEffect(() => {
    setDismissed(readDismissed());
  }, [hasContent]);

  const content = useMemo(() => {
    if (Array.isArray(slides) && slides.length) return <DashboardBannerCarousel slides={slides} layout="inline" />;
    if (html && String(html).trim())
      return <div className="mb-sticky-banner__html" dangerouslySetInnerHTML={{ __html: html }} />;
    return fallback || null;
  }, [slides, html, fallback]);

  if (!hasContent || dismissed) return null;

  return (
    <section
      className={`mb-sticky-banner${variant === "compact" ? " mb-sticky-banner--compact" : ""}`}
      aria-label={t("Annonce", "Announcement")}
    >
      <div className="mb-sticky-banner__inner">{content}</div>
      {dismissible ? (
        <button
          type="button"
          className="mb-sticky-banner__dismiss"
          onClick={() => {
            try {
              window.localStorage.setItem("mb_banner_dismissed", "1");
            } catch (e) {
              // ignore
            }
            setDismissed(true);
          }}
          aria-label={t("Masquer l’annonce", "Dismiss announcement")}
          title={t("Masquer", "Dismiss")}
        >
          ×
        </button>
      ) : null}
    </section>
  );
}

