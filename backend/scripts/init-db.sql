-- Run this as PostgreSQL superuser (e.g. postgres) to fix "permission denied for table users".
-- From project root: psql -U postgres -d parkgo_db -f backend/scripts/init-db.sql
-- Or from backend: psql -U postgres -d parkgo_db -f scripts/init-db.sql

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

-- Grant full access to the app user (must match DATABASE_URL user, e.g. parkgo_user)
GRANT ALL ON TABLE users TO parkgo_user;
GRANT USAGE, SELECT ON SEQUENCE users_id_seq TO parkgo_user;

-- Parking slots table (used by API: slot_no, state 0=available 1=occupied 2=reserved)
CREATE TABLE IF NOT EXISTS parking_slots (
  slot_no VARCHAR(50) PRIMARY KEY,
  state INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
GRANT ALL ON TABLE parking_slots TO parkgo_user;

-- Seed 30 default parking slots (A-101..A-110, B-201..B-210, C-301..C-310)
-- Admin can add more via Dashboard > Manage Slots > Add Slot
INSERT INTO parking_slots (slot_no, state) VALUES
  ('A-101', 0), ('A-102', 0), ('A-103', 0), ('A-104', 0), ('A-105', 0),
  ('A-106', 0), ('A-107', 0), ('A-108', 0), ('A-109', 0), ('A-110', 0),
  ('B-201', 0), ('B-202', 0), ('B-203', 0), ('B-204', 0), ('B-205', 0),
  ('B-206', 0), ('B-207', 0), ('B-208', 0), ('B-209', 0), ('B-210', 0),
  ('C-301', 0), ('C-302', 0), ('C-303', 0), ('C-304', 0), ('C-305', 0),
  ('C-306', 0), ('C-307', 0), ('C-308', 0), ('C-309', 0), ('C-310', 0)
ON CONFLICT (slot_no) DO NOTHING;

-- Reservations table
CREATE TABLE IF NOT EXISTS reservations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  slot_no VARCHAR(50) NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  payment_method VARCHAR(50),
  total_amount DECIMAL(10,2) DEFAULT 0,
  qr_token VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
GRANT ALL ON TABLE reservations TO parkgo_user;
GRANT USAGE, SELECT ON SEQUENCE reservations_id_seq TO parkgo_user;
