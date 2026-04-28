/**
 * Direction — section premium (responsive desktop / tablette / mobile).
 */
export default function PublicCeoSection({
  t,
  isEn,
  imageUrl,
  remoteCaption,
  ceoNameFr,
  ceoNameEn,
  roleFr,
  roleEn,
  bioFr,
  bioEn
}) {
  const name = isEn ? ceoNameEn : ceoNameFr;
  const role = isEn ? roleEn : roleFr;
  const bio =
    typeof remoteCaption === "string" && remoteCaption.trim()
      ? remoteCaption.trim()
      : isEn
        ? bioEn
        : bioFr;
  const showPhoto = typeof imageUrl === "string" && imageUrl.trim();
  const initials = ceoNameFr
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <section className="public-section public-section--ceo" aria-labelledby="public-ceo-title">
      <div className="public-ceo-stack">
        <div className="public-ceo-text">
          <p className="eyebrow">{t("Leadership", "Leadership")}</p>
          <h2 id="public-ceo-title">{t("Une vision ambitieuse pour Internet en Afrique", "An ambitious vision for internet in Africa")}</h2>
          <p className="public-section-lead public-ceo-intro">
            {t(
              "La direction fixe une feuille de route claire : produit fiable, équipes mieux équipées, et expériences client dignes des meilleures plateformes SaaS mondiales.",
              "Leadership sets a clear roadmap: dependable product, better-equipped teams, and customer journeys that rival top global SaaS platforms."
            )}
          </p>
        </div>
        <div className="public-ceo-card">
          <div className="public-ceo-media">
            {showPhoto ? (
              <img
                className="public-ceo-photo"
                src={imageUrl.trim()}
                alt={`${name}, ${role}`}
                width={176}
                height={176}
                loading="lazy"
                decoding="async"
              />
            ) : (
              <div className="public-ceo-placeholder" aria-hidden="true">
                <span>{initials || "?"}</span>
              </div>
            )}
          </div>
          <div className="public-ceo-body">
            <p className="public-ceo-name">{name}</p>
            <p className="public-ceo-role">{role}</p>
            <p className="public-ceo-bio">{bio}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
