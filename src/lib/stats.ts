import "server-only";
import { prisma } from "./db";
import { dateToKey, keyToDate, shiftKey } from "./dates";

/** วันทำงาน = จันทร์–ศุกร์ (ยังไม่รู้จักวันหยุดนักขัตฤกษ์) */
export const isWorkday = (key: string) => {
  const day = keyToDate(key).getUTCDay();
  return day >= 1 && day <= 5;
};

export type CheckinStats = { expected: number; submitted: number; rate: number | null; streak: number };

/**
 * สถิติเช็กอินของ 1 คนในช่วง [startKey, todayKey]
 * - นับเฉพาะวันทำงาน และเริ่มนับตั้งแต่วันที่เข้าทีม (joinedKey)
 * - วันนี้ยังไม่ส่ง = ยังไม่นับว่าขาด (ยังส่งทันอยู่)
 * - streak = จำนวนวันทำงานติดต่อกันล่าสุดที่ส่ง
 */
export function checkinStats(days: ReadonlySet<string>, startKey: string, todayKey: string, joinedKey: string): CheckinStats {
  const from = joinedKey > startKey ? joinedKey : startKey;
  let expected = 0;
  let submitted = 0;
  for (let key = from; key <= todayKey; key = shiftKey(key, 1)) {
    if (!isWorkday(key)) continue;
    if (days.has(key)) {
      expected++;
      submitted++;
    } else if (key !== todayKey) {
      expected++;
    }
  }
  let streak = 0;
  for (let key = todayKey; key >= from; key = shiftKey(key, -1)) {
    if (!isWorkday(key)) continue;
    if (days.has(key)) streak++;
    else if (key !== todayKey) break;
  }
  return { expected, submitted, rate: expected === 0 ? null : Math.round((submitted / expected) * 100), streak };
}

export type MemberStats = CheckinStats & {
  userId: string;
  name: string;
  title: string | null;
  avatarUpdatedAt: Date | null;
  tasksDone: number;
  tasksOpen: number;
  tasksOverdue: number;
  comments: number;
  blockers: number;
};

/** สถิติการมีส่วนร่วมของสมาชิกที่ต้องเช็กอินในทีม ช่วง `days` วันล่าสุด */
export async function teamParticipation(teamId: string, todayKey: string, days: number): Promise<MemberStats[]> {
  const startKey = shiftKey(todayKey, -(days - 1));
  const start = keyToDate(startKey);
  const today = keyToDate(todayKey);
  const inTeam = { OR: [{ task: { teamId } }, { standup: { teamId } }] };

  const [members, standups, done, open, comments] = await Promise.all([
    prisma.teamMember.findMany({
      where: { teamId, participates: true, user: { active: true } },
      select: { userId: true, title: true, createdAt: true, user: { select: { name: true, avatarUpdatedAt: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.standup.findMany({ where: { teamId, date: { gte: start, lte: today } }, select: { userId: true, date: true, blockers: true } }),
    prisma.task.groupBy({ by: ["assigneeId"], where: { teamId, deletedAt: null, doneAt: { gte: start } }, _count: true }),
    prisma.task.findMany({ where: { teamId, deletedAt: null, progress: { lt: 100 } }, select: { assigneeId: true, dueDate: true } }),
    // ไม่นับรายการอัปเดต % ที่ระบบบันทึกให้เอง
    prisma.comment.groupBy({ by: ["authorId"], where: { ...inTeam, progressTo: null, createdAt: { gte: start } }, _count: true }),
  ]);

  const doneBy = new Map(done.map((d) => [d.assigneeId, d._count]));
  const commentsBy = new Map(comments.map((c) => [c.authorId, c._count]));
  return members.map((m) => {
    const own = standups.filter((s) => s.userId === m.userId);
    const mine = open.filter((t) => t.assigneeId === m.userId);
    return {
      userId: m.userId,
      name: m.user.name,
      title: m.title,
      avatarUpdatedAt: m.user.avatarUpdatedAt,
      ...checkinStats(new Set(own.map((s) => dateToKey(s.date))), startKey, todayKey, dateToKey(m.createdAt)),
      tasksDone: doneBy.get(m.userId) ?? 0,
      tasksOpen: mine.length,
      tasksOverdue: mine.filter((t) => t.dueDate && dateToKey(t.dueDate) < todayKey).length,
      comments: commentsBy.get(m.userId) ?? 0,
      blockers: own.filter((s) => s.blockers).length,
    };
  });
}
