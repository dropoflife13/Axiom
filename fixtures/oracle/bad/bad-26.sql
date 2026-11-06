-- META: {"table":"currencies","tenant":false,"append_only":false,"ingestion":false,"expectedFailedFacts":["F-01"],"mutationDescription":"id column uses bigint instead of uuid DEFAULT gen_random_uuid()"}
CREATE TABLE public.currencies (
  id bigint GENERATED ALWAYS AS IDENTITY,
  iso_code text NOT NULL,
  display_name text NOT NULL,
  minor_units integer NOT NULL DEFAULT 2,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT currencies_pkey PRIMARY KEY (id),
  CONSTRAINT uq_currencies_iso_code UNIQUE (iso_code),
  CONSTRAINT chk_currencies_minor_units CHECK (minor_units BETWEEN 0 AND 4)
);

CREATE OR REPLACE FUNCTION public.fn_currencies_set_updated_at()
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

CREATE TRIGGER trg_currencies_set_updated_at
BEFORE UPDATE ON public.currencies
FOR EACH ROW
EXECUTE FUNCTION public.fn_currencies_set_updated_at();

REVOKE ALL ON TABLE public.currencies FROM PUBLIC, application, readonly_user;
GRANT SELECT, INSERT, UPDATE ON TABLE public.currencies TO application;
GRANT SELECT ON TABLE public.currencies TO readonly_user;
