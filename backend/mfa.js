const speakeasy = require("speakeasy");

async function ensureMfaColumns(pool) {
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret TEXT`);
}

/**
 * @param {string} base32Secret
 * @param {string} userCode - 6-digit TOTP from authenticator app
 */
function verifyTotp(base32Secret, userCode) {
  const token = String(userCode ?? "")
    .replace(/\s/g, "")
    .trim();
  if (!/^\d{6}$/.test(token)) return false;
  return speakeasy.totp.verify({
    secret: base32Secret,
    encoding: "base32",
    token,
    window: 1,
  });
}

function generateTotpSetup(email) {
  return speakeasy.generateSecret({
    name: `ParkGo Admin (${email || "admin"})`,
    issuer: "ParkGo",
  });
}

module.exports = { ensureMfaColumns, verifyTotp, generateTotpSetup };
