import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { analyzeTransport } from '../../services/transportService';
import LiveCameraView from '../../components/LiveCameraView';
import './TransportAssistant.css';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE_MB = 10;

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
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
    <div className="transport-response-loading" role="status" aria-live="polite" aria-label="Analyzing transport info, please wait">
      <span className="transport-spinner" aria-hidden="true" />
      <p className="transport-response-loading__text">Scanning for transport info…</p>
      <p className="transport-response-loading__sub">Looking for buses, trains, metros, or signs.</p>
    </div>
  );
}

function ResultResponse({ result, onReset }) {
  const [isSpeaking, setIsSpeaking] = React.useState(false);

  const speakText = React.useCallback(() => {
    if (!('speechSynthesis' in window) || !result.speech) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(result.speech);
    utterance.rate = 0.95;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, [result]);

  const stopSpeaking = React.useCallback(() => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  React.useEffect(() => {
    if (result.speech) {
      speakText();
    } else {
      speak('Analysis complete. No transport info found.');
    }
    return () => {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, [speakText, result]);

  return (
    <div className="transport-response-result" aria-live="polite">
      <div className="transport-result-header">
        <span className="transport-result-label">{result.type || 'Information'}</span>
        <span className="transport-result-badge">{result.title}</span>
      </div>

      <div className="transport-result-text-block">
        <p className="transport-result-text" style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>
          <strong>Destination:</strong> {result.destination || 'N/A'}
        </p>
        <p className="transport-result-text" style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>
          {result.speech}
        </p>
      </div>

      <div style={{ marginTop: '2.5rem', display: 'flex', gap: '1.25rem', flexDirection: 'column' }}>
        <button
          type="button"
          className="btn-outline transport-result-action-btn"
          onClick={onReset}
          style={{ background: 'var(--accent)', color: 'var(--bg-primary)', border: 'none', minHeight: '64px', fontSize: '1.35rem', fontWeight: 900 }}
        >
          📷 Capture Again
        </button>
        <div style={{ display: 'flex', gap: '1.25rem' }}>
          <button
            type="button"
            className="btn-outline transport-result-action-btn"
            onClick={speakText}
            style={{ flex: 1, minHeight: '64px', fontSize: '1.2rem', fontWeight: 800 }}
          >
            🔊 Replay
          </button>
          <button
            type="button"
            className="btn-outline transport-result-action-btn"
            onClick={stopSpeaking}
            style={{ flex: 1, minHeight: '64px', fontSize: '1.2rem', fontWeight: 800, background: 'var(--bg-secondary)' }}
          >
            ⏹️ Stop
          </button>
        </div>
      </div>
    </div>
  );
}

function TransportAssistant() {
  const [status, setStatus] = useState('camera'); // 'camera' | 'loading' | 'result' | 'low-confidence'
  const [imageUrl, setImageUrl] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const CONFIDENCE_THRESHOLD = 0.70;

  const executeAnalysis = async (base64Payload) => {
    setStatus('loading');
    setError(null);
    speak('Scanning transport info...');

    try {
      const data = await analyzeTransport(base64Payload, 'image/jpeg');

      if (data.confidence !== undefined && data.confidence < CONFIDENCE_THRESHOLD) {
        setStatus('low-confidence');
        speak("I couldn't confidently identify the transport information. Would you like volunteer assistance?");
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

  const handleCameraCapture = (base64, sizeKB, dataUrl) => {
    setImageUrl(dataUrl);
    executeAnalysis(base64);
  };

  const handleSelectFile = async (file) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError(`Unsupported type "${file.type}".`);
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`Image too large.`);
      return;
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

  const handleReset = () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setImageUrl(null);
    setResult(null);
    setError(null);
    setStatus('camera');
    speak('Camera ready.');
  };

  return (
    <div className="transport-page">
      <div className="transport-back container">
        <Link to="/" className="back-link">← Home</Link>
      </div>

      <header className="transport-header">
        <span className="transport-header__icon" aria-hidden="true">🚍</span>
        <h1 className="transport-header__title">Public Transport Assistant</h1>
        <p className="transport-header__desc">
          Identify buses, trains, metros, platforms, and directional signs.
        </p>
      </header>

      <div className="container" style={{ maxWidth: '720px', margin: '0 auto' }}>
        {error && (
          <div style={{ marginBottom: '2rem', padding: '1rem', background: 'rgba(239,68,68,0.2)', border: '2px solid var(--emergency)', borderRadius: '12px', color: '#ff7070', fontWeight: 'bold' }}>
            ⚠️ {error}
            <button onClick={() => setError(null)} style={{ float: 'right', background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>✕</button>
          </div>
        )}

        {status === 'camera' && (
          <LiveCameraView
            onCapture={handleCameraCapture}
            onSelectFile={handleSelectFile}
            buttonLabel="Tap Capture to Read Sign"
            secondaryLabel="Upload Image"
          />
        )}

        {status === 'loading' && (
          <div style={{ textAlign: 'center', background: 'var(--bg-card)', border: '4px solid var(--border)', borderRadius: '24px', padding: '3rem 2rem', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
            {imageUrl && <img src={imageUrl} alt="Captured" style={{ width: '100%', maxHeight: '280px', objectFit: 'cover', borderRadius: '16px', marginBottom: '2rem', border: '2px solid var(--border)' }} />}
            <LoadingResponse />
          </div>
        )}

        {status === 'result' && result && (
          <div style={{ background: 'var(--bg-card)', border: '4px solid var(--border)', borderRadius: '24px', padding: '2rem', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
            {imageUrl && <img src={imageUrl} alt="Analyzed" style={{ width: '100%', maxHeight: '240px', objectFit: 'cover', borderRadius: '16px', marginBottom: '2rem', border: '2px solid var(--border)' }} />}
            <ResultResponse result={result} onReset={handleReset} />
          </div>
        )}

        {status === 'low-confidence' && (
          <div style={{ background: 'var(--bg-card)', border: '4px solid var(--border)', borderRadius: '24px', padding: '3rem 2rem', textAlign: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
            <span aria-hidden="true" style={{ fontSize: '4rem', display: 'block', marginBottom: '1rem' }}>🤔</span>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--accent)', marginBottom: '1rem' }}>Low AI Confidence</h2>
            <p style={{ fontSize: '1.3rem', color: 'var(--text-primary)', marginBottom: '2rem' }}>
              I couldn't confidently identify the transport information.<br/><br/>
              Would you like to connect with a volunteer for human assistance?
            </p>
            <div style={{ display: 'flex', gap: '1.25rem', flexDirection: 'column' }}>
              <button
                type="button"
                className="btn-outline"
                onClick={() => navigate('/volunteer', { state: { source: 'Public Transport Assistant' } })}
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

export default TransportAssistant;
