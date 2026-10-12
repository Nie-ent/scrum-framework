/**
 * ไวยากรณ์ลิงก์ในโน้ต (ใช้ทั้งตอนบันทึกเพื่อเก็บความสัมพันธ์ และตอนแสดงผล) — เขียนแบบเดียวกับ Obsidian ได้
 * - [[ชื่อโน้ต]] หรือ [[ชื่อโน้ต|ข้อความที่แสดง]] → ลิงก์ไปโน้ตในทีมเดียวกัน (ในตารางเขียน \| แทน | ได้)
 * - [[ชื่อโน้ต#หัวข้อ]] → ไปที่หัวข้อในโน้ตนั้น · [[#หัวข้อ]] → หัวข้อในโน้ตนี้เอง
 * - [[โฟลเดอร์/ชื่อโน้ต]] → ระบุโฟลเดอร์เมื่อมีโน้ตชื่อซ้ำกัน
 * - #12 → ลิงก์ไปงานเลข 12 ของทีม
 * ข้อความใน code (`...` และ ```...```) ไม่ถูกตีความเป็นลิงก์
 */
const CODE = /(```[\s\S]*?```|`[^`\n]*`)/;
// กลุ่ม: 1 = เป้าหมาย, 2 = ตัวคั่น (| หรือ \|), 3 = ข้อความที่แสดง
const WIKI = /\[\[([^\[\]|\n]+?)(?:(\\?\|)([^\[\]\n]+?))?\]\]/g;
// ก่อน # ต้องไม่ใช่ตัวอักษร/ตัวเลข หรือส่วนของ URL — จึงใช้ได้ทั้งหลังช่องว่างและในตัวหนา/ตัวเอียง (**#5**)
const TASK_REF = /(^|[^\p{L}\p{N}_/#&=\\\[])#(\d{1,6})(?![\w-])/gu;

/** ใช้เทียบชื่อโน้ต: ไม่สนตัวพิมพ์และช่องว่างหัวท้าย */
export const noteKey = (title: string) => title.trim().toLowerCase();

/** id ของหัวข้อในหน้าอ่านโน้ต — ลิงก์ [[โน้ต#หัวข้อ]] และตัวแสดงผลต้องคำนวณแบบเดียวกัน */
export const headingId = (text: string) => text.trim().toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");

export type LinkNode = { id: string; parentId: string | null; kind: "FOLDER" | "NOTE"; title: string };
export type ResolvedLink = {
  /** โน้ตปลายทาง — ไม่มีถ้ายังไม่มีโน้ตชื่อนี้ */
  noteId?: string;
  /** ชื่อโน้ตที่เป้าหมายอ้างถึง (ว่าง = โน้ตนี้เอง) */
  title: string;
  /** ส่วนโฟลเดอร์ที่เขียนนำหน้าชื่อ รวม / ท้าย (ว่างถ้าไม่ได้เขียน) */
  prefix: string;
  heading: string;
};

/**
 * วิธีอ่านเป้าหมายของลิงก์ เรียงจากตรงตัวที่สุด — ชื่อโน้ตมี # และ / ได้ จึงต้องลองทั้งชื่อก่อนแล้วค่อยแยก
 * เช่น "งาน/แผน#สรุป" → ชื่อ "งาน/แผน#สรุป" · ชื่อ "งาน/แผน" หัวข้อ "สรุป" · ชื่อ "แผน" ในโฟลเดอร์ "งาน" หัวข้อ "สรุป"
 */
export function targetForms(target: string): { hint: string[]; prefix: string; title: string; heading: string }[] {
  const whole = target.trim();
  const hash = whole.indexOf("#");
  const bases = [{ name: whole, heading: "" }, ...(hash >= 0 ? [{ name: whole.slice(0, hash).trim(), heading: whole.slice(hash + 1).trim() }] : [])];
  return bases.flatMap(({ name, heading }) => {
    const slash = name.lastIndexOf("/");
    const exact = { hint: [] as string[], prefix: "", title: name, heading };
    if (slash < 0 || !name.slice(slash + 1).trim()) return [exact];
    const hint = name.slice(0, slash).split("/").map(noteKey).filter(Boolean);
    return [exact, { hint, prefix: name.slice(0, slash + 1), title: name.slice(slash + 1).trim(), heading }];
  });
}

/**
 * ตัวหาโน้ตปลายทางของลิงก์ที่เขียนในโน้ต `from`
 * ชื่อซ้ำกันหลายโน้ต: เลือกตัวที่อยู่ในโฟลเดอร์ที่เขียนกำกับไว้ก่อน แล้วจึงตัวที่อยู่ใกล้โน้ตนี้ที่สุดในต้นไม้โฟลเดอร์
 * โฟลเดอร์ที่กำกับไว้เป็นแค่ตัวช่วยเลือก — ถ้าไม่ตรงกับตัวไหนเลย (เช่น เปลี่ยนชื่อโฟลเดอร์ไปแล้ว) ยังลิงก์ตามชื่อโน้ตได้
 */
export function linkResolver(nodes: LinkNode[], from: { id: string; parentId: string | null }): (target: string) => ResolvedLink {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const byKey = new Map<string, LinkNode[]>();
  for (const n of nodes) if (n.kind === "NOTE") byKey.set(noteKey(n.title), [...(byKey.get(noteKey(n.title)) ?? []), n]);
  // ชื่อโฟลเดอร์จากรากถึงโฟลเดอร์ที่โน้ตอยู่
  const folders = (parentId: string | null) => {
    const out: string[] = [];
    for (let f = parentId ? byId.get(parentId) : undefined; f && out.length < 50; f = f.parentId ? byId.get(f.parentId) : undefined) out.unshift(noteKey(f.title));
    return out;
  };
  const home = folders(from.parentId);
  const distance = (path: string[]) => {
    let shared = 0;
    while (shared < home.length && shared < path.length && home[shared] === path[shared]) shared++;
    return home.length + path.length - 2 * shared;
  };
  const pick = (found: LinkNode[], hint: string[]) => {
    const withPath = found.map((n) => ({ n, path: folders(n.parentId) }));
    const inHint = withPath.filter(({ path }) => hint.length <= path.length && hint.every((h, i) => path[path.length - hint.length + i] === h));
    return (inHint.length ? inHint : withPath).sort((a, b) => distance(a.path) - distance(b.path) || a.path.join("/").localeCompare(b.path.join("/")) || a.n.id.localeCompare(b.n.id))[0].n;
  };
  return (target) => {
    const forms = targetForms(target);
    for (const form of forms) {
      if (!form.title && form.heading) return { noteId: from.id, title: "", prefix: "", heading: form.heading };
      const found = byKey.get(noteKey(form.title));
      if (found) return { noteId: pick(found, form.hint).id, title: form.title, prefix: form.prefix, heading: form.heading };
    }
    // ยังไม่มีโน้ตนี้: ชื่อที่จะสร้างคือเป้าหมายที่ตัดหัวข้อออกแล้ว
    const last = forms.filter((f) => !f.prefix).at(-1)!;
    return last.title ? { title: last.title, prefix: "", heading: last.heading } : { title: target.trim(), prefix: "", heading: "" };
  };
}

/** ลิงก์นี้ชี้ไปโน้ตที่มีอยู่ไหม เมื่อรู้แค่ชื่อโน้ตทั้งหมด (ใช้ในตัวแก้ไข ซึ่งไม่มีต้นไม้โฟลเดอร์) */
export const targetExists = (target: string, knownKeys: Set<string>) => targetForms(target).some((f) => (f.title ? knownKeys.has(noteKey(f.title)) : Boolean(f.heading)));

const outsideCode = (content: string) => content.split(CODE).filter((_, i) => i % 2 === 0);

/** เป้าหมายของลิงก์ [[...]] และเลขงานทั้งหมดที่เนื้อหานี้อ้างถึง */
export function extractLinks(content: string): { targets: string[]; taskNumbers: number[] } {
  const targets = new Set<string>();
  const taskNumbers = new Set<number>();
  for (const part of outsideCode(content)) {
    for (const m of part.matchAll(WIKI)) targets.add(m[1].trim());
    for (const m of part.matchAll(TASK_REF)) taskNumbers.add(Number(m[2]));
  }
  return { targets: [...targets], taskNumbers: [...taskNumbers] };
}

const escapeLabel = (text: string) => text.replace(/([\[\]\\])/g, "\\$1");

/**
 * แปลงลิงก์ของเราเป็นลิงก์ Markdown ปกติก่อนส่งให้ตัวแสดงผล
 * โน้ตที่ยังไม่มี → ลิงก์ไปหน้าสร้างโน้ตชื่อนั้น (คลิกเพื่อสร้าง แบบ Obsidian)
 */
export function linkify(
  content: string,
  resolve: { self: string; note: (target: string) => ResolvedLink; taskUrl: (number: number) => string | undefined; newNoteUrl: (title: string) => string },
): string {
  return content
    .split(CODE)
    .map((part, i) => {
      if (i % 2 === 1) return part;
      return part
        .replace(WIKI, (_, target: string, _sep?: string, alias?: string) => {
          const { noteId, title, heading } = resolve.note(target);
          const label = escapeLabel((alias ?? (heading ? (title ? `${title} › ${heading}` : heading) : title)).trim());
          if (!noteId) return `[${label}](${resolve.newNoteUrl(title)})`;
          const anchor = heading ? `#${headingId(heading)}` : "";
          return `[${label}](${noteId === resolve.self && anchor ? anchor : `/notes/${noteId}${anchor}`})`;
        })
        .replace(TASK_REF, (whole, before: string, number: string) => {
          const url = resolve.taskUrl(Number(number));
          return url ? `${before}[#${number}](${url})` : whole;
        });
    })
    .join("");
}

/**
 * เปลี่ยนชื่อโน้ตในลิงก์ของเนื้อหา เป็นชื่อใหม่ — เฉพาะลิงก์ที่ `resolve` บอกว่าชี้ไปโน้ต `noteId`
 * (โน้ตอื่นที่ชื่อซ้ำกันไม่ถูกแตะ) ส่วนโฟลเดอร์นำหน้า #หัวข้อ และข้อความที่แสดงคงไว้ตามเดิม
 */
export function renameLinks(content: string, resolve: (target: string) => ResolvedLink, noteId: string, newTitle: string): string {
  return content
    .split(CODE)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part.replace(WIKI, (whole, target: string, sep?: string, alias?: string) => {
            const link = resolve(target);
            if (link.noteId !== noteId || !link.title) return whole;
            return `[[${link.prefix}${newTitle}${link.heading ? `#${link.heading}` : ""}${alias ? `${sep}${alias}` : ""}]]`;
          }),
    )
    .join("");
}

/** ข้อความล้วนสั้น ๆ จากเนื้อหาโน้ต สำหรับแสดงในรายการ — ถ้ามีคำค้นจะตัดให้เห็นช่วงที่ตรง */
export function noteSnippet(content: string, q = ""): string {
  const plain = content
    .replace(/\[\[([^\]|]+?)\\?\|([^\]]+)\]\]/g, "$2")
    .replace(/[#>*_`~|\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const at = q ? plain.toLowerCase().indexOf(q.toLowerCase()) : -1;
  const start = at > 60 ? at - 60 : 0;
  return (start > 0 ? "…" : "") + plain.slice(start, start + 160) + (plain.length > start + 160 ? "…" : "");
}
