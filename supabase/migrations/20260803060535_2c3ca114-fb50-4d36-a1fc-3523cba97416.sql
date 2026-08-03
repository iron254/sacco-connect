-- Guarantor status enum
do $$ begin
  create type public.guarantor_status as enum ('pending','accepted','declined');
exception when duplicate_object then null; end $$;

create table if not exists public.loan_guarantors (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans(id) on delete cascade,
  requester_id uuid not null,
  guarantor_id uuid not null,
  amount numeric(14,2) not null default 0,
  status public.guarantor_status not null default 'pending',
  response_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (loan_id, guarantor_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_guarantors TO authenticated;
GRANT ALL ON public.loan_guarantors TO service_role;

alter table public.loan_guarantors enable row level security;

create policy "View own guarantor records" on public.loan_guarantors
for select to authenticated
using (auth.uid() = requester_id or auth.uid() = guarantor_id or public.has_role(auth.uid(),'admin'));

create policy "Requester creates guarantor request" on public.loan_guarantors
for insert to authenticated
with check (
  auth.uid() = requester_id
  and guarantor_id <> auth.uid()
  and exists (select 1 from public.loans l where l.id = loan_id and l.user_id = auth.uid())
);

create policy "Guarantor responds" on public.loan_guarantors
for update to authenticated
using (auth.uid() = guarantor_id)
with check (auth.uid() = guarantor_id);

create policy "Requester cancels pending request" on public.loan_guarantors
for delete to authenticated
using (auth.uid() = requester_id and status = 'pending');

create index if not exists loan_guarantors_guarantor_idx on public.loan_guarantors (guarantor_id, status, created_at desc);
create index if not exists loan_guarantors_loan_idx on public.loan_guarantors (loan_id);

create trigger loan_guarantors_updated_at before update on public.loan_guarantors
for each row execute function public.set_updated_at();

-- Notifications
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  body text,
  category text not null default 'general',
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

alter table public.notifications enable row level security;

create policy "Members view own notifications" on public.notifications
for select to authenticated
using (auth.uid() = user_id or public.has_role(auth.uid(),'admin'));

create policy "Members mark own notifications read" on public.notifications
for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

-- helper to insert notifications from triggers
create or replace function public.notify_user(_user_id uuid, _title text, _body text, _category text default 'general', _link text default null)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, title, body, category, link)
  values (_user_id, _title, _body, _category, _link);
$$;

revoke all on function public.notify_user(uuid, text, text, text, text) from public, anon;

-- loan status notifications
create or replace function public.notify_loan_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    perform public.notify_user(
      new.user_id,
      'Loan ' || new.status::text,
      'Your loan application of KES ' || to_char(new.principal, 'FM999999999.00') || ' is now ' || new.status::text ||
        coalesce('. Reason: ' || new.rejection_reason, ''),
      'loan', '/loans');
  end if;
  return new;
end $$;

revoke all on function public.notify_loan_status() from public, anon;

drop trigger if exists loans_notify_status on public.loans;
create trigger loans_notify_status after update on public.loans
for each row execute function public.notify_loan_status();

-- guarantor notifications
create or replace function public.notify_guarantor_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare req_name text;
begin
  select coalesce(full_name, member_number, 'A member') into req_name from public.profiles where id = new.requester_id;
  if tg_op = 'INSERT' then
    perform public.notify_user(new.guarantor_id, 'Guarantor request',
      req_name || ' asked you to guarantee KES ' || to_char(new.amount, 'FM999999999.00') || ' of their loan.',
      'guarantor', '/guarantors');
  elsif new.status is distinct from old.status then
    perform public.notify_user(new.requester_id, 'Guarantor ' || new.status::text,
      'Your guarantor request was ' || new.status::text || '.', 'guarantor', '/guarantors');
  end if;
  return new;
end $$;

revoke all on function public.notify_guarantor_event() from public, anon;

drop trigger if exists loan_guarantors_notify_insert on public.loan_guarantors;
create trigger loan_guarantors_notify_insert after insert on public.loan_guarantors
for each row execute function public.notify_guarantor_event();

drop trigger if exists loan_guarantors_notify_update on public.loan_guarantors;
create trigger loan_guarantors_notify_update after update on public.loan_guarantors
for each row execute function public.notify_guarantor_event();

-- transaction notifications
create or replace function public.notify_transaction()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    perform public.notify_user(new.user_id,
      initcap(replace(new.tx_type::text, '_', ' ')) || ' completed',
      new.currency || ' ' || to_char(new.amount, 'FM999999999.00') || ' via ' || replace(new.method::text, '_', ' ') || '.',
      'transaction', '/statements');
  end if;
  return new;
end $$;

revoke all on function public.notify_transaction() from public, anon;

drop trigger if exists transactions_notify on public.transactions;
create trigger transactions_notify after insert or update on public.transactions
for each row execute function public.notify_transaction();

-- ensure existing wallet trigger still installed
drop trigger if exists transactions_apply_wallet on public.transactions;
create trigger transactions_apply_wallet after insert or update on public.transactions
for each row execute function public.apply_transaction_to_wallet();

-- member lookup for guarantor selection (exposes only name + member number)
create or replace function public.find_member_by_number(_member_number text)
returns table(id uuid, full_name text, member_number text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.member_number
  from public.profiles p
  where p.member_number = upper(trim(_member_number))
    and p.id <> auth.uid()
    and auth.uid() is not null
  limit 1;
$$;

revoke all on function public.find_member_by_number(text) from public, anon;
grant execute on function public.find_member_by_number(text) to authenticated;