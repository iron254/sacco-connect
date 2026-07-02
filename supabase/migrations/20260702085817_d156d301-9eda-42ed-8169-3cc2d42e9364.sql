
create or replace function public.admin_wallet_totals()
returns table(wallet_type text, total numeric)
language sql
stable
security definer
set search_path = public
as $$
  select wallet_type::text, coalesce(sum(balance),0)::numeric
  from public.wallets
  group by wallet_type
$$;

revoke all on function public.admin_wallet_totals() from public, anon;
grant execute on function public.admin_wallet_totals() to authenticated;

create or replace function public.admin_report_summary(_from timestamptz, _to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  is_admin boolean;
  result jsonb;
begin
  select public.has_role(auth.uid(), 'admin') into is_admin;
  if not is_admin then
    raise exception 'not authorized';
  end if;

  with wt as (
    select wallet_type::text as k, coalesce(sum(balance),0)::numeric as v
    from public.wallets group by wallet_type
  ),
  tx as (
    select
      count(*) as tx_count,
      coalesce(sum(case when status='completed' and tx_type in ('deposit','transfer_in','interest') then amount else 0 end),0)::numeric as inflows,
      coalesce(sum(case when status='completed' and tx_type in ('withdrawal','transfer_out','fee') then amount else 0 end),0)::numeric as outflows
    from public.transactions
    where created_at >= _from and created_at <= _to
  ),
  ln as (
    select
      count(*) as loan_count,
      coalesce(sum(case when status in ('active','approved') then principal else 0 end),0)::numeric as active_book
    from public.loans
    where created_at >= _from and created_at <= _to
  ),
  active_book_all as (
    select coalesce(sum(principal),0)::numeric as v
    from public.loans where status in ('active','approved')
  ),
  mem as (
    select count(*) as new_members from public.profiles
    where created_at >= _from and created_at <= _to
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'savings', coalesce((select v from wt where k='savings'),0),
      'shares', coalesce((select v from wt where k='shares'),0),
      'benevolent', coalesce((select v from wt where k='benevolent'),0),
      'loans_active', (select v from active_book_all)
    ),
    'period', jsonb_build_object(
      'transactions', (select tx_count from tx),
      'inflows', (select inflows from tx),
      'outflows', (select outflows from tx),
      'loans', (select loan_count from ln),
      'new_members', (select new_members from mem)
    )
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_report_summary(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_report_summary(timestamptz, timestamptz) to authenticated;
