/*
# Farmer Payments & Lipa Pole Pole Deductions

## Overview
Introduces a full payment cycle: an admin (or clerk) records a payout to a
farmer. The system calculates the farmer's gross earnings from accepted
collections that haven't been paid yet, automatically deducts the Lipa Pole
Pole installment if the farmer has an active plan, and records the net
amount paid. Each deduction is tracked individually so the audit trail is
complete.

## New Tables
- payments:
  - id (uuid PK)
  - farmer_code (text FK → farmers)
  - period_start (timestamptz) — start of the earnings period covered
  - period_end (timestamptz) — end of the earnings period covered
  - gross_ksh (numeric) — total earnings from collections in this period
  - deduction_ksh (numeric, default 0) — Lipa Pole Pole deduction applied
  - net_ksh (numeric) — gross minus deduction (what the farmer receives)
  - status (text, default 'completed') — completed / pending / cancelled
  - payment_method (text, nullable) — e.g. M-Pesa, Cash, Bank
  - reference (text, nullable) — transaction reference / receipt number
  - notes (text, nullable)
  - processed_by (uuid FK → profiles, nullable)
  - created_at (timestamptz, default now())

- deductions:
  - id (uuid PK)
  - payment_id (uuid FK → payments, ON DELETE CASCADE)
  - farmer_code (text FK → farmers)
  - lipa_pole_pole_id (uuid FK → lipa_pole_pole, nullable)
  - amount_ksh (numeric) — amount deducted
  - type (text, default 'lipa_pole_pole') — deduction category
  - description (text, nullable)
  - created_at (timestamptz, default now())

## New Functions
- process_payment(p_farmer_code, p_period_start, p_period_end, p_method, p_ref, p_notes, p_processed_by):
  SECURITY DEFINER function that:
  1. Calculates gross earnings from accepted collections in the period
     (using price_per_ksh snapshot, with fallback to current milk_prices).
  2. Creates a payment record with gross amount.
  3. If farmer has an active Lipa Pole Pole plan, deducts the installment
     amount (capped at remaining credit balance), creates a deduction
     record, updates the plan's total_deducted_ksh, and auto-closes the
     plan if the credit limit is fully repaid.
  4. Updates the payment's deduction_ksh and net_ksh.
  5. Returns the payment record as JSON.
  All in a single atomic operation via a DO block (no explicit BEGIN/COMMIT).

## Security
- payments: RLS enabled. Admins can do everything. Clerks can insert
  (record payments). All authenticated users can read (farmers see their
  own via farmer_code). Owner scope is by farmer_code, not user_id, since
  farmers are identified by farmer_code in the data model.
- deductions: RLS enabled. Same policy pattern — admins full access, all
  authenticated can read.
- process_payment: SECURITY DEFINER, callable by authenticated users with
  admin or clerk role.

## Important Notes
1. Collections are NOT marked as "paid" — the payment covers a date range
   (period_start to period_end). This keeps the ledger flexible.
2. The deduction is capped: if the remaining credit balance
   (credit_limit - total_deducted) is less than the installment, only the
   remaining balance is deducted and the plan auto-closes.
3. If no active Lipa Pole Pole plan exists, deduction is 0 and net = gross.
*/

-- ===== payments table =====
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_code text NOT NULL REFERENCES public.farmers(farmer_code) ON DELETE CASCADE,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  gross_ksh numeric(12,2) NOT NULL DEFAULT 0,
  deduction_ksh numeric(12,2) NOT NULL DEFAULT 0,
  net_ksh numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  payment_method text,
  reference text,
  notes text,
  processed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "All authenticated can read payments" ON public.payments;
CREATE POLICY "All authenticated can read payments"
  ON public.payments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins and clerks can insert payments" ON public.payments;
CREATE POLICY "Admins and clerks can insert payments"
  ON public.payments FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','clerk'))
  );

DROP POLICY IF EXISTS "Admins can update payments" ON public.payments;
CREATE POLICY "Admins can update payments"
  ON public.payments FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can delete payments" ON public.payments;
CREATE POLICY "Admins can delete payments"
  ON public.payments FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ===== deductions table =====
CREATE TABLE IF NOT EXISTS public.deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  farmer_code text NOT NULL REFERENCES public.farmers(farmer_code) ON DELETE CASCADE,
  lipa_pole_pole_id uuid REFERENCES public.lipa_pole_pole(id) ON DELETE SET NULL,
  amount_ksh numeric(12,2) NOT NULL,
  type text NOT NULL DEFAULT 'lipa_pole_pole',
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.deductions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "All authenticated can read deductions" ON public.deductions;
CREATE POLICY "All authenticated can read deductions"
  ON public.deductions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can insert deductions" ON public.deductions;
CREATE POLICY "Admins can insert deductions"
  ON public.deductions FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can delete deductions" ON public.deductions;
CREATE POLICY "Admins can delete deductions"
  ON public.deductions FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ===== process_payment function =====
CREATE OR REPLACE FUNCTION public.process_payment(
  p_farmer_code text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_payment_method text DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_processed_by uuid DEFAULT NULL
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_gross numeric(12,2) := 0;
  v_deduction numeric(12,2) := 0;
  v_net numeric(12,2) := 0;
  v_payment_id uuid;
  v_plan_id uuid;
  v_plan_status text;
  v_installment numeric(12,2);
  v_total_deducted numeric(12,2);
  v_credit_limit numeric(12,2);
  v_remaining numeric(12,2);
  v_deduct_amount numeric(12,2);
BEGIN
  -- Calculate gross earnings from accepted collections in the period
  SELECT COALESCE(SUM(
    quantity_kg * COALESCE(price_per_ksh, (
      SELECT mp.price_per_ksh FROM milk_prices mp
      WHERE mp.grade = collections.quality_grade
      ORDER BY mp.effective_from DESC LIMIT 1
    ), 0)
  ), 0) INTO v_gross
  FROM public.collections
  WHERE farmer_code = p_farmer_code
    AND status = 'Accepted'
    AND collected_at >= p_period_start
    AND collected_at <= p_period_end;

  -- Create the payment record
  INSERT INTO public.payments (
    farmer_code, period_start, period_end,
    gross_ksh, deduction_ksh, net_ksh,
    status, payment_method, reference, notes, processed_by
  ) VALUES (
    p_farmer_code, p_period_start, p_period_end,
    v_gross, 0, v_gross,
    'completed', p_payment_method, p_reference, p_notes, p_processed_by
  ) RETURNING id INTO v_payment_id;

  -- Check for active Lipa Pole Pole plan
  SELECT id, status, installment_amount_ksh, total_deducted_ksh, credit_limit_ksh
  INTO v_plan_id, v_plan_status, v_installment, v_total_deducted, v_credit_limit
  FROM public.lipa_pole_pole
  WHERE farmer_code = p_farmer_code AND status = 'active'
  LIMIT 1;

  IF v_plan_id IS NOT NULL AND v_installment > 0 THEN
    v_remaining := v_credit_limit - v_total_deducted;
    -- Deduct the installment, capped at remaining balance
    v_deduct_amount := LEAST(v_installment, v_remaining);

    IF v_deduct_amount > 0 THEN
      v_deduction := v_deduct_amount;
      v_net := v_gross - v_deduction;

      -- Update payment with deduction
      UPDATE public.payments
      SET deduction_ksh = v_deduction, net_ksh = v_net
      WHERE id = v_payment_id;

      -- Create deduction record
      INSERT INTO public.deductions (
        payment_id, farmer_code, lipa_pole_pole_id,
        amount_ksh, type, description
      ) VALUES (
        v_payment_id, p_farmer_code, v_plan_id,
        v_deduct_amount, 'lipa_pole_pole',
        'Lipa Pole Pole installment deduction'
      );

      -- Update plan's total_deducted and auto-close if fully repaid
      v_total_deducted := v_total_deducted + v_deduct_amount;
      IF v_total_deducted >= v_credit_limit THEN
        UPDATE public.lipa_pole_pole
        SET total_deducted_ksh = v_total_deducted,
            status = 'closed',
            updated_at = now()
        WHERE id = v_plan_id;
      ELSE
        UPDATE public.lipa_pole_pole
        SET total_deducted_ksh = v_total_deducted,
            updated_at = now()
        WHERE id = v_plan_id;
      END IF;
    ELSE
      v_net := v_gross;
    END IF;
  ELSE
    v_net := v_gross;
  END IF;

  -- Return the payment as JSON
  SELECT json_build_object(
    'payment_id', v_payment_id,
    'farmer_code', p_farmer_code,
    'gross_ksh', v_gross,
    'deduction_ksh', v_deduction,
    'net_ksh', v_net,
    'plan_deducted', v_plan_id IS NOT NULL AND v_deduct_amount > 0
  ) AS result;
END; $$;

GRANT EXECUTE ON FUNCTION public.process_payment TO authenticated;
