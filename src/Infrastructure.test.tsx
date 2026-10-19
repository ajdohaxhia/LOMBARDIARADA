import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, fireEvent, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import RadarMap from "./Map";
import Turnstile from "./Turnstile";
const state = vi.hoisted(() => ({ events: {} as any, invoke: vi.fn() }));
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: any) => <div>{children}</div>,
  TileLayer: ({ attribution }: any) => (
    <div data-testid="attribution">{attribution}</div>
  ),
  CircleMarker: ({ children }: any) => <div>{children}</div>,
  Popup: ({ children }: any) => <div>{children}</div>,
  useMapEvents: (events: any) => {
    state.events = events;
  },
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ functions: { invoke: state.invoke } }),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  delete window.turnstile;
  document.getElementById("turnstile-script")?.remove();
});
it("mappa attribuisce OSM e arrotonda il punto selezionato", () => {
  const pick = vi.fn();
  render(<RadarMap items={[]} pick={pick} point={[45.48, 9.19]} />);
  expect(screen.getByTestId("attribution")).toHaveTextContent("OpenStreetMap");
  state.events.click({ latlng: { lat: 45.48123, lng: 9.19234 } });
  expect(pick).toHaveBeenCalledWith([45.48, 9.19]);
  expect(
    screen.getByText("Punto approssimativo selezionato"),
  ).toBeInTheDocument();
});
it("Turnstile richiede configurazione e rimuove widget al reset", () => {
  render(<Turnstile onToken={vi.fn()} />);
  expect(
    screen.getByText(/Protezione anti-abuso da configurare/),
  ).toBeInTheDocument();
  cleanup();
  vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "site");
  const token = vi.fn();
  const remove = vi.fn();
  const widget = vi.fn().mockImplementation((_el, opts) => {
    opts.callback("proof");
    opts["expired-callback"]();
    opts["error-callback"]();
    return "widget";
  });
  window.turnstile = { render: widget, remove };
  const view = render(<Turnstile onToken={token} />);
  expect(token).toHaveBeenCalledWith("proof");
  expect(token).toHaveBeenCalledWith("");
  view.unmount();
  expect(remove).toHaveBeenCalledWith("widget");
});
it("Turnstile carica script una volta e attende load", () => {
  vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "site");
  const view = render(<Turnstile onToken={vi.fn()} />);
  const script = document.getElementById("turnstile-script")!;
  expect(script).toHaveAttribute(
    "src",
    "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
  );
  window.turnstile = {
    render: vi.fn().mockReturnValue("loaded"),
    remove: vi.fn(),
  };
  fireEvent.load(script);
  expect(window.turnstile.render).toHaveBeenCalled();
  view.unmount();
  expect(window.turnstile.remove).toHaveBeenCalledWith("loaded");
});
it("API fail closed sans configuration et traduit erreurs serveur", async () => {
  vi.resetModules();
  vi.stubEnv("VITE_SUPABASE_URL", "");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
  let api = await import("./api");
  await expect(api.submit("abuse", {}, "")).rejects.toThrow(
    "non ancora configurato",
  );
  vi.resetModules();
  vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "public");
  api = await import("./api");
  state.invoke.mockResolvedValue({ data: { ok: true }, error: null });
  await expect(
    api.submit("contribution", { title: "test" }, "proof"),
  ).resolves.toEqual({ ok: true });
  expect(state.invoke).toHaveBeenCalledWith("submit", {
    body: {
      action: "contribution",
      data: { title: "test" },
      turnstileToken: "proof",
    },
  });
  state.invoke.mockResolvedValue({
    data: { error: "Limite raggiunto" },
    error: null,
  });
  await expect(api.submit("abuse", {}, "proof")).rejects.toThrow(
    "Limite raggiunto",
  );
  state.invoke.mockResolvedValue({ error: new Error("network") });
  await expect(api.submit("abuse", {}, "proof")).rejects.toThrow(
    "Invio non riuscito",
  );
});
it("Turnstile mantiene separati CAPTCHA Auth e invio con un solo script", () => {
  const authToken = vi.fn();
  const submissionToken = vi.fn();
  const view = render(
    <>
      <Turnstile
        siteKey="auth-site"
        action="anonymous-auth"
        label="Verifica sessione"
        onToken={authToken}
      />
      <Turnstile
        siteKey="submission-site"
        action="submit"
        label="Verifica contributo"
        onToken={submissionToken}
      />
    </>,
  );
  expect(
    screen.getByRole("group", { name: "Verifica sessione" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("group", { name: "Verifica contributo" }),
  ).toBeInTheDocument();
  expect(document.querySelectorAll("#turnstile-script")).toHaveLength(1);
  const remove = vi.fn();
  window.turnstile = {
    render: vi.fn().mockImplementation((_element, options) => {
      const key = options.sitekey as string;
      (options.callback as (token: string) => void)(`${key}-token`);
      return key;
    }),
    remove,
  };
  fireEvent.load(document.getElementById("turnstile-script")!);
  expect(window.turnstile.render).toHaveBeenCalledWith(
    expect.any(HTMLElement),
    expect.objectContaining({ sitekey: "auth-site", action: "anonymous-auth" }),
  );
  expect(window.turnstile.render).toHaveBeenCalledWith(
    expect.any(HTMLElement),
    expect.objectContaining({ sitekey: "submission-site", action: "submit" }),
  );
  expect(authToken).toHaveBeenCalledExactlyOnceWith("auth-site-token");
  expect(submissionToken).toHaveBeenCalledExactlyOnceWith(
    "submission-site-token",
  );
  view.unmount();
  expect(remove).toHaveBeenCalledWith("auth-site");
  expect(remove).toHaveBeenCalledWith("submission-site");
});
