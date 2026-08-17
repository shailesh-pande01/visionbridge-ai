// ─────────────────────────────────────────────────────────────────
// client/src/voice/AssistantContext.jsx
// Lightweight session memory + the feature command registry.
//
// Two jobs:
//   1. Remember the useful result of the user's last interaction with
//      each feature, so follow-up questions ("what is the cheapest
//      dish?") never need a second photo.
//   2. Let feature screens register voice handlers (capture, submit,
//      cancel) that the single global controller can call.
//
// Memory is deliberately small: one slot per feature, a short rolling
// conversation, and hard character caps. Only the slice belonging to
// the active feature is ever sent to the backend.
// ─────────────────────────────────────────────────────────────────

import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { FEATURES } from './actions';

const STORAGE_KEY = 'visionbridge.assistant.context';

// Caps that keep prompts (and token spend) small.
const MAX_SUMMARY_CHARS = 1500;
const MAX_HISTORY_TURNS = 4;
const MAX_TURN_CHARS = 200;

// A stored result older than this is no longer offered as context —
// the world has probably moved on.
const CONTEXT_TTL_MS = 15 * 60 * 1000;

const EMPTY_MEMORY = {
  lastImageAnalysis: null,   // surroundings — spoken scene description
  extractedText: null,       // reading — OCR result
  sceneSummary: null,        // hazard — rolling scene summary
  objectRequested: null,     // object finder — what the user asked for
  objectResult: null,        // object finder — where it was found
  transportInfo: null,       // transport — bus / platform / destination
  locationInfo: null,        // where am I — address + landmarks
};

// Which memory slots feed which screen. Keeping this explicit stops
// unrelated feature data from leaking into a prompt.
const FEATURE_MEMORY_KEYS = {
  surroundings: ['lastImageAnalysis', 'sceneSummary'],
  hazard: ['sceneSummary', 'lastImageAnalysis'],
  reading: ['extractedText'],
  transport: ['transportInfo'],
  objectFinder: ['objectResult', 'objectRequested'],
  location: ['locationInfo'],
  volunteer: [],
  emergency: [],
  home: [],
};

const AssistantContext = createContext(null);

function truncate(value, max) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function loadPersisted() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function AssistantProvider({ children }) {
  // ── Session memory ──────────────────────────────────────────────
  const persisted = useRef(loadPersisted()).current;

  const [memory, setMemory] = useState(() => ({
    ...EMPTY_MEMORY,
    ...(persisted?.memory || {}),
  }));
  const [updatedAt, setUpdatedAt] = useState(() => persisted?.updatedAt || {});
  const [conversationHistory, setConversationHistory] = useState(
    () => persisted?.conversationHistory || []
  );

  // ── Live UI state (not persisted) ───────────────────────────────
  const [activeFeature, setActiveFeature] = useState('home');
  const [voiceState, setVoiceState] = useState({
    status: 'IDLE',
    transcript: '',
    message: '',
    lastResponse: '',
    error: '',
  });

  // Feature screens register their voice handlers here. A ref, not
  // state, so registering never triggers a re-render loop.
  const handlersRef = useRef({});

  // Survives refresh (spec §17) but stays per-tab.
  useEffect(() => {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ memory, updatedAt, conversationHistory })
      );
    } catch { /* private mode / quota — memory still works in-session */ }
  }, [memory, updatedAt, conversationHistory]);

  // ── Memory writers ──────────────────────────────────────────────

  /**
   * rememberContext
   * Replaces the named memory slots. A new capture in a feature always
   * replaces that feature's previous result rather than accumulating.
   *
   * @param {object} patch - e.g. { extractedText: '...' }
   */
  const rememberContext = useCallback((patch) => {
    if (!patch || typeof patch !== 'object') return;

    const cleaned = {};
    const stamps = {};
    const now = Date.now();

    Object.entries(patch).forEach(([key, value]) => {
      if (!(key in EMPTY_MEMORY)) return;
      cleaned[key] = truncate(value, MAX_SUMMARY_CHARS);
      stamps[key] = now;
    });

    if (Object.keys(cleaned).length === 0) return;

    setMemory((prev) => ({ ...prev, ...cleaned }));
    setUpdatedAt((prev) => ({ ...prev, ...stamps }));
  }, []);

  /** Clears the memory slots belonging to one feature. */
  const clearFeatureContext = useCallback((featureId) => {
    const keys = FEATURE_MEMORY_KEYS[featureId] || [];
    if (keys.length === 0) return;

    setMemory((prev) => {
      const next = { ...prev };
      keys.forEach((k) => { next[k] = null; });
      return next;
    });
  }, []);

  const clearAllContext = useCallback(() => {
    setMemory({ ...EMPTY_MEMORY });
    setUpdatedAt({});
    setConversationHistory([]);
  }, []);

  /** Appends one turn, keeping only the most recent few. */
  const rememberTurn = useCallback((user, assistant) => {
    const turn = {
      user: truncate(user, MAX_TURN_CHARS) || '',
      assistant: truncate(assistant, MAX_TURN_CHARS) || '',
    };
    if (!turn.user && !turn.assistant) return;

    setConversationHistory((prev) => [...prev, turn].slice(-MAX_HISTORY_TURNS));
  }, []);

  // ── Context selection ───────────────────────────────────────────
  // Everything above is storage. This is the part that decides what
  // actually travels to Gemini: one feature's slice, nothing else.
  const memoryRef = useRef(memory);
  const updatedAtRef = useRef(updatedAt);
  const historyRef = useRef(conversationHistory);
  useEffect(() => { memoryRef.current = memory; }, [memory]);
  useEffect(() => { updatedAtRef.current = updatedAt; }, [updatedAt]);
  useEffect(() => { historyRef.current = conversationHistory; }, [conversationHistory]);

  const buildContextPayload = useCallback((featureId) => {
    const mem = memoryRef.current;
    const stamps = updatedAtRef.current;
    const feature = featureId || 'home';

    let keys = FEATURE_MEMORY_KEYS[feature] || [];

    // On a screen with no visual context of its own (home, volunteer),
    // fall back to whatever the user most recently looked at, so
    // "what was the price again?" still works after navigating away.
    if (keys.length === 0) {
      const recent = Object.keys(EMPTY_MEMORY)
        .filter((k) => mem[k] && Date.now() - (stamps[k] || 0) < CONTEXT_TTL_MS)
        .sort((a, b) => (stamps[b] || 0) - (stamps[a] || 0));
      keys = recent.slice(0, 1);
    }

    const parts = [];
    let newestStamp = 0;

    keys.forEach((key) => {
      const value = mem[key];
      if (!value) return;
      const age = Date.now() - (stamps[key] || 0);
      if (age > CONTEXT_TTL_MS) return;

      newestStamp = Math.max(newestStamp, stamps[key] || 0);
      parts.push(key === 'objectRequested' ? `The user is looking for: ${value}` : value);
    });

    const contextSummary = truncate(parts.join('\n'), MAX_SUMMARY_CHARS) || '';

    return {
      activeFeature: feature,
      contextLabel: FEATURES[feature]?.contextLabel || '',
      contextSummary,
      contextAgeSeconds: newestStamp ? Math.round((Date.now() - newestStamp) / 1000) : undefined,
      recentTurns: historyRef.current.slice(-3),
    };
  }, []);

  const hasContextFor = useCallback(
    (featureId) => Boolean(buildContextPayload(featureId).contextSummary),
    [buildContextPayload]
  );

  // ── Feature command registry ────────────────────────────────────

  /**
   * registerVoiceHandlers
   * Called by a feature screen on mount. Takes the screen's handler
   * *ref* rather than a snapshot, so the controller always calls the
   * current closures without the screen re-registering on every render.
   *
   * @param {string} featureId
   * @param {object} handlerRef - React ref whose .current is
   *                              { capture, submit, cancel, findObject }
   * @returns {Function} unregister
   */
  const registerVoiceHandlers = useCallback((featureId, handlerRef) => {
    handlersRef.current[featureId] = handlerRef;
    return () => {
      if (handlersRef.current[featureId] === handlerRef) {
        delete handlersRef.current[featureId];
      }
    };
  }, []);

  const getHandler = useCallback((featureId, name) => {
    const handler = handlersRef.current[featureId]?.current?.[name];
    return typeof handler === 'function' ? handler : null;
  }, []);

  const value = useMemo(
    () => ({
      // memory
      memory,
      conversationHistory,
      rememberContext,
      rememberTurn,
      clearFeatureContext,
      clearAllContext,
      buildContextPayload,
      hasContextFor,

      // active screen
      activeFeature,
      setActiveFeature,

      // handlers
      registerVoiceHandlers,
      getHandler,

      // UI state shared with the status bar
      voiceState,
      setVoiceState,
    }),
    [
      memory, conversationHistory, rememberContext, rememberTurn,
      clearFeatureContext, clearAllContext, buildContextPayload, hasContextFor,
      activeFeature, registerVoiceHandlers, getHandler, voiceState,
    ]
  );

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useAssistant() {
  const ctx = useContext(AssistantContext);
  if (!ctx) {
    throw new Error('useAssistant must be used inside an AssistantProvider');
  }
  return ctx;
}

/**
 * useFeatureVoice
 * Convenience hook for feature screens. Marks the screen as active and
 * registers its voice handlers for the lifetime of the component.
 *
 * @param {string} featureId
 * @param {object} handlers - { capture, submit, cancel, findObject }
 */
export function useFeatureVoice(featureId, handlers) {
  const { registerVoiceHandlers, setActiveFeature, rememberContext, clearFeatureContext } = useAssistant();

  // Keep the latest handler closures without re-registering every render.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    setActiveFeature(featureId);
    return registerVoiceHandlers(featureId, handlersRef);
  }, [featureId, registerVoiceHandlers, setActiveFeature]);

  return { rememberContext, clearFeatureContext };
}
