// ─────────────────────────────────────────────────────────────────
// controllers/voiceController.js
// Legacy single-shot intent router: POST /api/voice/intent
//
// Kept for backwards compatibility — it returns a route directly.
// New conversational work goes through /api/assistant/command, which
// returns symbolic actions instead of routes.
// ─────────────────────────────────────────────────────────────────

const gemini = require('../services/geminiService');

// Maps Gemini intents to existing frontend routes
const ROUTE_MAP = {
  surroundings: '/camera-assistant',
  reading: '/reading-assistant',
  transport: '/transport-assistant',
  objectFinder: '/object-finder',
  location: '/location-assistant',
  volunteer: '/volunteer-help',
  emergency: '/emergency-sos',
  hazard: '/hazard-mode',
  unknown: null,
};

const INTENT_PROMPT = `You are the intent router for VisionBridge, an accessibility assistant for low-vision users.

Classify the user's spoken command into the single most appropriate VisionBridge feature.
Choose based on the user's intended task, not exact keywords.

Available intents:
surroundings
reading
transport
objectFinder
location
volunteer
emergency
hazard
unknown

Return JSON only:
{
  "intent": "...",
  "confidence": 0.0
}

Never invent a new intent.

Examples:
'I want to read a menu' → reading
'Where is this bus going?' → transport
'Find my glasses' → objectFinder
'Is there anything dangerous ahead?' → hazard
'Where am I?' → location
'I need a person to help me' → volunteer
'I am in danger' → emergency
'What is in front of me?' → surroundings
`;

exports.classifyIntent = async (req, res) => {
  try {
    const { command } = req.body;

    if (!command || !command.trim()) {
      return res.status(400).json({ error: 'Command is required' });
    }

    const data = await gemini.generateJson(
      [INTENT_PROMPT, `User command: "${command}"`],
      { temperature: 0.1, maxOutputTokens: 256 }
    );

    const intent     = data?.intent || 'unknown';
    const confidence = data?.confidence || 0;

    // Map to the actual frontend route — Gemini never supplies a route
    const route = ROUTE_MAP[intent] || null;

    res.json({
      intent: route ? intent : 'unknown',
      route,
      confidence,
    });
  } catch (error) {
    const { status, message } = gemini.classifyGeminiError(error);
    console.error('[Voice Intent] Error:', message);
    res.status(status).json({
      error: 'Failed to classify intent: ' + message,
      intent: 'unknown',
      route: null,
      confidence: 0,
    });
  }
};
