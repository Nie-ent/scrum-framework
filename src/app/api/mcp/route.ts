import { userFromApiToken } from "@/lib/auth";
import { publicOrigin } from "@/lib/origin";
import { TOOLS, ToolError } from "@/lib/mcp";
import { resourceMetadataUrl } from "@/lib/oauth";
import { rateLimit } from "@/lib/rate-limit";
import { hashToken } from "@/lib/tokens";

/**
 * เซิร์ฟเวอร์ MCP ของ Pace (Model Context Protocol, แบบ Streamable HTTP ไม่เก็บสถานะ)
 * ผู้ช่วย AI ส่ง JSON-RPC มาที่ POST /api/mcp พร้อม Authorization: Bearer <โทเคนส่วนตัวจากหน้าบัญชี>
 * แต่ละคำขอจบในตัว: ไม่มี session ไม่มี SSE — จึงทำงานบน serverless ได้ตรง ๆ
 */
const VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version, mcp-session-id", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Expose-Headers": "WWW-Authenticate" };
const INSTRUCTIONS =
  "Pace is a team work tracker: tasks with progress and due dates, daily check-ins, and linked notes, organised into spaces (teams and one personal space). " +
  "Call list_spaces first to get space ids. Everything is done as the token owner and limited to what they can do in the app. Dates are YYYY-MM-DD.";

type Message = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { ...(body === null ? {} : { "Content-Type": "application/json" }), "Cache-Control": "no-store", ...CORS, ...headers } });
const failure = (id: Message["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });
// ไม่มีช่องทางรับข้อความจากเซิร์ฟเวอร์ (SSE) — ตามสเปกให้ตอบ 405
export const GET = () => json(failure(null, -32000, "Use POST"), 405, { Allow: "POST, OPTIONS" });
export const DELETE = GET;

export async function POST(request: Request) {
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  const auth = token ? await userFromApiToken(hashToken(token)) : null;
  const origin = await publicOrigin();
  if (!auth) {
    return json(failure(null, -32001, "Missing, expired or invalid access token. Sign in through OAuth, or create a token in Pace: Account → Connect an AI assistant."), 401, { "WWW-Authenticate": `Bearer realm="Pace MCP", resource_metadata="${resourceMetadataUrl(origin)}"` });
  }
  if (!(await rateLimit(`mcp:${auth.user.id}`, 120, 60))) return json(failure(null, -32002, "Too many requests. Try again in a minute."), 429);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(failure(null, -32700, "Parse error"), 400);
  }
  const tools = TOOLS.filter((t) => !(auth.readOnly && t.write));

  const handle = async (message: Message): Promise<object | null> => {
    const { id, method, params } = message;
    // การแจ้ง (ไม่มี id) ไม่ต้องตอบ
    if (id === undefined || id === null) return null;
    switch (method) {
      case "initialize": {
        const wanted = typeof params?.protocolVersion === "string" ? params.protocolVersion : "";
        return {
          jsonrpc: "2.0",
          id,
          result: { protocolVersion: VERSIONS.includes(wanted) ? wanted : VERSIONS[0], capabilities: { tools: {} }, serverInfo: { name: "pace", title: "Pace", version: "1.0.0" }, instructions: INSTRUCTIONS },
        };
      }
      case "ping":
        return { jsonrpc: "2.0", id, result: {} };
      case "tools/list":
        return {
          jsonrpc: "2.0",
          id,
          result: { tools: tools.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: { title: t.title, readOnlyHint: !t.write, destructiveHint: false, openWorldHint: false } })) },
        };
      case "tools/call": {
        const tool = tools.find((t) => t.name === params?.name);
        if (!tool) return failure(id, -32602, `Unknown tool: ${String(params?.name)}`);
        const args = params?.arguments && typeof params.arguments === "object" ? (params.arguments as Record<string, unknown>) : {};
        try {
          const result = await tool.run(args, { user: auth.user, appUrl: origin });
          return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] } };
        } catch (e) {
          // ข้อผิดพลาดของเครื่องมือส่งกลับเป็นผลลัพธ์ (isError) ให้โมเดลอ่านแล้วแก้เองได้ — ข้อผิดพลาดของระบบไม่เปิดเผยรายละเอียด
          if (!(e instanceof ToolError)) console.error(e);
          return { jsonrpc: "2.0", id, result: { isError: true, content: [{ type: "text", text: e instanceof ToolError ? e.message : "Something went wrong in Pace. Try again." }] } };
        }
      }
      default:
        return failure(id, -32601, `Method not found: ${String(method)}`);
    }
  };

  if (Array.isArray(body)) {
    const replies = (await Promise.all(body.slice(0, 20).map((m) => handle(m as Message)))).filter(Boolean);
    return replies.length > 0 ? json(replies) : json(null, 202);
  }
  if (!body || typeof body !== "object") return json(failure(null, -32600, "Invalid request"), 400);
  const reply = await handle(body as Message);
  return reply ? json(reply) : json(null, 202);
}
