import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import Moderation from "./Moderation";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), queue: vi.fn() }));
vi.mock("./api", () => ({
  publicFields: "*",
  supabase: {
    rpc: mock.rpc,
    from: (table: string) => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () =>
          table === "contributions"
            ? mock.queue()
            : Promise.resolve({ data: [], error: null }),
      };
      return chain;
    },
  },
}));
const row = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Evento da revisionare",
  description: "Descrizione sufficientemente lunga.",
  zone: "Milano",
  category: "eventi",
  event_at: "2026-10-20T10:00:00Z",
  fact_status: "unverified",
  latitude: null,
  longitude: null,
};
beforeEach(() => {
  mock.rpc.mockReset().mockResolvedValue({ error: null });
  mock.queue.mockReset().mockResolvedValue({ data: [row], error: null });
});
afterEach(cleanup);
async function open() {
  render(<Moderation />);
  fireEvent.click(await screen.findByText(row.title));
  fireEvent.change(screen.getByLabelText("Nota interna"), {
    target: { value: "Controllo editoriale" },
  });
}
function submit() {
  fireEvent.submit(screen.getByText("Salva decisione").closest("form")!);
}
it("gestisce data non valida senza bloccare il modulo", async () => {
  await open();
  fireEvent.change(screen.getByLabelText("Data evento (con fuso orario)"), {
    target: { value: "non-data" },
  });
  submit();
  expect(await screen.findByRole("status")).toHaveTextContent(/data/i);
  expect(mock.rpc).not.toHaveBeenCalled();
  expect(screen.getByText("Salva decisione")).toBeEnabled();
});
it.each(["corroborated", "debunked"])(
  "richiede fonte per %s",
  async (value) => {
    await open();
    fireEvent.change(screen.getByLabelText("Riscontro dei fatti"), {
      target: { value },
    });
    submit();
    expect(await screen.findByRole("status")).toHaveTextContent(/fonte/i);
    expect(mock.rpc).not.toHaveBeenCalled();
  },
);
it("richiede entrambe le coordinate e UUID per unione", async () => {
  await open();
  fireEvent.change(screen.getByLabelText("Latitudine approssimativa"), {
    target: { value: "45.48" },
  });
  submit();
  expect(await screen.findByRole("status")).toHaveTextContent(/coordinate/i);
  fireEvent.change(screen.getByLabelText("Latitudine approssimativa"), {
    target: { value: "" },
  });
  fireEvent.change(screen.getByLabelText("Azione"), {
    target: { value: "merge" },
  });
  submit();
  expect(await screen.findByRole("status")).toHaveTextContent(/ID/i);
  expect(mock.rpc).not.toHaveBeenCalled();
});
it("gestisce errori di rete durante salvataggio", async () => {
  mock.rpc.mockRejectedValue(new Error("offline"));
  await open();
  submit();
  expect(await screen.findByRole("status")).toHaveTextContent(/salvare/i);
  expect(screen.getByText("Salva decisione")).toBeEnabled();
});
it("svuota selezione cambiando coda e ignora risposte precedenti", async () => {
  await open();
  let resolve!: (v: any) => void;
  mock.queue
    .mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    )
    .mockResolvedValueOnce({ data: [], error: null });
  fireEvent.click(screen.getByRole("button", { name: "Aggiorna coda" }));
  fireEvent.change(screen.getByLabelText("Stato"), {
    target: { value: "approved" },
  });
  await waitFor(() =>
    expect(screen.queryByLabelText("Titolo")).not.toBeInTheDocument(),
  );
  resolve({ data: [row], error: null });
  await waitFor(() =>
    expect(screen.queryByText(row.title)).not.toBeInTheDocument(),
  );
});
it("rimuove contributi privati dalla vista quando il caricamento fallisce", async () => {
  await open();
  mock.queue.mockRejectedValueOnce(new Error("offline"));
  fireEvent.click(screen.getByRole("button", { name: "Aggiorna coda" }));
  expect(await screen.findByRole("status")).toHaveTextContent(/coda/i);
  expect(screen.queryByText(row.title)).not.toBeInTheDocument();
});
it("invia la versione letta e forza nuova selezione dopo conflitto", async () => {
  mock.queue.mockResolvedValue({
    data: [{ ...row, updated_at: "2026-10-20T09:00:00Z" }],
    error: null,
  });
  mock.rpc.mockResolvedValue({
    error: { message: "Contributo aggiornato da un altro moderatore." },
  });
  await open();
  submit();
  expect(await screen.findByRole("status")).toHaveTextContent(
    /Aggiorna la coda/,
  );
  expect(mock.rpc).toHaveBeenCalledWith(
    "moderate_contribution",
    expect.objectContaining({
      p_patch: expect.objectContaining({
        expected_updated_at: "2026-10-20T09:00:00Z",
      }),
    }),
  );
  expect(screen.queryByLabelText("Titolo")).not.toBeInTheDocument();
});
it("salva e aggiorna la coda dopo una decisione valida", async () => {
  await open();
  mock.queue.mockResolvedValue({ data: [], error: null });
  submit();
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Moderazione salvata.",
  );
  expect(screen.queryByLabelText("Titolo")).not.toBeInTheDocument();
  expect(
    screen.getByText("Nessun contributo in questa coda."),
  ).toBeInTheDocument();
});

it("offre la coda delle segnalazioni pubblicate senza revisione", async () => {
  render(<Moderation />);
  expect(screen.getByLabelText("Stato")).toHaveValue("pending");
  expect(
    screen.getByRole("option", { name: "Pubblicate senza revisione" }),
  ).toHaveValue("published");
  fireEvent.change(screen.getByLabelText("Stato"), {
    target: { value: "published" },
  });
  expect(screen.getByLabelText("Stato")).toHaveValue("published");
  await screen.findByText(row.title);
});
