"use client";

import { setLanguage } from "@/app/actions/language";
import { useLang } from "@/components/i18n";
import { LANGS } from "@/lib/i18n/core";

/** ปุ่มเลือกภาษา (ไทย / English) — กดแล้วเปลี่ยนทั้งแอปทันที */
export function LanguageSwitch({ compact = false }: { compact?: boolean }) {
  const current = useLang();
  return (
    <form action={setLanguage} className={`inline-flex rounded-full bg-surface-sunken p-1 ${compact ? "text-xs" : "text-sm"}`}>
      {LANGS.map((l) => (
        <button
          key={l.id}
          name="lang"
          value={l.id}
          lang={l.id}
          aria-pressed={l.id === current}
          className={`inline-flex items-center rounded-full transition ${compact ? "min-h-7 px-3" : "min-h-9 px-4"} ${l.id === current ? "bg-surface font-semibold text-primary shadow-soft" : "text-muted-foreground hover:text-foreground"}`}
        >
          {l.label}
        </button>
      ))}
    </form>
  );
}
