import { Extension } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { noteKey } from "@/lib/note-links";

const PATTERN = /\[\[([^\[\]|\n]+?)(?:\|([^\[\]\n]+?))?\]\]|(^|[\s(])#(\d{1,6})(?![\w-])/g;

/**
 * แสดงลิงก์ [[ชื่อโน้ต]] และ #เลขงาน ในตัวแก้ไขเป็น "ป้าย" (ไม่เห็นวงเล็บ) โดยไม่เปลี่ยนข้อความจริง
 * — เป็นการตกแต่งการแสดงผลอย่างเดียว เนื้อหาที่บันทึกยังเป็นข้อความเดิม
 * เมื่อเคอร์เซอร์อยู่ในป้าย วงเล็บจะกลับมาให้เห็นเพื่อแก้ไขได้ตามปกติ
 */
export const LinkChips = Extension.create<{ noteTitles: string[]; taskNumbers: number[] }>({
  name: "linkChips",
  addOptions: () => ({ noteTitles: [], taskNumbers: [] }),
  addProseMirrorPlugins() {
    const known = new Set(this.options.noteTitles.map(noteKey));
    const tasks = new Set(this.options.taskNumbers);
    return [
      new Plugin({
        key: new PluginKey("linkChips"),
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            const { from: selFrom, to: selTo } = state.selection;
            state.doc.descendants((node, pos, parent) => {
              if (!node.isText || !node.text) return;
              // ข้อความในโค้ดไม่ใช่ลิงก์
              if (parent?.type.spec.code || node.marks.some((m) => m.type.spec.code)) return;
              for (const match of node.text.matchAll(PATTERN)) {
                if (match[1] !== undefined) {
                  const start = pos + match.index;
                  const end = start + match[0].length;
                  const editing = selFrom <= end && selTo >= start;
                  const exists = known.has(noteKey(match[1]));
                  const chip = `note-chip ${exists ? "" : "note-chip-new"}`;
                  if (editing) {
                    decorations.push(Decoration.inline(start, end, { class: `${chip} note-chip-editing` }));
                    continue;
                  }
                  // ซ่อน [[ , ]] และส่วน "ชื่อ|" เมื่อมีข้อความที่แสดงแทน
                  const labelStart = match[2] !== undefined ? end - 2 - match[2].length : start + 2;
                  decorations.push(Decoration.inline(start, labelStart, { class: "note-chip-hidden" }));
                  decorations.push(Decoration.inline(labelStart, end - 2, { class: chip, title: exists ? `ไปที่โน้ต ${match[1].trim()}` : `ยังไม่มีโน้ต ${match[1].trim()} — สร้างได้หลังบันทึก` }));
                  decorations.push(Decoration.inline(end - 2, end, { class: "note-chip-hidden" }));
                } else if (match[4] !== undefined && tasks.has(Number(match[4]))) {
                  const start = pos + match.index + match[3].length;
                  decorations.push(Decoration.inline(start, start + 1 + match[4].length, { class: "task-chip", title: `งานเลข ${match[4]}` }));
                }
              }
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
