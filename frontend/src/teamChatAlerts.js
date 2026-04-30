/**
 * Alertes « discussion équipe » sur PWA / navigateur : badge appli, vibration, son bref, notification si autorisée.
 */

const LS_SOUND = "mcb_team_chat_ping_enabled";

export function isTeamChatPingSoundEnabled() {
  if (typeof window === "undefined") return true;
  const v = window.localStorage.getItem(LS_SOUND);
  return v !== "0";
}

export function setTeamChatPingSoundEnabled(on) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LS_SOUND, on ? "1" : "0");
}

function playSoftPing() {
  if (!isTeamChatPingSoundEnabled()) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.setValueAtTime(920, ctx.currentTime);
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.07, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    o.start(ctx.currentTime);
    o.stop(ctx.currentTime + 0.2);
    o.onended = () => {
      try {
        ctx.close();
      } catch {
        /* ignore */
      }
    };
  } catch {
    /* autoplay / context */
  }
}

function shortVibrate() {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate([80, 40, 80]);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Met à jour le badge sur l’icône PWA (Chrome, Edge, Safari iOS 16.4+ installé).
 */
export function setPwaTeamChatBadge(count) {
  if (typeof navigator === "undefined") return;
  const n = Number(count) || 0;
  const set = navigator.setAppBadge?.bind(navigator);
  const clear = navigator.clearAppBadge?.bind(navigator);
  if (!set && !clear) return;
  if (n <= 0) {
    clear?.().catch(() => {});
    return;
  }
  const capped = n > 99 ? 99 : n;
  set?.(capped).catch(() => {});
}

export function clearPwaTeamChatBadge() {
  if (typeof navigator === "undefined" || !navigator.clearAppBadge) return;
  navigator.clearAppBadge().catch(() => {});
}

/**
 * Notification système (uniquement si permission accordée).
 */
function notifyTeamChatUnread(count, { title, body }) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const n = Number(count) || 0;
  if (n <= 0) return;
  try {
    new Notification(title, {
      body,
      tag: "mcb-team-chat-unread",
      renotify: true,
      silent: true
    });
  } catch {
    /* ignore */
  }
}

/**
 * À appeler quand la valeur « non lu » serveur change.
 *
 * @param {object} opts
 * @param {number} opts.nextCount
 * @param {import("react").MutableRefObject<number|null>} opts.prevUnreadRef — `null` = pas d’alerte sur la toute première mesure
 * @param {boolean} opts.teamChatPanelOpen
 * @param {{ title: string; body: string }} opts.notificationStrings
 */
export function onTeamChatUnreadTick({ nextCount, prevUnreadRef, teamChatPanelOpen, notificationStrings }) {
  const next = typeof nextCount === "number" && Number.isFinite(nextCount) ? Math.max(0, nextCount) : 0;
  const prev = prevUnreadRef.current;

  setPwaTeamChatBadge(next);
  prevUnreadRef.current = next;

  if (prev === null || prev === undefined) return;
  if (next <= prev) return;

  const userLikelyWatching = document.visibilityState === "visible" && teamChatPanelOpen;
  if (userLikelyWatching) return;

  shortVibrate();
  playSoftPing();
  notifyTeamChatUnread(next, notificationStrings);
}
