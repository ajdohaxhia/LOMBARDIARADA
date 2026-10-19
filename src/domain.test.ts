import { describe, expect, it } from "vitest";
import {
  filterContributions,
  validateContribution,
  safeUrl,
  approximatePoint,
} from "./domain";
const base = {
  id: "one",
  kind: "report",
  title: "Test evento",
  description: "Una descrizione sufficientemente lunga",
  zone: "Milano · Isola",
  category: "mobilita",
  event_at: "2026-10-19T12:00:00Z",
  editorial_status: "approved",
  fact_status: "unverified",
  testimony: "direct",
  updated_at: "2026-10-19T12:00:00Z",
  created_at: "2026-10-19T12:00:00Z",
  latitude: 45.48,
  longitude: 9.19,
} as const;
describe("pubblicazione e tempo", () => {
  it("esclude pending anche se ricevuti dal backend", () =>
    expect(
      filterContributions(
        [{ ...base, editorial_status: "pending" }],
        "all",
        "all",
        Date.parse(base.event_at),
      ),
    ).toEqual([]));
  it("ultime 24 ore usa evento, non aggiornamento", () =>
    expect(
      filterContributions(
        [{ ...base, event_at: "2026-10-17T12:00:00Z" }],
        "all",
        "24h",
        Date.parse(base.updated_at),
      ),
    ).toEqual([]));
  it("non include futuri nella vista ultime 24 ore", () =>
    expect(
      filterContributions(
        [base],
        "all",
        "24h",
        Date.parse("2026-10-18T12:00:00Z"),
      ),
    ).toEqual([]));
  it("filtra categoria senza mutare stato storico", () => {
    expect(filterContributions([base], "ambiente", "all", Date.now())).toEqual(
      [],
    );
    expect(base.editorial_status).toBe("approved");
  });
});
describe("input", () => {
  it("rifiuta testo insufficiente", () =>
    expect(
      validateContribution({
        title: "a",
        description: "a",
        zone: "",
        event_at: "bad",
      }),
    ).not.toBeNull());
  it("accetta contributo completo", () =>
    expect(validateContribution(base)).toBeNull());
  it("rifiuta protocolli attivi", () => {
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("https://example.org")).toBe("https://example.org/");
  });
  it("arrotonda coordinate", () =>
    expect(approximatePoint(45.48123, 9.19234)).toEqual([45.48, 9.19]));
});
describe("validazione limiti e duplicati", () => {
  it("rifiuta descrizioni corte e troppo lunghe", () => {
    expect(validateContribution({ ...base, description: "breve" })).toMatch(
      /descrizione/,
    );
    expect(
      validateContribution({ ...base, description: "x".repeat(4001) }),
    ).toMatch(/descrizione/);
  });
  it("rifiuta zona vuota e data invalida", () => {
    expect(validateContribution({ ...base, zone: "" })).toMatch(/zona/);
    expect(validateContribution({ ...base, event_at: "bad" })).toMatch(/data/);
  });
  it("non mostra duplicati uniti", () =>
    expect(
      filterContributions(
        [{ ...base, merged_into: "another" }],
        "all",
        "all",
        Date.now(),
      ),
    ).toEqual([]));
  it("accetta la finestra settimanale solo entro sette giorni", () => {
    expect(
      filterContributions(
        [base],
        "all",
        "7d",
        Date.parse(base.event_at) + 48 * 3600000,
      ),
    ).toHaveLength(1);
    expect(
      filterContributions(
        [base],
        "all",
        "7d",
        Date.parse(base.event_at) + 169 * 3600000,
      ),
    ).toHaveLength(0);
  });
});

it("mostra segnalazioni pubblicate immediatamente senza confonderle con approvate", () => {
  const published = { ...base, editorial_status: "published" as const };
  expect(filterContributions([published], "all", "all", Date.now())).toEqual([
    published,
  ]);
  expect(published.editorial_status).toBe("published");
});
