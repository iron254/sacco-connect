-- Roles enum + table
create type public.app_role as enum ('member', 'teller', 'credit_officer', 'auditor', 'admin');

create type public.membership_tier as enum ('individual', 'corporate', 'youth');
create type public.kyc_status as enum ('pending', 'submitted', 'verified', 'rejected');
create type public.kyc_doc_type as enum ('national_id_front', 'national_id_back', 'passport', 'selfie', 'signature', 'proof_of_address');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "Users can view their own roles"
  on public.user_roles for select to authenticated
  using (auth.uid() = user_id);

create policy "Admins can manage roles"
  on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  member_number text unique,
  full_name text,
  phone text,
  national_id text,
  date_of_birth date,
  address text,
  city text,
  country text,
  avatar_url text,
  membership_tier membership_tier not null default 'individual',
  kyc_status kyc_status not null default 'pending',
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Members view own profile"
  on public.profiles for select to authenticated
  using (auth.uid() = id or public.has_role(auth.uid(), 'admin'));

create policy "Members update own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

create policy "Members insert own profile"
  on public.profiles for insert to authenticated
  with check (auth.uid() = id);

-- updated_at trigger
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

create trigger profiles_updated_at before update on public.profiles
for each row execute function public.handle_updated_at();

-- Auto-create profile + assign member role on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  new_member_no text;
begin
  new_member_no := 'SAC-' || lpad((floor(random() * 1000000))::text, 6, '0');
  insert into public.profiles (id, full_name, member_number)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), new_member_no);
  insert into public.user_roles (user_id, role) values (new.id, 'member');
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Next of kin
create table public.next_of_kin (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  relationship text not null,
  phone text,
  email text,
  national_id text,
  allocation_percentage numeric(5,2) not null default 100 check (allocation_percentage > 0 and allocation_percentage <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.next_of_kin enable row level security;

create trigger nok_updated_at before update on public.next_of_kin
for each row execute function public.handle_updated_at();

create policy "Members view own next of kin"
  on public.next_of_kin for select to authenticated
  using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

create policy "Members insert own next of kin"
  on public.next_of_kin for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Members update own next of kin"
  on public.next_of_kin for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Members delete own next of kin"
  on public.next_of_kin for delete to authenticated
  using (auth.uid() = user_id);

-- KYC documents
create table public.kyc_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  doc_type kyc_doc_type not null,
  storage_path text not null,
  status kyc_status not null default 'submitted',
  notes text,
  uploaded_at timestamptz not null default now()
);

alter table public.kyc_documents enable row level security;

create policy "Members view own kyc"
  on public.kyc_documents for select to authenticated
  using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

create policy "Members insert own kyc"
  on public.kyc_documents for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Members delete own kyc"
  on public.kyc_documents for delete to authenticated
  using (auth.uid() = user_id);

-- Storage bucket for KYC docs (private)
insert into storage.buckets (id, name, public) values ('member-documents', 'member-documents', false);

create policy "Members upload own docs"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'member-documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Members read own docs"
  on storage.objects for select to authenticated
  using (bucket_id = 'member-documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Members delete own docs"
  on storage.objects for delete to authenticated
  using (bucket_id = 'member-documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Admins read all docs"
  on storage.objects for select to authenticated
  using (bucket_id = 'member-documents' and public.has_role(auth.uid(), 'admin'));