import React, { useEffect, useState, useContext, useRef } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import io from 'socket.io-client';
import WebRTCCall from '../components/WebRTCCall';
import './VolunteerDashboard.css';

const SOCKET_SERVER = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function VolunteerDashboard() {
  const { user } = useContext(AuthContext);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCallId, setActiveCallId] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    socketRef.current = io(SOCKET_SERVER);
    socketRef.current.emit('join_volunteer_room');

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  useEffect(() => {
    fetchRequests();
    const interval = setInterval(fetchRequests, 10000);
    return () => clearInterval(interval);
  }, [user]);

  const fetchRequests = async () => {
    try {
      const res = await fetch(`${SOCKET_SERVER}/api/volunteer/requests?volunteerId=${user._id}`);
      const data = await res.json();
      if (data.success) {
        setRequests(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch requests', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (id, action) => {
    try {
      const res = await fetch(`${SOCKET_SERVER}/api/volunteer/request/${id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ volunteerId: user._id }),
      });
      if (res.ok) {
        fetchRequests();
      }
    } catch (err) {
      console.error(`Failed to ${action} request`, err);
    }
  };

  const startCall = (reqId) => {
    if (socketRef.current) {
      socketRef.current.emit('join_request_room', reqId);
    }
    setActiveCallId(reqId);
  };

  if (loading) return <div className="loading">Loading Dashboard...</div>;

  return (
    <div className="volunteer-dashboard">
      <div className="dashboard-header">
        <div className="container">
          <h1>Welcome, {user.name}</h1>
          <p>Thank you for helping the VisionBridge community.</p>
        </div>
      </div>

      <div className="container">
        <div className="requests-section">
          <h2>Help Requests</h2>
          {requests.length === 0 ? (
            <p className="no-requests">No active help requests at this time.</p>
          ) : (
            <div className="requests-list">
              {requests.map(req => (
                <div key={req._id} className={`request-card ${req.status}`}>
                  <div className="request-info">
                    <h3>Request from {req.requester}</h3>
                    <p><strong>Description:</strong> {req.helpDescription}</p>
                    <p><strong>Status:</strong> <span className={`status-badge ${req.status}`}>{req.status.toUpperCase()}</span></p>
                  </div>
                  <div className="request-actions">
                    {req.status === 'searching' && (
                      <button 
                        className="btn-primary"
                        onClick={() => handleAction(req._id, 'accept')}
                      >
                        Accept Request
                      </button>
                    )}
                    {req.status === 'accepted' && req.volunteer?._id === user._id && (
                      <>
                        <button 
                          className="btn-primary"
                          style={{ marginRight: '0.5rem' }}
                          onClick={() => startCall(req._id)}
                          disabled={activeCallId === req._id}
                        >
                          📞 Start Call
                        </button>
                        <button 
                          className="btn-success"
                          onClick={() => handleAction(req._id, 'complete')}
                        >
                          Mark Completed
                        </button>
                      </>
                    )}
                  </div>
                  {activeCallId === req._id && (
                    <div className="call-container" style={{ marginTop: '1rem', width: '100%' }}>
                      <WebRTCCall 
                        socket={socketRef.current} 
                        roomId={req._id} 
                        isVolunteer={true} 
                        onEndCall={() => setActiveCallId(null)} 
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default VolunteerDashboard;
