const { ensureRefreshTokensTable } = require("./authTokens");

/**
 * Refresh token table + user columns used by authTokens / public user JSON.
 * Avoids depending on mfa.js (speakeasy) for startup DDL.
 */
async function ensureAuthSchema(pool) {
  await ensureRefreshTokensTable(pool);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret TEXT`);
}

module.exports = { ensureAuthSchema };
