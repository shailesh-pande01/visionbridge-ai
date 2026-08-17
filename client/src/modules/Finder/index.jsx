import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { analyzeFinder } from '../../services/finderService';
import LiveCameraView from '../../components/LiveCameraView';
import { useFeatureVoice } from '../../voice/AssistantContext';
import { speak, cancelSpeech } from '../../voice/speech';
import './FinderAssistant.css';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE_MB = 10;

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const MAX_SIDE = 1024;
    const QUALITY = 0.75;
    const img = new Image();
    const tmpUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(tmpUrl);
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > MAX_SIDE || h > MAX_SIDE) {
        const ratio = Math.min(MAX_SIDE / w, MAX_SIDE / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', QUALITY);
      const base64 = dataUrl.split(',')[1];
      const sizeKB = Math.round((base64.length * 3) / 4 / 1024);
      resolve({ base64, sizeKB, dataUrl });
    };

    img.onerror = () => {
      URL.revokeObjectURL(tmpUrl);
      reject(new Error('Could not load image for compression.'));
    };

    img.src = tmpUrl;
  });
}

function LoadingResponse() {
  return (
    <div className="transport-response-loading" role="status" aria-live="polite">
      <span className="transport-spinner" aria-hidden="true" />
      <p className="transport-response-loading__text">Looking for your object…</p>
      <p className="transport-response-loading__sub">Scanning the scene...</p>
    </div>
  );
}

function ResultResponse({ result, onReset }) {
  const [isSpeaking, setIsSpeaking] = React.useState(false);

  const speakText = React.useCallback(() => {
    if (!result.speech) return;
    setIsSpeaking(true);
    speak(result.speech, { onEnd: () => setIsSpeaking(false) });
  }, [result]);

  const stopSpeaking = React.useCallback(() => {
    cancelSpeech();
    setIsSpeaking(false);
  }, []);

  React.useEffect(() => {
    if (result.speech) speakText();
    return stopSpeaking;
  }, [speakText, stopSpeaking, result]);

  return (
    <div aria-live="polite" style={{ textAlign: 'center' }}>
      <div className={`finder-result-badge ${result.found ? 'found' : 'not-found'}`}>
        {result.found ? '✅ Found' : '❌ Not Found'}
      </div>

      <p className="finder-result-speech">{result.speech}</p>

      {result.found && (
        <div className="finder-result-details">
          {result.direction && <div className="finder-result-detail-row"><strong>Direction:</strong> {result.direction}</div>}
          {result.distance && <div className="finder-result-detail-row"><strong>Distance:</strong> {result.distance}</div>}
          {result.reference && <div className="finder-result-detail-row"><strong>Reference:</strong> {result.reference}</div>}
        </div>
      )}

      <div style={{ marginTop: '2rem', display: 'flex', gap: '1.25rem', flexDirection: 'column' }}>
        <button
          type="button"
          className="btn-outline"
          onClick={onReset}
          style={{ background: 'var(--accent)', color: 'var(--bg-primary)', border: 'none', minHeight: '64px', fontSize: '1.35rem', fontWeight: 900, borderRadius: '12px' }}
        >
          📷 Scan Again
        </button>
        <div style={{ display: 'flex', gap: '1.25rem' }}>
          <button
            type="button"
            className="btn-outline"
            onClick={speakText}
            style={{ flex: 1, minHeight: '64px', fontSize: '1.2rem', fontWeight: 800, borderRadius: '12px' }}
          >
            🔊 Replay
          </button>
        </div>
      </div>
    </div>
  );
}

function FinderAssistant() {
  // 'idle' | 'camera' | 'loading' | 'result' | 'low-confidence'
  const [status, setStatus] = useState('idle');
  const [objectName, setObjectName] = useState('');
  const [typedObject, setTypedObject] = useState('');

  const [imageUrl, setImageUrl] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const navigate = useNavigate();
  const routerLocation = useLocation();
  const cameraRef = useRef(null);
  const voiceRef = useRef({});
  const CONFIDENCE_THRESHOLD = 0.70;

  // ── Set the object to look for ─────────────────────────────────
  // The global voice controller supplies this — either through the
  // navigation state ("Vision, find my wallet" from another screen) or
  // by calling the findObject handler while this screen is open.
  // There is no separate microphone here: one recognizer, app-wide.
  const beginSearch = (name) => {
    const cleaned = String(name || '').trim();
    if (!cleaned) {
      speak('What are you looking for? Say Vision, find my wallet, for example.');
      return;
    }
    setObjectName(cleaned);
    setError(null);
    setResult(null);
    setImageUrl(null);
    setStatus('camera');
    voiceRef.current.remember?.({ objectRequested: cleaned, objectResult: null });
    speak(`Searching for ${cleaned}. Say Vision, capture, when you are pointing at the area.`);
  };

  // ── Cleanup ────────────────────────────────────────────────────
  useEffect(() => cancelSpeech, []);

  // ── Camera & API Logic ─────────────────────────────────────────
  const executeAnalysis = async (base64Payload) => {
    setStatus('loading');
    setError(null);
    speak(`Looking for ${objectName}...`);

    try {
      const data = await analyzeFinder(base64Payload, 'image/jpeg', objectName);

      if (data.confidence !== undefined && data.confidence < CONFIDENCE_THRESHOLD) {
        setStatus('low-confidence');
        speak(`I'm not confident enough to locate your ${objectName}. Would you like volunteer assistance?`);
        return;
      }

      // Remember where it was, so "what is next to it?" needs no rescan.
      voiceRef.current.remember?.({
        objectRequested: objectName,
        objectResult: [
          data.found ? `The ${objectName} was found.` : `The ${objectName} was not found in view.`,
          data.direction ? `Direction: ${data.direction}.` : '',
          data.distance ? `Distance: ${data.distance}.` : '',
          data.reference ? `Nearby reference: ${data.reference}.` : '',
          data.speech || '',
        ].filter(Boolean).join(' '),
      });

      setResult(data);
      setStatus('result');
    } catch (err) {
      setError(err.message);
      setStatus('camera');
      speak('Analysis failed. Please try capturing again.');
    }
  };

  const handleCameraCapture = (base64, sizeKB, dataUrl) => {
    setImageUrl(dataUrl);
    executeAnalysis(base64);
  };

  const handleSelectFile = async (file) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError(`Unsupported type "${file.type}".`); return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`Image too large.`); return;
    }
    setError(null);
    try {
      const { base64, dataUrl } = await compressImage(file);
      setImageUrl(dataUrl);
      executeAnalysis(base64);
    } catch {
      setError('Could not process the image.');
    }
  };

  const handleResetCamera = () => {
    setImageUrl(null);
    setResult(null);
    setError(null);
    setStatus('camera');
    speak('Camera ready.');
  };

  const handleResetAll = () => {
    setImageUrl(null);
    setResult(null);
    setError(null);
    setObjectName('');
    setTypedObject('');
    setStatus('idle');
  };

  // ── Voice handlers ─────────────────────────────────────────────
  const { rememberContext } = useFeatureVoice('objectFinder', {
    findObject: beginSearch,
    capture: () => {
      if (!objectName) {
        speak('Tell me what to look for first. Say Vision, find my wallet, for example.');
        return;
      }
      if (status !== 'camera') {
        handleResetCamera();
        speak('Camera ready. Say Vision, capture, when you are pointing at the area.');
        return;
      }
      if (!cameraRef.current?.capture()) {
        speak('The camera is not ready yet. Please wait a moment and try again.');
      }
    },
    // "Vision, yes" answers the low-confidence volunteer handoff.
    submit: () => {
      if (status === 'low-confidence') {
        navigate('/volunteer', { state: { source: 'Smart Object Finder', object: objectName } });
      }
    },
    cancel: handleResetAll,
  });
  voiceRef.current.remember = rememberContext;

  // "Vision, find my wallet" said on another screen arrives here as
  // navigation state — start that search straight away.
  const requestKeyRef = useRef(null);
  useEffect(() => {
    const requested = routerLocation.state?.objectName;
    if (!requested || requestKeyRef.current === routerLocation.key) return;

    requestKeyRef.current = routerLocation.key;
    beginSearch(requested);
    // Intentionally keyed on the navigation only — the key guard above
    // is what stops this from re-running.
  }, [routerLocation.key, routerLocation.state]); // eslint-disable-line

  const handleTypedSubmit = (e) => {
    e.preventDefault();
    beginSearch(typedObject);
  };

  return (
    <div className="finder-page">
      <div className="finder-back container">
        <Link to="/user/home" className="back-link">← Home</Link>
      </div>

      <header className="finder-header">
        <span className="finder-header__icon" aria-hidden="true">🔍</span>
        <h1 className="finder-header__title">Smart Object Finder</h1>
        <p className="finder-header__desc">
          Say <strong>“Vision, find my wallet”</strong> and I will scan the scene for it —
          then answer questions like “what is next to it?”
        </p>
      </header>

      <div className="container" style={{ maxWidth: '720px', margin: '0 auto' }}>
        {error && (
          <div style={{ marginBottom: '2rem', padding: '1rem', background: 'rgba(239,68,68,0.2)', border: '2px solid var(--emergency)', borderRadius: '12px', color: '#ff7070', fontWeight: 'bold' }}>
            ⚠️ {error}
            <button onClick={() => setError(null)} style={{ float: 'right', background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>✕</button>
          </div>
        )}

        {/* STEP 1: WHAT ARE WE LOOKING FOR?
            Spoken through the global assistant — the typed field is a
            visual fallback, never required. */}
        {status === 'idle' && (
          <div className="finder-voice-container">
            <span className="finder-voice-btn" aria-hidden="true">🎙️</span>
            <h2 className="finder-voice-status">Say “Vision, find my wallet”</h2>
            <p className="finder-voice-hint">
              Name anything you are looking for — keys, bottle, phone, remote.
            </p>

            <form onSubmit={handleTypedSubmit} className="finder-typed-form">
              <label htmlFor="finder-typed-object" className="finder-typed-label">
                Or type what to look for
              </label>
              <input
                id="finder-typed-object"
                type="text"
                className="finder-typed-input"
                value={typedObject}
                onChange={(e) => setTypedObject(e.target.value)}
                placeholder="e.g. wallet"
                autoComplete="off"
              />
              <button type="submit" className="finder-typed-submit">
                🔍 Start Searching
              </button>
            </form>
          </div>
        )}

        {/* Active Object Display */}
        {status !== 'idle' && objectName && (
          <div className="finder-object-display">
            <h3>Searching for:</h3>
            <p>{objectName}</p>
            {status === 'camera' && (
              <button className="btn-outline" onClick={handleResetAll} style={{ marginTop: '1rem', padding: '0.5rem 1rem' }}>
                Change Object
              </button>
            )}
          </div>
        )}

        {/* STEP 2: CAMERA */}
        {status === 'camera' && (
          <LiveCameraView
            ref={cameraRef}
            onCapture={handleCameraCapture}
            onSelectFile={handleSelectFile}
            buttonLabel='Say "Vision, capture" — or tap'
            secondaryLabel="Upload Image"
          />
        )}

        {/* STEP 3: LOADING */}
        {status === 'loading' && (
          <div style={{ textAlign: 'center', background: 'var(--bg-card)', border: '4px solid var(--border)', borderRadius: '24px', padding: '3rem 2rem', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
            {imageUrl && <img src={imageUrl} alt="Captured" style={{ width: '100%', maxHeight: '280px', objectFit: 'cover', borderRadius: '16px', marginBottom: '2rem', border: '2px solid var(--border)' }} />}
            <LoadingResponse />
          </div>
        )}

        {/* STEP 4: RESULT */}
        {status === 'result' && result && (
          <div style={{ background: 'var(--bg-card)', border: '4px solid var(--border)', borderRadius: '24px', padding: '2rem', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
            {imageUrl && <img src={imageUrl} alt="Analyzed" style={{ width: '100%', maxHeight: '240px', objectFit: 'cover', borderRadius: '16px', marginBottom: '2rem', border: '2px solid var(--border)' }} />}
            <ResultResponse result={result} onReset={handleResetCamera} />
            <div style={{ textAlign: 'center', marginTop: '1rem' }}>
              <button className="btn-outline" onClick={handleResetAll} style={{ padding: '0.75rem 1.5rem', background: 'transparent', border: '2px solid var(--border)' }}>
                Find a different object
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: LOW CONFIDENCE HANDOFF */}
        {status === 'low-confidence' && (
          <div style={{ background: 'var(--bg-card)', border: '4px solid var(--border)', borderRadius: '24px', padding: '3rem 2rem', textAlign: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
            <span aria-hidden="true" style={{ fontSize: '4rem', display: 'block', marginBottom: '1rem' }}>🤔</span>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--accent)', marginBottom: '1rem' }}>Low AI Confidence</h2>
            <p style={{ fontSize: '1.3rem', color: 'var(--text-primary)', marginBottom: '2rem' }}>
              I couldn't clearly see if your {objectName} is there.<br/><br/>
              Would you like to connect with a volunteer for human assistance?<br/><br/><strong>Say “Vision, yes” to connect, or “Vision, no” to try again.</strong>
            </p>
            <div style={{ display: 'flex', gap: '1.25rem', flexDirection: 'column' }}>
              <button
                type="button"
                className="btn-outline"
                onClick={() => navigate('/volunteer', { state: { source: 'Smart Object Finder', object: objectName } })}
                style={{ background: '#3b82f6', color: '#fff', border: 'none', minHeight: '64px', fontSize: '1.35rem', fontWeight: 900, borderRadius: '12px' }}
              >
                ✅ Yes, Connect to Volunteer
              </button>
              <button
                type="button"
                className="btn-outline"
                onClick={handleResetCamera}
                style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '2px solid var(--border)', minHeight: '64px', fontSize: '1.35rem', fontWeight: 900, borderRadius: '12px' }}
              >
                ❌ No, Try Camera Again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default FinderAssistant;
