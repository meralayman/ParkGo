/**
 * Append-only audit trail: `logs` table (id, user_id, action, timestamp, ip_address).
 * Inserts are best-effort — failures are logged to console and never throw to callers.
 */

/**
 * Create `logs` if missing. Safe to run on every server start.
 * @param {import("pg").Pool} pool
 */
async function ensureAuditLogsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS logs (
      id BIGSERIAL PRIMARY KEY,
      user_id UUID,
      action VARCHAR(500) NOT NULL,
      "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ip_address VARCHAR(100)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs ("timestamp" DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_logs_user_id ON logs (user_id);`);
}

/**
 * @param {import("express").Request} [req]
 * @returns {string | null}
 */
function clientIp(req) {
  if (!req) return null;
  if (req.ip) return String(req.ip);
  const sock = req.socket || req.connection;
  if (sock && sock.remoteAddress) return String(sock.remoteAddress);
  return null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {{ userId?: string | null, action: string, ip?: string | null }} entry
 */
function logAudit(pool, { userId = null, action, ip = null }) {
  if (!pool || !action) return;
  const a = String(action).slice(0, 500);
  const ipVal = ip != null && String(ip).length ? String(ip).slice(0, 100) : null;
  const uid = userId != null && String(userId).trim() !== "" ? String(userId).trim() : null;
  pool
    .query(`INSERT INTO logs (user_id, action, ip_address) VALUES ($1, $2, $3)`, [uid, a, ipVal])
    .catch((e) => console.warn("[audit] log insert failed:", e.message));
}

module.exports = { ensureAuditLogsTable, logAudit, clientIp };
