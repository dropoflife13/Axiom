-- META: {"table":"audit_events","tenant":true,"append_only":true,"ingestion":false,"expectedFailedFacts":["F-20"],"mutationDescription":"Append-only trigger raises non-standard exception message"}
CREATE TABLE public.audit_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  supersedes_id uuid NULL,
  action_verb text NOT NULL,
  target_resource text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_events_pkey PRIMARY KEY (id),
  CONSTRAINT fk_audit_events_tenant_id FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
  CONSTRAINT fk_audit_events_actor_user_id FOREIGN KEY (actor_user_id) REFERENCES public.users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_audit_events_supersedes_id FOREIGN KEY (supersedes_id) REFERENCES public.audit_events (id) ON DELETE RESTRICT,
  CONSTRAINT chk_audit_events_action_verb CHECK (char_length(action_verb) > 0)
);

CREATE INDEX idx_audit_events_tenant_id_created_at ON public.audit_events (tenant_id, created_at DESC);
CREATE INDEX idx_audit_events_actor_user_id ON public.audit_events (actor_user_id);
CREATE INDEX idx_audit_events_supersedes_id ON public.audit_events (supersedes_id);

CREATE OR REPLACE FUNCTION public.fn_audit_events_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Audit log is immutable' USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER trg_audit_events_immutable
BEFORE UPDATE OR DELETE ON public.audit_events
FOR EACH ROW
EXECUTE FUNCTION public.fn_audit_events_reject_mutation();

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events FORCE ROW LEVEL SECURITY;

CREATE POLICY pol_audit_events_tenant_select ON public.audit_events
  FOR SELECT TO application, readonly_user
  USING (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE POLICY pol_audit_events_tenant_insert ON public.audit_events
  FOR INSERT TO application
  WITH CHECK (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE VIEW public.v_audit_events_summary
WITH (security_invoker = true)
AS
SELECT id, tenant_id, actor_user_id, supersedes_id, action_verb, target_resource, created_at
FROM public.audit_events;

REVOKE ALL ON TABLE public.audit_events FROM PUBLIC, application, readonly_user;
GRANT SELECT, INSERT ON TABLE public.audit_events TO application;
GRANT SELECT ON TABLE public.audit_events TO readonly_user;
GRANT SELECT ON TABLE public.v_audit_events_summary TO application, readonly_user;
