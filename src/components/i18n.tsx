"use client";

import { createContext, useCallback, useContext } from "react";
import { localeOf, translate, type Lang, type Translate } from "@/lib/i18n/core";

const LangContext = createContext<Lang>("th");

export function I18nProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);
export const useLocale = () => localeOf(useContext(LangContext));

/** แปลข้อความใน client component: const tr = useT(); tr("ข้อความ") */
export function useT(): Translate {
  const lang = useContext(LangContext);
  return useCallback<Translate>((text, vars) => translate(lang, text, vars), [lang]);
}
