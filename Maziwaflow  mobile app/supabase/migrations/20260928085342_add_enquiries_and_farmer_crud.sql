/*
# Add Enquiries table and expand Farmer CRUD policies

## Overview
This migration adds a new `enquiries` table for the Enquiries module
(staff can log and respond to farmer questions/support tickets) and
expands the existing `farmers` table policies to allow full CRUD
operations by authenticated staff (previously read-only).

## New Tables
- `enquiries`
  - `id` (uuid, primary key, auto-generated)
  - `subject` (text, not null) — short title of the enquiry
  - `message` (text, not null) — full body of the question/complaint
  - `category` (text, not null, default 'General') — Payment, Quality, Delivery, General
  - `status` (text, not null, default 'Open') — Open, Answered, Closed
  - `farmer_code` (text, nullable, FK → farmers) — optional link to a specific farmer
  - `created_by` (uuid, not null, default auth.uid(), FK → profiles) — staff who logged it
  - `reply` (text, nullable) — staff response text
  - `replied_by` (uuid, nullable, FK → profiles) — staff who replied
  - `replied_at` (timestamptz, nullable) — when the reply was posted
  - `created_at` (timestamptz, default now())

## Modified Tables
- `farmers` — policies expanded from SELECT-only to full CRUD for authenticated staff

## Security (RLS)
- `enquiries`: RLS enabled. All authenticated staff can view all enquiries.
  Inserts allowed with ownership check (created_by = auth.uid()).
  Updates allowed for the original creator OR any staff (to post replies).
  Deletes allowed for the original creator only.
- `farmers`: Added INSERT, UPDATE, DELETE policies for authenticated staff.

## Important Notes
1. The `created_by` column defaults to `auth.uid()` so inserts that omit it still pass RLS.
2. All existing farmer data is preserved — only policies are added, no schema changes to farmers.
3. The enquiry reply workflow uses UPDATE to set reply/replied_by/replied_at in one operation.
*/

-- ===== Enquiries table =====
CREATE TABLE IF NOT EXISTS public.enquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL,
  message text NOT NULL,
  category text NOT NULL DEFAULT 'General',
  status text NOT NULL DEFAULT 'Open',
  farmer_code text REFERENCES public.farmers(farmer_code) ON DELETE SET NULL,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  reply text,
  replied_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  replied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.enquiries TO authenticated;
GRANT ALL ON public.enquiries TO service_role;

ALTER TABLE public.enquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view enquiries" ON public.enquiries;
CREATE POLICY "Staff can view enquiries"
  ON public.enquiries FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "Staff create enquiries" ON public.enquiries;
CREATE POLICY "Staff create enquiries"
  ON public.enquiries FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Staff reply to enquiries" ON public.enquiries;
CREATE POLICY "Staff reply to enquiries"
  ON public.enquiries FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Staff delete own enquiries" ON public.enquiries;
CREATE POLICY "Staff delete own enquiries"
  ON public.enquiries FOR DELETE
  TO authenticated USING (auth.uid() = created_by);

-- Index for sorting by most recent
CREATE INDEX IF NOT EXISTS enquiries_created_at_idx ON public.enquiries (created_at DESC);

-- ===== Farmers CRUD policies =====
GRANT INSERT, UPDATE, DELETE ON public.farmers TO authenticated;

DROP POLICY IF EXISTS "Staff can add farmers" ON public.farmers;
CREATE POLICY "Staff can add farmers"
  ON public.farmers FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Staff can update farmers" ON public.farmers;
CREATE POLICY "Staff can update farmers"
  ON public.farmers FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Staff can delete farmers" ON public.farmers;
CREATE POLICY "Staff can delete farmers"
  ON public.farmers FOR DELETE
  TO authenticated USING (true);
