-- NOTIZIE REALI, NON DATI DIMOSTRATIVI. Non eseguito automaticamente.
-- Fonti consultate il 20 ottobre 2026. Rileggere gli annunci prima dell'import.
-- Eseguire nel SQL Editor amministrativo del progetto Supabase dopo la migrazione.
-- L'utente ha richiesto esplicitamente la pubblicazione delle notizie curate.
-- Il riscontro riguarda l'annuncio del programma: non attesta che l'evento si sia svolto.
-- Ripetere questo file non duplica né sovrascrive le notizie già importate.
begin;
with inserted as (
 insert into public.contributions
 (id,author_id,kind,title,description,zone,category,latitude,longitude,event_at,testimony,source_url,editorial_status,fact_status,fact_source_url)
 values
 ('946223c0-dce0-4ac7-b6df-a6663b4dc001',null,'news',
  'Gorla: il 20 ottobre la commemorazione dei Piccoli Martiri',
  'Il Comune di Milano annuncia per martedì 20 ottobre, alle 10, la cerimonia presso il monumento in piazza dei Piccoli Martiri di Gorla. Alle 9 è prevista una messa nella parrocchia di via Asiago. Il calendario comprende anche iniziative teatrali e visite nei giorni successivi. Il riscontro riguarda il programma annunciato: prima di partecipare consulta la fonte per eventuali variazioni.',
  'Milano · Gorla','eventi',null,null,'2026-10-20T10:00:00+02:00','received',
  'https://www.comune.milano.it/w/milano-%C3%A8-memoria.-gli-appuntamenti-in-citt%C3%A0-per-ricordare-la-strage-dei-piccoli-martiri-di-gorla',
  'approved','corroborated',
  'https://www.comune.milano.it/w/milano-%C3%A8-memoria.-gli-appuntamenti-in-citt%C3%A0-per-ricordare-la-strage-dei-piccoli-martiri-di-gorla'),
 ('946223c0-dce0-4ac7-b6df-a6663b4dc002',null,'news',
  'Visite gratuite a Gorla: prenotazione obbligatoria per gli appuntamenti del 20 ottobre',
  'Il Municipio 2 presenta un percorso guidato sulla storia di Gorla. Per martedì 20 ottobre sono annunciati un incontro per adulti alle 15 e uno per famiglie alle 17. La partecipazione è gratuita con prenotazione; ciascun gruppo è limitato a 25 persone. La pagina del Municipio indica le modalità di iscrizione. Il riscontro conferma l’annuncio, non la disponibilità attuale dei posti.',
  'Milano · Gorla','eventi',null,null,'2026-10-20T15:00:00+02:00','received',
  'https://www.comune.milano.it/fr/web/municipio-2/w/gorla-sui-passi-della-memoria',
  'approved','corroborated',
  'https://www.comune.milano.it/fr/web/municipio-2/w/gorla-sui-passi-della-memoria')
 on conflict(id) do nothing
 returning *
)
insert into public.moderation_log(moderator_id,contribution_id,action,before_data,after_data,note)
select null,id,'editorial_import','{}'::jsonb,to_jsonb(inserted),
 'Import amministrativo di riassunto originale da fonte istituzionale, su richiesta del gestore. Fonte consultata il 20 ottobre 2026; riscontro limitato al programma annunciato.'
from inserted;
commit;
