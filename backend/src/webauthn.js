import crypto from "crypto";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} from "@simplewebauthn/server";

const challenges = new Map();

function platformOrigin() {
  const raw = String(
    process.env.PLATFORM_PUBLIC_BASE_URL || process.env.PLATFORM_PUBLIC_APP_URL || "https://isp.mcbuleli.org"
  ).trim();
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).origin;
  } catch {
    return "https://isp.mcbuleli.org";
  }
}

function platformRpId() {
  try {
    return new URL(platformOrigin()).hostname;
  } catch {
    return "isp.mcbuleli.org";
  }
}

/** Accept platform + tenant hosts (*.isp.mcbuleli.org) and local dev. */
function resolveExpectedOrigin(req) {
  const header = String(req?.headers?.origin || "").trim();
  if (!header) return platformOrigin();
  try {
    const u = new URL(header);
    const host = u.hostname.toLowerCase();
    const base = platformRpId().toLowerCase();
    if (host === base || host.endsWith(`.${base}`)) return u.origin;
    if (host === "localhost" || host === "127.0.0.1") return u.origin;
  } catch {
    /* ignore */
  }
  return platformOrigin();
}

function setChallenge(userId, purpose, value) {
  challenges.set(`${userId}:${purpose}`, { value, exp: Date.now() + 5 * 60_000 });
}

function takeChallenge(userId, purpose) {
  const key = `${userId}:${purpose}`;
  const row = challenges.get(key);
  challenges.delete(key);
  if (!row || row.exp < Date.now()) return null;
  return row.value;
}

function uint8ToBase64Url(buf) {
  return Buffer.from(buf).toString("base64url");
}

function base64UrlToUint8(s) {
  return new Uint8Array(Buffer.from(String(s), "base64url"));
}

async function buildRegistrationOptions({ userId, userName, userDisplayName, existingCredentialIds }) {
  const options = await generateRegistrationOptions({
    rpName: "McBuleli",
    rpID: platformRpId(),
    userID: new TextEncoder().encode(String(userId)),
    userName: String(userName || userId),
    userDisplayName: String(userDisplayName || userName || "McBuleli"),
    attestationType: "none",
    excludeCredentials: (existingCredentialIds || []).map((id) => ({
      id: typeof id === "string" ? id : uint8ToBase64Url(id),
      transports: ["internal", "hybrid", "usb", "nfc", "ble"]
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred"
    }
  });
  setChallenge(userId, "reg", options.challenge);
  return options;
}

async function verifyRegistration({ userId, response, expectedOrigin }) {
  const expectedChallenge = takeChallenge(userId, "reg");
  if (!expectedChallenge) return { ok: false, message: "Challenge expired. Try again." };
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: expectedOrigin || platformOrigin(),
    expectedRPID: platformRpId()
  });
  if (!verification.verified || !verification.registrationInfo) {
    return { ok: false, message: "Passkey registration failed." };
  }
  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  return {
    ok: true,
    credentialId: credential.id,
    publicKey: uint8ToBase64Url(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports || null,
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp
  };
}

async function buildAuthenticationOptions({ userId, allowCredentials }) {
  const options = await generateAuthenticationOptions({
    rpID: platformRpId(),
    allowCredentials: (allowCredentials || []).map((c) => ({
      id: c.credentialId,
      transports: c.transports || undefined
    })),
    userVerification: "preferred"
  });
  setChallenge(userId, "auth", options.challenge);
  return options;
}

async function verifyAuthentication({ userId, response, credential, expectedOrigin }) {
  const expectedChallenge = takeChallenge(userId, "auth");
  if (!expectedChallenge) return { ok: false, message: "Challenge expired. Try again." };
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: expectedOrigin || platformOrigin(),
    expectedRPID: platformRpId(),
    credential: {
      id: credential.credentialId,
      publicKey: base64UrlToUint8(credential.publicKey),
      counter: Number(credential.counter) || 0,
      transports: credential.transports || undefined
    }
  });
  if (!verification.verified) return { ok: false, message: "Passkey verification failed." };
  return {
    ok: true,
    newCounter: verification.authenticationInfo?.newCounter ?? credential.counter
  };
}


const loginChallenges = new Map();
const passkeyTickets = new Map();

function setLoginChallenge(challengeId, payload) {
  loginChallenges.set(challengeId, { ...payload, exp: Date.now() + 5 * 60_000 });
}

function takeLoginChallenge(challengeId) {
  const row = loginChallenges.get(challengeId);
  loginChallenges.delete(challengeId);
  if (!row || row.exp < Date.now()) return null;
  return row;
}

function mintPasskeyTicket(userId) {
  const id = crypto.randomUUID();
  passkeyTickets.set(id, { userId, exp: Date.now() + 5 * 60_000 });
  return id;
}

function takePasskeyTicket(ticketId) {
  const row = passkeyTickets.get(ticketId);
  passkeyTickets.delete(ticketId);
  if (!row || row.exp < Date.now()) return null;
  return row;
}

async function buildPasskeyLoginOptions({ allowCredentials } = {}) {
  const list =
    allowCredentials && allowCredentials.length
      ? allowCredentials.map((c) => ({
          id: c.credentialId,
          transports: c.transports || undefined
        }))
      : undefined;
  const options = await generateAuthenticationOptions({
    rpID: platformRpId(),
    allowCredentials: list,
    userVerification: "preferred"
  });
  const challengeId = crypto.randomUUID();
  setLoginChallenge(challengeId, { challenge: options.challenge });
  return { options, challengeId };
}

async function verifyPasskeyLogin({ challengeId, response, credential, expectedOrigin }) {
  const row = takeLoginChallenge(challengeId);
  if (!row?.challenge) return { ok: false, message: "Challenge expired. Try again." };
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: row.challenge,
    expectedOrigin: expectedOrigin || platformOrigin(),
    expectedRPID: platformRpId(),
    credential: {
      id: credential.credentialId,
      publicKey: base64UrlToUint8(credential.publicKey),
      counter: Number(credential.counter) || 0,
      transports: credential.transports || undefined
    }
  });
  if (!verification.verified) return { ok: false, message: "Passkey verification failed." };
  return {
    ok: true,
    newCounter: verification.authenticationInfo?.newCounter ?? credential.counter
  };
}

export {
  platformOrigin,
  platformRpId,
  resolveExpectedOrigin,
  buildRegistrationOptions,
  verifyRegistration,
  buildAuthenticationOptions,
  verifyAuthentication,
  buildPasskeyLoginOptions,
  verifyPasskeyLogin,
  mintPasskeyTicket,
  takePasskeyTicket
};

