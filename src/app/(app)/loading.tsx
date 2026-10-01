import { LoadingRows } from "@/components/ui-state";

export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="animate-pulse"><div className="h-3 w-24 rounded bg-slate-200" /><div className="mt-3 h-9 w-52 rounded-xl bg-slate-200" /></div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 animate-pulse">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-slate-200" />
        ))}
      </div>
      <LoadingRows />
      <span className="sr-only">กำลังโหลดข้อมูล</span>
    </div>
  );
}
