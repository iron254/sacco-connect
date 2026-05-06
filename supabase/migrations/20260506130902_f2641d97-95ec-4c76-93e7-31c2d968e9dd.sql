-- One-time claim function: any authenticated user can become admin if none exists
create or replace function public.claim_admin_if_none()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare has_admin boolean;
begin
  if auth.uid() is null then return false; end if;
  select exists(select 1 from public.user_roles where role = 'admin') into has_admin;
  if has_admin then return false; end if;
  insert into public.user_roles (user_id, role) values (auth.uid(), 'admin')
  on conflict (user_id, role) do nothing;
  return true;
end;
$$;

-- Allow admins to view all profiles, transactions, wallets, kyc already covered by has_role check
-- Add admin policies to update kyc_documents status
create policy "Admins update kyc" on public.kyc_documents
for update to authenticated
using (has_role(auth.uid(), 'admin'))
with check (has_role(auth.uid(), 'admin'));

-- Admin can view all profiles list
create policy "Admins view all profiles list" on public.profiles
for select to authenticated
using (has_role(auth.uid(), 'admin'));

-- Admin can view all wallets
create policy "Admins view all wallets" on public.wallets
for select to authenticated
using (has_role(auth.uid(), 'admin'));

-- Admin can view all transactions
create policy "Admins view all transactions" on public.transactions
for select to authenticated
using (has_role(auth.uid(), 'admin'));

-- Admin signed url access for kyc docs already through storage bucket; allow admins read via storage policy
create policy "Admins read member docs" on storage.objects
for select to authenticated
using (bucket_id = 'member-documents' and has_role(auth.uid(), 'admin'));