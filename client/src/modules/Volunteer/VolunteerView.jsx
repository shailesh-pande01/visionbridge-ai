import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { registerVolunteer, getNearbyRequests, acceptRequest, rejectRequest, completeRequest, sendMessage, getMessages } from '../../services/volunteerService';
import LiveMap from './LiveMap';

const SOCKET_SERVER = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function VolunteerView() {
  const [currentVolunteer, setCurrentVolunteer] = useState(null);
  const [volName, setVolName] = useState('John Doe (Volunteer)');
  const [volPhone, setVolPhone] = useState('+19876543210');
  const [requests, setRequests] = useState([]);
  const [activeRequest, setActiveRequest] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [error, setError] = useState(null);

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);

  // ── 1 · Register/Seed Volunteer Profile on Mount ────────────────
  useEffect(() => {
    registerVolunteer(volName, volPhone, 18.5210, 73.8570)
      .then((vol) => {
        setCurrentVolunteer(vol);
        fetchNearby(vol._id);
      })
      .catch((err) => setError('Failed to initialize volunteer profile: ' + err.message));
  }, [volName, volPhone]);

  const fetchNearby = (volId) => {
    getNearbyRequests(volId)
      .then((data) => {
        setRequests(data);
        // If there's an accepted request already, set it active
        const active = data.find((r) => r.status === 'accepted' && r.volunteer?._id === volId);
        if (active) setActiveRequest(active);
      })
      .catch(() => {});
  };

  // ── 2 · Socket.io Subscription to 'volunteers' room ─────────────
  useEffect(() => {
    if (!currentVolunteer) return;

    socketRef.current = io(SOCKET_SERVER);
    socketRef.current.emit('join_volunteer_room');

    socketRef.current.on('new_help_request', (newReq) => {
      setRequests((prev) => [newReq, ...prev]);
      if ('speechSynthesis' in window) {
        window.speechSynthesis.speak(new SpeechSynthesisUtterance('New volunteer help request received.'));
      }
    });

    socketRef.current.on('request_updated', (updated) => {
      setRequests((prev) => prev.map((r) => (r._id === updated._id ? updated : r)));
      if (activeRequest && activeRequest._id === updated._id) {
        setActiveRequest(updated);
        if (updated.status === 'completed') {
          alert('Assistance was marked completed by the user.');
          setActiveRequest(null);
        }
      }
    });

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, [currentVolunteer, activeRequest]);

  // ── 3 · Socket.io Room for Active Request Chat ──────────────────
  useEffect(() => {
    if (!activeRequest || !activeRequest._id) return;

    const chatSocket = io(SOCKET_SERVER);
    chatSocket.emit('join_request_room', activeRequest._id);

    chatSocket.on('new_message', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    chatSocket.on('request_completed', () => {
      alert('Assistance completed by user.');
      setActiveRequest(null);
      if (currentVolunteer) fetchNearby(currentVolunteer._id);
    });

    getMessages(activeRequest._id).then((data) => setMessages(data)).catch(() => {});

    return () => {
      chatSocket.disconnect();
    };
  }, [activeRequest ? activeRequest._id : null, currentVolunteer]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Handlers ───────────────────────────────────────────────────
  const handleAccept = async (id) => {
    if (!currentVolunteer) return;
    try {
      const updated = await acceptRequest(id, currentVolunteer._id);
      setActiveRequest(updated);
      fetchNearby(currentVolunteer._id);
    } catch (err) {
      alert('Failed to accept request: ' + err.message);
    }
  };

  const handleReject = async (id) => {
    try {
      await rejectRequest(id);
      setRequests((prev) => prev.filter((r) => r._id !== id));
    } catch (err) {
      alert('Failed to reject request: ' + err.message);
    }
  };

  const handleComplete = async () => {
    if (!activeRequest) return;
    try {
      await completeRequest(activeRequest._id);
      setActiveRequest(null);
      if (currentVolunteer) fetchNearby(currentVolunteer._id);
      alert('Assistance successfully marked as completed!');
    } catch (err) {
      alert('Failed to complete request: ' + err.message);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !activeRequest || !currentVolunteer) return;

    try {
      await sendMessage(activeRequest._id, currentVolunteer.name, 'requester', chatInput);
      setChatInput('');
    } catch (err) {
      alert('Failed to send message: ' + err.message);
    }
  };

  const handleCallUser = () => {
    alert('Calling Requester... [Simulated Call]');
  };

  // ───────────────────────────────────────────────────────────────
  if (!currentVolunteer) {
    return (
      <div className="volunteer-card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <h2>Initializing Volunteer Dashboard...</h2>
        {error && <p style={{ color: 'var(--emergency)' }}>{error}</p>}
      </div>
    );
  }

  // Active Assistance View
  if (activeRequest && activeRequest.status === 'accepted') {
    const requesterLoc = activeRequest.currentLocation || { latitude: 18.5204, longitude: 73.8567 };
    const volunteerLoc = currentVolunteer.location || { latitude: 18.5210, longitude: 73.8570 };

    return (
      <div className="volunteer-container" style={{ padding: 0 }}>
        <div className="volunteer-card volunteer-card--highlight">
          <h2 style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--accent)', marginBottom: '0.5rem' }}>
            Active Help Mission
          </h2>
          <p style={{ fontSize: '1.25rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
            Requester: {activeRequest.requester} | Destination: {activeRequest.destination || 'Not specified'}
          </p>
          <div style={{ padding: '1.25rem', background: 'var(--bg-secondary)', borderRadius: '8px', borderLeft: '5px solid var(--accent)', fontSize: '1.35rem', fontWeight: 700, marginBottom: '1.5rem' }}>
            "{activeRequest.helpDescription}"
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button type="button" className="volunteer-btn-giant" style={{ flex: 1, minHeight: '64px', fontSize: '1.2rem' }} onClick={handleCallUser}>
              📞 Call Requester
            </button>
            <button type="button" className="volunteer-btn-giant volunteer-btn-success" style={{ flex: 1, minHeight: '64px', fontSize: '1.2rem' }} onClick={handleComplete}>
              ✓ Mark Completed
            </button>
          </div>
        </div>

        {/* Live Map tracking */}
        <div className="volunteer-card">
          <h3 className="volunteer-card-title">📍 Live Tracking</h3>
          <LiveMap requesterLoc={requesterLoc} volunteerLoc={volunteerLoc} />
        </div>

        {/* Chat UI */}
        <div className="volunteer-chat">
          <div className="volunteer-chat-header">
            <span>💬 Live Chat with Requester</span>
          </div>
          <div className="volunteer-chat-messages">
            {messages.map((m, i) => (
              <div key={i} className={`volunteer-message ${m.sender === currentVolunteer.name ? 'volunteer-message--self' : 'volunteer-message--other'}`}>
                {m.message}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <form onSubmit={handleSendMessage} className="volunteer-chat-input-area">
            <input
              type="text"
              className="volunteer-chat-input"
              placeholder="Type a message to requester..."
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

  // Request List View (Dashboard)
  const activeRequests = requests.filter(r => r.status === 'searching');

  return (
    <div className="volunteer-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', borderBottom: '2px solid var(--border)', paddingBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.6rem', fontWeight: 900 }}>🤝 Volunteer Dashboard</h2>
        <span style={{ fontSize: '1rem', background: 'rgba(34,197,94,0.1)', color: 'var(--success)', padding: '0.4rem 0.8rem', borderRadius: '99px', fontWeight: 700 }}>
          ● Active &amp; Listening
        </span>
      </div>

      {activeRequests.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-muted)' }}>
          <span style={{ fontSize: '3.5rem', display: 'block', marginBottom: '1rem' }}>📡</span>
          <h3 style={{ fontSize: '1.5rem', fontWeight: 800 }}>No Nearby Help Requests</h3>
          <p style={{ fontSize: '1.15rem', marginTop: '0.5rem' }}>When a low-vision user requests help nearby, it will appear here instantly.</p>
        </div>
      ) : (
        <div className="volunteer-request-list">
          {activeRequests.map((req) => (
            <div key={req._id} className="volunteer-request-item">
              <div className="volunteer-request-item__top">
                <span className="volunteer-request-item__requester">User: {req.requester}</span>
                <span className="volunteer-request-item__time">{new Date(req.createdAt).toLocaleTimeString()}</span>
              </div>
              <div className="volunteer-request-item__desc">
                "{req.helpDescription}"
              </div>
              <div className="volunteer-request-item__meta">
                <span>📍 Location: {req.currentLocation?.address || 'Approximate GPS'}</span>
                {req.destination && <span>🎯 Destination: {req.destination}</span>}
              </div>
              <div className="volunteer-request-item__actions">
                <button type="button" className="volunteer-btn-giant volunteer-btn-success" onClick={() => handleAccept(req._id)}>
                  ✓ Accept
                </button>
                <button type="button" className="volunteer-btn-giant volunteer-btn-danger" onClick={() => handleReject(req._id)}>
                  ✕ Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default VolunteerView;
