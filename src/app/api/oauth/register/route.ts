import { prisma } from "@/lib/db";
import { CORS, oauthError, oauthJson, validRedirectUri } from "@/lib/oauth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/** RFC 7591: โปรแกรมลงทะเบียนตัวเองก่อนขออนุญาต — ได้ client_id (ไม่มี secret) ผู้ใช้ยังต้องกดอนุญาตเองทุกครั้ง */
export async function POST(request: Request) {
  if (!(await rateLimit(`oauth:register:${await clientIp()}`, 20, 3600))) return oauthError("too_many_requests", "Try again later", 429);
  const body = (await request.json().catch(() => null)) as { client_name?: unknown; redirect_uris?: unknown } | null;
  const uris = Array.isArray(body?.redirect_uris) ? body.redirect_uris : [];
  if (uris.length === 0 || uris.length > 10 || !uris.every(validRedirectUri)) {
    return oauthError("invalid_redirect_uri", "redirect_uris must be 1-10 https URLs (http only for localhost)");
  }
  const name = (typeof body?.client_name === "string" ? body.client_name.trim() : "").slice(0, 80) || "MCP client";
  const client = await prisma.oAuthClient.create({ data: { name, redirectUris: uris as string[] } });
  return oauthJson(
    {
      client_id: client.id,
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
      client_name: client.name,
      redirect_uris: client.redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    201,
  );
}
export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });
