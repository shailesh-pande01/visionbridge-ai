import React, { useState, useEffect, useRef, useCallback } from 'react';
import './LiveCameraView.css';

function speak(text) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  }
}

function LiveCameraView({ onCapture, onSelectFile, buttonLabel = 'Capture', secondaryLabel = 'Upload from Device' }) {
  const [facingMode, setFacingMode] = useState('environment');
  // 'initializing' | 'ready' | 'error'
  const [cameraStatus, setCameraStatus] = useState('initializing');
  const [errorMessage, setErrorMessage] = useState('');

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  // ── Stop existing video stream tracks ──────────────────────────
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  // ── Start Camera Stream ────────────────────────────────────────
  const startCamera = useCallback(async () => {
    stopStream();
    setCameraStatus('initializing');

    if (!('mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices)) {
      setErrorMessage('Browser does not support direct camera access (HTTPS required). Please use the Upload button below.');
      setCameraStatus('error');
      speak('Camera access not supported in this browser. Please use upload from device.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraStatus('ready');
      speak('Camera ready. Point at your target and tap Capture.');
    } catch (err) {
      console.error('[LiveCameraView] Error starting camera:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorMessage('Camera permission denied. Please allow camera access in your browser settings or use the Upload button below.');
        speak('Camera permission denied.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setErrorMessage('No camera device found on this system. Please use the Upload button below.');
        speak('No camera found. Please use upload from device.');
      } else {
        setErrorMessage(`Camera error: ${err.message}. Please use the Upload button below.`);
        speak('Camera unavailable. Please use upload from device.');
      }
      setCameraStatus('error');
    }
  }, [facingMode, stopStream]);

  useEffect(() => {
    startCamera();
    return () => {
      stopStream();
    };
  }, [startCamera, stopStream]);

  // ── Toggle Front / Rear Camera ─────────────────────────────────
  const handleSwitchCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
    speak('Switching camera.');
  };

  // ── Capture Frame to Base64 ────────────────────────────────────
  const handleCaptureClick = () => {
    if (!videoRef.current || cameraStatus !== 'ready') return;

    speak('Image captured.');

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1024;
    canvas.height = video.videoHeight || 768;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Export as JPEG at 0.75 quality (matches existing compression parameters)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
    const base64 = dataUrl.split(',')[1];
    const sizeKB = Math.round((base64.length * 3) / 4 / 1024);

    // Stop stream since we are transitioning to analysis/loading
    stopStream();

    onCapture(base64, sizeKB, dataUrl);
  };

  // ── Secondary File Upload Handler ──────────────────────────────
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      speak('Image selected from device.');
      stopStream();
      onSelectFile(file);
    }
    e.target.value = '';
  };

  return (
    <div className="live-camera-container" aria-live="polite">
      {/* CAMERA PREVIEW BOX */}
      <div className="live-camera-viewbox">
        <video
          ref={videoRef}
          className="live-camera-video"
          playsInline
          autoPlay
          muted
          aria-label="Live camera stream"
        />

        {/* INITIALIZING OVERLAY */}
        {cameraStatus === 'initializing' && (
          <div className="live-camera-overlay">
            <span className="spinner spinner--large" />
            <p className="live-camera-status-text">Starting live camera...</p>
          </div>
        )}

        {/* ERROR OVERLAY */}
        {cameraStatus === 'error' && (
          <div className="live-camera-overlay">
            <div className="live-camera-error-box">
              <h3 className="live-camera-error-title">⚠️ Camera Unavailable</h3>
              <p className="live-camera-error-desc">{errorMessage}</p>
              <button
                type="button"
                className="btn-outline"
                onClick={startCamera}
                style={{ borderColor: '#ef4444', color: '#fca5a5' }}
              >
                🔄 Retry Camera
              </button>
            </div>
          </div>
        )}
      </div>

      {/* TOOLBAR & ACTIONS */}
      <div className="live-camera-toolbar">
        {/* PRIMARY ACTION: GIANT CAPTURE BUTTON */}
        <div className="live-camera-primary-bar">
          {cameraStatus === 'ready' && (
            <button
              type="button"
              className="live-camera-switch-btn"
              onClick={handleSwitchCamera}
              aria-label="Switch between front and rear camera"
            >
              🔄 Switch
            </button>
          )}

          <button
            type="button"
            className="live-camera-capture-btn"
            onClick={handleCaptureClick}
            disabled={cameraStatus !== 'ready'}
            aria-label={`${buttonLabel} button. Tap to capture and analyze immediately.`}
          >
            <span className="live-camera-capture-btn__icon" aria-hidden="true">📸</span>
          </button>
        </div>
        <p style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '1rem' }}>
          {buttonLabel}
        </p>

        {/* SECONDARY ACTION: UPLOAD FROM DEVICE */}
        <div className="live-camera-secondary-box">
          <input
            ref={fileInputRef}
            id="live-camera-upload-input"
            type="file"
            accept="image/*"
            className="live-camera-file-input"
            onChange={handleFileChange}
            aria-label="Select image from device storage"
          />
          <label htmlFor="live-camera-upload-input" className="live-camera-upload-label">
            <span aria-hidden="true">📁</span>
            <span>{secondaryLabel}</span>
          </label>
          <p style={{ fontSize: '1.05rem', color: '#94a3b8', marginTop: '0.5rem' }}>
            For desktop browsers, saved photos, or testing
          </p>
        </div>
      </div>
    </div>
  );
}

export default LiveCameraView;
