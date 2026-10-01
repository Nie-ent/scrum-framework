"use client";

import { useEffect } from "react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="card mx-auto flex min-h-80 max-w-lg flex-col items-center justify-center px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-xl text-rose-600" aria-hidden="true">!</div>
      <p className="eyebrow mt-4 text-rose-600">Something went wrong</p>
      <h1 className="text-xl font-semibold text-slate-950">โหลดข้อมูลไม่สำเร็จ</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">ลองใหม่อีกครั้ง หากปัญหายังเกิดขึ้น โปรดติดต่อผู้ดูแลระบบ</p>
      <button className="btn mt-5" onClick={reset}>ลองอีกครั้ง</button>
    </div>
  );
}
