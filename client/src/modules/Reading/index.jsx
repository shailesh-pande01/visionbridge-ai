import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { extractText } from '../../services/readingService';
import LiveCameraView from '../../components/LiveCameraView';
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
    if (!('speechSynthesis' in window) || !result.extractedText) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(`Analysis complete. Extracted text: ${result.extractedText}`);
    utterance.rate  = 0.95;
    utterance.pitch = 1.0;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend   = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  }, [result]);

  const stopSpeaking = React.useCallback(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
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
    return () => {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    };
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

  // ── Execute Extraction API Call ────────────────────────────────
  const executeExtraction = async (base64Payload) => {
    setStatus('loading');
    setError(null);
    speak('Reading text...');

    try {
      const data = await extractText(base64Payload, 'image/jpeg');
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
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setImageUrl(null);
    setResult(null);
    setError(null);
    setStatus('camera');
    speak('Camera ready.');
  };

  return (
    <div className="reading-page">
      {/* Back nav */}
      <div className="reading-back container">
        <Link to="/" className="back-link" aria-label="Back to home">
          ← Home
        </Link>
      </div>

      {/* Page header */}
      <header className="reading-header">
        <span className="reading-header__icon" aria-hidden="true">📖</span>
        <h1 className="reading-header__title">Smart Reading Assistant</h1>
        <p className="reading-header__desc">
          Point your camera at any text — signs, medicine labels, menus, documents — and tap Capture. I'll extract and read it aloud instantly.
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
            onCapture={handleCameraCapture}
            onSelectFile={handleSelectFile}
            buttonLabel="Tap Capture to Read Text"
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

export default ReadingAssistant;
