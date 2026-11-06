-- META: {"table":"rate_limit_tiers","tenant":false,"append_only":true,"ingestion":false,"expectedFailedFacts":["F-19"],"mutationDescription":"Append-only table grants only SELECT (no INSERT) to application role"}
CREATE TABLE public.rate_limit_tiers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  supersedes_id uuid NULL,
  tier_slug text NOT NULL,
  requests_per_minute integer NOT NULL,
  burst_capacity integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rate_limit_tiers_pkey PRIMARY KEY (id),
  CONSTRAINT fk_rate_limit_tiers_supersedes_id FOREIGN KEY (supersedes_id) REFERENCES public.rate_limit_tiers (id) ON DELETE RESTRICT,
  CONSTRAINT uq_rate_limit_tiers_tier_slug UNIQUE (tier_slug),
  CONSTRAINT chk_rate_limit_tiers_requests_per_minute CHECK (requests_per_minute > 0),
  CONSTRAINT chk_rate_limit_tiers_burst_capacity CHECK (burst_capacity >= requests_per_minute)
);

CREATE INDEX idx_rate_limit_tiers_supersedes_id ON public.rate_limit_tiers (supersedes_id);

CREATE OR REPLACE FUNCTION public.fn_rate_limit_tiers_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Update/Delete operation rejected on audit log' USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER trg_rate_limit_tiers_reject_mutation
BEFORE UPDATE OR DELETE ON public.rate_limit_tiers
FOR EACH ROW
EXECUTE FUNCTION public.fn_rate_limit_tiers_reject_mutation();

REVOKE ALL ON TABLE public.rate_limit_tiers FROM PUBLIC, application, readonly_user;
GRANT SELECT ON TABLE public.rate_limit_tiers TO application;
GRANT SELECT ON TABLE public.rate_limit_tiers TO readonly_user;
