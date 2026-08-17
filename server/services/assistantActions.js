// ─────────────────────────────────────────────────────────────────
// services/assistantActions.js
// The single source of truth for what the AI is allowed to ask the
// application to do.
//
// Gemini never returns a URL, a route or executable code — it returns
// one of these symbolic action names plus a small, validated payload.
// The React client owns the action → route mapping.
// ─────────────────────────────────────────────────────────────────

// ── Action whitelist ──────────────────────────────────────────────
const ACTIONS = {
  OPEN_FEATURE:            'OPEN_FEATURE',            // + target
  CAPTURE_IMAGE:           'CAPTURE_IMAGE',
  ASK_CONTEXTUAL_QUESTION: 'ASK_CONTEXTUAL_QUESTION', // + question
  FIND_OBJECT:             'FIND_OBJECT',             // + objectName
  GO_HOME:                 'GO_HOME',
  START_VOLUNTEER_HELP:    'START_VOLUNTEER_HELP',    // + message
  EMERGENCY_SOS:           'EMERGENCY_SOS',
  CONFIRM:                 'CONFIRM',                 // "yes" / "send it"
  REPEAT_LAST:             'REPEAT_LAST',
  STOP_SPEAKING:           'STOP_SPEAKING',
  CANCEL:                  'CANCEL',
  UNKNOWN:                 'UNKNOWN',
};

const ALLOWED_ACTIONS = Object.keys(ACTIONS);

// ── Feature target whitelist ──────────────────────────────────────
// Symbolic feature ids. The client resolves these to routes.
const FEATURE_TARGETS = [
  'surroundings',   // AI Camera Assistant
  'hazard',         // AI Camera Assistant, hazard mode
  'reading',        // Smart Reading Assistant
  'transport',      // Public Transport & Signboard Assistant
  'objectFinder',   // Smart Object Finder
  'location',       // Where Am I?
  'volunteer',      // Volunteer Help
  'emergency',      // Emergency SOS
  'home',           // Home screen
];

const RESPONSE_TYPES = ['navigation', 'action', 'answer', 'clarification', 'error'];

// ── Field limits — keeps prompts and speech compact ───────────────
const LIMITS = {
  speech:     400,
  question:   240,
  answer:     600,
  objectName: 60,
  message:    240,
};

function clean(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

// ── validateAction ────────────────────────────────────────────────
// Takes whatever Gemini produced and returns a safe, well-formed
// action object. Anything unrecognised collapses to UNKNOWN — the
// client will never receive an action it cannot execute.
function validateAction(raw) {
  const result = raw && typeof raw === 'object' ? raw : {};

  let action = clean(result.action, 40).toUpperCase();
  if (!ALLOWED_ACTIONS.includes(action)) {
    if (action) console.warn(`[Assistant] Rejected non-whitelisted action: "${action}"`);
    action = ACTIONS.UNKNOWN;
  }

  let target = clean(result.target, 40);
  if (target && !FEATURE_TARGETS.includes(target)) {
    console.warn(`[Assistant] Rejected non-whitelisted target: "${target}"`);
    target = '';
  }

  // OPEN_FEATURE without a valid target cannot be executed.
  if (action === ACTIONS.OPEN_FEATURE && !target) {
    action = ACTIONS.UNKNOWN;
  }

  const validated = {
    action,
    target:     target || undefined,
    question:   clean(result.question, LIMITS.question) || undefined,
    objectName: clean(result.objectName, LIMITS.objectName) || undefined,
    message:    clean(result.message, LIMITS.message) || undefined,
    speech:     clean(result.speech, LIMITS.speech) || undefined,
    confidence: Math.min(1, Math.max(0, Number(result.confidence ?? 0.8))),
  };

  // Drop undefined keys so the JSON stays small.
  Object.keys(validated).forEach((k) => validated[k] === undefined && delete validated[k]);
  return validated;
}

module.exports = {
  ACTIONS,
  ALLOWED_ACTIONS,
  FEATURE_TARGETS,
  RESPONSE_TYPES,
  LIMITS,
  clean,
  validateAction,
};
