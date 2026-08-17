// ─────────────────────────────────────────────────────────────────
// client/src/voice/speech.js
// One shared speech-synthesis channel for the whole app.
//
// Everything the assistant says goes through here so the global voice
// controller always knows when the device is talking. That matters:
// the microphone stays open while we speak, and without knowing what
// we are saying we would hear our own voice and act on it.
// ─────────────────────────────────────────────────────────────────

const listeners = new Set();

let speaking = false;
let currentText = '';

function setSpeaking(value, text = '') {
  speaking = value;
  currentText = value ? text : '';
  listeners.forEach((fn) => {
    try { fn(speaking, currentText); } catch { /* a bad listener must not break speech */ }
  });
}

/**
 * speak
 * Cancels anything in progress and speaks `text`.
 *
 * @param {string} text
 * @param {object} [options]
 * @param {number} [options.rate=0.95]
 * @param {Function} [options.onEnd] - called when speech finishes or fails
 */
export function speak(text, options = {}) {
  const { rate = 0.95, onEnd } = options;

  if (!('speechSynthesis' in window) || !text) {
    if (onEnd) onEnd();
    return;
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(String(text));
  utterance.rate = rate;
  utterance.pitch = 1.0;

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    setSpeaking(false);
    if (onEnd) onEnd();
  };

  utterance.onstart = () => setSpeaking(true, String(text));
  utterance.onend = finish;
  utterance.onerror = finish;

  // Some browsers never fire onstart for very short utterances.
  setSpeaking(true, String(text));
  window.speechSynthesis.speak(utterance);
}

/** Stops any speech in progress. */
export function cancelSpeech() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  setSpeaking(false);
}

export function isSpeaking() {
  return speaking;
}

/** The text currently being spoken — used for echo rejection. */
export function currentSpeechText() {
  return currentText;
}

/**
 * subscribeToSpeech
 * @param {Function} listener - (speaking: boolean, text: string) => void
 * @returns {Function} unsubscribe
 */
export function subscribeToSpeech(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * isEchoOfCurrentSpeech
 * True when a recognition result looks like the microphone picking up
 * our own text-to-speech rather than the user. Lets the assistant stay
 * interruptible during a long read-aloud without triggering itself.
 */
export function isEchoOfCurrentSpeech(transcript) {
  if (!speaking || !currentText || !transcript) return false;

  const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const spoken = normalize(currentText);
  const heard = normalize(transcript);

  if (!heard) return false;
  if (spoken.includes(heard)) return true;

  // Partial overlap: most of what we heard also appears in what we said.
  const heardWords = heard.split(' ').filter((w) => w.length > 2);
  if (heardWords.length === 0) return false;

  const overlap = heardWords.filter((w) => spoken.includes(w)).length;
  return overlap / heardWords.length > 0.7;
}
