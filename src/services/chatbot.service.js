import { API_BASE } from '../config/apiOrigin';
import { fetchWithAuth } from '../utils/authFetch';

/** Minimum milliseconds between sends (client-side throttle). */
export const CHATBOT_MIN_SEND_INTERVAL_MS = 700;

let lastSendAt = 0;

/**
 * @param {string} message
 * @param {Record<string, unknown>} context — persisted conversation context from last bot reply
 * @returns {Promise<{ ok: boolean, reply?: string, quickReplies?: string[], context?: object, error?: string, code?: string }>}
 */
export async function sendChatbotMessage(message, context = {}) {
  const now = Date.now();
  if (now - lastSendAt < CHATBOT_MIN_SEND_INTERVAL_MS) {
    return {
      ok: false,
      error: 'You are sending messages too quickly. Please wait a moment.',
      code: 'CLIENT_THROTTLE',
    };
  }
  lastSendAt = now;

  const url = `${API_BASE.replace(/\/$/, '')}/api/chatbot/message`;

  let res;
  try {
    res = await fetchWithAuth(url, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: JSON.stringify({
        message,
        context: context && typeof context === 'object' ? context : {},
      }),
    });
  } catch {
    return {
      ok: false,
      error: 'Something went wrong, please try again.',
      code: 'NETWORK',
    };
  }

  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }

  if (res.status === 429) {
    return {
      ok: false,
      error:
        (data && data.error) ||
        'Too many requests. Please wait a moment and try again.',
      code: 'RATE_LIMIT',
    };
  }

  if (!res.ok || !data.ok) {
    return {
      ok: false,
      error:
        (data && data.error) || 'Something went wrong, please try again.',
      code: data && data.code ? String(data.code) : 'API_ERROR',
    };
  }

  return {
    ok: true,
    reply: typeof data.reply === 'string' ? data.reply : '',
    quickReplies: Array.isArray(data.quickReplies) ? data.quickReplies : [],
    context:
      data.context && typeof data.context === 'object' ? data.context : {},
  };
}
