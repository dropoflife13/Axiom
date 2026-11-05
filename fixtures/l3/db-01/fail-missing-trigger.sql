-- @append-only price_logs

CREATE TABLE public.price_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL,
  price NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Layer 1: REVOKE
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.price_logs FROM anon, authenticated, service_role;

-- Layer 2: RLS Policies (read/insert only)
ALTER TABLE public.price_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access"
  ON public.price_logs
  FOR SELECT
  TO authenticated
  USING (true);

-- Missing Layer 3: No BEFORE UPDATE OR DELETE trigger raising an exception!
-- RLS alone is insufficient because owners and service_role bypass RLS.

