require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/* -------------------- ROOT -------------------- */
app.get("/", (req, res) => {
  res.json({
    name: "ParkGo API",
    message: "Backend is running. Use the frontend app to sign up or log in.",
    health: "/health",
    auth: { login: "POST /auth/login", signup: "POST /auth/signup" },
  });
});

/* -------------------- HEALTH -------------------- */
app.get("/health", async (req, res) => {
  try {
    const r = await pool.query("SELECT NOW() as now");
    res.json({ ok: true, dbTime: r.rows[0].now });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* -------------------- AUTH -------------------- */
app.post("/auth/signup", async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      phoneNumber,
      nationalId,
      username,
      email,
      password,
      role,
    } = req.body;

    if (!firstName || !lastName || !username || !email || !password) {
      return res.status(400).json({ ok: false, error: "Missing required fields" });
    }

    const userRole = (role || "user").toLowerCase();
    if (userRole === "admin") {
      return res.status(400).json({ ok: false, error: "Admin accounts cannot be created via signup" });
    }
    if (!["user", "gatekeeper"].includes(userRole)) {
      return res.status(400).json({ ok: false, error: "Invalid role. Choose User or Gatekeeper." });
    }

    const exists = await pool.query(
      "SELECT 1 FROM users WHERE email=$1 OR username=$2",
      [email, username]
    );
    if (exists.rowCount > 0) {
      return res.status(409).json({ ok: false, error: "Email or username already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const insert = await pool.query(
      `INSERT INTO users (first_name, last_name, phone_number, national_id, username, email, password_hash, role)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, first_name, last_name, username, email, role, created_at`,
      [firstName, lastName, phoneNumber || null, nationalId || null, username, email, passwordHash, userRole]
    );

    res.json({ ok: true, user: insert.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { email, usernameOrEmail, password } = req.body;
    const identifier = usernameOrEmail || email;
    if (!identifier || !password) {
      return res.status(400).json({ ok: false, error: "Username/email and password are required" });
    }

    const r = await pool.query(
      "SELECT id, first_name, last_name, username, email, role, password_hash FROM users WHERE email=$1 OR username=$1",
      [identifier]
    );

    if (r.rowCount === 0) {
      return res.status(401).json({ ok: false, error: "Invalid credentials" });
    }

    const user = r.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ ok: false, error: "Invalid credentials" });
    }

    delete user.password_hash;
    res.json({ ok: true, user });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/auth/google", async (req, res) => {
  try {
    const { accessToken } = req.body;
    if (!accessToken) {
      return res.status(400).json({ ok: false, error: "Google access token is required" });
    }
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const tokenData = await userInfoRes.json();
    if (tokenData.error) {
      return res.status(401).json({ ok: false, error: "Invalid Google credential" });
    }
    const { email, given_name, family_name } = tokenData;
    let r = await pool.query(
      "SELECT id, first_name, last_name, username, email, role FROM users WHERE email=$1",
      [email]
    );
    if (r.rowCount > 0) {
      const user = r.rows[0];
      return res.json({ ok: true, user });
    }
    const baseUsername = (email.split("@")[0] || "user").replace(/\W/g, "").slice(0, 20);
    let username = baseUsername;
    let suffix = 0;
    while (true) {
      const exists = await pool.query("SELECT 1 FROM users WHERE username=$1", [username]);
      if (exists.rowCount === 0) break;
      username = `${baseUsername}${++suffix}`;
    }
    const passwordHash = await bcrypt.hash(require("crypto").randomBytes(32).toString("hex"), 10);
    const insert = await pool.query(
      `INSERT INTO users (first_name, last_name, username, email, password_hash, role)
       VALUES ($1,$2,$3,$4,$5,'user')
       RETURNING id, first_name, last_name, username, email, role`,
      [given_name || "User", family_name || "", username, email, passwordHash]
    );
    res.json({ ok: true, user: insert.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* -------------------- SLOTS (parking_slots) -------------------- */
app.get("/slots", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT slot_no, state
       FROM parking_slots
       ORDER BY slot_no ASC`
    );
    res.json({ ok: true, slots: r.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* -------------------- RESERVATIONS (parking_slots) -------------------- */
const makeToken = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

/**
 * Create reservation:
 * - choose first available slot (state = 0)
 * - insert into reservations
 * - set slot state to 2 (reserved)
 */
app.post("/reservations", async (req, res) => {
  const client = await pool.connect();
  try {
    const { userId, startTime, endTime, totalAmount, paymentMethod } = req.body;

    if (!userId || !startTime || !endTime) {
      return res.status(400).json({ ok: false, error: "Missing required fields" });
    }

    await client.query("BEGIN");

    // lock one empty slot
    const slotRes = await client.query(
      `SELECT slot_no
       FROM parking_slots
       WHERE state = 0
       ORDER BY slot_no ASC
       LIMIT 1
       FOR UPDATE`
    );

    if (slotRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ ok: false, error: "No available parking slots" });
    }

    const slotNo = slotRes.rows[0].slot_no;
    const qrToken = makeToken();

    const ins = await client.query(
      `INSERT INTO reservations
        (user_id, slot_no, start_time, end_time, status, payment_method, total_amount, qr_token)
       VALUES ($1, $2, $3, $4, 'active', $5, $6, $7)
       RETURNING *`,
      [
        userId,
        slotNo,
        startTime,
        endTime,
        paymentMethod || null,
        totalAmount || 0,
        qrToken,
      ]
    );

    // mark slot reserved (2)
    await client.query(
      `UPDATE parking_slots
       SET state = 2, updated_at = NOW()
       WHERE slot_no = $1`,
      [slotNo]
    );

    await client.query("COMMIT");
    return res.json({ ok: true, reservation: ins.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    return res.status(500).json({ ok: false, error: err.message });
  } finally {
    client.release();
  }
});

app.get("/reservations/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const r = await pool.query(
      `SELECT r.*
       FROM reservations r
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC`,
      [userId]
    );

    res.json({ ok: true, reservations: r.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* -------------------- ADMIN: list users -------------------- */
app.get("/admin/users", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, first_name, last_name, email, username, phone_number, national_id, role, created_at
       FROM users
       ORDER BY created_at DESC`
    );
    res.json({ ok: true, users: r.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* -------------------- ADMIN: single user detailed history -------------------- */
app.get("/admin/users/:id/history", async (req, res) => {
  try {
    const { id } = req.params;
    const userRes = await pool.query(
      `SELECT id, first_name, last_name, email, username, phone_number, national_id, role, created_at
       FROM users WHERE id = $1`,
      [id]
    );
    if (userRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "User not found" });
    }
    const reservationsRes = await pool.query(
      `SELECT id, slot_no, start_time, end_time, status, payment_method, total_amount, created_at
       FROM reservations WHERE user_id = $1 ORDER BY created_at DESC`,
      [id]
    );
    const reservations = reservationsRes.rows;
    const paymentSummary = reservations.reduce(
      (acc, r) => {
        const amount = Number(r.total_amount) || 0;
        acc.totalSpent += amount;
        acc.reservationCount += 1;
        const method = (r.payment_method || "other").toLowerCase();
        acc.byMethod[method] = (acc.byMethod[method] || 0) + amount;
        return acc;
      },
      { totalSpent: 0, reservationCount: 0, byMethod: {} }
    );
    res.json({
      ok: true,
      user: userRes.rows[0],
      reservations,
      paymentSummary,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* -------------------- ADMIN: update user -------------------- */
app.patch("/admin/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { first_name, last_name, phone_number, national_id, role, password } = req.body;
    const updates = [];
    const values = [];
    let pos = 1;
    if (first_name !== undefined) { updates.push(`first_name = $${pos++}`); values.push(first_name); }
    if (last_name !== undefined) { updates.push(`last_name = $${pos++}`); values.push(last_name); }
    if (phone_number !== undefined) { updates.push(`phone_number = $${pos++}`); values.push(phone_number); }
    if (national_id !== undefined) { updates.push(`national_id = $${pos++}`); values.push(national_id); }
    if (role !== undefined) {
      const r = (role || "user").toLowerCase();
      if (!["user", "gatekeeper", "admin"].includes(r)) {
        return res.status(400).json({ ok: false, error: "Invalid role" });
      }
      updates.push(`role = $${pos++}`);
      values.push(r);
    }
    if (password !== undefined && password !== "") {
      const passwordHash = await bcrypt.hash(password, 10);
      updates.push(`password_hash = $${pos++}`);
      values.push(passwordHash);
    }
    if (updates.length === 0) {
      return res.status(400).json({ ok: false, error: "No fields to update" });
    }
    values.push(id);
    const r = await pool.query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = $${pos} RETURNING id, first_name, last_name, email, username, role, created_at`,
      values
    );
    if (r.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "User not found" });
    }
    res.json({ ok: true, user: r.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* -------------------- ADMIN: create user -------------------- */
app.post("/admin/users", async (req, res) => {
  try {
    const { first_name, last_name, email, username, password, phone_number, national_id, role } = req.body;
    if (!first_name || !last_name || !email || !username || !password) {
      return res.status(400).json({ ok: false, error: "Missing required fields" });
    }
    const userRole = (role || "user").toLowerCase();
    if (userRole === "admin") {
      return res.status(400).json({ ok: false, error: "Cannot create admin via this endpoint" });
    }
    if (!["user", "gatekeeper"].includes(userRole)) {
      return res.status(400).json({ ok: false, error: "Invalid role" });
    }
    const exists = await pool.query(
      "SELECT 1 FROM users WHERE email = $1 OR username = $2",
      [email, username]
    );
    if (exists.rowCount > 0) {
      return res.status(409).json({ ok: false, error: "Email or username already exists" });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const ins = await pool.query(
      `INSERT INTO users (first_name, last_name, phone_number, national_id, username, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, first_name, last_name, username, email, role, created_at`,
      [first_name, last_name, phone_number || null, national_id || null, username, email, passwordHash, userRole]
    );
    res.status(201).json({ ok: true, user: ins.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* -------------------- ADMIN: delete user -------------------- */
app.delete("/admin/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const r = await pool.query("DELETE FROM users WHERE id = $1 RETURNING id", [id]);
    if (r.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "User not found" });
    }
    res.json({ ok: true });
  } catch (err) {
    if (err.code === "23503") {
      return res.status(409).json({ ok: false, error: "Cannot delete user with existing reservations" });
    }
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* -------------------- ADMIN: all reservations + payment details -------------------- */
app.get("/admin/reservations", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT r.id, r.user_id, r.slot_no, r.start_time, r.end_time, r.status,
              r.payment_method, r.total_amount, r.qr_token, r.created_at,
              u.first_name, u.last_name, u.email
       FROM reservations r
       JOIN users u ON r.user_id = u.id
       ORDER BY r.created_at DESC`
    );
    res.json({ ok: true, reservations: r.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* -------------------- ADMIN: add slot -------------------- */
app.post("/admin/slots", async (req, res) => {
  try {
    const { slot_no } = req.body;
    if (!slot_no || String(slot_no).trim() === "") {
      return res.status(400).json({ ok: false, error: "slot_no is required" });
    }
    const name = String(slot_no).trim();
    const exists = await pool.query("SELECT 1 FROM parking_slots WHERE slot_no = $1", [name]);
    if (exists.rowCount > 0) {
      return res.status(409).json({ ok: false, error: "Slot already exists" });
    }
    const r = await pool.query(
      `INSERT INTO parking_slots (slot_no, state, updated_at) VALUES ($1, 0, NOW()) RETURNING slot_no, state`,
      [name]
    );
    res.status(201).json({ ok: true, slot: r.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* -------------------- ADMIN: update slot state -------------------- */
app.patch("/admin/slots/:slotNo", async (req, res) => {
  try {
    const { slotNo } = req.params;
    const { state } = req.body;
    const stateNum = parseInt(state, 10);
    if (![0, 1, 2].includes(stateNum)) {
      return res.status(400).json({ ok: false, error: "state must be 0 (available), 1 (occupied), or 2 (reserved)" });
    }
    const r = await pool.query(
      `UPDATE parking_slots SET state = $1, updated_at = NOW() WHERE slot_no = $2 RETURNING slot_no, state`,
      [stateNum, slotNo]
    );
    if (r.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "Slot not found" });
    }
    res.json({ ok: true, slot: r.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * Cancel reservation:
 * - set reservation status = cancelled
 * - free the slot back to empty (0)
 */
app.patch("/reservations/:id/cancel", async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    await client.query("BEGIN");

    const r = await client.query(
      "SELECT id, slot_no, status FROM reservations WHERE id = $1 FOR UPDATE",
      [id]
    );

    if (r.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, error: "Reservation not found" });
    }

    const row = r.rows[0];

    if (row.status !== "active") {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, error: "Reservation is not active" });
    }

    await client.query(
      "UPDATE reservations SET status = 'cancelled' WHERE id = $1",
      [id]
    );

    await client.query(
      `UPDATE parking_slots
       SET state = 0, updated_at = NOW()
       WHERE slot_no = $1`,
      [row.slot_no]
    );

    await client.query("COMMIT");
    return res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    return res.status(500).json({ ok: false, error: err.message });
  } finally {
    client.release();
  }
});
// -------------------- GATEKEEPER --------------------

// 1) Scan/validate QR token
app.get("/gate/scan/:token", async (req, res) => {
  try {
    const { token } = req.params;

    const r = await pool.query(
      `SELECT id, user_id, slot_no, start_time, end_time, status, qr_token, created_at
       FROM reservations
       WHERE qr_token = $1`,
      [token]
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "Invalid QR / Reservation not found" });
    }

    const reservation = r.rows[0];

    if (reservation.status !== "active") {
      return res.status(400).json({ ok: false, error: `Reservation is not active (status: ${reservation.status})` });
    }

    // Optional: time validation (recommended)
    const now = new Date();
    const start = new Date(reservation.start_time);
    const end = new Date(reservation.end_time);

    // allow 30 minutes early entry
    const startAllowed = new Date(start.getTime() - 30 * 60 * 1000);

    if (now < startAllowed) {
      return res.status(400).json({ ok: false, error: "Too early for this reservation" });
    }
    if (now > end) {
      return res.status(400).json({ ok: false, error: "Reservation time ended" });
    }

    return res.json({ ok: true, reservation });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// 2) Open gate (confirm entry) + update states
app.post("/gate/open", async (req, res) => {
  const client = await pool.connect();
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ ok: false, error: "Missing token" });
    }

    await client.query("BEGIN");

    const r = await client.query(
      `SELECT id, slot_no, status
       FROM reservations
       WHERE qr_token = $1
       FOR UPDATE`,
      [token]
    );

    if (r.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, error: "Reservation not found" });
    }

    const reservation = r.rows[0];

    if (reservation.status !== "active") {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, error: `Reservation not active (status: ${reservation.status})` });
    }

    // mark reservation as used/checked_in
    await client.query(
      `UPDATE reservations
       SET status = 'used'
       WHERE id = $1`,
      [reservation.id]
    );

    // update slot -> occupied (1)
    await client.query(
      `UPDATE parking_slots
       SET state = 1, updated_at = NOW()
       WHERE slot_no = $1`,
      [reservation.slot_no]
    );

    await client.query("COMMIT");

    // simulate gate open response
    return res.json({ ok: true, message: "Gate opened", slotNo: reservation.slot_no });
  } catch (err) {
    await client.query("ROLLBACK");
    return res.status(500).json({ ok: false, error: err.message });
  } finally {
    client.release();
  }
});

/* -------------------- ENSURE ADMIN IN DB -------------------- */
async function ensureAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminUsername = process.env.ADMIN_USERNAME || "admin";
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.warn("ADMIN_EMAIL and ADMIN_PASSWORD not set — no admin user will be created.");
    return;
  }

  try {
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [adminEmail]);
    if (existing.rowCount > 0) return;

    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await pool.query(
      `INSERT INTO users (first_name, last_name, username, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5, 'admin')`,
      ["Admin", "User", adminUsername, adminEmail, passwordHash]
    );
    console.log("Admin user created in database.");
  } catch (err) {
    console.error("Failed to ensure admin user:", err.message);
  }
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  await ensureAdmin();
  console.log(`API running on http://localhost:${PORT}`);
});
