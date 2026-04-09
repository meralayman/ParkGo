-- ParkGo: incident_reports must reference users(id) with the same type as users.id.
-- If users.id is UUID, user_id and gatekeeper_id must be UUID (not integer).
--
-- Run as superuser (e.g. postgres), replacing database name if needed:
--   psql -U postgres -d parkgo_db -f backend/scripts/migrate-incident-reports-uuid.sql
--
DROP TABLE IF EXISTS incident_reports CASCADE;

CREATE TABLE incident_reports (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  gatekeeper_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reservation_id UUID REFERENCES reservations(id),
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

ALTER TABLE incident_reports OWNER TO parkgo_user;
