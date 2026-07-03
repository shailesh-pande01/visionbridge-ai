// ─────────────────────────────────────────────────────────────────
// controllers/readingController.js
// Gemini Vision — Text Extraction (OCR) for the Smart Reading Assistant
//   Extracts text from signboards, medicine labels, menus,
//   product labels, documents, etc.
//   Free limits: 15 req/min · 1,500 req/day
//   Key: https://aistudio.google.com/apikey
// ─────────────────────────────────────────────────────────────────

const { GoogleGenerativeAI } = require('@google/generative-ai');

// ── Model priority list ───────────────────────────────────────────
// Shared with visionController — keep in sync.
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

// ── Generation config — deterministic, generous token limit ───────
const GENERATION_CONFIG = {
  temperature:     0.1,
  topP:            0.9,
  maxOutputTokens: 2048,  // text extraction can produce longer output
};

// ── Prompt ────────────────────────────────────────────────────────
// Design principles:
//   · Extract ALL visible text — nothing else
//   · Preserve layout / line breaks where meaningful
//   · Read aloud friendly — natural paragraph flow
//   · No guessing — omit anything unreadable
const READING_PROMPT = `You are a text-reading assistant for a person with low vision. Your ONLY job is to extract and return the text visible in the image.

Rules you MUST follow:
1. Return ONLY the text you can clearly read in the image — nothing else.
2. Do NOT add commentary, descriptions, explanations, or greetings.
3. Do NOT describe the image, objects, colors, or layout.
4. Do NOT say things like "The text reads:" or "Here is the text:" — just output the text directly.
5. Preserve the natural reading order (top to bottom, left to right).
6. Separate distinct blocks of text (e.g. a heading vs body text) with a blank line.
7. If text appears in columns, read each column top-to-bottom, left column first.
8. If a word is partially obscured but you can confidently infer it, include it. If not, skip it.
9. Include ALL text: headings, body text, prices, dates, fine print, ingredients, warnings, phone numbers, URLs.
10. For medicine labels, include dosage, warnings, expiry dates, and ingredients — these are critical.
11. If no text is visible at all, respond with exactly: NO_TEXT_FOUND

The extracted text will be read aloud to the user via text-to-speech, so ensure it flows naturally when spoken.`;

// ── generateWithFallback ──────────────────────────────────────────
async function generateWithFallback(client, parts) {
  let lastError;

  for (const modelName of MODEL_CANDIDATES) {
    try {
      const model = client.getGenerativeModel({
        model:            modelName,
        generationConfig: GENERATION_CONFIG,
      });

      const result = await model.generateContent(parts);
      console.log(`[Reading] Model used: ${modelName}`);
      return result;

    } catch (err) {
      console.warn(`[Reading] "${modelName}" failed (${err.message}) — trying next model`);
      lastError = err;
      continue;
    }
  }

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

// ── Safe text extractor ───────────────────────────────────────────
function safeExtractText(geminiResult) {
  try {
    const candidate = geminiResult.response.candidates?.[0];

    if (!candidate) {
      console.warn('[Reading] No candidates in Gemini response');
      return null;
    }

    if (candidate.finishReason === 'SAFETY') {
      console.warn('[Reading] Response blocked by safety filter');
      return null;
    }

    return geminiResult.response.text();
  } catch (textErr) {
    console.warn('[Reading] response.text() threw:', textErr.message);
    return null;
  }
}

// ── Response cleaner ──────────────────────────────────────────────
// Strip markdown fences, thinking tokens, and other artifacts
function cleanExtractedText(rawText) {
  let cleaned = rawText.trim();

  // Strip markdown code fences if present
  const fenceMatch = cleaned.match(/```(?:\w*)\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  // Handle the "no text" sentinel
  if (cleaned === 'NO_TEXT_FOUND' || cleaned.length === 0) {
    return null;
  }

  return cleaned;
}

// ── Gemini error classifier ───────────────────────────────────────
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
    return {
      status: 429,
      code:   'RATE_LIMIT',
      message: 'Gemini quota exceeded. Please wait a moment and try again.',
    };
  }
  if (msg.includes('PERMISSION_DENIED')) {
    return { status: 403, code: 'PERMISSION_DENIED', message: 'API key does not have permission.' };
  }
  if (msg.includes('not found') || msg.includes('NOT_FOUND')) {
    return { status: 404, code: 'MODEL_NOT_FOUND', message: 'No available Gemini model found. Set GEMINI_MODEL in server/.env' };
  }
  if (msg.includes('INVALID_ARGUMENT')) {
    return { status: 400, code: 'INVALID_REQUEST', message: 'Invalid image format. Try a different image.' };
  }

  return { status: 500, code: 'GEMINI_ERROR', message: msg };
}

// ─────────────────────────────────────────────────────────────────
// POST /api/reading/extract
// ─────────────────────────────────────────────────────────────────
exports.extractText = async (req, res, next) => {
  try {
    const { imageBase64, mimeType } = req.readingData;

    console.log(`[Reading] extractText — type: ${mimeType} | base64 length: ${imageBase64.length}`);

    const client = getClient();

    const geminiResult = await generateWithFallback(client, [
      READING_PROMPT,
      {
        inlineData: {
          data:     imageBase64,
          mimeType,
        },
      },
    ]);

    const rawText = safeExtractText(geminiResult);

    if (!rawText) {
      console.warn('[Reading] No text extracted — safety filter or empty response');
      return res.status(200).json({
        success: true,
        data: {
          extractedText: null,
          message: 'Could not read text from this image. Please try a clearer photo.',
        },
      });
    }

    console.log(`[Reading] Gemini responded — ${rawText.length} chars`);

    const extractedText = cleanExtractedText(rawText);

    if (!extractedText) {
      return res.status(200).json({
        success: true,
        data: {
          extractedText: null,
          message: 'No readable text was found in this image. Try pointing the camera at text such as a sign, label, menu, or document.',
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: { extractedText },
    });

  } catch (err) {
    const { status, code, message } = classifyGeminiError(err);

    console.error(`[Reading] Error [${code}] ${message}`);
    if (status === 500) console.error(err.stack);

    return res.status(status).json({ success: false, error: message, code });
  }
};
