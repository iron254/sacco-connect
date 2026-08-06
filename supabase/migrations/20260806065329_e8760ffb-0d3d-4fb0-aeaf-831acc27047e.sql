DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'loan_type') THEN
    CREATE TYPE public.loan_type AS ENUM ('personal', 'business');
  END IF;
END $$;

ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS loan_type public.loan_type NOT NULL DEFAULT 'personal';