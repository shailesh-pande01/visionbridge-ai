// ─────────────────────────────────────────────────────────────────
// client/src/voice/VoiceController.jsx
// The one and only SpeechRecognition instance in VisionBridge.
//
// Lifecycle:
//   LISTENING → "Vision" → COMMAND CAPTURE → GEMINI → ACTION → LISTENING
//
// It is mounted once by LowVisionLayout, above the feature routes, so
// it survives feature-to-feature navigation, the browser back button
// and returning home without ever being torn down and rebuilt.
// ─────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAssistant } from './AssistantContext';
import { sendCommand } from '../services/assistantService';
import {
  speak, cancelSpeech, subscribeToSpeech, isEchoOfCurrentSpeech,
} from './speech';
import {
  ACTIONS, FEATURES, HOME_ROUTE, featureForPath, featureLabel,
  isExecutableAction, matchFastPath, splitOnWakeWord,
} from './actions';
import VoiceStatusBar from './VoiceStatusBar';
import './VoiceController.css';

// ── Timing ────────────────────────────────────────────────────────
const COMMAND_PAUSE_MS = 1200;    // silence that ends a command
const COMMAND_TIMEOUT_MS = 9000;  // wake word with nothing after it
const RESTART_DELAY_MS = 350;
const MAX_RESTART_RETRIES = 6;

const SUPPORTED =
  typeof window !== 'undefined' &&
  (window.SpeechRecognition || window.webkitSpeechRecognition);

function normalize(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function VoiceController() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const {
    activeFeature, setActiveFeature,
    buildContextPayload, rememberTurn,
    getHandler, voiceState, setVoiceState,
  } = useAssistant();

  const [supported] = useState(Boolean(SUPPORTED));

  // ── Refs: everything the recognition callbacks need to read ─────
  const recognitionRef = useRef(null);
  const mountedRef = useRef(true);
  const phaseRef = useRef('wake');          // 'wake' | 'command'
  const commandRef = useRef('');
  const busyRef = useRef(false);            // a command is being executed
  const wantListeningRef = useRef(true);
  const retryRef = useRef(0);
  const pauseTimerRef = useRef(null);
  const commandTimeoutRef = useRef(null);
  const restartTimerRef = useRef(null);
  const speakingRef = useRef(false);
  const lastResponseRef = useRef('');
  const activeFeatureRef = useRef(activeFeature);

  useEffect(() => { activeFeatureRef.current = activeFeature; }, [activeFeature]);

  // ── Status helper ───────────────────────────────────────────────
  const statusRef = useRef('IDLE');
  const setStatus = useCallback((status, patch = {}) => {
    statusRef.current = status;
    setVoiceState((prev) => ({ ...prev, status, ...patch }));
  }, [setVoiceState]);

  // ── Recognition lifecycle ───────────────────────────────────────
  // stopRecognition always detaches handlers before aborting, so a
  // dying instance can never restart itself behind our back. This is
  // what guarantees exactly one live recognizer.
  const stopRecognition = useCallback(() => {
    if (pauseTimerRef.current) { clearTimeout(pauseTimerRef.current); pauseTimerRef.current = null; }
    if (commandTimeoutRef.current) { clearTimeout(commandTimeoutRef.current); commandTimeoutRef.current = null; }
    if (restartTimerRef.current) { clearTimeout(restartTimerRef.current); restartTimerRef.current = null; }

    const recognition = recognitionRef.current;
    if (recognition) {
      recognition.onstart = null;
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      try { recognition.abort(); } catch { /* already dead */ }
      recognitionRef.current = null;
    }
  }, []);

  // Forward declarations so the callbacks below can reference each other.
  const startListeningRef = useRef(() => {});
  const dispatchRef = useRef(async () => {});

  // ── Result handling ─────────────────────────────────────────────
  const handleResult = useCallback((event) => {
    if (!mountedRef.current || busyRef.current) return;

    // The newest chunk only — used for barge-in while we are speaking.
    const latest = normalize(event.results[event.results.length - 1]?.[0]?.transcript);

    if (speakingRef.current) {
      // Our own voice coming back through the microphone.
      if (!latest || isEchoOfCurrentSpeech(latest)) return;

      if (/\b(stop|cancel|quiet|enough)\b/.test(latest)) {
        cancelSpeech();
        return;
      }
      if (splitOnWakeWord(latest)) {
        cancelSpeech();
      }
      return;
    }

    // Full session transcript — the recognizer is restarted after every
    // command, so this stays short.
    let full = '';
    for (let i = 0; i < event.results.length; i += 1) {
      full += `${event.results[i][0].transcript} `;
    }
    full = normalize(full);
    if (!full) return;

    const split = splitOnWakeWord(full);
    if (!split) {
      // Speech without the wake word — stay listening, ignore it.
      if (phaseRef.current === 'wake' && statusRef.current !== 'LISTENING') {
        setStatus('LISTENING', { transcript: '' });
      }
      return;
    }

    // Wake word heard.
    if (phaseRef.current === 'wake') {
      phaseRef.current = 'command';
      setStatus('AWAITING_COMMAND', { transcript: '', error: '' });

      // Nothing after "Vision" yet — prompt and wait.
      if (!split.command) {
        speak('Yes?');
      }

      if (commandTimeoutRef.current) clearTimeout(commandTimeoutRef.current);
      commandTimeoutRef.current = setTimeout(() => {
        if (!mountedRef.current || busyRef.current) return;
        if (phaseRef.current === 'command' && !commandRef.current.trim()) {
          phaseRef.current = 'wake';
          startListeningRef.current(); // clear the stale transcript
        }
      }, COMMAND_TIMEOUT_MS);
    }

    commandRef.current = split.command;

    if (split.command) {
      setStatus('AWAITING_COMMAND', { transcript: split.command });

      // Process once the user stops speaking.
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = setTimeout(() => {
        const command = commandRef.current.trim();
        if (command) dispatchRef.current(command);
      }, COMMAND_PAUSE_MS);
    }
  }, [setStatus]);

  // ── Start / restart ─────────────────────────────────────────────
  const startListening = useCallback(() => {
    if (!mountedRef.current || !SUPPORTED) return;

    stopRecognition();
    wantListeningRef.current = true;
    phaseRef.current = 'wake';
    commandRef.current = '';

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      retryRef.current = 0;
      if (!busyRef.current && !speakingRef.current) {
        setStatus('LISTENING', { transcript: '', error: '' });
      }
    };

    recognition.onresult = handleResult;

    recognition.onerror = (event) => {
      if (!mountedRef.current) return;

      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        wantListeningRef.current = false;
        stopRecognition();
        setStatus('BLOCKED', {
          error: 'Microphone permission is blocked. Allow microphone access, then tap Start Listening.',
        });
        return;
      }
      // 'no-speech', 'network', 'aborted' all surface through onend,
      // which handles the restart.
    };

    recognition.onend = () => {
      if (!mountedRef.current || !wantListeningRef.current || busyRef.current) return;

      // Mobile browsers cut the microphone off at the first pause. If a
      // command is already buffered, run it instead of losing it.
      if (phaseRef.current === 'command' && commandRef.current.trim()) {
        dispatchRef.current(commandRef.current.trim());
        return;
      }

      if (retryRef.current >= MAX_RESTART_RETRIES) {
        // Usually a browser demanding a fresh user gesture. Fall back to
        // the visible Start control rather than looping forever.
        stopRecognition();
        setStatus('IDLE', { transcript: '' });
        return;
      }

      retryRef.current += 1;
      restartTimerRef.current = setTimeout(() => {
        if (mountedRef.current && wantListeningRef.current && !busyRef.current) {
          startListeningRef.current();
        }
      }, RESTART_DELAY_MS);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      // start() throws if the previous instance has not fully released;
      // onend/retry covers it.
    }
  }, [handleResult, setStatus, stopRecognition]);

  startListeningRef.current = startListening;

  // ── Speak, then return to listening ─────────────────────────────
  const speakThenListen = useCallback((text) => {
    if (text) {
      lastResponseRef.current = text;
      setVoiceState((prev) => ({ ...prev, lastResponse: text }));
    }

    const resume = () => {
      busyRef.current = false;
      if (mountedRef.current) startListeningRef.current();
    };

    if (!text) {
      resume();
      return;
    }
    speak(text, { onEnd: resume });
  }, [setVoiceState]);

  // ── Action executor ─────────────────────────────────────────────
  // Every branch here is a fixed, hand-written behaviour. The model
  // picks which branch runs; it never supplies the behaviour itself.
  const execute = useCallback((command, result) => {
    const feature = activeFeatureRef.current;

    if (!isExecutableAction(result)) {
      const speech = "I didn't understand that. Please try again.";
      rememberTurn(command, speech);
      setStatus('SPEAKING', { message: speech });
      speakThenListen(speech);
      return;
    }

    const speech = result.speech || '';
    setStatus('SPEAKING', { message: speech || result.answer || '' });
    if (speech || result.answer) rememberTurn(command, result.answer || speech);

    switch (result.action) {
      case ACTIONS.OPEN_FEATURE: {
        const target = FEATURES[result.target];
        navigate(target.route, target.state ? { state: target.state } : undefined);
        speakThenListen(speech || `Opening ${target.label}.`);
        return;
      }

      case ACTIONS.GO_HOME:
        navigate(HOME_ROUTE);
        speakThenListen(speech || 'Going home.');
        return;

      case ACTIONS.EMERGENCY_SOS:
        // Emergency never waits on a conversation — navigate first, and
        // the SOS screen starts its own countdown immediately.
        navigate(FEATURES.emergency.route, { state: { autoTrigger: true, requestedAt: Date.now() } });
        speakThenListen(speech || 'Starting emergency alert.');
        return;

      case ACTIONS.START_VOLUNTEER_HELP:
        navigate(FEATURES.volunteer.route, {
          state: {
            voiceMessage: result.message || '',
            source: feature === 'home' ? '' : featureLabel(feature),
            requestedAt: Date.now(),
          },
        });
        speakThenListen(speech || 'Connecting you with a volunteer.');
        return;

      case ACTIONS.FIND_OBJECT: {
        const objectName = result.objectName || '';
        const handler = getHandler('objectFinder', 'findObject');

        if (feature === 'objectFinder' && handler) {
          // The screen announces the new search itself — staying quiet
          // here avoids cutting its own confirmation off mid-sentence.
          handler(objectName);
          speakThenListen('');
          return;
        }
        navigate(FEATURES.objectFinder.route, { state: { objectName, requestedAt: Date.now() } });
        speakThenListen(speech || `Looking for your ${objectName}.`);
        return;
      }

      case ACTIONS.CAPTURE_IMAGE: {
        const capture = getHandler(feature, 'capture');
        if (!capture) {
          const message = 'There is nothing to capture on this screen. Say Vision, followed by the feature you need.';
          speakThenListen(message);
          return;
        }
        // Speak first, capture when the microphone is free again — the
        // camera announces its own "Image captured" straight after.
        busyRef.current = true;
        speak(speech || 'Capturing now.', {
          onEnd: () => {
            capture();
            busyRef.current = false;
            if (mountedRef.current) startListeningRef.current();
          },
        });
        return;
      }

      case ACTIONS.ASK_CONTEXTUAL_QUESTION:
        speakThenListen(result.answer || speech || "I don't have that information yet.");
        return;

      case ACTIONS.REPEAT_LAST:
        speakThenListen(lastResponseRef.current || 'There is nothing to repeat yet.');
        return;

      case ACTIONS.STOP_SPEAKING:
        cancelSpeech();
        busyRef.current = false;
        startListeningRef.current();
        return;

      case ACTIONS.CANCEL: {
        const cancel = getHandler(feature, 'cancel');
        if (cancel) cancel();
        speakThenListen(speech || 'Cancelled.');
        return;
      }

      case ACTIONS.CONFIRM: {
        // "Yes" only means something when the current screen offered
        // something to confirm — it never invents an action of its own.
        const submit = getHandler(feature, 'submit');
        if (!submit) {
          speakThenListen('There is nothing waiting for confirmation here.');
          return;
        }
        submit();
        speakThenListen(speech || '');
        return;
      }

      default:
        speakThenListen(speech || "I didn't understand that. Please try again.");
    }
  }, [getHandler, navigate, rememberTurn, setStatus, speakThenListen]);

  // ── Dispatch: command text → action ─────────────────────────────
  const dispatch = useCallback(async (rawCommand) => {
    if (busyRef.current) return;

    busyRef.current = true;
    stopRecognition();

    const command = normalize(rawCommand);
    if (!command) {
      busyRef.current = false;
      startListeningRef.current();
      return;
    }

    setStatus('PROCESSING', { transcript: command, error: '' });

    // Safety-critical and everyday commands resolve locally — no
    // network hop, no tokens, no waiting.
    let result = matchFastPath(command);

    if (!result) {
      try {
        result = await sendCommand(command, buildContextPayload(activeFeatureRef.current));
      } catch (err) {
        console.error('[Voice] Assistant request failed:', err.message);
        result = err.data || {
          type: 'error',
          action: ACTIONS.UNKNOWN,
          speech: 'I could not reach the assistant service. Please try again.',
        };
        setVoiceState((prev) => ({ ...prev, error: err.message }));
      }
    }

    if (!mountedRef.current) return;
    execute(command, result);
  }, [buildContextPayload, execute, setStatus, setVoiceState, stopRecognition]);

  dispatchRef.current = dispatch;

  // ── Track speech so the recognizer can ignore our own voice ─────
  useEffect(() => subscribeToSpeech((speaking) => {
    speakingRef.current = speaking;
    if (!mountedRef.current) return;
    if (speaking) {
      setStatus('SPEAKING');
    } else if (!busyRef.current && wantListeningRef.current) {
      setStatus(statusRef.current === 'BLOCKED' ? 'BLOCKED' : 'LISTENING');
    }
  }), [setStatus]);

  // ── Keep the active feature in step with the URL ────────────────
  // Covers link taps and the browser back button, not just voice.
  useEffect(() => {
    setActiveFeature(featureForPath(pathname));
  }, [pathname, setActiveFeature]);

  // ── Mount / unmount ─────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;

    if (!SUPPORTED) {
      setStatus('UNSUPPORTED', {
        error: 'This browser does not support speech recognition. Use the buttons on screen, or try Chrome.',
      });
      return undefined;
    }

    // A short delay avoids deployed browsers rejecting an immediate
    // microphone request on first paint.
    const timer = setTimeout(() => {
      if (mountedRef.current) startListeningRef.current();
    }, 500);

    return () => {
      mountedRef.current = false;
      wantListeningRef.current = false;
      clearTimeout(timer);
      stopRecognition();
      cancelSpeech();
    };
  }, [setStatus, stopRecognition]);

  // ── Pause while the tab is in the background ────────────────────
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        wantListeningRef.current = false;
        stopRecognition();
        cancelSpeech();
        setStatus('IDLE');
      } else if (!busyRef.current) {
        startListeningRef.current();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [setStatus, stopRecognition]);

  // ── Any tap re-arms the microphone when a browser stopped us ────
  // Some mobile browsers require a fresh user gesture; the whole screen
  // acts as that gesture so a blind user need not find a button.
  useEffect(() => {
    const status = voiceState.status;
    if (status !== 'IDLE' && status !== 'BLOCKED') return undefined;

    const retry = () => {
      if (mountedRef.current && !busyRef.current) startListeningRef.current();
    };

    document.addEventListener('pointerdown', retry);
    document.addEventListener('keydown', retry);
    return () => {
      document.removeEventListener('pointerdown', retry);
      document.removeEventListener('keydown', retry);
    };
  }, [voiceState.status]);

  const handleManualStart = useCallback(() => {
    retryRef.current = 0;
    startListeningRef.current();
  }, []);

  const handleManualStop = useCallback(() => {
    wantListeningRef.current = false;
    stopRecognition();
    cancelSpeech();
    setStatus('IDLE', { transcript: '' });
  }, [setStatus, stopRecognition]);

  return (
    <VoiceStatusBar
      supported={supported}
      onStart={handleManualStart}
      onStop={handleManualStop}
    />
  );
}

export default VoiceController;
