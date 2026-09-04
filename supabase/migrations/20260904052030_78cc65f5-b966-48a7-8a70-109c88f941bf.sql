ALTER TABLE public.notifications REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications';
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'loan_guarantors'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.loan_guarantors';
  END IF;
END $$;
DROP POLICY IF EXISTS "Members delete own notifications" ON public.notifications;
CREATE POLICY "Members delete own notifications" ON public.notifications
FOR DELETE TO authenticated USING (auth.uid() = user_id);
GRANT DELETE ON public.notifications TO authenticated;