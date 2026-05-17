export type SupportedKaiLanguage = "en" | "es" | "fj";

export const supportedKaiLanguages: Array<{ code: SupportedKaiLanguage; label: string }> = [
  { code: "en", label: "English" },
  { code: "es", label: "Espanol" },
  { code: "fj", label: "Vosa Vakaviti" },
];

export const kaiGreetings: Record<SupportedKaiLanguage, string> = {
  en: "Hi, I'm Kai. I can help you set up your business profile, build your Viliniu website, add products or services, and guide you through the platform.",
  es: "Hola, soy Kai. Puedo ayudarte a configurar tu perfil de negocio, crear tu sitio de Viliniu, agregar productos o servicios y guiarte por la plataforma.",
  fj: "Bula, o yau o Kai. Au rawa ni vukei iko mo vakarautaka na nomu itukutuku ni bisinisi, tara na nomu website ni Viliniu, kuria na iyaya se veiqaravi, ka dusimaki iko ena platform.",
};

export function normalizeKaiLanguage(language?: string): SupportedKaiLanguage {
  if (language === "es" || language === "fj") return language;
  return "en";
}

export function getKaiGreeting(language?: string): string {
  return kaiGreetings[normalizeKaiLanguage(language)];
}
