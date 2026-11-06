-- META: {"table":"key_rotation_events","tenant":false,"append_only":true,"ingestion":false,"expectedFailedFacts":["F-17"],"mutationDescription":"Check constraint named ck_key_rotation_events_key_version instead of chk_..."}
CREATE TABLE public.key_rotation_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  supersedes_id uuid NULL,
  key_alias text NOT NULL,
  key_version integer NOT NULL,
  algorithm text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT key_rotation_events_pkey PRIMARY KEY (id),
  CONSTRAINT fk_key_rotation_events_supersedes_id FOREIGN KEY (supersedes_id) REFERENCES public.key_rotation_events (id) ON DELETE RESTRICT,
  CONSTRAINT uq_key_rotation_events_key_alias_key_version UNIQUE (key_alias, key_version),
  CONSTRAINT ck_key_rotation_events_key_version CHECK (key_version > 0)
);

CREATE INDEX idx_key_rotation_events_supersedes_id ON public.key_rotation_events (supersedes_id);

CREATE OR REPLACE FUNCTION public.fn_key_rotation_events_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Update/Delete operation rejected on audit log' USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER trg_key_rotation_events_immutable
BEFORE UPDATE OR DELETE ON public.key_rotation_events
FOR EACH ROW
EXECUTE FUNCTION public.fn_key_rotation_events_reject_mutation();

REVOKE ALL ON TABLE public.key_rotation_events FROM PUBLIC, application, readonly_user;
GRANT SELECT, INSERT ON TABLE public.key_rotation_events TO application;
GRANT SELECT ON TABLE public.key_rotation_events TO readonly_user;
