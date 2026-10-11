/** หัวข้อของเช็กอิน — ข้อความเป็นภาษาไทย (คีย์ของคำแปล) แปลตอนแสดงผล */
export const TASK_SECTIONS = [
  { key: "yesterdayTasks", label: "ล่าสุดทำอะไรไป", hint: "ที่ผ่านมา", tone: "slate" },
  { key: "todayTasks", label: "วันนี้จะทำอะไร", hint: "แผน", tone: "indigo" },
] as const;

export const TEXT_SECTIONS = [
  { key: "blockers", label: "ต้องการความช่วยเหลือ", hint: "ติดขัด", tone: "red" },
  { key: "notWorking", label: "สิ่งที่ควรปรับปรุง", hint: "ทบทวน", tone: "amber" },
  { key: "workingWell", label: "สิ่งที่ไปได้ดี", hint: "ทบทวน", tone: "emerald" },
] as const;

export type TaskSectionKey = (typeof TASK_SECTIONS)[number]["key"];
export type TextSectionKey = (typeof TEXT_SECTIONS)[number]["key"];
