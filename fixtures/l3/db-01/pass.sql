-- @append-only price_logs

CREATE TABLE public.price_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL,
  price NUMERIC NOT NULL,
  supersedes_id UUID REFERENCES public.price_logs(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Layer 1: REVOKE UPDATE, DELETE, TRUNCATE
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.price_logs FROM anon, authenticated, service_role;

-- Layer 2: RLS Policies (SELECT and INSERT only)
ALTER TABLE public.price_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to price logs"
  ON public.price_logs
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow insert access to price logs"
  ON public.price_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Layer 3: BEFORE UPDATE OR DELETE trigger raising exception
CREATE OR REPLACE FUNCTION public.prevent_modification_price_logs()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Table price_logs is strictly append-only. UPDATE and DELETE are prohibited. Insert a new row with supersedes_id.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_price_logs_append_only
  BEFORE UPDATE OR DELETE ON public.price_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_modification_price_logs();

