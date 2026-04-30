/**
 * Language toggle: French (tricolore) and English (Union Jack — not US flag).
 */
export function FlagFrance({ className = "", title, width = 20, height = 14 }) {
  return (
    <svg
      className={className}
      viewBox="0 0 3 2"
      width={width}
      height={height}
      aria-hidden={title ? undefined : "true"}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <rect width="1" height="2" fill="#002395" />
      <rect x="1" width="1" height="2" fill="#fff" />
      <rect x="2" width="1" height="2" fill="#ED2939" />
    </svg>
  );
}

export function FlagUnitedKingdom({ className = "", title, width = 20, height = 10 }) {
  return (
    <svg
      className={className}
      viewBox="0 0 60 30"
      width={width}
      height={height}
      aria-hidden={title ? undefined : "true"}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <rect width="60" height="30" fill="#012169" />
      <path d="M0 0 L60 30 M60 0 L0 30" stroke="#fff" strokeWidth="6" />
      <path d="M0 0 L60 30 M60 0 L0 30" stroke="#C8102E" strokeWidth="3.5" />
      <path d="M30 0 V30 M0 15 H60" stroke="#fff" strokeWidth="10" />
      <path d="M30 0 V30 M0 15 H60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  );
}

export default function LangSwitch({ value, onChange, className = "", idPrefix = "lang", compact = false }) {
  const isFr = value === "fr";
  const frW = compact ? 14 : 20;
  const frH = compact ? 10 : 14;
  const ukW = compact ? 16 : 20;
  const ukH = compact ? 8 : 10;
  return (
    <div
      className={`lang-switch${compact ? " lang-switch--compact" : ""} ${className}`.trim()}
      role="group"
      aria-label="Language"
    >
      <button
        type="button"
        id={`${idPrefix}-fr`}
        className={`lang-switch-btn ${isFr ? "lang-switch-btn--active" : ""}`}
        onClick={() => onChange("fr")}
        disabled={isFr}
        aria-pressed={isFr}
        title="Français"
      >
        <FlagFrance title="Français" width={frW} height={frH} />
        <span className="visually-hidden">Français</span>
      </button>
      <button
        type="button"
        id={`${idPrefix}-en`}
        className={`lang-switch-btn ${!isFr ? "lang-switch-btn--active" : ""}`}
        onClick={() => onChange("en")}
        disabled={!isFr}
        aria-pressed={!isFr}
        title="English (UK)"
      >
        <FlagUnitedKingdom title="English" width={ukW} height={ukH} />
        <span className="visually-hidden">English</span>
      </button>
    </div>
  );
}
