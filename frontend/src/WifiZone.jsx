import { useEffect, useMemo, useState } from "react";
import { api, publicAssetUrl } from "./api.js";
import { mcbuleliLogoUrl } from "./brandAssets.js";
import { COMPANY_CONTACT } from "./companyContact.js";
import HomeShortcut from "./HomeShortcut.jsx";
import LangSwitch from "./LangSwitch.jsx";
import { DataTable } from "./ui/DataTable.jsx";
import { UI_LANG_SYNC_EVENT, getStoredUiLang } from "./uiLangSync.js";
import { setIndependentPublicPageTitle } from "./pageTitle.js";

function norm(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

export default function WifiZone() {
  const [uiLang, setUiLang] = useState(getStoredUiLang);
  const isEn = uiLang === "en";
  const t = (fr, en) => (isEn ? en : fr);
  const year = useMemo(() => new Date().getFullYear(), []);
  const [allRows, setAllRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("all");
  const [sortMode, setSortMode] = useState("name_asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("ui_lang", uiLang);
      window.dispatchEvent(new Event(UI_LANG_SYNC_EVENT));
    }
  }, [uiLang]);

  useEffect(() => {
    setIndependentPublicPageTitle();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api
      .getPublicWifiZones()
      .then((payload) => {
        if (cancelled) return;
        setAllRows(Array.isArray(payload?.items) ? payload.items : []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(String(err?.message || t("Impossible de charger les zones WiFi.", "Could not load WiFi zones.")));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isEn]);

  const regionOptions = useMemo(() => {
    const values = new Set();
    for (const row of allRows) {
      const loc = String(row?.location || "").trim();
      if (loc) values.add(loc);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [allRows]);

  const preparedRows = useMemo(() => {
    const q = norm(search);
    const filtered = allRows.filter((row) => {
      if (region !== "all" && String(row.location || "") !== region) return false;
      if (!q) return true;
      return [row.name, row.location, row.contactPhone].some((v) => norm(v).includes(q));
    });
    const sorted = [...filtered].sort((a, b) => {
      if (sortMode === "name_desc") return String(b.name || "").localeCompare(String(a.name || ""));
      if (sortMode === "location_asc") return String(a.location || "").localeCompare(String(b.location || ""));
      if (sortMode === "location_desc") return String(b.location || "").localeCompare(String(a.location || ""));
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
    return sorted;
  }, [allRows, region, search, sortMode]);

  const totalRows = preparedRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return preparedRows.slice(start, start + pageSize);
  }, [preparedRows, safePage, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [search, region, sortMode, pageSize]);

  const columns = useMemo(
    () => [
      {
        key: "name",
        header: t("FAI", "ISP"),
        cell: (row) => (
          <div className="wifi-zone-provider">
            <img
              className="wifi-zone-provider__logo"
              src={row.logoUrl ? publicAssetUrl(row.logoUrl) : mcbuleliLogoUrl}
              alt=""
              loading="lazy"
              decoding="async"
            />
            <span className="wifi-zone-provider__name">{row.name}</span>
          </div>
        )
      },
      {
        key: "location",
        header: t("Ville / Région", "City / Region"),
        cell: (row) => <span className="wifi-zone-location">{row.location || "—"}</span>
      },
      {
        key: "contactPhone",
        header: t("Contact", "Contact"),
        cell: (row) =>
          row.contactPhone ? (
            <a className="wifi-zone-phone" href={`tel:${String(row.contactPhone).replace(/\s+/g, "")}`}>
              {row.contactPhone}
            </a>
          ) : (
            "—"
          )
      },
      {
        key: "action",
        header: t("Accès", "Access"),
        cell: (row) => (
          <a className="btn-secondary wifi-zone-open-btn" href={row.guestWifiUrl}>
            {t("Ouvrir Wi‑Fi invité", "Open guest Wi‑Fi")}
          </a>
        )
      }
    ],
    [isEn]
  );

  return (
    <main className="public-site public-site--dark wifi-zone-page">
      <div className="public-sticky-bar-wrap">
        <div className="public-hero-top wifi-zone-topbar">
          <a className="public-brand" href="/">
            <img className="public-logo-img" src={mcbuleliLogoUrl} alt="" width={40} height={40} loading="eager" />
            <span>McBuleli</span>
          </a>
          <p className="wifi-zone-topbar__tagline">
            {t("Retrouvez le FAI proche de chez vous", "Find the ISP closest to you")}
          </p>
          <div className="wifi-zone-topbar__actions">
            <LangSwitch value={uiLang} onChange={setUiLang} idPrefix="wifi-zone" compact />
            <HomeShortcut title={t("Retour à l'accueil", "Back to homepage")} idPrefix="wifi-zone" className="app-home-shortcut" />
          </div>
        </div>
      </div>

      <section className="public-section wifi-zone-intro">
        <h1>{t("Zone WiFi", "WiFi Zone")}</h1>
        <p>
          {t(
            "Les entreprises inscrites sur McBuleli apparaissent ici tant que leur abonnement plateforme est actif ; un administrateur peut retirer l’affichage à tout moment. Sans renouvellement, l’annuaire et les achats Wi‑Fi invité publics sont suspendus jusqu’au rétablissement de l’abonnement.",
            "Workspaces on McBuleli are listed here while their platform subscription is active; an admin can hide the listing anytime. If the subscription lapses, public directory presence and guest Wi‑Fi purchases pause until billing is current again."
          )}
        </p>
      </section>

      <section className="public-section wifi-zone-table-wrap">
        <DataTable
          title={t("FAI enregistrés sur McBuleli", "ISPs registered on McBuleli")}
          description={t(
            "Filtrez par nom, téléphone ou localité, triez la liste, puis ouvrez le lien Wi‑Fi invité.",
            "Filter by name, phone or location, sort the list, then open the guest Wi-Fi link."
          )}
          rows={pageRows}
          columns={columns}
          loading={loading}
          error={error}
          emptyLabel={t("Aucun FAI trouvé avec ces critères.", "No ISP found with those filters.")}
          searchValue={search}
          onSearchValueChange={setSearch}
          filters={
            <div className="wifi-zone-filters">
              <label>
                <span>{t("Région", "Region")}</span>
                <select value={region} onChange={(e) => setRegion(e.target.value)}>
                  <option value="all">{t("Toutes", "All")}</option>
                  {regionOptions.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t("Tri", "Sort")}</span>
                <select value={sortMode} onChange={(e) => setSortMode(e.target.value)}>
                  <option value="name_asc">{t("Nom A → Z", "Name A → Z")}</option>
                  <option value="name_desc">{t("Nom Z → A", "Name Z → A")}</option>
                  <option value="location_asc">{t("Localité A → Z", "Location A → Z")}</option>
                  <option value="location_desc">{t("Localité Z → A", "Location Z → A")}</option>
                </select>
              </label>
            </div>
          }
          page={safePage}
          pageSize={pageSize}
          totalRows={totalRows}
          pageSizeOptions={[10, 20, 50]}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          t={t}
        />
      </section>

      <footer className="wifi-zone-footer">
        <p className="wifi-zone-footer__powered">
          <img src={mcbuleliLogoUrl} alt="" width={24} height={24} />
          <span>
            Powered by McBuleli | {t("Notre numéro de contact", "Our contact number")} : {COMPANY_CONTACT.phoneDisplay}
          </span>
        </p>
        <p className="wifi-zone-footer__legal-inner">
          <span className="wifi-zone-footer__meta">© {year} McBuleli</span>
          <span className="wifi-zone-footer__sep" aria-hidden="true">
            |
          </span>
          <a className="wifi-zone-footer__meta wifi-zone-footer__meta--link" href="/privacy">
            {t("Politique de confidentialité", "Privacy policy")}
          </a>
          <span className="wifi-zone-footer__sep" aria-hidden="true">
            |
          </span>
          <span className="wifi-zone-footer__meta wifi-zone-footer__meta--muted">
            RCCM&nbsp;: <span>{COMPANY_CONTACT.rccm}</span>
          </span>
        </p>
      </footer>
    </main>
  );
}
