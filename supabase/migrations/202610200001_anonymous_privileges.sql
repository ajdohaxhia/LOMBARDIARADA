-- Anonymous Auth users have the authenticated database role, but no editorial privileges.
-- Consult the server-owned Auth flag, never user-editable metadata or JWT freshness.
create or replace function public.is_moderator() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists (
  select 1 from public.moderators m join auth.users u on u.id=m.user_id
  where m.user_id=auth.uid() and u.is_anonymous is false
 )
$$;

-- Even an accidentally assigned moderator row cannot grant anonymous editorial access.
drop policy moderator_self on public.moderators;
create policy moderator_self on public.moderators for select to authenticated
 using (user_id=auth.uid() and public.is_moderator());

create or replace function public.submit_contribution(p_user uuid,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; begin
 if p_user is null then raise exception 'Autenticazione richiesta'; end if;
 perform public.consume_limit(p_user,'contribution',5);
 if p_data->>'kind'='news' and not exists(select 1 from public.moderators m join auth.users u on u.id=m.user_id where m.user_id=p_user and u.is_anonymous is false) then raise exception 'Solo moderatori'; end if;
 insert into public.contributions(author_id,kind,title,description,zone,category,latitude,longitude,event_at,testimony,source_url,editorial_status)
 values(p_user,p_data->>'kind',p_data->>'title',p_data->>'description',p_data->>'zone',p_data->>'category',round((p_data->>'latitude')::numeric,2),round((p_data->>'longitude')::numeric,2),(p_data->>'event_at')::timestamptz,p_data->>'testimony',nullif(p_data->>'source_url',''),case when p_data->>'kind'='report' then 'published'::public.editorial_status else 'pending'::public.editorial_status end) returning id into result;
 return result;
end $$;
