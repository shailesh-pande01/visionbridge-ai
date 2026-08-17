// ─────────────────────────────────────────────────────────────────
// services/geminiService.js
// Shared Gemini access layer for VisionBridge.
//
// Every controller that talks to Gemini should go through here so the
// model list, fallback behaviour, JSON parsing and error classification
// stay in one place. The API key never leaves the backend.
//
// Model selection:
//   Set GEMINI_MODEL in server/.env to pin a model — it is always tried
//   first. Otherwise each candidate is tried in order until one answers.
// ─────────────────────────────────────────────────────────────────

const { GoogleGenerativeAI } = require('@google/generative-ai');

// ── Model priority list ───────────────────────────────────────────
const MODEL_CANDIDATES = [
  process.env.GEMINI_MODEL,   // user override — tried first when set
  'gemini-2.5-flash',
  'gemini-3.5-flash',
  'gemini-flash-latest',
  'gemini-pro-latest',
  'gemini-2.5-pro',
  'gemini-2.5-flash-lite',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
  'gemini-3.1-pro-preview',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
].filter(Boolean);

// The last model that answered successfully. Voice commands run in a
// tight conversational loop, so re-trying a known-good model first
// removes seconds of dead air from every request.
let _preferredModel = null;

// Models that just failed (quota exhausted, overloaded) are skipped for
// a short while. Without this, an exhausted free-tier model costs a
// wasted round-trip on every single spoken command.
const FAILURE_COOLDOWN_MS = 60 * 1000;
const _cooldownUntil = new Map();

let _client = null;

function getClient() {
  if (!process.env.GEMINI_API_KEY) {
    const err = new Error(
      'GEMINI_API_KEY is not set. Add it to server/.env — free key at https://aistudio.google.com/apikey'
    );
    err.code = 'MISSING_API_KEY';
    throw err;
  }
  if (!_client) {
    _client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return _client;
}

// Candidate order for this request: last known-good model first, then
// everything not currently cooling down. If every model is cooling
// down, try them all anyway rather than failing without an attempt.
function candidateOrder() {
  const ordered = _preferredModel
    ? [_preferredModel, ...MODEL_CANDIDATES.filter((m) => m !== _preferredModel)]
    : [...MODEL_CANDIDATES];

  const now = Date.now();
  const available = ordered.filter((m) => (_cooldownUntil.get(m) || 0) <= now);

  return available.length > 0 ? available : ordered;
}

// ── safeExtractText ───────────────────────────────────────────────
// response.text() throws when the response was blocked by a safety
// filter. Returns null instead of throwing so callers can fall back.
function safeExtractText(geminiResult) {
  try {
    const candidate = geminiResult.response.candidates?.[0];
    if (!candidate) {
      console.warn('[Gemini] No candidates in response');
      return null;
    }
    if (candidate.finishReason === 'SAFETY') {
      console.warn('[Gemini] Response blocked by safety filter');
      return null;
    }
    return geminiResult.response.text();
  } catch (err) {
    console.warn('[Gemini] response.text() threw:', err.message);
    return null;
  }
}

// ── extractFirstJsonObject ────────────────────────────────────────
// Returns the first balanced {...} block, ignoring braces inside string
// literals. Slicing from the first "{" to the last "}" is not enough:
// models occasionally emit a stray trailing brace or trailing prose,
// and the whole command then fails to parse.
function extractFirstJsonObject(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null; // unterminated — usually a truncated response
}

// ── parseJson ─────────────────────────────────────────────────────
// Handles clean JSON, JSON wrapped in ```fences```, thinking-model
// output that prepends text, and stray trailing characters.
// Returns null on failure.
function parseJson(rawText) {
  if (!rawText) return null;

  let cleaned = String(rawText).trim();

  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    // Fall through to the balanced-brace extraction below.
  }

  const candidate = extractFirstJsonObject(cleaned);
  if (candidate) {
    try {
      return JSON.parse(candidate);
    } catch { /* fall through to the warning */ }
  }

  console.warn('[Gemini] JSON parse failed for response starting:', cleaned.slice(0, 120));
  return null;
}

// ── generateText ──────────────────────────────────────────────────
// Walks the candidate list until a model answers. Throws the last
// error when every candidate fails so the caller can classify it.
async function generateText(parts, generationConfig = {}) {
  const client = getClient();
  let lastError;

  for (const modelName of candidateOrder()) {
    try {
      const model = client.getGenerativeModel({
        model: modelName,
        generationConfig,
      });

      const result  = await model.generateContent(parts);
      const rawText = safeExtractText(result);

      _preferredModel = modelName;
      _cooldownUntil.delete(modelName);
      console.log(`[Gemini] Model used: ${modelName}`);
      return rawText;

    } catch (err) {
      console.warn(`[Gemini] "${modelName}" failed (${err.message}) — trying next model`);
      // A model that just failed should not stay preferred, and should
      // not be retried on the very next command either.
      if (_preferredModel === modelName) _preferredModel = null;
      _cooldownUntil.set(modelName, Date.now() + FAILURE_COOLDOWN_MS);
      lastError = err;
    }
  }

  if (lastError) throw lastError;

  const err = new Error(
    `No available Gemini model found. Tried: ${MODEL_CANDIDATES.join(', ')}. ` +
    'Set GEMINI_MODEL in server/.env to a model available to your key.'
  );
  err.code = 'MODEL_NOT_FOUND';
  throw err;
}

// ── generateJson ──────────────────────────────────────────────────
// Same as generateText but asks for JSON and parses the result.
// Returns null when the model was blocked or produced unparsable output.
async function generateJson(parts, generationConfig = {}) {
  const rawText = await generateText(parts, {
    temperature: 0.1,
    topP: 0.9,
    responseMimeType: 'application/json',
    ...generationConfig,
  });

  return parseJson(rawText);
}

// ── classifyGeminiError ───────────────────────────────────────────
// Maps raw Gemini/Google API errors to client-safe codes + HTTP status.
function classifyGeminiError(err) {
  const msg  = err.message || '';
  const code = err.code    || '';

  if (code === 'MISSING_API_KEY') {
    return { status: 500, code: 'MISSING_API_KEY', message: err.message };
  }
  if (code === 'MODEL_NOT_FOUND') {
    return { status: 404, code: 'MODEL_NOT_FOUND', message: err.message };
  }
  if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid')) {
    return { status: 401, code: 'INVALID_API_KEY', message: 'Gemini API key is invalid. Check GEMINI_API_KEY in server/.env' };
  }
  if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
    return { status: 429, code: 'RATE_LIMIT', message: 'Gemini quota exceeded. Please wait a moment and try again.' };
  }
  if (msg.includes('PERMISSION_DENIED')) {
    return { status: 403, code: 'PERMISSION_DENIED', message: 'API key does not have permission. Enable the Gemini API in Google AI Studio.' };
  }
  if (msg.includes('not found') || msg.includes('NOT_FOUND')) {
    return { status: 404, code: 'MODEL_NOT_FOUND', message: 'No available Gemini model found. Set GEMINI_MODEL in server/.env' };
  }
  if (msg.includes('INVALID_ARGUMENT')) {
    return { status: 400, code: 'INVALID_REQUEST', message: 'Invalid request sent to Gemini.' };
  }

  return { status: 500, code: 'GEMINI_ERROR', message: msg };
}

module.exports = {
  MODEL_CANDIDATES,
  getClient,
  generateText,
  generateJson,
  parseJson,
  safeExtractText,
  classifyGeminiError,
};
