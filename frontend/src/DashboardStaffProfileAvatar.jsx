import { useCallback, useEffect, useId, useRef, useState } from "react";
import { api, publicAssetUrl } from "./api.js";
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

export default function DashboardStaffProfileAvatar({
  userId,
  fullName,
  chatAvatarUrl,
  t,
  onChatProfileSaved
}) {
  const inputId = useId();
  const fileRef = useRef(null);
  const storageKey = userId || "session";
  const remoteSrc = chatAvatarUrl ? publicAssetUrl(chatAvatarUrl) : "";
  const [localDataUrl, setLocalDataUrl] = useState(() => getStoredProfilePhotoDataUrl(storageKey));
  const [menuOpen, setMenuOpen] = useState(false);
  const [imgBroken, setImgBroken] = useState(false);

  const displaySrc = localDataUrl || remoteSrc;

  useEffect(() => {
    setImgBroken(false);
  }, [displaySrc]);

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
    async (file) => {
      if (!file || !file.type.startsWith("image/")) return;
      if (file.size > MAX_PHOTO_BYTES) {
        window.alert(t("Image trop volumineuse (max. 450 Ko).", "Image too large (max 450 KB)."));
        return;
      }
      try {
        const out = await api.uploadChatAvatar(file);
        onChatProfileSaved?.({
          chatUsername: out.chatUsername ?? undefined,
          chatAvatarUrl: out.chatAvatarUrl ?? null
        });
        const reader = new FileReader();
        reader.onload = () => {
          const url = String(reader.result || "");
          setLocalDataUrl(url);
          setStoredProfilePhotoDataUrl(storageKey, url);
        };
        reader.readAsDataURL(file);
      } catch (err) {
        window.alert(
          t(
            "Impossible d’enregistrer la photo sur le serveur (chat). Réessayez.",
            "Could not save the photo on the server for team chat. Try again."
          ) + (err?.message ? ` ${err.message}` : "")
        );
      }
    },
    [onChatProfileSaved, storageKey, t]
  );

  const clearPhoto = useCallback(async () => {
    try {
      await api.deleteChatAvatar();
      onChatProfileSaved?.({ chatAvatarUrl: null });
    } catch (err) {
      window.alert(
        t("Impossible de retirer la photo du serveur.", "Could not remove the photo on the server.") +
          (err?.message ? ` ${err.message}` : "")
      );
      return;
    }
    setLocalDataUrl("");
    setStoredProfilePhotoDataUrl(storageKey, "");
    setMenuOpen(false);
  }, [onChatProfileSaved, storageKey, t]);

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
          void applyFile(f);
          e.target.value = "";
          setMenuOpen(false);
        }}
      />
      <button
        type="button"
        className={`dashboard-mobile-avatar dashboard-mobile-avatar--btn${displaySrc ? " dashboard-mobile-avatar--photo" : ""}`}
        title={fullName}
        aria-label={t("Photo de profil", "Profile photo")}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((v) => !v)}
      >
        {displaySrc && !imgBroken ? (
          <img src={displaySrc} alt="" className="dashboard-mobile-avatar__img" onError={() => setImgBroken(true)} />
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
          {displaySrc ? (
            <button
              type="button"
              className="dashboard-mobile-profile-popover__btn dashboard-mobile-profile-popover__btn--muted"
              role="menuitem"
              onClick={() => void clearPhoto()}
            >
              {t("Retirer la photo", "Remove photo")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
