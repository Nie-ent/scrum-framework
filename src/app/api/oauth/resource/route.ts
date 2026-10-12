import { publicOrigin } from "@/lib/origin";
import { CORS, oauthJson, resourceMetadata } from "@/lib/oauth";

/** RFC 9728: บอกโปรแกรมว่าเซิร์ฟเวอร์ MCP นี้ใช้ authorization server ตัวไหน (เสิร์ฟที่ /.well-known/oauth-protected-resource) */
export const GET = async () => oauthJson(resourceMetadata(await publicOrigin()));
export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });
