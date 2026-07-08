// ─────────────────────────────────────────────────────────────────
// controllers/transportController.js
// Gemini Vision — Public Transport & Signboard Assistant
// ─────────────────────────────────────────────────────────────────

const { GoogleGenerativeAI } = require('@google/generative-ai');

// ── Model priority list ───────────────────────────────────────────
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

const TRANSPORT_PROMPT = `You are VisionBridge, an accessibility assistant for low-vision users.

Analyze this image.
Extract ONLY transportation and navigation-related information.

Prioritize:
- Bus number
- Bus destination
- Train number
- Platform number
- Metro information
- Building name
- Directional signs
- Important navigation boards

Ignore advertisements, decorations, background objects, and unnecessary details.
If multiple signs exist, prioritize the closest and most relevant one.

You MUST respond with a single, complete, valid JSON object. Do not include any conversational text before or after the JSON.
Do not use markdown formatting. Just output the raw JSON object.

The JSON MUST have exactly these keys:
{
  "type": "String, e.g. Bus, Train, Metro, Building, Sign, or None",
  "title": "String, e.g. Bus 102, Platform 3",
  "destination": "String, e.g. Shivajinagar",
  "speech": "String, What the screen reader will say aloud",
  "confidence": 0.95
}

If no transportation or navigation information is found, return exactly this JSON:
{"type":"None","title":"","destination":"","speech":"No transport information found.","confidence":0.0}
`;

async function generateWithFallback(client, parts) {
  let lastError;

  for (const modelName of MODEL_CANDIDATES) {
    try {
      const model = client.getGenerativeModel({
        model:            modelName,
        generationConfig: GENERATION_CONFIG,
      });

      const result = await model.generateContent(parts);
      console.log(`[Transport] Model used: ${modelName}`);
      return result;
    } catch (err) {
      console.warn(`[Transport] "${modelName}" failed (${err.message}) — trying next model`);
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

function parseGeminiResponse(rawText) {
  console.log(`[Transport] Gemini rawText:\n${rawText}`);
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
      type: String(parsed.type || 'None'),
      title: String(parsed.title || ''),
      destination: String(parsed.destination || ''),
      speech: String(parsed.speech || 'Could not extract information clearly.'),
      confidence: Math.min(1.0, Math.max(0.0, Number(parsed.confidence ?? 0.8))),
    };
  } catch (err) {
    console.warn(`[Transport] JSON parse failed (${err.message}). Trying regex fallback...`);

    // Regex fallback to extract partial JSON from truncated or malformed responses
    const extractString = (key) => {
      const regex = new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`);
      const match = rawText.match(regex);
      return match ? match[1].trim() : '';
    };
    
    const extractNumber = (key) => {
      const regex = new RegExp(`"${key}"\\s*:\\s*([0-9.]+)`);
      const match = rawText.match(regex);
      return match ? Number(match[1]) : 0.8;
    };

    const type = extractString('type') || 'Unknown';
    const title = extractString('title');
    const destination = extractString('destination');
    const speech = extractString('speech') || 'Information detected, but partly unreadable.';
    const confidence = extractNumber('confidence');

    // If it extracted at least a title or destination, use it
    if (title || destination) {
      let fallbackSpeech = speech;
      if (fallbackSpeech === 'Information detected, but partly unreadable.') {
        fallbackSpeech = `${title} ${destination ? 'to ' + destination : ''}`.trim();
      }
      return {
        type,
        title,
        destination,
        speech: fallbackSpeech,
        confidence
      };
    }

    return {
      type: 'Unknown',
      title: '',
      destination: '',
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

exports.analyzeTransport = async (req, res) => {
  try {
    // Reuses the same validateVisionRequest middleware which sets req.visionData
    const { imageBase64, mimeType } = req.visionData;
    console.log(`[Transport] analyzeTransport — type: ${mimeType} | base64 length: ${imageBase64.length}`);

    const client = getClient();
    const geminiResult = await generateWithFallback(client, [
      TRANSPORT_PROMPT,
      { inlineData: { data: imageBase64, mimeType } },
    ]);

    const rawText = safeExtractText(geminiResult);
    if (!rawText) {
      return res.status(200).json({
        success: true,
        data: {
          type: 'None',
          title: '',
          destination: '',
          speech: 'I could not see any transport information clearly.',
          confidence: 0.0,
        },
      });
    }

    const data = parseGeminiResponse(rawText);
    return res.status(200).json({ success: true, data });

  } catch (err) {
    const { status, code, message } = classifyGeminiError(err);
    console.error(`[Transport] Error [${code}] ${message}`);
    return res.status(status).json({ success: false, error: message, code });
  }
};
