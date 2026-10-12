import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { appUrl } from "./email";

/**
 * เข้าสู่ระบบด้วย Google / Microsoft (OpenID Connect แบบ authorization code + PKCE)
 * เปิดใช้เมื่อใส่ client id/secret ของผู้ให้บริการนั้นใน environment — ไม่ใส่ = ปุ่มไม่ขึ้น
 * ปลายทางที่ต้องลงทะเบียนกับผู้ให้บริการ: <APP_URL>/api/auth/google/callback และ /api/auth/microsoft/callback
 */
export type ProviderId = "google" | "microsoft";
type Provider = {
  id: ProviderId;
  label: string;
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  /** true = ผู้ให้บริการยืนยันให้ว่าอีเมลเป็นของผู้ใช้จริง (ดู email_verified) จึงผูกกับบัญชี Pace ที่อีเมลตรงกันได้อัตโนมัติ */
  trustsEmail: boolean;
};

const tenant = () => process.env.MICROSOFT_TENANT || "common";

function all(): Provider[] {
  return [
    {
      id: "google",
      label: "Google",
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      userinfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
      trustsEmail: true,
    },
    {
      id: "microsoft",
      label: "Microsoft",
      clientId: process.env.MICROSOFT_CLIENT_ID ?? "",
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
      authorizeUrl: `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/authorize`,
      tokenUrl: `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`,
      userinfoUrl: "https://graph.microsoft.com/oidc/userinfo",
      // อีเมลจาก Microsoft ไม่ได้รับการยืนยันเสมอไป (ผู้ดูแล tenant ตั้งเป็นอะไรก็ได้) — ห้ามใช้ผูกบัญชีเดิมอัตโนมัติ
      trustsEmail: false,
    },
  ];
}

/** ผู้ให้บริการที่ตั้งค่าไว้ครบ (สำหรับแสดงปุ่ม) */
export const ssoProviders = () => all().filter((p) => p.clientId && p.clientSecret).map(({ id, label }) => ({ id, label }));
export const getProvider = (id: string) => all().find((p) => p.id === id && p.clientId && p.clientSecret);
export const callbackUrl = (id: ProviderId) => appUrl(`/api/auth/${id}/callback`);

export const SSO_COOKIE = "pace_sso";
const SSO_SECONDS = 600;
const key = () => new TextEncoder().encode(process.env.AUTH_SECRET ?? "");

/** สิ่งที่ต้องจำระหว่างที่ผู้ใช้ไปหน้าของผู้ให้บริการ — เซ็นไว้ใน cookie อายุ 10 นาที */
export type SsoState = { provider: ProviderId; state: string; verifier: string; next: string; /** มีค่า = กำลังผูกเข้ากับบัญชีที่ล็อกอินอยู่ */ linkUserId?: string };

export async function beginSso(provider: Provider, next: string, linkUserId?: string) {
  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const cookie = await new SignJWT({ provider: provider.id, state, verifier, next, ...(linkUserId ? { linkUserId } : {}) })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${SSO_SECONDS}s`)
    .sign(key());
  const url = new URL(provider.authorizeUrl);
  url.search = new URLSearchParams({
    client_id: provider.clientId,
    redirect_uri: callbackUrl(provider.id),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return { url: url.toString(), cookie, maxAge: SSO_SECONDS };
}

export async function readSsoState(cookie: string | undefined): Promise<SsoState | null> {
  if (!cookie) return null;
  try {
    const { payload } = await jwtVerify(cookie, key(), { algorithms: ["HS256"] });
    const { provider, state, verifier, next, linkUserId } = payload as Record<string, unknown>;
    if ((provider !== "google" && provider !== "microsoft") || typeof state !== "string" || typeof verifier !== "string" || typeof next !== "string") return null;
    return { provider, state, verifier, next, ...(typeof linkUserId === "string" ? { linkUserId } : {}) };
  } catch {
    return null;
  }
}

export type SsoProfile = { subject: string; email: string; emailVerified: boolean; name: string };

/** แลกรหัสเป็นโทเคนแล้วถามข้อมูลผู้ใช้จากผู้ให้บริการโดยตรง (ผ่าน TLS ถึงผู้ให้บริการ จึงไม่ต้องตรวจลายเซ็น id_token เอง) */
export async function fetchProfile(provider: Provider, code: string, verifier: string): Promise<SsoProfile | null> {
  const tokenResponse = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: callbackUrl(provider.id), client_id: provider.clientId, client_secret: provider.clientSecret, code_verifier: verifier }),
  });
  if (!tokenResponse.ok) {
    console.error(`sso ${provider.id}: token exchange failed`, tokenResponse.status);
    return null;
  }
  const { access_token: accessToken } = (await tokenResponse.json()) as { access_token?: string };
  if (!accessToken) return null;
  const infoResponse = await fetch(provider.userinfoUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!infoResponse.ok) {
    console.error(`sso ${provider.id}: userinfo failed`, infoResponse.status);
    return null;
  }
  const info = (await infoResponse.json()) as { sub?: unknown; email?: unknown; email_verified?: unknown; name?: unknown };
  if (typeof info.sub !== "string" || typeof info.email !== "string" || !info.email.includes("@")) return null;
  const email = info.email.trim().toLowerCase();
  return {
    subject: info.sub,
    email,
    emailVerified: provider.trustsEmail && info.email_verified === true,
    name: (typeof info.name === "string" && info.name.trim() ? info.name.trim() : email.split("@")[0]).slice(0, 80),
  };
}
