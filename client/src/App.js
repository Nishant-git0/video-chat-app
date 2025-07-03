import React, { useState } from 'react';
import JoinRoom from './components/JoinRoom';
import VideoCall from './components/VideoCall';
import './App.css';

function App() {
  const [currentRoom, setCurrentRoom] = useState(null);
  const [userName, setUserName] = useState('');

  const handleJoinRoom = (roomId, name) => {
    setCurrentRoom(roomId);
    setUserName(name);
  };

  const handleLeaveRoom = () => {
    setCurrentRoom(null);
    setUserName('');
  };

  return (
    <div className="App">
      {!currentRoom ? (
        <JoinRoom onJoinRoom={handleJoinRoom} />
      ) : (
        <VideoCall 
          roomId={currentRoom} 
          userName={userName}
          onLeaveRoom={handleLeaveRoom}
        />
      )}
    </div>
  );
}

export default App;