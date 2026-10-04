/*
# Collection Corrections Audit Trail

## Overview
Adds a `collection_corrections` table that records every edit or void
applied to a milk collection entry. When a clerk or admin corrects a
collection (e.g. fixes quantity, grade, or status), the original values
are preserved in the audit table along with the new values, who made the
change, when, and why. The collection row itself is updated in place,
but the full history of what it was before each correction is recoverable.

## New Tables
- collection_corrections:
  - id (uuid PK)
  - collection_id (uuid FK → collections, ON DELETE CASCADE)
  - farmer_code (text) — denormalized for easy querying
  - field_name (text) — which field was changed: quantity_kg, quality_grade, status, price_per_ksh
  - old_value (text) — the value before the change
  - new_value (text) — the value after the change
  - reason (text) — why the correction was made (required)
  - corrected_by (uuid FK → profiles, nullable)
  - created_at (timestamptz, default now())

## Security
- collection_corrections: RLS enabled. All authenticated users can read
  the audit trail (transparency). Only admins and clerks can insert
  corrections. Admins can delete (e.g. to revert an erroneous entry).
- The existing collections table policies are unchanged — admins and
  clerks can already update collections per the existing RLS setup.

## Important Notes
1. Each correction records a SINGLE field change. If a user edits both
   quantity and grade in one action, two rows are inserted — one per
   field. This makes the audit trail granular and queryable.
2. Voiding a collection is done by changing its status to "Voided". This
   is recorded like any other status change, with the old status preserved.
3. The "Voided" status is new — it is not in the original STATUS enum
   (collections uses a text column, not an enum). Voided collections are
   excluded from earnings calculations because they are not "Accepted".
4. No data is ever deleted from collection_corrections — even if a
   collection is voided, the correction history remains for audit.
*/
CREATE TABLE IF NOT EXISTS public.collection_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  farmer_code text NOT NULL,
  field_name text NOT NULL,
  old_value text,
  new_value text,
  reason text NOT NULL,
  corrected_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.collection_corrections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "All authenticated can read corrections" ON public.collection_corrections;
CREATE POLICY "All authenticated can read corrections"
  ON public.collection_corrections FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins and clerks can insert corrections" ON public.collection_corrections;
CREATE POLICY "Admins and clerks can insert corrections"
  ON public.collection_corrections FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','clerk'))
  );

DROP POLICY IF EXISTS "Admins can delete corrections" ON public.collection_corrections;
CREATE POLICY "Admins can delete corrections"
  ON public.collection_corrections FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE INDEX IF NOT EXISTS idx_collection_corrections_collection_id
  ON public.collection_corrections(collection_id);
CREATE INDEX IF NOT EXISTS idx_collection_corrections_farmer_code
  ON public.collection_corrections(farmer_code);
