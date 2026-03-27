/**
 * sessionService.js
 * Generates and validates session IDs.
 * Sessions are stored implicitly via estimate_records (no separate session table needed).
 */

const { randomUUID } = require('crypto');

/**
 * Create a new session ID.
 * @returns {string}
 */
function createSession() {
  return randomUUID();
}

/**
 * Validate that a session ID looks like a UUID.
 * @param {string} id
 * @returns {boolean}
 */
function isValidSessionId(id) {
  return typeof id === 'string' && /^[0-9a-f-]{36}$/.test(id);
}

/**
 * Return a validated session ID or create a new one.
 * @param {string|undefined} id
 * @returns {string}
 */
function resolveSession(id) {
  return isValidSessionId(id) ? id : createSession();
}

module.exports = { createSession, isValidSessionId, resolveSession };
