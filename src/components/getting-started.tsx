"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

const KEY = "pace-hints-dismissed";
const subscribe = () => () => {};

/**
 * คำแนะนำเริ่มต้นสำหรับคนที่เพิ่งเข้าใช้ — ปิดได้ในครั้งเดียวและไม่กลับมาอีก (จำไว้ในเครื่องนี้)
 * ฝั่ง server ถือว่าปิดไว้ก่อน เพื่อไม่ให้การ์ดกระพริบขึ้นมาสำหรับคนที่ปิดไปแล้ว
 */
export function GettingStarted({ spaceId, personal }: { spaceId: string; personal: boolean }) {
  const stored = useSyncExternalStore(subscribe, () => localStorage.getItem(KEY) === "1", () => true);
  const [closed, setClosed] = useState(false);
  if (stored || closed) return null;

  const steps = [
    { href: `/tasks?team=${spaceId}#new`, title: "เพิ่มงานแรก", body: "พิมพ์ชื่องานแล้วกด Enter ใส่กำหนดส่งทีหลังได้" },
    { href: "#checkin", title: personal ? "เขียนบันทึกประจำวัน" : "เช็กอินประจำวัน", body: "บอกว่าทำอะไรไปและวันนี้จะทำอะไร ใช้เวลาไม่ถึงนาที" },
    { href: `/notes?team=${spaceId}`, title: "จดโน้ต", body: "เก็บความรู้เป็นโฟลเดอร์ และเชื่อมโน้ตเข้ากับงานได้" },
    { href: "/teams", title: "ชวนคนมาทำด้วยกัน", body: "สร้างทีมแล้วเชิญด้วยอีเมล พื้นที่ส่วนตัวของคุณยังอยู่แยกไว้" },
  ];
  return (
    <section aria-label="เริ่มต้นใช้งาน" className="card mb-4 border-primary/20 bg-primary-soft/40">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-foreground">ยินดีต้อนรับสู่ Pace</h2>
          <p className="text-sm text-muted-foreground">สี่อย่างที่ทำได้ที่นี่ — เริ่มจากข้อไหนก่อนก็ได้</p>
        </div>
        <button
          type="button"
          onClick={() => {
            localStorage.setItem(KEY, "1");
            setClosed(true);
          }}
          className="btn-ghost min-h-9 shrink-0 px-3 py-1 text-xs"
        >
          เข้าใจแล้ว
        </button>
      </div>
      <ol className="grid gap-2 sm:grid-cols-2">
        {steps.map((step, i) => (
          <li key={step.title}>
            <Link href={step.href} className="flex h-full gap-3 rounded-xl bg-surface p-3 shadow-soft ring-1 ring-border transition hover:ring-primary/40">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{i + 1}</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">{step.title}</span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{step.body}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
