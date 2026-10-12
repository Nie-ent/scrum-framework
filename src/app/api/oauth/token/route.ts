import { CORS, exchangeCode, oauthError, oauthJson, refreshTokens } from "@/lib/oauth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/** แลกรหัสอนุญาต (พร้อม PKCE) หรือ refresh token เป็นโทเคนใช้งาน — รับ application/x-www-form-urlencoded ตามมาตรฐาน */
export async function POST(request: Request) {
  if (!(await rateLimit(`oauth:token:${await clientIp()}`, 120, 600))) return oauthError("too_many_requests", "Try again later", 429);
  const form = await request.formData().catch(() => null);
  const text = (key: string) => {
    const value = form?.get(key);
    return typeof value === "string" ? value : "";
  };
  const clientId = text("client_id");
  if (text("grant_type") === "authorization_code") {
    const tokens = await exchangeCode({ code: text("code"), clientId, redirectUri: text("redirect_uri"), verifier: text("code_verifier") });
    return tokens ? oauthJson(tokens) : oauthError("invalid_grant", "The authorization code is invalid, expired or already used");
  }
  if (text("grant_type") === "refresh_token") {
    const tokens = await refreshTokens({ refreshToken: text("refresh_token"), clientId });
    return tokens ? oauthJson(tokens) : oauthError("invalid_grant", "The refresh token is invalid or was revoked");
  }
  return oauthError("unsupported_grant_type", "Use authorization_code or refresh_token");
}
export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });
