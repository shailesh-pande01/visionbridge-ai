import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { analyzeImage } from '../../services/visionService';
import LiveCameraView from '../../components/LiveCameraView';
import './AIAssistant.css';

// ─────────────────────────────────────────────────────────────────
// Constants & helpers
// ─────────────────────────────────────────────────────────────────
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE_MB    = 10;

function formatFileSize(bytes) {
  if (bytes < 1024)         return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function speak(text) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  }
}

/**
 * compressImage
 * Resizes the image to at most 1024 × 1024 px and re-encodes it as JPEG.
 */
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const MAX_SIDE = 1024;
    const QUALITY  = 0.75;

    const img    = new Image();
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
      canvas.width  = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);

      const dataUrl = canvas.toDataURL('image/jpeg', QUALITY);
      const base64  = dataUrl.split(',')[1];
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

// ─────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────

function LoadingResponse() {
  return (
    <div className="response-loading" role="status" aria-live="polite" aria-label="Analyzing surroundings, please wait">
      <span className="spinner" aria-hidden="true" />
      <p className="response-loading__text">Analyzing surroundings…</p>
      <p className="response-loading__sub">Identifying obstacles, objects, and scene details.</p>
    </div>
  );
}

function ResultResponse({ result, onReset }) {
  const speakDescription = React.useCallback(() => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();

    let speechText = `Analysis complete. ${result.scene}. `;
    if (result.obstacles && result.obstacles.length > 0) {
      speechText += `Warning, obstacles detected: ${result.obstacles.join('. ')}. `;
    }
    speechText += `${result.description} `;
    if (result.objects && result.objects.length > 0) {
      speechText += `Objects detected include: ${result.objects.join('. ')}. `;
    }

    const utterance = new SpeechSynthesisUtterance(speechText);
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  }, [result]);

  React.useEffect(() => {
    speakDescription();
    return () => {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, [speakDescription]);

  return (
    <div className="response-result" aria-live="polite">
      <div className="result-header">
        <span className="result-scene">{result.scene}</span>
        <span className="result-confidence" aria-label={`${result.confidence} percent confidence`}>
          {result.confidence}% confident
        </span>
      </div>

      {result.obstacles && result.obstacles.length > 0 && (
        <div className="result-obstacles" role="alert" aria-label="Obstacles detected ahead">
          <h3 className="result-obstacles__title">
            <span aria-hidden="true">⚠️</span> Obstacles Detected
          </h3>
          <ul className="result-obstacles__list" role="list">
            {result.obstacles.map((obs) => (
              <li key={obs} className="result-obstacle-item">{obs}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="result-desc">{result.description}</p>

      <div className="result-meta-block">
        <h3 className="result-meta-label">Objects Detected</h3>
        <ul className="result-objects" role="list">
          {result.objects.map((obj) => (
            <li key={obj} className="result-object-item">
              <span aria-hidden="true">›</span>
              <span>{obj}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="result-meta-block">
        <h3 className="result-meta-label">Scene Details</h3>
        <p className="result-detail">
          <span className="result-detail__key">Lighting</span>
          <span className="result-detail__val">{result.lighting}</span>
        </p>
        <p className="result-detail">
          <span className="result-detail__key">Time of day</span>
          <span className="result-detail__val">{result.timeOfDay}</span>
        </p>
      </div>

      <div className="result-actions" style={{ marginTop: '2.5rem', display: 'flex', gap: '1.25rem', flexDirection: 'column' }}>
        <button
          type="button"
          className="btn-outline result-action-btn"
          onClick={onReset}
          style={{ background: 'var(--accent)', color: 'var(--bg-primary)', border: 'none', minHeight: '64px', fontSize: '1.35rem', fontWeight: 900 }}
          aria-label="Capture again. Open camera."
        >
          📷 Capture Again / Retake
        </button>
        <button
          type="button"
          className="btn-outline result-action-btn"
          onClick={speakDescription}
          style={{ minHeight: '64px', fontSize: '1.25rem', fontWeight: 800 }}
          aria-label="Replay description aloud"
        >
          🔊 Replay Description
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────
function AIAssistant() {
  // 'camera' | 'loading' | 'result'
  const [status, setStatus] = useState('camera');
  const [imageUrl, setImageUrl] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // ── Execute Analysis API Call ──────────────────────────────────
  const executeAnalysis = async (base64Payload) => {
    setStatus('loading');
    setError(null);
    speak('Analyzing surroundings...');

    try {
      const data = await analyzeImage(base64Payload, 'image/jpeg');
      setResult(data);
      setStatus('result');
    } catch (err) {
      setError(err.message);
      setStatus('camera');
      speak('Analysis failed. Please try capturing again.');
    }
  };

  // ── Live Camera Capture Handler ────────────────────────────────
  const handleCameraCapture = (base64, sizeKB, dataUrl) => {
    setImageUrl(dataUrl);
    executeAnalysis(base64);
  };

  // ── Secondary File Upload Handler ──────────────────────────────
  const handleSelectFile = async (file) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError(`Unsupported type "${file.type}". Please select a JPG, PNG, WebP, or GIF.`);
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`Image too large (${formatFileSize(file.size)}). Maximum size is ${MAX_SIZE_MB} MB.`);
      return;
    }

    setError(null);
    try {
      const { base64, dataUrl } = await compressImage(file);
      setImageUrl(dataUrl);
      executeAnalysis(base64);
    } catch {
      setError('Could not process the image. Please try a different one.');
    }
  };

  // ── Reset back to camera mode ──────────────────────────────────
  const handleReset = () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setImageUrl(null);
    setResult(null);
    setError(null);
    setStatus('camera');
    speak('Camera ready.');
  };

  return (
    <div className="camera-page">
      {/* Back nav */}
      <div className="camera-back container">
        <Link to="/" className="back-link" aria-label="Back to home">
          ← Home
        </Link>
      </div>

      {/* Page header */}
      <header className="camera-header">
        <span className="camera-header__icon" aria-hidden="true">🎙️</span>
        <h1 className="camera-header__title">AI Camera Assistant</h1>
        <p className="camera-header__desc">
          Point your camera at your surroundings and tap Capture. I'll analyze the scene and describe everything aloud instantly.
        </p>
      </header>

      {/* Page body */}
      <div className="camera-body container" style={{ maxWidth: '720px', margin: '0 auto' }}>
        {error && (
          <div className="error-msg" role="alert" aria-live="assertive" style={{ marginBottom: '2rem' }}>
            <span aria-hidden="true">⚠️</span>
            <span>{error}</span>
            <button
              type="button"
              className="error-dismiss"
              onClick={() => setError(null)}
              aria-label="Dismiss error"
            >
              ✕
            </button>
          </div>
        )}

        {/* STEP 1: LIVE CAMERA VIEW */}
        {status === 'camera' && (
          <LiveCameraView
            onCapture={handleCameraCapture}
            onSelectFile={handleSelectFile}
            buttonLabel="Tap Capture to Analyze Surroundings"
            secondaryLabel="Upload from Device"
          />
        )}

        {/* STEP 2: LOADING OVERLAY / PREVIEW */}
        {status === 'loading' && (
          <div style={{ textAlign: 'center', background: 'var(--bg-card)', border: '4px solid var(--border)', borderRadius: '24px', padding: '3rem 2rem', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
            {imageUrl && (
              <img
                src={imageUrl}
                alt="Captured frame"
                style={{ width: '100%', maxHeight: '280px', objectFit: 'cover', borderRadius: '16px', marginBottom: '2rem', border: '2px solid var(--border)' }}
              />
            )}
            <LoadingResponse />
          </div>
        )}

        {/* STEP 3: AI RESULT */}
        {status === 'result' && result && (
          <div style={{ background: 'var(--bg-card)', border: '4px solid var(--border)', borderRadius: '24px', padding: '2rem', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
            {imageUrl && (
              <img
                src={imageUrl}
                alt="Analyzed frame"
                style={{ width: '100%', maxHeight: '240px', objectFit: 'cover', borderRadius: '16px', marginBottom: '2rem', border: '2px solid var(--border)' }}
              />
            )}
            <ResultResponse result={result} onReset={handleReset} />
          </div>
        )}
      </div>
    </div>
  );
}

export default AIAssistant;
