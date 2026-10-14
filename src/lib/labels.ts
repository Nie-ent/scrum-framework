/** สีของป้ายกำกับ — เลือกจากชุดนี้เท่านั้น (คลาสเขียนเต็มเพื่อให้ Tailwind สร้างครบ และใช้ได้ทั้งโหมดสว่าง/มืด) */
export const LABEL_COLORS = {
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  sky: "bg-sky-50 text-sky-700 ring-sky-200",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  rose: "bg-rose-50 text-rose-700 ring-rose-200",
} as const;

export type LabelColor = keyof typeof LABEL_COLORS;
export const LABEL_COLOR_NAMES = Object.keys(LABEL_COLORS) as LabelColor[];
export const isLabelColor = (value: unknown): value is LabelColor => typeof value === "string" && value in LABEL_COLORS;
export const labelClass = (color: string) => LABEL_COLORS[isLabelColor(color) ? color : "slate"];

/** ชื่อป้าย: ตัดช่องว่างซ้ำ ยาวไม่เกิน 40 */
export const cleanLabelName = (name: string) => name.trim().replace(/\s+/g, " ").slice(0, 40);
