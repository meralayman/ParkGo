# ParkGo – How to Run

## Prerequisites

- **Node.js** (v16 or newer)
- **PostgreSQL** installed and running (default port 5432)

---

## 1. Set up the database

Create the database and user (run once in PostgreSQL):

```sql
-- Connect as postgres, then run:
CREATE USER parkgo_user WITH PASSWORD 'StrongPassword123';
CREATE DATABASE parkgo_db OWNER parkgo_user;
\c parkgo_db
```

Then run the init script so the app can use the `users` table (avoids "permission denied for table users"):

**From the ParkGo project root:**

```bash
psql -U postgres -d parkgo_db -f backend/scripts/init-db.sql
```

*(On Windows, if `psql` is not in your PATH, use the full path to it, e.g. `"C:\Program Files\PostgreSQL\16\bin\psql"`.)*

---

## 2. Backend

```bash
cd backend
npm install
npm start
```

- API runs at **http://localhost:5000**
- Health check: http://localhost:5000/health

For auto-restart on file changes:

```bash
npm run dev
```

---

## 3. Frontend

In a **new terminal**, from the **ParkGo project root** (not inside `backend`):

```bash
npm install
npm start
```

- App runs at **http://localhost:3001** (or 3000 if 3001 is busy)
- Open that URL in the browser to use ParkGo

---

## Summary – two terminals

| Terminal | Directory      | Command     | URL              |
|----------|----------------|-------------|-------------------|
| 1        | `ParkGo/backend` | `npm start` | http://localhost:5000 |
| 2        | `ParkGo`         | `npm start` | http://localhost:3001 |

Keep both running. Use the frontend URL for login/signup.

---

## If something fails

- **"permission denied for table users"**  
  Run the init script again as postgres:  
  `psql -U postgres -d parkgo_db -f backend/scripts/init-db.sql`

- **Backend can’t connect to DB**  
  Check PostgreSQL is running and that `backend/.env` has the correct `DATABASE_URL` (user, password, database name).

- **Frontend can’t reach API**  
  Ensure the backend is running on port 5000. The frontend is set to use `http://localhost:5000`.

---

## Optional: Login with Gmail

To enable the "Continue with Gmail" button:

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/) and enable the **Google+ API** (or **People API**).
2. Create OAuth 2.0 credentials (Web application type). Add `http://localhost:3000` (and 3001) to Authorized JavaScript origins.
3. Create a `.env` file in the **ParkGo project root** (next to `package.json`):
   ```
   REACT_APP_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   ```
4. Restart the frontend (`npm start`).

---

## AI Parking Layout Planner (optional)

Plan estimated bay counts from a **lot photo** (aerial / top-down works best).

1. Install **Python 3.10+** and from the `ai-planner` folder run:

   ```bash
   cd ai-planner
   python -m venv .venv
   .venv\Scripts\activate
   pip install -r requirements.txt
   uvicorn main:app --reload --port 8000
   ```

2. In the project root `.env`, set (already added by default):

   `REACT_APP_AI_PLANNER_URL=http://localhost:8000`

3. Open **http://localhost:3000/ai-planner** in the browser.

See **`ai-planner/README.md`** for details. Results are **approximate** — not a replacement for professional survey.
