/*
# Farmer Ledger: Running Balances & Paid Collection Tracking

## Overview
Fixes the core ledger gap: `process_payment` previously calculated gross
earnings from ALL accepted collections in a date range — even collections
that were already paid in a prior payment. Overlapping periods would
double-count earnings. This migration:

1. Adds a `payment_id` column to `collections` to track which collections
   have been paid (and by which payment).
2. Rewrites `process_payment` to only include accepted collections that
   have NOT yet been paid (`payment_id IS NULL`), and stamps each paid
   collection with the payment ID so it's never paid again.
3. Creates a `farmer_balances` view that computes the running ledger for
   every farmer: total earned, total paid, total deductions, and the
   outstanding balance (what's owed).

## Changes to existing tables
- collections: adds `payment_id uuid` (nullable, FK → payments ON DELETE SET NULL).
  When NULL, the collection's earnings have not been paid out yet.
  When set, the collection was included in that specific payment.

## New views
- farmer_balances: one row per farmer_code with:
  - total_earnings: sum of quantity_kg * price_per_ksh for accepted collections
  - total_paid: sum of gross_ksh from all completed payments
  - total_deductions: sum of deduction_ksh from all completed payments
  - total_net_paid: sum of net_ksh from all completed payments
  - outstanding_balance: total_earnings - total_paid (what's still owed)
  - unpaid_earnings: earnings from accepted collections with payment_id IS NULL
  - paid_earnings: earnings from accepted collections with payment_id IS NOT NULL
  - collection_count: total accepted collections
  - unpaid_count: accepted collections not yet paid
  - last_paid_at: timestamp of most recent completed payment

## Modified functions
- process_payment: rewritten to only sum accepted collections where
  payment_id IS NULL (not yet paid), then stamp those collections with
  the new payment ID. This prevents double-paying collections across
  overlapping payment periods.

## Security
- farmer_balances view: granted SELECT to authenticated. The view queries
  tables that each have their own RLS policies.
- The collections.payment_id column inherits the existing collections RLS.

## Important Notes
1. Existing completed payments do NOT have their collections stamped
   retroactively. Going forward, all new payments will stamp their
   collections so they're never double-paid.
2. The `farmer_balances` view computes `total_earnings` from ALL accepted
   collections (paid + unpaid). `outstanding_balance` =
   `total_earnings - total_paid`. For farmers who had payments before
   this migration, `total_paid` may exceed `paid_earnings`, which would
   show a negative outstanding balance — meaning they were paid for
   collections that aren't marked as paid in the tracking column.
   The `unpaid_earnings` field shows only collections with payment_id
   IS NULL, which is what `process_payment` uses for the next payout.
*/

ALTER TABLE public.collections
  ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_collections_payment_id
  ON public.collections(payment_id) WHERE payment_id IS NOT NULL;

DROP FUNCTION IF EXISTS public.process_payment(text, timestamptz, timestamptz, text, text, text, uuid);

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
SET search_path TO 'public'
AS $function$
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
  v_paid_count integer := 0;
BEGIN
  SELECT COALESCE(SUM(
    quantity_kg * COALESCE(price_per_ksh, (
      SELECT mp.price_per_ksh FROM milk_prices mp
      WHERE mp.grade = collections.quality_grade
      ORDER BY mp.effective_from DESC LIMIT 1
    ), 0)
  ), 0),
  COUNT(*)
  INTO v_gross, v_paid_count
  FROM public.collections
  WHERE farmer_code = p_farmer_code
    AND status = 'Accepted'
    AND payment_id IS NULL
    AND collected_at >= p_period_start
    AND collected_at <= p_period_end;

  IF v_paid_count = 0 THEN
    SELECT json_build_object(
      'payment_id', NULL,
      'farmer_code', p_farmer_code,
      'gross_ksh', 0,
      'deduction_ksh', 0,
      'net_ksh', 0,
      'collections_paid', 0,
      'plan_deducted', false,
      'message', 'No unpaid collections in this period'
    ) INTO v_gross;
    RETURN v_gross;
  END IF;

  INSERT INTO public.payments (
    farmer_code, period_start, period_end,
    gross_ksh, deduction_ksh, net_ksh,
    status, payment_method, reference, notes, processed_by
  ) VALUES (
    p_farmer_code, p_period_start, p_period_end,
    v_gross, 0, v_gross,
    'completed', p_payment_method, p_reference, p_notes, p_processed_by
  ) RETURNING id INTO v_payment_id;

  UPDATE public.collections
  SET payment_id = v_payment_id
  WHERE farmer_code = p_farmer_code
    AND status = 'Accepted'
    AND payment_id IS NULL
    AND collected_at >= p_period_start
    AND collected_at <= p_period_end;

  SELECT id, status, installment_amount_ksh, total_deducted_ksh, credit_limit_ksh
  INTO v_plan_id, v_plan_status, v_installment, v_total_deducted, v_credit_limit
  FROM public.lipa_pole_pole
  WHERE farmer_code = p_farmer_code AND status = 'active'
  LIMIT 1;

  IF v_plan_id IS NOT NULL AND v_installment > 0 THEN
    v_remaining := v_credit_limit - v_total_deducted;
    v_deduct_amount := LEAST(v_installment, v_remaining);

    IF v_deduct_amount > 0 THEN
      v_deduction := v_deduct_amount;
      v_net := v_gross - v_deduction;

      UPDATE public.payments
      SET deduction_ksh = v_deduction, net_ksh = v_net
      WHERE id = v_payment_id;

      INSERT INTO public.deductions (
        payment_id, farmer_code, lipa_pole_pole_id,
        amount_ksh, type, description
      ) VALUES (
        v_payment_id, p_farmer_code, v_plan_id,
        v_deduct_amount, 'lipa_pole_pole',
        'Lipa Pole Pole installment deduction'
      );

      v_total_deducted := v_total_deducted + v_deduct_amount;
      IF v_total_deducted >= v_credit_limit THEN
        UPDATE public.lipa_pole_pole
        SET total_deducted_ksh = v_total_deducted, status = 'closed', updated_at = now()
        WHERE id = v_plan_id;
      ELSE
        UPDATE public.lipa_pole_pole
        SET total_deducted_ksh = v_total_deducted, updated_at = now()
        WHERE id = v_plan_id;
      END IF;
    ELSE
      v_net := v_gross;
    END IF;
  ELSE
    v_net := v_gross;
  END IF;

  SELECT json_build_object(
    'payment_id', v_payment_id,
    'farmer_code', p_farmer_code,
    'gross_ksh', v_gross,
    'deduction_ksh', v_deduction,
    'net_ksh', v_net,
    'collections_paid', v_paid_count,
    'plan_deducted', v_plan_id IS NOT NULL AND v_deduct_amount > 0
  ) INTO v_gross;
  RETURN v_gross;
END;
$function$;

CREATE OR REPLACE VIEW public.farmer_balances AS
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

GRANT SELECT ON public.farmer_balances TO authenticated;
