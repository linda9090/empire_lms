import { cookies } from "next/headers";

const LOCALE_COOKIE = "NEXT_LOCALE";
const DEFAULT_LOCALE = "en";
const SUPPORTED_LOCALES = ["en", "ko", "ja", "zh"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export async function getUserLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const locale = cookieStore.get(LOCALE_COOKIE)?.value;
  if (locale && SUPPORTED_LOCALES.includes(locale as Locale)) {
    return locale as Locale;
  }
  return DEFAULT_LOCALE;
}

export async function setUserLocale(locale: Locale): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale);
}
