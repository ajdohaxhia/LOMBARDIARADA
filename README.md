# LOMBARDIA RADAR

Frontend React/TypeScript/Vite su **Cloudflare Pages**; autenticazione, PostgreSQL/RLS e funzione `submit` su **Supabase**; verifica anti-abuso **Cloudflare Turnstile** e mappa Leaflet/OpenStreetMap. Nessuna Pages Function, Worker, API AI, SMS o servizio a pagamento è richiesto.

**Stato della consegna:** codice verificato localmente, nessun deploy o controllo dei tuoi progetti cloud effettuato. Avere gli account pronti non imposta automaticamente variabili, database, Google OAuth o Turnstile. Non sono presenti `.env` reali, progetti Supabase collegati o dati dimostrativi caricati dall’app.

Come richiesto nell’ultima modifica, le **segnalazioni sono pubbliche subito**, senza revisione preventiva e con fatti inizialmente **non verificati**. Post e notizie restano privati in revisione. Revisione editoriale e verifica dei fatti restano separate.

**Nessuna segnalazione non significa assenza di rischi.** Non è un servizio di emergenza. In caso di pericolo immediato: 112.

## 1. Valori da raccogliere e destinazione esatta

Non incollare segreti in chat o in Git. `.env.example` elenca tutti i nomi effettivamente letti dal codice; le sezioni backend sono commentate intenzionalmente. Non caricare l’intero template in Pages.

| Nome esatto | Dove trovare il valore | Dove inserirlo | Visibilità |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | Supabase → progetto → Connect / Settings → API: Project URL | Locale: `.env.local`; Pages → progetto → Settings → Variables and Secrets (o Environment variables) → Production | Pubblica |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Settings → API Keys: **Publishable key** `sb_publishable_…`, oppure Legacy API Keys → **anon** | Stesse due destinazioni del valore precedente | Pubblica; mai `secret`/`service_role` |
| `VITE_TURNSTILE_SITE_KEY` | Cloudflare → Turnstile → widget produzione → **Site key** | `.env.local` per un widget locale separato; Pages → Production per widget produzione | Pubblica |
| `TURNSTILE_SECRET_KEY` | Stesso widget Turnstile → **Secret key** | **Supabase → Edge Functions → Secrets**, Key/Value → Save | Segreto backend |
| `APP_ORIGIN` | Origine HTTPS effettiva di Pages, es. `https://NOME.pages.dev` | Supabase → Edge Functions → Secrets | Config backend, nessuno slash finale |
| `TURNSTILE_HOSTNAME` | Solo dominio, es. `NOME.pages.dev` | Supabase → Edge Functions → Secrets | Config backend, senza protocollo/porta/percorso |
| `SUPABASE_URL` | Fornita automaticamente da Supabase hosted | Nessuna azione: il runtime Edge la fornisce | Backend |
| `SUPABASE_SERVICE_ROLE_KEY` | Fornita automaticamente da Supabase hosted | Nessuna azione: non tentare di creare un segreto `SUPABASE_*` | Segreto privilegiato, mai frontend/Pages |

Il nome `VITE_SUPABASE_ANON_KEY` rimane per compatibilità: accetta anche la nuova chiave pubblica publishable. **Non usare una chiave privilegiata per far sparire un errore RLS.** I due valori Google OAuth non sono variabili lette da Vite o dalla funzione: vanno soltanto nel provider Google di Supabase (sezione 4). `NODE_VERSION=22` è una variabile di build Pages, non dell’app.

Documentazione: [chiavi Supabase](https://supabase.com/docs/guides/getting-started/api-keys), [variabili Edge e valori automatici](https://supabase.com/docs/guides/functions/secrets).

## 2. Preparare Cloudflare Pages e il dominio

Cloudflare → **Workers & Pages → Create application → Pages → Connect to Git**. Seleziona GitHub e il repository `ajdohaxhia/LOMBARDIARADA`.

| Impostazione Pages | Valore |
| --- | --- |
| Production branch | `codex/lombardia-radar` (branch esistente; non presumere `main`) |
| Framework preset | Vite; in alternativa None con gli stessi parametri manuali |
| Root directory | Radice del repository (campo vuoto) |
| Build command | `npm run build:production` |
| Build output directory | `dist` |
| Build environment variable | `NODE_VERSION` = `22` |
| Production variables | **Solo le tre `VITE_*`** della tabella |

Scegli un nome progetto e annota l’hostname Pages previsto. Il nome effettivo viene confermato da Cloudflare dopo il deploy: se differisce, aggiorna Turnstile, i due valori backend dell’origine e gli URL OAuth. Nessun dominio viene prenotato da questo README. Non distribuire prima di aver completato i passaggi seguenti; se il primo build parte troppo presto, lascialo fallire e riprovalo a configurazione completa, senza rimuovere `check:config`.

Le variabili Vite vengono incorporate nel bundle: dopo ogni modifica occorre un nuovo build/deploy. Non assegnare segreti Supabase o Turnstile a Pages, neppure con visibilità “Secret”: il backend gira su Supabase. Disabilita le anteprime non necessarie; per provarle usa un progetto Supabase e un widget separati. Il backend accetta una sola origine esatta e non autorizza automaticamente gli URL delle preview.

`public/_headers` viene incluso in `dist`: imposta CSP, protezioni iframe, disabilitazione camera/microfono/geolocalizzazione e Referrer-Policy compatibile con OSM. La CSP permette il dominio standard `*.supabase.co`; questa guida non usa domini Supabase personalizzati. Non serve un `wrangler.toml`: il sito Pages è statico e le impostazioni sopra sono quelle operative.

Fonti: [integrazione Git](https://developers.cloudflare.com/pages/get-started/git-integration/), [build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/), [versione Node](https://developers.cloudflare.com/pages/configuration/build-image/).

## 3. Supabase: migrazioni SQL e ordine

Seleziona il progetto **Free** corretto. Per la prima installazione il database applicativo deve essere nuovo. C’è **una sola migrazione**, da applicare una sola volta:

1. `supabase/migrations/202610190001_radar.sql` — enum, tabelle, indici, RLS, ruoli protetti, RPC invio/moderazione, audit e limiti atomici.

Metodo consigliato, dalla radice del repository con Supabase CLI installata:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase migration list
supabase db push --dry-run
supabase db push
supabase migration list
```

`YOUR_PROJECT_REF` è il riferimento progetto mostrato nella dashboard; non è il nome del sito. Verifica progetto e lista prima di `db push`; inserisci la password database solo nel prompt sicuro della CLI. Dopo il push la migrazione deve apparire applicata anche in remoto. Se la CLI manca, installala seguendo la [guida ufficiale](https://supabase.com/docs/guides/local-development/cli/getting-started).

Alternativa senza CLI per lo schema: Supabase → **SQL Editor → New query**, incolla il file completo della migrazione ed eseguilo una volta. Se tabelle o tipi esistono già, fermati e controlla cosa è stato applicato: non cancellare il database e non rilanciare alla cieca. Questo metodo non registra la storia nella CLI. Se poi passi alla CLI, dopo aver verificato che lo schema corrisponda al file, allinea il registro con `supabase migration repair 202610190001 --status applied`; questo comando registra la versione, non applica lo SQL.

**Non applicare in produzione** `supabase/tests/*.sql`: contengono fixture isolate per le prove. Il file `editorial/2026-10-20-prime-notizie.sql` contiene annunci reali datati, non è una migrazione, non è un seed automatico e non serve al lancio. Lascialo escluso finché le fonti e l’attualità non sono state rivalutate.

## 4. Google OAuth e URL di ritorno

1. Supabase → **Authentication → Sign In / Providers → Google**: copia il callback del progetto, normalmente `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`.
2. Google Cloud Console → **Google Auth Platform / APIs & Services → Credentials**: configura schermata di consenso e client OAuth di tipo **Web application**. In **Authorized redirect URIs** inserisci il callback Supabase del punto 1, non il dominio Pages. Se richieste, le **Authorized JavaScript origins** sono l’origine Pages e l’origine locale usata.
3. Copia **Client ID** e **Client Secret** nei corrispondenti campi del provider Google di Supabase, abilita il provider e salva. Nessuno dei due va nelle variabili Vite. In modalità Google Testing aggiungi il tuo account agli utenti di test; per accesso pubblico completa la pubblicazione della schermata di consenso secondo i requisiti della console Google.
4. Supabase → **Authentication → URL Configuration**: **Site URL** = `https://NOME.pages.dev`; tra **Redirect URLs** aggiungi esattamente `https://NOME.pages.dev` (origine usata dal codice) e, solo per sviluppo, `http://localhost:5173`. Non autorizzare wildcard generiche.

Fonte: [Google OAuth Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google), [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

## 5. Turnstile e funzione backend separata

Cloudflare → **Turnstile → Add widget**: scegli il widget Managed e consenti l’hostname effettivo `NOME.pages.dev`, senza `https://`. Usa un widget separato per localhost. Copia la **Site key** pubblica in Pages e la **Secret key** in Supabase → **Edge Functions → Secrets**. Nella stessa pagina inserisci `APP_ORIGIN` e `TURNSTILE_HOSTNAME` dalla tabella. Non usare le chiavi di test Cloudflare in produzione.

Pubblica la funzione completa, dalla radice del repository:

```sh
supabase functions deploy submit
```

La CLI distribuisce `supabase/functions/submit/index.ts` e la dipendenza locale `handler.ts`. Non incollare solo `index.ts` in un editor remoto senza `handler.ts`. L’endpoint diventa `https://YOUR_PROJECT_REF.supabase.co/functions/v1/submit`; il frontend lo individua tramite Supabase, senza un’ulteriore variabile.

`supabase/config.toml` contiene già `[functions.submit] verify_jwt = false`. Mantieni questa impostazione: disabilita il controllo legacy del gateway, **non** l’autenticazione applicativa. La funzione controlla il Bearer token con `auth.getUser` prima di usare il client privilegiato. Se modifichi le opzioni JWT dalla dashboard della funzione, non riattivare il controllo legacy senza adattare l’integrazione.

Flusso implementato: origine esatta → autenticazione server → corpo limitato a 20.000 byte → verifica Turnstile Siteverify (`success`, hostname, azione `submit`) → campi ammessi → RPC di invio riservata al service role. Limiti atomici: **5 contributi/ora/account**, **10 abusi/ora/account**. Il client non sceglie autore, ruolo, stato editoriale o riscontro fattuale. Il token Turnstile è monouso; il widget viene rinnovato dopo ciascun tentativo.

Non ci sono percorsi di successo simulati nel codice distribuito. I mock sono soltanto nei test e non vengono importati dall’entrypoint Vite o dall’entrypoint Edge. Le richieste senza configurazione, autenticazione o verifica falliscono.

Fonti: [deploy Edge](https://supabase.com/docs/guides/functions/deploy), [Siteverify](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/), [chiavi di test](https://developers.cloudflare.com/turnstile/troubleshooting/testing/).

## 6. Assegnare al proprio account il ruolo di moderatore

Dopo il primo deploy, apri il sito e accedi con Google una volta. In Supabase → **Authentication → Users**, trova il tuo account e copia il suo **User UID**. Poi, **solo nel SQL Editor amministrativo**, sostituisci l’UUID e lancia:

```sql
insert into public.moderators(user_id)
values ('UUID_DEL_TUO_ACCOUNT')
on conflict (user_id) do nothing;
```

La chiave esterna richiede che l’utente esista già. Per controllare l’assegnazione:

```sql
select user_id from public.moderators
where user_id = 'UUID_DEL_TUO_ACCOUNT';
```

Ricarica il sito o esci e rientra: deve comparire **Moderazione** (il ruolo viene ricontrollato anche al focus e ogni minuto). Per revocare il ruolo usa `delete from public.moderators where user_id = 'UUID_DEL_TUO_ACCOUNT';` nel SQL Editor. Non assegnare il ruolo attraverso `user_metadata`, browser o chiave pubblica: RLS e privilegi impediscono l’autopromozione.

## 7. Verifiche locali e prova cloud finale

Node.js 22 per il build di produzione. Dalla radice:

```sh
npm ci
npm test
npm run test:config
deno test supabase/functions/submit/handler_test.ts
deno check supabase/functions/submit/index.ts
npm audit
npm run build
```

Per anteprima locale, crea `.env.local` con le sole tre variabili pubbliche e avvia `npm run dev`. Per preparare il bundle destinato a Pages, dopo aver impostato valori **reali**:

```sh
npm run check:config
npm run build:production
```

Il controllo rifiuta placeholder, site key Turnstile di prova, URL non validi e chiavi privilegiate riconoscibili; non stampa valori. Un successo del controllo non prova che OAuth, segreti, schema o domini siano corretti. Non usare valori inventati per forzare un build di produzione.

Per RLS con ambiente Supabase locale completo occorrono Docker e Supabase CLI:

```sh
supabase start
supabase db reset
supabase test db
```

I file SQL di test predispongono pgTAP; usano utenti/fixture solo dentro transazioni annullate. `db reset` distrugge i dati locali: non è un comando da applicare al progetto pubblico.

**Controlli eseguiti il 20 ottobre 2026:** build Vite/TypeScript riuscito; 49 test frontend, 7 test configurazione e 15 test Deno superati; audit npm con zero vulnerabilità. `build:production` si arresta correttamente perché in questo workspace non sono ancora presenti le tre variabili pubbliche reali. Le prove RLS eseguite su PostgreSQL isolato usano uno schema Auth locale e helper compatibili con pgTAP: non equivalgono a un test effettuato sul tuo progetto Supabase. L’ambiente Supabase completo e il percorso Google/Turnstile reali restano da verificare dopo la configurazione.

Dopo **Save and Deploy** su Pages, svolgi questi controlli da browser con account di prova e progetto Supabase di test, senza pubblicare eventi inventati nel progetto pubblico:

- Google apre il consenso e riporta al dominio Pages; la sessione resta attiva dopo un ricaricamento.
- Una segnalazione pertinente diventa `published`, senza revisione e **non verificata**; un post resta `pending` e invisibile al secondo utente e all’anonimo.
- Il moderatore legge la coda, corregge/approva/rifiuta/unisce/archivia. Le modifiche generano audit; una correzione obsoleta viene rifiutata.
- Da sessione anonima non si leggono bozze, autori, abusi o registro; una chiave pubblica non scrive direttamente nelle tabelle e non assegna ruoli.
- Token Turnstile mancante, scaduto, già usato, con hostname/azione errati impediscono l’invio; oltre il limite orario il backend risponde 429. Guarda **Edge Functions → submit → Logs**, senza stampare token o chiavi.
- Dopo il deploy `dist` non contiene SQL, `.env`, fixture o codice test; l’attribuzione OSM è visibile da mobile e la console non segnala blocchi CSP della mappa/Turnstile.

Questi controlli cloud non sono dichiarati superati finché non vengono eseguiti sui servizi reali. Prima dell’apertura pubblica inserisci contatto del gestore e informativa privacy: nessun tracciamento persone, foto/video, messaggistica privata, classifiche di pericolosità o percorsi garantiti sicuri. La finestra 24 ore dipende dall’ora dell’evento; un evento vecchio non diventa automaticamente risolto.

## Mappe OpenStreetMap

La mappa deve mantenere visibile **© OpenStreetMap contributors**, collegato a [OpenStreetMap copyright](https://www.openstreetmap.org/copyright), anche su schermi piccoli. Il servizio standard è comunitario, senza garanzia di disponibilità. Richiedere soltanto le tile della vista interattiva; niente download massivi, prefetch dell'intera regione, mappe offline o bot che scorrano la mappa. Conservare caching HTTP e Referer del browser; non impostare `Referrer-Policy: no-referrer` per le tile. Pubblicare un contatto del gestore e sostituire il fornitore se l'uso cresce oltre le condizioni consentite. [Tile Usage Policy ufficiale](https://operations.osmfoundation.org/policies/tiles/).

## Piano gratuito e continuità

Verifica delle fonti: 19 ottobre 2026. I limiti possono cambiare: controllarli prima dell'apertura. [Supabase Free](https://supabase.com/pricing) include un database di 500 MB e può sospendere progetti poco attivi dopo una settimana; [Cloudflare Pages Free](https://developers.cloudflare.com/pages/platform/limits/) prevede limiti di build e risorse. Turnstile dispone di un piano gratuito. Non attivare upgrade o risorse a pagamento per superare le quote: ridurre il carico o sospendere gli invii con un avviso chiaro. I piani gratuiti e le tile OSM non garantiscono continuità, coerentemente con la natura non emergenziale del sito.

## Backup ed esportazioni

Supabase raccomanda per Free esportazioni regolari tramite CLI: [documentazione backup](https://supabase.com/docs/guides/platform/backups). Conservare migrazioni nel repository e dump cifrati fuori dal repository e fuori dalla cartella distribuita da Pages. Su un computer amministrativo fidato, con CLI collegata al progetto:

```sh
mkdir -p ../radar-backups
supabase db dump --linked --file ../radar-backups/schema.sql
supabase db dump --linked --data-only --use-copy --file ../radar-backups/data.sql
supabase db dump --linked --role-only --file ../radar-backups/roles.sql
```

I dump possono contenere contributi privati e identificativi: limitare i permessi del filesystem, cifrarli, custodire separatamente le chiavi e stabilire una scadenza. Non inviarli per email né usarli come contenuti dimostrativi. Un export CSV destinato al pubblico deve selezionare soltanto i campi pubblici di contributi con stato `published` o `approved`; non esportare tabelle integrali per questa finalità.

Testare periodicamente il ripristino su un progetto separato, seguendo la [procedura Supabase](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore). Il dump CLI predefinito non equivale a una copia completa di tutto il servizio: verificare separatamente utenti Auth, configurazione Google, redirect, segreti Edge Functions e impostazioni Turnstile. Non importare dati privati in ambienti dimostrativi e non ripristinare sopra produzione senza una procedura verificata.
