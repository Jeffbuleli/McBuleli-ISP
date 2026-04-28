import { useCallback, useEffect, useId, useRef, useState } from "react";
import { getStoredProfilePhotoDataUrl, setStoredProfilePhotoDataUrl } from "./profilePhotoStorage.js";

function initialsFromName(fullName) {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const MAX_PHOTO_BYTES = 450 * 1024;

export default function DashboardStaffProfileAvatar({ userId, fullName, t }) {
  const inputId = useId();
  const fileRef = useRef(null);
  const storageKey = userId || "session";
  const [dataUrl, setDataUrl] = useState(() => getStoredProfilePhotoDataUrl(storageKey));
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    function handleDoc(e) {
      const root = fileRef.current?.closest(".dashboard-mobile-profile");
      if (root && !root.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener("pointerdown", handleDoc, true);
    return () => document.removeEventListener("pointerdown", handleDoc, true);
  }, [menuOpen]);

  const applyFile = useCallback(
    (file) => {
      if (!file || !file.type.startsWith("image/")) return;
      if (file.size > MAX_PHOTO_BYTES) {
        window.alert(
          t("Image trop volumineuse (max. 450 Ko).", "Image too large (max 450 KB).")
        );
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const url = String(reader.result || "");
        setDataUrl(url);
        setStoredProfilePhotoDataUrl(storageKey, url);
      };
      reader.readAsDataURL(file);
    },
    [storageKey, t]
  );

  const clearPhoto = useCallback(() => {
    setDataUrl("");
    setStoredProfilePhotoDataUrl(storageKey, "");
    setMenuOpen(false);
  }, [storageKey]);

  return (
    <div className="dashboard-mobile-profile">
      <input
        ref={fileRef}
        type="file"
        id={inputId}
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="visually-hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          applyFile(f);
          e.target.value = "";
          setMenuOpen(false);
        }}
      />
      <button
        type="button"
        className={`dashboard-mobile-avatar dashboard-mobile-avatar--btn${dataUrl ? " dashboard-mobile-avatar--photo" : ""}`}
        title={fullName}
        aria-label={t("Photo de profil", "Profile photo")}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((v) => !v)}
      >
        {dataUrl ? (
          <img src={dataUrl} alt="" className="dashboard-mobile-avatar__img" />
        ) : (
          initialsFromName(fullName)
        )}
      </button>
      {menuOpen ? (
        <div className="dashboard-mobile-profile-popover" role="menu">
          <button
            type="button"
            className="dashboard-mobile-profile-popover__btn"
            role="menuitem"
            onClick={() => {
              fileRef.current?.click();
            }}
          >
            {t("Changer la photo…", "Change photo…")}
          </button>
          {dataUrl ? (
            <button
              type="button"
              className="dashboard-mobile-profile-popover__btn dashboard-mobile-profile-popover__btn--muted"
              role="menuitem"
              onClick={clearPhoto}
            >
              {t("Retirer la photo", "Remove photo")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
