import React, { useEffect, useState, useContext, useRef, useCallback } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import io from 'socket.io-client';
import WebRTCCall from '../components/WebRTCCall';
import { getAuthHeaders } from '../services/session';
import './VolunteerDashboard.css';

const SOCKET_SERVER = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function VolunteerDashboard() {
  const { user } = useContext(AuthContext);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeCallId, setActiveCallId] = useState(null);
  const socketRef = useRef(null);

  const fetchRequests = useCallback(async () => {
    console.log('🔍 [Volunteer Dashboard] Fetching volunteer requests...');
    try {
      const headers = user?.token
        ? { 'Authorization': `Bearer ${user.token}` }
        : getAuthHeaders();

      const res = await fetch(`${SOCKET_SERVER}/api/volunteer/requests?volunteerId=${user?._id || ''}`, {
        headers,
      });
      const data = await res.json();
      console.log('📡 [Volunteer Dashboard] API response:', data);

      if (res.ok && (data.success || Array.isArray(data))) {
        const list = Array.isArray(data) ? data : (data.data || data.requests || []);
        console.log('📊 [Volunteer Dashboard] Number of requests:', list.length);
        console.log('🔄 [Volunteer Dashboard] Updating request state');
        setRequests(list);
        setError(null);
      } else {
        const errMsg = data.error || `Server returned status ${res.status}`;
        console.error('❌ [Volunteer Dashboard] Failed to fetch requests:', errMsg);
        setError(errMsg);
      }
    } catch (err) {
      console.error('❌ [Volunteer Dashboard] Network error fetching requests:', err);
      setError(err.message || 'Network error fetching requests');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    const socket = io(SOCKET_SERVER);
    socketRef.current = socket;

    socket.emit('join_volunteer_room');

    socket.on('new_help_request', (newReq) => {
      console.log('⚡ [Socket] Real-time new help request received:', newReq);
      setRequests((prev) => {
        if (prev.some((r) => r._id === newReq._id)) return prev;
        return [newReq, ...prev];
      });
    });

    socket.on('request_updated', (updatedReq) => {
      console.log('⚡ [Socket] Real-time request updated:', updatedReq);
      setRequests((prev) => {
        return prev.map((r) => (r._id === updatedReq._id ? updatedReq : r));
      });
    });

    return () => {
      if (socket) socket.disconnect();
    };
  }, []);

  useEffect(() => {
    fetchRequests();
    const interval = setInterval(fetchRequests, 10000);
    return () => clearInterval(interval);
  }, [fetchRequests]);

  const handleAction = async (id, action) => {
    try {
      const authHeaders = user?.token
        ? { 'Authorization': `Bearer ${user.token}` }
        : getAuthHeaders();

      const res = await fetch(`${SOCKET_SERVER}/api/volunteer/request/${id}/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({ volunteerId: user?._id }),
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
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>Welcome, {user?.name || 'Volunteer'}</h1>
            <p>Thank you for helping the VisionBridge community.</p>
          </div>
          <button 
            type="button" 
            className="btn-primary" 
            onClick={fetchRequests} 
            style={{ padding: '0.75rem 1.5rem', fontSize: '1rem', cursor: 'pointer' }}
          >
            🔄 Refresh Requests
          </button>
        </div>
      </div>

      <div className="container">
        {error && (
          <div style={{ padding: '1rem 1.5rem', background: '#2d1515', border: '2px solid #ef4444', borderRadius: '12px', color: '#fca5a5', marginBottom: '1.5rem', fontWeight: 600 }}>
            ⚠️ Error loading requests: {error}
          </div>
        )}

        <div className="requests-section">
          <h2>Help Requests</h2>
          {requests.length === 0 ? (
            <p className="no-requests">No active help requests at this time.</p>
          ) : (
            <div className="requests-list">
              {requests.map((req) => {
                const normalizedStatus = (req.status || '').toLowerCase();
                const isPending = normalizedStatus === 'pending' || normalizedStatus === 'searching';
                const isAcceptedByMe = (normalizedStatus === 'accepted' || normalizedStatus === 'active') && 
                  (req.volunteer?._id === user?._id || req.volunteer === user?._id);

                return (
                  <div key={req._id} className={`request-card ${normalizedStatus}`}>
                    <div className="request-info">
                      <h3>Request from {req.requesterName || req.requester}</h3>
                      <p><strong>Description:</strong> {req.helpDescription}</p>
                      <p>
                        <strong>Location:</strong> {req.currentLocation?.address || (req.currentLocation?.latitude ? `${req.currentLocation.latitude.toFixed(4)}, ${req.currentLocation.longitude.toFixed(4)}` : 'Coordinates shared')}
                      </p>
                      {req.destination && (
                        <p><strong>Destination:</strong> {req.destination}</p>
                      )}
                      {req.createdAt && (
                        <p style={{ fontSize: '0.9rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                          Requested: {new Date(req.createdAt).toLocaleTimeString()} ({new Date(req.createdAt).toLocaleDateString()})
                        </p>
                      )}
                      <p style={{ marginTop: '0.5rem' }}>
                        <strong>Status:</strong> <span className={`status-badge ${normalizedStatus}`}>{req.status?.toUpperCase()}</span>
                      </p>
                    </div>
                    <div className="request-actions">
                      {isPending && (
                        <button 
                          type="button"
                          className="btn-primary"
                          onClick={() => handleAction(req._id, 'accept')}
                        >
                          🤝 Accept Request
                        </button>
                      )}
                      {isAcceptedByMe && (
                        <>
                          <button 
                            type="button"
                            className="btn-primary"
                            style={{ marginRight: '0.5rem' }}
                            onClick={() => startCall(req._id)}
                            disabled={activeCallId === req._id}
                          >
                            📞 Start Call
                          </button>
                          <button 
                            type="button"
                            className="btn-success"
                            onClick={() => handleAction(req._id, 'complete')}
                          >
                            ✓ Mark Completed
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
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default VolunteerDashboard;
