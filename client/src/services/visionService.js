// ─────────────────────────────────────────────────────────────────
// client/src/services/visionService.js
// All network calls for the AI Camera / Vision feature.
// ─────────────────────────────────────────────────────────────────

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

/**
 * analyzeImage
 * POSTs a base64 image to /api/vision/analyze.
 * Returns the parsed scene description on success.
 * Throws an Error with a user-friendly message on any failure.
 *
 * @param   {string} imageBase64 - raw base64, no "data:image/..." prefix
 * @param   {string} mimeType    - e.g. "image/jpeg"
 * @returns {Promise<object>}    - { scene, confidence, description, objects, lighting, timeOfDay }
 */
export async function analyzeImage(imageBase64, mimeType) {

  // ── 1 · Network request ────────────────────────────────────────
  let response;
  try {
    response = await fetch(`${API_BASE}/api/vision/analyze`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ imageBase64, mimeType }),
    });
  } catch {
    throw new Error(
      'Cannot reach the server. ' +
      'Make sure the backend is running on port 5000.'
    );
  }

  // ── 2 · Parse response body ────────────────────────────────────
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error('Server returned an unreadable response. Please try again.');
  }

  // ── 3 · Handle HTTP errors with specific messages ──────────────
  if (!response.ok) {
    const code    = body?.code    || '';
    const message = body?.error   || '';

    switch (code) {
      case 'INVALID_API_KEY':
        throw new Error('Gemini API key is invalid. Please check the server configuration.');
      case 'RATE_LIMIT':
        throw new Error('Gemini rate limit reached (free tier: 15 req/min). Please wait a moment and try again.');
      case 'PERMISSION_DENIED':
        throw new Error('Gemini API access denied. Ensure the API key has the correct permissions.');
      case 'MODEL_NOT_FOUND':
        throw new Error('Gemini model unavailable. Please contact support.');
      case 'INVALID_REQUEST':
        throw new Error('This image format could not be processed. Please try a different image.');
      case 'MISSING_API_KEY':
        throw new Error('Server is missing the Gemini API key. Please add GEMINI_API_KEY to server/.env');
      default:
        break;
    }

    // Fall back to HTTP status
    switch (response.status) {
      case 401: throw new Error('API authentication failed. Check the server API key.');
      case 413: throw new Error('Image is too large. Please use an image under 10 MB.');
      case 429: throw new Error('Too many requests. Please wait a moment and try again.');
      case 500: throw new Error(message || 'Server error. Please try again in a moment.');
      default:  throw new Error(message || `Request failed (HTTP ${response.status}).`);
    }
  }

  // ── 4 · Validate response shape ────────────────────────────────
  if (!body.success) {
    throw new Error(body?.error || 'Analysis failed. Please try again.');
  }
  if (!body.data || typeof body.data !== 'object') {
    throw new Error('Server returned an unexpected response format. Please try again.');
  }

  return body.data;
}

/**
 * analyzeHazard
 * POSTs a base64 image and scene memory to /api/vision/hazard for continuous scanning.
 *
 * @param   {string} imageBase64 - raw base64
 * @param   {string} mimeType    - e.g. "image/jpeg"
 * @param   {string} sceneMemory - short summary of previous state
 * @returns {Promise<object>}    - { speech, sceneSummary, timestamp }
 */
export async function analyzeHazard(imageBase64, mimeType, sceneMemory) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/vision/hazard`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ imageBase64, mimeType, sceneMemory }),
    });
  } catch {
    throw new Error('Cannot reach the server.');
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error('Server returned an unreadable response.');
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('RATE_LIMIT');
    }
    throw new Error(body?.error || 'Hazard analysis failed.');
  }

  if (!body.success) {
    throw new Error(body?.error || 'Hazard analysis failed.');
  }

  return body.data;
}
