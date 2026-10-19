import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  act,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import App from "./App";
import SubmitForm from "./SubmitForm";
import Moderation from "./Moderation";
import Abuse from "./Abuse";
import type { Contribution } from "./domain";
const mock = vi.hoisted(() => ({
  items: [] as Contribution[],
  user: null as null | { id: string; is_anonymous?: boolean },
  signup: vi.fn(),
  getUser: vi.fn(),
  authChange: null as
    | null
    | ((
        event: string,
        session: { user: { id: string; is_anonymous?: boolean } } | null,
      ) => void),
  session: vi.fn(),
  mod: false,
  error: null as null | { message: string },
  rpc: vi.fn(),
  submit: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}));
vi.mock("./api", () => ({
  publicFields: "id,title",
  supabase: {
    auth: {
      getUser: mock.getUser,
      getSession: mock.session,
      signInAnonymously: mock.signup,
      onAuthStateChange: (callback: typeof mock.authChange) => {
        mock.authChange = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      signInWithOAuth: mock.login,
      signOut: mock.logout,
    },
    rpc: (...a: unknown[]) =>
      a[0] === "is_moderator"
        ? Promise.resolve({ data: mock.mod })
        : a[0] === "own_contributions"
          ? Promise.resolve({ data: mock.items, error: null })
          : mock.rpc(...a),
    from: (table: string) => {
      let rows: any[] = table === "abuse_reports" ? [] : [...mock.items];
      const result = () => ({ data: rows, error: mock.error });
      const q: any = {
        select: () => q,
        eq: (key: string, value: unknown) => {
          rows = rows.filter((r) => r[key] === value);
          return q;
        },
        in: (key: string, values: unknown[]) => {
          rows = rows.filter((r) => values.includes(r[key]));
          return q;
        },
        neq: (key: string, value: unknown) => {
          rows = rows.filter((r) => r[key] !== value);
          return q;
        },
        is: (key: string, value: unknown) => {
          rows = rows.filter((r) =>
            value === null ? r[key] == null : r[key] === value,
          );
          return q;
        },
        gte: (key: string, value: string) => {
          rows = rows.filter((r) => r[key] >= value);
          return q;
        },
        lte: (key: string, value: string) => {
          rows = rows.filter((r) => r[key] <= value);
          return q;
        },
        ilike: (key: string, value: string) => {
          rows = rows.filter((r) =>
            String(r[key])
              .toLowerCase()
              .includes(value.replaceAll("%", "").toLowerCase()),
          );
          return q;
        },
        order: () => q,
        limit: (n: number) => {
          rows = rows.slice(0, n);
          return q;
        },
        range: (start: number, end: number) => {
          rows = rows.slice(start, end + 1);
          return q;
        },
        then: (resolve: any, reject: any) =>
          Promise.resolve(result()).then(resolve, reject),
        single: () => Promise.resolve({ data: rows[0], error: mock.error }),
      };
      return q;
    },
  },
  submit: mock.submit,
}));
vi.mock("./Turnstile", () => ({
  default: ({ onToken }: { onToken: (s: string) => void }) => (
    <button type="button" onClick={() => onToken("proof")}>
      Conferma anti-abuso
    </button>
  ),
}));
vi.mock("./Map", () => ({
  default: ({
    items,
    pick,
  }: {
    items: Contribution[];
    pick?: (p: [number, number]) => void;
  }) => (
    <div data-testid="map">
      {items.map((i) => (
        <span key={i.id}>{i.zone}</span>
      ))}
      {pick && (
        <button type="button" onClick={() => pick([45.48, 9.19])}>
          Scegli punto
        </button>
      )}
    </div>
  ),
}));
const row = (p: Partial<Contribution> = {}): Contribution => ({
  id: "one",
  title: "Evento pubblico",
  description: "Una descrizione sufficientemente lunga del fatto",
  zone: "Milano Isola",
  category: "mobilita",
  kind: "news",
  event_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  editorial_status: "approved",
  fact_status: "unverified",
  testimony: "direct",
  latitude: null,
  longitude: null,
  ...p,
});
beforeEach(() => {
  mock.items = [];
  mock.user = null;
  mock.authChange = null;
  mock.getUser
    .mockReset()
    .mockImplementation(async () => ({ data: { user: mock.user } }));
  mock.mod = false;
  mock.error = null;
  mock.rpc.mockReset().mockResolvedValue({ error: null });
  mock.submit.mockReset().mockResolvedValue({});
  mock.login.mockReset().mockResolvedValue({ error: null });
  mock.session.mockReset().mockImplementation(async () => ({
    data: { session: { user: mock.user || { id: "existing" } } },
    error: null,
  }));
  mock.signup.mockReset();
  window.scrollTo = vi.fn();
});
afterEach(cleanup);
describe("pubblico", () => {
  it("mantiene la sessione anonima nuova quando la lettura iniziale termina in ritardo", async () => {
    let resolveInitial!: (value: { data: { user: null } }) => void;
    mock.getUser.mockReturnValue(
      new Promise((resolve) => {
        resolveInitial = resolve;
      }),
    );
    render(<App />);
    await screen.findByText("Nessuna notizia pubblicata");
    await act(async () => {
      mock.authChange?.("SIGNED_IN", {
        user: { id: "new-anonymous", is_anonymous: true },
      });
    });
    expect(
      screen.getAllByRole("button", { name: "I miei contributi" }).length,
    ).toBeGreaterThan(0);
    await act(async () => {
      resolveInitial({ data: { user: null } });
    });
    expect(
      screen.getAllByRole("button", { name: "I miei contributi" }).length,
    ).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /^Segnala$/ }));
    expect(screen.getByLabelText("Titolo")).toBeInTheDocument();
    expect(screen.getAllByText("Conferma anti-abuso")).toHaveLength(1);
    expect(mock.signup).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getAllByRole("button", { name: "I miei contributi" })[0],
    );
    expect(
      await screen.findByText(/Nessun contributo riservato disponibile/),
    ).toBeInTheDocument();
  });

  it("mostra home vuota, avvisi e login senza eventi inventati", async () => {
    render(<App />);
    expect(
      await screen.findByText("Nessuna notizia pubblicata"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(/Non è un servizio di emergenza/)[0],
    ).toBeInTheDocument();
    expect(screen.queryByText("Evento pubblico")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Notizie e segnalazioni dal territorio",
      }),
    ).toBeInTheDocument();
    expect(document.querySelector(".hero")).toBeNull();
    expect(
      screen.queryByText(
        /a portata di comunità|Le cose migliori iniziano vicino|Più comunità/,
      ),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getAllByRole("button", { name: /^Accesso moderatori$/ })[0],
    );
    await waitFor(() => expect(mock.login).toHaveBeenCalled());
    expect(
      screen.queryByRole("button", { name: "Moderazione" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Segnala$/ }));
    expect(screen.getByLabelText("Titolo")).toBeInTheDocument();
    expect(mock.signup).not.toHaveBeenCalled();
  });
  it("apre Segnala senza avviare autenticazione o richiedere Google", async () => {
    render(<App />);
    await screen.findByText("Nessuna notizia pubblicata");
    fireEvent.click(screen.getByRole("button", { name: /^Segnala$/ }));
    expect(screen.getByLabelText("Titolo")).toBeInTheDocument();
    expect(
      screen.queryByText("Accedi per contribuire"),
    ).not.toBeInTheDocument();
    expect(mock.signup).not.toHaveBeenCalled();
    expect(mock.login).not.toHaveBeenCalled();
  });
  it("esclude la sessione anonima dalla moderazione anche con RPC favorevole", async () => {
    mock.user = { id: "anonymous", is_anonymous: true };
    mock.mod = true;
    render(<App />);
    await screen.findByText("Nessuna notizia pubblicata");
    expect(
      screen.queryByRole("button", { name: "Moderazione" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Accesso moderatori" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: "I miei contributi" }).length,
    ).toBeGreaterThan(0);
    expect(mock.signup).not.toHaveBeenCalled();
  });
  it("separa fonti e riscontro, apre abuso e bacheche", async () => {
    mock.items = [
      row({
        source_url: "https://example.org",
        fact_status: "corroborated",
        fact_source_url: "https://example.org/proof",
      }),
      row({
        id: "post",
        kind: "post",
        title: "Una voce locale",
        category: "ambiente",
        testimony: "received",
      }),
    ];
    render(<App />);
    expect(
      await screen.findByRole("link", { name: /Leggi la fonte/ }),
    ).toHaveAttribute("href", "https://example.org/");
    expect(screen.getByText("Con riscontro")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Segnala abuso: Evento pubblico" }),
    );
    expect(screen.getByRole("dialog")).toHaveTextContent("Accedi con Google");
    fireEvent.click(screen.getByRole("button", { name: "Chiudi" }));
    fireEvent.click(screen.getByRole("button", { name: "Bacheche" }));
    expect(await screen.findByText("Una voce locale")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Es. Milano · Isola"), {
      target: { value: "Bergamo" },
    });
    expect(screen.queryByText("Una voce locale")).not.toBeInTheDocument();
  });
  it("filtra mappa per tempo, categoria e zona senza dichiarare risolto", async () => {
    mock.items = [
      row({ kind: "report" }),
      row({
        id: "old",
        kind: "report",
        title: "Evento precedente",
        event_at: "2020-01-01",
      }),
    ];
    render(<App />);
    await screen.findByText("Nessuna notizia pubblicata");
    fireEvent.click(
      screen.getByRole("button", { name: "Mappa del territorio" }),
    );
    expect(screen.getByText("Evento pubblico")).toBeInTheDocument();
    expect(screen.queryByText("Evento precedente")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Intervallo"), {
      target: { value: "all" },
    });
    expect(await screen.findByText("Evento precedente")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Categoria"), {
      target: { value: "ambiente" },
    });
    expect(screen.queryByText("Evento pubblico")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Categoria"), {
      target: { value: "all" },
    });
    fireEvent.change(screen.getByLabelText("Comune o zona"), {
      target: { value: "Como" },
    });
    expect(
      await screen.findByText("Nessuna segnalazione con questi filtri"),
    ).toBeInTheDocument();
  });
  it("mostra errore di lettura e riprova", async () => {
    mock.error = { message: "offline" };
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "non sono disponibili",
    );
    mock.error = null;
    fireEvent.click(screen.getByText("Riprova"));
    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
    );
  });
  it("mostra contributi riservati e moderazione solo al ruolo", async () => {
    mock.user = { id: "u" };
    mock.mod = true;
    mock.items = [row({ editorial_status: "pending" })];
    render(<App />);
    fireEvent.click(
      (await screen.findAllByRole("button", { name: "I miei contributi" }))[0],
    );
    expect(await screen.findByText("In revisione")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Moderazione" }));
    expect(
      await screen.findByText("Segnalazioni di abuso"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Esci" }));
    expect(mock.logout).toHaveBeenCalled();
  });
});
function fillSubmit() {
  fireEvent.change(screen.getByLabelText("Titolo"), {
    target: { value: "Evento pubblico" },
  });
  fireEvent.change(screen.getByLabelText("Comune e zona"), {
    target: { value: "Milano Isola" },
  });
  fireEvent.change(screen.getByLabelText("Data e ora dell’evento"), {
    target: { value: "2026-10-19T12:00" },
  });
  fireEvent.change(screen.getByLabelText("Descrizione"), {
    target: { value: "Una descrizione sufficientemente lunga" },
  });
  fireEvent.click(screen.getByLabelText("Testimonianza diretta"));
  fireEvent.click(screen.getByText("Conferma anti-abuso"));
}
describe("invio e abuso", () => {
  it("pubblica la segnalazione senza consentire al client di decidere lo stato editoriale", async () => {
    const done = vi.fn();
    render(<SubmitForm loggedIn onLogin={vi.fn()} onDone={done} />);
    expect(
      screen.getByRole("button", { name: "Pubblica segnalazione" }),
    ).toBeDisabled();
    fillSubmit();
    fireEvent.click(screen.getByText("Scegli punto"));
    fireEvent.click(
      screen.getByRole("button", { name: "Pubblica segnalazione" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "pubblicata subito, senza revisione",
    );
    expect(mock.submit).toHaveBeenCalledWith(
      "contribution",
      expect.objectContaining({ latitude: 45.48 }),
      "proof",
    );
    expect(mock.submit.mock.calls[0][1]).not.toHaveProperty("editorial_status");
    expect(done).toHaveBeenCalled();
    expect(screen.queryByLabelText("Titolo")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Pubblica segnalazione" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Invia un altro contributo" }),
    );
    expect(screen.getByLabelText("Titolo")).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "Pubblica segnalazione" }),
    ).toBeDisabled();
    expect(mock.submit).toHaveBeenCalledTimes(1);
  });
  it("mantiene i post di quartiere in revisione senza pubblicarli", async () => {
    render(<SubmitForm loggedIn onLogin={vi.fn()} onDone={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Tipo di contributo"), {
      target: { value: "post" },
    });
    fillSubmit();
    fireEvent.click(screen.getByRole("button", { name: "Invia in revisione" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "in revisione ed è invisibile al pubblico",
    );
    expect(mock.submit).toHaveBeenCalledWith(
      "contribution",
      expect.objectContaining({ kind: "post" }),
      "proof",
    );
    expect(screen.queryByLabelText("Titolo")).not.toBeInTheDocument();
  });
  it("comunica il rifiuto backend senza pubblicare", async () => {
    mock.submit.mockRejectedValue(new Error("Limite raggiunto"));
    render(<SubmitForm loggedIn onLogin={vi.fn()} onDone={vi.fn()} />);
    fillSubmit();
    fireEvent.click(
      screen.getByRole("button", { name: "Pubblica segnalazione" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Limite raggiunto",
    );
  });
  it("invia abuso solo dopo challenge e gestisce errore", async () => {
    render(<Abuse id="one" loggedIn onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Motivo"), {
      target: { value: "Informazione potenzialmente falsa" },
    });
    fireEvent.click(screen.getByText("Conferma anti-abuso"));
    fireEvent.click(screen.getByText("Invia ai moderatori"));
    expect(await screen.findByRole("status")).toHaveTextContent("ricevuta");
    expect(screen.queryByLabelText("Motivo")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Invia ai moderatori" }),
    ).not.toBeInTheDocument();
    expect(mock.submit).toHaveBeenCalledWith(
      "abuse",
      { contribution_id: "one", reason: "Informazione potenzialmente falsa" },
      "proof",
    );
  });
});
it("chiude il dialogo abusi con Escape", () => {
  const close = vi.fn();
  render(<Abuse id="one" loggedIn onClose={close} />);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(close).toHaveBeenCalledTimes(1);
});
describe("decisioni moderazione", () => {
  it.each(["approve", "correct", "reject", "merge", "archive"])(
    "salva %s tramite RPC con nota",
    async (action) => {
      mock.items = [row({ editorial_status: "pending" })];
      render(<Moderation />);
      fireEvent.click(
        await screen.findByRole("button", { name: /Evento pubblico/ }),
      );
      fireEvent.change(screen.getByLabelText("Azione"), {
        target: { value: action },
      });
      fireEvent.change(screen.getByLabelText("Nota interna"), {
        target: { value: "Nota motivata" },
      });
      if (action === "merge")
        fireEvent.change(
          screen.getByLabelText("ID contributo di destinazione (per unione)"),
          { target: { value: "11111111-1111-4111-8111-111111111111" } },
        );
      fireEvent.click(screen.getByText("Salva decisione"));
      expect(await screen.findByRole("status")).toHaveTextContent(
        "Moderazione salvata",
      );
      expect(mock.rpc).toHaveBeenCalledWith(
        "moderate_contribution",
        expect.objectContaining({
          p_action: action,
          p_note: "Nota motivata",
          p_patch: expect.objectContaining({ fact_status: "unverified" }),
        }),
      );
    },
  );
  it("richiede una nuova selezione quando RPC rifiuta decisione", async () => {
    mock.items = [row({ editorial_status: "pending" })];
    mock.rpc.mockResolvedValue({ error: { message: "Accesso negato" } });
    render(<Moderation />);
    fireEvent.click(
      await screen.findByRole("button", { name: /Evento pubblico/ }),
    );
    fireEvent.change(screen.getByLabelText("Nota interna"), {
      target: { value: "Nota motivata" },
    });
    fireEvent.click(screen.getByText("Salva decisione"));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Accesso negato",
    );
    expect(screen.queryByLabelText("Titolo")).not.toBeInTheDocument();
  });
});
