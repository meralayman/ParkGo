# Database setup

If you see **"permission denied for table users"** when signing up, or **"relation \"slots\" does not exist"** when making a reservation, the database tables have not been created. Run the init script as a PostgreSQL superuser (e.g. `postgres`).

## Admin user (login only, no signup)

The admin account is stored in the database and can only log in with email and password (no signup). Set these in your backend `.env` so the server can create the admin on startup if it doesn’t exist:

- `ADMIN_EMAIL` – admin login email
- `ADMIN_PASSWORD` – admin login password
- `ADMIN_USERNAME` – (optional) defaults to `"admin"`

From the project root:

```bash
psql -U postgres -d parkgo_db -f backend/scripts/init-db.sql
```

Or from the `backend` folder:

```bash
psql -U postgres -d parkgo_db -f scripts/init-db.sql
```

This creates the `users`, `slots`, and `reservations` tables if they don’t exist and grants the required permissions to `parkgo_user` (the user in your `DATABASE_URL`). Ensure the database `parkgo_db` and user `parkgo_user` exist; create them with postgres if needed, then run the init script.
