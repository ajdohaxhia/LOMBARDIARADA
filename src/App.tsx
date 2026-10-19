import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  Radar,
  ArrowUpRight,
  ArrowRight,
  Plus,
  MapPin,
  Clock3,
  ShieldCheck,
  ExternalLink,
  Flag,
  Menu,
  X,
  Newspaper,
  Map,
  MessageSquare,
  SlidersHorizontal,
  LogOut,
  Leaf,
  MoveRight,
  CalendarDays,
  Building2,
  Info,
} from "lucide-react";
import { supabase } from "./api";
import { useFeed } from "./feed";
import {
  categories,
  facts,
  formatDate,
  safeUrl,
  type Contribution,
} from "./domain";
import RadarMap from "./Map";
import SubmitForm from "./SubmitForm";
import Moderation from "./Moderation";
import Abuse from "./Abuse";
type Page = "home" | "map" | "submit" | "boards" | "moderation" | "mine";
const nav: [Page, string][] = [
  ["home", "In primo piano"],
  ["map", "Mappa del territorio"],
  ["boards", "Bacheche"],
];
function Card({
  c,
  onAbuse,
}: {
  c: Contribution;
  onAbuse: (id: string) => void;
}) {
  const url = safeUrl(c.source_url);
  const factUrl = safeUrl(c.fact_source_url);
  return (
    <article className="news-card">
      <div className={`card-visual ${c.category}`}>
        <span className="category-tag">
          {categories[c.category as keyof typeof categories] || c.category}
        </span>
      </div>
      <div className="card-body">
        <div className="location">
          <MapPin size={12} />
          {c.zone}
        </div>
        <h3>{c.title}</h3>
        <p>{c.description}</p>
        {c.kind === "report" && (
          <p className="editorial-status">
            {c.editorial_status === "published"
              ? "Pubblicata senza revisione"
              : "Revisione editoriale completata"}
          </p>
        )}
        <div className="fact-row">
          <span className={`fact ${c.fact_status}`}>
            {facts[c.fact_status]}
          </span>
          {factUrl && (
            <a href={factUrl} target="_blank" rel="noopener noreferrer">
              Fonte del riscontro <ExternalLink size={12} />
            </a>
          )}
        </div>
        <div className="card-meta">
          <span>
            <Clock3 size={12} />
            Evento: {formatDate(c.event_at)}
          </span>
          <span>Aggiornato: {formatDate(c.updated_at)}</span>
        </div>
        {c.kind !== "news" && (
          <small>
            {c.testimony === "direct"
              ? "Testimonianza diretta"
              : "Informazione ricevuta"}
          </small>
        )}
        <div className="card-bottom">
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer">
              Leggi la fonte <ArrowUpRight size={15} />
            </a>
          ) : (
            <span className="muted">Contributo della comunità</span>
          )}
          <button
            className="icon-button"
            onClick={() => onAbuse(c.id)}
            aria-label={`Segnala abuso: ${c.title}`}
          >
            <Flag size={15} />
          </button>
        </div>
      </div>
    </article>
  );
}
export default function App() {
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState<Page>("home");
  const [menu, setMenu] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [mod, setMod] = useState(false);
  const [mine, setMine] = useState<Contribution[]>([]);
  const [category, setCategory] = useState("all");
  const [time, setTime] = useState("24h");
  const [zone, setZone] = useState("");
  const [error, setError] = useState("");
  const [abuse, setAbuse] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  function go(p: Page) {
    setPage(p);
    setMenu(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  const newsFeed = useFeed({ kind: "news" }, page === "home", now, revision);
  const reportsFeed = useFeed(
    {
      kind: "report",
      category: page === "home" ? "all" : category,
      time: page === "home" ? "24h" : time,
      zone: page === "home" ? "" : zone,
    },
    page === "home" || page === "map",
    now,
    revision,
  );
  const postsFeed = useFeed(
    { kind: "post", zone },
    page === "boards",
    now,
    revision,
  );
  const activeFeeds =
    page === "home"
      ? [newsFeed, reportsFeed]
      : page === "map"
        ? [reportsFeed]
        : page === "boards"
          ? [postsFeed]
          : [];
  const loading = activeFeeds.some((feed) => feed.loading);
  const feedError = activeFeeds.find((feed) => feed.error)?.error;
  function load() {
    setRevision((value) => value + 1);
  }
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    if (!supabase) return () => clearInterval(timer);
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) =>
      setUser(session?.user || null),
    );
    return () => {
      clearInterval(timer);
      subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    let active = true;
    setMod(false);
    setMine([]);
    let roleTimer: number | undefined;
    let checkRole = () => {};
    if (supabase && user) {
      checkRole = () => {
        void supabase?.rpc("is_moderator").then(({ data, error }) => {
          if (active) setMod(!error && data === true);
        });
      };
      checkRole();
      roleTimer = window.setInterval(checkRole, 60000);
      window.addEventListener("focus", checkRole);
      void supabase.rpc("own_contributions").then(({ data, error }) => {
        if (active) {
          if (error) setError("Impossibile caricare i contributi riservati.");
          else setMine((data as Contribution[]) || []);
        }
      });
    }
    return () => {
      active = false;
      clearInterval(roleTimer);
      window.removeEventListener("focus", checkRole);
    };
  }, [user, revision]);
  async function login() {
    if (!supabase) {
      setError("Configura Supabase per abilitare l’accesso.");
      return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) setError("Accesso non riuscito: " + error.message);
  }
  const news = newsFeed.items;
  const reports = reportsFeed.items;
  const loadMore = (feed: typeof newsFeed) =>
    feed.hasMore && (
      <button className="outline" disabled={feed.loading} onClick={feed.more}>
        {feed.loading ? "Caricamento…" : "Carica altri contenuti"}
      </button>
    );
  const empty = (label: string) => (
    <div className="empty-state">
      <Radar size={30} />
      <h3>{loading ? "Caricamento…" : label}</h3>
      <p>
        {supabase
          ? "Le segnalazioni sono pubblicate subito; notizie e post dopo la revisione editoriale."
          : "Il servizio è in configurazione. Nessun contenuto reale è stato ancora pubblicato."}
      </p>
      <button className="text-button" onClick={() => go("submit")}>
        Invia un contributo <ArrowRight size={15} />
      </button>
    </div>
  );
  return (
    <>
      <div className="utility">
        <span>INFORMAZIONE CIVICA · LOMBARDIA</span>
        <span>
          <i /> Progetto indipendente · Non è un servizio di emergenza
        </span>
      </div>
      <header>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go("home");
          }}
        >
          <span className="brand-mark">
            <Radar size={29} />
          </span>
          <span>
            LOMBARDIA
            <span className="brand-second">
              RADAR<span className="brand-dot">.</span>
            </span>
          </span>
        </a>
        <nav aria-label="Navigazione principale" className={menu ? "open" : ""}>
          {nav.map(([p, label]) => (
            <button
              className={page === p ? "active" : ""}
              key={p}
              onClick={() => go(p)}
            >
              {label}
            </button>
          ))}
          {!user && (
            <button className="mobile-auth" onClick={() => void login()}>
              Accedi con Google
            </button>
          )}
          {user && (
            <button className="mobile-auth" onClick={() => go("mine")}>
              I miei contributi
            </button>
          )}
          {mod && (
            <button
              className={page === "moderation" ? "active" : ""}
              onClick={() => go("moderation")}
            >
              Moderazione
            </button>
          )}
        </nav>
        <div className="header-actions">
          {user ? (
            <>
              <button className="login" onClick={() => go("mine")}>
                I miei contributi
              </button>
              <button
                className="icon-button"
                aria-label="Esci"
                onClick={() => void supabase?.auth.signOut()}
              >
                <LogOut size={18} />
              </button>
            </>
          ) : (
            <button className="login" onClick={() => void login()}>
              Accedi <ArrowUpRight size={15} />
            </button>
          )}
          <button className="primary small" onClick={() => go("submit")}>
            <Plus size={17} /> Segnala
          </button>
          <button
            className="mobile-menu icon-button"
            aria-label={menu ? "Chiudi menu" : "Apri menu"}
            aria-expanded={menu}
            onClick={() => setMenu((v) => !v)}
          >
            {menu ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      <main>
        {(error || feedError) && (
          <div role="alert" className="error">
            {error || feedError}{" "}
            <button
              onClick={() => {
                setError("");
                load();
              }}
            >
              Riprova
            </button>
          </div>
        )}
        {page === "home" && (
          <>
            <section className="civic-intro">
              <div className="eyebrow">OSSERVATORIO CIVICO INDIPENDENTE</div>
              <h1>Notizie e segnalazioni dal territorio</h1>
              <p>
                Informazioni locali per chi vive in Lombardia. Le segnalazioni
                sono visibili subito, anche senza revisione. Notizie e post sono
                pubblicati dopo la moderazione.
              </p>
              <div className="service-status">
                <span
                  className={supabase ? "status-dot" : "status-dot pending"}
                />
                {supabase ? "Servizio collegato" : "Servizio in configurazione"}
                <span className="status-date">
                  {new Intl.DateTimeFormat("it-IT", {
                    dateStyle: "full",
                    timeZone: "Europe/Rome",
                  }).format(new Date(now))}
                </span>
              </div>
            </section>
            <section className="news-section">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">NOTIZIE LOCALI</div>
                  <h2>
                    In primo piano<span className="orange-dot">.</span>
                  </h2>
                </div>
                <span className="section-detail">
                  Notizie a cura della redazione
                </span>
              </div>
              {news.length ? (
                <div className="news-grid">
                  {news.map((c) => (
                    <Card key={c.id} c={c} onAbuse={setAbuse} />
                  ))}
                </div>
              ) : (
                empty("Nessuna notizia pubblicata")
              )}
              {loadMore(newsFeed)}
            </section>
            <section className="map-section">
              <div className="map-copy">
                <div className="eyebrow">SEGNALAZIONI · ULTIME 24 ORE</div>
                <h2>Mappa del territorio</h2>
                <p>
                  Esplora le segnalazioni pubbliche, scegli una categoria e un
                  intervallo di tempo.
                </p>
                <div className="map-stat">
                  <span>{reports.length.toString().padStart(2, "0")}</span>
                  <div>
                    segnalazioni caricate<small>con i filtri attuali</small>
                  </div>
                </div>
                <button className="primary" onClick={() => go("map")}>
                  Apri la mappa <ArrowUpRight size={17} />
                </button>
                <p className="map-disclaimer">
                  <Info size={15} /> Nessuna segnalazione non significa assenza
                  di rischi.
                </p>
              </div>
              <div className="map-preview">
                <RadarMap items={reports} />
                {loadMore(reportsFeed)}
                <div className="map-caption">
                  <span>
                    <i /> Solo contributi pubblici
                  </span>
                  <span>Posizioni approssimative</span>
                </div>
              </div>
            </section>
            <section className="community-banner">
              <div className="community-icon">
                <MessageSquare size={33} />
              </div>
              <div>
                <h2>Bacheche di quartiere</h2>
                <p>
                  Post e iniziative locali, suddivisi per comune e zona e
                  sottoposti a moderazione.
                </p>
              </div>
              <button className="outline" onClick={() => go("boards")}>
                Consulta le bacheche <ArrowUpRight size={17} />
              </button>
            </section>
          </>
        )}
        {page === "map" && (
          <section className="full-map-page">
            <div className="eyebrow">LEGGERE IL TERRITORIO</div>
            <div className="section-heading">
              <h1>
                Mappa delle segnalazioni<span className="orange-dot">.</span>
              </h1>
              <span className="pill">{reports.length} caricate</span>
            </div>
            <p className="lead">
              Solo contributi pubblici. Le posizioni sono approssimative.
            </p>
            <div className="filters">
              <SlidersHorizontal size={18} />
              <label>
                Categoria
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="all">Tutte le categorie</option>
                  {Object.entries(categories).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Intervallo
                <select value={time} onChange={(e) => setTime(e.target.value)}>
                  <option value="24h">Ultime 24 ore</option>
                  <option value="7d">Ultimi 7 giorni</option>
                  <option value="all">Tutti gli eventi pubblicati</option>
                </select>
              </label>
              <label>
                Comune o zona
                <input
                  value={zone}
                  onChange={(e) => setZone(e.target.value)}
                  placeholder="Cerca una zona"
                />
              </label>
            </div>
            <div className="large-map">
              <RadarMap items={reports} />
            </div>
            <p className="notice">
              Nessuna segnalazione non significa assenza di rischi. Un evento
              escluso dai filtri temporali non è automaticamente risolto.
            </p>
            {reports.length ? (
              <div className="news-grid">
                {reports.map((c) => (
                  <Card c={c} key={c.id} onAbuse={setAbuse} />
                ))}
              </div>
            ) : (
              empty("Nessuna segnalazione con questi filtri")
            )}
            {loadMore(reportsFeed)}
          </section>
        )}
        {page === "boards" && (
          <section className="form-page">
            <div className="eyebrow">POST MODERATI</div>
            <h1>
              Le bacheche dei quartieri<span className="orange-dot">.</span>
            </h1>
            <p className="lead">
              Iniziative, idee e vita di comunità. Ogni post è moderato prima
              della pubblicazione.
            </p>
            <div className="filters">
              <label>
                Cerca comune o quartiere
                <input
                  placeholder="Es. Milano · Isola"
                  value={zone}
                  onChange={(e) => setZone(e.target.value)}
                />
              </label>
              <button className="primary" onClick={() => go("submit")}>
                <Plus size={16} /> Scrivi un post
              </button>
            </div>
            {postsFeed.items.length ? (
              <div className="news-grid">
                {postsFeed.items.map((c) => (
                  <Card key={c.id} c={c} onAbuse={setAbuse} />
                ))}
              </div>
            ) : (
              empty("Nessun post pubblicato in questa zona")
            )}
            {loadMore(postsFeed)}
          </section>
        )}
        {page === "submit" && (
          <SubmitForm
            moderator={mod}
            loggedIn={Boolean(user)}
            onLogin={() => void login()}
            onDone={() => {
              void load();
              setRevision((r) => r + 1);
            }}
          />
        )}
        {page === "moderation" &&
          (mod ? (
            <Moderation />
          ) : (
            <section className="form-page">
              <h1>Accesso riservato ai moderatori</h1>
            </section>
          ))}
        {page === "mine" && (
          <section className="form-page">
            <div className="eyebrow">IL TUO SPAZIO</div>
            <h1>I miei contributi</h1>
            {mine.length ? (
              mine.map((c) => (
                <article className="my-item" key={c.id}>
                  <span className="pill">
                    {
                      {
                        pending: "In revisione",
                        published: "Pubblicato senza revisione",
                        rejected: "Rifiutato",
                        archived: "Archiviato",
                        approved: "Approvato",
                      }[c.editorial_status]
                    }
                  </span>
                  <h3>{c.title}</h3>
                  <p>{c.description}</p>
                </article>
              ))
            ) : (
              <p className="empty">
                Nessun contributo riservato disponibile. I contributi pubblici
                sono consultabili nelle rispettive sezioni.
              </p>
            )}
          </section>
        )}
      </main>
      <footer>
        <div className="footer-top">
          <div>
            <span className="footer-brand">
              <Radar size={22} /> LOMBARDIA RADAR<span>.</span>
            </span>
            <p>Notizie, segnalazioni e bacheche locali.</p>
          </div>
          <span>Un progetto civico indipendente</span>
        </div>
        <div className="footer-bottom">
          <p>
            <Info size={14} /> Non è un servizio di emergenza. In caso di
            pericolo immediato chiama il <a href="tel:112">112</a>.
          </p>
          <span>Nessuna segnalazione non significa assenza di rischi.</span>
        </div>
        <details className="privacy">
          <summary>Privacy e trasparenza</summary>
          <p>
            Non usiamo analytics, pubblicità o geolocalizzazione delle persone.
            L’accesso Google è gestito da Supabase. La mappa contatta i server
            OpenStreetMap e la protezione anti-abuso contatta Cloudflare. Non
            inviare dati personali di terzi. Prima dell’apertura pubblica, il
            gestore deve pubblicare l’informativa privacy e un recapito per le
            richieste sui dati.
          </p>
        </details>
      </footer>
      {abuse && (
        <Abuse
          id={abuse}
          loggedIn={Boolean(user)}
          onClose={() => setAbuse(null)}
        />
      )}
    </>
  );
}
