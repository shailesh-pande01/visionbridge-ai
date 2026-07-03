import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { matchCommand } from '../../utils/commandMatcher';
import './VoiceNavigation.css';

function speak(text) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  }
}

function VoiceNavigation() {
  const navigate = useNavigate();

  // 'idle' | 'listening' | 'processing' | 'success' | 'error'
  const [status, setStatus] = useState('idle');
  const [recognizedText, setRecognizedText] = useState('');
  const [detectedCommand, setDetectedCommand] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  const recognitionRef = useRef(null);
  const timeoutRef = useRef(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // ── Start Listening Handler ────────────────────────────────────
  const handleStartListening = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setErrorMessage('Browser does not support Speech Recognition. Please use Chrome, Edge, or Safari.');
      setStatus('error');
      speak('Speech recognition is not supported in your browser.');
      return;
    }

    setStatus('listening');
    setRecognizedText('');
    setDetectedCommand(null);
    setErrorMessage('');
    speak('Listening.');

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    // Timeout if no speech detected within 8 seconds
    timeoutRef.current = setTimeout(() => {
      if (status === 'listening' || recognitionRef.current) {
        try { recognition.stop(); } catch {}
        setErrorMessage('No speech detected. Please try again.');
        setStatus('error');
        speak('No speech detected. Please try again.');
      }
    }, 8000);

    recognition.onstart = () => {
      console.log('[VoiceNav] Mic active');
    };

    recognition.onerror = (event) => {
      console.error('[VoiceNav] Error:', event.error);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      try { recognition.stop(); } catch {}

      if (event.error === 'not-allowed') {
        setErrorMessage('Microphone permission denied. Please allow microphone access in your browser settings.');
        speak('Microphone permission denied.');
      } else if (event.error === 'no-speech') {
        setErrorMessage('No speech detected. Please try again.');
        speak('No speech detected. Please try again.');
      } else {
        setErrorMessage(`Recognition error: ${event.error}. Please try again.`);
        speak('I couldn\'t understand that command. Please try again.');
      }
      setStatus('error');
    };

    recognition.onresult = (event) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      let fullTranscript = '';
      for (let i = 0; i < event.results.length; i++) {
        fullTranscript += event.results[i][0].transcript;
      }
      setRecognizedText(fullTranscript);

      // If final result, process it
      if (event.results[event.results.length - 1].isFinal) {
        try { recognition.stop(); } catch {}
        setStatus('processing');
        processTranscript(fullTranscript);
      }
    };

    recognition.onend = () => {
      console.log('[VoiceNav] Mic disconnected');
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (err) {
      console.error('[VoiceNav] Start failed:', err);
    }
  }, [status]);

  // ── Process Spoken Command ─────────────────────────────────────
  const processTranscript = (transcript) => {
    console.log('[VoiceNav] Processing final transcript:', transcript);
    const match = matchCommand(transcript);

    if (match) {
      setDetectedCommand(match);
      setStatus('success');
      speak(`Command recognized. ${match.confirmationMessage}`);

      // Allow voice confirmation to play before navigating
      setTimeout(() => {
        navigate(match.route);
      }, 2500);
    } else {
      setErrorMessage(`Unknown command: "${transcript}".`);
      setStatus('error');
      speak('I couldn\'t understand that command. Please try again.');
    }
  };

  const handleCancel = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    setStatus('idle');
    setRecognizedText('');
    setErrorMessage('');
    speak('Listening cancelled.');
  };

  // ───────────────────────────────────────────────────────────────
  return (
    <div className="voice-nav-container" aria-live="assertive">
      {/* ERROR STATE */}
      {status === 'error' && (
        <div className="voice-nav-error" role="alert">
          <h3 className="voice-nav-error__title">⚠️ Recognition Error</h3>
          <p className="voice-nav-error__text">{errorMessage}</p>
          <div className="voice-nav-actions">
            <button type="button" className="voice-nav-action-btn voice-nav-btn-cancel" onClick={handleCancel}>
              ✕ Cancel
            </button>
            <button type="button" className="voice-nav-action-btn voice-nav-btn-retry" onClick={handleStartListening}>
              🔄 Retry
            </button>
          </div>
        </div>
      )}

      {/* SUCCESS STATE */}
      {status === 'success' && detectedCommand && (
        <div style={{ width: '100%', padding: '2.5rem 1.5rem', background: '#162a1c', border: '4px solid #22c55e', borderRadius: '20px', textAlign: 'center' }}>
          <span style={{ fontSize: '4rem', display: 'block', marginBottom: '1rem' }}>✓</span>
          <h3 style={{ fontSize: '2.2rem', fontWeight: 900, color: '#22c55e' }}>Command Recognized</h3>
          <p className="voice-nav-recognized">"{recognizedText}"</p>
          <p className="voice-nav-detected">{detectedCommand.confirmationMessage}</p>
          <p style={{ fontSize: '1.25rem', color: '#94a3b8' }}>Navigating automatically...</p>
        </div>
      )}

      {/* PROCESSING STATE */}
      {status === 'processing' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="voice-nav-processing">
            <span style={{ fontSize: '4rem' }}>⏳</span>
          </div>
          <h3 className="voice-nav-status-label">Processing Command...</h3>
          {recognizedText && <p className="voice-nav-recognized">"{recognizedText}"</p>}
        </div>
      )}

      {/* LISTENING STATE */}
      {status === 'listening' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
          <div className="voice-nav-listening" onClick={handleCancel} role="button" tabIndex={0} aria-label="Listening. Tap to cancel.">
            <span style={{ fontSize: '5rem' }}>🎙️</span>
            <span style={{ fontSize: '1.4rem', fontWeight: 900, marginTop: '0.5rem' }}>Listening...</span>
          </div>
          <h3 className="voice-nav-status-label">Listening for a Command</h3>
          {recognizedText ? (
            <p className="voice-nav-recognized">"{recognizedText}"</p>
          ) : (
            <p style={{ fontSize: '1.35rem', color: '#94a3b8', marginTop: '0.5rem' }}>Speak clearly now...</p>
          )}
          <div className="voice-nav-actions" style={{ marginTop: '2rem' }}>
            <button type="button" className="voice-nav-action-btn voice-nav-btn-cancel" onClick={handleCancel}>
              ✕ Stop / Cancel
            </button>
          </div>
        </div>
      )}

      {/* IDLE STATE */}
      {status === 'idle' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
          <div className="voice-nav-wrap" role="presentation">
            <span className="voice-nav-ring voice-nav-ring--1" aria-hidden="true" />
            <span className="voice-nav-ring voice-nav-ring--2" aria-hidden="true" />
            <span className="voice-nav-ring voice-nav-ring--3" aria-hidden="true" />

            <button
              className="voice-nav-btn"
              type="button"
              onClick={handleStartListening}
              aria-label="Voice assistant — tap to speak a command"
            >
              <span className="voice-nav-btn__icon" aria-hidden="true">🎙️</span>
              <span className="voice-nav-btn__text">Tap to Speak</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default VoiceNavigation;
