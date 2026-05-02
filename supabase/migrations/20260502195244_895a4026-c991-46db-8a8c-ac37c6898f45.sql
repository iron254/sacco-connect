-- Enums
create type public.wallet_type as enum ('savings', 'shares', 'benevolent');
create type public.transaction_type as enum ('deposit', 'withdrawal', 'transfer_in', 'transfer_out', 'interest', 'fee');
create type public.transaction_status as enum ('pending', 'completed', 'failed', 'reversed');
create type public.payment_method as enum ('mpesa', 'bank_transfer', 'card', 'cash', 'internal');

-- Wallets
create table public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  wallet_type public.wallet_type not null,
  currency text not null default 'KES',
  balance numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, wallet_type)
);

alter table public.wallets enable row level security;

create policy "Members view own wallets" on public.wallets
  for select to authenticated
  using (auth.uid() = user_id or has_role(auth.uid(), 'admin'));

create policy "Members insert own wallets" on public.wallets
  for insert to authenticated
  with check (auth.uid() = user_id);

create trigger wallets_updated_at before update on public.wallets
  for each row execute function public.handle_updated_at();

-- Transactions
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  wallet_id uuid not null references public.wallets(id) on delete restrict,
  tx_type public.transaction_type not null,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'KES',
  status public.transaction_status not null default 'completed',
  method public.payment_method not null default 'internal',
  reference text,
  description text,
  created_at timestamptz not null default now()
);

create index transactions_user_created_idx on public.transactions(user_id, created_at desc);
create index transactions_wallet_idx on public.transactions(wallet_id);

alter table public.transactions enable row level security;

create policy "Members view own transactions" on public.transactions
  for select to authenticated
  using (auth.uid() = user_id or has_role(auth.uid(), 'admin'));

create policy "Members insert own transactions" on public.transactions
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.wallets w where w.id = wallet_id and w.user_id = auth.uid())
  );

-- Balance update trigger
create or replace function public.apply_transaction_to_wallet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  delta numeric(14,2) := 0;
begin
  if (tg_op = 'INSERT') then
    if new.status = 'completed' then
      delta := case
        when new.tx_type in ('deposit','transfer_in','interest') then new.amount
        when new.tx_type in ('withdrawal','transfer_out','fee') then -new.amount
        else 0 end;
      update public.wallets set balance = balance + delta, updated_at = now() where id = new.wallet_id;
    end if;
  elsif (tg_op = 'UPDATE') then
    if old.status <> 'completed' and new.status = 'completed' then
      delta := case
        when new.tx_type in ('deposit','transfer_in','interest') then new.amount
        when new.tx_type in ('withdrawal','transfer_out','fee') then -new.amount
        else 0 end;
      update public.wallets set balance = balance + delta, updated_at = now() where id = new.wallet_id;
    elsif old.status = 'completed' and new.status <> 'completed' then
      delta := case
        when old.tx_type in ('deposit','transfer_in','interest') then -old.amount
        when old.tx_type in ('withdrawal','transfer_out','fee') then old.amount
        else 0 end;
      update public.wallets set balance = balance + delta, updated_at = now() where id = old.wallet_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger transactions_apply_balance
  after insert or update on public.transactions
  for each row execute function public.apply_transaction_to_wallet();

-- Auto-create wallets on signup; extend handle_new_user
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_member_no text;
begin
  new_member_no := 'SAC-' || lpad((floor(random() * 1000000))::text, 6, '0');
  insert into public.profiles (id, full_name, member_number)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), new_member_no);
  insert into public.user_roles (user_id, role) values (new.id, 'member');
  insert into public.wallets (user_id, wallet_type) values
    (new.id, 'savings'), (new.id, 'shares'), (new.id, 'benevolent');
  return new;
end;
$$;

-- Ensure trigger exists on auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill wallets for existing profiles
insert into public.wallets (user_id, wallet_type)
select p.id, w.wt
from public.profiles p
cross join (values ('savings'::wallet_type), ('shares'::wallet_type), ('benevolent'::wallet_type)) as w(wt)
on conflict (user_id, wallet_type) do nothing;