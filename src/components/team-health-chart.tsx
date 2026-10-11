/** วงแหวนสัดส่วนคนที่เช็กอินแล้วของวันที่กำลังดู (ไม่มีกรอบ — วางในการ์ดของหน้าที่ใช้) */
export function TeamHealthChart({ submitted, total, label = "การเช็กอินวันนี้" }: { submitted: number; total: number; label?: string }) {
  const percent = total === 0 ? 0 : Math.round((submitted / total) * 100);
  const circumference = 2 * Math.PI * 36;
  const offset = circumference - (percent / 100) * circumference;
  return (
    <div className="flex items-center gap-4">
      <svg className="size-16 shrink-0 -rotate-90" viewBox="0 0 88 88" role="img" aria-label={`ส่งเช็กอินแล้ว ${percent}%`}>
        <circle cx="44" cy="44" r="36" fill="none" stroke="currentColor" strokeWidth="9" className="text-surface-sunken" />
        <circle cx="44" cy="44" r="36" fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} className={percent === 100 ? "text-success" : "text-primary"} />
      </svg>
      <div className="min-w-0">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-2xl font-semibold tracking-tight text-foreground">{percent}%</p>
        <p className="text-sm text-muted-foreground">ส่งแล้ว {submitted} จาก {total || 0} คน</p>
      </div>
    </div>
  );
}
