begin;
create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to anon,authenticated;
set local search_path=public,extensions;
select plan(11);
insert into auth.users(id) values('40000000-0000-0000-0000-000000000001'),('40000000-0000-0000-0000-000000000002');
insert into public.moderators values('40000000-0000-0000-0000-000000000002');
insert into public.contributions(id,author_id,kind,title,description,zone,category,event_at,testimony,editorial_status) values
('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','report','Test pending','Descrizione privata prova','Milano','altro',now(),'direct','pending'),
('50000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001','report','Test archived','Descrizione privata prova','Milano','altro',now(),'direct','archived'),
('50000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000001','report','Test rejected','Descrizione privata prova','Milano','altro',now(),'direct','rejected'),
('50000000-0000-0000-0000-000000000004','40000000-0000-0000-0000-000000000002','report','Test destination','Descrizione privata prova','Milano','altro',now(),'direct','published');
set local request.jwt.claim.sub='40000000-0000-0000-0000-000000000001';
set local role authenticated;
select is((select count(*)::integer from public.own_contributions()),3,'Own RPC includes pending archived rejected');
select ok(not exists(select 1 from public.own_contributions() where id='50000000-0000-0000-0000-000000000004'),'Own RPC excludes other authors');
select ok(not (select to_jsonb(c) ? 'author_id' from public.own_contributions() c limit 1),'Own projection excludes author identifiers');
reset role;
set local request.jwt.claim.sub='40000000-0000-0000-0000-000000000002';
set local role authenticated;
select is((select count(*)::integer from public.own_contributions()),1,'Moderator own RPC excludes moderation queue');
select lives_ok($$select public.moderate_contribution('50000000-0000-0000-0000-000000000001','correct','{"latitude":45.4642,"longitude":9.1899}')$$,'Moderator can correct coordinates');
select is((select latitude::numeric from public.contributions where id='50000000-0000-0000-0000-000000000001'),45.46::numeric,'Corrected coordinates remain approximate');
select throws_ok($$select public.moderate_contribution('50000000-0000-0000-0000-000000000001','correct','{"fact_status":"debunked"}')$$,'23514',null,'Debunked requires evidence');
select lives_ok($$select public.moderate_contribution('50000000-0000-0000-0000-000000000001','merge','{"merged_into":"50000000-0000-0000-0000-000000000004"}')$$,'Duplicate can be merged into public unreviewed report');
select throws_ok($$select public.moderate_contribution('50000000-0000-0000-0000-000000000001','approve')$$,'23514',null,'Merged row cannot be republished');
select lives_ok(format('select public.moderate_contribution(%L,%L,%L::jsonb)','50000000-0000-0000-0000-000000000004','correct',jsonb_build_object('expected_updated_at',(select updated_at from public.contributions where id='50000000-0000-0000-0000-000000000004'),'title','Titolo corretto')),'Current timestamp allows correction');
select throws_ok($$select public.moderate_contribution('50000000-0000-0000-0000-000000000004','correct','{"expected_updated_at":"2000-01-01T00:00:00Z","title":"Stale title"}')$$,'40001','Contributo aggiornato da un altro moderatore. Ricarica prima di salvare.','Stale moderation cannot overwrite');
reset role;
select * from finish();
rollback;
