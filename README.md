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

The init script also seeds **24 parking slots** (`A1`–`D6` grid) so the public booking page and user dashboard show the same map. If you already ran an older `init-db.sql` with different slot names, either keep your data or add matching rows manually.

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

## Smart Parking Assistant (demand forecast)

The dashboard calls **`/api/forecast`** on the **Node backend (port 5000)**. Express proxies to the **Flask** demand app (`app.py`, default **port 5001**).

| Terminal | Command | Purpose |
|----------|---------|---------|
| (already) | `backend`: `npm start` | Express — must include `/api/forecast` |
| **extra** | From project root: `python app.py` (or set `FLASK_DEMAND_PORT`) | Loads `demand_model.pkl` and serves `/forecast` |

- **`REACT_APP_API_BASE_URL`** in the project root `.env` must be the **Express** URL, e.g. `http://127.0.0.1:5000`. Do **not** point it at Flask (`5001`) — that causes **404** on `/api/forecast` because Flask only exposes `/forecast`, not `/api/forecast`.
- In **`npm start` (development)**, the Smart Parking forecast uses the **relative** URL `/api/forecast`, which CRA forwards to Express via `package.json` `"proxy"` — so forecast works even if `.env` still mentions port 5001 by mistake.

---

## If something fails

- **"permission denied for table users"**  
  Run the init script again as postgres:  
  `psql -U postgres -d parkgo_db -f backend/scripts/init-db.sql`

- **Backend can’t connect to DB**  
  Check PostgreSQL is running and that `backend/.env` has the correct `DATABASE_URL` (user, password, database name).

- **Frontend can’t reach API**  
  Ensure the backend is running on port 5000. The frontend is set to use `http://localhost:5000`.

- **“Forecast unavailable (404)” on Smart Parking Assistant**  
  Point `REACT_APP_API_BASE_URL` at **port 5000** (Express), not 5001. Start **Flask** (`python app.py`) so Express can proxy forecast requests.

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
