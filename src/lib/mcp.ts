import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import type { CurrentUser } from "./auth";
import { dateToKey, isDateKey, keyToDate, todayKey } from "./dates";
import { noteKey } from "./note-links";
import { relinkMentions, syncLinks, syncNoteMentions } from "./notes";
import { NoteFields, TaskFields, noteTitle } from "./schemas";
import { MAX_BATCH, createGroupTaskFor, createTaskFor, createTasksFor, editTaskFor, setDueFor, setProgressFor } from "./task-ops";
import { addBlockerFor, availableLabels, createLabelFor, removeBlockerFor, setLabelsFor, setParentFor } from "./task-structure";
import { addCommentFor, completeAssignmentFor, noteThreadsFor, resolveThreadFor } from "./comment-ops";
import { waitingOn } from "./inbox";
import { CONTEXT } from "./anchor";
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

type TaskShape = {
  number: number | null;
  title: string;
  description: string | null;
  progress: number;
  dueDate: Date | null;
  doneAt: Date | null;
  assignee: { name: string };
  createdBy: { name: string } | null;
  parent: { number: number | null } | null;
  labels: { label: { name: string } }[];
  blockedBy: { blockedBy: { number: number | null; progress: number; deletedAt: Date | null } }[];
};
const taskView = (t: TaskShape, teamId: string, appUrl: string) => ({
  number: t.number,
  title: t.title,
  description: t.description,
  progress: t.progress,
  done: t.progress >= 100,
  due_date: t.dueDate ? dateToKey(t.dueDate) : null,
  overdue: Boolean(t.dueDate && t.progress < 100 && dateToKey(t.dueDate) < todayKey()),
  assignee: t.assignee.name,
  assigned_by: t.createdBy?.name ?? null,
  parent_number: t.parent?.number ?? null,
  labels: t.labels.map((l) => l.label.name),
  // งานที่ต้องรอและยังไม่เสร็จ
  waiting_on: t.blockedBy.filter((b) => b.blockedBy.progress < 100 && !b.blockedBy.deletedAt).map((b) => b.blockedBy.number),
  url: t.number === null ? `${appUrl}/tasks?team=${teamId}` : `${appUrl}/tasks?team=${teamId}&task=${t.number}`,
});
const withPeople = {
  assignee: { select: { id: true, name: true } },
  createdBy: { select: { name: true } },
  parent: { select: { number: true } },
  labels: { select: { label: { select: { name: true } } } },
  blockedBy: { select: { blockedBy: { select: { number: true, progress: true, deletedAt: true } } } },
} as const;

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

type Space = Awaited<ReturnType<typeof pickSpace>>;

/** อีเมลสมาชิกในพื้นที่ → user id (ว่าง = เจ้าของโทเคน) */
async function memberByEmail(user: CurrentUser, space: Space, value: unknown) {
  const email = str(value).toLowerCase();
  if (!email || email === user.email.toLowerCase()) return user.id;
  const member = await prisma.teamMember.findFirst({ where: { teamId: space.id, user: { email } }, select: { userId: true } });
  if (!member) throw new ToolError(`${email} is not a member of ${space.name}. Call list_members to see who is.`);
  return member.userId;
}

/** แปลงข้อมูลงานจากโมเดลเป็นค่าที่บันทึกได้ (ตรวจด้วยกฎเดียวกับฟอร์มบนเว็บ) */
async function newTask(user: CurrentUser, space: Space, args: Args) {
  const assigneeId = await memberByEmail(user, space, args.assignee_email);
  const parsed = TaskFields.safeParse({ assigneeId, title: str(args.title), description: str(args.description), dueDate: str(args.due_date) });
  if (!parsed.success) fail(user, parsed.error.issues[0].message);
  const { title, description, dueDate } = parsed.data;
  const parentId = args.parent_number === undefined || args.parent_number === null ? null : await taskIdByNumber(space, args.parent_number, "parent_number");
  return { assigneeId, title, description: description || null, dueDate: dueDate ? keyToDate(dueDate) : null, parentId };
}

/** เลขงานในพื้นที่นี้ → id */
async function taskIdByNumber(space: Space, value: unknown, field: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new ToolError(`"${field}" must be a task number`);
  const task = await prisma.task.findFirst({ where: { teamId: space.id, number, deletedAt: null }, select: { id: true } });
  if (!task) throw new ToolError(`No task #${number} in ${space.name}`);
  return task.id;
}

/** ชื่อป้าย → id (ป้ายที่ยังไม่มีจะถูกสร้างในพื้นที่นี้) */
async function labelIds(user: CurrentUser, space: Space, value: unknown) {
  if (!Array.isArray(value)) throw new ToolError('"labels" must be a list of label names');
  const ids: string[] = [];
  for (const name of value.map(str).filter(Boolean).slice(0, 20)) {
    const result = await createLabelFor(user, space.id, name);
    if (!result.ok) fail(user, result.error);
    ids.push(result.label.id);
  }
  return ids;
}

const numbers = (value: unknown, field: string) => {
  if (!Array.isArray(value)) throw new ToolError(`"${field}" must be a list of task numbers`);
  return value;
};

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
    name: "list_members",
    title: "List members",
    description: "List the people in a space with their name, email, access (owner, lead or member) and role title. Use the email as assignee_email when creating or reassigning tasks.",
    inputSchema: object({ space: SPACE }),
    write: false,
    run: async (args, { user }) => {
      const space = await pickSpace(user, args.space);
      const rows = await prisma.teamMember.findMany({
        where: { teamId: space.id, user: { active: true } },
        select: { access: true, title: true, participates: true, user: { select: { name: true, email: true } } },
        orderBy: { user: { name: "asc" } },
      });
      return {
        space: space.name,
        count: rows.length,
        members: rows.map((m) => ({
          name: m.user.name,
          email: m.user.email,
          access: m.access.toLowerCase(),
          role: m.title,
          // ไม่ร่วมทำงาน (ดูแล/สังเกตการณ์) = รับงานไม่ได้
          can_be_assigned: m.participates,
          you: m.user.email.toLowerCase() === user.email.toLowerCase(),
        })),
      };
    },
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
      label: { type: "string", description: "Only tasks with this label name" },
      parent_number: { type: "integer", description: "Only the subtasks of this task" },
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
          ...(str(args.label) ? { labels: { some: { label: { name: { equals: str(args.label), mode: "insensitive" } } } } } : {}),
          ...(args.parent_number !== undefined ? { parentId: await taskIdByNumber(space, args.parent_number, "parent_number") } : {}),
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
      const [comments, subtasks, blocks, notes, refs] = await Promise.all([
        prisma.comment.findMany({ where: { taskId: task.id }, include: { author: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 30 }),
        prisma.task.findMany({ where: { parentId: task.id, deletedAt: null }, select: { number: true, title: true, progress: true }, orderBy: { number: "asc" } }),
        prisma.taskDependency.findMany({ where: { blockedById: task.id, task: { deletedAt: null } }, select: { task: { select: { number: true, title: true } } } }),
        prisma.noteLink.findMany({ where: { toTaskId: task.id, from: { deletedAt: null } }, select: { from: { select: { id: true, title: true } } } }),
        prisma.ref.findMany({ where: { toTaskId: task.id }, select: { fromTask: { select: { number: true, deletedAt: true } }, fromComment: { select: { task: { select: { number: true } }, note: { select: { id: true, title: true } } } } } }),
      ]);
      return {
        space: space.name,
        ...taskView(task, space.id, appUrl),
        subtasks: subtasks.map((t) => ({ number: t.number, title: t.title, progress: t.progress })),
        blocks: blocks.map((b) => ({ number: b.task.number, title: b.task.title })),
        referenced_in: [
          ...notes.map((n) => ({ note_id: n.from.id, note: n.from.title })),
          ...refs.flatMap((r): Record<string, unknown>[] =>
            r.fromTask && !r.fromTask.deletedAt ? [{ task_number: r.fromTask.number }] : r.fromComment?.task ? [{ comment_on_task: r.fromComment.task.number }] : r.fromComment?.note ? [{ comment_in_note: r.fromComment.note.title, note_id: r.fromComment.note.id }] : [],
          ),
        ],
        comments: comments.reverse().map((c) => ({
          id: c.id,
          ...(c.parentId ? { reply_to: c.parentId } : {}),
          at: c.createdAt.toISOString(),
          by: c.author?.name ?? null,
          text: c.body,
          ...(c.progressTo === null ? {} : { progress_from: c.progressFrom, progress_to: c.progressTo }),
          ...(c.dueChange ? { due_from: c.dueFrom ? dateToKey(c.dueFrom) : null, due_to: c.dueTo ? dateToKey(c.dueTo) : null } : {}),
        })),
      };
    },
  },
  {
    name: "create_task",
    title: "Create a task",
    description:
      "Create a task in a space. It is assigned to the token owner unless assignee_email names another member (team leads only). The assignee is notified. " +
      "To give the same task to several people, pass assignee_emails instead: Pace creates one parent task plus a subtask for each person (own progress each); the parent completes itself when every subtask is done.",
    inputSchema: object(
      {
        space: SPACE,
        title: { type: "string", description: "Short task title (max 200 characters)" },
        description: { type: "string", description: "Optional details; may contain line breaks and links" },
        due_date: { type: "string", description: "Optional due date, YYYY-MM-DD" },
        assignee_email: { type: "string", description: "Email of the member to assign to. Default: the token owner" },
        assignee_emails: { type: "array", items: { type: "string" }, description: "Emails of two or more members to each get the task (team leads only). Not combined with assignee_email or parent_number" },
        parent_number: { type: "integer", description: "Make it a subtask of this task number (one level only)" },
        labels: { type: "array", items: { type: "string" }, description: "Label names; missing labels are created" },
      },
      ["title"],
    ),
    write: true,
    run: async (args, { user, appUrl }) => {
      const space = await pickSpace(user, args.space);
      if (Array.isArray(args.assignee_emails) && args.assignee_emails.length > 1) {
        const assigneeIds = [];
        for (const email of args.assignee_emails) assigneeIds.push(await memberByEmail(user, space, email));
        const item = await newTask(user, space, { ...args, assignee_email: undefined, parent_number: undefined });
        const labels = args.labels === undefined ? [] : await labelIds(user, space, args.labels);
        const result = await createGroupTaskFor(user, { teamId: space.id, assigneeIds, title: item.title, description: item.description, dueDate: item.dueDate });
        if (!result.ok) fail(user, result.error);
        if (labels.length) await setLabelsFor(user, result.task.id, labels);
        return { created: true, number: result.task.number, subtasks: result.subtasks, url: `${appUrl}/tasks?team=${space.id}&task=${result.task.number}` };
      }
      const item = await newTask(user, space, args);
      const labels = args.labels === undefined ? [] : await labelIds(user, space, args.labels);
      const result = await createTaskFor(user, { teamId: space.id, ...item });
      if (!result.ok) fail(user, result.error);
      if (labels.length) await setLabelsFor(user, result.task.id, labels);
      return { created: true, number: result.task.number, url: `${appUrl}/tasks?team=${space.id}&task=${result.task.number}` };
    },
  },
  {
    name: "create_tasks",
    title: "Create several tasks",
    description: `Create up to ${MAX_BATCH} tasks in one space at once. All are checked first; if any is invalid, none are created. Each assignee gets one notification for their tasks.`,
    inputSchema: object(
      {
        space: SPACE,
        tasks: {
          type: "array",
          minItems: 1,
          maxItems: MAX_BATCH,
          items: object(
            {
              title: { type: "string", description: "Short task title (max 200 characters)" },
              description: { type: "string", description: "Optional details" },
              due_date: { type: "string", description: "Optional due date, YYYY-MM-DD" },
              assignee_email: { type: "string", description: "Email of the member to assign to. Default: the token owner" },
              parent_number: { type: "integer", description: "Existing task number to make this a subtask of" },
              labels: { type: "array", items: { type: "string" }, description: "Label names; missing labels are created" },
            },
            ["title"],
          ),
        },
      },
      ["tasks"],
    ),
    write: true,
    run: async (args, { user, appUrl }) => {
      const space = await pickSpace(user, args.space);
      const list = Array.isArray(args.tasks) ? (args.tasks as Args[]) : [];
      if (list.length === 0 || list.length > MAX_BATCH) throw new ToolError(`"tasks" must hold 1 to ${MAX_BATCH} tasks`);
      const items = [];
      for (const [i, task] of list.entries()) {
        try {
          items.push(await newTask(user, space, task ?? {}));
        } catch (error) {
          if (error instanceof ToolError) throw new ToolError(`Task ${i + 1} ("${str(task?.title)}"): ${error.message.replace(/\.$/, "")}. Nothing was created.`);
          throw error;
        }
      }
      const labelSets = [];
      for (const task of list) labelSets.push(task?.labels === undefined ? [] : await labelIds(user, space, task.labels));
      const result = await createTasksFor(user, space.id, items);
      if (!result.ok) fail(user, result.error);
      for (const [i, t] of result.tasks.entries()) {
        if (labelSets[i].length === 0) continue;
        const row = await prisma.task.findFirst({ where: { teamId: space.id, number: t.number }, select: { id: true } });
        if (row) await setLabelsFor(user, row.id, labelSets[i]);
      }
      return {
        created: result.tasks.length,
        tasks: result.tasks.map((t) => ({ number: t.number, title: t.title, url: `${appUrl}/tasks?team=${space.id}&task=${t.number}` })),
      };
    },
  },
  {
    name: "update_task",
    title: "Update a task",
    description:
      "Change a task: progress (0-100, 100 = done), due date, title, description, or assignee (assignee_email, see list_members). " +
      "A progress change is recorded in the task's history with the optional note. Reassigning is allowed for team leads and for whoever assigned the task; the new and previous assignee are notified.",
    inputSchema: object(
      {
        space: SPACE,
        number: { type: "integer", description: "Task number" },
        progress: { type: "integer", minimum: 0, maximum: 100, description: "Percent complete" },
        note: { type: "string", description: "Why the progress changed (shown in the task history)" },
        due_date: { type: "string", description: 'New due date YYYY-MM-DD, or "" to remove it' },
        due_reason: { type: "string", description: "Why the due date changes. Required when moving it later or removing it; recorded in the task thread" },
        title: { type: "string", description: "New title (max 200 characters)" },
        description: { type: "string", description: 'New details (replaces the old ones), or "" to clear' },
        assignee_email: { type: "string", description: "Email of the member to hand the task to" },
        parent_number: { type: "integer", description: "Make it a subtask of this task number; 0 to make it a normal task again" },
        labels: { type: "array", items: { type: "string" }, description: "Replace the labels with these names (missing ones are created); [] removes all" },
        add_waiting_on: { type: "array", items: { type: "integer" }, description: "Task numbers this task must wait for (blocked by)" },
        remove_waiting_on: { type: "array", items: { type: "integer" }, description: "Task numbers to stop waiting for" },
      },
      ["number"],
    ),
    write: true,
    run: async (args, { user, appUrl }) => {
      const { space, task } = await findTask(user, args);
      const editing = args.title !== undefined || args.description !== undefined || args.assignee_email !== undefined;
      const structure = ["parent_number", "labels", "add_waiting_on", "remove_waiting_on"].some((k) => args[k] !== undefined);
      if (args.progress === undefined && args.due_date === undefined && !editing && !structure) {
        throw new ToolError("Give at least one change: progress, due_date, title, description, assignee_email, parent_number, labels, add_waiting_on, remove_waiting_on");
      }
      // แก้ข้อความ/โอนก่อน — ถ้าไม่มีสิทธิ์จะหยุดก่อนเปลี่ยนอย่างอื่น
      if (editing) {
        const assigneeId = args.assignee_email === undefined ? undefined : await memberByEmail(user, space, args.assignee_email);
        const result = await editTaskFor(user, task.id, {
          title: args.title === undefined ? undefined : str(args.title),
          description: args.description === undefined ? undefined : str(args.description),
          assigneeId,
        });
        if (!result.ok) fail(user, result.error);
      }
      if (args.parent_number !== undefined) {
        const parentId = Number(args.parent_number) === 0 || args.parent_number === null ? null : await taskIdByNumber(space, args.parent_number, "parent_number");
        const result = await setParentFor(user, task.id, parentId);
        if (!result.ok) fail(user, result.error);
      }
      if (args.labels !== undefined) {
        const result = await setLabelsFor(user, task.id, await labelIds(user, space, args.labels));
        if (!result.ok) fail(user, result.error);
      }
      for (const n of args.add_waiting_on === undefined ? [] : numbers(args.add_waiting_on, "add_waiting_on")) {
        const result = await addBlockerFor(user, task.id, await taskIdByNumber(space, n, "add_waiting_on"));
        if (!result.ok) fail(user, result.error);
      }
      for (const n of args.remove_waiting_on === undefined ? [] : numbers(args.remove_waiting_on, "remove_waiting_on")) {
        const result = await removeBlockerFor(user, task.id, await taskIdByNumber(space, n, "remove_waiting_on"));
        if (!result.ok) fail(user, result.error);
      }
      if (args.due_date !== undefined) {
        const due = str(args.due_date);
        if (due && !isDateKey(due)) throw new ToolError("due_date must be YYYY-MM-DD");
        const result = await setDueFor(user, task.id, due, str(args.due_reason));
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
    description: "Read a note's full Markdown content. [[Title]] links to another note in the same space ([[Title#Heading]] to a heading, [[Folder/Title]] when titles repeat) and #12 links to task 12. Images are ![alt](url) links that open for people signed in to Pace; keep them as they are when you update the note.",
    inputSchema: object({ id: { type: "string", description: "Note id from list_notes" } }, ["id"]),
    write: false,
    run: async (args, { user, appUrl }) => {
      const note = await findNote(user, args.id);
      if (note.kind !== "NOTE") throw new ToolError("That id is a folder. Use list_notes to see what is inside.");
      return { id: note.id, title: note.title, content: note.content.replaceAll("](/api/files/", `](${appUrl}/api/files/`), folder_id: note.parentId, updated_at: note.updatedAt.toISOString(), url: `${appUrl}/notes/${note.id}` };
    },
  },
  {
    name: "create_note",
    title: "Create a note",
    description: "Create a note with Markdown content. Use [[Title]] to link to another note ([[Title#Heading]] for a heading, [[Folder/Title]] when titles repeat) and #12 to link to a task.",
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
      await syncLinks({ id: note.id, teamId: space.id, parentId, content });
      await syncNoteMentions(user, { id: note.id, teamId: space.id, title }, content);
      await relinkMentions(space.id, title);
      revalidatePath("/notes", "layout");
      revalidatePath("/tasks");
      return { created: true, id: note.id, url: `${appUrl}/notes/${note.id}` };
    },
  },
  {
    name: "create_folder",
    title: "Create a folder",
    description:
      'Create a folder for notes, optionally inside another folder. Give "title" for one folder, or "path" like "Projects/2026/Q4" to create every level at once; ' +
      "levels that already exist are reused. Returns the id of the last folder to pass as folder_id.",
    inputSchema: object({
      space: SPACE,
      title: { type: "string", description: "Folder name (max 120 characters, no [ ] or |)" },
      path: { type: "string", description: 'Folder names separated by "/" (max 10 levels), instead of title' },
      folder_id: { type: "string", description: "Optional parent folder id from list_notes; title or path is created inside it" },
    }),
    write: true,
    run: async (args, { user, appUrl }) => {
      const space = await pickSpace(user, args.space);
      const hasTitle = str(args.title) !== "";
      const hasPath = str(args.path) !== "";
      if (hasTitle === hasPath) throw new ToolError("Give exactly one of title or path");
      const names = hasPath ? str(args.path).split("/").map((s) => s.trim()).filter(Boolean) : [str(args.title)];
      if (names.length === 0 || names.length > 10) throw new ToolError("path must have 1 to 10 folder names");
      for (const name of names) {
        const parsed = noteTitle.safeParse(name);
        if (!parsed.success) fail(user, parsed.error.issues[0].message);
      }
      let parentId = await folderIn(space.id, args.folder_id);
      const created: string[] = [];
      for (const [i, name] of names.entries()) {
        const siblings = await prisma.note.findMany({ where: { teamId: space.id, parentId, deletedAt: null }, select: { id: true, kind: true, title: true } });
        const same = siblings.find((s) => noteKey(s.title) === noteKey(name));
        // แบบ path: ชั้นที่มีอยู่แล้วใช้ของเดิม · แบบ title: ชื่อซ้ำ = สร้างไม่ได้เหมือนเดิม
        // (ชนได้เฉพาะตามชั้นที่มีอยู่ — พอเริ่มสร้างใหม่ ชั้นถัดไปอยู่ในโฟลเดอร์ว่าง จึงไม่ค้างครึ่งทาง)
        if (same && same.kind === "FOLDER" && hasPath) {
          parentId = same.id;
          continue;
        }
        if (same) fail(user, same.kind === "NOTE" && i < names.length - 1 ? "มีโน้ตชื่อนี้อยู่แล้วในโฟลเดอร์นี้" : "มีชื่อนี้อยู่แล้วในโฟลเดอร์นี้");
        const folder = await prisma.note.create({ data: { teamId: space.id, parentId, kind: "FOLDER", title: name, createdById: user.id, updatedById: user.id } });
        created.push(name);
        parentId = folder.id;
      }
      revalidatePath("/notes", "layout");
      return { created: created.length > 0, created_folders: created, id: parentId, url: `${appUrl}/notes/${parentId}` };
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
      await syncLinks({ id: note.id, teamId: note.teamId, parentId: note.parentId, content: parsed.data.content });
      await syncNoteMentions(user, note, parsed.data.content);
      revalidatePath("/notes", "layout");
      revalidatePath("/tasks");
      return { updated: true, id: note.id, url: `${appUrl}/notes/${note.id}` };
    },
  },
  {
    name: "list_labels",
    title: "List labels",
    description: "List the labels that tasks in a space can use (the space's own labels and its parent team's).",
    inputSchema: object({ space: SPACE }),
    write: false,
    run: async (args, { user }) => {
      const space = await pickSpace(user, args.space);
      const labels = await availableLabels(space.id);
      const counts = await prisma.taskLabel.groupBy({ by: ["labelId"], where: { labelId: { in: labels.map((l) => l.id) }, task: { teamId: space.id, deletedAt: null } }, _count: true });
      return { space: space.name, labels: labels.map((l) => ({ name: l.name, color: l.color, from_parent_team: l.teamId !== space.id, tasks: counts.find((c) => c.labelId === l.id)?._count ?? 0 })) };
    },
  },
  {
    name: "comment_on_task",
    title: "Comment on a task",
    description: "Add a comment under a task, or reply in a thread with reply_to (a comment id from get_task). Write @Name to tag a member (see list_members); they are notified.",
    inputSchema: object({ space: SPACE, number: { type: "integer", description: "Task number" }, text: { type: "string", description: "Comment text (max 2000 characters)" }, reply_to: { type: "string", description: "Comment id to reply to" } }, ["number", "text"]),
    write: true,
    run: async (args, { user }) => {
      const { task } = await findTask(user, args);
      const result = await addCommentFor(user, str(args.reply_to) ? { parentId: str(args.reply_to), body: str(args.text) } : { target: { taskId: task.id }, body: str(args.text) });
      if (!result.ok) fail(user, result.error);
      return { added: true, id: result.id };
    },
  },
  {
    name: "list_note_comments",
    title: "List comments in a note",
    description: "List the comment threads of a note: the quoted text each thread is attached to, replies, whether it is resolved, and who it is assigned to (read / review / edit).",
    inputSchema: object({ id: { type: "string", description: "Note id" }, include_resolved: { type: "boolean", description: "Also return resolved threads. Default false" } }, ["id"]),
    write: false,
    run: async (args, { user, appUrl }) => {
      const note = await findNote(user, args.id);
      const threads = (await noteThreadsFor(user, note.id)) ?? [];
      return {
        note: note.title,
        threads: threads
          .filter((t) => args.include_resolved === true || !t.resolvedAt)
          .map((t) => ({
            id: t.id,
            quote: t.anchor?.quote ?? null,
            by: t.author.name,
            text: t.body,
            at: t.createdAt,
            resolved: Boolean(t.resolvedAt),
            approved: Boolean(t.approvedAt),
            assigned_to: t.assignee?.name ?? null,
            asks_to: t.assignKind?.toLowerCase() ?? null,
            replies: t.replies.map((r) => ({ by: r.author.name, text: r.body, at: r.createdAt })),
            url: `${appUrl}/notes/${note.id}?c=${t.id}`,
          })),
      };
    },
  },
  {
    name: "comment_on_note",
    title: "Comment on a note",
    description:
      "Start a comment thread in a note, optionally attached to a passage (quote: exact text from the note) and assigned to a member to read, review or edit. " +
      "Or reply to a thread with reply_to. Write @Name to tag a member; they are notified.",
    inputSchema: object(
      {
        id: { type: "string", description: "Note id (not needed with reply_to)" },
        text: { type: "string", description: "Comment text (max 2000 characters)" },
        quote: { type: "string", description: "Exact text in the note to attach the comment to (max 500 characters)" },
        assignee_email: { type: "string", description: "Member to ask (see list_members)" },
        ask: { type: "string", enum: ["read", "review", "edit"], description: "What to ask the assignee. Default: review" },
        reply_to: { type: "string", description: "Thread id to reply to (from list_note_comments)" },
      },
      ["text"],
    ),
    write: true,
    run: async (args, { user, appUrl }) => {
      if (str(args.reply_to)) {
        const result = await addCommentFor(user, { parentId: str(args.reply_to), body: str(args.text) });
        if (!result.ok) fail(user, result.error);
        return { added: true, id: result.id };
      }
      const note = await findNote(user, args.id);
      if (note.kind !== "NOTE") throw new ToolError("That id is a folder");
      let anchor = null;
      const quote = str(args.quote);
      if (quote) {
        const at = note.content.indexOf(quote);
        if (at < 0) throw new ToolError("quote was not found in the note. Copy the exact text from read_note.");
        anchor = { quote, prefix: note.content.slice(Math.max(0, at - CONTEXT), at), suffix: note.content.slice(at + quote.length, at + quote.length + CONTEXT) };
      }
      let assign = null;
      if (str(args.assignee_email)) {
        const space = await pickSpace(user, note.teamId);
        const kind = ({ read: "READ", review: "REVIEW", edit: "EDIT" } as const)[(str(args.ask) || "review") as "read" | "review" | "edit"];
        if (!kind) throw new ToolError('ask must be "read", "review" or "edit"');
        assign = { userId: await memberByEmail(user, space, args.assignee_email), kind };
      }
      const result = await addCommentFor(user, { target: { noteId: note.id }, body: str(args.text), anchor, assign });
      if (!result.ok) fail(user, result.error);
      return { added: true, id: result.id, url: `${appUrl}/notes/${note.id}?c=${result.id}` };
    },
  },
  {
    name: "resolve_note_comment",
    title: "Resolve or answer a note comment",
    description:
      'Close a thread ("resolve") or reopen it ("reopen"). When a thread is assigned to you, answer it instead: "read" (done reading), "approve" (review passed), ' +
      '"changes" (review needs changes; give reason), "edited" (you made the requested edits; it goes back for review).',
    inputSchema: object(
      {
        id: { type: "string", description: "Thread id from list_note_comments" },
        action: { type: "string", enum: ["resolve", "reopen", "read", "approve", "changes", "edited"] },
        reason: { type: "string", description: "Required for changes; optional note for edited" },
      },
      ["id", "action"],
    ),
    write: true,
    run: async (args, { user }) => {
      const action = str(args.action);
      const result =
        action === "resolve" || action === "reopen"
          ? await resolveThreadFor(user, str(args.id), action === "resolve")
          : ["read", "approve", "changes", "edited"].includes(action)
            ? await completeAssignmentFor(user, str(args.id), action as "read", str(args.reason))
            : null;
      if (!result) throw new ToolError("Unknown action");
      if (!result.ok) fail(user, result.error);
      return { done: true };
    },
  },
  {
    name: "waiting_on_me",
    title: "What is waiting on me",
    description: "Everything waiting on the token owner across spaces: note threads assigned to them (read / review / edit), their open tasks assigned by others, tasks that just became unblocked, and recent mentions.",
    inputSchema: object({}),
    write: false,
    run: async (_, { user, appUrl }) => {
      const box = await waitingOn(user);
      return {
        requests: box.requests.map((r) => ({ thread_id: r.id, note: r.note.title, note_id: r.note.id, asks_to: r.kind.toLowerCase(), from: r.from, quote: r.quote, text: r.body, url: `${appUrl}/notes/${r.note.id}?c=${r.id}` })),
        assigned_tasks: box.assigned.map((t) => ({ space: t.space, number: t.number, title: t.title, from: t.from, due_date: t.due, progress: t.progress, waiting_on: t.waitingOn })),
        unblocked_tasks: box.unblocked.map((t) => ({ space: t.space, number: t.number, title: t.title })),
        mentions: box.mentions.map((m) => ({ where: m.where, by: m.by, text: m.text, at: m.at, url: `${appUrl}${m.url}` })),
      };
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
