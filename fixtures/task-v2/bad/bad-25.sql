-- META: {"table":"compliance_snapshots","tenant":false,"append_only":true,"ingestion":false,"expectedFailedFacts":["F-22"],"mutationDescription":"Omit index on foreign key column supersedes_id"}
CREATE TABLE public.compliance_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  supersedes_id uuid NULL,
  framework_code text NOT NULL,
  passing_controls integer NOT NULL,
  total_controls integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT compliance_snapshots_pkey PRIMARY KEY (id),
  CONSTRAINT fk_compliance_snapshots_supersedes_id FOREIGN KEY (supersedes_id) REFERENCES public.compliance_snapshots (id) ON DELETE RESTRICT,
  CONSTRAINT chk_compliance_snapshots_passing_controls CHECK (passing_controls >= 0 AND passing_controls <= total_controls),
  CONSTRAINT chk_compliance_snapshots_total_controls CHECK (total_controls > 0)
);



CREATE OR REPLACE FUNCTION public.fn_compliance_snapshots_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Update/Delete operation rejected on audit log' USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER trg_compliance_snapshots_immutable
BEFORE UPDATE OR DELETE ON public.compliance_snapshots
FOR EACH ROW
EXECUTE FUNCTION public.fn_compliance_snapshots_reject_mutation();

REVOKE ALL ON TABLE public.compliance_snapshots FROM PUBLIC, application, readonly_user;
GRANT SELECT, INSERT ON TABLE public.compliance_snapshots TO application;
GRANT SELECT ON TABLE public.compliance_snapshots TO readonly_user;
