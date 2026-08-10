import React, { useState, useEffect, useRef, useCallback } from 'react';
import { triggerSOS, updateLiveLocation, endEmergency } from '../../services/sosService';

function speak(text) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  }
}

function EmergencySOSView() {
  // 'IDLE' | 'COUNTDOWN' | 'GETTING_LOCATION' | 'ACTIVE' | 'ENDED' | 'ERROR'
  const [status, setStatus] = useState('IDLE');
  const [countdown, setCountdown] = useState(5);
  const [activeEvent, setActiveEvent] = useState(null);
  const [error, setError] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState(null);
  const [location, setLocation] = useState(null);

  const timerRef = useRef(null);
  const locationIntervalRef = useRef(null);
  const recognitionRef = useRef(null);
  const isTriggeringRef = useRef(false);

  // ── 1 · Setup Voice Activation (SpeechRecognition) ──────────────
  const startVoiceRecognition = useCallback(() => {
    if (isTriggeringRef.current) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceError('SpeechRecognition API not supported in this browser.');
      console.warn('SpeechRecognition API not supported in this browser.');
      return;
    }

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      console.log('[Voice SOS] Microphone active and listening...');
      setIsListening(true);
      setVoiceError(null);
    };

    recognition.onerror = (event) => {
      console.error('[Voice SOS] Error:', event.error);
      setIsListening(false);
      if (event.error === 'not-allowed') {
        setVoiceError('Microphone permission denied. Please allow mic access in your browser.');
      } else {
        setVoiceError(`Mic error: ${event.error}. Tap button below to restart.`);
      }
    };

    recognition.onend = () => {
      console.log('[Voice SOS] Microphone disconnected.');
      setIsListening(false);
      if (status === 'IDLE' && !isTriggeringRef.current) {
        setTimeout(() => {
          if (recognitionRef.current && status === 'IDLE' && !isTriggeringRef.current) {
            try { recognitionRef.current.start(); } catch {}
          }
        }, 1000);
      }
    };

    recognition.onresult = (event) => {
      if (isTriggeringRef.current) return;

      let fullTranscript = '';
      for (let i = 0; i < event.results.length; i++) {
        fullTranscript += event.results[i][0].transcript.toLowerCase() + ' ';
      }
      console.log('[Voice SOS] Live Transcript:', fullTranscript);

      if (
        fullTranscript.includes('emergency') || 
        fullTranscript.includes('help me') || 
        fullTranscript.includes('sos') ||
        fullTranscript.includes('help')
      ) {
        console.log('🚨 [Voice SOS] Trigger word matched!');
        isTriggeringRef.current = true;
        try { recognition.stop(); } catch {}
        handleInitiateSOS();
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (err) {
      console.error('[Voice SOS] Start failed:', err);
    }
  }, [status]);

  useEffect(() => {
    if (status === 'IDLE' && !isTriggeringRef.current) {
      startVoiceRecognition();
    } else if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }

    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
    };
  }, [status, startVoiceRecognition]);

  // ── 2 · Countdown Timer Management ──────────────────────────────
  const handleInitiateSOS = useCallback(() => {
    isTriggeringRef.current = true;
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    if (timerRef.current) clearInterval(timerRef.current);

    setStatus('COUNTDOWN');
    setCountdown(5);
    speak('Emergency alert will be sent in 5 seconds.');

    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          executeSOS();
          return 0;
        }
        speak((prev - 1).toString());
        return prev - 1;
      });
    }, 1000);
  }, []);

  const handleCancelSOS = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    isTriggeringRef.current = false;
    setStatus('IDLE');
    setCountdown(5);
    speak('Emergency alert cancelled.');
    setTimeout(() => {
      startVoiceRecognition();
    }, 500);
  };

  // ── 3 · Execute SOS Trigger ─────────────────────────────────────
  const executeSOS = () => {
    setStatus('GETTING_LOCATION');
    speak('Getting location...');

    if (!('geolocation' in navigator)) {
      handleLocationError('Geolocation not supported by your browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const loc = { latitude, longitude, address: `Approximate GPS: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}` };
        setLocation(loc);

        try {
          const event = await triggerSOS(loc.latitude, loc.longitude, loc.address);
          setActiveEvent(event);
          setStatus('ACTIVE');
          
          if (event.whatsappSent) {
            speak('Emergency activated. Your location has been sent to your emergency contact.');
          } else {
            speak('Emergency activated, but the WhatsApp alert could not be sent.');
          }

          locationIntervalRef.current = setInterval(() => {
            if ('geolocation' in navigator) {
              navigator.geolocation.getCurrentPosition(
                (pos2) => {
                  const lat = pos2.coords.latitude;
                  const lon = pos2.coords.longitude;
                  const newLoc = { latitude: lat, longitude: lon, address: `Approximate GPS: ${lat.toFixed(4)}, ${lon.toFixed(4)}` };
                  setLocation(newLoc);
                  if (event?.id) {
                    updateLiveLocation(event.id, lat, lon, newLoc.address).catch(() => {});
                  }
                },
                () => {},
                { enableHighAccuracy: true }
              );
            }
          }, 10000);
        } catch (err) {
          setError(err.message);
          isTriggeringRef.current = false;
          setStatus('ERROR');
          speak('Failed to send emergency alert.');
        }
      },
      (err) => {
        handleLocationError('Permission denied or timeout.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleLocationError = (msg) => {
    setError(msg);
    isTriggeringRef.current = false;
    setStatus('ERROR');
    speak('Unable to get your location. Please enable location access.');
  };

  const resetToIdle = () => {
    setError(null);
    setStatus('IDLE');
    isTriggeringRef.current = false;
    setTimeout(() => {
      startVoiceRecognition();
    }, 500);
  };

  // ── 4 · End Emergency ───────────────────────────────────────────
  const handleEndEmergency = async () => {
    if (locationIntervalRef.current) clearInterval(locationIntervalRef.current);
    if (!activeEvent) {
      resetToIdle();
      return;
    }

    try {
      await endEmergency(activeEvent.id);
      setActiveEvent(null);
      isTriggeringRef.current = false;
      setStatus('ENDED');
      speak('Emergency mode ended.');
    } catch (err) {
      alert('Failed to end emergency: ' + err.message);
    }
  };

  // ───────────────────────────────────────────────────────────────
  if (status === 'COUNTDOWN') {
    return (
      <div className="sos-countdown-card" role="alert" aria-live="assertive">
        <h2 className="sos-countdown-title">🚨 ALERT INITIATED</h2>
        <div className="sos-countdown-number">{countdown}</div>
        <p className="sos-countdown-sub">
          Emergency SOS has been triggered. Press CANCEL below if this was accidental.
        </p>
        <button type="button" className="sos-btn-block sos-btn-cancel" onClick={handleCancelSOS}>
          ✕ Cancel Alert
        </button>
      </div>
    );
  }

  if (status === 'GETTING_LOCATION') {
    return (
      <div className="sos-card" style={{ textAlign: 'center', padding: '5rem 2rem' }}>
        <h2 style={{ fontSize: '2rem', fontWeight: 900 }}>📍 Acquiring GPS Location...</h2>
        <p style={{ fontSize: '1.35rem', color: '#94a3b8', marginTop: '1rem' }}>Please wait while we pinpoint your exact coordinates...</p>
      </div>
    );
  }

  if (status === 'ACTIVE' && location) {
    return (
      <div className="sos-card sos-card--emergency" role="alert" aria-live="assertive">
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <span style={{ fontSize: '5rem', display: 'block', marginBottom: '1rem' }}>🚨</span>
          <h2 style={{ fontSize: '2.4rem', fontWeight: 900, color: '#ef4444', marginBottom: '0.75rem' }}>
            SOS ALERT ACTIVE
          </h2>
          <p style={{ fontSize: '1.35rem', color: '#cbd5e1', marginBottom: '2rem' }}>
            {activeEvent?.whatsappSent ? (
              <>
                <span style={{ color: '#22c55e', fontWeight: 'bold' }}>WhatsApp Alert: Sent ✓</span><br/>
                <span style={{ color: '#22c55e', fontWeight: 'bold' }}>Location: Shared ✓</span>
              </>
            ) : (
              <span style={{ color: '#fca5a5' }}>
                Emergency activated, but WhatsApp alert could not be sent. Please contact your emergency contact manually.
              </span>
            )}
          </p>
          <div style={{ padding: '1.5rem', background: '#271414', border: '3px solid #ef4444', borderRadius: '16px', textAlign: 'left' }}>
            <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ffffff', marginBottom: '0.5rem' }}>📍 Location Details</h3>
            <p style={{ fontSize: '1.25rem', color: '#94a3b8', marginBottom: '0.5rem' }}>Coordinates: {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}</p>
            {activeEvent && activeEvent.timestamp && (
              <p style={{ fontSize: '1.1rem', color: '#94a3b8', marginBottom: '1rem' }}>Time: {new Date(activeEvent.timestamp).toLocaleString()}</p>
            )}
            <a href={`https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`} target="_blank" rel="noreferrer" style={{ color: '#38bdf8', fontSize: '1.25rem', fontWeight: 800, textDecoration: 'underline' }}>
              🔗 Open Google Maps Link
            </a>
          </div>
        </div>
        <button type="button" className="sos-btn-block sos-btn-danger" onClick={handleEndEmergency}>
          🛑 End Emergency
        </button>
      </div>
    );
  }

  if (status === 'ENDED') {
    return (
      <div className="sos-card" style={{ textAlign: 'center', padding: '5rem 2rem' }}>
        <h2 style={{ fontSize: '2rem', fontWeight: 900, color: '#22c55e' }}>✅ Emergency Ended</h2>
        <p style={{ fontSize: '1.35rem', color: '#94a3b8', marginTop: '1rem', marginBottom: '2rem' }}>Your emergency alert has been deactivated.</p>
        <button type="button" className="sos-btn-block" style={{ background: '#334155' }} onClick={resetToIdle}>
          Return to IDLE
        </button>
      </div>
    );
  }

  if (status === 'ERROR') {
    return (
      <div className="sos-card" style={{ padding: '2rem 1.5rem', textAlign: 'center' }}>
        <h2 style={{ fontSize: '2rem', fontWeight: 900, color: '#ef4444', marginBottom: '1rem' }}>⚠️ Action Required</h2>
        <div style={{ padding: '1.25rem', background: '#271414', border: '3px solid #ef4444', borderRadius: '16px', marginBottom: '2rem', fontWeight: 800, color: '#fca5a5', fontSize: '1.25rem' }}>
          Unable to get your location. Please enable location access. {error && `(${error})`}
        </div>
        <button type="button" className="sos-btn-block" style={{ background: '#334155' }} onClick={resetToIdle}>
          Try Again
        </button>
      </div>
    );
  }

  // default: 'IDLE'
  return (
    <div className="sos-card" style={{ padding: '2rem 1.5rem', textAlign: 'center' }}>
      {voiceError && (
        <div style={{ padding: '1rem', background: '#301c1c', border: '2px solid #ef4444', borderRadius: '12px', marginBottom: '1.5rem', fontWeight: 700, color: '#fca5a5', fontSize: '1.15rem' }}>
          🎙️ {voiceError}
        </div>
      )}

      {/* Giant SOS Button */}
      <div className="sos-giant-button-wrapper" style={{ padding: '1rem 0 2rem' }}>
        <button
          type="button"
          className="sos-button-giant"
          onClick={handleInitiateSOS}
          aria-label="Trigger Emergency SOS Alert"
        >
          <span>SOS</span>
          <span>Tap to Alert</span>
        </button>

        {/* Clickable Voice Command Indicator */}
        <button
          type="button"
          onClick={startVoiceRecognition}
          className="sos-voice-indicator"
          style={{ width: '100%', cursor: 'pointer', marginTop: '2.5rem', background: isListening ? '#162a1c' : '#21262d', borderColor: isListening ? '#22c55e' : '#30363d' }}
          aria-live="polite"
        >
          {isListening ? (
            <>
              <span className="sos-voice-indicator__dot" style={{ background: '#22c55e' }} />
              <span style={{ color: '#22c55e' }}>Listening: Say "Emergency", "Help me", "SOS"</span>
            </>
          ) : (
            <>
              <span className="sos-voice-indicator__dot" style={{ background: '#ef4444', animation: 'none' }} />
              <span style={{ color: '#fca5a5' }}>🎙️ Mic Stopped (Tap to Start Listening)</span>
            </>
          )}
        </button>
        <p style={{ fontSize: '1.1rem', color: '#94a3b8', marginTop: '0.75rem' }}>
          {isListening ? 'Speak aloud now. Trigger words will be detected instantly.' : 'If your browser blocks auto-start, tap the button above to enable the microphone.'}
        </p>
      </div>
    </div>
  );
}

export default EmergencySOSView;
