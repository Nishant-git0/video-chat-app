import React, { useState, useEffect } from 'react';
import './JoinRoom.css';

const JoinRoom = ({ onJoinRoom }) => {
  const [roomId, setRoomId] = useState('');
  const [userName, setUserName] = useState('');
  const [testing, setTesting] = useState(false);
  const [browserSupport, setBrowserSupport] = useState({});

  // Check browser support
  useEffect(() => {
    const checkSupport = () => {
      const support = {
        getUserMedia: !!(navigator.mediaDevices?.getUserMedia),
        webRTC: !!window.RTCPeerConnection,
        isLocalhost: window.location.hostname === 'localhost',
        browser: getBrowserName()
      };
      
      setBrowserSupport(support);
      console.log('Browser support check:', support);
    };
    
    checkSupport();
  }, []);

  const getBrowserName = () => {
    const userAgent = navigator.userAgent;
    if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'Safari';
    if (userAgent.includes('Edg')) return 'Edge';
    return 'Unknown';
  };

  const testCamera = async () => {
    setTesting(true);
    try {
      console.log('Starting camera test...');
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      });
      
      console.log('Camera test successful:', stream);
      alert('✅ Camera and microphone work perfectly!');
      
      // Stop the test stream
      stream.getTracks().forEach(track => track.stop());
      
    } catch (error) {
      console.error('Camera test failed:', error);
      
      let errorMessage = '❌ Camera test failed:\n\n';
      
      if (error.name === 'NotAllowedError') {
        errorMessage += 'Please click "Allow" when prompted for camera access.';
      } else if (error.name === 'NotFoundError') {
        errorMessage += 'No camera or microphone found. Please check your devices.';
      } else {
        errorMessage += error.message;
      }
      
      alert(errorMessage);
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!roomId.trim() || !userName.trim()) {
      alert('Please enter both your name and room ID');
      return;
    }

    console.log('Joining room:', roomId, 'as:', userName);
    onJoinRoom(roomId.trim(), userName.trim());
  };

  const generateRoomId = () => {
    const randomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    setRoomId(randomId);
  };

  const clearRoomId = () => {
    setRoomId('');
  };

  const copyRoomId = () => {
    if (roomId) {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(roomId);
        alert('Room ID copied: ' + roomId);
      } else {
        alert('Room ID: ' + roomId + '\n\nCopy this manually');
      }
    }
  };

  return (
    <div className="join-room-container">
      <div className="join-room-card">
        <h1>📹 Video Chat</h1>
        
        {/* Browser Support Status */}
        <div className="support-status">
          <div className="support-item">
            <span className={browserSupport.getUserMedia ? 'support-yes' : 'support-no'}>
              📷 Camera: {browserSupport.getUserMedia ? '✅ Supported' : '❌ Not Supported'}
            </span>
          </div>
          <div className="support-item">
            <span className={browserSupport.webRTC ? 'support-yes' : 'support-no'}>
              📞 Video Call: {browserSupport.webRTC ? '✅ Supported' : '❌ Not Supported'}
            </span>
          </div>
          <div className="support-item">
            <span>🌐 Browser: {browserSupport.browser}</span>
          </div>
          <div className="support-item">
            <span>🏠 Location: localhost (Perfect for camera access!)</span>
          </div>
        </div>

        {/* Camera Test */}
        {browserSupport.getUserMedia && (
          <button 
            onClick={testCamera} 
            disabled={testing}
            className="test-btn"
          >
            {testing ? '🔄 Testing...' : '📷 Test Camera & Microphone'}
          </button>
        )}
        
        {/* Main Form */}
        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="userName">👤 Your Name:</label>
            <input
              type="text"
              id="userName"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Enter your name"
              required
              autoComplete="name"
            />
          </div>
          
          <div className="input-group">
            <label htmlFor="roomId">🏠 Room ID:</label>
            <div className="room-input">
              <input
                type="text"
                id="roomId"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                placeholder="Enter or generate room ID"
                required
                autoComplete="off"
              />
              <button type="button" onClick={generateRoomId} className="generate-btn">
                🎲 Generate
              </button>
              {roomId && (
                <>
                  <button type="button" onClick={copyRoomId} className="copy-btn">
                    📋 Copy
                  </button>
                  <button type="button" onClick={clearRoomId} className="clear-btn">
                    ❌ Clear
                  </button>
                </>
              )}
            </div>
            {roomId && (
              <div className="room-id-display">
                Room ID: <strong>{roomId}</strong>
              </div>
            )}
          </div>
          
          <button type="submit" className="join-btn">
            🚀 Join Room
          </button>
        </form>
        
        {/* Instructions */}
        <div className="instructions">
          <h3>📋 How to use:</h3>
          <ol>
            <li>Test your camera first</li>
            <li>Enter your name</li>
            <li>Enter a room ID or generate one</li>
            <li>Share the room ID with others</li>
            <li>Click "Join Room"</li>
            <li>Allow camera access when prompted</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default JoinRoom;