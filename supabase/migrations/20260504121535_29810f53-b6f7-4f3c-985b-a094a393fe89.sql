ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS checkout_request_id text;
CREATE INDEX IF NOT EXISTS idx_transactions_checkout_request_id ON public.transactions(checkout_request_id);

-- Allow the callback (running as service role via edge function) to update tx status
CREATE POLICY "Service role can update transactions"
ON public.transactions
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);