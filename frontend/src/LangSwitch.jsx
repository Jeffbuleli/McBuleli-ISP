/**
 * Language toggle: French (tricolore) and English (Union Jack — not US flag).
 */
export function FlagFrance({ className = "", title }) {
  return (
    <svg
      className={className}
      viewBox="0 0 3 2"
      width="20"
      height="14"
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

export function FlagUnitedKingdom({ className = "", title }) {
  return (
    <svg
      className={className}
      viewBox="0 0 60 30"
      width="20"
      height="10"
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

export default function LangSwitch({ value, onChange, className = "", idPrefix = "lang" }) {
  const isFr = value === "fr";
  return (
    <div className={`lang-switch ${className}`.trim()} role="group" aria-label="Language">
      <button
        type="button"
        id={`${idPrefix}-fr`}
        className={`lang-switch-btn ${isFr ? "lang-switch-btn--active" : ""}`}
        onClick={() => onChange("fr")}
        disabled={isFr}
        aria-pressed={isFr}
        title="Français"
      >
        <FlagFrance title="Français" />
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
        <FlagUnitedKingdom title="English" />
        <span className="visually-hidden">English</span>
      </button>
    </div>
  );
}
