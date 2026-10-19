import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import SubmitForm from "./SubmitForm";
const state = vi.hoisted(() => ({
  session: null as object | null,
  sameTokens: false,
  signup: vi.fn(),
  submit: vi.fn(),
}));
vi.mock("./api", () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: state.session },
        error: null,
      }),
      signInAnonymously: state.signup,
    },
  },
  submit: state.submit,
}));
vi.mock("./Map", () => ({ default: () => <div /> }));
vi.mock("./Turnstile", () => ({
  default: ({ onToken, action = "submit", resetKey }: any) => (
    <button
      type="button"
      onClick={() =>
        onToken(state.sameTokens ? "same-token" : `${action}-${resetKey}`)
      }
    >
      CAPTCHA {action}
    </button>
  ),
}));
beforeEach(() => {
  state.session = null;
  state.sameTokens = false;
  state.signup.mockReset().mockResolvedValue({
    data: { session: { access_token: "anon" } },
    error: null,
  });
  state.submit.mockReset().mockResolvedValue({ ok: true });
});
afterEach(cleanup);
function open(loggedIn = false) {
  render(<SubmitForm loggedIn={loggedIn} onLogin={vi.fn()} onDone={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Titolo"), {
    target: { value: "Segnalazione valida" },
  });
  fireEvent.change(screen.getByLabelText("Comune e zona"), {
    target: { value: "Milano" },
  });
  fireEvent.change(screen.getByLabelText("Descrizione"), {
    target: { value: "Descrizione sufficientemente dettagliata dell’evento" },
  });
  fireEvent.change(screen.getByLabelText("Data e ora dell’evento"), {
    target: { value: "2026-10-20T10:00" },
  });
  fireEvent.click(screen.getByLabelText("Testimonianza diretta"));
}
it("apre il modulo senza creare sessioni; dopo la validazione usa CAPTCHA distinti", async () => {
  open();
  expect(state.signup).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("CAPTCHA anonymous_signup"));
  fireEvent.click(screen.getByText("CAPTCHA submit"));
  fireEvent.click(screen.getByText("Pubblica segnalazione"));
  await waitFor(() => expect(state.submit).toHaveBeenCalledTimes(1));
  expect(state.signup).toHaveBeenCalledWith({
    options: { captchaToken: "anonymous_signup-0" },
  });
  expect(state.submit.mock.calls[0][2]).toBe("submit-0");
  expect(JSON.stringify(state.submit.mock.calls)).not.toContain(
    "anonymous_signup",
  );
});
it("riutilizza la sessione Google senza CAPTCHA Auth né nuova iscrizione", async () => {
  state.session = { access_token: "google" };
  open(true);
  expect(screen.queryByText("CAPTCHA anonymous_signup")).toBeNull();
  fireEvent.click(screen.getByText("CAPTCHA submit"));
  fireEvent.click(screen.getByText("Pubblica segnalazione"));
  await waitFor(() => expect(state.submit).toHaveBeenCalledTimes(1));
  expect(state.signup).not.toHaveBeenCalled();
});
it("errore Auth blocca il contributo e richiede nuovi token", async () => {
  state.signup.mockResolvedValue({
    data: { session: null },
    error: new Error("CAPTCHA expired"),
  });
  open();
  fireEvent.click(screen.getByText("CAPTCHA anonymous_signup"));
  fireEvent.click(screen.getByText("CAPTCHA submit"));
  fireEvent.click(screen.getByText("Pubblica segnalazione"));
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain(
      "Sessione non creata",
    ),
  );
  expect(state.submit).not.toHaveBeenCalled();
  expect(
    (screen.getByText("Pubblica segnalazione") as HTMLButtonElement).disabled,
  ).toBe(true);
});
it("un modulo non valido non crea sessioni", async () => {
  open();
  fireEvent.change(screen.getByLabelText("Titolo"), { target: { value: "x" } });
  fireEvent.click(screen.getByText("CAPTCHA anonymous_signup"));
  fireEvent.click(screen.getByText("CAPTCHA submit"));
  fireEvent.submit(screen.getByText("Pubblica segnalazione").closest("form")!);
  await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
  expect(state.signup).not.toHaveBeenCalled();
  expect(state.submit).not.toHaveBeenCalled();
});
it("un errore di invio consuma e rinnova entrambi i token", async () => {
  state.submit.mockRejectedValue(new Error("Riprova"));
  open();
  fireEvent.click(screen.getByText("CAPTCHA anonymous_signup"));
  fireEvent.click(screen.getByText("CAPTCHA submit"));
  fireEvent.click(screen.getByText("Pubblica segnalazione"));
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toBe("Riprova"),
  );
  expect(
    (screen.getByText("Pubblica segnalazione") as HTMLButtonElement).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByText("CAPTCHA anonymous_signup"));
  fireEvent.click(screen.getByText("CAPTCHA submit"));
  fireEvent.click(screen.getByText("Pubblica segnalazione"));
  await waitFor(() => expect(state.submit).toHaveBeenCalledTimes(2));
  expect(state.signup.mock.calls[1][0]).toEqual({
    options: { captchaToken: "anonymous_signup-1" },
  });
  expect(state.submit.mock.calls[1][2]).toBe("submit-1");
});

it("rifiuta il riutilizzo dello stesso token per Auth e contributo", async () => {
  state.sameTokens = true;
  open();
  fireEvent.click(screen.getByText("CAPTCHA anonymous_signup"));
  fireEvent.click(screen.getByText("CAPTCHA submit"));
  fireEvent.click(screen.getByText("Pubblica segnalazione"));
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain("token distinti"),
  );
  expect(state.signup).not.toHaveBeenCalled();
  expect(state.submit).not.toHaveBeenCalled();
});
