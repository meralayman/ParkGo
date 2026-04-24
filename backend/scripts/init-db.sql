-- Run this as PostgreSQL superuser (e.g. postgres) to fix "permission denied for table users".
-- From project root: psql -U postgres -d parkgo_db -f backend/scripts/init-db.sql

-- Create users table if it doesn't exist (matches server.js schema)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  first_name VARCHAR(255) NOT NULL,
  last_name VARCHAR(255) NOT NULL,
  phone_number VARCHAR(50),
  national_id VARCHAR(50),
  username VARCHAR(255) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

GRANT ALL ON TABLE users TO parkgo_user;
GRANT USAGE, SELECT ON SEQUENCE users_id_seq TO parkgo_user;

CREATE TABLE IF NOT EXISTS parking_slots (
  slot_no VARCHAR(50) PRIMARY KEY,
  state INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
GRANT ALL ON TABLE parking_slots TO parkgo_user;

INSERT INTO parking_slots (slot_no, state) VALUES
  ('A1', 0), ('A2', 0), ('A3', 0), ('A4', 0), ('A5', 0), ('A6', 0),
  ('B1', 0), ('B2', 0), ('B3', 0), ('B4', 0), ('B5', 0), ('B6', 0),
  ('C1', 0), ('C2', 0), ('C3', 0), ('C4', 0), ('C5', 0), ('C6', 0),
  ('D1', 0), ('D2', 0), ('D3', 0), ('D4', 0), ('D5', 0), ('D6', 0)
ON CONFLICT (slot_no) DO NOTHING;

CREATE TABLE IF NOT EXISTS reservations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  slot_no VARCHAR(50) NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'confirmed',
  payment_method VARCHAR(50),
  total_amount DECIMAL(10,2) DEFAULT 0,
  qr_token VARCHAR(255),
  check_in_time TIMESTAMP WITH TIME ZONE,
  check_out_time TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
GRANT ALL ON TABLE reservations TO parkgo_user;
GRANT USAGE, SELECT ON SEQUENCE reservations_id_seq TO parkgo_user;

ALTER TABLE reservations ADD COLUMN IF NOT EXISTS check_in_time TIMESTAMP WITH TIME ZONE;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS check_out_time TIMESTAMP WITH TIME ZONE;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS late_fee_applied BOOLEAN DEFAULT FALSE;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS late_fee_amount DECIMAL(12,2) DEFAULT 0;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS dynamic_hourly_rate DECIMAL(12,4);

-- Status: confirmed | checked_in | closed | cancelled | no_show
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_status_check;
UPDATE reservations SET status = 'confirmed' WHERE status = 'active';
UPDATE reservations SET status = 'closed' WHERE status IN ('completed', 'used');
ALTER TABLE reservations ADD CONSTRAINT reservations_status_check
  CHECK (status IN ('confirmed', 'checked_in', 'closed', 'cancelled', 'no_show'));

CREATE TABLE IF NOT EXISTS incident_reports (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  gatekeeper_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reservation_id INTEGER REFERENCES reservations(id),
  full_name VARCHAR(255) NOT NULL,
  mobile VARCHAR(50),
  email VARCHAR(255),
  description TEXT NOT NULL,
  photo_filename VARCHAR(500),
  reporter_type VARCHAR(20) NOT NULL DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
GRANT ALL ON TABLE incident_reports TO parkgo_user;
GRANT USAGE, SELECT ON SEQUENCE incident_reports_id_seq TO parkgo_user;

-- Audit trail (also ensured at runtime in auditLog.js)
CREATE TABLE IF NOT EXISTS logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID,
  action VARCHAR(500) NOT NULL,
  "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address VARCHAR(100)
);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs ("timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_logs_user_id ON logs (user_id);
GRANT ALL ON TABLE logs TO parkgo_user;
GRANT USAGE, SELECT ON SEQUENCE logs_id_seq TO parkgo_user;
