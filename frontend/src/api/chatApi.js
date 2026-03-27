import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

/**
 * Send a chat message to the backend.
 * @param {string} message
 * @param {string|null} sessionId
 * @returns {Promise<{session_id, reply, data, parsed, fallback_used}>}
 */
export async function sendMessage(message, sessionId) {
  const { data } = await api.post('/chat', { message, session_id: sessionId });
  return data;
}

/**
 * Fetch session summary.
 * @param {string} sessionId
 * @returns {Promise<{items, total}>}
 */
export async function fetchSummary(sessionId) {
  const { data } = await api.get('/summary', { params: { session_id: sessionId } });
  return data;
}
