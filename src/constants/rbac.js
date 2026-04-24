/** Align with backend `backend/rbac.js` — users.role values */

export const ROLES = {
  USER: 'user',
  ADMIN: 'admin',
  GATEKEEPER: 'gatekeeper',
};

export function normalizeRole(role) {
  return String(role ?? '').toLowerCase().trim();
}

export function isAdmin(role) {
  return normalizeRole(role) === ROLES.ADMIN;
}

export function isUser(role) {
  return normalizeRole(role) === ROLES.USER;
}

export function isGatekeeper(role) {
  return normalizeRole(role) === ROLES.GATEKEEPER;
}

/** Customer area: parking, payments, user incidents (not gate operations). */
export function isCustomerRole(role) {
  const r = normalizeRole(role);
  return r === ROLES.USER || r === ROLES.ADMIN;
}

/** Dashboard path for a role after login */
export function homePathForRole(role) {
  const r = normalizeRole(role);
  const map = {
    [ROLES.ADMIN]: '/admin',
    [ROLES.USER]: '/user',
    [ROLES.GATEKEEPER]: '/gatekeeper',
  };
  return map[r] || '/user';
}
