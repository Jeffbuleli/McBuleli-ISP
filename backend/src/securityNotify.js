import { sendPlatformMail } from "./platformMail.js";

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function publicOrigin() {
  const raw = String(
    process.env.PLATFORM_PUBLIC_BASE_URL ||
      process.env.PLATFORM_PUBLIC_APP_URL ||
      "https://isp.mcbuleli.org"
  ).trim();
  return raw.replace(/\/$/, "") || "https://isp.mcbuleli.org";
}

function wrapHtml(title, inner) {
  return `<!DOCTYPE html>
<html lang="fr">
<body style="margin:0;padding:24px 16px;background:#eaf6ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#fafaf8;border:1px solid #e5e5e0;border-radius:20px;">
    <tr><td style="padding:22px 24px;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#1f6b43;">McBuleli ISP</p>
      <h1 style="margin:0 0 14px;font-size:20px;color:#222222;">${title}</h1>
      ${inner}
      <p style="margin:18px 0 0;font-size:12px;color:#6b6b6b;">hi@mcbuleli.org · isp.mcbuleli.org</p>
    </td></tr>
  </table>
</body>
</html>`;
}

function fire(promise) {
  Promise.resolve(promise).catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[securityNotify]", err?.message || err);
  });
}

export function notifyPasswordResetLink({ to, resetUrl }) {
  const subject = "McBuleli ISP - reinitialisation du mot de passe";
  const text = `McBuleli ISP\n\nLien valable 1 heure:\n${resetUrl}\n\nSi vous n'avez pas demande cette reinitialisation, ignorez ce message.\n\nReset link (valid 1 hour):\n${resetUrl}`;
  const html = wrapHtml(
    "Reinitialiser le mot de passe",
    `<p style="margin:0 0 14px;color:#6b6b6b;line-height:1.55;">Lien valable 1 heure. Si vous n'etes pas a l'origine de cette demande, ignorez cet email.</p>
     <p style="text-align:center;margin:0;"><a href="${resetUrl}" style="display:inline-block;background:#1f6b43;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:12px;">Choisir un nouveau mot de passe</a></p>`
  );
  fire(sendPlatformMail({ to, subject, text, html }));
}

export function notifyPasswordChanged({ to }) {
  const loginUrl = `${publicOrigin()}/login`;
  const subject = "McBuleli ISP - mot de passe mis a jour";
  const text = `Votre mot de passe McBuleli ISP a ete change.\nSi ce n'etait pas vous, ouvrez ${loginUrl} puis Mot de passe oublie.\n\nYour McBuleli ISP password was changed. If this was not you, use Forgot password.`;
  const html = wrapHtml(
    "Mot de passe mis a jour",
    `<p style="margin:0 0 12px;color:#6b6b6b;line-height:1.55;">Votre mot de passe a bien ete enregistre. Si vous n'etes pas a l'origine de ce changement, utilisez <strong>Mot de passe oublie</strong> sur la page de connexion.</p>
     <p><a href="${loginUrl}" style="color:#1f6b43;font-weight:700;">${loginUrl}</a></p>`
  );
  fire(sendPlatformMail({ to, subject, text, html }));
}

export function notifyWorkspaceWelcome({ to, publicUrl, companyName }) {
  const loginUrl = `${String(publicUrl || publicOrigin()).replace(/\/$/, "")}/login`;
  const name = companyName || "votre espace";
  const subject = `McBuleli ISP - bienvenue (${name})`;
  const text = `Votre espace ${name} est pret.\nConnexion: ${loginUrl}\nSupport: hi@mcbuleli.org`;
  const html = wrapHtml(
    "Espace pret",
    `<p style="margin:0 0 12px;color:#6b6b6b;line-height:1.55;">L'espace <strong>${esc(name)}</strong> est disponible. Connectez-vous puis changez le mot de passe temporaire si demande.</p>
     <p style="text-align:center;"><a href="${loginUrl}" style="display:inline-block;background:#1f6b43;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:12px;">Ouvrir l'espace</a></p>`
  );
  fire(sendPlatformMail({ to, subject, text, html }));
}

export function notifyStaffInvite({ to, inviteLink, workspaceName }) {
  const subject = "McBuleli ISP - invitation equipe";
  const text = `Vous etes invite sur ${workspaceName || "un espace McBuleli ISP"}.\nLien (7 jours): ${inviteLink}`;
  const html = wrapHtml(
    "Invitation equipe",
    `<p style="margin:0 0 12px;color:#6b6b6b;line-height:1.55;">Invitation pour <strong>${esc(workspaceName || "McBuleli ISP")}</strong>. Lien valable 7 jours.</p>
     <p style="text-align:center;"><a href="${inviteLink}" style="display:inline-block;background:#1f6b43;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:12px;">Accepter l'invitation</a></p>`
  );
  fire(sendPlatformMail({ to, subject, text, html }));
}

export function notifyStaffAccountCreated({ to, loginUrl, workspaceName }) {
  const subject = "McBuleli ISP - compte equipe";
  const text = `Un compte equipe a ete cree pour vous (${workspaceName || "McBuleli ISP"}).\nConnexion: ${loginUrl}\nA la premiere connexion, changez le mot de passe.`;
  const html = wrapHtml(
    "Compte equipe",
    `<p style="margin:0 0 12px;color:#6b6b6b;line-height:1.55;">Un administrateur a cree votre acces <strong>${esc(workspaceName || "McBuleli ISP")}</strong>. Changez le mot de passe a la premiere connexion (le mot de passe temporaire vous a ete communique par votre equipe).</p>
     <p style="text-align:center;"><a href="${loginUrl}" style="display:inline-block;background:#1f6b43;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:12px;">Se connecter</a></p>`
  );
  fire(sendPlatformMail({ to, subject, text, html }));
}

export function notifyAdminPasswordReset({ to, loginUrl }) {
  const subject = "McBuleli ISP - mot de passe reinitialise par un admin";
  const text = `Un administrateur a reinitialise votre mot de passe. Connectez-vous avec le mot de passe temporaire communique, puis changez-le.\n${loginUrl}`;
  const html = wrapHtml(
    "Mot de passe reinitialise",
    `<p style="margin:0 0 12px;color:#6b6b6b;line-height:1.55;">Un administrateur a reinitialise votre mot de passe. Utilisez le mot de passe temporaire fourni par votre equipe, puis changez-le a la connexion.</p>
     <p><a href="${loginUrl}" style="color:#1f6b43;font-weight:700;">${loginUrl}</a></p>`
  );
  fire(sendPlatformMail({ to, subject, text, html }));
}

export { publicOrigin as platformNotifyOrigin };
