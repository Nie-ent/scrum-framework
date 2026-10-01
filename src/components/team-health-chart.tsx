export function TeamHealthChart({ submitted, total }: { submitted: number; total: number }) {
  const percent = total === 0 ? 0 : Math.round((submitted / total) * 100);
  const circumference = 2 * Math.PI * 36;
  const offset = circumference - (percent / 100) * circumference;
  return (
    <div className="card flex items-center gap-5 p-4">
      <svg className="h-20 w-20 shrink-0 -rotate-90" viewBox="0 0 88 88" role="img" aria-label={`ส่ง Daily Scrum แล้ว ${percent}%`}>
        <circle cx="44" cy="44" r="36" fill="none" stroke="currentColor" strokeWidth="8" className="text-slate-100" />
        <circle cx="44" cy="44" r="36" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} className={percent === 100 ? "text-emerald-500" : "text-indigo-600"} />
      </svg>
      <div>
        <p className="text-sm font-medium text-slate-500">การเช็กอินวันนี้</p>
        <p className="mt-0.5 text-2xl font-semibold tracking-tight text-slate-950">{percent}%</p>
        <p className="text-sm text-slate-500">ส่งแล้ว {submitted} จาก {total || 0} คน</p>
      </div>
    </div>
  );
}
