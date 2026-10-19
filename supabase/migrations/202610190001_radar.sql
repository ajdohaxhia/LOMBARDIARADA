create extension if not exists pgcrypto;
create type public.editorial_status as enum ('pending','published','approved','rejected','archived');
create type public.fact_status as enum ('unverified','corroborated','debunked');
create table public.moderators (user_id uuid primary key references auth.users(id) on delete cascade);
create function public.is_moderator() returns boolean language sql stable security definer set search_path = '' as $$ select exists(select 1 from public.moderators where user_id=auth.uid()) $$;
create table public.contributions (
 id uuid primary key default gen_random_uuid(), author_id uuid references auth.users(id) on delete set null,
 kind text not null check(kind in ('report','post','news')), title text not null check(char_length(title) between 3 and 160),
 description text not null check(char_length(description) between 10 and 5000), zone text not null check(char_length(zone) between 2 and 120),
 category text not null check(category in ('mobilita','ambiente','servizi','eventi','sicurezza','altro')),
 latitude double precision check(latitude between 44.6 and 46.7), longitude double precision check(longitude between 8.4 and 11.5),
 event_at timestamptz not null, testimony text not null check(testimony in ('direct','received')),
 source_url text check(source_url is null or source_url ~ '^https?://[^[:space:]]+$'),
 editorial_status public.editorial_status not null default 'pending', fact_status public.fact_status not null default 'unverified',
 fact_source_url text check(fact_source_url is null or fact_source_url ~ '^https?://[^[:space:]]+$'),
 merged_into uuid references public.contributions(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(fact_status <> 'corroborated' or fact_source_url is not null), check(kind <> 'news' or source_url is not null),
 check((latitude is null) = (longitude is null)), check(merged_into is null or merged_into <> id)
);
create index contributions_public on public.contributions(event_at desc) where editorial_status in ('published','approved');
create table public.abuse_reports(id uuid primary key default gen_random_uuid(), author_id uuid references auth.users(id) on delete set null, contribution_id uuid not null references public.contributions(id), reason text not null check(char_length(reason) between 10 and 2000), created_at timestamptz not null default now());
create table public.moderation_log(id bigint generated always as identity primary key, moderator_id uuid references auth.users(id), contribution_id uuid not null references public.contributions(id), action text not null, before_data jsonb not null, after_data jsonb not null, note text not null, created_at timestamptz not null default now());
create table public.rate_limits(user_id uuid not null references auth.users(id) on delete cascade, action text not null, window_start timestamptz not null, count integer not null, primary key(user_id,action,window_start));
alter table public.moderators enable row level security;
alter table public.contributions enable row level security;
alter table public.abuse_reports enable row level security;
alter table public.moderation_log enable row level security;
alter table public.rate_limits enable row level security;
create policy moderator_self on public.moderators for select to authenticated using(user_id=auth.uid());
create policy contribution_read on public.contributions for select to anon, authenticated using(editorial_status in ('published','approved') or author_id=auth.uid() or public.is_moderator());
create policy abuse_moderators on public.abuse_reports for select to authenticated using(public.is_moderator());
create policy log_moderators on public.moderation_log for select to authenticated using(public.is_moderator());
revoke all on public.moderators, public.contributions, public.abuse_reports, public.moderation_log, public.rate_limits from anon, authenticated;
grant select on public.contributions to anon, authenticated;
grant select on public.moderators, public.abuse_reports, public.moderation_log to authenticated;
-- Author identity is private even on published reports. Fetch own status via the safe RPC below.
revoke select on public.contributions from anon, authenticated;
grant select(id,kind,title,description,zone,category,latitude,longitude,event_at,testimony,source_url,editorial_status,fact_status,fact_source_url,merged_into,created_at,updated_at) on public.contributions to anon, authenticated;
create function public.consume_limit(p_user uuid,p_action text,p_limit integer) returns void language plpgsql security definer set search_path='' as $$
declare n integer; begin
 insert into public.rate_limits values(p_user,p_action,date_trunc('hour',now()),1)
 on conflict(user_id,action,window_start) do update set count=public.rate_limits.count+1 returning count into n;
 if n>p_limit then raise exception 'Limite di invio raggiunto. Riprova nella prossima ora.' using errcode='P0001'; end if;
end $$;
create function public.submit_contribution(p_user uuid,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; begin
 if p_user is null then raise exception 'Autenticazione richiesta'; end if;
 perform public.consume_limit(p_user,'contribution',5);
 if p_data->>'kind'='news' and not exists(select 1 from public.moderators where user_id=p_user) then raise exception 'Solo moderatori'; end if;
 insert into public.contributions(author_id,kind,title,description,zone,category,latitude,longitude,event_at,testimony,source_url,editorial_status)
 values(p_user,p_data->>'kind',p_data->>'title',p_data->>'description',p_data->>'zone',p_data->>'category',round((p_data->>'latitude')::numeric,2),round((p_data->>'longitude')::numeric,2),(p_data->>'event_at')::timestamptz,p_data->>'testimony',nullif(p_data->>'source_url',''),case when p_data->>'kind'='report' then 'published'::public.editorial_status else 'pending'::public.editorial_status end) returning id into result;
 return result;
end $$;
create function public.submit_abuse(p_user uuid,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; begin
 perform public.consume_limit(p_user,'abuse',10);
 if not exists(select 1 from public.contributions where id=(p_data->>'contribution_id')::uuid and editorial_status in ('published','approved')) then raise exception 'Contributo non disponibile'; end if;
 insert into public.abuse_reports(author_id,contribution_id,reason) values(p_user,(p_data->>'contribution_id')::uuid,p_data->>'reason') returning id into result; return result;
end $$;
create function public.moderate_contribution(p_id uuid,p_action text,p_patch jsonb default '{}'::jsonb,p_note text default '') returns void language plpgsql security definer set search_path='' as $$
declare old_row public.contributions; new_row public.contributions; begin
 if not public.is_moderator() then raise exception 'Accesso negato' using errcode='42501'; end if;
 if p_action not in ('approve','correct','reject','merge','archive') then raise exception 'Azione non valida'; end if;
 if char_length(p_note)>2000 then raise exception 'Nota troppo lunga'; end if;
 select * into strict old_row from public.contributions where id=p_id for update;
 if p_patch ? 'expected_updated_at' and (p_patch->>'expected_updated_at')::timestamptz is distinct from old_row.updated_at then
 raise exception 'Contributo aggiornato da un altro moderatore. Ricarica prima di salvare.' using errcode='40001';
 end if;
 if p_action='merge' then
 if not exists(select 1 from public.contributions where id=(p_patch->>'merged_into')::uuid and id<>p_id and editorial_status in ('published','approved') and merged_into is null) then raise exception 'Destinazione duplicato non valida'; end if;
 end if;
 update public.contributions set
 title=coalesce(p_patch->>'title',title), description=coalesce(p_patch->>'description',description),
 zone=coalesce(p_patch->>'zone',zone), category=coalesce(p_patch->>'category',category),
 latitude=case when p_patch ? 'latitude' then round((p_patch->>'latitude')::numeric,2) else latitude end,
 longitude=case when p_patch ? 'longitude' then round((p_patch->>'longitude')::numeric,2) else longitude end,
 event_at=coalesce((p_patch->>'event_at')::timestamptz,event_at),
 source_url=case when p_patch ? 'source_url' then nullif(p_patch->>'source_url','') else source_url end,
 fact_status=coalesce((p_patch->>'fact_status')::public.fact_status,fact_status),
 fact_source_url=case when p_patch ? 'fact_source_url' then nullif(p_patch->>'fact_source_url','') else fact_source_url end,
 editorial_status=case p_action when 'approve' then 'approved'::public.editorial_status when 'reject' then 'rejected'::public.editorial_status when 'archive' then 'archived'::public.editorial_status when 'merge' then 'archived'::public.editorial_status else editorial_status end,
 merged_into=case when p_action='merge' then (p_patch->>'merged_into')::uuid else merged_into end,updated_at=now()
 where id=p_id returning * into new_row;
 insert into public.moderation_log(moderator_id,contribution_id,action,before_data,after_data,note) values(auth.uid(),p_id,p_action,to_jsonb(old_row),to_jsonb(new_row),p_note);
end $$;
revoke all on function public.consume_limit(uuid,text,integer), public.submit_contribution(uuid,jsonb),public.submit_abuse(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.submit_contribution(uuid,jsonb),public.submit_abuse(uuid,jsonb) to service_role;
revoke all on function public.moderate_contribution(uuid,text,jsonb,text) from public,anon;
grant execute on function public.moderate_contribution(uuid,text,jsonb,text) to authenticated;
revoke all on function public.is_moderator() from public;
grant execute on function public.is_moderator() to anon,authenticated;

-- Returning the public projection avoids exposing author identifiers to the client.
create function public.own_contributions() returns table (
 id uuid, kind text, title text, description text, zone text, category text,
 latitude double precision, longitude double precision, event_at timestamptz, testimony text,
 source_url text, editorial_status public.editorial_status, fact_status public.fact_status,
 fact_source_url text, merged_into uuid, created_at timestamptz, updated_at timestamptz
) language sql stable security definer set search_path='' as $$
 select c.id,c.kind,c.title,c.description,c.zone,c.category,c.latitude,c.longitude,c.event_at,c.testimony,
 c.source_url,c.editorial_status,c.fact_status,c.fact_source_url,c.merged_into,c.created_at,c.updated_at
 from public.contributions c where c.author_id=auth.uid() order by c.created_at desc
$$;
revoke all on function public.own_contributions() from public,anon;
grant execute on function public.own_contributions() to authenticated;
alter table public.contributions add constraint fact_evidence_required check(fact_status='unverified' or fact_source_url is not null);
alter table public.contributions add constraint merged_is_archived check(merged_into is null or editorial_status='archived');

alter table public.contributions add constraint published_reports_only check(editorial_status <> 'published' or kind='report');
