-- META: {"table":"ledger_entries","tenant":true,"append_only":true,"ingestion":false}
CREATE TABLE public.ledger_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  supersedes_id uuid NULL,
  account_code text NOT NULL,
  direction text NOT NULL,
  amount_cents bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ledger_entries_pkey PRIMARY KEY (id),
  CONSTRAINT fk_ledger_entries_tenant_id FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
  CONSTRAINT fk_ledger_entries_supersedes_id FOREIGN KEY (supersedes_id) REFERENCES public.ledger_entries (id) ON DELETE RESTRICT,
  CONSTRAINT chk_ledger_entries_direction CHECK (direction IN ('debit', 'credit')),
  CONSTRAINT chk_ledger_entries_amount_cents CHECK (amount_cents > 0)
);

CREATE INDEX idx_ledger_entries_tenant_id_created_at ON public.ledger_entries (tenant_id, created_at DESC);
CREATE INDEX idx_ledger_entries_supersedes_id ON public.ledger_entries (supersedes_id);

CREATE OR REPLACE FUNCTION public.fn_ledger_entries_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Update/Delete operation rejected on audit log' USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER trg_ledger_entries_immutable
BEFORE UPDATE OR DELETE ON public.ledger_entries
FOR EACH ROW
EXECUTE FUNCTION public.fn_ledger_entries_reject_mutation();

ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries FORCE ROW LEVEL SECURITY;

CREATE POLICY pol_ledger_entries_tenant_select ON public.ledger_entries
  FOR SELECT TO application, readonly_user
  USING (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE POLICY pol_ledger_entries_tenant_insert ON public.ledger_entries
  FOR INSERT TO application
  WITH CHECK (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE VIEW public.v_ledger_entries_summary
WITH (security_invoker = true)
AS
SELECT id, tenant_id, supersedes_id, account_code, direction, amount_cents, created_at
FROM public.ledger_entries;

REVOKE ALL ON TABLE public.ledger_entries FROM PUBLIC, application, readonly_user;
GRANT SELECT, INSERT ON TABLE public.ledger_entries TO application;
GRANT SELECT ON TABLE public.ledger_entries TO readonly_user;
GRANT SELECT ON TABLE public.v_ledger_entries_summary TO application, readonly_user;
