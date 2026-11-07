-- META: {"table":"feature_flags","tenant":false,"append_only":false,"ingestion":false,"sec_definer":true}
CREATE TABLE public.feature_flags (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  flag_key text NOT NULL,
  rollout_percentage integer NOT NULL DEFAULT 0,
  is_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT feature_flags_pkey PRIMARY KEY (id),
  CONSTRAINT uq_feature_flags_flag_key UNIQUE (flag_key),
  CONSTRAINT chk_feature_flags_rollout_percentage CHECK (rollout_percentage BETWEEN 0 AND 100)
);

CREATE OR REPLACE FUNCTION public.fn_feature_flags_set_updated_at()
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

CREATE TRIGGER trg_feature_flags_set_updated_at
BEFORE UPDATE ON public.feature_flags
FOR EACH ROW
EXECUTE FUNCTION public.fn_feature_flags_set_updated_at();

REVOKE ALL ON TABLE public.feature_flags FROM PUBLIC, application, readonly_user;
GRANT SELECT, INSERT, UPDATE ON TABLE public.feature_flags TO application;
GRANT SELECT ON TABLE public.feature_flags TO readonly_user;
