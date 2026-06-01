-- 1) Lock down SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.claim_admin_if_none() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_admin_if_none() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- 2) Restrictive INSERT policy on user_roles: only admins (claim_admin_if_none uses SECURITY DEFINER so it bypasses RLS)
CREATE POLICY "Only admins can insert roles"
ON public.user_roles
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 3) Storage UPDATE policy for member-documents bucket (own folder only)
CREATE POLICY "Members update own docs"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'member-documents' AND auth.uid()::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'member-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
