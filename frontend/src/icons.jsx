/** Small inline icons for dashboard shortcuts (Centipid-style clarity). */

const base = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true" };

export function IconSliders(props) {
  return (
    <svg {...base} {...props}>
      <path
        d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M9 7h6M15 15h6M3 17h6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconWallet(props) {
  return (
    <svg {...base} {...props}>
      <path
        d="M19 7V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1M19 12h-4a2 2 0 1 0 0 4h4V12Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="17" cy="14" r="1" fill="currentColor" />
    </svg>
  );
}

export function IconPeople(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2" />
      <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="17" cy="11" r="3" stroke="currentColor" strokeWidth="2" />
      <path d="M21 21v-1a3 3 0 0 0-2-2.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function IconAntenna(props) {
  return (
    <svg {...base} {...props}>
      <path d="M5 10a10 10 0 0 1 14 0M8 13a6 6 0 0 1 8 0M11 16a2 2 0 0 1 2 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="19" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function IconBuilding(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 21V8l8-4 8 4v13H4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M9 21v-4h6v4M9 13h2M13 13h2M9 17h2M13 17h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function IconUserCheck(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="11" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
      <path d="M4 21v-1a5 5 0 0 1 5-5h1M19 8l-3 3-2-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconPresentation(props) {
  return (
    <svg {...base} {...props}>
      <path d="M2 3h20v12H2V3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M7 21l5-6 5 6M12 15V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconReceipt(props) {
  return (
    <svg {...base} {...props}>
      <path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M9 8h6M9 12h6M9 16h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function IconZap(props) {
  return (
    <svg {...base} {...props}>
      <path
        d="M13 2 4 14h7l-2 8 9-12h-7l2-8Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Home / public site */
export function IconHome(props) {
  return (
    <svg {...base} {...props}>
      <path
        d="M4 10.5 12 3l8 7.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Logout / exit */
export function IconSignOut(props) {
  return (
    <svg {...base} {...props}>
      <path d="M10 17H5V7h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M14 12H22M18 8l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
