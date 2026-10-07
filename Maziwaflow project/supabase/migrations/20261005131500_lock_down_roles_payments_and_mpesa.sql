-- Public registration may create farmer accounts only. Staff roles are provisioned
-- through the admin-only edge function using trusted app metadata.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_role text;
BEGIN
  new_role := NEW.raw_app_meta_data->>'maziwaflow_role';
  IF new_role IS NULL OR new_role NOT IN ('admin', 'clerk') THEN
    new_role := 'farmer';
  END IF;

  INSERT INTO public.profiles (id, full_name, collection_centre, role)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'collection_centre',
    new_role
  );
  RETURN NEW;
END;
$function$;

-- Remove privilege from legacy clerk accounts that were not provisioned with
-- trusted app metadata. Admins can recreate legitimate staff accounts safely.
UPDATE public.profiles p
SET role = 'farmer'
FROM auth.users u
WHERE p.id = u.id
  AND p.role = 'clerk'
  AND COALESCE(u.raw_app_meta_data->>'maziwaflow_role', '') <> 'clerk';

ALTER TABLE public.mpesa_transactions
  ADD COLUMN IF NOT EXISTS transaction_type text NOT NULL DEFAULT 'stk_push',
  ADD COLUMN IF NOT EXISTS conversation_id text,
  ADD COLUMN IF NOT EXISTS originator_conversation_id text;

ALTER TABLE public.mpesa_transactions
  DROP CONSTRAINT IF EXISTS mpesa_transactions_type_check,
  ADD CONSTRAINT mpesa_transactions_type_check
    CHECK (transaction_type IN ('stk_push', 'b2c'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_mpesa_tx_originator_conversation
  ON public.mpesa_transactions(originator_conversation_id)
  WHERE originator_conversation_id IS NOT NULL;

-- Keep the existing ledger implementation private behind a role-checking RPC.
ALTER FUNCTION public.process_payment(text, timestamptz, timestamptz, text, text, text, uuid)
  RENAME TO process_payment_unchecked;
REVOKE EXECUTE ON FUNCTION public.process_payment_unchecked(text, timestamptz, timestamptz, text, text, text, uuid)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.process_payment(
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
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_role IS NULL OR v_role NOT IN ('admin', 'clerk') THEN
    RAISE EXCEPTION 'Only admins and clerks can process payments' USING ERRCODE = '42501';
  END IF;

  RETURN public.process_payment_unchecked(
    p_farmer_code,
    p_period_start,
    p_period_end,
    p_payment_method,
    p_reference,
    p_notes,
    auth.uid()
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.process_payment(text, timestamptz, timestamptz, text, text, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_payment(text, timestamptz, timestamptz, text, text, text, uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.reserve_mpesa_b2c_payout(
  p_payment_id uuid,
  p_initiated_by uuid
) RETURNS TABLE(transaction_id uuid, farmer_code text, phone text, amount_ksh numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  v_farmer_code text;
  v_phone text;
  v_amount numeric;
  v_transaction_id uuid;
BEGIN
  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = p_initiated_by;

  IF v_role IS NULL OR v_role NOT IN ('admin', 'clerk') THEN
    RAISE EXCEPTION 'Only admins and clerks can send farmer payouts' USING ERRCODE = '42501';
  END IF;

  SELECT p.farmer_code, f.phone, p.net_ksh
  INTO v_farmer_code, v_phone, v_amount
  FROM public.payments p
  JOIN public.farmers f ON f.farmer_code = p.farmer_code
  WHERE p.id = p_payment_id
    AND p.status = 'completed'
    AND p.reference IS NULL
  FOR UPDATE OF p;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment is not eligible for payout';
  END IF;
  IF v_phone IS NULL OR btrim(v_phone) = '' THEN
    RAISE EXCEPTION 'Farmer has no registered phone number';
  END IF;
  v_phone := regexp_replace(v_phone, '[[:space:]-]', '', 'g');
  IF left(v_phone, 1) = '+' THEN
    v_phone := substr(v_phone, 2);
  END IF;
  IF left(v_phone, 1) = '0' THEN
    v_phone := '254' || substr(v_phone, 2);
  ELSIF length(v_phone) = 9 THEN
    v_phone := '254' || v_phone;
  END IF;
  IF v_phone !~ '^254[17][0-9]{8}$' THEN
    RAISE EXCEPTION 'Farmer registered phone number is invalid';
  END IF;
  IF v_amount IS NULL OR v_amount < 1 THEN
    RAISE EXCEPTION 'Payout amount must be at least KSh 1';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.mpesa_transactions t
    WHERE t.payment_id = p_payment_id AND t.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'A payout is already pending for this payment';
  END IF;

  INSERT INTO public.mpesa_transactions (
    farmer_code, payment_id, phone, amount_ksh, status, initiated_by, transaction_type
  ) VALUES (
    v_farmer_code, p_payment_id, v_phone, floor(v_amount), 'pending', p_initiated_by, 'b2c'
  ) RETURNING id INTO v_transaction_id;

  UPDATE public.payments SET status = 'pending' WHERE id = p_payment_id;

  RETURN QUERY SELECT v_transaction_id, v_farmer_code, v_phone, floor(v_amount);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.reserve_mpesa_b2c_payout(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_mpesa_b2c_payout(uuid, uuid)
  TO service_role;

-- M-Pesa transactions are created and changed only by trusted edge functions.
DROP POLICY IF EXISTS "select_mpesa_transactions" ON public.mpesa_transactions;
DROP POLICY IF EXISTS "insert_mpesa_transactions" ON public.mpesa_transactions;
DROP POLICY IF EXISTS "update_mpesa_transactions" ON public.mpesa_transactions;
DROP POLICY IF EXISTS "delete_mpesa_transactions" ON public.mpesa_transactions;

REVOKE INSERT, UPDATE, DELETE ON public.mpesa_transactions FROM anon, authenticated;

CREATE POLICY "Staff can view initiated M-Pesa transactions"
ON public.mpesa_transactions FOR SELECT
TO authenticated
USING (
  initiated_by = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
);

-- Apply a callback after edge-side provider/request validation, atomically and
-- idempotently. Only the service-role callback handler may execute this function.
CREATE OR REPLACE FUNCTION public.apply_mpesa_callback(
  p_transaction_id uuid,
  p_checkout_request_id text,
  p_merchant_request_id text,
  p_conversation_id text,
  p_originator_conversation_id text,
  p_result_code integer,
  p_result_desc text,
  p_receipt text DEFAULT NULL,
  p_amount numeric DEFAULT NULL,
  p_phone text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  tx record;
  new_status text;
BEGIN
  SELECT id, farmer_code, payment_id, amount_ksh, phone, merchant_request_id,
    checkout_request_id, conversation_id, originator_conversation_id,
    transaction_type, status
  INTO tx
  FROM public.mpesa_transactions
  WHERE id = p_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown M-Pesa transaction';
  END IF;

  IF tx.transaction_type = 'stk_push' THEN
    IF tx.checkout_request_id IS DISTINCT FROM p_checkout_request_id
      OR tx.merchant_request_id IS DISTINCT FROM p_merchant_request_id
    THEN
      RAISE EXCEPTION 'M-Pesa STK request identifiers do not match';
    END IF;
  ELSIF tx.conversation_id IS DISTINCT FROM p_conversation_id
    OR tx.originator_conversation_id IS DISTINCT FROM p_originator_conversation_id
  THEN
    RAISE EXCEPTION 'M-Pesa B2C request identifiers do not match';
  END IF;

  IF tx.status <> 'pending' THEN
    RETURN;
  END IF;

  IF p_result_code = 0 THEN
    IF p_receipt IS NULL OR p_amount IS NULL OR floor(tx.amount_ksh) <> p_amount
      OR (tx.transaction_type = 'stk_push' AND tx.phone IS DISTINCT FROM p_phone)
    THEN
      RAISE EXCEPTION 'M-Pesa callback details do not match the transaction';
    END IF;
    new_status := 'completed';
  ELSE
    new_status := CASE WHEN p_result_code = 1032 THEN 'cancelled' ELSE 'failed' END;
  END IF;

  UPDATE public.mpesa_transactions
  SET status = new_status,
      result_code = p_result_code,
      result_desc = p_result_desc,
      mpesa_receipt_number = CASE WHEN new_status = 'completed' THEN p_receipt ELSE NULL END,
      updated_at = now()
  WHERE id = tx.id;

  IF tx.transaction_type = 'b2c' AND tx.payment_id IS NOT NULL THEN
    UPDATE public.payments
    SET reference = CASE WHEN new_status = 'completed' THEN p_receipt ELSE NULL END,
        status = 'completed'
    WHERE id = tx.payment_id;
  END IF;

  IF new_status = 'completed' AND tx.transaction_type = 'b2c' AND tx.farmer_code IS NOT NULL THEN
    INSERT INTO public.notifications (
      user_id, farmer_code, title, body, type, metadata
    ) VALUES (
      NULL,
      tx.farmer_code,
      'M-Pesa Payment Received',
      format('Payment of KSh %s received. M-Pesa receipt: %s', p_amount, p_receipt),
      'mpesa_payment',
      jsonb_build_object('transaction_id', tx.id, 'receipt', p_receipt, 'amount', p_amount, 'phone', p_phone)
    );
  END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.apply_mpesa_callback(uuid, text, text, text, text, integer, text, text, numeric, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_mpesa_callback(uuid, text, text, text, text, integer, text, text, numeric, text)
  TO service_role;
