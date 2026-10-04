/*
# Fix: Revoke EXECUTE from PUBLIC for SECURITY DEFINER functions

The previous migration revoked EXECUTE from anon and authenticated directly,
but Postgres functions default to GRANT EXECUTE TO PUBLIC. Since anon and
authenticated inherit from PUBLIC, the direct revoke had no effect.

This migration revokes EXECUTE FROM PUBLIC, then re-grants only to
authenticated for process_payment (the one function the app calls via RPC).
The trigger functions (notify_collection_insert, snapshot_collection_price)
and handle_new_user remain revoked for both anon and authenticated — they
are only called by the database trigger system, never via the REST API.
*/

REVOKE EXECUTE ON FUNCTION public.process_payment(text, timestamptz, timestamptz, text, text, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_collection_insert() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.snapshot_collection_price() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;

-- Re-grant process_payment to authenticated only (the app calls this via supabase.rpc)
GRANT EXECUTE ON FUNCTION public.process_payment(text, timestamptz, timestamptz, text, text, text, uuid) TO authenticated;
