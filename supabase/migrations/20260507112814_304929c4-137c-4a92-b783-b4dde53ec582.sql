do $$ begin
  create type public.loan_status as enum ('pending','approved','rejected','active','closed');
exception when duplicate_object then null; end $$;

create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  principal numeric not null check (principal > 0),
  term_months integer not null check (term_months between 1 and 60),
  interest_rate numeric not null default 12.0,
  monthly_payment numeric not null default 0,
  purpose text,
  status public.loan_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid,
  rejection_reason text
);

alter table public.loans enable row level security;

create policy "Members view own loans" on public.loans
  for select to authenticated
  using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

create policy "Members insert own loans" on public.loans
  for insert to authenticated
  with check (auth.uid() = user_id and status = 'pending');

create policy "Admins update loans" on public.loans
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create or replace function public.set_updated_at()
returns trigger language plpgsql
set search_path = public
as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists loans_set_updated_at on public.loans;
create trigger loans_set_updated_at before update on public.loans
  for each row execute function public.set_updated_at();