-- @append-only price_logs

CREATE TABLE public.price_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL,
  price NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Layer 1: REVOKE
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.price_logs FROM anon, authenticated, service_role;

-- Layer 2: RLS Policies with forbidden UPDATE policy!
ALTER TABLE public.price_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access"
  ON public.price_logs
  FOR SELECT
  TO authenticated
  USING (true);

-- VIOLATION: Append-only entities must never define an UPDATE policy!
CREATE POLICY "Admins can update price logs"
  ON public.price_logs
  FOR UPDATE
  TO authenticated
  USING (auth.jwt() ->> 'role' = 'admin');

-- Layer 3: BEFORE UPDATE OR DELETE trigger
CREATE OR REPLACE FUNCTION public.prevent_modification_price_logs()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Table price_logs is strictly append-only.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_price_logs_append_only
  BEFORE UPDATE OR DELETE ON public.price_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_modification_price_logs();

