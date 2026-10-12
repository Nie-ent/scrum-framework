import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import type { CurrentUser } from "./auth";
import { dateToKey, isDateKey, keyToDate, todayKey } from "./dates";
import { noteKey } from "./note-links";
import { relinkMentions, syncLinks } from "./notes";
import { NoteFields, TaskFields, noteTitle } from "./schemas";
import { createTaskFor, setDueFor, setProgressFor } from "./task-ops";
import { toTasks } from "./tasks";
import { getWorkspaceTeams } from "./teams";
import { trFor } from "./i18n/server";

/**
 * เครื่องมือที่ Pace เปิดให้ผู้ช่วย AI ใช้ผ่าน MCP (Model Context Protocol) — ดู src/app/api/mcp/route.ts
 * ทุกเครื่องมือทำงานในนามเจ้าของโทเคน: เห็นและแก้ได้เท่าที่คนนั้นทำได้ในแอป ไม่มากกว่า
 * คำอธิบายเครื่องมือเป็นภาษาอังกฤษเพราะผู้อ่านคือโมเดล
 */
type Schema = { type: "object"; properties: Record<string, object>; required?: string[]; additionalProperties: false };
type Args = Record<string, unknown>;
type Context = { user: CurrentUser; appUrl: string };
type Tool = { name: string; title: string; description: string; inputSchema: Schema; write: boolean; run: (args: Args, ctx: Context) => Promise<unknown> };

/** ข้อผิดพลาดที่ควรบอกโมเดลตรง ๆ (ต่างจากข้อผิดพลาดของระบบ) */
export class ToolError extends Error {}

const SPACE = { type: "string", description: "Space (team or personal space) id or exact name, from list_spaces. Optional when the account has only one space." };
const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const object = (properties: Record<string, object>, required: string[] = []): Schema => ({ type: "object", properties, required, additionalProperties: false });

async function spaces(user: CurrentUser) {
  const { teams, manageableIds } = await getWorkspaceTeams(user);
  return teams.map((t) => ({ id: t.id, name: t.name, personal: Boolean(t.personalOfId), parentId: t.parentId, canManage: manageableIds.has(t.id) }));
}

async function pickSpace(user: CurrentUser, value: unknown) {
  const all = await spaces(user);
  const wanted = str(value);
  if (!wanted) {
    if (all.length === 1) return all[0];
    throw new ToolError(`Specify "space". Available: ${all.map((s) => `${s.name} (${s.id})`).join(", ")}`);
  }
  const found = all.find((s) => s.id === wanted) ?? all.find((s) => s.name.toLowerCase() === wanted.toLowerCase()) ?? (/^personal$/i.test(wanted) ? all.find((s) => s.personal) : undefined);
  if (!found) throw new ToolError(`No space "${wanted}". Available: ${all.map((s) => `${s.name} (${s.id})`).join(", ")}`);
  return found;
}

const taskView = (t: { number: number | null; title: string; description: string | null; progress: number; dueDate: Date | null; doneAt: Date | null; assignee: { name: string }; createdBy: { name: string } | null }, teamId: string, appUrl: string) => ({
  number: t.number,
  title: t.title,
  description: t.description,
  progress: t.progress,
  done: t.progress >= 100,
  due_date: t.dueDate ? dateToKey(t.dueDate) : null,
  overdue: Boolean(t.dueDate && t.progress < 100 && dateToKey(t.dueDate) < todayKey()),
  assignee: t.assignee.name,
  assigned_by: t.createdBy?.name ?? null,
  url: t.number === null ? `${appUrl}/tasks?team=${teamId}` : `${appUrl}/tasks?team=${teamId}&task=${t.number}`,
});
const withPeople = { assignee: { select: { id: true, name: true } }, createdBy: { select: { name: true } } } as const;

async function findTask(user: CurrentUser, args: Args) {
  const space = await pickSpace(user, args.space);
  const number = Number(args.number);
  if (!Number.isInteger(number)) throw new ToolError('"number" must be the task number, e.g. 12');
  const task = await prisma.task.findFirst({ where: { teamId: space.id, number, deletedAt: null }, include: withPeople });
  if (!task) throw new ToolError(`No task #${number} in ${space.name}`);
  return { space, task };
}

async function findNote(user: CurrentUser, id: unknown) {
  const note = await prisma.note.findUnique({ where: { id: str(id) } }).catch(() => null);
  const allowed = note && !note.deletedAt && (await spaces(user)).some((s) => s.id === note.teamId);
  if (!note || !allowed) throw new ToolError("Note not found");
  return note;
}

/** folder_id ที่ส่งมาต้องเป็นโฟลเดอร์ในพื้นที่นี้ — ไม่ส่งมาคือระดับบนสุด */
async function folderIn(teamId: string, value: unknown) {
  const parentId = str(value) || null;
  if (!parentId) return null;
  const parent = await prisma.note.findUnique({ where: { id: parentId } }).catch(() => null);
  if (!parent || parent.deletedAt || parent.teamId !== teamId || parent.kind !== "FOLDER") throw new ToolError("folder_id is not a folder in this space");
  return parentId;
}

async function titleTaken(teamId: string, parentId: string | null, title: string, exceptId?: string) {
  const siblings = await prisma.note.findMany({ where: { teamId, parentId, deletedAt: null, id: exceptId ? { not: exceptId } : undefined }, select: { title: true } });
  return siblings.some((s) => noteKey(s.title) === noteKey(title));
}

function fail(user: CurrentUser, error: string): never {
  throw new ToolError(trFor(user.locale)(error));
}

export const TOOLS: Tool[] = [
  {
    name: "list_spaces",
    title: "List spaces",
    description: "List the teams and the personal space this account can use. Call this first to learn the space ids used by the other tools.",
    inputSchema: object({}),
    write: false,
    run: async (_, { user }) => ({ user: { name: user.name, email: user.email }, today: todayKey(), spaces: await spaces(user) }),
  },
  {
    name: "list_tasks",
    title: "List tasks",
    description: "List tasks in a space. By default returns open tasks of everyone in the space, soonest due date first.",
    inputSchema: object({
      space: SPACE,
      status: { type: "string", enum: ["open", "done", "all"], description: "Default: open" },
      mine: { type: "boolean", description: "Only tasks assigned to the token owner" },
      overdue: { type: "boolean", description: "Only open tasks past their due date" },
      query: { type: "string", description: "Text to find in the title or details" },
    }),
    write: false,
    run: async (args, { user, appUrl }) => {
      const space = await pickSpace(user, args.space);
      const status = str(args.status) || "open";
      const query = str(args.query);
      const tasks = await prisma.task.findMany({
        where: {
          teamId: space.id,
          deletedAt: null,
          ...(status === "open" ? { progress: { lt: 100 } } : status === "done" ? { progress: { gte: 100 } } : {}),
          ...(args.mine === true ? { assigneeId: user.id } : {}),
          ...(args.overdue === true ? { progress: { lt: 100 }, dueDate: { lt: keyToDate(todayKey()) } } : {}),
          ...(query ? { OR: [{ title: { contains: query, mode: "insensitive" } }, { description: { contains: query, mode: "insensitive" } }] } : {}),
        },
        include: withPeople,
        orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
        take: 200,
      });
      return { space: space.name, count: tasks.length, tasks: tasks.map((t) => taskView(t, space.id, appUrl)) };
    },
  },
  {
    name: "get_task",
    title: "Get a task",
    description: "Get one task by its number, with its latest comments and progress history.",
    inputSchema: object({ space: SPACE, number: { type: "integer", description: "Task number, e.g. 12 for #12" } }, ["number"]),
    write: false,
    run: async (args, { user, appUrl }) => {
      const { space, task } = await findTask(user, args);
      const comments = await prisma.comment.findMany({ where: { taskId: task.id }, include: { author: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 20 });
      return {
        space: space.name,
        ...taskView(task, space.id, appUrl),
        comments: comments.reverse().map((c) => ({
          at: c.createdAt.toISOString(),
          by: c.author?.name ?? null,
          text: c.body,
          ...(c.progressTo === null ? {} : { progress_from: c.progressFrom, progress_to: c.progressTo }),
        })),
      };
    },
  },
  {
    name: "create_task",
    title: "Create a task",
    description: "Create a task in a space. It is assigned to the token owner unless assignee_email names another member (team leads only). The assignee is notified.",
    inputSchema: object(
      {
        space: SPACE,
        title: { type: "string", description: "Short task title (max 200 characters)" },
        description: { type: "string", description: "Optional details; may contain line breaks and links" },
        due_date: { type: "string", description: "Optional due date, YYYY-MM-DD" },
        assignee_email: { type: "string", description: "Email of the member to assign to. Default: the token owner" },
      },
      ["title"],
    ),
    write: true,
    run: async (args, { user, appUrl }) => {
      const space = await pickSpace(user, args.space);
      let assigneeId = user.id;
      const email = str(args.assignee_email).toLowerCase();
      if (email && email !== user.email.toLowerCase()) {
        const member = await prisma.teamMember.findFirst({ where: { teamId: space.id, user: { email } }, select: { userId: true } });
        if (!member) throw new ToolError(`${email} is not a member of ${space.name}`);
        assigneeId = member.userId;
      }
      const parsed = TaskFields.safeParse({ assigneeId, title: str(args.title), description: str(args.description), dueDate: str(args.due_date) });
      if (!parsed.success) fail(user, parsed.error.issues[0].message);
      const { title, description, dueDate } = parsed.data;
      const result = await createTaskFor(user, { teamId: space.id, assigneeId, title, description: description || null, dueDate: dueDate ? keyToDate(dueDate) : null });
      if (!result.ok) fail(user, result.error);
      return { created: true, number: result.task.number, url: `${appUrl}/tasks?team=${space.id}&task=${result.task.number}` };
    },
  },
  {
    name: "update_task",
    title: "Update a task",
    description: "Update a task's progress (0-100, 100 = done) and/or due date. A progress change is recorded in the task's history with the optional note, and the people involved are notified.",
    inputSchema: object(
      {
        space: SPACE,
        number: { type: "integer", description: "Task number" },
        progress: { type: "integer", minimum: 0, maximum: 100, description: "Percent complete" },
        note: { type: "string", description: "Why the progress changed (shown in the task history)" },
        due_date: { type: "string", description: 'New due date YYYY-MM-DD, or "" to remove it' },
      },
      ["number"],
    ),
    write: true,
    run: async (args, { user, appUrl }) => {
      const { space, task } = await findTask(user, args);
      if (args.progress === undefined && args.due_date === undefined) throw new ToolError("Give progress and/or due_date");
      if (args.due_date !== undefined) {
        const due = str(args.due_date);
        if (due && !isDateKey(due)) throw new ToolError("due_date must be YYYY-MM-DD");
        const result = await setDueFor(user, task.id, due);
        if (!result.ok) fail(user, result.error);
      }
      if (args.progress !== undefined) {
        const result = await setProgressFor(user, task.id, Math.round(Number(args.progress)), str(args.note).slice(0, 500));
        if (!result.ok) fail(user, result.error);
      }
      const fresh = await prisma.task.findUniqueOrThrow({ where: { id: task.id }, include: withPeople });
      return { updated: true, ...taskView(fresh, space.id, appUrl) };
    },
  },
  {
    name: "list_notes",
    title: "List or search notes",
    description: "List notes and folders in a space, or search note titles and text with query. Returns ids for read_note.",
    inputSchema: object({ space: SPACE, query: { type: "string", description: "Text to find in titles or content" } }),
    write: false,
    run: async (args, { user, appUrl }) => {
      const space = await pickSpace(user, args.space);
      const query = str(args.query);
      const rows = await prisma.note.findMany({
        where: {
          teamId: space.id,
          deletedAt: null,
          ...(query ? { kind: "NOTE", OR: [{ title: { contains: query, mode: "insensitive" } }, { content: { contains: query, mode: "insensitive" } }] } : {}),
        },
        select: { id: true, parentId: true, kind: true, title: true, updatedAt: true },
        orderBy: [{ kind: "asc" }, { title: "asc" }],
        take: 300,
      });
      return {
        space: space.name,
        count: rows.length,
        items: rows.map((n) => ({ id: n.id, type: n.kind === "FOLDER" ? "folder" : "note", title: n.title, folder_id: n.parentId, updated_at: n.updatedAt.toISOString(), url: `${appUrl}/notes/${n.id}` })),
      };
    },
  },
  {
    name: "read_note",
    title: "Read a note",
    description: "Read a note's full Markdown content. [[Title]] links to another note in the same space and #12 links to task 12.",
    inputSchema: object({ id: { type: "string", description: "Note id from list_notes" } }, ["id"]),
    write: false,
    run: async (args, { user, appUrl }) => {
      const note = await findNote(user, args.id);
      if (note.kind !== "NOTE") throw new ToolError("That id is a folder. Use list_notes to see what is inside.");
      return { id: note.id, title: note.title, content: note.content, folder_id: note.parentId, updated_at: note.updatedAt.toISOString(), url: `${appUrl}/notes/${note.id}` };
    },
  },
  {
    name: "create_note",
    title: "Create a note",
    description: "Create a note with Markdown content. Use [[Title]] to link to another note and #12 to link to a task.",
    inputSchema: object(
      {
        space: SPACE,
        title: { type: "string", description: "Note title (max 120 characters, no [ ] or |)" },
        content: { type: "string", description: "Markdown content" },
        folder_id: { type: "string", description: "Optional folder id from list_notes" },
      },
      ["title", "content"],
    ),
    write: true,
    run: async (args, { user, appUrl }) => {
      const space = await pickSpace(user, args.space);
      const parsed = NoteFields.safeParse({ title: str(args.title), content: typeof args.content === "string" ? args.content : "" });
      if (!parsed.success) fail(user, parsed.error.issues[0].message);
      const parentId = await folderIn(space.id, args.folder_id);
      const { title, content } = parsed.data;
      if (await titleTaken(space.id, parentId, title)) fail(user, "มีชื่อนี้อยู่แล้วในโฟลเดอร์นี้");
      const note = await prisma.note.create({ data: { teamId: space.id, parentId, kind: "NOTE", title, content, createdById: user.id, updatedById: user.id } });
      await syncLinks({ id: note.id, teamId: space.id, content });
      await relinkMentions(space.id, title);
      revalidatePath("/notes", "layout");
      revalidatePath("/tasks");
      return { created: true, id: note.id, url: `${appUrl}/notes/${note.id}` };
    },
  },
  {
    name: "create_folder",
    title: "Create a folder",
    description: "Create a folder for notes, optionally inside another folder. Returns the id to pass as folder_id.",
    inputSchema: object(
      {
        space: SPACE,
        title: { type: "string", description: "Folder name (max 120 characters, no [ ] or |)" },
        folder_id: { type: "string", description: "Optional parent folder id from list_notes" },
      },
      ["title"],
    ),
    write: true,
    run: async (args, { user, appUrl }) => {
      const space = await pickSpace(user, args.space);
      const parsed = noteTitle.safeParse(str(args.title));
      if (!parsed.success) fail(user, parsed.error.issues[0].message);
      const parentId = await folderIn(space.id, args.folder_id);
      if (await titleTaken(space.id, parentId, parsed.data)) fail(user, "มีชื่อนี้อยู่แล้วในโฟลเดอร์นี้");
      const folder = await prisma.note.create({ data: { teamId: space.id, parentId, kind: "FOLDER", title: parsed.data, createdById: user.id, updatedById: user.id } });
      revalidatePath("/notes", "layout");
      return { created: true, id: folder.id, url: `${appUrl}/notes/${folder.id}` };
    },
  },
  {
    name: "update_note",
    title: "Update a note",
    description: "Replace a note's content, or add text to the end with append. Read the note first when replacing so nothing is lost.",
    inputSchema: object(
      {
        id: { type: "string", description: "Note id" },
        content: { type: "string", description: "New full Markdown content (replaces everything)" },
        append: { type: "string", description: "Markdown to add at the end instead of replacing" },
      },
      ["id"],
    ),
    write: true,
    run: async (args, { user, appUrl }) => {
      const note = await findNote(user, args.id);
      if (note.kind !== "NOTE") throw new ToolError("That id is a folder");
      const hasContent = typeof args.content === "string";
      const hasAppend = typeof args.append === "string" && args.append !== "";
      if (hasContent === hasAppend) throw new ToolError("Give exactly one of content or append");
      const next = hasContent ? (args.content as string) : `${note.content.trimEnd()}${note.content.trim() ? "\n\n" : ""}${args.append as string}`;
      const parsed = NoteFields.safeParse({ title: note.title, content: next });
      if (!parsed.success) fail(user, parsed.error.issues[0].message);
      await prisma.note.update({ where: { id: note.id }, data: { content: parsed.data.content, updatedById: user.id } });
      await syncLinks({ id: note.id, teamId: note.teamId, content: parsed.data.content });
      revalidatePath("/notes", "layout");
      revalidatePath("/tasks");
      return { updated: true, id: note.id, url: `${appUrl}/notes/${note.id}` };
    },
  },
  {
    name: "get_checkins",
    title: "Get daily check-ins",
    description: "Read the daily check-ins of a space for one date: what each person did, plans to do, and where they need help. Members without a check-in that day are not listed.",
    inputSchema: object({ space: SPACE, date: { type: "string", description: "YYYY-MM-DD. Default: today" } }),
    write: false,
    run: async (args, { user }) => {
      const space = await pickSpace(user, args.space);
      const date = str(args.date) || todayKey();
      if (!isDateKey(date)) throw new ToolError("date must be YYYY-MM-DD");
      const rows = await prisma.standup.findMany({ where: { teamId: space.id, date: keyToDate(date) }, include: { user: { select: { name: true } } }, orderBy: { createdAt: "asc" } });
      const lines = (value: unknown) => toTasks(value).map((t) => ({ text: t.text, ...(t.progress === undefined ? {} : { progress: t.progress }) }));
      return {
        space: space.name,
        date,
        count: rows.length,
        checkins: rows.map((s) => ({ person: s.user.name, did: lines(s.yesterdayTasks), plans: lines(s.todayTasks), needs_help: s.blockers, not_working: s.notWorking, working_well: s.workingWell })),
      };
    },
  },
];
