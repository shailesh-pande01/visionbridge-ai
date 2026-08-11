import React, { useEffect, useRef, useState } from 'react';
import './WebRTCCall.css';

// ICE servers for WebRTC (STUN servers)
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

function WebRTCCall({ socket, roomId, isVolunteer, onEndCall }) {
  const [callStatus, setCallStatus] = useState('Connecting...');
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);

  const localStreamRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const remoteStreamObjRef = useRef(new MediaStream());
  const hasCreatedOfferRef = useRef(false);

  // We only speak status changes if not volunteer (low-vision user needs voice feedback)
  const speakStatus = (text) => {
    if (!isVolunteer && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      window.speechSynthesis.speak(utterance);
    }
  };

  useEffect(() => {
    if (!socket || !roomId) return;

    let isMounted = true;

    const initCall = async () => {
      try {
        setCallStatus('Requesting permissions...');
        speakStatus('Requesting microphone and camera permissions for the call.');

        // Volunteer only needs audio. User needs audio + video.
        const constraints = {
          audio: true,
          video: isVolunteer ? false : { facingMode: 'environment' }
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (!isMounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        localStreamRef.current = stream;

        // Display local stream if user (optional small preview)
        if (!isVolunteer && localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        setupPeerConnection();

        if (isVolunteer) {
          setCallStatus('Waiting for User to connect...');
        } else {
          setCallStatus('Waiting for volunteer to connect...');
          speakStatus('Waiting for volunteer to connect the call.');
        }

        // Ping the other peer to check if they are ready
        socket.emit('call:ping', { roomId });

      } catch (err) {
        console.error('Media access error:', err);
        setError('Could not access microphone or camera. Please check permissions.');
        speakStatus('Could not access microphone or camera. Please check permissions.');
      }
    };

    initCall();

    return () => {
      isMounted = false;
      cleanupCall();
    };
  }, [socket, roomId, isVolunteer]);

  const setupPeerConnection = () => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnectionRef.current = pc;

    // Volunteer only sends audio, but MUST explicitly tell the RTCPeerConnection
    // that it wants to receive video. Otherwise, the SDP offer will not contain
    // a video section, and the user's browser will not send video.
    if (isVolunteer) {
      pc.addTransceiver('video', { direction: 'recvonly' });
    }

    // Add local tracks to peer connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // Handle remote tracks
    pc.ontrack = (event) => {
      console.log('Received remote track:', event.track.kind);
      
      // Accumulate received tracks into a single stream
      remoteStreamObjRef.current.addTrack(event.track);

      if (isVolunteer) {
        // Volunteer displays user's video+audio
        if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== remoteStreamObjRef.current) {
          remoteVideoRef.current.srcObject = remoteStreamObjRef.current;
          setCallStatus('Connected to User');
        }
      } else {
        // User only needs to play volunteer's audio
        if (remoteAudioRef.current && remoteAudioRef.current.srcObject !== remoteStreamObjRef.current) {
          remoteAudioRef.current.srcObject = remoteStreamObjRef.current;
          setCallStatus('Connected to Volunteer');
          speakStatus('Call connected. You can now speak to the volunteer.');
        }
      }
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('call:ice-candidate', {
          roomId,
          candidate: event.candidate,
        });
      }
    };

    // Ping/Pong handshake to avoid race conditions
    socket.on('call:ping', () => {
      socket.emit('call:pong', { roomId });
      if (isVolunteer) createOffer();
    });

    socket.on('call:pong', () => {
      if (isVolunteer) createOffer();
    });

    // Socket listeners for signaling
    socket.on('call:offer', async (offer) => {
      if (!pc || pc.signalingState === 'closed') return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('call:answer', { roomId, answer });
        setCallStatus('Connected');
      } catch (err) {
        console.error('Error handling offer:', err);
      }
    });

    socket.on('call:answer', async (answer) => {
      if (!pc || pc.signalingState === 'closed') return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        setCallStatus('Connected');
      } catch (err) {
        console.error('Error handling answer:', err);
      }
    });

    socket.on('call:ice-candidate', async (candidate) => {
      if (!pc || pc.signalingState === 'closed') return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('Error adding ice candidate:', err);
      }
    });

    socket.on('call:ended', () => {
      cleanupCall();
      if (onEndCall) onEndCall(true); // true means remote ended
    });
  };

  const createOffer = async () => {
    if (hasCreatedOfferRef.current) return;
    hasCreatedOfferRef.current = true;
    
    const pc = peerConnectionRef.current;
    if (!pc) return;
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('call:offer', { roomId, offer });
    } catch (err) {
      console.error('Error creating offer:', err);
    }
  };

  const cleanupCall = () => {
    // Stop local media
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    // Remove socket listeners
    if (socket) {
      socket.off('call:ping');
      socket.off('call:pong');
      socket.off('call:offer');
      socket.off('call:answer');
      socket.off('call:ice-candidate');
      socket.off('call:ended');
    }
  };

  const handleEndCall = () => {
    socket.emit('call:ended', { roomId });
    speakStatus('Call ended.');
    cleanupCall();
    if (onEndCall) onEndCall(false); // false means local ended
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      if (audioTracks.length > 0) {
        const isCurrentlyMuted = !audioTracks[0].enabled;
        audioTracks[0].enabled = isCurrentlyMuted;
        setIsMuted(!isCurrentlyMuted);
        speakStatus(!isCurrentlyMuted ? 'Microphone muted.' : 'Microphone unmuted.');
      }
    }
  };

  if (error) {
    return (
      <div className="webrtc-call webrtc-call--error">
        <p>{error}</p>
        <button onClick={handleEndCall} className="webrtc-btn webrtc-btn--danger">Close</button>
      </div>
    );
  }

  return (
    <div className={`webrtc-call ${isVolunteer ? 'webrtc-call--volunteer' : 'webrtc-call--user'}`}>
      <div className="webrtc-header">
        <span className="webrtc-status">{callStatus}</span>
      </div>

      <div className="webrtc-media-container">
        {isVolunteer ? (
          // Volunteer sees User's video
          <div className="webrtc-remote-video-wrapper">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="webrtc-remote-video"
            />
          </div>
        ) : (
          // User doesn't need to see Volunteer. They play audio only. 
          // Small local preview for user confidence.
          <div className="webrtc-user-view">
            <audio ref={remoteAudioRef} autoPlay />
            <div className="webrtc-local-video-wrapper">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="webrtc-local-video"
              />
              <span className="webrtc-local-label">Your Camera (Shared)</span>
            </div>
          </div>
        )}
      </div>

      <div className="webrtc-controls">
        <button
          onClick={toggleMute}
          className={`webrtc-btn webrtc-btn--mute ${isMuted ? 'muted' : ''}`}
          aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
        >
          🎤 {isMuted ? 'Unmute' : 'Mute'}
        </button>
        <button
          onClick={handleEndCall}
          className="webrtc-btn webrtc-btn--danger"
          aria-label="End call"
        >
          📞 End Call
        </button>
      </div>
    </div>
  );
}

export default WebRTCCall;
