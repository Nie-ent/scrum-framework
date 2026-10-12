import { CORS, oauthJson, serverMetadata } from "@/lib/oauth";

/** RFC 8414: ปลายทางของ authorization server (เสิร์ฟที่ /.well-known/oauth-authorization-server) */
export const GET = () => oauthJson(serverMetadata());
export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });
