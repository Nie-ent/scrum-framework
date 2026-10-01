import Link from "next/link";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="card flex min-h-56 flex-col items-center justify-center px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-xl text-indigo-600" aria-hidden="true">✦</div>
      <h2 className="mt-4 font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">{description}</p>
      {action && <Link href={action.href} className="btn mt-5">{action.label}</Link>}
    </div>
  );
}

export function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-label="กำลังโหลดข้อมูล">
      <div className="h-12 border-b border-slate-100 bg-slate-50" />
      <div className="animate-pulse divide-y divide-slate-100">
        {Array.from({ length: rows }, (_, index) => <div key={index} className="flex items-center gap-3 px-5 py-4"><div className="h-9 w-9 rounded-full bg-slate-100" /><div className="h-4 flex-1 rounded bg-slate-100" /><div className="h-4 w-16 rounded bg-slate-100" /></div>)}
      </div>
    </div>
  );
}
