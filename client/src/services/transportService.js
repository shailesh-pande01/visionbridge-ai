const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export async function analyzeTransport(imageBase64, mimeType) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/transport/analyze`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ imageBase64, mimeType }),
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
    const code = body?.code || '';
    const message = body?.error || '';
    if (code === 'RATE_LIMIT') throw new Error('Gemini rate limit reached (free tier: 15 req/min). Please wait a moment and try again.');
    throw new Error(message || `Request failed (HTTP ${response.status}).`);
  }

  if (!body.success) {
    throw new Error(body?.error || 'Analysis failed.');
  }

  return body.data;
}
