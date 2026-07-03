import React, { useState, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getLocationDescription } from '../../services/locationService';
import './LocationAssistant.css';

// ─────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────

function IdleState() {
  return (
    <div className="location-state" role="status" aria-live="polite">
      <span className="location-state__icon" aria-hidden="true">📍</span>
      <p className="location-state__text">
        Tap <strong>Find My Location</strong> above to hear where you are.
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="location-loading" role="status" aria-live="polite" aria-label="Finding your location, please wait">
      <span className="location-spinner" aria-hidden="true" />
      <p className="location-loading__text">Finding your location…</p>
      <p className="location-loading__sub">This may take a few seconds.</p>
    </div>
  );
}

function DeniedState() {
  return (
    <div className="location-denied" role="alert" aria-live="assertive">
      <span className="location-denied__icon" aria-hidden="true">🚫</span>
      <p className="location-denied__title">Location Permission Denied</p>
      <p className="location-denied__text">
        To use this feature, please allow location access in your browser settings,
        then tap <strong>Find My Location</strong> again.
      </p>
    </div>
  );
}

function ResultState({ result, onRefresh }) {
  const [isSpeaking, setIsSpeaking] = React.useState(false);

  const speakSummary = useCallback(() => {
    if (!('speechSynthesis' in window) || !result.summary) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(result.summary);
    utterance.rate  = 0.95;
    utterance.pitch = 1.0;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend   = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  }, [result.summary]);

  const stopSpeaking = useCallback(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, []);

  // Auto-play on result
  useEffect(() => {
    speakSummary();
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [speakSummary]);

  return (
    <div className="location-result" aria-live="polite">
      <div className="location-result-header">
        <span className="location-result-label">Your Location</span>
        <span className="location-result-badge">Located ✓</span>
      </div>

      {isSpeaking && (
        <div className="location-tts-status" aria-live="polite">
          <span className="location-tts-status__dot" aria-hidden="true" />
          Reading aloud…
        </div>
      )}

      {/* Summary — the main spoken description */}
      <div className="location-result-summary-block">
        <p className="location-result-summary">{result.summary}</p>
      </div>

      {/* Address if available */}
      {result.address && (
        <div className="location-result-address">
          <span className="location-result-address__icon" aria-hidden="true">📮</span>
          <span className="location-result-address__text">{result.address}</span>
        </div>
      )}

      {/* Nearby landmarks */}
      {result.landmarks && result.landmarks.length > 0 && (
        <div className="location-result-landmarks">
          <h3 className="location-result-landmarks__title">Nearby Places</h3>
          <ul className="location-result-landmarks__list" role="list">
            {result.landmarks.map((name) => (
              <li key={name} className="location-result-landmark-item">
                <span aria-hidden="true">›</span>
                <span>{name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Action buttons */}
      <div className="location-result-actions">
        <button
          type="button"
          className="btn-outline location-result-action-btn"
          onClick={speakSummary}
          aria-label="Read location aloud again"
        >
          🔊 Replay
        </button>
        <button
          type="button"
          className="btn-outline location-result-action-btn"
          onClick={stopSpeaking}
          aria-label="Stop reading aloud"
        >
          ⏹️ Stop
        </button>
        <button
          type="button"
          className="btn-outline location-result-action-btn"
          onClick={onRefresh}
          aria-label="Refresh your location"
        >
          🔄 Refresh
        </button>
      </div>

      {/* Coordinates footer */}
      {result.coordinates && (
        <p className="location-coords" aria-label="GPS coordinates">
          {result.coordinates.latitude.toFixed(5)}, {result.coordinates.longitude.toFixed(5)}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────
function LocationAssistant() {

  // ── State ──────────────────────────────────────────────────────
  // 'idle' | 'locating' | 'loading' | 'result' | 'denied'
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState(null);
  const [error,  setError]  = useState(null);

  // ── Get user's GPS position ────────────────────────────────────
  const requestLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setError('Geolocation is not supported by your browser.');
      return;
    }

    // Stop any ongoing speech
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    setStatus('locating');
    setError(null);
    setResult(null);

    navigator.geolocation.getCurrentPosition(
      // Success — send coords to backend
      async (position) => {
        const { latitude, longitude } = position.coords;
        setStatus('loading');

        try {
          const data = await getLocationDescription(latitude, longitude);
          setResult(data);
          setStatus('result');
        } catch (err) {
          setError(err.message);
          setStatus('idle');
        }
      },
      // Error — permission denied or unavailable
      (geoError) => {
        switch (geoError.code) {
          case geoError.PERMISSION_DENIED:
            setStatus('denied');
            break;
          case geoError.POSITION_UNAVAILABLE:
            setError('Location information is unavailable. Please check your device settings.');
            setStatus('idle');
            break;
          case geoError.TIMEOUT:
            setError('Location request timed out. Please try again.');
            setStatus('idle');
            break;
          default:
            setError('An unknown error occurred while getting your location.');
            setStatus('idle');
            break;
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  }, []);

  // ── Auto-start location lookup on mount ────────────────────────
  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  // ── Refresh handler ────────────────────────────────────────────
  const handleRefresh = useCallback(() => {
    requestLocation();
  }, [requestLocation]);

  // ── Derived flags ──────────────────────────────────────────────
  const isLocating = status === 'locating' || status === 'loading';

  // ─────────────────────────────────────────────────────────────
  return (
    <div className="location-page">

      {/* Back nav */}
      <div className="location-back container">
        <Link to="/" className="back-link" aria-label="Back to home">
          ← Home
        </Link>
      </div>

      {/* Page header */}
      <header className="location-header">
        <span className="location-header__icon" aria-hidden="true">📍</span>
        <h1 className="location-header__title">Where Am I?</h1>
        <p className="location-header__desc">
          Tap the button below and I'll tell you exactly where you are —
          your street, nearby places, and landmarks — all spoken aloud.
        </p>
      </header>

      {/* Page body */}
      <div className="location-body container">

        {/* ── Locate button ───────────────────────────────────── */}
        <button
          type="button"
          className="location-locate-btn"
          onClick={requestLocation}
          disabled={isLocating}
          aria-label={isLocating ? 'Finding your location, please wait' : 'Find my current location'}
        >
          <span aria-hidden="true">{isLocating ? '⏳' : '📍'}</span>
          <span>{isLocating ? 'Finding Location…' : 'Find My Location'}</span>
        </button>

        {/* ── Error banner ────────────────────────────────────── */}
        {error && (
          <div className="location-error-msg" role="alert" aria-live="assertive">
            <span aria-hidden="true">⚠️</span>
            <span>{error}</span>
            <button
              type="button"
              className="location-error-dismiss"
              onClick={() => setError(null)}
              aria-label="Dismiss error"
            >
              ✕
            </button>
          </div>
        )}

        {/* ── Status card ─────────────────────────────────────── */}
        <section className="location-status-card" aria-labelledby="location-status-title">
          <h2 id="location-status-title" className="location-status-title">Location Info</h2>

          {status === 'idle'                          && <IdleState />}
          {(status === 'locating' || status === 'loading') && <LoadingState />}
          {status === 'denied'                        && <DeniedState />}
          {status === 'result' && result              && (
            <ResultState result={result} onRefresh={handleRefresh} />
          )}
        </section>

      </div>
    </div>
  );
}

export default LocationAssistant;
