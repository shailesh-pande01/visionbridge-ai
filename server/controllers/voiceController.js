const { GoogleGenerativeAI } = require('@google/generative-ai');

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

let _client = null;
function getClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set.');
  }
  if (!_client) {
    _client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return _client;
}

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

    const client = getClient();
    const model = client.getGenerativeModel({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    });

    const result = await model.generateContent([
      INTENT_PROMPT,
      `User command: "${command}"`
    ]);

    const responseText = result.response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error('[Voice Intent] JSON parse error:', responseText);
      data = { intent: 'unknown', confidence: 0 };
    }

    const intent = data.intent || 'unknown';
    const confidence = data.confidence || 0;
    
    // Map to the actual frontend route
    const route = ROUTE_MAP[intent] || null;

    res.json({
      intent: route ? intent : 'unknown',
      route,
      confidence
    });
  } catch (error) {
    console.error('[Voice Intent] Error:', error.message);
    res.status(500).json({
      error: 'Failed to classify intent',
      intent: 'unknown',
      route: null,
      confidence: 0
    });
  }
};
