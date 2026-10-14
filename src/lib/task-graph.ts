/**
 * กฎโครงสร้างงาน (ไม่แตะฐานข้อมูล): งานที่ต้องรอกัน (blocked-by) และงานย่อย
 */

/** [งาน, งานที่ต้องรอ] */
export type WaitEdge = [taskId: string, blockedById: string];

/**
 * ให้ taskId รอ blockedById แล้วจะวนไหม — วนเมื่อ blockedById รอ taskId อยู่แล้ว (ทางตรงหรือทางอ้อม)
 */
export function createsCycle(edges: WaitEdge[], taskId: string, blockedById: string): boolean {
  if (taskId === blockedById) return true;
  const waitsOn = new Map<string, string[]>();
  for (const [task, blocker] of edges) waitsOn.set(task, [...(waitsOn.get(task) ?? []), blocker]);
  const seen = new Set<string>();
  const stack = [blockedById];
  while (stack.length) {
    const current = stack.pop()!;
    if (current === taskId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(waitsOn.get(current) ?? []));
  }
  return false;
}

/**
 * ตั้ง parentId เป็นงานแม่ของ task ได้ไหม — งานย่อยมีได้ชั้นเดียว
 * คืนข้อความผิดพลาด (key แปล) หรือ null ถ้าได้
 */
export function parentProblem(task: { id: string; teamId: string; hasSubtasks: boolean }, parent: { id: string; teamId: string; parentId: string | null } | null): string | null {
  if (!parent) return "ไม่พบงานแม่";
  if (parent.id === task.id) return "งานเป็นงานย่อยของตัวเองไม่ได้";
  if (parent.teamId !== task.teamId) return "งานแม่ต้องอยู่ในทีมเดียวกัน";
  if (parent.parentId) return "งานย่อยมีงานย่อยซ้อนอีกชั้นไม่ได้";
  if (task.hasSubtasks) return "งานที่มีงานย่อยอยู่แล้ว เป็นงานย่อยของงานอื่นไม่ได้";
  return null;
}
