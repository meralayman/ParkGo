-- =============================================================================
-- ParkGo — additive database changes (for teammates / staging / production)
-- =============================================================================
-- Safe to re-run: uses IF NOT EXISTS / IF EXISTS where possible.
-- Run as a superuser or owner of the objects (e.g. psql -U postgres -d your_db -f this_file.sql)
--
-- If your `users.id` is still INTEGER (older init-db), comment out section 2 until users are migrated
-- to UUID; otherwise CREATE refresh_tokens will fail.
-- =============================================================================

-- -----------------------------
-- 1) users — MFA (auth / ensureAuthSchema.js, mfa.js)
-- -----------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret TEXT;

-- -----------------------------
-- 2) refresh_tokens — JWT refresh sessions (authTokens.js)
--     REQUIRES: users.id is UUID. Comment out the whole block if you still have SERIAL id.
-- -----------------------------
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(token_hash)
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);

-- -----------------------------
-- 3) reservations — QR expiry, smart pricing, late fees (server.js, qrJwt.js, smartParking.js)
-- -----------------------------
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS qr_expires_at TIMESTAMPTZ;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS dynamic_hourly_rate DECIMAL(12,4);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS late_fee_applied BOOLEAN DEFAULT FALSE;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS late_fee_amount DECIMAL(12,2) DEFAULT 0;

-- Backfill QR wall-clock helper column from scheduled end (default: 3 hours after end; match QR_EXPIRE_HOURS_AFTER_END in backend .env)
UPDATE reservations
SET qr_expires_at = end_time + (3 * interval '1 hour')
WHERE qr_expires_at IS NULL
  AND end_time IS NOT NULL;

-- -----------------------------
-- 4) reservations — status CHECK aligned with API
--     (server.js ensureReservationsStatusConstraint; adjust if you use different legacy values)
-- -----------------------------
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_status_check;
UPDATE reservations SET status = 'confirmed' WHERE LOWER(TRIM(status)) IN ('active', 'pending');
UPDATE reservations SET status = 'closed' WHERE LOWER(TRIM(status)) IN ('completed', 'used');
UPDATE reservations SET status = 'checked_in' WHERE LOWER(TRIM(status)) IN ('check_in', 'checked-in');
UPDATE reservations SET status = 'cancelled' WHERE LOWER(TRIM(status)) IN ('expired', 'canceled');
UPDATE reservations SET status = 'confirmed'
WHERE status IS NULL
   OR TRIM(status) = ''
   OR LOWER(TRIM(status)) NOT IN ('confirmed', 'checked_in', 'closed', 'cancelled', 'no_show');
ALTER TABLE reservations ADD CONSTRAINT reservations_status_check
  CHECK (status IN ('confirmed', 'checked_in', 'closed', 'cancelled', 'no_show'));

-- -----------------------------
-- 5) logs — admin audit trail (auditLog.js, GET /admin/logs)
-- -----------------------------
CREATE TABLE IF NOT EXISTS logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID,
  action VARCHAR(500) NOT NULL,
  "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address VARCHAR(100)
);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs ("timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_logs_user_id ON logs (user_id);

-- Optional: grant to your app role (replace parkgo_user with your role name, or omit)
-- GRANT ALL ON TABLE logs TO parkgo_user;
-- GRANT USAGE, SELECT ON SEQUENCE logs_id_seq TO parkgo_user;

-- -----------------------------
-- 6) incident_reports — extra columns (server.js; additive only)
--     Prerequisite: table public.incident_reports exists. Skip this section if you do not use it.
--     Does not DROP/recreate the table (unlike a full UUID migration, which is manual).
-- -----------------------------
DO $$
BEGIN
  IF to_regclass('public.incident_reports') IS NULL THEN
    RAISE NOTICE 'Skipping incident_reports: table not found.';
    RETURN;
  END IF;
  ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS email VARCHAR(255);
  ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS reporter_type VARCHAR(20) DEFAULT 'user';
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'incident_reports'
      AND column_name = 'mobile' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE incident_reports ALTER COLUMN mobile DROP NOT NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'incident_reports'
      AND column_name = 'reservation_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE incident_reports ALTER COLUMN reservation_id DROP NOT NULL;
  END IF;
END
$$;

-- =============================================================================
-- End. Restart the API after running; the app also runs some of these on startup
-- (idempotent) but your DB should already match to avoid race issues.
-- =============================================================================
