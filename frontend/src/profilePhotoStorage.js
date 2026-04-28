const PREFIX = "mcbuleli_staff_profile_photo_v1:";

function keyFor(userId) {
  return `${PREFIX}${userId || "anon"}`;
}

export function getStoredProfilePhotoDataUrl(userId) {
  if (typeof window === "undefined" || !userId) return "";
  try {
    return window.localStorage.getItem(keyFor(userId)) || "";
  } catch {
    return "";
  }
}

export function setStoredProfilePhotoDataUrl(userId, dataUrl) {
  if (typeof window === "undefined" || !userId) return;
  try {
    if (dataUrl) window.localStorage.setItem(keyFor(userId), dataUrl);
    else window.localStorage.removeItem(keyFor(userId));
  } catch {
    /* quota or privacy mode */
  }
}
