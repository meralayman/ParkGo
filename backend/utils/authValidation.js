const PASSWORD_POLICY_MESSAGE =
  "Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.";

/**
 * @param {string} [email]
 * @returns {boolean}
 */
function isValidRegisterEmail(email) {
  if (email == null) return false;
  const s = String(email).trim();
  if (!s.includes("@")) return false;
  if (!s.toLowerCase().endsWith(".com")) return false;
  return /^[^\s@]+@[^\s@]+\.com$/i.test(s);
}

/**
 * @param {string|undefined} password
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
function validateRegisterPasswordRules(password) {
  if (typeof password !== "string" || password.length < 8) {
    return { ok: false, message: PASSWORD_POLICY_MESSAGE };
  }
  if (!/[A-Z]/.test(password)) {
    return { ok: false, message: PASSWORD_POLICY_MESSAGE };
  }
  if (!/[a-z]/.test(password)) {
    return { ok: false, message: PASSWORD_POLICY_MESSAGE };
  }
  if (!/[0-9]/.test(password)) {
    return { ok: false, message: PASSWORD_POLICY_MESSAGE };
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return { ok: false, message: PASSWORD_POLICY_MESSAGE };
  }
  return { ok: true };
}

/**
 * @param {string|undefined} password
 * @param {string|undefined} confirmPassword
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
function validatePasswordsMatch(password, confirmPassword) {
  if (password !== confirmPassword) {
    return { ok: false, message: "Passwords do not match" };
  }
  return { ok: true };
}

module.exports = {
  isValidRegisterEmail,
  validateRegisterPasswordRules,
  validatePasswordsMatch,
  INVALID_EMAIL_MESSAGE: "Invalid email format",
  PASSWORD_POLICY_MESSAGE,
};
