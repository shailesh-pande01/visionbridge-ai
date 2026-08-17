// ─────────────────────────────────────────────────────────────────
// client/src/voice/actions.js
// The centralized action map.
//
// Gemini returns a symbolic action name — never a route and never
// code. This file is the only place that turns an action or a feature
// id into something the app actually does. Anything not listed here
// is rejected before it reaches the router.
// ─────────────────────────────────────────────────────────────────

// ── Action whitelist (mirrors server/services/assistantActions.js) ──
export const ACTIONS = {
  OPEN_FEATURE:            'OPEN_FEATURE',
  CAPTURE_IMAGE:           'CAPTURE_IMAGE',
  ASK_CONTEXTUAL_QUESTION: 'ASK_CONTEXTUAL_QUESTION',
  FIND_OBJECT:             'FIND_OBJECT',
  GO_HOME:                 'GO_HOME',
  START_VOLUNTEER_HELP:    'START_VOLUNTEER_HELP',
  EMERGENCY_SOS:           'EMERGENCY_SOS',
  CONFIRM:                 'CONFIRM',
  REPEAT_LAST:             'REPEAT_LAST',
  STOP_SPEAKING:           'STOP_SPEAKING',
  CANCEL:                  'CANCEL',
  UNKNOWN:                 'UNKNOWN',
};

export const ALLOWED_ACTIONS = Object.keys(ACTIONS);

export const HOME_ROUTE = '/user/home';

// ── Feature registry ──────────────────────────────────────────────
// Every voice-reachable screen. `route` is fixed in code, so a
// compromised or confused model can only ever land the user on one
// of these known screens.
export const FEATURES = {
  surroundings: {
    id: 'surroundings',
    route: '/camera',
    label: 'Camera Assistant',
    contextLabel: 'scene description',
    canCapture: true,
  },
  hazard: {
    id: 'hazard',
    route: '/camera',
    state: { hazardMode: true },
    label: 'Hazard Scanning',
    contextLabel: 'hazard scan',
    canCapture: true,
  },
  reading: {
    id: 'reading',
    route: '/reading',
    label: 'Reading Assistant',
    contextLabel: 'text you captured',
    canCapture: true,
  },
  transport: {
    id: 'transport',
    route: '/transport',
    label: 'Transport Assistant',
    contextLabel: 'transport information',
    canCapture: true,
  },
  objectFinder: {
    id: 'objectFinder',
    route: '/finder',
    label: 'Object Finder',
    contextLabel: 'object search result',
    canCapture: true,
  },
  location: {
    id: 'location',
    route: '/location',
    label: 'Where Am I',
    contextLabel: 'location information',
    canCapture: false,
  },
  volunteer: {
    id: 'volunteer',
    route: '/volunteer',
    label: 'Volunteer Help',
    contextLabel: 'volunteer request',
    canCapture: false,
  },
  emergency: {
    id: 'emergency',
    route: '/sos',
    label: 'Emergency SOS',
    contextLabel: '',
    canCapture: false,
  },
  home: {
    id: 'home',
    route: HOME_ROUTE,
    label: 'Home',
    contextLabel: '',
    canCapture: false,
  },
};

// Route → feature id, so the controller always knows the active screen
// even when the user navigated with a link or the browser back button.
const ROUTE_TO_FEATURE = {
  '/camera': 'surroundings',
  '/reading': 'reading',
  '/transport': 'transport',
  '/finder': 'objectFinder',
  '/location': 'location',
  '/volunteer': 'volunteer',
  '/sos': 'emergency',
  [HOME_ROUTE]: 'home',
};

export function featureForPath(pathname = '') {
  const path = pathname.replace(/\/+$/, '') || '/';
  return ROUTE_TO_FEATURE[path] || 'home';
}

export function featureLabel(featureId) {
  return FEATURES[featureId]?.label || 'VisionBridge';
}

export function routeForFeature(featureId) {
  return FEATURES[featureId]?.route || null;
}

// ── isExecutableAction ────────────────────────────────────────────
// Final client-side gate. Even though the server validates, the client
// re-checks so nothing outside the whitelist can ever be executed.
export function isExecutableAction(result) {
  if (!result || typeof result !== 'object') return false;
  if (!ALLOWED_ACTIONS.includes(result.action)) return false;
  if (result.action === ACTIONS.OPEN_FEATURE && !FEATURES[result.target]) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────────
// Wake word
//
// "Vision", plus the mis-hearings browser speech recognition most often
// produces for it. A false wake only costs the user a "Yes?", while a
// missed wake makes the assistant feel broken — so the list is generous.
// ─────────────────────────────────────────────────────────────────
const WAKE_PATTERN =
  /(?:^|\s)(?:hey\s+|ok\s+|okay\s+)?(vision|visions|vison|wision|vishon|division|provision)(?:\s|,|\.|$)/g;

/**
 * splitOnWakeWord
 * Finds the LAST "Vision" in the transcript and returns whatever
 * followed it — so "Vision, read this menu" said in one breath works
 * exactly like "Vision" … pause … "read this menu".
 *
 * @param   {string} transcript - lowercase transcript
 * @returns {null|{command: string}} null when no wake word was heard
 */
export function splitOnWakeWord(transcript) {
  const padded = ` ${transcript} `;
  WAKE_PATTERN.lastIndex = 0;

  let match;
  let last = null;
  while ((match = WAKE_PATTERN.exec(padded)) !== null) {
    last = match;
  }
  if (!last) return null;

  const command = padded
    .slice(last.index + last[0].length)
    .replace(/^[\s,.:;!?-]+/, '')
    .trim();

  return { command };
}

// ─────────────────────────────────────────────────────────────────
// Local fast paths
//
// Safety-critical and high-frequency commands resolve instantly in the
// browser with no network round-trip. This keeps "Vision, emergency"
// immediate (spec: emergency must never wait on a conversation) and
// avoids spending Gemini tokens on "capture" a hundred times a day.
// ─────────────────────────────────────────────────────────────────
const FAST_PATHS = [
  {
    // "help me" only counts on its own — "help me read this" must not
    // fire an emergency alert.
    test: /\b(emergency|s\.?o\.?s\.?|i'?m in danger|im in danger|i am in danger|call for help now)\b|^help me$/,
    build: () => ({
      type: 'navigation',
      action: ACTIONS.EMERGENCY_SOS,
      speech: 'Starting emergency alert.',
      local: true,
    }),
  },
  {
    test: /\b(stop talking|be quiet|stop speaking|shut up|stop reading)\b/,
    build: () => ({ type: 'action', action: ACTIONS.STOP_SPEAKING, speech: '', local: true }),
  },
  {
    test: /^(stop|quiet)$/,
    build: () => ({ type: 'action', action: ACTIONS.STOP_SPEAKING, speech: '', local: true }),
  },
  {
    test: /^(cancel|never ?mind|forget it|no thanks|no)$/,
    build: () => ({ type: 'action', action: ACTIONS.CANCEL, speech: 'Cancelled.', local: true }),
  },
  {
    test: /^(yes|yeah|yep|confirm|send it|send the request|go ahead|do it|ok|okay)$/,
    build: () => ({ type: 'action', action: ACTIONS.CONFIRM, speech: '', local: true }),
  },
  {
    test: /\b(go home|take me home|home screen|main menu|go back home)\b/,
    build: () => ({ type: 'navigation', action: ACTIONS.GO_HOME, speech: 'Going home.', local: true }),
  },
  {
    test: /\b(capture|take a (photo|picture)|scan (this|it|now)|snap (this|it))\b/,
    build: () => ({ type: 'action', action: ACTIONS.CAPTURE_IMAGE, speech: 'Capturing now.', local: true }),
  },
  {
    test: /\b(say (that )?again|repeat that|repeat it|what did you say)\b/,
    build: () => ({ type: 'action', action: ACTIONS.REPEAT_LAST, speech: '', local: true }),
  },
];

/**
 * matchFastPath
 * @param {string} command - normalized (lowercase, punctuation-stripped) command
 * @returns {object|null} an executable action, or null to fall through to Gemini
 */
export function matchFastPath(command) {
  if (!command) return null;
  const text = command.toLowerCase().replace(/[.,!?;:]/g, '').replace(/\s+/g, ' ').trim();

  for (const { test, build } of FAST_PATHS) {
    if (test.test(text)) return build(text);
  }
  return null;
}
