// ─────────────────────────────────────────────────────────────────
// controllers/visionController.js
// Gemini Vision — free tier, auto-selects best available model
//   Free limits: 15 req/min · 1,500 req/day
//   Key: https://aistudio.google.com/apikey
// ─────────────────────────────────────────────────────────────────

const { GoogleGenerativeAI } = require('@google/generative-ai');

// ── Model priority list ───────────────────────────────────────────
// Set GEMINI_MODEL in server/.env to pin a specific model.
// If unset, each model is tried in order until one succeeds.
// All listed models are free-tier multimodal (text + vision).
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
].filter(Boolean); // remove undefined if GEMINI_MODEL is not set

// ── Lazy client — created once, reused across requests ────────────
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

// ── generateWithFallback ──────────────────────────────────────────
// Walks MODEL_CANDIDATES until one succeeds.
// Skips a model only when Gemini says it isn't found — any other
// error (bad key, quota, invalid image) is thrown immediately so the
// error classifier in the calling function can handle it correctly.
async function generateWithFallback(client, parts) {
  let lastError;

  for (const modelName of MODEL_CANDIDATES) {
    try {
      const model = client.getGenerativeModel({
        model:            modelName,
        generationConfig: GENERATION_CONFIG,
      });

      const result = await model.generateContent(parts);
      console.log(`[Vision] Model used: ${modelName}`);
      return result;

    } catch (err) {
      console.warn(`[Vision] "${modelName}" failed (${err.message}) — trying next model`);
      lastError = err;
      continue;  // try the next candidate regardless of error type
    }
  }

  // Every candidate failed — surface a clear error
  if (lastError) {
    throw lastError;
  }
  const tried = MODEL_CANDIDATES.join(', ');
  const err   = new Error(
    `No available Gemini model found. Tried: ${tried}. ` +
    `Set GEMINI_MODEL in server/.env to a model visible at ` +
    `https://aistudio.google.com/app/prompts`
  );
  err.code = 'MODEL_NOT_FOUND';
  throw err;
}


// temperature 0.1 = highly deterministic → consistent JSON structure
// maxOutputTokens 900 = enough for full response without padding
const GENERATION_CONFIG = {
  temperature:     0.1,
  topP:            0.9,
  maxOutputTokens: 900,
};

// ── Prompt ────────────────────────────────────────────────────────
// Design principles:
//   · Second-person ("on your left") — user hears this via TTS
//   · Safety-first ordering — obstacles before object list
//   · No guessing — omit anything unclear rather than speculate
//   · Obstacle field is always present — empty array when path is clear
//   · Text prompt MUST come before image part in the generateContent array
const VISION_PROMPT = `You are a real-time visual assistant speaking directly to a person with low vision. Your response will be read aloud by a screen reader — write exactly as you would speak to them, not as a description of an image.

Analyze the image and return ONLY a valid JSON object. No markdown, no code fences, no text before or after — just the JSON.

{
  "scene": "4 to 6 word label for the location (e.g. 'Indoor supermarket aisle', 'Outdoor pedestrian crossing')",
  "confidence": <decimal 0.0 to 1.0, estimate based on image clarity, visibility, lighting, and occlusion>,
  "description": "2 to 3 sentences spoken directly to the user. Start with what is immediately ahead. Use 'on your left', 'on your right', 'directly ahead', 'close to you', 'further away'. If the path ahead is clear, say so. If anything blocks the way, say it first. Read any visible text on signs, screens, or labels word for word.",
  "objects": [
    "Object — direction and estimated distance (e.g. 'Dining table — directly ahead, approximately 2 steps away')",
    "Include 3 to 5 items only. Prioritise objects relevant to movement and awareness. Skip decorative or irrelevant items."
  ],
  "obstacles": [
    "Hazard or obstacle — exact position (e.g. 'Step down — at your feet, directly ahead')",
    "Include ALL hazards: steps, stairs, furniture blocking the path, low-hanging objects, wet floors, open doors, uneven ground.",
    "Use empty array [] if the immediate path appears clear — never omit this field."
  ],
  "lighting": "One short phrase describing lighting useful for navigation (e.g. 'Well-lit from overhead', 'Dim, proceed carefully')",
  "timeOfDay": "Estimate using natural light cues only (e.g. 'Late afternoon'), or 'Indoor — cannot determine' for artificial light"
}

Rules you must follow:
1. Never use the words 'image', 'photo', 'picture', 'I can see', or 'it appears' — speak as the user's eyes.
2. Only describe what you can clearly see. If something is uncertain, omit it entirely rather than guess.
3. Distances must always use the word 'approximately' and real-world references: steps, arm's length, metres.
4. Obstacles are the highest-priority field — scan carefully for anything that could cause a fall or collision.
5. If any text is visible anywhere — signs, screens, price tags, menus, labels — include it verbatim in the description.
6. The description must sound natural when read aloud — no bullet points, no colons, no lists, only fluent sentences.
7. Never mention colours unless they identify something important (e.g. a red stop sign, a green exit sign).`;

// ── Safe text extractor ───────────────────────────────────────────
// response.text() throws if the response was blocked by safety filters.
// This extracts text safely and returns null on block/empty response.
function safeExtractText(geminiResult) {
  try {
    const candidate = geminiResult.response.candidates?.[0];

    if (!candidate) {
      console.warn('[Vision] No candidates in Gemini response');
      return null;
    }

    if (candidate.finishReason === 'SAFETY') {
      console.warn('[Vision] Response blocked by safety filter');
      return null;
    }

    return geminiResult.response.text();
  } catch (textErr) {
    console.warn('[Vision] response.text() threw:', textErr.message);
    return null;
  }
}

// ── Response parser ───────────────────────────────────────────────
// Handles: clean JSON / JSON in ```fences``` / plain text fallback
function parseGeminiResponse(rawText) {
  let cleaned = rawText.trim();

  // Strip markdown code fences Gemini sometimes adds despite the prompt
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  // Thinking models (gemini-2.5-flash etc.) may prepend thinking tokens
  // or other text before the JSON. Try to extract the first JSON object.
  if (!cleaned.startsWith('{')) {
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd   = cleaned.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
    }
  }

  try {
    const parsed = JSON.parse(cleaned);
    return {
      scene:       String(parsed.scene       || 'Scene detected'),
      confidence:  Math.min(1.0, Math.max(0.0, Number(parsed.confidence ?? 0.8))),
      description: String(parsed.description || rawText),
      objects:     Array.isArray(parsed.objects)   ? parsed.objects.map(String)   : [],
      obstacles:   Array.isArray(parsed.obstacles) ? parsed.obstacles.map(String) : [],
      lighting:    String(parsed.lighting    || 'See description above'),
      timeOfDay:   String(parsed.timeOfDay   || 'See description above'),
    };
  } catch {
    console.warn('[Vision] JSON parse failed — wrapping as plain text description');
    return {
      scene:       'Scene detected',
      confidence:  0.75,
      description: rawText,
      objects:     [],
      obstacles:   [],
      lighting:    'See description above',
      timeOfDay:   'See description above',
    };
  }
}

// ── Safety fallback response ──────────────────────────────────────
const SAFETY_FALLBACK = {
  scene:       'Scene detected',
  confidence:  0.50,
  description: 'This image could not be fully described. Please try pointing the camera at your surroundings again.',
  objects:     [],
  obstacles:   [],
  lighting:    'Unknown',
  timeOfDay:   'Unknown',
};

// ── Gemini error classifier ───────────────────────────────────────
// Maps raw Gemini/Google API error messages to client-safe codes and
// HTTP status codes so the frontend can show specific, actionable messages.
function classifyGeminiError(err) {
  const msg  = err.message || '';
  const code = err.code    || '';

  // Check structured error codes set by our own code first
  if (code === 'MISSING_API_KEY') {
    return { status: 500, code: 'MISSING_API_KEY', message: err.message };
  }
  if (code === 'MODEL_NOT_FOUND') {
    return { status: 404, code: 'MODEL_NOT_FOUND', message: err.message };
  }

  // Map Gemini / Google API error strings
  if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid')) {
    return { status: 401, code: 'INVALID_API_KEY', message: 'Gemini API key is invalid. Check GEMINI_API_KEY in server/.env' };
  }
  if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
    // RESOURCE_EXHAUSTED covers both RPM (requests/min) and TPM (tokens/min).
    // On a first-ever request, it almost always means the image was too large
    // and used too many tokens — the frontend now compresses before sending.
    return {
      status: 429,
      code:   'RATE_LIMIT',
      message:
        'Gemini quota exceeded. If this is your first request, the image may still be too large — ' +
        'try a smaller or simpler photo. Otherwise wait 1 minute and try again.',
    };
  }
  if (msg.includes('PERMISSION_DENIED')) {
    return { status: 403, code: 'PERMISSION_DENIED', message: 'API key does not have permission. Ensure the Gemini API is enabled in Google AI Studio.' };
  }
  if (msg.includes('not found') || msg.includes('NOT_FOUND')) {
    return { status: 404, code: 'MODEL_NOT_FOUND', message: `No available Gemini model found. Set GEMINI_MODEL in server/.env` };
  }
  if (msg.includes('INVALID_ARGUMENT')) {
    return { status: 400, code: 'INVALID_REQUEST', message: 'Invalid image format sent to Gemini. Try a different image.' };
  }

  return { status: 500, code: 'GEMINI_ERROR', message: msg };
}

// ─────────────────────────────────────────────────────────────────
// POST /api/vision/analyze
// ─────────────────────────────────────────────────────────────────
exports.analyzeImage = async (req, res, next) => {
  try {
    const { imageBase64, mimeType } = req.visionData;

    console.log(`[Vision] analyzeImage — type: ${mimeType} | base64 length: ${imageBase64.length}`);

    const client = getClient();

    // IMPORTANT: text prompt MUST be first in the array, image part second.
    const geminiResult = await generateWithFallback(client, [
      VISION_PROMPT,
      {
        inlineData: {
          data:     imageBase64,  // raw base64 — no "data:image/..." prefix
          mimeType,               // e.g. "image/jpeg"
        },
      },
    ]);

    const rawText = safeExtractText(geminiResult);

    // Safety filter blocked the response — return a graceful fallback
    if (!rawText) {
      console.warn('[Vision] No text extracted — returning safety fallback');
      return res.status(200).json({ success: true, data: SAFETY_FALLBACK });
    }

    console.log(`[Vision] Gemini responded — ${rawText.length} chars`);

    const data = parseGeminiResponse(rawText);
    return res.status(200).json({ success: true, data });

  } catch (err) {
    const { status, code, message } = classifyGeminiError(err);

    // Always log the real error server-side with full details
    console.error(`[Vision] Error [${code}] ${message}`);
    if (status === 500) console.error(err.stack);

    // Return specific error info so the frontend can show actionable messages
    return res.status(status).json({ success: false, error: message, code });
  }
};

// ─────────────────────────────────────────────────────────────────
// GET /api/vision/test
// Quick key verification — sends a plain text request (no image).
// Visit http://localhost:5000/api/vision/test in your browser.
// ─────────────────────────────────────────────────────────────────
exports.testConnection = async (req, res) => {
  try {
    const client = getClient();

    // Use the same fallback logic as analyzeImage so the test
    // tells you exactly which model will be used for real requests.
    let usedModel = 'unknown';
    let replyText = '';

    for (const modelName of MODEL_CANDIDATES) {
      try {
        const model  = client.getGenerativeModel({ model: modelName });
        const result = await model.generateContent('Reply with exactly: GEMINI_OK');
        replyText = result.response.text().trim();
        usedModel = modelName;
        break;
      } catch (err) {
        console.warn(`[Vision] testConnection "${modelName}" failed (${err.message}) — trying next`);
        continue;
      }
    }

    if (!replyText) {
      throw new Error(`No model responded. Tried: ${MODEL_CANDIDATES.join(', ')}`);
    }

    return res.json({
      success:        true,
      model:          usedModel,
      candidatesTried: MODEL_CANDIDATES,
      reply:          replyText,
      message:        `Gemini API key is working. Active model: ${usedModel}`,
    });

  } catch (err) {
    const { status, code, message } = classifyGeminiError(err);
    console.error(`[Vision] testConnection [${code}]:`, message);
    return res.status(status).json({
      success:         false,
      code,
      error:           message,
      candidatesTried: MODEL_CANDIDATES,
      hint:            'Set GEMINI_MODEL in server/.env — see available models at https://aistudio.google.com/app/prompts',
    });
  }
};

// ── Hazard Prompt & Parsing ──────────────────────────────────────
const HAZARD_PROMPT = `You are VisionBridge, an AI assistant for low-vision users.

Previous Scene:
{sceneMemory}

Analyze the CURRENT image.
Ignore objects that have not changed.
Only mention:
- New hazards
- Moving obstacles
- Changes in the environment
- Navigation warnings
- Important safety information
- Objects suddenly moving closer or into the frame

If nothing important changed, simply reply: "No significant change."

At the end of every response, generate a NEW scene summary in ONE SHORT SENTENCE.

Return JSON only:
{
  "speech": "...",
  "sceneSummary": "..."
}`;

function parseHazardResponse(rawText) {
  let cleaned = rawText.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }
  if (!cleaned.startsWith('{')) {
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd   = cleaned.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
    }
  }

  try {
    const parsed = JSON.parse(cleaned);
    return {
      speech: String(parsed.speech || 'No significant change.'),
      sceneSummary: String(parsed.sceneSummary || 'Scene unchanged.'),
      timestamp: Date.now(),
    };
  } catch {
    console.warn('[Vision] Hazard JSON parse failed, returning fallback');
    return {
      speech: 'No significant change.',
      sceneSummary: 'Scene unchanged.',
      timestamp: Date.now(),
    };
  }
}

// ─────────────────────────────────────────────────────────────────
// POST /api/vision/hazard
// ─────────────────────────────────────────────────────────────────
exports.analyzeHazard = async (req, res, next) => {
  try {
    const { imageBase64, mimeType, sceneMemory } = req.visionData;
    console.log(`[Vision] analyzeHazard — base64 length: ${imageBase64.length}`);

    const client = getClient();
    const prompt = HAZARD_PROMPT.replace('{sceneMemory}', sceneMemory || 'No previous context.');

    const geminiResult = await generateWithFallback(client, [
      prompt,
      {
        inlineData: {
          data:     imageBase64,
          mimeType,
        },
      },
    ]);

    const rawText = safeExtractText(geminiResult);
    if (!rawText) {
      return res.status(200).json({ success: true, data: { speech: 'No significant change.', sceneSummary: sceneMemory || '', timestamp: Date.now() } });
    }

    const data = parseHazardResponse(rawText);
    console.log(`[Vision Hazard] speech: "${data.speech}" | summary: "${data.sceneSummary}"`);
    return res.status(200).json({ success: true, data });

  } catch (err) {
    const { status, code, message } = classifyGeminiError(err);
    console.error(`[Vision Hazard] Error [${code}] ${message}`);
    return res.status(status).json({ success: false, error: message, code });
  }
};
