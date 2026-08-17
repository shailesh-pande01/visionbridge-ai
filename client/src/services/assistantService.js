// ─────────────────────────────────────────────────────────────────
// client/src/services/assistantService.js
// Calls to the backend conversational assistant.
//
// The Gemini key lives only on the server — the browser never sees it.
// ─────────────────────────────────────────────────────────────────

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

async function postJson(path, payload) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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

  // The assistant endpoints attach a speakable fallback even to errors,
  // so a failed request can still say something useful out loud.
  if (!response.ok || !body.success) {
    const err = new Error(body?.error || `Request failed (HTTP ${response.status}).`);
    err.code = body?.code || 'REQUEST_FAILED';
    err.data = body?.data || null;
    throw err;
  }

  return body.data;
}

/**
 * sendCommand
 * Sends a spoken command plus the compact session context.
 * Returns a validated action: { type, action, target?, question?, answer?, speech }
 */
export function sendCommand(command, context) {
  return postJson('/api/assistant/command', { command, context });
}

/**
 * askQuestion
 * Answers a follow-up question directly from stored context.
 */
export function askQuestion(question, context) {
  return postJson('/api/assistant/ask', { question, context });
}
