-- 1. Guarantor admin review
create type public.guarantor_admin_status as enum ('pending','approved','rejected');

alter table public.loan_guarantors
  add column admin_status public.guarantor_admin_status not null default 'pending',
  add column admin_note text,
  add column reviewed_by uuid,
  add column reviewed_at timestamptz;

create policy "Admins update guarantor requests"
  on public.loan_guarantors for update to authenticated
  using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));

create or replace function public.notify_guarantor_admin_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.admin_status is distinct from old.admin_status and new.admin_status <> 'pending' then
    perform public.notify_user(new.requester_id, 'Guarantor request ' || new.admin_status::text,
      'The SACCO ' || new.admin_status::text || ' a guarantor backing of KES ' || to_char(new.amount,'FM999999999.00') || ' on your loan.' ||
      coalesce(' Note: ' || new.admin_note, ''), 'guarantor', '/guarantors');
    perform public.notify_user(new.guarantor_id, 'Guarantor request ' || new.admin_status::text,
      'A guarantor request you are part of was ' || new.admin_status::text || ' by the SACCO.', 'guarantor', '/guarantors');
  end if;
  return new;
end $$;

revoke all on function public.notify_guarantor_admin_review() from public, anon, authenticated;

create trigger loan_guarantors_notify_admin_review
after update on public.loan_guarantors
for each row execute function public.notify_guarantor_admin_review();

-- 2. Loan repayments ledger
create table public.loan_repayments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans(id) on delete cascade,
  user_id uuid not null,
  installment_no integer not null,
  amount numeric(14,2) not null,
  due_date date,
  status text not null default 'paid',
  transaction_id uuid references public.transactions(id),
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (loan_id, installment_no)
);

grant select, insert, update on public.loan_repayments to authenticated;
grant all on public.loan_repayments to service_role;

alter table public.loan_repayments enable row level security;

create policy "Members view own repayments"
  on public.loan_repayments for select to authenticated
  using (auth.uid() = user_id or public.has_role(auth.uid(),'admin'));

create policy "Members record own repayments"
  on public.loan_repayments for insert to authenticated
  with check (auth.uid() = user_id and exists (
    select 1 from public.loans l where l.id = loan_id and l.user_id = auth.uid()
  ));

create policy "Admins update repayments"
  on public.loan_repayments for update to authenticated
  using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));

create trigger loan_repayments_updated_at
before update on public.loan_repayments
for each row execute function public.set_updated_at();

create index idx_loan_repayments_loan on public.loan_repayments(loan_id, installment_no);
create index idx_loan_repayments_user on public.loan_repayments(user_id, paid_at desc);
