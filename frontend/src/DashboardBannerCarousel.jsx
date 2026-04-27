import { useEffect, useMemo, useState } from "react";
import { publicAssetUrl } from "./api";

const ROTATE_MS = 6000;

export default function DashboardBannerCarousel({ slides, layout = "full" }) {
  const list = useMemo(
    () =>
      Array.isArray(slides)
        ? slides.filter((s) => {
            const u = s?.imageUrl != null ? String(s.imageUrl).trim() : "";
            return Boolean(u);
          })
        : [],
    [slides]
  );
  const urlKey = useMemo(() => list.map((s) => s.imageUrl).join("|"), [list]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [urlKey]);

  useEffect(() => {
    if (list.length <= 1) return undefined;
    const t = setInterval(() => {
      setIndex((i) => (i + 1) % list.length);
    }, ROTATE_MS);
    return () => clearInterval(t);
  }, [list.length]);

  if (list.length === 0) return null;

  const safeIndex = Math.min(index, list.length - 1);
  const s = list[safeIndex];
  const src = publicAssetUrl(s.imageUrl);
  const img = (
    <img
      className="dashboard-banner-carousel__img"
      src={src}
      alt={s.altText || ""}
      width={720}
      height={160}
      loading="lazy"
      decoding="async"
    />
  );

  return (
    <div
      className={`dashboard-banner-carousel${layout === "inline" ? " dashboard-banner-carousel--inline" : ""}`}
      role="region"
      aria-label="Annonces"
    >
      <div className="dashboard-banner-carousel__frame">
        {s.linkUrl ? (
          <a
            href={s.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="dashboard-banner-carousel__link"
          >
            {img}
          </a>
        ) : (
          img
        )}
      </div>
      {list.length > 1 ? (
        <div className="dashboard-banner-carousel__dots" role="tablist" aria-label="Bannières">
          {list.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === safeIndex}
              className={`dashboard-banner-carousel__dot${
                i === safeIndex ? " dashboard-banner-carousel__dot--active" : ""
              }`}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
