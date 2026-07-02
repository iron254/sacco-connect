
create or replace function public.admin_wallet_totals()
returns table(wallet_type text, total numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'not authorized';
  end if;
  return query
    select w.wallet_type::text, coalesce(sum(w.balance),0)::numeric
    from public.wallets w
    group by w.wallet_type;
end;
$$;
