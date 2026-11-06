-- META: {"table":"schema_migrations_audit","tenant":false,"append_only":true,"ingestion":false,"expectedFailedFacts":["F-03"],"mutationDescription":"Foreign key uses ON DELETE CASCADE instead of ON DELETE RESTRICT"}
CREATE TABLE public.schema_migrations_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  supersedes_id uuid NULL,
  version_tag text NOT NULL,
  checksum_sha256 text NOT NULL,
  execution_ms integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT schema_migrations_audit_pkey PRIMARY KEY (id),
  CONSTRAINT fk_schema_migrations_audit_supersedes_id FOREIGN KEY (supersedes_id) REFERENCES public.schema_migrations_audit (id) ON DELETE CASCADE,
  CONSTRAINT uq_schema_migrations_audit_version_tag UNIQUE (version_tag),
  CONSTRAINT chk_schema_migrations_audit_execution_ms CHECK (execution_ms >= 0)
);

CREATE INDEX idx_schema_migrations_audit_supersedes_id ON public.schema_migrations_audit (supersedes_id);

CREATE OR REPLACE FUNCTION public.fn_schema_migrations_audit_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Update/Delete operation rejected on audit log' USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER trg_schema_migrations_audit_immutable
BEFORE UPDATE OR DELETE ON public.schema_migrations_audit
FOR EACH ROW
EXECUTE FUNCTION public.fn_schema_migrations_audit_reject_mutation();

REVOKE ALL ON TABLE public.schema_migrations_audit FROM PUBLIC, application, readonly_user;
GRANT SELECT, INSERT ON TABLE public.schema_migrations_audit TO application;
GRANT SELECT ON TABLE public.schema_migrations_audit TO readonly_user;
