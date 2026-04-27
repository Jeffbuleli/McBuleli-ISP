import { useMemo } from "react";
import { publicAssetUrl } from "./api.js";
import homePromo1 from "./assets/public-promos/home-promo-1.png";
import homePromo2 from "./assets/public-promos/home-promo-2.png";
import homePromo3 from "./assets/public-promos/home-promo-3.png";

const WHATSAPP_MC = "https://wa.me/mcbuleli";

const HOME_PROMO_ADS = [
  {
    key: "wifi-ultra",
    src: homePromo1,
    orientation: "square",
    altFr: "McBuleli — WiFi ultra rapide, vitesse et couverture à Kinshasa",
    altEn: "McBuleli — ultra-fast WiFi, speed and coverage in Kinshasa"
  },
  {
    key: "wifi-maison",
    src: homePromo2,
    orientation: "landscape",
    altFr: "McBuleli — réseau WiFi puissant pour la maison et l'entreprise",
    altEn: "McBuleli — powerful WiFi for home and business"
  },
  {
    key: "wifi-kinshasa",
    src: homePromo3,
    orientation: "landscape",
    altFr: "McBuleli — WiFi ultra rapide à Kinshasa",
    altEn: "McBuleli — ultra-fast WiFi in Kinshasa"
  }
];

/**
 * Encarts McBuleli / WhatsApp. Images importées par Vite (chemins hashés dans dist/assets/),
 * pour éviter que le fallback SPA ne renvoie index.html à la place des PNG dans public/.
 * `apiPromos` : trois entrées optionnelles depuis l’API (image par emplacement 0–2).
 */
export default function PublicHomePromos({ t, isEn, variant = "marketing", apiPromos }) {
  const dash = variant === "dashboard";
  const ads = useMemo(() => {
    const fromApi = Array.isArray(apiPromos) ? apiPromos : [];
    const bySlot = {};
    for (const p of fromApi) {
      if (p?.slotIndex != null) bySlot[p.slotIndex] = p;
    }
    return [0, 1, 2].map((idx) => {
      const remote = bySlot[idx];
      const fallback = HOME_PROMO_ADS[idx];
      const linkTrim =
        remote?.linkUrl != null && String(remote.linkUrl).trim() ? String(remote.linkUrl).trim() : "";
      const href = linkTrim || WHATSAPP_MC;
      if (remote?.imageUrl) {
        return {
          key: `api-${idx}`,
          src: publicAssetUrl(remote.imageUrl),
          href,
          orientation: remote.orientation === "square" ? "square" : "landscape",
          altFr: (remote.altTextFr != null && String(remote.altTextFr).trim()) || fallback.altFr,
          altEn: (remote.altTextEn != null && String(remote.altTextEn).trim()) || fallback.altEn
        };
      }
      return {
        key: fallback.key,
        src: fallback.src,
        href,
        orientation:
          remote?.orientation === "square" ? "square" : remote?.orientation === "landscape" ? "landscape" : fallback.orientation,
        altFr: (remote?.altTextFr != null && String(remote.altTextFr).trim()) || fallback.altFr,
        altEn: (remote?.altTextEn != null && String(remote.altTextEn).trim()) || fallback.altEn
      };
    });
  }, [apiPromos]);

  return (
    <section
      className={`public-section public-home-promos${dash ? " public-home-promos--dashboard" : ""}`}
      id={dash ? undefined : "promos"}
      aria-labelledby={dash ? undefined : "public-promos-title"}
    >
      <div className="public-home-promos-head">
        {!dash ? (
          <>
            <p className="eyebrow">
              {t("Fournisseurs & matériel réseau", "Network hardware partners")}
            </p>
            <h2 id="public-promos-title">
              {t(
                "Le meilleur du matériel pro — antennes, routeurs, accès internet",
                "Pro-grade gear that delivers — antennas, routers, connectivity"
              )}
            </h2>
            <p className="public-home-promos-lead">
              {t(
                "PUB — encarts réservés aux annonces de fournisseurs de matériel réseau. Sur mobile : un sous l’autre ; sur grand écran : trois visuels alignés. Clic = WhatsApp McBuleli.",
                "Ads — slots reserved for network hardware supplier promos. Stacked on mobile; three tiles on desktop. Tap/click opens WhatsApp with McBuleli."
              )}
            </p>
          </>
        ) : (
          <>
            <p className="eyebrow">{t("McBuleli", "McBuleli")}</p>
            <h2 className="public-home-promos-dashboard-title">
              {t(
                "Partenaires matériel réseau — pub & WhatsApp",
                "Network hardware partners — ads & WhatsApp"
              )}
            </h2>
          </>
        )}
      </div>
      <div className="public-home-promos-grid">
        {ads.map((ad) => (
          <a
            key={ad.key}
            className={`public-home-promo-card public-home-promo-card--${ad.orientation}`}
            href={ad.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
              src={ad.src}
              alt={isEn ? ad.altEn : ad.altFr}
              loading="lazy"
              decoding="async"
              sizes="(min-width: 960px) 33vw, 100vw"
            />
          </a>
        ))}
      </div>
    </section>
  );
}
