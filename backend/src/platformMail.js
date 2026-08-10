/**
 * Platform transactional email: Resend API if RESEND_API_KEY set, else PLATFORM_SMTP_*.
 */
export async function sendPlatformMail({ to, subject, text, html }) {
  const toEmail = String(to || "").trim();
  if (!toEmail || !toEmail.includes("@")) {
    return { ok: false, error: "invalid recipient" };
  }
  const subj = String(subject || "McBuleli").slice(0, 200);
  const bodyText = String(text || "").slice(0, 50000);
  const bodyHtml = html != null ? String(html).slice(0, 100000) : null;

  const resendKey = String(process.env.RESEND_API_KEY || "").trim();
  const fromResend = String(process.env.RESEND_FROM || process.env.PLATFORM_SMTP_FROM || "").trim();
  if (resendKey && fromResend) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: fromResend,
          to: [toEmail],
          subject: subj,
          text: bodyText,
          ...(bodyHtml ? { html: bodyHtml } : {})
        })
      });
      if (!r.ok) {
        const errText = await r.text().catch(() => "");
        return { ok: false, error: `resend ${r.status}: ${errText.slice(0, 200)}` };
      }
      return { ok: true, provider: "resend" };
    } catch (err) {
      return { ok: false, error: err?.message || "resend failed" };
    }
  }

  const host = String(process.env.PLATFORM_SMTP_HOST || "").trim();
  const from = String(process.env.PLATFORM_SMTP_FROM || "").trim();
  if (!host || !from) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.info("[mail]", subj, "→", toEmail, bodyText.slice(0, 200));
    }
    return { ok: false, skipped: true };
  }

  let nodemailer;
  try {
    nodemailer = await import("nodemailer");
  } catch (_e) {
    return { ok: false, error: "nodemailer unavailable" };
  }
  const transport = nodemailer.createTransport({
    host,
    port: Number(process.env.PLATFORM_SMTP_PORT) || 587,
    secure: String(process.env.PLATFORM_SMTP_SECURE || "").toLowerCase() === "true",
    auth:
      process.env.PLATFORM_SMTP_USER && process.env.PLATFORM_SMTP_PASS
        ? {
            user: String(process.env.PLATFORM_SMTP_USER).trim(),
            pass: String(process.env.PLATFORM_SMTP_PASS).trim()
          }
        : undefined
  });
  await transport.sendMail({
    from,
    to: toEmail,
    subject: subj,
    text: bodyText,
    ...(bodyHtml ? { html: bodyHtml } : {})
  });
  return { ok: true, provider: "smtp" };
}
