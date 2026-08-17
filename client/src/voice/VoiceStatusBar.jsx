// ─────────────────────────────────────────────────────────────────
// client/src/voice/VoiceStatusBar.jsx
// The visible half of the voice assistant.
//
// Voice is the primary interface, but a low-vision user still needs to
// know whether the microphone is live, whether "Vision" was heard, and
// what the assistant just said. Large type, high contrast, and a live
// region so screen readers announce every state change.
// ─────────────────────────────────────────────────────────────────

import React from 'react';
import { useAssistant } from './AssistantContext';
import { featureLabel } from './actions';

const STATUS_TEXT = {
  IDLE:             { icon: '🎙️', title: 'Tap anywhere to start listening', tone: 'idle' },
  LISTENING:        { icon: '🎙️', title: 'Listening — say “Vision”',        tone: 'listening' },
  AWAITING_COMMAND: { icon: '✨', title: 'Vision detected — go ahead',       tone: 'active' },
  PROCESSING:       { icon: '⏳', title: 'Understanding…',                   tone: 'busy' },
  SPEAKING:         { icon: '🔊', title: 'Speaking…',                        tone: 'active' },
  BLOCKED:          { icon: '🚫', title: 'Microphone blocked',               tone: 'error' },
  UNSUPPORTED:      { icon: '⚠️', title: 'Voice not supported here',         tone: 'error' },
};

function VoiceStatusBar({ supported, onStart, onStop }) {
  const { voiceState, activeFeature } = useAssistant();
  const { status, transcript, message, lastResponse, error } = voiceState;

  const state = STATUS_TEXT[status] || STATUS_TEXT.IDLE;
  const isListening = status === 'LISTENING' || status === 'AWAITING_COMMAND';
  const spoken = message || lastResponse;

  return (
    <div className={`vb-voice-bar vb-voice-bar--${state.tone}`} role="region" aria-label="Voice assistant status">
      {/* Screen readers get every state change through this live region */}
      <p className="vb-voice-live" aria-live="assertive" role="status">
        {state.title}
        {transcript ? `. You said: ${transcript}` : ''}
      </p>

      <div className="vb-voice-bar__row">
        <span className={`vb-voice-bar__icon${isListening ? ' vb-voice-bar__icon--pulse' : ''}`} aria-hidden="true">
          {state.icon}
        </span>

        <div className="vb-voice-bar__text">
          <p className="vb-voice-bar__status">{state.title}</p>
          <p className="vb-voice-bar__feature">
            {featureLabel(activeFeature)}
          </p>
        </div>

        {supported && (
          isListening || status === 'PROCESSING' || status === 'SPEAKING' ? (
            <button
              type="button"
              className="vb-voice-bar__btn"
              onClick={onStop}
              aria-label="Stop listening"
            >
              ⏹ Stop
            </button>
          ) : (
            <button
              type="button"
              className="vb-voice-bar__btn vb-voice-bar__btn--primary"
              onClick={onStart}
              aria-label="Start listening for the wake word Vision"
            >
              🎙️ Start Listening
            </button>
          )
        )}
      </div>

      {transcript && (
        <p className="vb-voice-bar__transcript">“{transcript}”</p>
      )}

      {spoken && !transcript && (
        <p className="vb-voice-bar__response">{spoken}</p>
      )}

      {(status === 'BLOCKED' || status === 'UNSUPPORTED') && error && (
        <p className="vb-voice-bar__error" role="alert">{error}</p>
      )}
    </div>
  );
}

export default VoiceStatusBar;
