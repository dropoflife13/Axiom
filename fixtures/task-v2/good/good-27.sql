-- META: {"table":"countries","tenant":false,"append_only":false,"ingestion":false}
CREATE TABLE public.countries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  alpha2_code text NOT NULL,
  country_name text NOT NULL,
  calling_code integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT countries_pkey PRIMARY KEY (id),
  CONSTRAINT uq_countries_alpha2_code UNIQUE (alpha2_code),
  CONSTRAINT chk_countries_calling_code CHECK (calling_code > 0)
);

CREATE OR REPLACE FUNCTION public.fn_countries_set_updated_at()
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

CREATE TRIGGER trg_countries_set_updated_at
BEFORE UPDATE ON public.countries
FOR EACH ROW
EXECUTE FUNCTION public.fn_countries_set_updated_at();

REVOKE ALL ON TABLE public.countries FROM PUBLIC, application, readonly_user;
GRANT SELECT, INSERT, UPDATE ON TABLE public.countries TO application;
GRANT SELECT ON TABLE public.countries TO readonly_user;
