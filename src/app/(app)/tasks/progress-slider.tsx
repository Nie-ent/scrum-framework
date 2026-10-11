"use client";

import { useState } from "react";

const STEPS = [0, 25, 50, 75, 100];

/** ปรับ % ด้วยแถบเลื่อนหรือปุ่มลัด 0/25/50/75/100 — ส่งค่าไปกับฟอร์มในชื่อ progress */
export function ProgressSlider({ defaultValue, label }: { defaultValue: number; label: string }) {
  const [value, setValue] = useState(defaultValue);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <input name="progress" type="range" min={0} max={100} step={5} value={value} onChange={(e) => setValue(Number(e.target.value))} aria-label={label} className="h-9 flex-1 accent-indigo-600" />
        <output className="w-12 shrink-0 text-right text-base font-semibold tabular-nums text-foreground">{value}%</output>
      </div>
      <div className="flex gap-1.5" role="group" aria-label="ตั้งค่าเร็ว">
        {STEPS.map((step) => (
          <button
            key={step}
            type="button"
            onClick={() => setValue(step)}
            aria-pressed={value === step}
            className={`min-h-8 flex-1 rounded-lg text-xs font-medium tabular-nums transition max-sm:min-h-10 ${value === step ? "bg-primary text-primary-foreground" : "bg-surface-sunken text-muted-foreground hover:text-foreground"}`}
          >
            {step === 100 ? "เสร็จ" : `${step}%`}
          </button>
        ))}
      </div>
    </div>
  );
}
