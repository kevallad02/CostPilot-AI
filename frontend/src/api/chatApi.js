import axios from 'axios';

// In dev: Vite proxy rewrites /api → localhost:3001 (vite.config.js)
// In production: VITE_API_URL points to the deployed backend
const baseURL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 35000, // allow for Render cold-start (~30s on free tier)
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
