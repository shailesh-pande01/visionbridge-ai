import React, { useState, useEffect, useRef, useCallback, useContext } from 'react';
import { useLocation } from 'react-router-dom';
import { AuthContext } from '../../contexts/AuthContext';
import { triggerSOS, updateLiveLocation, endEmergency } from '../../services/sosService';
import { useFeatureVoice } from '../../voice/AssistantContext';
import { speak } from '../../voice/speech';

function EmergencySOSView() {
  const { user } = useContext(AuthContext);
  // 'IDLE' | 'COUNTDOWN' | 'GETTING_LOCATION' | 'ACTIVE' | 'ENDED' | 'ERROR'
  const [status, setStatus] = useState('IDLE');
  const [countdown, setCountdown] = useState(5);
  const [activeEvent, setActiveEvent] = useState(null);
  const [error, setError] = useState(null);
  const [location, setLocation] = useState(null);

  const timerRef = useRef(null);
  const locationIntervalRef = useRef(null);
  const isTriggeringRef = useRef(false);
  const routerLocation = useLocation();

  // Voice activation now comes from the single global controller —
  // "Vision, emergency" from anywhere in the app lands here with
  // autoTrigger set. No second recognizer competing for the mic.

  // ── 2 · Countdown Timer Management ──────────────────────────────
  const handleInitiateSOS = useCallback(() => {
    isTriggeringRef.current = true;
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

  const handleCancelSOS = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    isTriggeringRef.current = false;
    setStatus('IDLE');
    setCountdown(5);
    speak('Emergency alert cancelled.');
  }, []);

  // ── Voice: arrive here already triggered ───────────────────────
  // "Vision, emergency" must not turn into a conversation — the
  // countdown starts the moment this screen opens, with the same
  // 5-second cancel window as the button.
  const autoTriggerRef = useRef(null);
  useEffect(() => {
    if (!routerLocation.state?.autoTrigger) return;
    if (autoTriggerRef.current === routerLocation.key) return;

    autoTriggerRef.current = routerLocation.key;
    handleInitiateSOS();
  }, [routerLocation.key, routerLocation.state, handleInitiateSOS]);

  // "Vision, cancel" stops the countdown; "Vision, yes" starts it.
  useFeatureVoice('emergency', {
    submit: () => {
      if (status === 'IDLE') handleInitiateSOS();
    },
    cancel: () => {
      if (status === 'COUNTDOWN') handleCancelSOS();
    },
  });

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
          const userId = user ? (user.username || user._id || user.name) : 'default_user';
          const event = await triggerSOS(loc.latitude, loc.longitude, loc.address, userId);
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
                {activeEvent?.whatsappError && (
                  <span style={{ display: 'block', fontSize: '0.95rem', marginTop: '0.5rem', color: '#94a3b8' }}>
                    Reason: {activeEvent.whatsappError}
                  </span>
                )}
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

        <div
          className="sos-voice-indicator"
          style={{ width: '100%', marginTop: '2.5rem', background: '#162a1c', borderColor: '#22c55e' }}
        >
          <span className="sos-voice-indicator__dot" style={{ background: '#22c55e' }} />
          <span style={{ color: '#22c55e' }}>Say “Vision, emergency” from anywhere in the app</span>
        </div>
        <p style={{ fontSize: '1.1rem', color: '#94a3b8', marginTop: '0.75rem' }}>
          The alert starts a 5 second countdown. Say “Vision, cancel” or tap Cancel to stop it.
        </p>
      </div>
    </div>
  );
}

export default EmergencySOSView;
