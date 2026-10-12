import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./db";
import { appUrl } from "./email";
import { hashToken } from "./tokens";

/**
 * Pace เป็น OAuth 2.1 authorization server ขนาดเล็กสำหรับเซิร์ฟเวอร์ MCP ของตัวเอง (/api/mcp)
 * ตามที่สเปก MCP กำหนด: ค้นหาปลายทางจาก .well-known · โปรแกรมลงทะเบียนตัวเองได้ (RFC 7591)
 * · authorization code + PKCE (S256) เท่านั้น · public client ไม่มี secret · refresh token หมุนทุกครั้งที่ใช้
 */
export const ACCESS_TOKEN_SECONDS = 60 * 60;
const CODE_SECONDS = 5 * 60;
export const SCOPE = "pace";

export const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
export const oauthJson = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS } });
export const oauthError = (error: string, description: string, status = 400) => oauthJson({ error, error_description: description }, status);

export const resourceUrl = () => appUrl("/api/mcp");
export const resourceMetadataUrl = () => appUrl("/.well-known/oauth-protected-resource");

export const resourceMetadata = () => ({
  resource: resourceUrl(),
  authorization_servers: [appUrl()],
  bearer_methods_supported: ["header"],
  scopes_supported: [SCOPE],
  resource_name: "Pace",
});

export const serverMetadata = () => ({
  issuer: appUrl(),
  authorization_endpoint: appUrl("/oauth/authorize"),
  token_endpoint: appUrl("/api/oauth/token"),
  registration_endpoint: appUrl("/api/oauth/register"),
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["none"],
  scopes_supported: [SCOPE],
});

/** ปลายทางที่รับรหัสกลับ: https เท่านั้น ยกเว้นโปรแกรมบนเครื่องผู้ใช้เอง (localhost) — ห้ามมี fragment */
export function validRedirectUri(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 500) return false;
  try {
    const url = new URL(value);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
    return !url.hash && (url.protocol === "https:" || (url.protocol === "http:" && local));
  } catch {
    return false;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const findClient = (id: unknown) => (typeof id === "string" && UUID.test(id) ? prisma.oAuthClient.findUnique({ where: { id } }) : Promise.resolve(null));

/** คำขออนุญาตจากโปรแกรม — ตรวจก่อนแสดงหน้ายินยอม และตรวจซ้ำตอนผู้ใช้กดอนุญาต */
export type AuthorizeParams = { client_id: string; redirect_uri: string; code_challenge: string; state: string };

export async function checkAuthorize(params: Record<string, unknown>) {
  const text = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : "");
  const client = await findClient(text("client_id"));
  // ไม่รู้จักโปรแกรมหรือปลายทางไม่ตรงที่ลงทะเบียน: ห้ามส่งผู้ใช้กลับไปที่นั่น — แสดงข้อผิดพลาดในหน้านี้แทน
  if (!client) return { ok: false as const, error: "ไม่รู้จักโปรแกรมที่ขอเชื่อมต่อ" };
  const redirectUri = text("redirect_uri");
  if (!client.redirectUris.includes(redirectUri)) return { ok: false as const, error: "ปลายทางที่โปรแกรมขอไม่ตรงกับที่ลงทะเบียนไว้" };
  // หลังจากนี้ปลายทางเชื่อถือได้: ข้อผิดพลาดส่งกลับไปให้โปรแกรม
  const back = (error: string) => ({ ok: false as const, redirect: redirectWith(redirectUri, { error, state: text("state") }) });
  if (text("response_type") !== "code") return back("unsupported_response_type");
  if (text("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(text("code_challenge"))) return back("invalid_request");
  return { ok: true as const, client, params: { client_id: client.id, redirect_uri: redirectUri, code_challenge: text("code_challenge"), state: text("state").slice(0, 500) } satisfies AuthorizeParams };
}

export function redirectWith(redirectUri: string, values: Record<string, string>) {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(values)) if (value) url.searchParams.set(key, value);
  return url.toString();
}

export async function createCode(userId: string, params: AuthorizeParams, readOnly: boolean) {
  const code = randomBytes(32).toString("base64url");
  // เก็บกวาดรหัสที่หมดอายุแล้วไปด้วย (ตารางนี้มีแต่ของอายุ 5 นาที)
  await prisma.oAuthCode.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await prisma.oAuthCode.create({
    data: { codeHash: hashToken(code), clientId: params.client_id, userId, redirectUri: params.redirect_uri, codeChallenge: params.code_challenge, readOnly, expiresAt: new Date(Date.now() + CODE_SECONDS * 1000) },
  });
  return code;
}

export const pkceMatches = (verifier: string, challenge: string) => createHash("sha256").update(verifier).digest("base64url") === challenge;

const fresh = () => {
  const access = `pace_${randomBytes(32).toString("base64url")}`;
  const refresh = `pace_r_${randomBytes(32).toString("base64url")}`;
  return { access, refresh, data: { tokenHash: hashToken(access), refreshHash: hashToken(refresh), expiresAt: new Date(Date.now() + ACCESS_TOKEN_SECONDS * 1000) } };
};
const tokenResponse = (t: { access: string; refresh: string }) => ({ access_token: t.access, token_type: "Bearer", expires_in: ACCESS_TOKEN_SECONDS, refresh_token: t.refresh, scope: SCOPE });

/** แลกรหัสอนุญาตเป็นโทเคน — รหัสใช้ได้ครั้งเดียว */
export async function exchangeCode(input: { code: string; clientId: string; redirectUri: string; verifier: string }) {
  const codeHash = hashToken(input.code);
  const row = await prisma.oAuthCode.findUnique({ where: { codeHash }, include: { client: { select: { name: true } } } });
  if (!row) return null;
  // ลบก่อนตรวจ: ใช้ซ้ำไม่ได้ไม่ว่าผลจะเป็นอย่างไร (ลบได้ 0 แถว = มีคำขออื่นใช้ไปแล้ว)
  const used = await prisma.oAuthCode.deleteMany({ where: { codeHash } });
  if (used.count !== 1 || row.expiresAt < new Date() || row.clientId !== input.clientId || row.redirectUri !== input.redirectUri || !pkceMatches(input.verifier, row.codeChallenge)) return null;
  const t = fresh();
  await prisma.apiToken.create({ data: { userId: row.userId, name: row.client.name, clientId: row.clientId, readOnly: row.readOnly, ...t.data } });
  return tokenResponse(t);
}

/** ต่ออายุ: refresh token เดิมใช้ไม่ได้อีก ได้คู่ใหม่ทั้งชุด */
export async function refreshTokens(input: { refreshToken: string; clientId: string }) {
  const t = fresh();
  const updated = await prisma.apiToken.updateMany({ where: { refreshHash: hashToken(input.refreshToken), clientId: input.clientId }, data: t.data });
  return updated.count === 1 ? tokenResponse(t) : null;
}
