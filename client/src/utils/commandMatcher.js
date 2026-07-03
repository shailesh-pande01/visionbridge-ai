// ─────────────────────────────────────────────────────────────────
// client/src/utils/commandMatcher.js
// Matches spoken phrases to VisionBridge features.
// Configurable mapping list for easy addition of new commands.
// ─────────────────────────────────────────────────────────────────

export const COMMAND_MAPPINGS = [
  {
    featureName: 'Emergency SOS',
    route: '/sos',
    confirmationMessage: 'Opening Emergency SOS.',
    keywords: [
      'emergency',
      "i'm in danger",
      'im in danger',
      'call emergency',
      'sos',
      // Strict match for 'help me' to differentiate from volunteer 'i need help'
      'help me',
    ],
  },
  {
    featureName: 'Volunteer Help',
    route: '/volunteer',
    confirmationMessage: 'Opening Volunteer Help.',
    keywords: [
      'need volunteer',
      'find volunteer',
      'i need help',
      'someone help me',
      'volunteer assistance',
      'volunteer',
    ],
  },
  {
    featureName: 'AI Camera Assistant',
    route: '/camera',
    confirmationMessage: 'Opening AI Camera Assistant.',
    keywords: [
      'describe surroundings',
      "what's in front of me",
      'whats in front of me',
      'describe my surroundings',
      'what do you see',
      'look around',
      'camera',
    ],
  },
  {
    featureName: 'Smart Reading Assistant',
    route: '/reading',
    confirmationMessage: 'Opening Reading Assistant.',
    keywords: [
      'read text',
      'read this',
      'read sign',
      'read document',
      'read label',
      'read menu',
      'read medicine',
      'reading',
    ],
  },
  {
    featureName: 'Where Am I',
    route: '/location',
    confirmationMessage: 'Opening Where Am I Location Assistant.',
    keywords: [
      'where am i',
      'my location',
      'current location',
      'where is this place',
      'tell my location',
      'location',
    ],
  },
];

/**
 * Normalizes text and finds the best matching feature route.
 * @param {string} transcript - The spoken text from Speech Recognition.
 * @returns {object|null} { featureName, route, confirmationMessage } or null if no match.
 */
export function matchCommand(transcript) {
  if (!transcript) return null;

  // Normalize: lowercase, remove punctuation, remove extra spaces
  const cleanTranscript = transcript
    .toLowerCase()
    .replace(/[.,!?]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // 1. Try exact or substring match against keywords in priority order (SOS first)
  for (const group of COMMAND_MAPPINGS) {
    for (const kw of group.keywords) {
      if (cleanTranscript.includes(kw)) {
        return {
          featureName: group.featureName,
          route: group.route,
          confirmationMessage: group.confirmationMessage,
        };
      }
    }
  }

  // 2. Fallback heuristic checking individual words if no phrase matched
  if (cleanTranscript.includes('danger') || cleanTranscript.includes('sos')) {
    return { featureName: 'Emergency SOS', route: '/sos', confirmationMessage: 'Opening Emergency SOS.' };
  }
  if (cleanTranscript.includes('volunteer')) {
    return { featureName: 'Volunteer Help', route: '/volunteer', confirmationMessage: 'Opening Volunteer Help.' };
  }
  if (cleanTranscript.includes('read') || cleanTranscript.includes('menu') || cleanTranscript.includes('sign')) {
    return { featureName: 'Smart Reading Assistant', route: '/reading', confirmationMessage: 'Opening Reading Assistant.' };
  }
  if (cleanTranscript.includes('where') || cleanTranscript.includes('place')) {
    return { featureName: 'Where Am I', route: '/location', confirmationMessage: 'Opening Where Am I Location Assistant.' };
  }
  if (cleanTranscript.includes('camera') || cleanTranscript.includes('surrounding') || cleanTranscript.includes('see')) {
    return { featureName: 'AI Camera Assistant', route: '/camera', confirmationMessage: 'Opening AI Camera Assistant.' };
  }

  return null;
}
