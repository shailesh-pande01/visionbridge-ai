import React, { useState, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import { createHelpRequest, getMessages, sendMessage, completeRequest } from '../../services/volunteerService';
import LiveMap from './LiveMap';

const SOCKET_SERVER = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function speak(text) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  }
}

function UserView() {
  // 'idle' | 'locating' | 'ready' | 'searching' | 'accepted' | 'completed'
  const [status, setStatus] = useState('locating');
  const [location, setLocation] = useState(null);
  const [address, setAddress] = useState('');
  const [destination, setDestination] = useState('');
  const [helpDescription, setHelpDescription] = useState('');
  const [error, setError] = useState(null);
  const [activeRequest, setActiveRequest] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);

  // ── Auto Detect Location on Mount ──────────────────────────────
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setError('Geolocation is not supported by your browser.');
      setStatus('idle');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setLocation({ latitude, longitude });
        setAddress(`Approximate GPS: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
        setStatus('ready');
      },
      () => {
        // Default fallback location if permission denied or timeout
        setLocation({ latitude: 18.5204, longitude: 73.8567 });
        setAddress('Pune, Maharashtra (Fallback Location)');
        setStatus('ready');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  // ── Setup Socket.io when Request is Created ────────────────────
  useEffect(() => {
    if (!activeRequest || !activeRequest._id) return;

    socketRef.current = io(SOCKET_SERVER);
    socketRef.current.emit('join_request_room', activeRequest._id);

    socketRef.current.on('request_accepted', (updatedRequest) => {
      setActiveRequest(updatedRequest);
      setStatus('accepted');
      speak('A volunteer has accepted your request.');
    });

    socketRef.current.on('request_completed', (updatedRequest) => {
      setActiveRequest(updatedRequest);
      setStatus('completed');
      speak('Assistance completed.');
    });

    socketRef.current.on('new_message', (msg) => {
      setMessages((prev) => [...prev, msg]);
      speak(`New message from volunteer: ${msg.message}`);
    });

    socketRef.current.on('location_update', (data) => {
      if (data.role === 'volunteer') {
        setActiveRequest((prev) => ({
          ...prev,
          volunteerLocation: { latitude: data.latitude, longitude: data.longitude }
        }));
      }
    });

    // Fetch any previous messages
    getMessages(activeRequest._id).then(data => setMessages(data)).catch(() => {});

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, [activeRequest ? activeRequest._id : null]);

  // Scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Handlers ───────────────────────────────────────────────────
  const handleRequestSubmit = async (e) => {
    e.preventDefault();
    if (!helpDescription.trim()) {
      setError('Please provide a short description of the help you need.');
      return;
    }

    setStatus('searching');
    setError(null);
    speak('Volunteer request sent.');

    try {
      const reqData = await createHelpRequest(
        `user_${Math.random().toString(36).substr(2, 6)}`,
        location.latitude,
        location.longitude,
        address,
        destination,
        helpDescription
      );
      setActiveRequest(reqData);
    } catch (err) {
      setError(err.message);
      setStatus('ready');
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !activeRequest) return;

    try {
      await sendMessage(activeRequest._id, 'requester', activeRequest.volunteer ? activeRequest.volunteer.name : 'volunteer', chatInput);
      setChatInput('');
    } catch (err) {
      alert('Failed to send message: ' + err.message);
    }
  };

  const handleCompleteAssistance = async () => {
    if (!activeRequest) return;
    try {
      await completeRequest(activeRequest._id);
      setStatus('completed');
      speak('Assistance completed.');
    } catch (err) {
      alert('Failed to complete request: ' + err.message);
    }
  };

  const handleCallVolunteer = () => {
    const phone = activeRequest?.volunteer?.phone || '+1234567890';
    alert(`Calling Volunteer (${phone})... [Simulated Call]`);
  };

  const handlePresetClick = (text) => {
    setHelpDescription(text);
  };

  // ───────────────────────────────────────────────────────────────
  if (status === 'locating') {
    return (
      <div className="volunteer-card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <h2 style={{ fontSize: '1.75rem', fontWeight: 800 }}>📍 Detecting Your Location...</h2>
        <p style={{ fontSize: '1.25rem', color: 'var(--text-muted)', marginTop: '1rem' }}>Please allow location permissions.</p>
      </div>
    );
  }

  if (status === 'searching') {
    return (
      <div className="volunteer-status-banner" aria-live="polite">
        <span className="volunteer-status-banner__icon" aria-hidden="true">⏳</span>
        <h2 className="volunteer-status-banner__title">Waiting for a Volunteer</h2>
        <p className="volunteer-status-banner__desc">
          Your request has been broadcast to nearby verified volunteers.
          We will notify you aloud as soon as someone accepts.
        </p>
        <button
          type="button"
          className="volunteer-btn-giant volunteer-btn-danger"
          style={{ marginTop: '1.5rem', minHeight: '64px', fontSize: '1.2rem' }}
          onClick={() => { setStatus('ready'); setActiveRequest(null); }}
        >
          ✕ Cancel Request
        </button>
      </div>
    );
  }

  if (status === 'accepted') {
    const vol = activeRequest?.volunteer || { name: 'Verified Volunteer', phone: '+1234567890' };
    const volunteerLoc = activeRequest?.volunteerLocation || (activeRequest?.volunteer?.location) || { latitude: location.latitude + 0.002, longitude: location.longitude + 0.002 };

    return (
      <div className="volunteer-container" style={{ padding: 0 }}>
        {/* Accepted Banner */}
        <div className="volunteer-card volunteer-card--highlight">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
            <span style={{ fontSize: '3rem' }}>🤝</span>
            <div>
              <h2 style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--accent)' }}>{vol.name} Accepted Your Request</h2>
              <p style={{ fontSize: '1.25rem', color: 'var(--text-muted)' }}>Phone: {vol.phone}</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button type="button" className="volunteer-btn-giant" style={{ flex: 1, minHeight: '68px', fontSize: '1.3rem' }} onClick={handleCallVolunteer}>
              📞 Call Volunteer
            </button>
            <button type="button" className="volunteer-btn-giant volunteer-btn-success" style={{ flex: 1, minHeight: '68px', fontSize: '1.3rem' }} onClick={handleCompleteAssistance}>
              ✓ Mark Completed
            </button>
          </div>
        </div>

        {/* Live Map Tracking */}
        <div className="volunteer-card">
          <h3 className="volunteer-card-title">📍 Live Tracking</h3>
          <LiveMap requesterLoc={location} volunteerLoc={volunteerLoc} />
        </div>

        {/* Chat UI */}
        <div className="volunteer-chat">
          <div className="volunteer-chat-header">
            <span>💬 Live Chat with {vol.name}</span>
          </div>
          <div className="volunteer-chat-messages">
            {messages.map((m, i) => (
              <div key={i} className={`volunteer-message ${m.sender === 'requester' ? 'volunteer-message--self' : 'volunteer-message--other'}`}>
                {m.message}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <form onSubmit={handleSendMessage} className="volunteer-chat-input-area">
            <input
              type="text"
              className="volunteer-chat-input"
              placeholder="Type a message..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              aria-label="Chat message input"
            />
            <button type="submit" className="volunteer-chat-send-btn">Send</button>
          </form>
        </div>
      </div>
    );
  }

  if (status === 'completed') {
    return (
      <div className="volunteer-status-banner" style={{ borderColor: 'var(--success)' }}>
        <span className="volunteer-status-banner__icon" aria-hidden="true">🎉</span>
        <h2 className="volunteer-status-banner__title">Assistance Completed</h2>
        <p className="volunteer-status-banner__desc">
          Thank you for using the VisionBridge Volunteer Help Network. We are glad you reached your destination safely!
        </p>
        <button
          type="button"
          className="volunteer-btn-giant volunteer-btn-success"
          style={{ marginTop: '1.5rem' }}
          onClick={() => { setStatus('ready'); setActiveRequest(null); setHelpDescription(''); setDestination(''); }}
        >
          🔄 Request Help Again
        </button>
      </div>
    );
  }

  // default: 'ready' / creation form
  return (
    <div className="volunteer-card">
      <h2 className="volunteer-card-title">🚨 Request Human Assistance</h2>
      
      {error && (
        <div style={{ padding: '1rem', background: 'rgba(239,68,68,0.2)', border: '2px solid var(--emergency)', borderRadius: 'var(--radius)', marginBottom: '1.5rem', fontWeight: 700, color: '#ff7070' }}>
          ⚠️ {error}
        </div>
      )}

      <form onSubmit={handleRequestSubmit}>
        {/* Current Location Display */}
        <div className="volunteer-form-group">
          <label className="volunteer-label">📍 Your Current Location</label>
          <input
            type="text"
            className="volunteer-input"
            value={address}
            readOnly
            aria-label="Your Current Location"
          />
        </div>

        {/* Destination (Optional) */}
        <div className="volunteer-form-group">
          <label className="volunteer-label">🎯 Destination (Optional)</label>
          <input
            type="text"
            className="volunteer-input"
            placeholder="e.g. City Hospital, Bus Stop #4"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            aria-label="Destination"
          />
        </div>

        {/* Help Description */}
        <div className="volunteer-form-group">
          <label className="volunteer-label">🗣️ How Can We Help You?</label>
          <textarea
            className="volunteer-textarea"
            placeholder="Describe what you need help with..."
            value={helpDescription}
            onChange={(e) => setHelpDescription(e.target.value)}
            aria-label="Help Description"
          />
          <div className="volunteer-presets">
            <button type="button" className="volunteer-preset-btn" onClick={() => handlePresetClick('Help me reach the bus stop.')}>
              🚌 Reach Bus Stop
            </button>
            <button type="button" className="volunteer-preset-btn" onClick={() => handlePresetClick('I cannot find the hospital entrance.')}>
              🏥 Hospital Entrance
            </button>
            <button type="button" className="volunteer-preset-btn" onClick={() => handlePresetClick('Guide me to the grocery store.')}>
              🛒 Grocery Store
            </button>
          </div>
        </div>

        <button type="submit" className="volunteer-btn-giant" style={{ marginTop: '2rem' }}>
          <span aria-hidden="true">🤝</span> Request Volunteer
        </button>
      </form>
    </div>
  );
}

export default UserView;
