
CREATE INDEX IF NOT EXISTS idx_tx_user_created ON public.transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_status_created ON public.transactions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_wallet ON public.transactions (wallet_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tx_checkout_request_id ON public.transactions (checkout_request_id) WHERE checkout_request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_tx_mpesa_reference ON public.transactions (reference) WHERE reference IS NOT NULL AND method = 'mpesa';

CREATE INDEX IF NOT EXISTS idx_wallets_user_type ON public.wallets (user_id, wallet_type);

CREATE INDEX IF NOT EXISTS idx_loans_user_status ON public.loans (user_id, status);
CREATE INDEX IF NOT EXISTS idx_loans_status_created ON public.loans (status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_member_number ON public.profiles (member_number) WHERE member_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_kyc_user ON public.kyc_documents (user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON public.user_roles (user_id);
