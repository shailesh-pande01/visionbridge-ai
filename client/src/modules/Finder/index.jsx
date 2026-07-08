import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { analyzeFinder } from '../../services/finderService';
import LiveCameraView from '../../components/LiveCameraView';
import './FinderAssistant.css';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE_MB = 10;

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

function extractObjectName(transcript) {
  let text = transcript.toLowerCase().trim();
  text = text.replace(/[.,!?]$/, ''); // strip trailing punctuation

  const prefixes = [
    'find my', 'find the', 'find',
    'where is my', 'where are my', 'where is the', 'where are the',
    'locate my', 'locate the', 'locate'
  ];

  for (const prefix of prefixes) {
    if (text.startsWith(prefix)) {
      return text.slice(prefix.length).trim();
    }
  }

  // If no prefix matched, just use the whole text (might be just "wallet")
  return text;
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
  // 'voice' | 'camera' | 'loading' | 'result' | 'low-confidence'
  const [status, setStatus] = useState('voice'); 
  const [objectName, setObjectName] = useState('');
  const [isListening, setIsListening] = useState(false);
  
  const [imageUrl, setImageUrl] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  
  const navigate = useNavigate();
  const recognitionRef = useRef(null);
  const CONFIDENCE_THRESHOLD = 0.70;

  // ── Voice Input Logic ──────────────────────────────────────────
  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Browser does not support Speech Recognition.');
      speak('Speech recognition is not supported in your browser.');
      return;
    }

    setError(null);
    setIsListening(true);
    speak('What are you looking for?');

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      const extracted = extractObjectName(transcript);
      if (extracted) {
        setObjectName(extracted);
        speak(`Searching for ${extracted}. Please capture the scene.`);
        setStatus('camera');
      } else {
        setError('Could not understand the object name.');
        speak('I did not catch that. Please try again.');
      }
    };

    recognition.onerror = (event) => {
      setError(`Voice recognition failed: ${event.error}`);
      setIsListening(false);
      speak('Voice recognition failed. Please tap the microphone again.');
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (e) {
      console.error(e);
    }
  };

  const cancelListening = () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    setIsListening(false);
  };

  // ── Cleanup ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, []);

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
    setStatus('voice');
  };

  return (
    <div className="finder-page">
      <div className="finder-back container">
        <Link to="/" className="back-link">← Home</Link>
      </div>

      <header className="finder-header">
        <span className="finder-header__icon" aria-hidden="true">🔍</span>
        <h1 className="finder-header__title">Smart Object Finder</h1>
        <p className="finder-header__desc">
          Tell me what you are looking for, and I will scan the scene to find it.
        </p>
      </header>

      <div className="container" style={{ maxWidth: '720px', margin: '0 auto' }}>
        {error && (
          <div style={{ marginBottom: '2rem', padding: '1rem', background: 'rgba(239,68,68,0.2)', border: '2px solid var(--emergency)', borderRadius: '12px', color: '#ff7070', fontWeight: 'bold' }}>
            ⚠️ {error}
            <button onClick={() => setError(null)} style={{ float: 'right', background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>✕</button>
          </div>
        )}

        {/* STEP 1: VOICE INPUT */}
        {status === 'voice' && (
          <div className="finder-voice-container">
            <button
              className={`finder-voice-btn ${isListening ? 'listening' : ''}`}
              onClick={isListening ? cancelListening : startListening}
              aria-label={isListening ? 'Cancel listening' : 'Tap to speak'}
            >
              🎙️
            </button>
            <h2 className="finder-voice-status">
              {isListening ? 'Listening...' : 'Tap Mic & Speak'}
            </h2>
            <p className="finder-voice-hint">
              Try: "Find my wallet" or "Where is my bottle?"
            </p>
          </div>
        )}

        {/* Active Object Display (when not in voice mode) */}
        {status !== 'voice' && objectName && (
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
            onCapture={handleCameraCapture}
            onSelectFile={handleSelectFile}
            buttonLabel="Tap Capture to Scan"
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
              Would you like to connect with a volunteer for human assistance?
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
