-- Run in Supabase SQL Editor, or: npm run supabase:setup
-- Private application schema. Keep it OUT of Supabase Data API exposed schemas.
-- This migration is additive and safe to rerun; it never deletes customer data.
BEGIN;
CREATE SCHEMA IF NOT EXISTS rracer;
REVOKE ALL ON SCHEMA rracer FROM PUBLIC;

DO $migration$
DECLARE entity text;
BEGIN
  FOREACH entity IN ARRAY ARRAY['users','cars','images','bookings','slots','enquiries','settings','audit','sessions','notifications'] LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS rracer.%I (id text PRIMARY KEY, payload jsonb NOT NULL, CHECK (jsonb_typeof(payload) = ''object'' AND payload->>''_id'' IS NOT NULL AND payload->>''_id'' = id))', entity);
    EXECUTE format('ALTER TABLE rracer.%I ENABLE ROW LEVEL SECURITY', entity);
    EXECUTE format('REVOKE ALL ON TABLE rracer.%I FROM PUBLIC', entity);
  END LOOP;
END $migration$;

CREATE TABLE IF NOT EXISTS rracer.media (
  id text PRIMARY KEY,
  object_path text UNIQUE NOT NULL,
  mime text NOT NULL CHECK (mime IN ('image/webp','image/jpeg','image/png')),
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rracer.migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE rracer.media ENABLE ROW LEVEL SECURITY;
ALTER TABLE rracer.migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA rracer FROM PUBLIC;
-- Supabase roles do not exist on a plain local PostgreSQL test server.
DO $roles$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA rracer FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA rracer FROM %I', role_name);
    END IF;
  END LOOP;
END $roles$;
ALTER DEFAULT PRIVILEGES IN SCHEMA rracer REVOKE ALL ON TABLES FROM PUBLIC;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON rracer.users (lower(payload->>'email'));
CREATE UNIQUE INDEX IF NOT EXISTS slots_car_day_unique ON rracer.slots ((payload->>'carId'), (payload->>'day'));
CREATE INDEX IF NOT EXISTS sessions_user ON rracer.sessions ((payload->>'userId'));
CREATE INDEX IF NOT EXISTS sessions_expiry ON rracer.sessions ((payload->>'expiresAt'));
CREATE INDEX IF NOT EXISTS bookings_car ON rracer.bookings ((payload->>'carId'));
CREATE INDEX IF NOT EXISTS bookings_user ON rracer.bookings ((payload->>'userId'));
CREATE INDEX IF NOT EXISTS slots_booking ON rracer.slots ((payload->>'bookingId'));
CREATE INDEX IF NOT EXISTS enquiries_created ON rracer.enquiries ((payload->>'createdAt'));
INSERT INTO rracer.migrations(id) VALUES ('001_rracer') ON CONFLICT DO NOTHING;
COMMIT;
