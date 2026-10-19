export type Contribution = {
  id: string;
  kind: "news" | "report" | "post";
  title: string;
  description: string;
  zone: string;
  category: string;
  event_at: string;
  updated_at: string;
  created_at: string;
  editorial_status:
    "pending" | "published" | "approved" | "rejected" | "archived";
  fact_status: "unverified" | "corroborated" | "debunked";
  fact_source_url?: string | null;
  source_url?: string | null;
  testimony: "direct" | "received";
  latitude: number | null;
  longitude: number | null;
  merged_into?: string | null;
};
export const categories = {
  mobilita: "Mobilità",
  ambiente: "Ambiente",
  servizi: "Servizi pubblici",
  eventi: "Eventi",
  sicurezza: "Sicurezza",
  altro: "Altro",
};
export const facts = {
  unverified: "Non verificata",
  corroborated: "Con riscontro",
  debunked: "Smentita",
};
export function safeUrl(value?: string | null) {
  try {
    const u = new URL(value || "");
    return ["https:", "http:"].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}
export function approximatePoint(lat: number, lng: number): [number, number] {
  return [Math.round(lat * 100) / 100, Math.round(lng * 100) / 100];
}
export function filterContributions(
  items: readonly Contribution[],
  category: string,
  time: string,
  now: number,
) {
  return items.filter((c) => {
    const age = now - Date.parse(c.event_at);
    return (
      ["published", "approved"].includes(c.editorial_status) &&
      !c.merged_into &&
      (category === "all" || c.category === category) &&
      (time === "all" ||
        (age >= 0 && age <= (time === "24h" ? 24 : 168) * 3600000))
    );
  });
}
export function validateContribution(c: {
  title: string;
  description: string;
  zone: string;
  event_at: string;
}) {
  if (c.title.trim().length < 5 || c.title.length > 160)
    return "Il titolo deve contenere da 5 a 160 caratteri.";
  if (c.description.trim().length < 20 || c.description.length > 4000)
    return "La descrizione deve contenere da 20 a 4.000 caratteri.";
  if (c.zone.trim().length < 2 || c.zone.length > 120)
    return "Indica comune e zona (massimo 120 caratteri).";
  if (!Number.isFinite(Date.parse(c.event_at)))
    return "Indica una data e un orario validi.";
  return null;
}
export const formatDate = (date: string) =>
  new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Rome",
  }).format(new Date(date));
