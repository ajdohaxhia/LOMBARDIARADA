import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, act, cleanup } from "@testing-library/react";
import { fetchFeed, PAGE_SIZE, useFeed } from "./feed";
const mock = vi.hoisted(() => ({
  calls: [] as unknown[][],
  result: [] as unknown[],
  error: null as unknown,
  deferred: null as null | Promise<unknown>,
}));
vi.mock("./api", () => ({
  publicFields: "public",
  supabase: {
    from: () => {
      const query: any = {};
      for (const method of [
        "select",
        "eq",
        "in",
        "is",
        "gte",
        "lte",
        "ilike",
        "order",
      ])
        query[method] = (...args: unknown[]) => {
          mock.calls.push([method, ...args]);
          return query;
        };
      query.range = (...args: unknown[]) => {
        mock.calls.push(["range", ...args]);
        return (
          mock.deferred ||
          Promise.resolve({ data: mock.result, error: mock.error })
        );
      };
      return query;
    },
  },
}));
afterEach(() => {
  cleanup();
  mock.calls = [];
  mock.result = [];
  mock.error = null;
  mock.deferred = null;
});
describe("public feed server boundaries", () => {
  it("filters reports before pagination, excludes future events, and escapes pattern wildcards", async () => {
    const now = Date.parse("2026-10-20T12:00:00Z");
    await fetchFeed(
      { kind: "report", category: "mobilita", time: "24h", zone: "Zona_50%" },
      50,
      now,
    );
    expect(mock.calls).toEqual(
      expect.arrayContaining([
        ["eq", "kind", "report"],
        ["in", "editorial_status", ["published", "approved"]],
        ["is", "merged_into", null],
        ["eq", "category", "mobilita"],
        ["gte", "event_at", "2026-10-19T12:00:00.000Z"],
        ["lte", "event_at", "2026-10-20T12:00:00.000Z"],
        ["ilike", "zone", "%Zona\\_50\\%%"],
        ["range", 50, 50 + PAGE_SIZE - 1],
      ]),
    );
  });
  it("news and posts do not inherit report time constraints", async () => {
    await fetchFeed({ kind: "news" }, 0, Date.now());
    expect(mock.calls).toContainEqual(["eq", "kind", "news"]);
    expect(mock.calls.some((call) => call[0] === "gte")).toBe(false);
  });
  it("loads another page explicitly and prevents duplicate requests", async () => {
    mock.result = Array.from({ length: PAGE_SIZE }, (_, index) => ({
      id: String(index),
      kind: "news",
      editorial_status: "approved",
    }));
    const now = Date.now();
    const { result } = renderHook(() =>
      useFeed({ kind: "news" }, true, now, 0),
    );
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    mock.result = [{ id: "next", kind: "news", editorial_status: "approved" }];
    act(() => {
      result.current.more();
      result.current.more();
    });
    await waitFor(() =>
      expect(result.current.items).toHaveLength(PAGE_SIZE + 1),
    );
    expect(result.current.hasMore).toBe(false);
    expect(mock.calls.filter((call) => call[0] === "range")).toEqual([
      ["range", 0, 49],
      ["range", 50, 99],
    ]);
  });
  it("includes immediately public reports while preserving their unreviewed state", async () => {
    const now = Date.now();
    mock.result = [
      {
        id: "public-report",
        kind: "report",
        editorial_status: "published",
        event_at: new Date(now).toISOString(),
        fact_status: "unverified",
      },
    ];
    const { result } = renderHook(() =>
      useFeed({ kind: "report", time: "24h" }, true, now, 0),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual(mock.result);
  });
  it("reports query errors", async () => {
    mock.error = { message: "offline" };
    await expect(fetchFeed({ kind: "post" }, 0, Date.now())).rejects.toThrow(
      "non sono disponibili",
    );
  });
  it("ignores stale results when filters change", async () => {
    let resolve!: (data: unknown) => void;
    mock.deferred = new Promise((done) => {
      resolve = done;
    });
    const now = Date.now();
    const { result, rerender } = renderHook(
      ({ kind }: { kind: "post" | "news" }) => useFeed({ kind }, true, now, 0),
      { initialProps: { kind: "news" as "post" | "news" } },
    );
    mock.deferred = null;
    rerender({ kind: "post" });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      resolve({
        data: [{ id: "stale", kind: "news", editorial_status: "approved" }],
        error: null,
      });
    });
    expect(result.current.items).toEqual([]);
  });
});
