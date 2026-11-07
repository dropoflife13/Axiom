-- META: {"table":"tax_brackets","tenant":false,"append_only":false,"ingestion":false,"sec_definer":true}
CREATE TABLE public.tax_brackets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  jurisdiction_code text NOT NULL,
  rate_bps integer NOT NULL,
  threshold_cents bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT tax_brackets_pkey PRIMARY KEY (id),
  CONSTRAINT uq_tax_brackets_jurisdiction_code_threshold_cents UNIQUE (jurisdiction_code, threshold_cents),
  CONSTRAINT chk_tax_brackets_rate_bps CHECK (rate_bps BETWEEN 0 AND 10000),
  CONSTRAINT chk_tax_brackets_threshold_cents CHECK (threshold_cents >= 0)
);

CREATE OR REPLACE FUNCTION public.fn_tax_brackets_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tax_brackets_set_updated_at
BEFORE UPDATE ON public.tax_brackets
FOR EACH ROW
EXECUTE FUNCTION public.fn_tax_brackets_set_updated_at();

REVOKE ALL ON TABLE public.tax_brackets FROM PUBLIC, application, readonly_user;
GRANT SELECT, INSERT, UPDATE ON TABLE public.tax_brackets TO application;
GRANT SELECT ON TABLE public.tax_brackets TO readonly_user;
