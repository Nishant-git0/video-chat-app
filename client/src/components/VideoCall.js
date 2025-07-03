import React, { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import './VideoCall.css';

const VideoCall = ({ roomId, userName, onLeaveRoom }) => {
  const localVideoRef = useRef();
  const socketRef = useRef();
  const localStreamRef = useRef();
  const peerConnectionsRef = useRef(new Map());
  
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [connectedUsers, setConnectedUsers] = useState([]);
  const [roomInfo, setRoomInfo] = useState({ totalUsers: 1, users: [] });
  const [mediaError, setMediaError] = useState(null);
  const [isMediaReady, setIsMediaReady] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('Initializing...');

  // Get media stream
  const getMediaStream = async () => {
    try {
      setConnectionStatus('Requesting camera access...');
      
      const constraints = {
        video: {
          width: { min: 320, ideal: 640, max: 1280 },
          height: { min: 240, ideal: 480, max: 720 },
          facingMode: 'user'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('Got media stream:', stream);
      console.log('Video tracks:', stream.getVideoTracks().length);
      console.log('Audio tracks:', stream.getAudioTracks().length);
      return stream;
    } catch (error) {
      console.error('Media error:', error);
      throw error;
    }
  };

  // Initialize everything
  useEffect(() => {
    let mounted = true;
    
    const initialize = async () => {
      try {
        // Get media
        setConnectionStatus('Getting camera access...');
        const stream = await getMediaStream();
        
        if (!mounted) return;
        
        localStreamRef.current = stream;
        
        // Set up local video
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.onloadedmetadata = () => {
            setIsMediaReady(true);
            setConnectionStatus('Camera ready');
          };
          
          // Handle video errors
          localVideoRef.current.onerror = (error) => {
            console.error('Local video error:', error);
          };
        }
        
        // Connect to server
        setConnectionStatus('Connecting to server...');
        initializeSocket();
        
        setMediaError(null);
      } catch (error) {
        console.error('Initialization error:', error);
        setMediaError(error.message);
        setConnectionStatus('Failed to initialize');
        
        // Show user-friendly error message
        let errorMessage = 'Camera access failed. ';
        if (error.name === 'NotAllowedError') {
          errorMessage += 'Please allow camera and microphone access.';
        } else if (error.name === 'NotFoundError') {
          errorMessage += 'No camera or microphone found.';
        } else {
          errorMessage += error.message;
        }
        setMediaError(errorMessage);
      }
    };
    
    initialize();
    
    return () => {
      mounted = false;
      cleanup();
    };
  }, []);

  const initializeSocket = () => {
    // Determine server URL based on environment
    const getServerUrl = () => {
      if (process.env.NODE_ENV === 'production') {
        // In production, use the same domain
        return window.location.origin;
      } else {
        // In development, use localhost
        return 'http://localhost:5000';
      }
    };
    
    const serverUrl = getServerUrl();
    console.log('Connecting to:', serverUrl);
    console.log('Environment:', process.env.NODE_ENV);
    
    socketRef.current = io(serverUrl, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      forceNew: true
    });
    
    socketRef.current.on('connect', () => {
      console.log('Connected to server');
      setConnectionStatus('Connected to server');
      socketRef.current.emit('join-room', { roomId, userName });
    });
    
    socketRef.current.on('existing-users', (users) => {
      console.log('Existing users:', users);
      if (users.length > 0) {
        setConnectionStatus(`Found ${users.length} user${users.length > 1 ? 's' : ''} in room`);
        users.forEach((user, index) => {
          setTimeout(() => createPeerConnection(user.userId, user.userName, true), 1000 + (index * 500));
        });
      } else {
        setConnectionStatus('Waiting for others to join...');
      }
    });
    
    socketRef.current.on('user-joined', (data) => {
      console.log('User joined:', data);
      setConnectionStatus(`${data.userName} joined the room`);
      createPeerConnection(data.userId, data.userName, false);
    });
    
    socketRef.current.on('user-left', (data) => {
      console.log('User left:', data);
      setConnectionStatus(`${data.userName} left the room`);
      removePeerConnection(data.userId);
    });
    
    socketRef.current.on('room-info', (info) => {
      console.log('Room info:', info);
      setRoomInfo(info);
    });
    
    socketRef.current.on('offer', handleOffer);
    socketRef.current.on('answer', handleAnswer);
    socketRef.current.on('ice-candidate', handleIceCandidate);
    
    socketRef.current.on('disconnect', () => {
      console.log('Disconnected from server');
      setConnectionStatus('Disconnected from server');
    });
    
    socketRef.current.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      setConnectionStatus('Connection failed - retrying...');
    });
    
    socketRef.current.on('reconnect', () => {
      console.log('Reconnected to server');
      setConnectionStatus('Reconnected to server');
      // Rejoin the room
      socketRef.current.emit('join-room', { roomId, userName });
    });
  };

  const createPeerConnection = (userId, userNameParam, shouldCreateOffer) => {
    console.log(`Creating peer connection for ${userNameParam} (${userId})`);
    
    const config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ],
      iceCandidatePoolSize: 10
    };
    
    const peerConnection = new RTCPeerConnection(config);
    peerConnectionsRef.current.set(userId, peerConnection);
    
    // Add local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        console.log(`Adding ${track.kind} track to peer connection`);
        peerConnection.addTrack(track, localStreamRef.current);
      });
    }
    
    // Handle remote stream
    peerConnection.ontrack = (event) => {
      console.log('Got remote stream from:', userNameParam);
      const remoteStream = event.streams[0];
      
      if (remoteStream) {
        setConnectedUsers(prev => {
          const filtered = prev.filter(user => user.userId !== userId);
          return [...filtered, {
            userId,
            userName: userNameParam,
            stream: remoteStream
          }];
        });
        
        setConnectionStatus(`Connected to ${userNameParam}`);
      }
    };
    
    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        console.log('Sending ICE candidate to:', userNameParam);
        socketRef.current.emit('ice-candidate', {
          targetUserId: userId,
          candidate: event.candidate,
          roomId
        });
      }
    };
    
    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;
      console.log(`Connection state with ${userNameParam}:`, state);
      
      if (state === 'connected') {
        setConnectionStatus(`Video call active with ${userNameParam}`);
      } else if (state === 'disconnected' || state === 'failed') {
        setConnectionStatus(`Connection lost with ${userNameParam}`);
        // Attempt to reconnect after a delay
        setTimeout(() => {
          if (peerConnectionsRef.current.has(userId)) {
            console.log(`Attempting to reconnect to ${userNameParam}`);
            createPeerConnection(userId, userNameParam, true);
          }
        }, 3000);
      }
    };
    
    // Handle ICE connection state changes
    peerConnection.oniceconnectionstatechange = () => {
      console.log(`ICE connection state with ${userNameParam}:`, peerConnection.iceConnectionState);
    };
    
    // Create offer if needed
    if (shouldCreateOffer) {
      setTimeout(() => createOffer(userId), 2000);
    }
  };

  const createOffer = async (targetUserId) => {
    try {
      const peerConnection = peerConnectionsRef.current.get(targetUserId);
      if (!peerConnection) {
        console.error('Peer connection not found for:', targetUserId);
        return;
      }
      
      console.log('Creating offer for:', targetUserId);
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      
      await peerConnection.setLocalDescription(offer);
      
      socketRef.current.emit('offer', {
        targetUserId,
        offer,
        roomId
      });
      
      console.log('Offer sent to:', targetUserId);
    } catch (error) {
      console.error('Error creating offer:', error);
    }
  };

  const handleOffer = async (data) => {
    try {
      const { senderId, offer, senderName } = data;
      console.log('Handling offer from:', senderName);
      
      if (!peerConnectionsRef.current.has(senderId)) {
        createPeerConnection(senderId, senderName, false);
      }
      
      const peerConnection = peerConnectionsRef.current.get(senderId);
      if (!peerConnection) {
        console.error('Peer connection not found for offer from:', senderName);
        return;
      }
      
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      
      socketRef.current.emit('answer', {
        targetUserId: senderId,
        answer,
        roomId
      });
      
      console.log('Answer sent to:', senderName);
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  };

  const handleAnswer = async (data) => {
    try {
      const { senderId, answer, senderName } = data;
      console.log('Handling answer from:', senderName);
      
      const peerConnection = peerConnectionsRef.current.get(senderId);
      if (peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        console.log('Answer processed from:', senderName);
      } else {
        console.error('Peer connection not found for answer from:', senderName);
      }
    } catch (error) {
      console.error('Error handling answer:', error);
    }
  };

  const handleIceCandidate = async (data) => {
    try {
      const { senderId, candidate } = data;
      const peerConnection = peerConnectionsRef.current.get(senderId);
      
      if (peerConnection && candidate) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('ICE candidate added from:', senderId);
      }
    } catch (error) {
      console.error('Error handling ICE candidate:', error);
    }
  };

  const removePeerConnection = (userId) => {
    console.log('Removing peer connection for:', userId);
    
    const peerConnection = peerConnectionsRef.current.get(userId);
    if (peerConnection) {
      peerConnection.close();
      peerConnectionsRef.current.delete(userId);
    }
    
    setConnectedUsers(prev => prev.filter(user => user.userId !== userId));
    
    // Update status if no users left
    setConnectedUsers(prev => {
      const filtered = prev.filter(user => user.userId !== userId);
      if (filtered.length === 0) {
        setConnectionStatus('Waiting for others to join...');
      }
      return filtered;
    });
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
        
        // Notify other users about media state change
        if (socketRef.current) {
          socketRef.current.emit('media-state-change', {
            roomId,
            isVideoEnabled: videoTrack.enabled,
            isAudioEnabled
          });
        }
        
        console.log('Video toggled:', videoTrack.enabled);
      }
    }
  };

  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
        
        // Notify other users about media state change
        if (socketRef.current) {
          socketRef.current.emit('media-state-change', {
            roomId,
            isVideoEnabled,
            isAudioEnabled: audioTrack.enabled
          });
        }
        
        console.log('Audio toggled:', audioTrack.enabled);
      }
    }
  };

  const cleanup = () => {
    console.log('Cleaning up video call...');
    
    // Stop local media tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log(`Stopped ${track.kind} track`);
      });
      localStreamRef.current = null;
    }
    
    // Close all peer connections
    peerConnectionsRef.current.forEach((pc, userId) => {
      console.log('Closing peer connection for:', userId);
      pc.close();
    });
    peerConnectionsRef.current.clear();
    
    // Disconnect socket
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    
    // Clear state
    setConnectedUsers([]);
    setIsMediaReady(false);
    setConnectionStatus('Disconnected');
  };

  const handleLeaveRoom = () => {
    cleanup();
    onLeaveRoom();
  };

  return (
    <div className="video-call-container">
      <div className="video-header">
        <h2>Room: {roomId}</h2>
        <span className="user-name">{userName}</span>
        <span className={`connection-status ${
          connectionStatus.includes('Connected') || connectionStatus.includes('active') 
            ? 'connected' 
            : connectionStatus.includes('failed') || connectionStatus.includes('lost')
            ? 'error'
            : 'waiting'
        }`}>
          {connectionStatus}
        </span>
        <span className="room-info">
          {roomInfo.totalUsers} user{roomInfo.totalUsers !== 1 ? 's' : ''} in room
        </span>
      </div>
      
      {mediaError && (
        <div className="error-message">
          <p>⚠️ {mediaError}</p>
          <div className="error-actions">
            <button onClick={() => window.location.reload()} className="retry-btn">
              🔄 Try Again
            </button>
            <button onClick={handleLeaveRoom} className="leave-btn">
              ← Back to Join
            </button>
          </div>
        </div>
      )}
      
      <div className="videos-grid">
        {/* Local video */}
        <div className="video-wrapper local-video">
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="video"
          />
          <div className="video-label">{userName} (You)</div>
          <div className="video-controls-overlay">
            {!isVideoEnabled && <span className="muted-indicator">📹❌</span>}
            {!isAudioEnabled && <span className="muted-indicator">🎤❌</span>}
          </div>
          <div className="video-status">
            {isMediaReady ? '✅ Ready' : '⏳ Loading...'}
          </div>
        </div>
        
        {/* Remote videos */}
        {connectedUsers.map((user) => (
          <div key={user.userId} className="video-wrapper remote-video">
            <RemoteVideo user={user} />
            <div className="video-label">{user.userName}</div>
            <div className="video-status">✅ Connected</div>
          </div>
        ))}
        
        {/* Placeholder for empty slots */}
        {connectedUsers.length === 0 && isMediaReady && !mediaError && (
          <div className="video-wrapper empty-slot">
            <div className="empty-message">
              <div className="empty-icon">👥</div>
              <p>Waiting for others to join...</p>
              <p className="room-id-display">
                Share Room ID: <strong>{roomId}</strong>
              </p>
              <div className="share-options">
                <button 
                  onClick={() => {
                    const url = window.location.href;
                    if (navigator.clipboard) {
                      navigator.clipboard.writeText(`Join my video call: ${url}`);
                      alert('Link copied to clipboard!');
                    } else {
                      alert(`Share this link: ${url}`);
                    }
                  }}
                  className="share-btn"
                >
                  📋 Copy Link
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Loading state */}
        {!isMediaReady && !mediaError && (
          <div className="video-wrapper loading-slot">
            <div className="loading-message">
              <div className="loading-spinner">⏳</div>
              <p>Setting up your camera...</p>
              <p className="loading-status">{connectionStatus}</p>
            </div>
          </div>
        )}
      </div>
      
      <div className="controls">
        <button
          onClick={toggleVideo}
          className={`control-btn ${isVideoEnabled ? 'active' : 'inactive'}`}
          title={isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
          disabled={!isMediaReady}
        >
          {isVideoEnabled ? '📹' : '📹❌'}
          <span className="control-label">Camera</span>
        </button>
        
        <button
          onClick={toggleAudio}
          className={`control-btn ${isAudioEnabled ? 'active' : 'inactive'}`}
          title={isAudioEnabled ? 'Mute microphone' : 'Unmute microphone'}
          disabled={!isMediaReady}
        >
          {isAudioEnabled ? '🎤' : '🎤❌'}
          <span className="control-label">Microphone</span>
        </button>
        
        <button 
          onClick={handleLeaveRoom} 
          className="control-btn leave-btn"
          title="Leave room"
        >
          📞❌
          <span className="control-label">Leave</span>
        </button>
        
        {/* Additional controls */}
        <button
          onClick={() => {
            const url = window.location.href;
            if (navigator.clipboard) {
              navigator.clipboard.writeText(url);
              alert('Room link copied!');
            } else {
              alert(`Share this link: ${url}`);
            }
          }}
          className="control-btn share-btn"
          title="Share room link"
        >
          🔗
          <span className="control-label">Share</span>
        </button>
      </div>
      
      {/* Debug info (only in development) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="debug-info">
          <details>
            <summary>🔧 Debug Info</summary>
            <div className="debug-content">
              <p><strong>Environment:</strong> {process.env.NODE_ENV || 'development'}</p>
              <p><strong>Server URL:</strong> {
                process.env.NODE_ENV === 'production' 
                  ? window.location.origin 
                  : 'http://localhost:5000'
              }</p>
              <p><strong>Room ID:</strong> {roomId}</p>
              <p><strong>User Name:</strong> {userName}</p>
              <p><strong>Connected Users:</strong> {connectedUsers.length}</p>
              <p><strong>Media Ready:</strong> {isMediaReady ? 'Yes' : 'No'}</p>
              <p><strong>Video Enabled:</strong> {isVideoEnabled ? 'Yes' : 'No'}</p>
              <p><strong>Audio Enabled:</strong> {isAudioEnabled ? 'Yes' : 'No'}</p>
              <p><strong>Socket Connected:</strong> {socketRef.current?.connected ? 'Yes' : 'No'}</p>
            </div>
          </details>
        </div>
      )}
    </div>
  );
};

// Enhanced Remote Video Component
const RemoteVideo = ({ user }) => {
  const videoRef = useRef();
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  
  useEffect(() => {
    const videoElement = videoRef.current;
    
    if (videoElement && user.stream) {
      console.log('Setting remote video stream for:', user.userName);
      
      // Reset states
      setIsLoading(true);
      setHasError(false);
      
      // Set the stream
      videoElement.srcObject = user.stream;
      
      const handleLoadedMetadata = () => {
        console.log('Remote video loaded for:', user.userName);
        setIsLoading(false);
      };
      
      const handleError = (error) => {
        console.error('Remote video error for:', user.userName, error);
        setHasError(true);
        setIsLoading(false);
      };
      
      const handleLoadStart = () => {
        setIsLoading(true);
      };
      
      // Add event listeners
      videoElement.addEventListener('loadedmetadata', handleLoadedMetadata);
      videoElement.addEventListener('error', handleError);
      videoElement.addEventListener('loadstart', handleLoadStart);
      
      // Force play (required for some browsers)
      videoElement.play().catch(e => {
        console.log('Auto-play prevented for remote video:', e);
      });
      
      // Cleanup function
      return () => {
        if (videoElement) {
          videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
          videoElement.removeEventListener('error', handleError);
          videoElement.removeEventListener('loadstart', handleLoadStart);
          videoElement.srcObject = null;
        }
      };
    }
  }, [user.stream, user.userName]);
  
  return (
    <div className="remote-video-container">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="video"
      />
      {isLoading && (
        <div className="video-loading-overlay">
          <div className="loading-spinner">⏳</div>
          <p>Loading {user.userName}'s video...</p>
        </div>
      )}
      {hasError && (
        <div className="video-error-overlay">
          <div className="error-icon">⚠️</div>
          <p>Video error for {user.userName}</p>
        </div>
      )}
    </div>
  );
};

export default VideoCall;