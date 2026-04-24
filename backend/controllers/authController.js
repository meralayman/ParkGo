const bcrypt = require("bcrypt");
const {
  issueTokenPair,
  rotateRefreshToken,
  revokeRefreshTokenForUser,
  stripUser,
} = require("../authTokens");
const {
  isValidRegisterEmail,
  validateRegisterPasswordRules,
  validatePasswordsMatch,
  INVALID_EMAIL_MESSAGE,
} = require("../utils/authValidation");
const { clientIp } = require("../auditLog");

/** Only fields that may be returned from GET /auth/me (no secrets or tokens). */
const ME_USER_KEYS = [
  "id",
  "first_name",
  "last_name",
  "username",
  "email",
  "phone_number",
  "role",
  "mfa_enabled",
  "created_at",
];

function pickPublicMeUser(row) {
  if (!row) return null;
  const o = {};
  for (const k of ME_USER_KEYS) {
    if (Object.prototype.hasOwnProperty.call(row, k)) o[k] = row[k];
  }
  return o;
}

/**
 * @param {object} deps
 * @param {import("pg").Pool} deps.pool
 * @param {(err: Error) => string} deps.apiError
 * @param {function} [deps.logAudit] — (pool, { userId, action, ip }) from auditLog.js
 */
function createAuthController({ pool, apiError, logAudit: logAuditFn }) {
  const writeAudit = typeof logAuditFn === "function" ? logAuditFn : () => {};
  const USER_ROW_PUBLIC =
    "id, first_name, last_name, username, email, phone_number, role, mfa_enabled, created_at";

  function fail400(res, message) {
    return res.status(400).json({ ok: false, message, error: message });
  }

  async function signup(req, res) {
    try {
      const {
        firstName,
        lastName,
        phoneNumber,
        nationalId,
        username,
        email,
        password,
        confirmPassword,
        role,
      } = req.body;

      if (!firstName || !lastName || !username || !email || !password) {
        const msg = "Missing required fields";
        return res.status(400).json({ ok: false, message: msg, error: msg });
      }

      if (!isValidRegisterEmail(email)) {
        return fail400(res, INVALID_EMAIL_MESSAGE);
      }

      const pwRules = validateRegisterPasswordRules(password);
      if (!pwRules.ok) {
        return fail400(res, pwRules.message);
      }

      /* If client omits confirmPassword (older clients), treat as match with password. */
      const effectiveConfirm =
        confirmPassword !== undefined && confirmPassword !== null ? confirmPassword : password;
      const match = validatePasswordsMatch(password, effectiveConfirm);
      if (!match.ok) {
        return fail400(res, match.message);
      }

      const userRole = (role || "user").toLowerCase();
      if (userRole === "admin") {
        return fail400(res, "Admin accounts cannot be created via signup");
      }
      if (!["user", "gatekeeper"].includes(userRole)) {
        return fail400(res, "Invalid role. Choose User or Gatekeeper.");
      }

      const exists = await pool.query("SELECT 1 FROM users WHERE email=$1 OR username=$2", [
        email,
        username,
      ]);
      if (exists.rowCount > 0) {
        const msg = "Email or username already exists";
        return res.status(409).json({ ok: false, message: msg, error: msg });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const insert = await pool.query(
        `INSERT INTO users (first_name, last_name, phone_number, national_id, username, email, password_hash, role)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING ${USER_ROW_PUBLIC}`,
        [firstName, lastName, phoneNumber || null, nationalId || null, username, email, passwordHash, userRole]
      );

      const user = insert.rows[0];
      const tokens = await issueTokenPair(pool, user);
      return res.json({
        ok: true,
        user: tokens.user,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: apiError(err) });
    }
  }

  async function login(req, res) {
    try {
      const { email, usernameOrEmail, password } = req.body;
      const identifier = usernameOrEmail || email;
      if (!identifier || !password) {
        const msg = "Username/email and password are required";
        return res.status(400).json({ ok: false, message: msg, error: msg });
      }

      const r = await pool.query(
        `SELECT ${USER_ROW_PUBLIC}, password_hash
         FROM users
         WHERE email = $1 OR username = $1`,
        [identifier]
      );

      if (r.rowCount === 0) {
        writeAudit(pool, {
          userId: null,
          action: "AUTH: Login failed — no matching user for given email/username",
          ip: clientIp(req),
        });
        const msg = "Invalid credentials";
        return res.status(401).json({ ok: false, message: msg, error: msg });
      }

      const user = r.rows[0];
      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) {
        writeAudit(pool, {
          userId: user.id,
          action: `AUTH: Login failed — wrong password (user ${user.id})`,
          ip: clientIp(req),
        });
        const msg = "Invalid credentials";
        return res.status(401).json({ ok: false, message: msg, error: msg });
      }

      delete user.password_hash;
      const tokens = await issueTokenPair(pool, user);
      writeAudit(pool, {
        userId: user.id,
        action: `AUTH: User ${user.id} logged in successfully`,
        ip: clientIp(req),
      });
      return res.json({
        ok: true,
        user: tokens.user,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: apiError(err) });
    }
  }

  async function refresh(req, res) {
    try {
      const raw = req.body && req.body.refreshToken;
      if (!raw || typeof raw !== "string") {
        const msg = "refreshToken is required";
        return res.status(400).json({ ok: false, message: msg, error: msg });
      }
      const out = await rotateRefreshToken(pool, raw);
      if (!out) {
        const errMsg = "Invalid or expired refresh token";
        return res.status(401).json({ ok: false, message: errMsg, error: errMsg });
      }
      return res.json({
        ok: true,
        accessToken: out.accessToken,
        refreshToken: out.refreshToken,
        user: out.user,
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: apiError(err) });
    }
  }

  async function logout(req, res) {
    try {
      const raw = req.body && req.body.refreshToken;
      if (!raw || typeof raw !== "string") {
        return fail400(res, "refreshToken is required");
      }
      await revokeRefreshTokenForUser(pool, req.authUserId, raw);
      return res.status(200).json({ ok: true, message: "Logged out successfully" });
    } catch (err) {
      return res.status(500).json({ ok: false, error: apiError(err) });
    }
  }

  async function me(req, res) {
    try {
      const id = req.authUserId;
      if (!id) {
        const msg = "Access token required";
        return res.status(401).json({ ok: false, message: msg, error: msg });
      }
      const r = await pool.query(`SELECT ${USER_ROW_PUBLIC} FROM users WHERE id = $1`, [id]);
      if (r.rowCount === 0) {
        const msg = "User not found";
        return res.status(404).json({ ok: false, message: msg, error: msg });
      }
      return res.json({ ok: true, user: pickPublicMeUser(stripUser(r.rows[0])) });
    } catch (err) {
      return res.status(500).json({ ok: false, error: apiError(err) });
    }
  }

  async function google(req, res) {
    try {
      const { accessToken: googleAt } = req.body;
      if (!googleAt) {
        const msg = "Google access token is required";
        return res.status(400).json({ ok: false, message: msg, error: msg });
      }
      const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${googleAt}` },
      });
      const tokenData = await userInfoRes.json();
      if (tokenData.error) {
        const msg = "Invalid Google credential";
        return res.status(401).json({ ok: false, message: msg, error: msg });
      }
      const { email, given_name, family_name } = tokenData;
      let r = await pool.query(`SELECT ${USER_ROW_PUBLIC} FROM users WHERE email = $1`, [email]);
      if (r.rowCount > 0) {
        const user = r.rows[0];
        const tokens = await issueTokenPair(pool, user);
        return res.json({
          ok: true,
          user: tokens.user,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        });
      }
      const baseUsername = (email.split("@")[0] || "user").replace(/\W/g, "").slice(0, 20);
      let username = baseUsername;
      let suffix = 0;
      while (true) {
        const exists = await pool.query("SELECT 1 FROM users WHERE username = $1", [username]);
        if (exists.rowCount === 0) break;
        username = `${baseUsername}${++suffix}`;
      }
      const randomHash = await bcrypt.hash(require("crypto").randomBytes(32).toString("hex"), 10);
      const insert = await pool.query(
        `INSERT INTO users (first_name, last_name, username, email, password_hash, role)
         VALUES ($1, $2, $3, $4, $5, 'user')
         RETURNING ${USER_ROW_PUBLIC}`,
        [given_name || "User", family_name || "", username, email, randomHash]
      );
      const user = insert.rows[0];
      const tokens = await issueTokenPair(pool, user);
      return res.json({
        ok: true,
        user: tokens.user,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: apiError(err) });
    }
  }

  return {
    signup,
    register: signup,
    login,
    refresh,
    logout,
    me,
    google,
  };
}

module.exports = { createAuthController };
