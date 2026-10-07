ALTER TABLE public.collections
  ADD COLUMN IF NOT EXISTS client_sync_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_collections_client_sync_id
  ON public.collections(client_sync_id);

ALTER TABLE public.mpesa_transactions
  ADD COLUMN IF NOT EXISTS mpesa_receipt_candidate text,
  ADD COLUMN IF NOT EXISTS transaction_status_conversation_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mpesa_tx_status_conversation_id
  ON public.mpesa_transactions(transaction_status_conversation_id)
  WHERE transaction_status_conversation_id IS NOT NULL;

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, collection_centre) ON public.profiles TO authenticated;
REVOKE INSERT ON public.profiles FROM authenticated;
DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;

DROP POLICY IF EXISTS "All authenticated can read payments" ON public.payments;
DROP POLICY IF EXISTS "Admins and clerks can insert payments" ON public.payments;
DROP POLICY IF EXISTS "Admins can update payments" ON public.payments;
DROP POLICY IF EXISTS "Admins can delete payments" ON public.payments;
CREATE POLICY "Staff can read payments"
  ON public.payments FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk')
    )
  );
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.payments FROM authenticated;
GRANT SELECT ON public.payments TO authenticated;

DROP POLICY IF EXISTS "All authenticated can read deductions" ON public.deductions;
DROP POLICY IF EXISTS "Admins can insert deductions" ON public.deductions;
DROP POLICY IF EXISTS "Admins can delete deductions" ON public.deductions;
CREATE POLICY "Staff can read deductions"
  ON public.deductions FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk')
    )
  );
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.deductions FROM authenticated;
GRANT SELECT ON public.deductions TO authenticated;

DROP POLICY IF EXISTS "Staff can view farmers" ON public.farmers;
CREATE POLICY "Admins and clerks can read farmers"
  ON public.farmers FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk')
    )
  );

DROP POLICY IF EXISTS "Staff can view collections" ON public.collections;
CREATE POLICY "Admins and clerks can read collections"
  ON public.collections FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk')
    )
  );
DROP POLICY IF EXISTS "Staff record own collections" ON public.collections;
CREATE POLICY "Admins and clerks record own collections"
  ON public.collections FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = received_by
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk')
    )
  );

DROP POLICY IF EXISTS "Staff can view enquiries" ON public.enquiries;
CREATE POLICY "Staff and owners can read enquiries"
  ON public.enquiries FOR SELECT TO authenticated USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk')
    )
  );

DROP POLICY IF EXISTS "All authenticated can read corrections" ON public.collection_corrections;
CREATE POLICY "Staff can read corrections"
  ON public.collection_corrections FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk')
    )
  );

DROP POLICY IF EXISTS "insert_mpesa_transactions" ON public.mpesa_transactions;
DROP POLICY IF EXISTS "update_mpesa_transactions" ON public.mpesa_transactions;
DROP POLICY IF EXISTS "delete_mpesa_transactions" ON public.mpesa_transactions;
DROP POLICY IF EXISTS "select_mpesa_transactions" ON public.mpesa_transactions;

CREATE POLICY "Staff can read M-Pesa transactions"
  ON public.mpesa_transactions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk')
  ));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.mpesa_transactions FROM authenticated;
GRANT SELECT ON public.mpesa_transactions TO authenticated;

CREATE OR REPLACE FUNCTION public.keep_unverified_mpesa_payments_pending()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF lower(trim(coalesce(NEW.payment_method, ''))) = 'm-pesa' THEN
    NEW.status := 'pending';
    NEW.reference := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS keep_unverified_mpesa_payments_pending ON public.payments;
CREATE TRIGGER keep_unverified_mpesa_payments_pending
  BEFORE INSERT ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.keep_unverified_mpesa_payments_pending();

REVOKE EXECUTE ON FUNCTION public.keep_unverified_mpesa_payments_pending() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.process_payment(
  p_farmer_code text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_payment_method text DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_processed_by uuid DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gross numeric(12,2) := 0;
  v_deduction numeric(12,2) := 0;
  v_net numeric(12,2) := 0;
  v_payment_id uuid;
  v_plan_id uuid;
  v_installment numeric(12,2);
  v_total_deducted numeric(12,2);
  v_credit_limit numeric(12,2);
  v_remaining numeric(12,2);
  v_deduct_amount numeric(12,2) := 0;
  v_paid_count integer := 0;
  v_is_mpesa boolean := lower(trim(coalesce(p_payment_method, ''))) = 'm-pesa';
BEGIN
  IF auth.uid() IS NULL OR p_processed_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Payment processor must match the authenticated user';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'clerk')
  ) THEN
    RAISE EXCEPTION 'Only admins and clerks can process payments';
  END IF;

  IF p_farmer_code IS NULL OR p_period_start IS NULL OR p_period_end IS NULL
     OR p_period_start > p_period_end THEN
    RAISE EXCEPTION 'A farmer and valid payment period are required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_farmer_code)::bigint);

  IF EXISTS (
    SELECT 1 FROM public.payments
    WHERE farmer_code = p_farmer_code
      AND status = 'pending'
      AND lower(trim(coalesce(payment_method, ''))) = 'm-pesa'
  ) THEN
    RAISE EXCEPTION 'Resolve the pending M-Pesa payment before creating another payout';
  END IF;

  SELECT COALESCE(SUM(
    quantity_kg * COALESCE(price_per_ksh, (
      SELECT mp.price_per_ksh FROM public.milk_prices mp
      WHERE mp.grade = collections.quality_grade
      ORDER BY mp.effective_from DESC LIMIT 1
    ), 0)
  ), 0), COUNT(*)
  INTO v_gross, v_paid_count
  FROM public.collections
  WHERE farmer_code = p_farmer_code
    AND status = 'Accepted'
    AND payment_id IS NULL
    AND collected_at >= p_period_start
    AND collected_at <= p_period_end;

  IF v_paid_count = 0 THEN
    RETURN json_build_object(
      'payment_id', NULL,
      'farmer_code', p_farmer_code,
      'gross_ksh', 0,
      'deduction_ksh', 0,
      'net_ksh', 0,
      'collections_paid', 0,
      'plan_deducted', false,
      'message', 'No unpaid collections in this period'
    );
  END IF;

  INSERT INTO public.payments (
    farmer_code, period_start, period_end, gross_ksh, deduction_ksh, net_ksh,
    status, payment_method, reference, notes, processed_by
  ) VALUES (
    p_farmer_code, p_period_start, p_period_end, v_gross, 0, v_gross,
    'completed', p_payment_method, p_reference, p_notes, p_processed_by
  ) RETURNING id INTO v_payment_id;

  UPDATE public.collections
  SET payment_id = v_payment_id
  WHERE farmer_code = p_farmer_code
    AND status = 'Accepted'
    AND payment_id IS NULL
    AND collected_at >= p_period_start
    AND collected_at <= p_period_end;

  SELECT id, installment_amount_ksh, total_deducted_ksh, credit_limit_ksh
  INTO v_plan_id, v_installment, v_total_deducted, v_credit_limit
  FROM public.lipa_pole_pole
  WHERE farmer_code = p_farmer_code AND status = 'active'
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE;

  IF v_plan_id IS NOT NULL AND v_installment > 0 THEN
    v_remaining := v_credit_limit - v_total_deducted;
    v_deduct_amount := LEAST(v_installment, v_remaining, v_gross);
    IF v_deduct_amount > 0 THEN
      v_deduction := v_deduct_amount;
    END IF;
  END IF;

  v_net := v_gross - v_deduction;
  IF v_is_mpesa AND v_net <> trunc(v_net) THEN
    RAISE EXCEPTION 'M-Pesa payouts require a whole-KSh amount';
  END IF;

  UPDATE public.payments
  SET deduction_ksh = v_deduction, net_ksh = v_net
  WHERE id = v_payment_id;

  IF NOT v_is_mpesa AND v_deduction > 0 THEN
    INSERT INTO public.deductions (
      payment_id, farmer_code, lipa_pole_pole_id, amount_ksh, type, description
    ) VALUES (
      v_payment_id, p_farmer_code, v_plan_id, v_deduction, 'lipa_pole_pole',
      'Lipa Pole Pole installment deduction'
    );

    UPDATE public.lipa_pole_pole
    SET total_deducted_ksh = total_deducted_ksh + v_deduction,
        status = CASE
          WHEN total_deducted_ksh + v_deduction >= credit_limit_ksh THEN 'closed'
          ELSE status
        END,
        updated_at = now()
    WHERE id = v_plan_id;
  END IF;

  RETURN json_build_object(
    'payment_id', v_payment_id,
    'farmer_code', p_farmer_code,
    'gross_ksh', v_gross,
    'deduction_ksh', v_deduction,
    'net_ksh', v_net,
    'collections_paid', v_paid_count,
    'plan_deducted', v_deduction > 0,
    'status', CASE WHEN v_is_mpesa THEN 'pending' ELSE 'completed' END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_mpesa_payment(
  p_payment_id uuid,
  p_receipt text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_plan public.lipa_pole_pole%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only the trusted payment callback can complete M-Pesa payments';
  END IF;
  IF p_receipt IS NULL OR trim(p_receipt) = '' THEN
    RAISE EXCEPTION 'A Daraja-verified receipt is required';
  END IF;

  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment was not found';
  END IF;
  IF v_payment.status = 'completed' AND v_payment.reference = p_receipt THEN
    RETURN;
  END IF;
  IF v_payment.status <> 'pending'
     OR lower(trim(coalesce(v_payment.payment_method, ''))) <> 'm-pesa' THEN
    RAISE EXCEPTION 'Payment is not an unverified M-Pesa payment';
  END IF;

  IF v_payment.deduction_ksh > 0 THEN
    SELECT * INTO v_plan
    FROM public.lipa_pole_pole
    WHERE farmer_code = v_payment.farmer_code AND status = 'active'
    ORDER BY created_at
    LIMIT 1
    FOR UPDATE;
    IF NOT FOUND OR v_plan.credit_limit_ksh - v_plan.total_deducted_ksh < v_payment.deduction_ksh THEN
      RAISE EXCEPTION 'The reserved Lipa Pole Pole deduction is no longer valid';
    END IF;

    INSERT INTO public.deductions (
      payment_id, farmer_code, lipa_pole_pole_id, amount_ksh, type, description
    ) VALUES (
      v_payment.id, v_payment.farmer_code, v_plan.id, v_payment.deduction_ksh,
      'lipa_pole_pole', 'Lipa Pole Pole installment deduction'
    );

    UPDATE public.lipa_pole_pole
    SET total_deducted_ksh = total_deducted_ksh + v_payment.deduction_ksh,
        status = CASE
          WHEN total_deducted_ksh + v_payment.deduction_ksh >= credit_limit_ksh THEN 'closed'
          ELSE status
        END,
        updated_at = now()
    WHERE id = v_plan.id;
  END IF;

  UPDATE public.payments
  SET reference = p_receipt, status = 'completed'
  WHERE id = v_payment.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_mpesa_payment(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_mpesa_payment(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.fail_mpesa_payment(p_payment_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only the trusted payment callback can fail M-Pesa payments';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('failed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid M-Pesa payment failure status';
  END IF;

  UPDATE public.payments
  SET status = p_status
  WHERE id = p_payment_id
    AND status = 'pending'
    AND lower(trim(coalesce(payment_method, ''))) = 'm-pesa';

  UPDATE public.collections
  SET payment_id = NULL
  WHERE payment_id = p_payment_id
    AND EXISTS (
      SELECT 1 FROM public.payments
      WHERE id = p_payment_id AND status = p_status
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fail_mpesa_payment(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_mpesa_payment(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_mpesa_transaction(
  p_payment_id uuid,
  p_farmer_code text,
  p_phone text,
  p_amount numeric,
  p_initiated_by uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_existing public.mpesa_transactions%ROWTYPE;
  v_transaction_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only the trusted payment service can reserve M-Pesa transactions';
  END IF;
  IF p_payment_id IS NULL OR p_farmer_code IS NULL OR p_phone IS NULL
     OR p_amount IS NULL OR p_initiated_by IS NULL THEN
    RAISE EXCEPTION 'All M-Pesa payment details are required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_payment_id::text)::bigint);

  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;
  IF NOT FOUND OR v_payment.farmer_code <> p_farmer_code
     OR v_payment.status <> 'pending'
     OR lower(trim(coalesce(v_payment.payment_method, ''))) <> 'm-pesa'
     OR v_payment.net_ksh <> p_amount THEN
    RAISE EXCEPTION 'Payment does not match an unpaid M-Pesa payment record';
  END IF;

  SELECT * INTO v_existing
  FROM public.mpesa_transactions
  WHERE payment_id = p_payment_id
    AND status IN ('initiating', 'pending', 'verifying', 'verification_failed')
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'transaction_id', v_existing.id,
      'checkout_request_id', v_existing.checkout_request_id,
      'status', v_existing.status,
      'created', false
    );
  END IF;

  INSERT INTO public.mpesa_transactions (
    farmer_code, payment_id, phone, amount_ksh, status, initiated_by
  ) VALUES (
    p_farmer_code, p_payment_id, p_phone, p_amount, 'initiating', p_initiated_by
  ) RETURNING id INTO v_transaction_id;

  RETURN jsonb_build_object(
    'transaction_id', v_transaction_id,
    'checkout_request_id', NULL,
    'status', 'initiating',
    'created', true
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reserve_mpesa_transaction(uuid, text, text, numeric, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_mpesa_transaction(uuid, text, text, numeric, uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.process_payment(text, timestamptz, timestamptz, text, text, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_payment(text, timestamptz, timestamptz, text, text, text, uuid)
  TO authenticated;
