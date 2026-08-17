import React, { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { extractText } from '../../services/readingService';
import LiveCameraView from '../../components/LiveCameraView';
import { useFeatureVoice } from '../../voice/AssistantContext';
import { speak, cancelSpeech } from '../../voice/speech';
import './ReadingAssistant.css';

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
    <div className="reading-response-loading" role="status" aria-live="polite" aria-label="Reading text from image, please wait">
      <span className="reading-spinner" aria-hidden="true" />
      <p className="reading-response-loading__text">Reading text from your image…</p>
      <p className="reading-response-loading__sub">Extracting words from signs, menus, labels, or documents.</p>
    </div>
  );
}

function ResultResponse({ result, onReset }) {
  const [isSpeaking, setIsSpeaking] = React.useState(false);

  const speakText = React.useCallback(() => {
    if (!result.extractedText) return;
    setIsSpeaking(true);
    speak(`Analysis complete. Extracted text: ${result.extractedText}`, {
      onEnd: () => setIsSpeaking(false),
    });
  }, [result]);

  const stopSpeaking = React.useCallback(() => {
    cancelSpeech();
    setIsSpeaking(false);
  }, []);

  React.useEffect(() => {
    if (result.extractedText) {
      speakText();
    } else if (result.message) {
      speak(`Analysis complete. ${result.message}`);
    } else {
      speak('Analysis complete. No readable text found.');
    }
    return cancelSpeech;
  }, [speakText, result]);

  // No text found
  if (!result.extractedText) {
    return (
      <div className="reading-response-result" aria-live="polite">
        <div className="reading-result-no-text" style={{ padding: '2rem 1rem', textAlign: 'center' }}>
          <span className="reading-result-no-text__icon" aria-hidden="true" style={{ fontSize: '4rem', display: 'block', marginBottom: '1rem' }}>🔍</span>
          <p className="reading-result-no-text__msg" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fca5a5' }}>
            {result.message || 'No readable text was found in this image. Try a clearer photo of text.'}
          </p>
        </div>
        <div className="reading-result-actions" style={{ marginTop: '2rem' }}>
          <button
            type="button"
            className="btn-outline reading-result-action-btn"
            onClick={onReset}
            style={{ background: 'var(--accent)', color: 'var(--bg-primary)', border: 'none', width: '100%', minHeight: '64px', fontSize: '1.35rem', fontWeight: 900 }}
            aria-label="Try another image. Open camera."
          >
            📷 Capture Again / Retake
          </button>
        </div>
      </div>
    );
  }

  // Text found
  const wordCount = result.extractedText.split(/\s+/).filter(Boolean).length;

  return (
    <div className="reading-response-result" aria-live="polite">
      <div className="reading-result-header">
        <span className="reading-result-label">Extracted Text</span>
        <span className="reading-result-badge" aria-label={`${wordCount} words extracted`}>
          {wordCount} words
        </span>
      </div>

      {isSpeaking && (
        <div className="reading-tts-status" aria-live="polite">
          <span className="reading-tts-status__dot" aria-hidden="true" />
          Reading aloud…
        </div>
      )}

      <div className="reading-result-text-block">
        <p className="reading-result-text">{result.extractedText}</p>
      </div>

      <div className="reading-result-actions" style={{ marginTop: '2.5rem', display: 'flex', gap: '1.25rem', flexDirection: 'column' }}>
        <button
          type="button"
          className="btn-outline reading-result-action-btn"
          onClick={onReset}
          style={{ background: 'var(--accent)', color: 'var(--bg-primary)', border: 'none', width: '100%', minHeight: '64px', fontSize: '1.35rem', fontWeight: 900 }}
          aria-label="Capture again. Open camera."
        >
          📷 Capture Again / Retake
        </button>
        <div style={{ display: 'flex', gap: '1.25rem', width: '100%' }}>
          <button
            type="button"
            className="btn-outline reading-result-action-btn"
            onClick={speakText}
            style={{ flex: 1, minHeight: '64px', fontSize: '1.2rem', fontWeight: 800 }}
            aria-label="Replay text aloud"
          >
            🔊 Replay
          </button>
          <button
            type="button"
            className="btn-outline reading-result-action-btn"
            onClick={stopSpeaking}
            style={{ flex: 1, minHeight: '64px', fontSize: '1.2rem', fontWeight: 800, background: 'var(--bg-secondary)' }}
            aria-label="Stop reading aloud"
          >
            ⏹️ Stop
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────
function ReadingAssistant() {
  // 'camera' | 'loading' | 'result'
  const [status, setStatus] = useState('camera');
  const [imageUrl, setImageUrl] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const cameraRef = useRef(null);
  const CONFIDENCE_THRESHOLD = 0.70;

  // Voice handlers are registered further down, once the callbacks exist.
  const voiceRef = useRef({});

  // ── Execute Extraction API Call ────────────────────────────────
  const executeExtraction = async (base64Payload) => {
    setStatus('loading');
    setError(null);
    speak('Reading text...');

    try {
      const data = await extractText(base64Payload, 'image/jpeg');

      if (data.confidence !== undefined && data.confidence < CONFIDENCE_THRESHOLD) {
        setStatus('low-confidence');
        speak("I'm not confident enough to read this accurately. Would you like to connect with a volunteer?");
        return;
      }

      // Remember the text so follow-up questions ("what is the price of
      // paneer butter masala?") are answered without a second photo.
      // A new capture always replaces the previous one.
      if (data.extractedText) {
        voiceRef.current.remember({ extractedText: data.extractedText });
      }

      setResult(data);
      setStatus('result');
    } catch (err) {
      setError(err.message);
      setStatus('camera');
      speak('Reading failed. Please try capturing again.');
    }
  };

  // ── Live Camera Capture Handler ────────────────────────────────
  const handleCameraCapture = (base64, sizeKB, dataUrl) => {
    setImageUrl(dataUrl);
    executeExtraction(base64);
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
      executeExtraction(base64);
    } catch {
      setError('Could not process the image. Please try a different one.');
    }
  };

  // ── Reset back to camera mode ──────────────────────────────────
  const handleReset = () => {
    cancelSpeech();
    setImageUrl(null);
    setResult(null);
    setError(null);
    setStatus('camera');
    speak('Camera ready.');
  };

  // ── Voice: "Vision, capture" / "Vision, cancel" ────────────────
  const { rememberContext } = useFeatureVoice('reading', {
    capture: () => {
      if (status !== 'camera') {
        handleReset();
        speak('Camera ready. Say Vision, capture, when the text is in front of you.');
        return;
      }
      if (!cameraRef.current?.capture()) {
        speak('The camera is not ready yet. Please wait a moment and try again.');
      }
    },
    // "Vision, yes" answers the low-confidence volunteer handoff.
    submit: () => {
      if (status === 'low-confidence') {
        navigate('/volunteer', { state: { source: 'Smart Reading Assistant' } });
      }
    },
    cancel: handleReset,
  });
  voiceRef.current.remember = rememberContext;

  return (
    <div className="reading-page">
      {/* Back nav */}
      <div className="reading-back container">
        <Link to="/user/home" className="back-link" aria-label="Back to home">
          ← Home
        </Link>
      </div>

      {/* Page header */}
      <header className="reading-header">
        <span className="reading-header__icon" aria-hidden="true">📖</span>
        <h1 className="reading-header__title">Smart Reading Assistant</h1>
        <p className="reading-header__desc">
          Point your camera at any text — signs, medicine labels, menus, documents — and say
          <strong> “Vision, capture.”</strong> I'll read it aloud, then answer questions about it.
        </p>
      </header>

      {/* Page body */}
      <div className="reading-body container" style={{ maxWidth: '720px', margin: '0 auto' }}>
        {error && (
          <div className="reading-error-msg" role="alert" aria-live="assertive" style={{ marginBottom: '2rem' }}>
            <span aria-hidden="true">⚠️</span>
            <span>{error}</span>
            <button
              type="button"
              className="reading-error-dismiss"
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
            ref={cameraRef}
            onCapture={handleCameraCapture}
            onSelectFile={handleSelectFile}
            buttonLabel='Say "Vision, capture" — or tap'
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

        {/* STEP 4: LOW CONFIDENCE HANDOFF */}
        {status === 'low-confidence' && (
          <div style={{ background: 'var(--bg-card)', border: '4px solid var(--border)', borderRadius: '24px', padding: '3rem 2rem', textAlign: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
            <span aria-hidden="true" style={{ fontSize: '4rem', display: 'block', marginBottom: '1rem' }}>🤔</span>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--accent)', marginBottom: '1rem' }}>Low AI Confidence</h2>
            <p style={{ fontSize: '1.3rem', color: 'var(--text-primary)', marginBottom: '2rem' }}>
              I'm not confident enough to read this text accurately.<br/><br/>
              Would you like to connect with a volunteer for human assistance?<br/><br/><strong>Say “Vision, yes” to connect, or “Vision, no” to try again.</strong>
            </p>
            <div style={{ display: 'flex', gap: '1.25rem', flexDirection: 'column' }}>
              <button
                type="button"
                className="btn-outline"
                onClick={() => navigate('/volunteer', { state: { source: 'Smart Reading Assistant' } })}
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

export default ReadingAssistant;
