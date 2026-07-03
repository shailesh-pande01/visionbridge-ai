// ─────────────────────────────────────────────────────────────────
// controllers/locationController.js
// "Where Am I?" Location Assistant
//   Uses OpenStreetMap (Nominatim for reverse geocoding & Overpass API
//   for nearby landmarks), then Gemini AI to generate a natural, spoken summary.
// ─────────────────────────────────────────────────────────────────

const { GoogleGenerativeAI } = require('@google/generative-ai');

// ── Model priority list (shared with visionController) ────────────
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

// ── Lazy Gemini client ────────────────────────────────────────────
let _geminiClient = null;

function getGeminiClient() {
  if (!process.env.GEMINI_API_KEY) {
    const err = new Error('GEMINI_API_KEY is not set.');
    err.code = 'MISSING_API_KEY';
    throw err;
  }
  if (!_geminiClient) {
    _geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return _geminiClient;
}

const GENERATION_CONFIG = {
  temperature:     0.3,
  topP:            0.9,
  maxOutputTokens: 600,
};

// ── Gemini generate with model fallback ───────────────────────────
async function generateWithFallback(client, prompt) {
  let lastError;
  for (const modelName of MODEL_CANDIDATES) {
    try {
      const model = client.getGenerativeModel({
        model: modelName,
        generationConfig: GENERATION_CONFIG,
      });
      const result = await model.generateContent(prompt);
      console.log(`[Location] Model used: ${modelName}`);
      return result;
    } catch (err) {
      console.warn(`[Location] "${modelName}" failed (${err.message}) — trying next`);
      lastError = err;
      continue;
    }
  }
  if (lastError) throw lastError;
  const err = new Error('No available Gemini model found.');
  err.code = 'MODEL_NOT_FOUND';
  throw err;
}

// ── Safe text extractor ───────────────────────────────────────────
function safeExtractText(geminiResult) {
  try {
    const candidate = geminiResult.response.candidates?.[0];
    if (!candidate || candidate.finishReason === 'SAFETY') return null;
    return geminiResult.response.text();
  } catch {
    return null;
  }
}

// ── OpenStreetMap Nominatim Reverse Geocoding ─────────────────────
async function reverseGeocodeOSM(lat, lng) {
  try {
    // Nominatim requires a valid User-Agent header per their terms of service
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'VisionBridgeApp/1.0 (contact@visionbridge.local)' }
    });
    
    if (!resp.ok) {
      console.warn(`[Location] Nominatim failed with status: ${resp.status}`);
      return null;
    }

    const data = await resp.json();
    if (!data || !data.display_name) {
      return null;
    }

    return {
      formattedAddress: data.display_name,
      addressDetails: data.address || {},
    };
  } catch (err) {
    console.warn(`[Location] OSM Geocoding error: ${err.message}`);
    return null;
  }
}

// ── OpenStreetMap Overpass API Nearby Places ──────────────────────
async function nearbyPlacesOSM(lat, lng) {
  try {
    // Overpass query to look for named features within 200 meters
    const query = `[out:json][timeout:10];
node(around:200,${lat},${lng})[name];
out 12;`;
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'VisionBridgeApp/1.0 (contact@visionbridge.local)' }
    });

    if (!resp.ok) {
      console.warn(`[Location] Overpass API failed with status: ${resp.status}`);
      return [];
    }

    const data = await resp.json();
    if (!data || !data.elements?.length) {
      return [];
    }

    return data.elements.map(p => {
      const tags = p.tags || {};
      const type = tags.amenity || tags.shop || tags.tourism || tags.highway || tags.building || 'landmark';
      return {
        name: tags.name,
        type: type,
      };
    });
  } catch (err) {
    console.warn(`[Location] Overpass API error: ${err.message}`);
    return [];
  }
}

// ── Gemini prompt builder ─────────────────────────────────────────
function buildLocationPrompt(lat, lng, geocodeData, places) {
  let context = `The user's GPS coordinates are: ${lat}, ${lng}.\n`;

  if (geocodeData) {
    context += `\nReverse geocoded address (OpenStreetMap): ${geocodeData.formattedAddress}\n`;
    if (geocodeData.addressDetails) {
      const addr = geocodeData.addressDetails;
      const street = addr.road || addr.pedestrian || addr.suburb || '';
      const city = addr.city || addr.town || addr.village || addr.county || '';
      if (street) context += `Primary road/area: ${street}\n`;
      if (city) context += `City/Locality: ${city}\n`;
    }
  }

  if (places && places.length > 0) {
    context += `\nNearby places & landmarks (OpenStreetMap, within 200 meters):\n`;
    places.forEach(p => {
      context += `  - ${p.name} (${p.type.replace(/_/g, ' ')})\n`;
    });
  }

  return `You are a location assistant speaking directly to a person with low vision. Your response will be read aloud by a screen reader.

${context}

Based on the above information, describe the user's current location in 3 to 5 short, natural sentences. Follow these rules:

1. Start with "You are" or "You're" — tell them WHERE they are.
2. Mention the street name and neighborhood/area if available.
3. Mention 2 to 3 nearby landmarks, shops, or useful places (bus stops, pharmacies, restaurants, etc.).
4. Use simple spatial language: "nearby", "close to", "a short walk from".
5. If GPS coordinates are all you have (no address data), give a general description based on the coordinates (urban area, residential zone, etc.) and be honest that detailed location info is not available.
6. Do NOT include the raw coordinates in your response.
7. Do NOT use bullet points or lists — write in fluent, natural sentences.
8. Do NOT say "I can see", "Based on OpenStreetMap", or "Based on the data" — speak as if you know the area directly.
9. Keep it concise and helpful — this will be spoken aloud.

Return ONLY the spoken description text, nothing else.`;
}

// ── Error classifier ──────────────────────────────────────────────
function classifyError(err) {
  const msg  = err.message || '';
  const code = err.code    || '';

  if (code === 'MISSING_API_KEY') return { status: 500, code, message: msg };
  if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid'))
    return { status: 401, code: 'INVALID_API_KEY', message: 'Gemini API key is invalid.' };
  if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota'))
    return { status: 429, code: 'RATE_LIMIT', message: 'Rate limit reached. Please wait and try again.' };
  if (msg.includes('PERMISSION_DENIED'))
    return { status: 403, code: 'PERMISSION_DENIED', message: 'API permission denied.' };

  return { status: 500, code: 'LOCATION_ERROR', message: msg };
}

// ─────────────────────────────────────────────────────────────────
// POST /api/location/current
// Body: { latitude: number, longitude: number }
// ─────────────────────────────────────────────────────────────────
exports.getCurrentLocation = async (req, res) => {
  try {
    const { latitude, longitude } = req.locationData;

    console.log(`[Location] getCurrentLocation — lat: ${latitude}, lng: ${longitude}`);

    // Step 1: OpenStreetMap reverse geocoding + nearby places
    const [geocodeData, places] = await Promise.all([
      reverseGeocodeOSM(latitude, longitude),
      nearbyPlacesOSM(latitude, longitude),
    ]);

    const hasMapData = geocodeData || (places && places.length > 0);
    console.log(`[Location] OSM data available: ${hasMapData ? 'yes' : 'no (using Gemini only)'}`);

    // Step 2: Build prompt and ask Gemini to generate natural-language summary
    const prompt = buildLocationPrompt(latitude, longitude, geocodeData, places);
    const client = getGeminiClient();
    const geminiResult = await generateWithFallback(client, prompt);
    const rawText = safeExtractText(geminiResult);

    if (!rawText) {
      return res.status(200).json({
        success: true,
        data: {
          summary: 'I could not determine your exact location description. Please make sure location services are enabled and try again.',
          address: geocodeData?.formattedAddress || null,
          landmarks: [],
          coordinates: { latitude, longitude },
        },
      });
    }

    // Clean up any thinking tokens or fences
    let summary = rawText.trim();
    const fenceMatch = summary.match(/```(?:\w*)\s*([\s\S]*?)```/);
    if (fenceMatch) summary = fenceMatch[1].trim();

    return res.status(200).json({
      success: true,
      data: {
        summary,
        address: geocodeData?.formattedAddress || null,
        landmarks: places?.slice(0, 5).map(p => p.name) || [],
        coordinates: { latitude, longitude },
      },
    });

  } catch (err) {
    const { status, code, message } = classifyError(err);
    console.error(`[Location] Error [${code}] ${message}`);
    if (status === 500) console.error(err.stack);
    return res.status(status).json({ success: false, error: message, code });
  }
};
