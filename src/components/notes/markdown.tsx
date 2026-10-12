import Link from "next/link";
import { Children, isValidElement, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { headingId } from "@/lib/note-links";
import { tr } from "@/lib/i18n/server";

const textOf = (node: ReactNode): string =>
  Children.toArray(node)
    .map((child) => (typeof child === "string" || typeof child === "number" ? String(child) : isValidElement<{ children?: ReactNode }>(child) ? textOf(child.props.children) : ""))
    .join("");

// หัวข้อมี id จากข้อความของมัน — ปลายทางของลิงก์ [[โน้ต#หัวข้อ]]
const heading = (Tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6"): Components["h1"] =>
  function Heading({ children }) {
    return <Tag id={headingId(textOf(children)) || undefined} className="scroll-mt-20">{children}</Tag>;
  };
const HEADINGS = { h1: heading("h1"), h2: heading("h2"), h3: heading("h3"), h4: heading("h4"), h5: heading("h5"), h6: heading("h6") };

/**
 * แสดง Markdown ของโน้ต (ไม่รัน HTML ดิบ) — ลิงก์ภายในแอปใช้ next/link
 * หัวข้อมี id ให้ลิงก์ [[โน้ต#หัวข้อ]] กระโดดไปได้
 * ลิงก์ไปโน้ตที่ยังไม่มี (/notes/new…) แสดงเป็นเส้นประ คลิกเพื่อสร้าง
 */
export function Markdown({ content }: { content: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          ...HEADINGS,
          a({ href = "", children }) {
            // ลิงก์ไปหัวข้อในโน้ตนี้เอง
            if (href.startsWith("#")) {
              return <a href={href} className="font-medium text-indigo-600 underline decoration-indigo-200 underline-offset-2 hover:text-indigo-800 hover:decoration-indigo-500">{children}</a>;
            }
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
