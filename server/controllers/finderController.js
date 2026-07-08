// ─────────────────────────────────────────────────────────────────
// controllers/finderController.js
// Gemini Vision — Smart Object Finder
// ─────────────────────────────────────────────────────────────────

const { GoogleGenerativeAI } = require('@google/generative-ai');

const MODEL_CANDIDATES = [
  process.env.GEMINI_MODEL,
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

let _client = null;

function getClient() {
  if (!process.env.GEMINI_API_KEY) {
    const err = new Error('GEMINI_API_KEY is not set.');
    err.code = 'MISSING_API_KEY';
    throw err;
  }
  if (!_client) {
    _client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return _client;
}

const GENERATION_CONFIG = {
  temperature:     0.1,
  topP:            0.9,
  maxOutputTokens: 1024,
};

function buildFinderPrompt(objectName) {
  return `You are VisionBridge, an AI assistant for low-vision users.

The user is looking for:
"${objectName}"

Analyze ONLY the current image.
Determine:
- Is the object visible?
- Approximate location
- Direction relative to the user
- Estimated distance
- Nearby reference object

Do not guess. If uncertain, say so.

You MUST respond with a single, complete, valid JSON object. Do not include any conversational text before or after the JSON.
Do not use markdown formatting. Just output the raw JSON object.

The JSON MUST have exactly these keys:
{
  "found": true or false,
  "object": "String, e.g. Wallet",
  "direction": "String, e.g. Left, Right, Center",
  "distance": "String, e.g. About one meter",
  "reference": "String, e.g. On the wooden table",
  "speech": "String, What the screen reader will say aloud",
  "confidence": 0.91
}

Example if found:
{
  "found": true,
  "object": "${objectName}",
  "direction": "Left",
  "distance": "About one meter",
  "reference": "On the wooden table",
  "speech": "Your ${objectName} is on the table slightly to your left, about one meter away.",
  "confidence": 0.91
}

Example if not found:
{
  "found": false,
  "object": "${objectName}",
  "direction": "",
  "distance": "",
  "reference": "",
  "speech": "I couldn't find your ${objectName} in the current view.",
  "confidence": 0.42
}`;
}

async function generateWithFallback(client, parts) {
  let lastError;

  for (const modelName of MODEL_CANDIDATES) {
    try {
      const model = client.getGenerativeModel({
        model:            modelName,
        generationConfig: GENERATION_CONFIG,
      });

      const result = await model.generateContent(parts);
      console.log(`[Finder] Model used: ${modelName}`);
      return result;
    } catch (err) {
      console.warn(`[Finder] "${modelName}" failed (${err.message}) — trying next model`);
      lastError = err;
      continue;
    }
  }

  if (lastError) throw lastError;
  const tried = MODEL_CANDIDATES.join(', ');
  const err   = new Error(`No available Gemini model found. Tried: ${tried}.`);
  err.code = 'MODEL_NOT_FOUND';
  throw err;
}

function safeExtractText(geminiResult) {
  try {
    const candidate = geminiResult.response.candidates?.[0];
    if (!candidate) return null;
    if (candidate.finishReason === 'SAFETY') return null;
    return geminiResult.response.text();
  } catch (textErr) {
    return null;
  }
}

function parseGeminiResponse(rawText, objectName) {
  console.log(`[Finder] Gemini rawText:\n${rawText}`);
  let cleaned = rawText.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();

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
      found: Boolean(parsed.found),
      object: String(parsed.object || objectName),
      direction: String(parsed.direction || ''),
      distance: String(parsed.distance || ''),
      reference: String(parsed.reference || ''),
      speech: String(parsed.speech || 'Could not locate the object clearly.'),
      confidence: Math.min(1.0, Math.max(0.0, Number(parsed.confidence ?? 0.8))),
    };
  } catch (err) {
    console.warn(`[Finder] JSON parse failed (${err.message}). Trying regex fallback...`);
    
    const extractString = (key) => {
      const regex = new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`);
      const match = rawText.match(regex);
      return match ? match[1].trim() : '';
    };
    
    const extractBoolean = (key) => {
      const regex = new RegExp(`"${key}"\\s*:\\s*(true|false)`);
      const match = rawText.match(regex);
      return match ? match[1] === 'true' : false;
    };

    const extractNumber = (key) => {
      const regex = new RegExp(`"${key}"\\s*:\\s*([0-9.]+)`);
      const match = rawText.match(regex);
      return match ? Number(match[1]) : 0.8;
    };

    const found = extractBoolean('found');
    const speech = extractString('speech') || (found ? `I found your ${objectName}.` : `I couldn't find your ${objectName} clearly.`);
    const direction = extractString('direction');
    const distance = extractString('distance');
    const reference = extractString('reference');
    const confidence = extractNumber('confidence');

    if (found || direction || speech) {
      return {
        found,
        object: objectName,
        direction,
        distance,
        reference,
        speech,
        confidence
      };
    }

    return {
      found: false,
      object: objectName,
      direction: '',
      distance: '',
      reference: '',
      speech: 'Information detected, but format could not be parsed.',
      confidence: 0.75,
    };
  }
}

function classifyGeminiError(err) {
  const msg  = err.message || '';
  const code = err.code    || '';

  if (code === 'MISSING_API_KEY') return { status: 500, code: 'MISSING_API_KEY', message: err.message };
  if (code === 'MODEL_NOT_FOUND') return { status: 404, code: 'MODEL_NOT_FOUND', message: err.message };

  if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid')) return { status: 401, code: 'INVALID_API_KEY', message: 'Gemini API key is invalid.' };
  if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) return { status: 429, code: 'RATE_LIMIT', message: 'Gemini quota exceeded. Please wait a moment.' };
  if (msg.includes('PERMISSION_DENIED')) return { status: 403, code: 'PERMISSION_DENIED', message: 'API key does not have permission.' };
  if (msg.includes('not found') || msg.includes('NOT_FOUND')) return { status: 404, code: 'MODEL_NOT_FOUND', message: 'No available Gemini model found.' };
  if (msg.includes('INVALID_ARGUMENT')) return { status: 400, code: 'INVALID_REQUEST', message: 'Invalid image format.' };

  return { status: 500, code: 'GEMINI_ERROR', message: msg };
}

exports.analyzeFinder = async (req, res) => {
  try {
    const { imageBase64, mimeType, objectName } = req.visionData;
    
    if (!objectName) {
      return res.status(400).json({ success: false, error: 'objectName is required.' });
    }

    console.log(`[Finder] analyzeFinder — object: ${objectName} | type: ${mimeType} | base64 length: ${imageBase64.length}`);

    const client = getClient();
    const prompt = buildFinderPrompt(objectName);
    
    const geminiResult = await generateWithFallback(client, [
      prompt,
      { inlineData: { data: imageBase64, mimeType } },
    ]);

    const rawText = safeExtractText(geminiResult);
    if (!rawText) {
      return res.status(200).json({
        success: true,
        data: {
          found: false,
          object: objectName,
          direction: '',
          distance: '',
          reference: '',
          speech: `I could not clearly see if the ${objectName} is here.`,
          confidence: 0.0,
        },
      });
    }

    const data = parseGeminiResponse(rawText, objectName);
    return res.status(200).json({ success: true, data });

  } catch (err) {
    const { status, code, message } = classifyGeminiError(err);
    console.error(`[Finder] Error [${code}] ${message}`);
    return res.status(status).json({ success: false, error: message, code });
  }
};
