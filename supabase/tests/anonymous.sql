begin;
create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to anon,authenticated;
set local search_path=public,extensions;
select plan(17);
insert into auth.users(id,is_anonymous) values
 ('40000000-0000-0000-0000-000000000001',true),
 ('40000000-0000-0000-0000-000000000002',true);
-- Deliberate administrator mistake: anonymous users must remain unable to moderate.
insert into public.moderators values('40000000-0000-0000-0000-000000000001');
select lives_ok($$select public.submit_contribution('40000000-0000-0000-0000-000000000001','{"kind":"report","title":"Prova anonima","description":"Descrizione anonima di prova","zone":"Milano","category":"altro","event_at":"2026-10-20T12:00:00Z","testimony":"direct"}')$$,'Server accepts anonymous report');
select is((select editorial_status::text from public.contributions where author_id='40000000-0000-0000-0000-000000000001' and kind='report'),'published','Anonymous reports preserve publication status');
select lives_ok($$select public.submit_contribution('40000000-0000-0000-0000-000000000001','{"kind":"post","title":"Post anonimo","description":"Descrizione anonima bacheca","zone":"Milano","category":"altro","event_at":"2026-10-20T12:00:00Z","testimony":"received"}')$$,'Server accepts anonymous post');
select is((select editorial_status::text from public.contributions where author_id='40000000-0000-0000-0000-000000000001' and kind='post'),'pending','Anonymous posts preserve review status');
select throws_ok($$select public.submit_contribution('40000000-0000-0000-0000-000000000001','{"kind":"news"}')$$,'P0001','Solo moderatori','Accidental moderator cannot create news');
set local role authenticated;
set local request.jwt.claim.sub='40000000-0000-0000-0000-000000000001';
set local request.jwt.claims='{"sub":"40000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":true}';
select ok(not public.is_moderator(),'Anonymous Auth user is not moderator');
select is((select count(*)::integer from public.moderators),0,'Accidental role row is not accessible');
select is((select count(*)::integer from public.own_contributions()),2,'Anonymous user reads own submissions');
select throws_ok($$select public.moderate_contribution('00000000-0000-0000-0000-000000000000','approve')$$,'42501','Accesso negato','Anonymous user cannot moderate');
select ok(not has_function_privilege(current_user,'public.submit_contribution(uuid,jsonb)','EXECUTE'),'Anonymous Auth cannot bypass submit endpoint');
select ok(not has_table_privilege(current_user,'public.contributions','INSERT'),'Anonymous Auth cannot insert directly');
select ok(not has_table_privilege(current_user,'public.moderators','INSERT'),'Anonymous Auth cannot promote itself');
set local request.jwt.claim.sub='40000000-0000-0000-0000-000000000002';
set local request.jwt.claims='{"sub":"40000000-0000-0000-0000-000000000002","role":"authenticated","is_anonymous":true}';
select is((select count(*)::integer from public.contributions where kind='post'),0,'Second anonymous user cannot read private post');
select is((select count(*)::integer from public.own_contributions()),0,'Second anonymous user cannot read first own submissions');
select is((select count(*)::integer from public.abuse_reports),0,'Anonymous user cannot read abuse queue');
select is((select count(*)::integer from public.moderation_log),0,'Anonymous user cannot read audit log');
-- A forged anonymous claim cannot confer or remove the server-owned Auth flag.
set local request.jwt.claim.sub='40000000-0000-0000-0000-000000000001';
set local request.jwt.claims='{"sub":"40000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false}';
select ok(not public.is_moderator(),'Auth table overrides stale or misleading claim');
reset role;
select * from finish();
rollback;
