const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES || "15m";
const REFRESH_DAYS = Number(process.env.JWT_REFRESH_DAYS) || 7;
const MFA_PENDING_EXPIRES = process.env.JWT_MFA_PENDING_EXPIRES || "10m";

function accessSecret() {
  const s = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
  if (!s) {
    console.warn(
      "[ParkGo] JWT_ACCESS_SECRET (or JWT_SECRET) not set — using insecure dev default. Set it in production."
    );
    return "parkgo-dev-access-secret-change-me";
  }
  return s;
}

function mfaPendingSecret() {
  const s = process.env.JWT_MFA_PENDING_SECRET || process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
  if (!s) {
    return `${accessSecret()}:mfa-pending`;
  }
  return s;
}

function hashRefreshToken(raw) {
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

function stripUser(row) {
  if (!row) return null;
  const u = { ...row };
  delete u.password_hash;
  delete u.mfa_secret;
  return u;
}

async function ensureRefreshTokensTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id SERIAL PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash VARCHAR(64) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(token_hash)
    );
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);`
  );
}

function signAccessToken(user) {
  const sub = String(user.id);
  const role = String(user.role || "user");
  return jwt.sign({ sub, role, typ: "access" }, accessSecret(), { expiresIn: ACCESS_EXPIRES });
}

/**
 * @param {string} [token] raw JWT (no "Bearer" prefix)
 * @returns {{ kind: "ok", userId: string, role: string } | { kind: "expired" } | { kind: "invalid" } | { kind: "missing" }}
 */
function verifyAccessTokenResult(token) {
  if (token == null) return { kind: "missing" };
  if (typeof token !== "string" || !token.trim()) {
    return { kind: "missing" };
  }
  try {
    const payload = jwt.verify(token.trim(), accessSecret());
    if (payload.typ !== "access") return { kind: "invalid" };
    const sub = String(payload.sub || "").trim();
    if (!sub) return { kind: "invalid" };
    return { kind: "ok", userId: sub, role: String(payload.role || "") };
  } catch (e) {
    if (e && e.name === "TokenExpiredError") {
      return { kind: "expired" };
    }
    return { kind: "invalid" };
  }
}

async function storeRefreshToken(pool, userId, rawRefresh) {
  const tokenHash = hashRefreshToken(rawRefresh);
  const expiresAt = new Date(Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000);
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt]
  );
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} user - row from users (must include id, role; may include password_hash — stripped in response)
 */
async function issueTokenPair(pool, user) {
  const publicUser = stripUser(user);
  const accessToken = signAccessToken(publicUser);
  const refreshToken = crypto.randomBytes(32).toString("hex");
  await storeRefreshToken(pool, user.id, refreshToken);
  return {
    accessToken,
    refreshToken,
    user: publicUser,
  };
}

function verifyAccessToken(token) {
  const r = verifyAccessTokenResult(token);
  if (r.kind !== "ok") return null;
  return { userId: r.userId, role: r.role };
}

function signMfaPendingToken(userId) {
  return jwt.sign({ sub: String(userId), typ: "mfa_pending" }, mfaPendingSecret(), {
    expiresIn: MFA_PENDING_EXPIRES,
  });
}

/** @returns {string|null} user id */
function verifyMfaPendingToken(token) {
  if (!token || typeof token !== "string") return null;
  try {
    const payload = jwt.verify(token, mfaPendingSecret());
    if (payload.typ !== "mfa_pending") return null;
    const sub = String(payload.sub || "").trim();
    return sub || null;
  } catch {
    return null;
  }
}

/**
 * Rotate refresh token: remove old hash, insert new, return new pair + user from DB.
 */
async function rotateRefreshToken(pool, rawRefresh) {
  const tokenHash = hashRefreshToken(rawRefresh);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query(
      `SELECT id, user_id FROM refresh_tokens
       WHERE token_hash = $1 AND expires_at > NOW()
       FOR UPDATE`,
      [tokenHash]
    );
    if (r.rowCount === 0) {
      await client.query("ROLLBACK");
      return null;
    }
    const userId = r.rows[0].user_id;
    await client.query(`DELETE FROM refresh_tokens WHERE id = $1`, [r.rows[0].id]);

    const u = await client.query(
      `SELECT id, first_name, last_name, username, email, phone_number, role, mfa_enabled, created_at
       FROM users WHERE id = $1`,
      [userId]
    );
    if (u.rowCount === 0) {
      await client.query("ROLLBACK");
      return null;
    }
    const user = u.rows[0];
    const newRefresh = crypto.randomBytes(32).toString("hex");
    const newHash = hashRefreshToken(newRefresh);
    const expiresAt = new Date(Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000);
    await client.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [userId, newHash, expiresAt]
    );
    await client.query("COMMIT");
    const accessToken = signAccessToken(user);
    return {
      accessToken,
      refreshToken: newRefresh,
      user: stripUser(user),
    };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}

async function revokeRefreshToken(pool, rawRefresh) {
  const tokenHash = hashRefreshToken(rawRefresh);
  await pool.query(`DELETE FROM refresh_tokens WHERE token_hash = $1`, [tokenHash]);
}

/**
 * Remove one refresh session only if it belongs to the given user.
 * @param {import("pg").Pool} pool
 * @param {string} userId
 * @param {string} rawRefresh
 */
async function revokeRefreshTokenForUser(pool, userId, rawRefresh) {
  const tokenHash = hashRefreshToken(rawRefresh);
  await pool.query(
    `DELETE FROM refresh_tokens WHERE token_hash = $1 AND user_id = $2`,
    [tokenHash, userId]
  );
}

module.exports = {
  ACCESS_EXPIRES,
  ensureRefreshTokensTable,
  issueTokenPair,
  verifyAccessToken,
  verifyAccessTokenResult,
  signMfaPendingToken,
  verifyMfaPendingToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeRefreshTokenForUser,
  stripUser,
  hashRefreshToken,
};
