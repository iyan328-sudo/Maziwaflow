/*
# Security Hardening: RLS Policy Fixes + SECURITY DEFINER Lockdown

## Findings addressed

1. **farmer_balances view bypasses RLS (ERROR)**
   The view was created with SECURITY DEFINER (the default on this Postgres version),
   meaning it runs with the view owner's privileges and bypasses all RLS policies on
   the underlying tables. Any authenticated user could see all farmer balances
   regardless of what the table-level RLS policies allow.
   FIX: Recreate the view with security_invoker = true so it enforces the caller's RLS.

2. **process_payment callable by anon**
   SECURITY DEFINER function in public schema, EXECUTE granted to PUBLIC (inherited
   by anon). Unauthenticated users could call process_payment via the REST API and
   create payment records.
   FIX: REVOKE EXECUTE FROM anon. Keep authenticated (the app uses signed-in users).
   The function already has SECURITY DEFINER which is needed because it writes to
   multiple tables (payments, collections, lipa_pole_pole, deductions) — but only
   signed-in users should be able to trigger it.

3. **Trigger functions callable by anon**
   notify_collection_insert and snapshot_collection_price are SECURITY DEFINER trigger
   functions. They should only be called by the database trigger system, not via RPC.
   handle_new_user is a SECURITY DEFINER function used by the auth trigger.
   FIX: REVOKE EXECUTE FROM anon and FROM authenticated for all three. Trigger
   functions are invoked internally by Postgres, not via the REST API, so revoking
   EXECUTE from anon/authenticated does not break the triggers.

4. **Collections: no UPDATE or DELETE policy**
   Any signed-in user (including farmers) could update or delete any collection.
   FIX: Add UPDATE and DELETE policies restricted to admin and clerk roles.

5. **Farmers: policies use USING true / WITH CHECK true**
   Any signed-in user could INSERT, UPDATE, or DELETE farmer records.
   FIX: Replace with role-based policies (admin and clerk only for writes).

6. **Enquiries UPDATE policy: USING true WITH CHECK true**
   Any signed-in user could reply to (modify) any enquiry.
   FIX: Restrict UPDATE to admin and clerk roles.

7. **Collection corrections: no UPDATE policy**
   Any signed-in user could modify the audit trail.
   FIX: Add UPDATE policy restricted to admin role only.

8. **Anon role has excessive grants**
   The anon role has INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on all
   tables. This is unnecessary for an app that requires authentication. An unauthenticated
   user should have no access to any table.
   FIX: Revoke INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER from anon on
   all public tables. The anon role retains SELECT (needed for health checks) but
   RLS policies (which are all TO authenticated) will block all rows.
*/

-- 1. Recreate farmer_balances with security_invoker = true
CREATE OR REPLACE VIEW public.farmer_balances
WITH (security_invoker = true) AS
SELECT
  f.farmer_code,
  f.full_name,
  f.location,
  f.phone,
  COALESCE(earnings.total_earnings, 0) AS total_earnings,
  COALESCE(paid.total_paid, 0) AS total_paid,
  COALESCE(paid.total_deductions, 0) AS total_deductions,
  COALESCE(paid.total_net_paid, 0) AS total_net_paid,
  COALESCE(earnings.total_earnings, 0) - COALESCE(paid.total_paid, 0) AS outstanding_balance,
  COALESCE(earnings.unpaid_earnings, 0) AS unpaid_earnings,
  COALESCE(earnings.paid_earnings, 0) AS paid_earnings,
  COALESCE(earnings.collection_count, 0) AS collection_count,
  COALESCE(earnings.unpaid_count, 0) AS unpaid_count,
  paid.last_paid_at
FROM public.farmers f
LEFT JOIN LATERAL (
  SELECT
    SUM(quantity_kg * COALESCE(price_per_ksh, 0)) AS total_earnings,
    SUM(CASE WHEN payment_id IS NULL THEN quantity_kg * COALESCE(price_per_ksh, 0) ELSE 0 END) AS unpaid_earnings,
    SUM(CASE WHEN payment_id IS NOT NULL THEN quantity_kg * COALESCE(price_per_ksh, 0) ELSE 0 END) AS paid_earnings,
    COUNT(*) AS collection_count,
    COUNT(*) FILTER (WHERE payment_id IS NULL) AS unpaid_count
  FROM public.collections
  WHERE farmer_code = f.farmer_code AND status = 'Accepted'
) earnings ON true
LEFT JOIN LATERAL (
  SELECT
    SUM(gross_ksh) AS total_paid,
    SUM(deduction_ksh) AS total_deductions,
    SUM(net_ksh) AS total_net_paid,
    MAX(created_at) AS last_paid_at
  FROM public.payments
  WHERE farmer_code = f.farmer_code AND status = 'completed'
) paid ON true;

-- 2. Revoke EXECUTE from anon for process_payment (keep authenticated)
REVOKE EXECUTE ON FUNCTION public.process_payment(text, timestamptz, timestamptz, text, text, text, uuid) FROM anon;

-- 3. Revoke EXECUTE from anon AND authenticated for trigger functions
-- (they're called by the trigger system, not via RPC)
REVOKE EXECUTE ON FUNCTION public.notify_collection_insert() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.snapshot_collection_price() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;

-- 4. Add UPDATE and DELETE policies to collections (admin/clerk only)
CREATE POLICY "Admins and clerks can update collections"
  ON public.collections FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin', 'clerk'])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin', 'clerk'])
  ));

CREATE POLICY "Admins and clerks can delete collections"
  ON public.collections FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin', 'clerk'])
  ));

-- 5. Replace farmers write policies with role-based ones
DROP POLICY IF EXISTS "Staff can delete farmers" ON public.farmers;
DROP POLICY IF EXISTS "Staff can add farmers" ON public.farmers;
DROP POLICY IF EXISTS "Staff can update farmers" ON public.farmers;

CREATE POLICY "Admins and clerks can add farmers"
  ON public.farmers FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin', 'clerk'])
  ));

CREATE POLICY "Admins and clerks can update farmers"
  ON public.farmers FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin', 'clerk'])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin', 'clerk'])
  ));

CREATE POLICY "Admins can delete farmers"
  ON public.farmers FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

-- 6. Fix enquiries UPDATE policy (restrict to admin/clerk)
DROP POLICY IF EXISTS "Staff reply to enquiries" ON public.enquiries;

CREATE POLICY "Admins and clerks can reply to enquiries"
  ON public.enquiries FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin', 'clerk'])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin', 'clerk'])
  ));

-- 7. Add UPDATE policy to collection_corrections (admin only)
CREATE POLICY "Admins can update corrections"
  ON public.collection_corrections FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

-- 8. Revoke write privileges from anon on all tables
-- anon retains SELECT (harmless since all RLS policies are TO authenticated,
-- meaning anon gets zero rows). Remove INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER.
DO $$ DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon', t);
  END LOOP;
END $$;
