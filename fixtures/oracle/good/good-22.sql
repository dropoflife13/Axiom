-- META: {"table":"system_boot_logs","tenant":false,"append_only":true,"ingestion":false}
CREATE TABLE public.system_boot_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  supersedes_id uuid NULL,
  node_hostname text NOT NULL,
  kernel_release text NOT NULL,
  boot_duration_ms integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT system_boot_logs_pkey PRIMARY KEY (id),
  CONSTRAINT fk_system_boot_logs_supersedes_id FOREIGN KEY (supersedes_id) REFERENCES public.system_boot_logs (id) ON DELETE RESTRICT,
  CONSTRAINT chk_system_boot_logs_boot_duration_ms CHECK (boot_duration_ms > 0)
);

CREATE INDEX idx_system_boot_logs_supersedes_id ON public.system_boot_logs (supersedes_id);

CREATE OR REPLACE FUNCTION public.fn_system_boot_logs_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Update/Delete operation rejected on audit log' USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER trg_system_boot_logs_immutable
BEFORE UPDATE OR DELETE ON public.system_boot_logs
FOR EACH ROW
EXECUTE FUNCTION public.fn_system_boot_logs_reject_mutation();

REVOKE ALL ON TABLE public.system_boot_logs FROM PUBLIC, application, readonly_user;
GRANT SELECT, INSERT ON TABLE public.system_boot_logs TO application;
GRANT SELECT ON TABLE public.system_boot_logs TO readonly_user;
