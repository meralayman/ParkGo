-- Run this as PostgreSQL superuser (e.g. postgres) to fix
-- "password authentication failed for user parkgo_user"
--
-- From backend folder:
--   psql -U postgres -f scripts/setup-user-and-db.sql
--
-- Or: open pgAdmin, connect as postgres, open Query Tool, paste and run.

-- Create app user and database (ignore errors if they already exist)
CREATE USER parkgo_user WITH PASSWORD 'Parkgo123';

-- Create database (connect to 'postgres' or 'template1' when running this)
CREATE DATABASE parkgo_db OWNER parkgo_user;

-- If parkgo_user already existed with wrong password, this updates it:
-- ALTER USER parkgo_user WITH PASSWORD 'Parkgo123';

-- Allow parkgo_user to connect to parkgo_db (default for new DB)
-- No extra steps needed; OWNER can connect.
