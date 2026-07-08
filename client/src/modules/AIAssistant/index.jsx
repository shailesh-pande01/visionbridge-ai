import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { analyzeImage, analyzeHazard } from '../../services/visionService';
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

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
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
  const navigate = useNavigate();
  const CONFIDENCE_THRESHOLD = 0.70;

  // Hazard Mode State
  const [isHazardMode, setIsHazardMode] = useState(false);
  const [hazardStatus, setHazardStatus] = useState('idle'); // 'scanning', 'paused'
  const [sceneMemory, setSceneMemory] = useState('No previous context.');
  const [lastSpeech, setLastSpeech] = useState('');
  const [elapsedTime, setElapsedTime] = useState(0);

  // Timer for Hazard Mode
  useEffect(() => {
    let timer;
    if (isHazardMode && hazardStatus === 'scanning') {
      timer = setInterval(() => setElapsedTime((prev) => prev + 1), 1000);
    } else {
      clearInterval(timer);
    }
    return () => clearInterval(timer);
  }, [isHazardMode, hazardStatus]);

  // ── Execute Analysis API Call (Manual Mode) ────────────────────
  const executeAnalysis = async (base64Payload) => {
    setStatus('loading');
    setError(null);
    speak('Analyzing surroundings...');

    try {
      const data = await analyzeImage(base64Payload, 'image/jpeg');
      
      if (data.confidence !== undefined && data.confidence < CONFIDENCE_THRESHOLD) {
        setStatus('low-confidence');
        speak("I'm not confident enough to answer accurately. Would you like to connect with a volunteer?");
        return;
      }

      setResult(data);
      setStatus('result');
    } catch (err) {
      setError(err.message);
      setStatus('camera');
      speak('Analysis failed. Please try capturing again.');
    }
  };

  // ── Live Camera Capture Handler (Manual Mode) ──────────────────
  const handleCameraCapture = (base64, sizeKB, dataUrl) => {
    setImageUrl(dataUrl);
    executeAnalysis(base64);
  };

  // ── Secondary File Upload Handler (Manual Mode) ────────────────
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

  // ── Continuous Capture Handler (Hazard Mode) ───────────────────
  const handleContinuousCapture = async (base64, sizeKB, dataUrl) => {
    if (!isHazardMode || hazardStatus !== 'scanning') return;

    try {
      const data = await analyzeHazard(base64, 'image/jpeg', sceneMemory);
      
      setSceneMemory(data.sceneSummary);
      setLastSpeech(data.speech);

      const speechLower = (data.speech || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
      if (!speechLower.includes('no significant change')) {
        speak(data.speech);
      }
    } catch (err) {
      if (err.message === 'RATE_LIMIT') {
        setHazardStatus('paused');
        speak('Scanning paused. Rate limit reached. Please wait.');
        setTimeout(() => {
          setHazardStatus('scanning');
          speak('Resuming scan.');
        }, 15000); // Wait 15s before resuming
      } else {
        console.error('Hazard scan error:', err);
      }
    }
  };

  // ── Toggle Hazard Mode ─────────────────────────────────────────
  const toggleHazardMode = () => {
    if (isHazardMode) {
      setIsHazardMode(false);
      setHazardStatus('idle');
      setSceneMemory('No previous context.');
      setLastSpeech('');
      setElapsedTime(0);
      speak('Hazard mode disabled.');
    } else {
      setIsHazardMode(true);
      setHazardStatus('scanning');
      setElapsedTime(0);
      speak('Hazard mode enabled. Continuously scanning surroundings for hazards.');
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
          Point your camera at your surroundings and tap Capture, or enable Hazard Mode for continuous safety monitoring.
        </p>
      </header>

      {/* Page body */}
      <div className="camera-body container" style={{ maxWidth: '720px', margin: '0 auto' }}>
        
        {/* HAZARD MODE TOGGLE */}
        {status === 'camera' && (
          <div className={`hazard-toggle-box ${isHazardMode ? 'active' : ''}`}>
            <div className="hazard-toggle-header">
              <div>
                <h2 className="hazard-title">🚨 Hazard Prioritization</h2>
                <p className="hazard-desc">Continuous background scanning for obstacles.</p>
              </div>
              <button 
                className={`hazard-btn ${isHazardMode ? 'btn-stop' : 'btn-start'}`}
                onClick={toggleHazardMode}
                aria-pressed={isHazardMode}
                aria-label={isHazardMode ? 'Stop Hazard Mode' : 'Start Hazard Mode'}
              >
                {isHazardMode ? '⏹️ Stop' : '▶️ Start'}
              </button>
            </div>
            
            {isHazardMode && (
              <div className="hazard-active-panel">
                <div className="hazard-status-bar">
                  <span className={`hazard-indicator ${hazardStatus === 'scanning' ? 'pulse' : ''}`} />
                  <span className="hazard-status-text">
                    {hazardStatus === 'scanning' ? 'Live Scanning...' : 'Paused (Rate Limit)'}
                  </span>
                  <span className="hazard-timer">{formatTime(elapsedTime)}</span>
                </div>
                
                <div className="hazard-memory-box">
                  <p className="hazard-memory-label">Last Spoken Hazard:</p>
                  <p className="hazard-memory-value highlight">
                    {lastSpeech || 'None yet.'}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

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
            onContinuousCapture={handleContinuousCapture}
            autoCaptureInterval={isHazardMode && hazardStatus === 'scanning' ? 5000 : null}
            buttonLabel={isHazardMode ? "Scanning Automatically..." : "Tap Capture to Analyze"}
            secondaryLabel={isHazardMode ? "Disabled in Hazard Mode" : "Upload from Device"}
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

        {/* STEP 4: LOW CONFIDENCE HANDOFF */}
        {status === 'low-confidence' && (
          <div style={{ background: 'var(--bg-card)', border: '4px solid var(--border)', borderRadius: '24px', padding: '3rem 2rem', textAlign: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
            <span aria-hidden="true" style={{ fontSize: '4rem', display: 'block', marginBottom: '1rem' }}>🤔</span>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--accent)', marginBottom: '1rem' }}>Low AI Confidence</h2>
            <p style={{ fontSize: '1.3rem', color: 'var(--text-primary)', marginBottom: '2rem' }}>
              I'm not confident enough to answer this accurately.<br/><br/>
              Would you like to connect with a volunteer for human assistance?
            </p>
            <div style={{ display: 'flex', gap: '1.25rem', flexDirection: 'column' }}>
              <button
                type="button"
                className="btn-outline"
                onClick={() => navigate('/volunteer', { state: { source: 'AI Camera Assistant' } })}
                style={{ background: '#3b82f6', color: '#fff', border: 'none', minHeight: '64px', fontSize: '1.35rem', fontWeight: 900 }}
              >
                ✅ Yes, Connect to Volunteer
              </button>
              <button
                type="button"
                className="btn-outline"
                onClick={handleReset}
                style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '2px solid var(--border)', minHeight: '64px', fontSize: '1.35rem', fontWeight: 900 }}
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

export default AIAssistant;
