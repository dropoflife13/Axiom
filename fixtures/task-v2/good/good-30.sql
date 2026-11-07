-- META: {"table":"rate_limit_tiers","tenant":false,"append_only":false,"ingestion":false,"sec_definer":true}
CREATE TABLE public.rate_limit_tiers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tier_slug text NOT NULL,
  requests_per_minute integer NOT NULL,
  burst_capacity integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT rate_limit_tiers_pkey PRIMARY KEY (id),
  CONSTRAINT uq_rate_limit_tiers_tier_slug UNIQUE (tier_slug),
  CONSTRAINT chk_rate_limit_tiers_requests_per_minute CHECK (requests_per_minute > 0),
  CONSTRAINT chk_rate_limit_tiers_burst_capacity CHECK (burst_capacity >= requests_per_minute)
);

CREATE OR REPLACE FUNCTION public.fn_rate_limit_tiers_set_updated_at()
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

CREATE TRIGGER trg_rate_limit_tiers_set_updated_at
BEFORE UPDATE ON public.rate_limit_tiers
FOR EACH ROW
EXECUTE FUNCTION public.fn_rate_limit_tiers_set_updated_at();

REVOKE ALL ON TABLE public.rate_limit_tiers FROM PUBLIC, application, readonly_user;
GRANT SELECT, INSERT, UPDATE ON TABLE public.rate_limit_tiers TO application;
GRANT SELECT ON TABLE public.rate_limit_tiers TO readonly_user;
