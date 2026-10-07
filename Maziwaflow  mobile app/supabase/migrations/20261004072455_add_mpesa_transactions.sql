/*
# Add M-Pesa Daraja transaction tracking tables

1. New Tables
- `mpesa_transactions`: Records each STK Push payment attempt initiated through
  Safaricom's Daraja API. Each row tracks the checkout request ID, the farmer
  being paid, the phone number, the amount, and the transaction status through
  its lifecycle (pending → completed / failed / cancelled).
  - `id` (uuid, primary key)
  - `farmer_code` (text, references farmers)
  - `payment_id` (uuid, nullable, references payments — set when a payment record is linked)
  - `phone` (text, the phone number the STK push was sent to)
  - `amount_ksh` (numeric, the amount requested)
  - `checkout_request_id` (text, unique — Safaricom's identifier for polling)
  - `merchant_request_id` (text, Safaricom's merchant request identifier)
  - `status` (text: pending, completed, failed, cancelled)
  - `mpesa_receipt_number` (text, nullable — set on success)
  - `result_code` (integer, nullable — Safaricom's result code)
  - `result_desc` (text, nullable — Safaricom's result description)
  - `initiated_by` (uuid, references profiles — the staff member who initiated)
  - `created_at` (timestamptz, default now)
  - `updated_at` (timestamptz, default now)

- `mpesa_auth_tokens`: Stores the cached Daraja OAuth access token so multiple
  STK push requests within the same hour don't each fetch a new token. Edge
  function instances don't share memory, so the token is persisted here.
  - `id` (uuid, primary key)
  - `access_token` (text, the OAuth token)
  - `expires_at` (timestamptz, when the token expires)
  - `created_at` (timestamptz, default now)

2. Security
- RLS enabled on both tables.
- `mpesa_transactions`: authenticated staff can read and insert; updates are
  allowed from the service role (edge function callback) and from authenticated
  users (for polling status updates).
- `mpesa_auth_tokens`: only the service role (edge functions) needs access,
  so policies are scoped to authenticated but in practice the service role
  bypasses RLS. The table is not directly accessible from the frontend.
- 4 separate policies per table (SELECT, INSERT, UPDATE, DELETE).

3. Important Notes
- The `mpesa_auth_tokens` table acts as a shared cache across edge function
  instances, replacing module-level in-memory caching which doesn't work in
  Deno Deploy's multi-instance environment.
- The `mpesa_transactions` table is the source of truth for transaction status.
  The frontend polls this table to show the user real-time status updates.
*/

CREATE TABLE IF NOT EXISTS mpesa_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_code text REFERENCES farmers(farmer_code) ON DELETE CASCADE,
  payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
  phone text NOT NULL,
  amount_ksh numeric NOT NULL,
  checkout_request_id text UNIQUE,
  merchant_request_id text,
  status text NOT NULL DEFAULT 'pending',
  mpesa_receipt_number text,
  result_code integer,
  result_desc text,
  initiated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mpesa_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_mpesa_transactions" ON mpesa_transactions;
CREATE POLICY "select_mpesa_transactions"
ON mpesa_transactions FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_mpesa_transactions" ON mpesa_transactions;
CREATE POLICY "insert_mpesa_transactions"
ON mpesa_transactions FOR INSERT
TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_mpesa_transactions" ON mpesa_transactions;
CREATE POLICY "update_mpesa_transactions"
ON mpesa_transactions FOR UPDATE
TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_mpesa_transactions" ON mpesa_transactions;
CREATE POLICY "delete_mpesa_transactions"
ON mpesa_transactions FOR DELETE
TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_mpesa_tx_checkout_request_id
ON mpesa_transactions(checkout_request_id);
CREATE INDEX IF NOT EXISTS idx_mpesa_tx_farmer_code
ON mpesa_transactions(farmer_code);
CREATE INDEX IF NOT EXISTS idx_mpesa_tx_status
ON mpesa_transactions(status);

CREATE TABLE IF NOT EXISTS mpesa_auth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mpesa_auth_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_mpesa_auth_tokens" ON mpesa_auth_tokens;
CREATE POLICY "select_mpesa_auth_tokens"
ON mpesa_auth_tokens FOR SELECT
TO authenticated USING (false);

DROP POLICY IF EXISTS "insert_mpesa_auth_tokens" ON mpesa_auth_tokens;
CREATE POLICY "insert_mpesa_auth_tokens"
ON mpesa_auth_tokens FOR INSERT
TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "update_mpesa_auth_tokens" ON mpesa_auth_tokens;
CREATE POLICY "update_mpesa_auth_tokens"
ON mpesa_auth_tokens FOR UPDATE
TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "delete_mpesa_auth_tokens" ON mpesa_auth_tokens;
CREATE POLICY "delete_mpesa_auth_tokens"
ON mpesa_auth_tokens FOR DELETE
TO authenticated USING (false);
