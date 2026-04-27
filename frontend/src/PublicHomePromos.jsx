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
 */
export default function PublicHomePromos({ t, isEn, variant = "marketing" }) {
  const dash = variant === "dashboard";
  return (
    <section
      className={`public-section public-home-promos${dash ? " public-home-promos--dashboard" : ""}`}
      id={dash ? undefined : "promos"}
      aria-labelledby={dash ? undefined : "public-promos-title"}
    >
      <div className="public-home-promos-head">
        {!dash ? (
          <>
            <p className="eyebrow">{t("Internet à Kinshasa", "Internet in Kinshasa")}</p>
            <h2 id="public-promos-title">
              {t(
                "Équipements et connexion — contactez McBuleli sur WhatsApp",
                "Equipment and connectivity — reach McBuleli on WhatsApp"
              )}
            </h2>
            <p className="public-home-promos-lead">
              {t(
                "Trois visuels : sur téléphone ils s’affichent les uns sous les autres ; sur ordinateur, côte à côte. Cliquez pour ouvrir WhatsApp.",
                "Three promos: stacked on phones; side by side on desktop. Tap or click to open WhatsApp."
              )}
            </p>
          </>
        ) : (
          <>
            <p className="eyebrow">{t("McBuleli", "McBuleli")}</p>
            <h2 className="public-home-promos-dashboard-title">
              {t("Offres internet & équipements — WhatsApp", "Internet offers & equipment — WhatsApp")}
            </h2>
          </>
        )}
      </div>
      <div className="public-home-promos-grid">
        {HOME_PROMO_ADS.map((ad) => (
          <a
            key={ad.key}
            className={`public-home-promo-card public-home-promo-card--${ad.orientation}`}
            href={WHATSAPP_MC}
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
