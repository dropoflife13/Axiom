-- META: {"table":"ca_certificates","tenant":false,"append_only":true,"ingestion":false,"expectedFailedFacts":["F-18"],"mutationDescription":"Index named ix_ca_certificates_supersedes_id instead of idx_..."}
CREATE TABLE public.ca_certificates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  supersedes_id uuid NULL,
  serial_hex text NOT NULL,
  subject_dn text NOT NULL,
  key_bits integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ca_certificates_pkey PRIMARY KEY (id),
  CONSTRAINT fk_ca_certificates_supersedes_id FOREIGN KEY (supersedes_id) REFERENCES public.ca_certificates (id) ON DELETE RESTRICT,
  CONSTRAINT uq_ca_certificates_serial_hex UNIQUE (serial_hex),
  CONSTRAINT chk_ca_certificates_key_bits CHECK (key_bits >= 2048)
);

CREATE INDEX ix_ca_certificates_supersedes_id ON public.ca_certificates (supersedes_id);

CREATE OR REPLACE FUNCTION public.fn_ca_certificates_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Update/Delete operation rejected on audit log' USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER trg_ca_certificates_immutable
BEFORE UPDATE OR DELETE ON public.ca_certificates
FOR EACH ROW
EXECUTE FUNCTION public.fn_ca_certificates_reject_mutation();

REVOKE ALL ON TABLE public.ca_certificates FROM PUBLIC, application, readonly_user;
GRANT SELECT, INSERT ON TABLE public.ca_certificates TO application;
GRANT SELECT ON TABLE public.ca_certificates TO readonly_user;
