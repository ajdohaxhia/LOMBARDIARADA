import { useState, type FormEvent } from "react";
import { Send, MapPin, ShieldCheck } from "lucide-react";
import { categories, validateContribution } from "./domain";
import { submit, supabase } from "./api";
import { ensureSubmissionSession } from "./anonymous-session";
import Turnstile from "./Turnstile";
import RadarMap from "./Map";
export default function SubmitForm({
  loggedIn,
  onLogin: _onLogin,
  onDone,
  moderator = false,
}: {
  moderator?: boolean;
  loggedIn: boolean;
  onLogin: () => void;
  onDone: () => void;
}) {
  const [sent, setSent] = useState(false);
  const [kind, setKind] = useState("report");
  const [authToken, setAuthToken] = useState("");
  const [authReset, setAuthReset] = useState(0);
  const [token, setToken] = useState("");
  const [reset, setReset] = useState(0);
  const [point, setPoint] = useState<[number, number] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || sent || !token || (!loggedIn && !authToken)) return;
    setMessage("");
    const f = new FormData(e.currentTarget);
    const data = {
      kind,
      title: String(f.get("title")),
      description: String(f.get("description")),
      zone: String(f.get("zone")),
      category: String(f.get("category")),
      event_at: String(f.get("event_at")),
      testimony: String(f.get("testimony")),
      source_url: String(f.get("source_url") || "") || null,
      latitude: point?.[0] ?? null,
      longitude: point?.[1] ?? null,
    };
    const error = validateContribution(data);
    if (error) {
      setMessage(error);
      return;
    }
    setBusy(true);
    try {
      if (!supabase)
        throw new Error(
          "Servizio non ancora configurato. Gli invii non sono disponibili.",
        );
      if (!loggedIn && authToken === token)
        throw new Error(
          "Ripeti le due verifiche anti-abuso: richiedono token distinti.",
        );
      await ensureSubmissionSession(supabase, authToken);
      await submit(
        "contribution",
        { ...data, event_at: new Date(data.event_at).toISOString() },
        token,
      );
      setMessage(
        kind === "report"
          ? "Segnalazione pubblicata subito, senza revisione. I fatti restano non verificati."
          : "Contributo ricevuto: è in revisione ed è invisibile al pubblico.",
      );
      setSent(true);
      setPoint(null);
      onDone();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
      setAuthToken("");
      setAuthReset((r) => r + 1);
      setToken("");
      setReset((r) => r + 1);
    }
  }
  return (
    <section className="form-page">
      <div className="eyebrow">INVIO DI UN CONTRIBUTO</div>
      <h1>Invia una segnalazione</h1>
      <p className="lead">
        Le segnalazioni sono pubbliche subito, senza revisione preventiva.
        Notizie e post di quartiere passano dalla moderazione.
      </p>
      {!loggedIn && (
        <p className="muted">
          Puoi inviare senza registrazione. Una sessione anonima viene creata
          solo all’invio e conservata in questo browser.
        </p>
      )}
      {sent ? (
        <div className="login-box">
          <ShieldCheck size={32} />
          <h2>
            {kind === "report"
              ? "Segnalazione pubblicata"
              : "Contributo inviato in revisione"}
          </h2>
          <p>
            {kind === "report"
              ? "È pubblica e non verificata. Puoi consultarla nella mappa e nei tuoi contributi."
              : "Non è ancora visibile al pubblico. Puoi seguirne lo stato nella sezione I miei contributi."}
          </p>
          <button
            className="outline"
            onClick={() => {
              setSent(false);
              setMessage("");
              setKind("report");
            }}
          >
            Invia un altro contributo
          </button>
        </div>
      ) : (
        <form onSubmit={send} className="submission">
          <div className="field-row">
            <label>
              Tipo di contributo
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="report">Segnalazione</option>
                <option value="post">Post di quartiere</option>
                {moderator && (
                  <option value="news">Notizia della redazione</option>
                )}
              </select>
            </label>
            <label>
              Categoria
              <select name="category">
                {Object.entries(categories).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Titolo
            <input
              name="title"
              required
              minLength={5}
              maxLength={160}
              placeholder="Una descrizione breve e concreta"
            />
          </label>
          <div className="field-row">
            <label>
              Comune e zona
              <input
                name="zone"
                required
                minLength={2}
                maxLength={120}
                placeholder="Es. Milano · Isola"
              />
            </label>
            <label>
              Data e ora dell’evento
              <input type="datetime-local" name="event_at" required />
            </label>
          </div>
          <label>
            Descrizione
            <textarea
              name="description"
              required
              minLength={20}
              maxLength={4000}
              rows={5}
              placeholder="Che cosa è successo? Evita nomi, dati personali e accuse identificabili."
            />
          </label>
          {kind === "news" && (
            <label>
              Fonte della notizia
              <input
                type="url"
                name="source_url"
                required
                placeholder="https://…"
              />
            </label>
          )}
          <fieldset>
            <legend>Come hai avuto l’informazione?</legend>
            <label className="radio">
              <input type="radio" name="testimony" value="direct" required />{" "}
              Testimonianza diretta
            </label>
            <label className="radio">
              <input type="radio" name="testimony" value="received" required />{" "}
              Informazione ricevuta
            </label>
          </fieldset>
          <label>
            <MapPin size={16} /> Punto approssimativo (facoltativo)
          </label>
          <p className="muted">
            Tocca la mappa. Il punto viene arrotondato a una griglia di circa 1
            km; non inserire indirizzi personali.
          </p>
          <div className="picker">
            <RadarMap items={[]} pick={setPoint} point={point} />
          </div>
          {point && (
            <button
              type="button"
              className="text-button"
              onClick={() => setPoint(null)}
            >
              Rimuovi punto
            </button>
          )}
          {!loggedIn && (
            <Turnstile
              onToken={setAuthToken}
              resetKey={authReset}
              siteKey={import.meta.env.VITE_TURNSTILE_AUTH_SITE_KEY || ""}
              action="anonymous_signup"
              label="Verifica anti-abuso per l’invio senza registrazione"
            />
          )}
          <Turnstile onToken={setToken} resetKey={reset} />
          <p className="notice">
            {kind === "report"
              ? "Con l’invio la segnalazione diventa immediatamente pubblica. Non includere dati personali, indirizzi domestici o accuse identificabili. La pubblicazione non verifica i fatti."
              : "L’invio non pubblica il contributo. L’approvazione editoriale non equivale a verifica dei fatti."}
          </p>
          <button
            className="primary"
            disabled={busy || !supabase || !token || (!loggedIn && !authToken)}
          >
            <Send size={16} />
            {busy
              ? "Invio in corso…"
              : kind === "report"
                ? "Pubblica segnalazione"
                : "Invia in revisione"}
          </button>
        </form>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
    </section>
  );
}
