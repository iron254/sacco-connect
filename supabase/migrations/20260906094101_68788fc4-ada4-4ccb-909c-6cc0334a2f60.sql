create or replace function public.create_self_notification(
  _title text,
  _body text default null,
  _category text default 'general',
  _link text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_recent int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  _title := btrim(coalesce(_title, ''));
  if length(_title) < 3 or length(_title) > 120 then
    raise exception 'title must be between 3 and 120 characters';
  end if;

  if _body is not null and length(_body) > 1000 then
    raise exception 'body must be 1000 characters or fewer';
  end if;

  if coalesce(_category, 'general') not in ('general', 'reminder', 'note') then
    raise exception 'category must be one of general, reminder, note';
  end if;

  if _link is not null and _link !~ '^/[A-Za-z0-9/_\-\?=&\.]*$' then
    raise exception 'link must be an internal path starting with /';
  end if;

  select count(*) into v_recent
  from public.notifications
  where user_id = auth.uid()
    and category in ('general', 'reminder', 'note')
    and created_at > now() - interval '1 hour';

  if v_recent >= 20 then
    raise exception 'too many notifications created recently, please try again later';
  end if;

  insert into public.notifications (user_id, title, body, category, link)
  values (auth.uid(), _title, nullif(btrim(coalesce(_body, '')), ''), coalesce(_category, 'general'), _link)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_self_notification(text, text, text, text) from public, anon;
grant execute on function public.create_self_notification(text, text, text, text) to authenticated;