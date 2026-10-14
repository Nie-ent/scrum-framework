import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { waitingOn } from "@/lib/inbox";
import { formatDateKey, formatDateTime } from "@/lib/format-dates";
import { todayKey } from "@/lib/dates";
import { EmptyState } from "@/components/ui-state";
import { Icon } from "@/components/icons";
import { ensureLang, tr } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  await ensureLang();
  return { title: tr("รอฉัน") };
}

const ASK = { READ: "ขอให้อ่าน", REVIEW: "ขอให้ตรวจ", EDIT: "ขอให้แก้" } as const;

/** ทุกเรื่องที่ค้างอยู่ที่ฉัน: คำขอในโน้ต งานที่ได้รับมอบ งานที่เพิ่งเริ่มได้ และที่ที่ถูกแท็ก */
export default async function InboxPage() {
  const user = await requireUser();
  const box = await waitingOn(user);
  const today = todayKey();
  const empty = box.requests.length + box.assigned.length + box.unblocked.length + box.mentions.length === 0;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="page-header">
        <div>
          <p className="eyebrow">{tr("สิ่งที่ค้างอยู่ที่คุณ")}</p>
          <h1 className="page-title">{tr("รอฉัน")}</h1>
          <p className="page-subtitle">{tr("คำขอในโน้ต {0} · งานที่ได้รับมอบ {1}", [box.requests.length, box.assigned.length])}</p>
        </div>
      </div>

      {empty && <EmptyState title={tr("ไม่มีอะไรรอคุณอยู่")} description={tr("เมื่อมีคนขอให้อ่าน ตรวจ หรือแก้โน้ต มอบงาน หรือแท็กคุณ จะขึ้นที่นี่")} />}

      {box.requests.length > 0 && (
        <section className="card">
          <h2 className="mb-3 text-sm font-semibold">{tr("คำขอในโน้ต")}</h2>
          <ul className="divide-y divide-border">
            {box.requests.map((r) => (
              <li key={r.id}>
                <Link href={`/notes/${r.note.id}?c=${r.id}`} className="block py-2.5 hover:text-primary">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="badge badge-warning">{tr(ASK[r.kind])}</span>
                    <span className="font-medium text-foreground">{r.note.title}</span>
                    <span className="text-xs text-subtle">{tr("จาก {0}", [r.from])}</span>
                  </p>
                  {r.quote && <blockquote className="mt-1 line-clamp-1 border-l-2 border-warning pl-2 text-xs text-muted-foreground">{r.quote}</blockquote>}
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{r.body}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {box.unblocked.length > 0 && (
        <section className="card">
          <h2 className="mb-3 text-sm font-semibold">{tr("งานที่เริ่มได้แล้ว")}</h2>
          <ul className="space-y-1">
            {box.unblocked.map((t) => (
              <li key={t.id}><Link href={t.url} className="flex gap-2 py-1 text-sm hover:text-primary"><span className="tabular-nums text-subtle">#{t.number}</span><span className="min-w-0 flex-1 truncate">{t.title}</span><span className="text-xs text-subtle">{t.space}</span></Link></li>
            ))}
          </ul>
        </section>
      )}

      {box.assigned.length > 0 && (
        <section className="card">
          <h2 className="mb-3 text-sm font-semibold">{tr("งานที่ได้รับมอบหมาย")}</h2>
          <ul className="divide-y divide-border">
            {box.assigned.map((t) => (
              <li key={t.id}>
                <Link href={t.url} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm hover:text-primary">
                  <span className="tabular-nums text-subtle">#{t.number}</span>
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">{t.title}</span>
                  {t.waitingOn.length > 0 && <span className="badge badge-warning text-2xs">{tr("รอ {0}", [t.waitingOn.map((n) => `#${n}`).join(", ")])}</span>}
                  {t.due && <span className={`badge text-2xs ${t.due < today ? "badge-danger" : "badge-neutral"}`}>{formatDateKey(t.due)}</span>}
                  <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{t.progress}%</span>
                  <span className="basis-full text-xs text-subtle">{t.space}{t.from && ` · ${tr("มอบหมายโดย {0}", [t.from])}`}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {box.mentions.length > 0 && (
        <section className="card">
          <h2 className="mb-3 text-sm font-semibold">{tr("ถูกแท็กล่าสุด")}</h2>
          <ul className="divide-y divide-border">
            {box.mentions.map((m) => (
              <li key={m.id}>
                <Link href={m.url} className="block py-2 hover:text-primary">
                  <p className="flex items-center gap-2 text-sm"><Icon name={m.kind === "note" ? "note" : "comment"} className="h-4 w-4 shrink-0 text-subtle" /><span className="font-medium text-foreground">{m.where}</span><span className="ml-auto shrink-0 text-xs text-subtle">{formatDateTime(new Date(m.at))}</span></p>
                  {m.text && <p className="mt-0.5 line-clamp-2 pl-6 text-sm text-muted-foreground">{m.by && `${m.by}: `}{m.text}</p>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
