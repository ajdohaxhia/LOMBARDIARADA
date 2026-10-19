import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = url && key ? createClient(url, key) : null;
export async function submit(
  action: "contribution" | "abuse",
  data: Record<string, unknown>,
  turnstileToken: string,
) {
  if (!supabase)
    throw new Error(
      "Servizio non ancora configurato. Gli invii non sono disponibili.",
    );
  const { data: result, error } = await supabase.functions.invoke("submit", {
    body: { action, data, turnstileToken },
  });
  if (error || result?.error)
    throw new Error(
      result?.error ||
        "Invio non riuscito. Riprova; se persiste, attendi prima di inviare di nuovo.",
    );
  return result;
}

export const publicFields =
  "id,kind,title,description,zone,category,latitude,longitude,event_at,testimony,source_url,editorial_status,fact_status,fact_source_url,merged_into,created_at,updated_at";
