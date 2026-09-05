-- 1) Revoke direct EXECUTE from signed-in users on internal SECURITY DEFINER functions
revoke execute on function public.apply_transaction_to_wallet() from authenticated;
revoke execute on function public.notify_user(uuid, text, text, text, text) from authenticated;
revoke execute on function public.notify_guarantor_event() from authenticated;
revoke execute on function public.notify_loan_status() from authenticated;
revoke execute on function public.notify_transaction() from authenticated;
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.claim_admin_if_none() from authenticated;
revoke execute on function public.set_updated_at() from authenticated;
revoke execute on function public.handle_updated_at() from authenticated;

-- has_role, find_member_by_number, admin_wallet_totals, admin_report_summary stay
-- executable: has_role is required inside RLS policies; the rest are intentional
-- client-facing RPCs with their own in-function authorization checks.

-- 2) Stop broadcasting transaction changes over Realtime so no authenticated user
-- can subscribe to other members' payment events. DepositDialog already polls
-- status every 4s, so the deposit flow keeps working without Realtime.
alter publication supabase_realtime drop table public.transactions;