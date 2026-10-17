-- Clerk Earnings, Milk Prices Default, and RLS Hardening
-- Migration: 20261011120000_clerk_earnings_and_rls_hardening.sql

-- 1. Ensure columns exist on farmers and collections
ALTER TABLE public.farmers
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS national_id text;

ALTER TABLE public.collections
  ADD COLUMN IF NOT EXISTS client_sync_id text,
  ADD COLUMN IF NOT EXISTS price_per_ksh numeric(10,2);

CREATE UNIQUE INDEX IF NOT EXISTS idx_collections_client_sync_id
  ON public.collections(client_sync_id);

-- 2. Seed default Clerk Commission in milk_prices if not present
INSERT INTO public.milk_prices (grade, price_per_ksh)
VALUES ('Clerk Commission', 2.00)
ON CONFLICT (grade) DO NOTHING;

-- 3. Ensure permissions on milk_prices
GRANT SELECT ON public.milk_prices TO authenticated;

-- 4. Collections RLS: Farmers can read their own collections
DROP POLICY IF EXISTS "Farmers can read own collections" ON public.collections;
CREATE POLICY "Farmers can read own collections"
  ON public.collections FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.farmers f
      WHERE f.farmer_code = collections.farmer_code
        AND f.linked_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk')
    )
  );

-- 5. Farmers RLS: Allow reading own farmer record and staff reading all
DROP POLICY IF EXISTS "Farmers and staff read farmers" ON public.farmers;
CREATE POLICY "Farmers and staff read farmers"
  ON public.farmers FOR SELECT TO authenticated USING (
    linked_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk')
    )
  );

-- 6. Grant execute on price snapshot trigger helper if exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'snapshot_collection_price'
  ) THEN
    GRANT EXECUTE ON FUNCTION public.snapshot_collection_price() TO authenticated;
  END IF;
END $$;

