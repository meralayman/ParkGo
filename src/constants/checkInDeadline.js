/** Must match backend ARRIVAL_WINDOW_MINUTES (default 20). Set REACT_APP_ARRIVAL_WINDOW_MINUTES in .env if you change the server. */
export const CHECK_IN_DEADLINE_MINUTES =
  Number(process.env.REACT_APP_ARRIVAL_WINDOW_MINUTES) || 20;

/**
 * Show urgent banner (and one-time browser alert) when this many minutes or less remain
 * before auto-cancel (after scheduled start + CHECK_IN_DEADLINE_MINUTES).
 */
export const CHECK_IN_WARNING_LEAD_MINUTES =
  Number(process.env.REACT_APP_CHECK_IN_WARNING_LEAD_MINUTES) || 10;
