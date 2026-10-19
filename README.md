# LOMBARDIA RADAR

Sito civico in italiano, mobile-first, con React, TypeScript, Vite, Supabase e Leaflet. La prima copertura operativa è Milano, con bacheche di quartiere; il nome non implica una copertura completa della Lombardia. Il repository contiene il codice e le istruzioni: non è un servizio già pubblicato o configurato.

**Nessuna segnalazione non significa assenza di rischi.** Il sito non è un servizio di emergenza. Non offre percorsi garantiti sicuri, tracciamento delle persone, foto, video, messaggi privati o classifiche di quartieri pericolosi.

## Attivazione rapida: ordine operativo

1. **Supabase:** crea un progetto Free su [Supabase](https://supabase.com/dashboard), conserva la password DB fuori dal codice, quindi applica la migrazione con i comandi sotto. Copia URL progetto e chiave pubblica da Settings → API in `.env.local`.
2. **Google:** configura il client OAuth e abilita il provider Google in Supabase seguendo la sezione dedicata. Il segreto Google va esclusivamente nella dashboard Supabase.
3. **Cloudflare Pages:** crea un progetto su [Cloudflare](https://dash.cloudflare.com/) con build `npm run build:production` e output `dist`. Conserva il dominio gratuito `NOME.pages.dev` per i passaggi successivi.
4. **Turnstile:** crea un widget per quel dominio, inserisci la site key pubblica tra le variabili Vite e i tre segreti backend elencati sotto nella dashboard Supabase. Distribuisci la funzione `submit`.
5. **Accesso e moderazione:** autorizza il dominio Pages nei redirect OAuth, ridistribuisci il frontend con le variabili impostate, accedi con Google e assegna il primo moderatore dal SQL Editor amministrativo.
6. **Verifica prima dell’apertura:** invia una segnalazione reale pertinente e controlla che sia subito pubblica con etichetta non verificata e non revisionata; verifica che un post di quartiere resti privato fino all’approvazione. Pubblica contatto del gestore e informativa privacy. Non usare eventi di prova nel progetto pubblico.

Finché questi passaggi non sono completati, l’anteprima è navigabile ma non riceve contributi. Non inserire chiavi segrete in chat, nel repository o nelle variabili `VITE_*`.

## Avvio locale

Richiede Node.js 22 LTS e npm. Per il database locale servono Supabase CLI e Docker.

```sh
npm install
cp .env.example .env.local
npm run dev
```

Compilare `.env.local` con URL e chiave pubblica Supabase e site key pubblica Turnstile. Ogni variabile `VITE_*` è leggibile da chi visita il sito. Non inserirvi mai chiavi `service_role`, password del database, segreto OAuth Google o segreto Turnstile. Non committare file `.env.local` o esportazioni del database.

```sh
npm test
npm run test:config
npm run build
npm run preview
```

Il sito non carica dati dimostrativi. Le notizie pubbliche devono provenire da contenuti redazionali reali con fonte. Per una prova completa dei flussi usare due normali utenti distinti e un moderatore in un progetto Supabase di test.

## Controllo della configurazione produzione

```sh
npm run check:config
npm run test:config
npm run build:production
```

`check:config` legge le variabili locali e di ambiente senza stamparne i valori: rifiuta placeholder, URL errati, variabili pubbliche inattese e chiavi segrete riconoscibili. `test:config` verifica il controllo. `build:production` esegue il controllo prima del build; `npm run build` resta disponibile per un'anteprima locale anche senza servizi configurati. Un controllo superato non prova che Google, Turnstile, RLS e backend siano attivi: completare la prova operativa. In questa consegna non è stata configurata né pubblicata alcuna infrastruttura cloud.

## Supabase e Google

1. Creare un progetto **Free** su Supabase. Conservare la password DB in un gestore di password.
2. Eseguire dalla radice del repository `supabase login`, poi `supabase link --project-ref YOUR_PROJECT_REF` e `supabase db push`. Le migrazioni versionate in `supabase/migrations/` sono la fonte dello schema. Per un database locale nuovo usare `supabase start` e `supabase db reset`; reset elimina i dati locali.
3. In Google Cloud creare un client OAuth di tipo Web e la schermata di consenso. Registrare il callback esatto mostrato in Supabase → Authentication → Providers → Google, normalmente `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`. Client ID e Client Secret vanno nella configurazione Google di Supabase, mai nel frontend. Per prove con OAuth in modalità test aggiungere gli account di test nella console Google.
4. In Supabase Authentication → URL Configuration impostare Site URL all'origine di produzione e autorizzare esplicitamente gli URL di ritorno locali e di produzione (`http://localhost:5173/` e `https://YOUR_PROJECT.pages.dev/`). Aggiungere solo le anteprime realmente necessarie, evitando wildcard indiscriminate.
5. Abilitare solo i provider desiderati. Il frontend richiede Google; una configurazione OAuth incompleta impedirà il login, senza concedere privilegi alternativi.

Guida ufficiale: [Google con Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google).

## Turnstile e backend di invio

Creare un widget Turnstile gratuito per gli hostname effettivi (locale e produzione separati). Il widget usa l'azione `submit`. La site key va nel frontend; il segreto resta in Supabase Edge Functions. Per la produzione impostare questi segreti da dashboard Supabase, senza committarli né incollarli nella cronologia shell:

| Segreto backend | Valore |
| --- | --- |
| `TURNSTILE_SECRET_KEY` | Segreto del widget produzione |
| `APP_ORIGIN` | Origine esatta, es. `https://YOUR_PROJECT.pages.dev`, senza slash finale |
| `TURNSTILE_HOSTNAME` | Solo hostname, es. `YOUR_PROJECT.pages.dev` |

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` sono disponibili nel runtime Edge Supabase. Il service role bypassa RLS: non distribuirlo mai al browser. Pubblicare la funzione con:

```sh
supabase functions deploy submit
```

Il client invia a `submit` il JWT dell'utente e `{ action: 'contribution' | 'abuse', turnstileToken, data }`. Il backend verifica la sessione con Supabase, chiama Siteverify, controlla hostname e azione e poi usa RPC riservate al service role. Non basta mostrare il widget: token mancante, scaduto, riutilizzato o non valido deve bloccare l'invio. I token Turnstile sono monouso e durano cinque minuti: [verifica server ufficiale](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).

I limiti sono atomici nel database, per account e ora: 5 contributi e 10 segnalazioni di abuso. Il login è richiesto anche per gli abusi. Un utente non può chiamare direttamente le RPC di invio, scegliere un altro autore o inserire una riga approvata. Il limite per account non impedisce da solo la creazione coordinata di più account: Turnstile e moderazione restano necessari. Il backend accetta una sola origine esatta; per sviluppo usare una configurazione/progetto di test separato, non allargare la produzione a origini arbitrarie.

## Primo moderatore e test di autorizzazione

Far accedere il futuro moderatore con Google, leggere il suo UUID da Supabase Authentication → Users, poi eseguire **solo nel SQL Editor amministrativo**:

```sql
insert into public.moderators(user_id)
values ('UUID_UTENTE_GIA_AUTENTICATO');
```

Non usare metadati modificabili dall'utente per assegnare il ruolo. Per revocarlo, eliminare la relativa riga dalla stessa tabella con accesso amministrativo. Non esporre questa operazione in un endpoint pubblico.

Il pannello usa `moderate_contribution` per approvare, correggere, rifiutare, unire e archiviare, con registro delle modifiche. `contributions` consente al pubblico righe `published` o `approved` e soli campi pubblici, all'autore le proprie righe, ai moderatori la coda. Identificativi degli autori, abusi, registro e limiti non sono dati pubblici.

Eseguire i test SQL su un database **locale di prova** prima del deploy:

```sh
supabase start
supabase db reset
supabase test db
deno test supabase/functions/submit/handler_test.ts
```

I test devono coprire anonimo, due utenti e moderatore: isolamento dei privati, impossibilità di autopromozione/inserimento diretto, autorizzazione della moderazione, fonte obbligatoria per riscontro e notizie, duplicati e limiti. Il reset distrugge il database locale: non usarlo come comando operativo sul progetto pubblico. I test frontend con `npm test` non sostituiscono i test RLS reali. Verificare inoltre con account di test il percorso OAuth → invio Turnstile → segnalazione pubblicata subito; per post/notizie verificare coda → approvazione → lettura pubblica e i rifiuti di token errati e richieste oltre limite.

## Regole editoriali e privacy

L'approvazione editoriale è separata dallo stato dei fatti: **non verificata**, **con riscontro** con fonte, **smentita**. Le segnalazioni (`report`) diventano immediatamente pubbliche nello stato editoriale `published`, senza revisione e con stato fattuale iniziale non verificata. Il moderatore può successivamente correggerle, approvarle, rifiutarle, unirle o archiviarle. `approved` indica una revisione editoriale, non una certificazione di verità. Post di quartiere (`post`) e notizie redazionali (`news`) iniziano invece in `pending` e diventano pubblici solo dopo approvazione. I voti non verificano eventi. L'accesso è applicato dal database con RLS e funzioni controllate.

La finestra delle ultime 24 ore usa l'ora dell'evento, non l'ultimo aggiornamento. Un evento vecchio esce dalla vista senza diventare risolto. Archiviazione, rifiuto e unione di duplicati sono operazioni editoriali distinte dalla verifica.

Usare punti approssimativi, senza geolocalizzare chi scrive. Non inserire nomi di persone, targhe, recapiti privati o indirizzi domestici nelle descrizioni; rimuovere tempestivamente questi contenuti e gestire le segnalazioni di abuso. Prima dell'apertura pubblica definire contatto del gestore, informativa privacy, gestione delle richieste di cancellazione e tempi di conservazione anche per contributi rifiutati, abusi e log. Le richieste di tile, autenticazione e Turnstile coinvolgono i rispettivi fornitori: descriverlo nell'informativa.

## Prime notizie redazionali reali

Il file `editorial/2026-10-20-prime-notizie.sql` è un pacchetto editoriale opzionale con notizie reali e fonti, separato dalle migrazioni e senza seed automatici. Prima di eseguirlo leggere ogni fonte, verificare date e attualità e rivedere i riassunti. Eseguirlo esclusivamente nel SQL Editor amministrativo del progetto scelto, seguendo i commenti del file. Non è necessario per avviare il sito e non va copiato nella cartella `public/`. La presenza di una fonte non trasforma automaticamente una segnalazione in fatto verificato.

## Cloudflare Pages

1. Creare un progetto Pages nel piano gratuito collegando il repository oppure caricando il build locale. Questo passaggio pubblica il sito: eseguirlo solo sull'account e dominio scelti dal gestore.
2. Impostare comando di build `npm run build:production`, cartella di output `dist`, Node.js 22. Impostare in Pages le stesse tre variabili pubbliche di `.env.example` per l'ambiente di produzione; le anteprime devono usare un progetto Supabase separato se contengono prove.
3. Configurare prima gli hostname Turnstile e gli URL OAuth del dominio Pages, poi eseguire il deploy. Per cambiare una variabile Vite occorre un nuovo build.
4. Controllare da mobile login, pubblicazione immediata delle segnalazioni, revisione dei post, approvazione e lettura pubblica; verificare che un secondo utente non legga i contributi privati del primo. Non distribuire SQL o segreti nella cartella `public/`.

Il frontend è statico; le operazioni privilegiate sono eseguite nel backend Supabase, non in Pages Functions. Nessuna API AI, SMS o servizio a pagamento è necessario. Usare il dominio gratuito `pages.dev` evita il costo di un dominio personalizzato.

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
