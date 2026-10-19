import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, publicFields } from "./api";
import { filterContributions, type Contribution } from "./domain";

export const PAGE_SIZE = 50;
export type FeedFilter = {
  kind: Contribution["kind"];
  category?: string;
  time?: string;
  zone?: string;
};
export async function fetchFeed(
  filter: FeedFilter,
  offset: number,
  now: number,
) {
  if (!supabase) return [];
  let query = supabase
    .from("contributions")
    .select(publicFields)
    .in("editorial_status", ["published", "approved"])
    .is("merged_into", null)
    .eq("kind", filter.kind);
  if (filter.category && filter.category !== "all")
    query = query.eq("category", filter.category);
  if (filter.time && filter.time !== "all") {
    query = query
      .gte(
        "event_at",
        new Date(
          now - (filter.time === "24h" ? 24 : 168) * 3600000,
        ).toISOString(),
      )
      .lte("event_at", new Date(now).toISOString());
  }
  if (filter.zone?.trim()) {
    const literal = filter.zone.trim().replace(/[\\%_]/g, "\\$&");
    query = query.ilike("zone", `%${literal}%`);
  }
  const { data, error } = await query
    .order("event_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);
  if (error)
    throw new Error(
      "I contenuti non sono disponibili al momento. Riprova tra poco.",
    );
  return (data || []) as Contribution[];
}
export function useFeed(
  filter: FeedFilter,
  enabled: boolean,
  now: number,
  revision: number,
) {
  const [items, setItems] = useState<Contribution[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const generation = useRef(0);
  const offset = useRef(0);
  const pending = useRef(false);
  const key = JSON.stringify(filter);
  const request = useCallback(
    async (append: boolean) => {
      const token = append ? generation.current : ++generation.current;
      pending.current = true;
      setLoading(true);
      setError("");
      try {
        const data = await fetchFeed(
          JSON.parse(key),
          append ? offset.current : 0,
          now,
        );
        if (token !== generation.current) return;
        offset.current = (append ? offset.current : 0) + data.length;
        setItems((previous) =>
          append
            ? [
                ...previous,
                ...data.filter(
                  (row) => !previous.some((old) => old.id === row.id),
                ),
              ]
            : data,
        );
        setHasMore(data.length === PAGE_SIZE);
      } catch (cause) {
        if (token === generation.current)
          setError(
            cause instanceof Error
              ? cause.message
              : "Caricamento non riuscito.",
          );
      } finally {
        if (token === generation.current) {
          pending.current = false;
          setLoading(false);
        }
      }
    },
    [key, now],
  );
  useEffect(() => {
    setItems([]);
    setHasMore(false);
    offset.current = 0;
    if (enabled) void request(false);
    return () => {
      generation.current++;
      pending.current = false;
    };
  }, [enabled, request, revision]);
  const visible = filterContributions(
    items,
    filter.category || "all",
    filter.time || "all",
    now,
  ).filter(
    (row) =>
      row.kind === filter.kind &&
      (!filter.zone ||
        row.zone
          .toLocaleLowerCase("it")
          .includes(filter.zone.trim().toLocaleLowerCase("it"))),
  );
  return {
    items: visible,
    loading,
    error,
    hasMore,
    retry: () => void request(false),
    more: () => {
      if (!pending.current) void request(true);
    },
  };
}
