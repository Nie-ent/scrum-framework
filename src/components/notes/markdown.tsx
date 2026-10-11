import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { tr } from "@/lib/i18n/server";

/**
 * แสดง Markdown ของโน้ต (ไม่รัน HTML ดิบ) — ลิงก์ภายในแอปใช้ next/link
 * ลิงก์ไปโน้ตที่ยังไม่มี (/notes/new…) แสดงเป็นเส้นประ คลิกเพื่อสร้าง
 */
export function Markdown({ content }: { content: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href = "", children }) {
            if (href.startsWith("/notes/new")) {
              return <Link href={href} title={tr("ยังไม่มีโน้ตนี้ — คลิกเพื่อสร้าง")} className="rounded border-b border-dashed border-slate-400 text-slate-500 hover:border-indigo-500 hover:text-indigo-700">{children}</Link>;
            }
            if (href.startsWith("/") && !href.startsWith("//")) {
              return <Link href={href} className="font-medium text-indigo-600 underline decoration-indigo-200 underline-offset-2 hover:text-indigo-800 hover:decoration-indigo-500">{children}</Link>;
            }
            return <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline underline-offset-2 hover:text-indigo-800">{children}</a>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
