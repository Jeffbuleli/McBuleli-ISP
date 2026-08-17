import { useEffect, useMemo, useState } from "react";
import { mcbuleliLogoUrl } from "./brandAssets.js";
import { IconCopy } from "./icons.jsx";
import "./docs.css";

const NAV = [
  { id: "overview", label: "Overview" },
  { id: "domains", label: "Domains" },
  { id: "stack", label: "Stack" },
  { id: "auth", label: "Auth" },
  { id: "tenants", label: "Tenants" },
  { id: "api", label: "API" },
  { id: "mikrotik", label: "MikroTik" },
  { id: "payments", label: "Payments" },
  { id: "google", label: "Google" },
  { id: "deploy", label: "Deploy" }
];

const NAV_IDS = NAV.map((item) => item.id);

function Code({ children }) {
  return <code className="docs-code">{children}</code>;
}

function codeText(children) {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(codeText).join("");
  if (children == null) return "";
  return String(children);
}

function IconCheck(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
      <path
        d="M5 12.5 9.5 17 19 7.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Pre({ children }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const text = codeText(children).replace(/\n$/, "");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="docs-pre-wrap">
      <button
        type="button"
        className={`docs-copy${copied ? " is-copied" : ""}`}
        onClick={copy}
        aria-label={copied ? "Copied" : "Copy code"}
        title={copied ? "Copied" : "Copy"}
      >
        {copied ? <IconCheck width={15} height={15} /> : <IconCopy width={15} height={15} />}
      </button>
      <pre className="docs-pre">
        <code>{children}</code>
      </pre>
    </div>
  );
}

/**
 * Developer documentation surface for docs.isp.mcbuleli.org
 */
export default function DocsSite() {
  const [active, setActive] = useState("overview");

  useEffect(() => {
    document.title = "McBuleli ISP · Docs";

    const goToHash = () => {
      const id = String(window.location.hash || "").replace(/^#/, "") || "overview";
      if (!NAV_IDS.includes(id)) return;
      setActive(id);
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    if (window.location.hash) goToHash();

    window.addEventListener("hashchange", goToHash);
    return () => window.removeEventListener("hashchange", goToHash);
  }, []);

  // Scroll spy: nav pill tracks the section in view while reading
  useEffect(() => {
    const sections = NAV_IDS.map((id) => document.getElementById(id)).filter(Boolean);
    if (!sections.length) return undefined;

    const visible = new Map();

    const pickActive = () => {
      let bestId = null;
      let bestTop = Number.POSITIVE_INFINITY;
      for (const [id, ratio] of visible) {
        if (ratio <= 0) continue;
        const el = document.getElementById(id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        // Prefer the section nearest the reading line under the sticky header
        const score = Math.abs(top - 110);
        if (score < bestTop) {
          bestTop = score;
          bestId = id;
        }
      }
      if (!bestId) return;
      setActive((prev) => (prev === bestId ? prev : bestId));
      if (window.location.hash !== `#${bestId}`) {
        history.replaceState(null, "", `#${bestId}`);
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          visible.set(entry.target.id, entry.intersectionRatio);
        }
        pickActive();
      },
      {
        root: null,
        // Sticky header ~76px; keep lower half less sensitive so the top section wins
        rootMargin: "-90px 0px -45% 0px",
        threshold: [0, 0.1, 0.25, 0.5, 0.75, 1]
      }
    );

    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const year = useMemo(() => new Date().getFullYear(), []);

  return (
    <div className="docs-shell">
      <header className="docs-top">
        <a className="docs-brand" href="#overview">
          <img src={mcbuleliLogoUrl} alt="" width={40} height={40} />
          <span>
            McBuleli ISP <em>Docs</em>
          </span>
        </a>
        <a className="docs-top-link" href="https://isp.mcbuleli.org" target="_blank" rel="noreferrer">
          Platform
        </a>
      </header>

      <div className="docs-layout">
        <nav className="docs-nav" aria-label="Documentation">
          {NAV.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={active === item.id ? "is-active" : undefined}
              onClick={() => setActive(item.id)}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <main className="docs-main">
          <section id="overview" className="docs-section">
            <p className="docs-kicker">Developer guide</p>
            <h1>Build on McBuleli ISP</h1>
            <p className="docs-lead">
              Multi-tenant ISP SaaS: partner workspaces on <Code>*.isp.mcbuleli.org</Code>, Mobile Money
              collections, hotspot / MikroTik link, and a customer portal.
            </p>
            <div className="docs-callout">
              <strong>Base URLs</strong>
              <ul>
                <li>
                  App: <Code>https://isp.mcbuleli.org</Code>
                </li>
                <li>
                  Docs: <Code>https://docs.isp.mcbuleli.org</Code>
                </li>
                <li>
                  API: <Code>https://isp.mcbuleli.org/api</Code> (same host as the SPA)
                </li>
              </ul>
            </div>
          </section>

          <section id="domains" className="docs-section">
            <p className="docs-kicker">Routing</p>
            <h2>Domains</h2>
            <table className="docs-table">
              <thead>
                <tr>
                  <th>Host</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <Code>isp.mcbuleli.org</Code>
                  </td>
                  <td>Platform marketing + operator dashboard</td>
                </tr>
                <tr>
                  <td>
                    <Code>{"{slug}.isp.mcbuleli.org"}</Code>
                  </td>
                  <td>Partner tenant workspace (branded)</td>
                </tr>
                <tr>
                  <td>
                    <Code>docs.isp.mcbuleli.org</Code>
                  </td>
                  <td>This documentation (reserved slug)</td>
                </tr>
              </tbody>
            </table>
            <p>
              Wildcard TLS covers <Code>*.isp.mcbuleli.org</Code>. DNS for tenants must be{" "}
              <Code>*.isp</Code> (not <Code>*isp</Code>), grey-cloud to origin for Let’s Encrypt.
            </p>
          </section>

          <section id="stack" className="docs-section">
            <p className="docs-kicker">Architecture</p>
            <h2>Stack</h2>
            <ul className="docs-list">
              <li>
                <strong>Frontend</strong> - React + Vite SPA (<Code>frontend/</Code>)
              </li>
              <li>
                <strong>Backend</strong> - Node / Express (<Code>backend/src</Code>)
              </li>
              <li>
                <strong>DB</strong> - Postgres (Docker on VPS)
              </li>
              <li>
                <strong>Edge</strong> - Nginx → static <Code>frontend/dist</Code> + proxy{" "}
                <Code>/api</Code> → <Code>:4000</Code>
              </li>
            </ul>
            <Pre>{`git clone https://github.com/Jeffbuleli/McBuleli-ISP.git
cd "McBuleli APP"
# backend: npm ci && npm run start
# frontend: npm ci && npm run dev`}</Pre>
          </section>

          <section id="auth" className="docs-section">
            <p className="docs-kicker">Security</p>
            <h2>Auth</h2>
            <p>
              JWT bearer after login. Store token client-side; send{" "}
              <Code>Authorization: Bearer &lt;token&gt;</Code>.
            </p>
            <Pre>{`POST /api/auth/login
{ "email": "ops@example.com", "password": "…" }

→ { "token": "…", "user": { "role": "isp_admin", … } }`}</Pre>
            <p>Useful roles: <Code>system_owner</Code>, <Code>company_manager</Code>, <Code>isp_admin</Code>, <Code>billing_agent</Code>, <Code>noc_operator</Code>, <Code>field_agent</Code>.</p>
            <p>
              MFA: TOTP (Google Authenticator), email codes, Passkeys (WebAuthn) under Security settings.
            </p>
          </section>

          <section id="tenants" className="docs-section">
            <p className="docs-kicker">Multi-tenant</p>
            <h2>Tenants</h2>
            <p>
              Slug <Code>a-z0-9-</Code> (3-30). Host header resolves the ISP:{" "}
              <Code>demo.isp.mcbuleli.org</Code> → tenant <Code>demo</Code>.
            </p>
            <Pre>{`GET /api/tenant/context
→ { "matched": true, "ispId": "…", "subdomain": "demo", "publicUrl": "https://demo.isp.mcbuleli.org" }`}</Pre>
            <p>
              Reserved labels include <Code>docs</Code>, <Code>api</Code>, <Code>www</Code>,{" "}
              <Code>portal</Code>, <Code>wifi</Code> - they cannot be partner slugs.
            </p>
          </section>

          <section id="api" className="docs-section">
            <p className="docs-kicker">HTTP</p>
            <h2>API conventions</h2>
            <ul className="docs-list">
              <li>
                Prefix: <Code>/api/…</Code>
              </li>
              <li>
                Tenant scope often via query/body <Code>ispId</Code> or membership of the JWT user
              </li>
              <li>
                Public endpoints: <Code>/api/public/…</Code> (rate-limited)
              </li>
              <li>
                Health: <Code>GET /health</Code> → <Code>{`{"status":"ok"}`}</Code>
              </li>
            </ul>
            <Pre>{`# Example: list ISPs (privileged)
GET /api/isps
Authorization: Bearer <token>`}</Pre>
          </section>

          <section id="mikrotik" className="docs-section">
            <p className="docs-kicker">Network</p>
            <h2>MikroTik link</h2>
            <ol className="docs-list docs-list--ol">
              <li>
                Dashboard → <strong>Réseau</strong> → Connecter un appareil → generate script
              </li>
              <li>Router must have Internet + DNS (<Code>/ping 8.8.8.8</Code>)</li>
              <li>
                Paste script in RouterOS Terminal (WebFig <strong>New Terminal</strong> or Winbox)
              </li>
              <li>
                Flow: <Code>POST /api/public/mikrotik/register</Code> → fetch{" "}
                <Code>bootstrap.rsc</Code> → hotspot <Code>login.html</Code> → captive portal
              </li>
            </ol>
            <p>
              REST node (public IP) remains optional under Advanced. Outbound script link does not
              require inbound port forwards.
            </p>
          </section>

          <section id="payments" className="docs-section">
            <p className="docs-kicker">Billing</p>
            <h2>Payments</h2>
            <p>
              Customer invoices and guest Wi-Fi Mobile Money: 5% platform fee on deposit (payer).
              Tenant wallet payout to Mobile Money: 5% on withdrawal (same as mcbuleli.org/wallet).
              Do not surface provider brand names in product UI.
            </p>
            <ul className="docs-list">
              <li>
                Portal initiate: <Code>POST /api/portal/mobile-money/initiate</Code>
              </li>
              <li>
                Unified webhook: <Code>POST /api/webhooks/pawapay</Code>
              </li>
              <li>Tenant wallet: Portefeuille → Retirer vers Mobile Money (TOTP required)</li>
            </ul>
          </section>

          <section id="google" className="docs-section">
            <p className="docs-kicker">Discovery</p>
            <h2>Google Search Console</h2>
            <p>
              Public index: <Code>https://isp.mcbuleli.org</Code> and{" "}
              <Code>https://docs.isp.mcbuleli.org</Code>. Tenant hosts{" "}
              <Code>{"{slug}.isp.mcbuleli.org"}</Code> send <Code>X-Robots-Tag: noindex</Code>.
            </p>
            <ol className="docs-list">
              <li>
                Open{" "}
                <a href="https://search.google.com/search-console" target="_blank" rel="noreferrer">
                  Google Search Console
                </a>
              </li>
              <li>
                Add property <Code>https://isp.mcbuleli.org</Code> (URL prefix). If you already
                verified the domain <Code>mcbuleli.org</Code>, this subdomain is included.
              </li>
              <li>
                Verify ownership: DNS TXT on <Code>isp.mcbuleli.org</Code>, or HTML tag (set{" "}
                <Code>VITE_GOOGLE_SITE_VERIFICATION</Code> in <Code>ops/vps/.env</Code> then
                redeploy).
              </li>
              <li>
                Sitemaps → add <Code>https://isp.mcbuleli.org/sitemap.xml</Code> then Request
                indexing for the homepage.
              </li>
            </ol>
            <p>
              Crawl files: <Code>/robots.txt</Code> and <Code>/sitemap.xml</Code>. Login, portal,
              Wi-Fi checkout and <Code>/api/</Code> are disallowed.
            </p>
          </section>

          <section id="deploy" className="docs-section">
            <p className="docs-kicker">Ops</p>
            <h2>Deploy (VPS)</h2>
            <Pre>{`# on origin
bash /opt/mcbuleli-isp/ops/vps/deploy.sh
# pulls main, builds frontend, recreates api container, health-checks`}</Pre>
            <p>
              Nginx config reference: <Code>ops/vps/nginx-mcbuleli-isp.conf</Code>. App +{" "}
              <Code>*.isp</Code> share one server block; <Code>docs</Code> is served by the same
              SPA and routed client-side.
            </p>
          </section>

          <footer className="docs-foot">
            © {year} McBuleli ·{" "}
            <a href="https://isp.mcbuleli.org" target="_blank" rel="noreferrer">
              isp.mcbuleli.org
            </a>
          </footer>
        </main>
      </div>
    </div>
  );
}
