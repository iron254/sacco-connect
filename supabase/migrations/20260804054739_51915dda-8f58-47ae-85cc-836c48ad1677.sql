-- Members may only create PENDING transactions (no self-crediting)
DROP POLICY IF EXISTS "Members insert own transactions" ON public.transactions;

CREATE POLICY "Members insert own pending transactions"
ON public.transactions
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND status = 'pending'::transaction_status
  AND EXISTS (
    SELECT 1 FROM public.wallets w
    WHERE w.id = transactions.wallet_id AND w.user_id = auth.uid()
  )
);

-- Admins can update transaction status (e.g. verify cash/bank deposits)
DROP POLICY IF EXISTS "Admins update transactions" ON public.transactions;
CREATE POLICY "Admins update transactions"
ON public.transactions
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Admins can create transactions in any status (manual postings)
DROP POLICY IF EXISTS "Admins insert transactions" ON public.transactions;
CREATE POLICY "Admins insert transactions"
ON public.transactions
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
