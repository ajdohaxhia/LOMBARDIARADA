import { useEffect, useState, useRef, type FormEvent } from "react";
import { supabase, publicFields } from "./api";
import {
  facts,
  formatDate,
  safeUrl,
  validateContribution,
  type Contribution,
} from "./domain";
export default function Moderation() {
  const [rows, setRows] = useState<Contribution[]>([]);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<Contribution | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("pending");
  const [abuses, setAbuses] = useState<
    {
      id: string;
      contribution_id: string;
      reason: string;
      created_at: string;
    }[]
  >([]);
  const loadVersion = useRef(0);
  async function load() {
    if (!supabase) return;
    const version = ++loadVersion.current;
    setSelected(null);
    setRows([]);
    setAbuses([]);
    setMessage("");
    try {
      const [queue, reports] = await Promise.all([
        supabase
          .from("contributions")
          .select(publicFields)
          .eq("editorial_status", status)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("abuse_reports")
          .select("id,contribution_id,reason,created_at")
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      if (version !== loadVersion.current) return;
      if (queue.error || reports.error) {
        setMessage("Impossibile leggere la coda. Aggiorna per riprovare.");
        return;
      }
      setRows(queue.data || []);
      setAbuses(reports.data || []);
    } catch {
      if (version === loadVersion.current)
        setMessage(
          "Impossibile leggere la coda. Controlla la connessione e riprova.",
        );
    }
  }
  useEffect(() => {
    void load();
    return () => {
      loadVersion.current += 1;
    };
  }, [status]);
  async function moderate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase || !selected || busy) return;
    setMessage("");
    const f = new FormData(e.currentTarget);
    const value = (name: string) => String(f.get(name) || "").trim();
    const action = value("action");
    const draft = {
      title: value("title"),
      description: value("description"),
      zone: value("zone"),
      event_at: value("event_at"),
    };
    const invalid = validateContribution(draft);
    if (invalid) {
      setMessage(invalid);
      return;
    }
    const factSource = value("fact_source_url");
    if (
      (value("fact_status") !== "unverified" && !factSource) ||
      (factSource && !safeUrl(factSource))
    ) {
      setMessage(
        "Indica una fonte HTTP o HTTPS valida per il riscontro o la smentita.",
      );
      return;
    }
    if (value("source_url") && !safeUrl(value("source_url"))) {
      setMessage("Indica una fonte editoriale HTTP o HTTPS valida.");
      return;
    }
    const lat = value("latitude"),
      lng = value("longitude");
    if (
      Boolean(lat) !== Boolean(lng) ||
      (lat &&
        (!Number.isFinite(Number(lat)) ||
          !Number.isFinite(Number(lng)) ||
          Number(lat) < 44.6 ||
          Number(lat) > 46.7 ||
          Number(lng) < 8.4 ||
          Number(lng) > 11.5))
    ) {
      setMessage(
        "Indica entrambe le coordinate approssimative entro la Lombardia, oppure lasciale vuote.",
      );
      return;
    }
    if (
      action === "merge" &&
      (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value("merged_into"),
      ) ||
        value("merged_into") === selected.id)
    ) {
      setMessage(
        "Indica un ID contributo di destinazione valido e diverso da quello selezionato.",
      );
      return;
    }
    const patch: Record<string, unknown> = {
      ...draft,
      event_at: new Date(draft.event_at).toISOString(),
      expected_updated_at: selected.updated_at,
      fact_status: value("fact_status"),
      fact_source_url: factSource || null,
      source_url: value("source_url") || null,
      category: value("category"),
      latitude: lat ? Number(lat) : null,
      longitude: lng ? Number(lng) : null,
    };
    if (action === "merge") patch.merged_into = value("merged_into");
    setBusy(true);
    try {
      const { error } = await supabase.rpc("moderate_contribution", {
        p_id: selected.id,
        p_action: action,
        p_patch: patch,
        p_note: value("note"),
      });
      if (error) {
        setMessage(
          error.message +
            " Aggiorna la coda e seleziona nuovamente il contributo prima di riprovare.",
        );
        setSelected(null);
      } else {
        await load();
        setMessage("Moderazione salvata.");
      }
    } catch {
      setMessage(
        "Impossibile salvare la decisione. Controlla la connessione e riprova.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="form-page">
      <div className="eyebrow">AREA RISERVATA</div>
      <h1>Moderazione</h1>
      <p className="lead">
        Pubblicazione e riscontro dei fatti sono decisioni distinte. Le azioni
        vengono registrate nello storico.
      </p>
      <label>
        Stato
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="pending">In revisione</option>
          <option value="published">Pubblicate senza revisione</option>
          <option value="approved">Approvati</option>
          <option value="rejected">Rifiutati</option>
          <option value="archived">Archiviati</option>
        </select>
      </label>
      <button
        type="button"
        className="text-button"
        disabled={busy}
        onClick={() => void load()}
      >
        Aggiorna coda
      </button>
      <div className="moderation-grid">
        <div>
          {rows.length === 0 && (
            <p className="empty">Nessun contributo in questa coda.</p>
          )}
          {rows.map((c) => (
            <button
              className="queue-item"
              key={c.id}
              onClick={() => setSelected(c)}
            >
              <strong>{c.title}</strong>
              <span>
                {c.zone} · {formatDate(c.event_at)}
              </span>
              <small>{facts[c.fact_status]}</small>
            </button>
          ))}
        </div>
        {selected && (
          <form key={selected.id} onSubmit={moderate} className="submission">
            <label>
              Titolo
              <input
                name="title"
                defaultValue={selected.title}
                required
                minLength={5}
                maxLength={160}
              />
            </label>
            <label>
              Riassunto / descrizione
              <textarea
                name="description"
                defaultValue={selected.description}
                rows={5}
                required
                minLength={20}
                maxLength={4000}
              />
            </label>
            <label>
              Zona
              <input name="zone" defaultValue={selected.zone} required />
            </label>
            <label>
              Categoria
              <select name="category" defaultValue={selected.category}>
                <option value="mobilita">Mobilità</option>
                <option value="ambiente">Ambiente</option>
                <option value="servizi">Servizi pubblici</option>
                <option value="eventi">Eventi</option>
                <option value="sicurezza">Sicurezza</option>
                <option value="altro">Altro</option>
              </select>
            </label>
            <div className="field-row">
              <label>
                Latitudine approssimativa
                <input
                  name="latitude"
                  type="number"
                  step="0.01"
                  min="44.6"
                  max="46.7"
                  defaultValue={selected.latitude ?? ""}
                />
              </label>
              <label>
                Longitudine approssimativa
                <input
                  name="longitude"
                  type="number"
                  step="0.01"
                  min="8.4"
                  max="11.5"
                  defaultValue={selected.longitude ?? ""}
                />
              </label>
            </div>
            <label>
              Data evento (con fuso orario)
              <input
                name="event_at"
                defaultValue={selected.event_at}
                required
              />
            </label>
            <label>
              Fonte editoriale
              <input
                type="url"
                name="source_url"
                defaultValue={selected.source_url || ""}
              />
            </label>
            <label>
              Riscontro dei fatti
              <select name="fact_status" defaultValue={selected.fact_status}>
                {Object.entries(facts).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Fonte del riscontro / smentita
              <input
                type="url"
                name="fact_source_url"
                defaultValue={selected.fact_source_url || ""}
              />
            </label>
            <label>
              Azione
              <select name="action">
                <option value="correct">Salva correzione</option>
                <option value="approve">Approva pubblicazione</option>
                <option value="reject">Rifiuta</option>
                <option value="merge">Unisci a duplicato</option>
                <option value="archive">Archivia</option>
              </select>
            </label>
            <label>
              ID contributo di destinazione (per unione)
              <input name="merged_into" />
            </label>
            <label>
              Nota interna
              <textarea name="note" required minLength={3} maxLength={2000} />
            </label>
            <button className="primary" disabled={busy}>
              Salva decisione
            </button>
          </form>
        )}
      </div>
      <h2>Segnalazioni di abuso</h2>
      {abuses.length === 0 ? (
        <p className="muted">Nessuna segnalazione ricevuta.</p>
      ) : (
        abuses.map((a) => (
          <article className="abuse-item" key={a.id}>
            <p>{a.reason}</p>
            <small>
              Contributo: {a.contribution_id} · {formatDate(a.created_at)}
            </small>
            <button
              className="text-button"
              onClick={async () => {
                if (!supabase) return;
                const version = loadVersion.current;
                try {
                  const { data, error } = await supabase
                    .from("contributions")
                    .select(publicFields)
                    .eq("id", a.contribution_id)
                    .single();
                  if (version !== loadVersion.current) return;
                  if (error) {
                    setSelected(null);
                    setMessage("Impossibile leggere il contributo.");
                  } else setSelected(data);
                } catch {
                  if (version === loadVersion.current) {
                    setSelected(null);
                    setMessage("Impossibile leggere il contributo. Riprova.");
                  }
                }
              }}
            >
              Esamina contributo
            </button>
          </article>
        ))
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
    </section>
  );
}
