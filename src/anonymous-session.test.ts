import { describe, expect, it, vi } from "vitest";
import { ensureSubmissionSession } from "./anonymous-session";

function client(session: object | null = null) {
  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
      signInAnonymously: vi.fn().mockResolvedValue({
        data: { session: { access_token: "new" } },
        error: null,
      }),
    },
  };
}
describe("sessione per l’invio", () => {
  it.each([false, true])(
    "riutilizza la sessione esistente (anonima: %s)",
    async (is_anonymous) => {
      const session = { access_token: "existing", user: { is_anonymous } };
      const c = client(session);
      expect(await ensureSubmissionSession(c, "")).toEqual(session);
      expect(c.auth.signInAnonymously).not.toHaveBeenCalled();
    },
  );
  it("richiede CAPTCHA prima di creare una sessione", async () => {
    const c = client();
    await expect(ensureSubmissionSession(c, "")).rejects.toThrow("verifica");
    expect(c.auth.signInAnonymously).not.toHaveBeenCalled();
  });
  it("crea una sola sessione per richieste concorrenti", async () => {
    const c = client();
    await Promise.all([
      ensureSubmissionSession(c, "captcha"),
      ensureSubmissionSession(c, "captcha"),
    ]);
    expect(c.auth.signInAnonymously).toHaveBeenCalledTimes(1);
    expect(c.auth.signInAnonymously).toHaveBeenCalledWith({
      options: { captchaToken: "captcha" },
    });
  });
  it("ricontrolla la sessione prima dell’iscrizione anonima", async () => {
    const c = client();
    c.auth.getSession
      .mockResolvedValueOnce({ data: { session: null }, error: null })
      .mockResolvedValueOnce({
        data: { session: { access_token: "google" } },
        error: null,
      });
    expect(await ensureSubmissionSession(c, "captcha")).toEqual({
      access_token: "google",
    });
    expect(c.auth.signInAnonymously).not.toHaveBeenCalled();
  });
  it("non sostituisce una sessione dopo un errore di lettura", async () => {
    const c = client();
    c.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: new Error("storage"),
    });
    await expect(ensureSubmissionSession(c, "captcha")).rejects.toThrow();
    expect(c.auth.signInAnonymously).not.toHaveBeenCalled();
  });
  it("non aggira gli errori CAPTCHA e permette un nuovo tentativo", async () => {
    const c = client();
    c.auth.signInAnonymously.mockResolvedValueOnce({
      data: { session: null },
      error: new Error("captcha"),
    });
    await expect(ensureSubmissionSession(c, "old")).rejects.toThrow("verifica");
    await ensureSubmissionSession(c, "new");
    expect(c.auth.signInAnonymously).toHaveBeenCalledTimes(2);
  });
});
