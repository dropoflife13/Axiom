-- META: {"table":"feature_flags","tenant":false,"append_only":true,"ingestion":false,"expectedFailedFacts":["F-19"],"mutationDescription":"Append-only table erroneously grants UPDATE to readonly_user"}
CREATE TABLE public.feature_flags (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  supersedes_id uuid NULL,
  flag_key text NOT NULL,
  rollout_percentage integer NOT NULL DEFAULT 0,
  is_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feature_flags_pkey PRIMARY KEY (id),
  CONSTRAINT fk_feature_flags_supersedes_id FOREIGN KEY (supersedes_id) REFERENCES public.feature_flags (id) ON DELETE RESTRICT,
  CONSTRAINT uq_feature_flags_flag_key UNIQUE (flag_key),
  CONSTRAINT chk_feature_flags_rollout_percentage CHECK (rollout_percentage BETWEEN 0 AND 100)
);

CREATE INDEX idx_feature_flags_supersedes_id ON public.feature_flags (supersedes_id);

CREATE OR REPLACE FUNCTION public.fn_feature_flags_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Update/Delete operation rejected on audit log' USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER trg_feature_flags_reject_mutation
BEFORE UPDATE OR DELETE ON public.feature_flags
FOR EACH ROW
EXECUTE FUNCTION public.fn_feature_flags_reject_mutation();

REVOKE ALL ON TABLE public.feature_flags FROM PUBLIC, application, readonly_user;
GRANT SELECT, INSERT ON TABLE public.feature_flags TO application;
GRANT SELECT, UPDATE ON TABLE public.feature_flags TO readonly_user;
