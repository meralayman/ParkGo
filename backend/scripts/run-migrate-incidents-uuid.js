/**
 * Applies migrate-incident-reports-uuid.sql using DATABASE_URL (usually parkgo_user).
 * If you see "permission denied for schema public", run full-incident-migrate-uuid.sql
 * as superuser (postgres) instead — see script header.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const sqlPath = path.join(__dirname, "migrate-incident-reports-uuid.sql");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Use backend/.env");
    process.exit(1);
  }
  const sql = fs.readFileSync(sqlPath, "utf8");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(sql);
    console.log("OK: incident_reports migrated (UUID FKs).");
  } catch (e) {
    if (e && e.code === "42501") {
      console.error(
        "Permission denied. Run this file as PostgreSQL superuser (postgres):\n" +
          "  psql -U postgres -d parkgo_db -f backend/scripts/full-incident-migrate-uuid.sql\n" +
          "Or open backend/scripts/full-incident-migrate-uuid.sql in pgAdmin and execute as postgres."
      );
    }
    console.error(e.message || e);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
