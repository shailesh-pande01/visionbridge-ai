// ─────────────────────────────────────────────────────────────────
// client/src/services/locationService.js
// All network calls for the "Where Am I?" Location Assistant.
// ─────────────────────────────────────────────────────────────────

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

/**
 * getLocationDescription
 * POSTs GPS coordinates to /api/location/current.
 * Returns a spoken location summary.
 *
 * @param   {number} latitude
 * @param   {number} longitude
 * @returns {Promise<object>} - { summary, address, landmarks, coordinates }
 */
export async function getLocationDescription(latitude, longitude) {

  // ── 1 · Network request ────────────────────────────────────────
  let response;
  try {
    response = await fetch(`${API_BASE}/api/location/current`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ latitude, longitude }),
    });
  } catch {
    throw new Error(
      'Cannot reach the server. Make sure the backend is running on port 5000.'
    );
  }

  // ── 2 · Parse response body ────────────────────────────────────
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error('Server returned an unreadable response. Please try again.');
  }

  // ── 3 · Handle HTTP errors ─────────────────────────────────────
  if (!response.ok) {
    const message = body?.error || '';
    const code    = body?.code  || '';

    switch (code) {
      case 'RATE_LIMIT':
        throw new Error('Rate limit reached. Please wait a moment and try again.');
      case 'MISSING_API_KEY':
        throw new Error('Server is missing the API key. Please check server configuration.');
      default:
        break;
    }

    switch (response.status) {
      case 429: throw new Error('Too many requests. Please wait and try again.');
      case 500: throw new Error(message || 'Server error. Please try again.');
      default:  throw new Error(message || `Request failed (HTTP ${response.status}).`);
    }
  }

  // ── 4 · Validate response shape ────────────────────────────────
  if (!body.success) {
    throw new Error(body?.error || 'Location lookup failed. Please try again.');
  }
  if (!body.data || typeof body.data !== 'object') {
    throw new Error('Server returned an unexpected response format.');
  }

  return body.data;
}
