import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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

  // Use both React state for UI and a Ref for safe closure access
  const [status, _setStatus] = useState('IDLE');
  const statusRef = useRef('IDLE');
  const setStatus = (newStatus) => {
    statusRef.current = newStatus;
    _setStatus(newStatus);
  };

  const [recognizedText, setRecognizedText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const recognitionRef = useRef(null);
  const isMountedRef = useRef(true);
  const wakeWordDetectedRef = useRef(false);
  const commandBufferRef = useRef('');
  const pauseTimerRef = useRef(null);
  const retryCountRef = useRef(0);

  const cleanupSession = () => {
    if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    if (recognitionRef.current) {
      // Remove listeners to prevent stale callbacks and zombie instances
      recognitionRef.current.onend = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.onresult = null;
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }
  };

  const processCommand = async (command) => {
    // Duplicate command protection
    if (statusRef.current === 'PROCESSING_COMMAND' || statusRef.current === 'NAVIGATING') return;
    
    console.log('[VoiceNav] Processing command:', command);
    setStatus('PROCESSING_COMMAND');
    cleanupSession(); // Stop listening while we process and navigate
    
    try {
      const API_BASE = process.env.REACT_APP_API_URL || '';
      const response = await fetch(`${API_BASE}/api/voice/intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      });
      const data = await response.json();
      
      if (!isMountedRef.current) return;

      if (!response.ok) {
        // Use the explicit error from the backend instead of a generic string
        setErrorMessage(data.error || 'Server error. Please try again.');
        setStatus('ERROR');
        speak('There was an error communicating with the server.');
        setTimeout(() => {
          if (isMountedRef.current) startListening(false);
        }, 4000);
        return;
      }

      if (data.route) {
        setStatus('NAVIGATING');
        speak(`Opening ${data.intent} assistant.`);
        setTimeout(() => {
          if (isMountedRef.current) {
            // Reset to IDLE before navigating so if we come back via browser cache, it starts fresh
            setStatus('IDLE');
            navigate(data.route);
          }
        }, 2000);
      } else {
        setErrorMessage('I didn\'t understand that. Please say Vision followed by your request.');
        setStatus('ERROR');
        speak('I didn\'t understand that. Please try again.');
        setTimeout(() => {
          if (isMountedRef.current) startListening(false);
        }, 4000);
      }
    } catch (err) {
      console.error('[VoiceNav] API error', err);
      if (!isMountedRef.current) return;
      
      setErrorMessage('Failed to process command.');
      setStatus('ERROR');
      setTimeout(() => {
        if (isMountedRef.current) startListening(false);
      }, 4000);
    }
  };

  const startListening = (isRetry = false) => {
    if (!isMountedRef.current) return;
    cleanupSession(); // Ensure no active session exists

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setErrorMessage('Browser does not support Speech Recognition.');
      setStatus('ERROR');
      speak('Speech recognition is not supported in your browser.');
      return;
    }

    if (!isRetry) {
      setStatus('LISTENING_FOR_WAKE_WORD');
      setRecognizedText('');
      setErrorMessage('');
      wakeWordDetectedRef.current = false;
      commandBufferRef.current = '';
      retryCountRef.current = 0;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      console.log('[VoiceNav] Mic active');
      retryCountRef.current = 0; // Reset retries on successful start
    };

    recognition.onerror = (event) => {
      console.error('[VoiceNav] Error:', event.error);
      if (!isMountedRef.current) return;

      if (event.error === 'not-allowed') {
        setErrorMessage('Microphone permission denied.');
        setStatus('ERROR');
      } else if (event.error === 'no-speech' || event.error === 'network') {
        // Will trigger onend naturally and auto-restart if appropriate
      } else if (event.error === 'aborted') {
        // Intentionally aborted to clear transcript or stop
      } else {
        setErrorMessage(`Recognition error: ${event.error}`);
        setStatus('ERROR');
      }
    };

    recognition.onresult = (event) => {
      if (!isMountedRef.current) return;

      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      const fullTranscript = (finalTranscript + interimTranscript).trim().toLowerCase();
      
      if (!wakeWordDetectedRef.current) {
        // Check for wake word
        if (fullTranscript.includes('vision') || fullTranscript.includes('hey vision') || fullTranscript.includes('okay vision')) {
          console.log('[VoiceNav] Wake word detected in:', fullTranscript);
          wakeWordDetectedRef.current = true;
          setStatus('WAKE_WORD_DETECTED');
          speak('Yes?');
          
          setTimeout(() => {
            if (isMountedRef.current && statusRef.current === 'WAKE_WORD_DETECTED') {
              setStatus('LISTENING_FOR_COMMAND');
            }
          }, 1000);
          
          // Abort to clear the recognized transcript. onend will catch it and auto-restart with isRetry=true
          try { recognition.abort(); } catch {}
        }
      } else {
        setRecognizedText(fullTranscript);
        commandBufferRef.current = fullTranscript;
        
        if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
        
        if (finalTranscript || interimTranscript) {
          // Wait for user to pause speaking before processing
          pauseTimerRef.current = setTimeout(() => {
            if (!isMountedRef.current) return;
            const cmd = commandBufferRef.current.trim();
            if (cmd.length > 0 && (statusRef.current === 'LISTENING_FOR_COMMAND' || statusRef.current === 'WAKE_WORD_DETECTED')) {
               processCommand(cmd);
            }
          }, 1500);
        }
      }
    };

    recognition.onend = () => {
      console.log('[VoiceNav] Mic disconnected. Status:', statusRef.current);
      if (!isMountedRef.current) return;

      // Auto-restart if we are in a listening state
      if (statusRef.current === 'LISTENING_FOR_WAKE_WORD' || 
          statusRef.current === 'WAKE_WORD_DETECTED' || 
          statusRef.current === 'LISTENING_FOR_COMMAND') {
        
        if (retryCountRef.current < 5) {
          retryCountRef.current++;
          // Add a small delay to prevent tight infinite loops if the browser is blocking it
          setTimeout(() => {
            if (isMountedRef.current) startListening(true); // Preserve state
          }, 400);
        } else {
          // If it fails repeatedly without starting (often due to mobile browser requiring a user gesture),
          // gracefully fall back to the IDLE "Start" button instead of a scary error.
          cleanupSession();
          setStatus('IDLE');
          setRecognizedText('');
          setErrorMessage('');
        }
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (err) {
      console.error('[VoiceNav] Start failed:', err);
    }
  };

  // Mount/Unmount lifecycle
  useEffect(() => {
    isMountedRef.current = true;
    
    // Slight delay on initial mount helps prevent instant browser blocks on deployed sites
    const mountTimer = setTimeout(() => {
      if (isMountedRef.current) startListening(false);
    }, 500);
    
    return () => {
      clearTimeout(mountTimer);
      isMountedRef.current = false;
      cleanupSession();
    };
  }, []);

  const handleCancel = () => {
    cleanupSession();
    setStatus('IDLE');
    setRecognizedText('');
    setErrorMessage('');
    speak('Listening cancelled.');
  };
  
  const handleStartManual = () => {
    startListening(false);
  };

  return (
    <div className="voice-nav-container" aria-live="assertive">
      {status === 'ERROR' && (
        <div className="voice-nav-error" role="alert">
          <h3 className="voice-nav-error__title">⚠️ Recognition Error</h3>
          <p className="voice-nav-error__text">{errorMessage}</p>
          <div className="voice-nav-actions">
            <button type="button" className="voice-nav-action-btn voice-nav-btn-cancel" onClick={handleCancel}>
              ✕ Cancel
            </button>
            <button type="button" className="voice-nav-action-btn voice-nav-btn-retry" onClick={handleStartManual}>
              🔄 Retry
            </button>
          </div>
        </div>
      )}

      {status === 'NAVIGATING' && (
        <div style={{ width: '100%', padding: '2.5rem 1.5rem', background: '#162a1c', border: '4px solid #22c55e', borderRadius: '20px', textAlign: 'center' }}>
          <span style={{ fontSize: '4rem', display: 'block', marginBottom: '1rem' }}>✓</span>
          <h3 style={{ fontSize: '2.2rem', fontWeight: 900, color: '#22c55e' }}>Command Recognized</h3>
          <p className="voice-nav-recognized">"{recognizedText}"</p>
          <p style={{ fontSize: '1.25rem', color: '#94a3b8' }}>Navigating automatically...</p>
        </div>
      )}

      {status === 'PROCESSING_COMMAND' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="voice-nav-processing">
            <span style={{ fontSize: '4rem' }}>⏳</span>
          </div>
          <h3 className="voice-nav-status-label">Understanding...</h3>
          {recognizedText && <p className="voice-nav-recognized">"{recognizedText}"</p>}
        </div>
      )}

      {status === 'LISTENING_FOR_COMMAND' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
          <div className="voice-nav-listening" onClick={handleCancel} role="button" tabIndex={0} aria-label="Listening for command">
            <span style={{ fontSize: '5rem' }}>🎙️</span>
            <span style={{ fontSize: '1.4rem', fontWeight: 900, marginTop: '0.5rem' }}>Speak</span>
          </div>
          <h3 className="voice-nav-status-label">Vision detected. Listening for your command...</h3>
          {recognizedText && (
            <p className="voice-nav-recognized">"{recognizedText}"</p>
          )}
        </div>
      )}

      {status === 'WAKE_WORD_DETECTED' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
          <div className="voice-nav-listening" role="button" tabIndex={0} aria-label="Wake word detected">
            <span style={{ fontSize: '5rem' }}>✨</span>
            <span style={{ fontSize: '1.4rem', fontWeight: 900, marginTop: '0.5rem' }}>Vision!</span>
          </div>
          <h3 className="voice-nav-status-label">Yes?</h3>
        </div>
      )}

      {status === 'LISTENING_FOR_WAKE_WORD' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
          <div className="voice-nav-wrap" role="presentation" onClick={handleCancel}>
            <span className="voice-nav-ring voice-nav-ring--1" aria-hidden="true" />
            <span className="voice-nav-ring voice-nav-ring--2" aria-hidden="true" />
            
            <button className="voice-nav-btn" type="button" aria-label="Listening for Wake Word">
              <span className="voice-nav-btn__icon" aria-hidden="true">🎙️</span>
              <span className="voice-nav-btn__text" style={{fontSize: '1rem'}}>Say "Vision"</span>
            </button>
          </div>
          <h3 className="voice-nav-status-label">Listening...</h3>
        </div>
      )}

      {status === 'IDLE' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
          <div className="voice-nav-wrap" role="presentation">
            <button className="voice-nav-btn" type="button" onClick={handleStartManual} aria-label="Start listening">
              <span className="voice-nav-btn__icon" aria-hidden="true">🎙️</span>
              <span className="voice-nav-btn__text">Start</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default VoiceNavigation;
