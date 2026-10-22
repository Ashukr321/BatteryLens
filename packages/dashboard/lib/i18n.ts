"use client";

import { useCallback, useSyncExternalStore } from "react";
import { HI } from "@/lib/i18n-hi";

export type Lang = "en" | "hi";

const KEY = "bl-lang";
const listeners = new Set<() => void>();

const read = (): Lang => {
  try {
    return localStorage.getItem(KEY) === "hi" ? "hi" : "en";
  } catch {
    return "en";
  }
};

export function setLang(lang: Lang) {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* private mode: the choice just won't persist */
  }
  listeners.forEach((f) => f());
}

const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};

export const useLang = () => useSyncExternalStore(subscribe, read, () => "en" as Lang);

/** English text is the key; missing Hindi entries fall back to English. `{name}` placeholders are filled from `vars`. */
export function useT() {
  const lang = useLang();
  return useCallback(
    (text: string, vars?: Record<string, string | number>) => {
      const out = (lang === "hi" && HI[text]) || text;
      return vars ? out.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? "")) : out;
    },
    [lang],
  );
}
