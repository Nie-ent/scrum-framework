import "server-only";
import { prisma } from "./db";
import { keyToDate, shiftKey, todayKey } from "./dates";
import { notify } from "./notify";

/**
 * กฎอัตโนมัติประจำวัน (เรียกจาก cron วันละครั้ง — ดู /api/cron/daily) ทำงานด้วยเงื่อนไขตายตัว ไม่ใช้ AI
 * แต่ละกฎดูจาก "จำนวนวันพอดี" ของวันกำหนดส่ง จึงเตือนงานหนึ่งครั้งเดียวต่อกฎโดยไม่ต้องจำว่าเคยเตือนแล้ว
 */

/** งานเลยกำหนดกี่วันแล้วจึงแจ้งผู้มอบหมายและหัวหน้าทีม */
const ESCALATE_AFTER_DAYS = 3;

/**
 * เตือนเรื่องกำหนดส่งของงานที่ยังไม่เสร็จ:
 * พรุ่งนี้ครบกำหนด → คนรับงาน · เลยกำหนด 1 วัน → คนรับงาน · เลยกำหนด 3 วัน → ผู้มอบหมายและหัวหน้าทีม (รวมทีมแม่)
 */
export async function taskReminders() {
  const today = todayKey();
  const soon = shiftKey(today, 1);
  const late = shiftKey(today, -1);
  const stuck = shiftKey(today, -ESCALATE_AFTER_DAYS);
  const tasks = await prisma.task.findMany({
    where: { deletedAt: null, progress: { lt: 100 }, dueDate: { in: [soon, late, stuck].map(keyToDate) }, assignee: { active: true } },
    select: {
      number: true,
      title: true,
      teamId: true,
      assigneeId: true,
      createdById: true,
      dueDate: true,
      assignee: { select: { name: true } },
      team: { select: { name: true, parentId: true, personalOfId: true } },
    },
  });
  const leads = await prisma.teamMember.findMany({
    where: { teamId: { in: [...new Set(tasks.flatMap((t) => [t.teamId, ...(t.team.parentId ? [t.team.parentId] : [])]))] }, access: { not: "MEMBER" }, user: { active: true } },
    select: { teamId: true, userId: true },
  });

  const totals = { dueTomorrow: 0, overdue: 0, escalated: 0 };
  for (const task of tasks) {
    const key = task.dueDate!.toISOString().slice(0, 10);
    const url = `/tasks?team=${task.teamId}${task.number === null ? "" : `&task=${task.number}`}`;
    const name = `${task.number === null ? "" : `#${task.number} `}${task.title}`;
    // เตือนรายวันเกิดบ่อย: แจ้งในแอปและ push เท่านั้น ไม่ส่งอีเมล
    if (key === soon) {
      totals.dueTomorrow++;
      await notify([{ userId: task.assigneeId }], (tr) => ({ title: tr("พรุ่งนี้ครบกำหนดส่ง"), body: name, url }), { email: false });
    } else if (key === late) {
      totals.overdue++;
      await notify([{ userId: task.assigneeId }], (tr) => ({ title: tr("งานเลยกำหนดส่งแล้ว"), body: tr("{0} — อัปเดตความคืบหน้าหรือเลื่อนกำหนดส่ง", [name]), url }), { email: false });
    } else if (!task.team.personalOfId) {
      // พื้นที่ส่วนตัวไม่มีใครให้แจ้งต่อ
      const ids = new Set([...(task.createdById ? [task.createdById] : []), ...leads.filter((m) => m.teamId === task.teamId || m.teamId === task.team.parentId).map((m) => m.userId)]);
      ids.delete(task.assigneeId);
      if (ids.size === 0) continue;
      totals.escalated++;
      await notify(
        [...ids].map((userId) => ({ userId })),
        (tr) => ({ title: tr("งานเลยกำหนด {0} วันแล้ว", [ESCALATE_AFTER_DAYS]), body: tr("{0} · {1} · ทีม {2}", [name, task.assignee.name, task.team.name]), url }),
      );
    }
  }
  return totals;
}

/**
 * สรุปประจำสัปดาห์ (ทุกวันศุกร์): แต่ละคนได้สรุปงานของตัวเองรวมทุกพื้นที่
 * และหัวหน้า/เจ้าของทีมได้สรุปของทีมที่ดูแลอีกทีมละฉบับ — ไม่มีอะไรเกิดขึ้นเลยก็ไม่ส่ง
 */
export async function weeklySummary() {
  const today = todayKey();
  const todayDate = keyToDate(today);
  // ต้นสัปดาห์ = วันจันทร์ (เทียบเวลาแบบ UTC — คลาดจากเที่ยงคืนเวลาไทยไม่กี่ชั่วโมง ซึ่งไม่กระทบสรุปที่ส่งวันศุกร์)
  const weekStart = keyToDate(shiftKey(today, -((todayDate.getUTCDay() + 6) % 7)));
  const nextWeekEnd = keyToDate(shiftKey(today, 7));
  const tasks = await prisma.task.findMany({
    where: { deletedAt: null, assignee: { active: true }, OR: [{ progress: { lt: 100 } }, { doneAt: { gte: weekStart } }] },
    select: { teamId: true, assigneeId: true, progress: true, dueDate: true, assignee: { select: { name: true } } },
  });

  type Count = { done: number; open: number; overdue: number; next: number; late: Set<string> };
  const blank = (): Count => ({ done: 0, open: 0, overdue: 0, next: 0, late: new Set() });
  const perUser = new Map<string, Count>();
  const perTeam = new Map<string, Count>();
  for (const task of tasks) {
    const user = perUser.get(task.assigneeId) ?? perUser.set(task.assigneeId, blank()).get(task.assigneeId)!;
    const team = perTeam.get(task.teamId) ?? perTeam.set(task.teamId, blank()).get(task.teamId)!;
    for (const count of [user, team]) {
      if (task.progress >= 100) {
        count.done++;
        continue;
      }
      count.open++;
      if (task.dueDate && task.dueDate < todayDate) {
        count.overdue++;
        count.late.add(task.assignee.name);
      } else if (task.dueDate && task.dueDate <= nextWeekEnd) count.next++;
    }
  }

  let sent = 0;
  for (const [userId, c] of perUser) {
    if (c.done + c.overdue + c.next === 0) continue;
    sent++;
    await notify([{ userId }], (tr) => ({
      title: tr("สรุปสัปดาห์ของคุณ"),
      body: tr("เสร็จ {0} งาน · ยังเปิดอยู่ {1} · เลยกำหนด {2} · ครบกำหนดใน 7 วัน {3}", [c.done, c.open, c.overdue, c.next]),
      url: "/tasks",
    }));
  }

  const teams = await prisma.team.findMany({
    where: { id: { in: [...perTeam.keys()] }, personalOfId: null },
    select: { id: true, name: true, members: { where: { access: { not: "MEMBER" }, user: { active: true } }, select: { userId: true } } },
  });
  for (const team of teams) {
    const c = perTeam.get(team.id)!;
    if (team.members.length === 0 || c.done + c.overdue + c.next === 0) continue;
    sent++;
    const late = [...c.late].slice(0, 5).join(", ");
    await notify(
      team.members.map((m) => ({ userId: m.userId })),
      (tr) => ({
        title: tr("สรุปสัปดาห์ทีม {0}", [team.name]),
        body: `${tr("เสร็จ {0} งาน · ยังเปิดอยู่ {1} · เลยกำหนด {2} · ครบกำหนดใน 7 วัน {3}", [c.done, c.open, c.overdue, c.next])}${late ? ` · ${tr("มีงานเลยกำหนด: {0}", [late])}` : ""}`,
        url: `/stats?team=${team.id}`,
      }),
    );
  }
  return { sent };
}
