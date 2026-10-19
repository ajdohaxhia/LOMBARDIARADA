begin;
select plan(9);
insert into auth.users(id) values ('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002'),('10000000-0000-0000-0000-000000000003');
insert into public.moderators values('10000000-0000-0000-0000-000000000003');
insert into public.contributions(id,author_id,kind,title,description,zone,category,event_at,testimony) values
('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','post','Test segnalazione','Descrizione di prova privata','Milano','altro',now(),'direct'),
('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','post','Altra segnalazione','Descrizione di prova privata','Milano','altro',now(),'received');
set local role anon;
select is((select count(*)::integer from public.contributions),0,'Pending invisible to anonymous');
reset role;
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';
set local role authenticated;
select is((select count(*)::integer from public.contributions),1,'Author sees own pending only');
select throws_ok($$update public.contributions set editorial_status='approved'$$,'42501',null,'Cannot directly publish');
reset role;
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000003';
set local role authenticated;
select is((select count(*)::integer from public.contributions),2,'Moderator sees queue');
select lives_ok($$select public.moderate_contribution('20000000-0000-0000-0000-000000000001','approve')$$,'Moderator approves');
select is((select fact_status::text from public.contributions where id='20000000-0000-0000-0000-000000000001'),'unverified','Editorial approval does not verify facts');
select throws_ok($$select public.moderate_contribution('20000000-0000-0000-0000-000000000001','correct','{"fact_status":"corroborated"}')$$,'23514',null,'Corroboration requires source');
select is((select count(*)::integer from public.moderation_log),1,'Approval audited atomically');
reset role;
set local request.jwt.claim.sub='';
set local role anon;
select is((select count(*)::integer from public.contributions),1,'Public sees approved only');
reset role;
select * from finish();
rollback;
