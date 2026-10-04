/*
# Admin-Managed Milk Prices & Collection Price Snapshots

## Overview
Introduces a `milk_prices` table that admins can manage (set/update prices
per quality grade). Each new collection entry now snapshots the price that
was in effect at the time, stored in a new `price_per_kg` column on
`collections`. This ensures historical earnings are always accurate even
when prices change later.

## New Tables
- milk_prices:
  - id (uuid PK)
  - grade (text, unique — 'Grade A', 'Grade B', 'Grade C')
  - price_per_ksh (numeric(10,2), not null)
  - effective_from (timestamptz, default now())
  - updated_by (uuid, FK → profiles, nullable)
  - created_at (timestamptz, default now())
  - updated_at (timestamptz, default now())

## New Columns
- collections.price_per_ksh (numeric(10,2), nullable)
  — Stores the price per kg that was in effect when the collection was
    recorded. Null for historical records created before this migration;
    populated automatically by a trigger for all new inserts.

## New Functions / Triggers
- snapshot_collection_price(): BEFORE INSERT on collections — looks up the
  current price for the collection's quality_grade from milk_prices and
  writes it into price_per_ksh. If no price is found, leaves it null.

## Security
- milk_prices: RLS enabled. All authenticated users (clerks, farmers,
  admins) can READ prices (needed for display). Only admins can INSERT
  and UPDATE.
- collections: existing policies unchanged; the new column is covered by
  existing SELECT policies.

## Seed Data
- Inserts default prices: Grade A = 55 KSh, Grade B = 45 KSh, Grade C = 35 KSh.
  These match the previously hardcoded values in the farmer dashboard.
*/

-- ===== milk_prices table =====
CREATE TABLE IF NOT EXISTS public.milk_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grade text NOT NULL UNIQUE,
  price_per_ksh numeric(10,2) NOT NULL,
  effective_from timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.milk_prices TO authenticated;
GRANT ALL ON public.milk_prices TO service_role;
ALTER TABLE public.milk_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "All authenticated can read milk prices" ON public.milk_prices;
CREATE POLICY "All authenticated can read milk prices"
  ON public.milk_prices FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can insert milk prices" ON public.milk_prices;
CREATE POLICY "Admins can insert milk prices"
  ON public.milk_prices FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can update milk prices" ON public.milk_prices;
CREATE POLICY "Admins can update milk prices"
  ON public.milk_prices FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ===== Seed default prices =====
INSERT INTO public.milk_prices (grade, price_per_ksh) VALUES
  ('Grade A', 55),
  ('Grade B', 45),
  ('Grade C', 35)
ON CONFLICT (grade) DO NOTHING;

-- ===== Add price_per_ksh to collections =====
ALTER TABLE public.collections ADD COLUMN IF NOT EXISTS price_per_ksh numeric(10,2);

-- ===== Trigger to auto-snapshot price on insert =====
CREATE OR REPLACE FUNCTION public.snapshot_collection_price() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  current_price numeric(10,2);
BEGIN
  IF NEW.price_per_ksh IS NULL AND NEW.quality_grade IS NOT NULL THEN
    SELECT mp.price_per_ksh INTO current_price
    FROM public.milk_prices mp
    WHERE mp.grade = NEW.quality_grade
    ORDER BY mp.effective_from DESC
    LIMIT 1;

    IF current_price IS NOT NULL THEN
      NEW.price_per_ksh := current_price;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_collection_insert_price_snapshot ON public.collections;
CREATE TRIGGER on_collection_insert_price_snapshot
  BEFORE INSERT ON public.collections
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_collection_price();
